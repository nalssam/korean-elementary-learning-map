// 수업 화면(/<id>/slides/)을 빌드해 Chromium 으로 열어 본다.
//  - 명세의 장 하나가 화면 한 장이고, 모든 장이 1920 × 1080, 1280 × 720, 1024 × 768 에서 넘치거나 겹치지 않는다
//  - 형식이 허락하는 가장 긴 글로 채운 장(stress.ts)도 넘치지 않는다
//  - 글 곁에 그림 하나를 둔 장은 두 칸 짜임(R12)을 지킨다: 그림 칸 42% 이상, 그림을 크게, 세로 가운데(긴 글은 위 끝), 빈 자리 3분의 1 남짓
//  - 그림 넷의 단계 장은 2 × 2 로 제목 아래를 다 쓴다 (R13)
//  - ○× 표시와 읽는 말은 lib 의 MARK·MARK_LABEL (R17), 닫는 따옴표와 조사는 한 줄에 (R18)
//  - 조작: 글쇠·클릭·터치·주소의 #번호·퀴즈 정답 드러내기·교사 메모·화면 가리기·차시 안내로 돌아가기
//  - 조작 단추는 가만히 있으면 숨는다 (열자마자, 단추를 마우스로 누른 뒤에도)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Browser, Page } from 'playwright';
import { ROOT, answerText, footerNotice, loadLesson, slideNotes, visibleLessons } from '#lib/content.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';
import { MARK, MARK_LABEL } from '#lib/site.ts';
import { copyMedia, serve, sideProblems, slideProblems } from './helpers.ts';
import { QUOTED_QUESTION, SMALL_LABEL, STRESS_ID, makeStress } from './stress.ts';
import { SLIDE_COPY } from '#src/components/slides/copy.ts';
import { slideCounter } from '#src/components/slides/counter.ts';
import { NOTE_COPY } from '#src/components/slides/copy.ts';

const OUT = path.join(ROOT, '.cache', 'tests', `slides-stage-${process.pid}`);
const skip = await noChromium();
let browser: Browser;
before(async () => { if (!skip) browser = await (await import('playwright')).chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); });
after(async () => { await browser?.close(); fs.rmSync(OUT, { recursive: true, force: true }); });

/** 명세 폴더(content)로 사이트를 빌드하고 그림을 놓은 뒤 내준다 */
async function site(name: string, content: string) {
  const out = buildSite(path.join(OUT, name), { CONTENT_DIR: content, SHOW_DRAFTS: '1' });
  process.env.CONTENT_DIR = content;
  process.env.SHOW_DRAFTS = '1';
  copyMedia(out);
  return { out, ...(await serve(out)) };
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

/** 모든 묶음의 모든 장을 여러 화면 크기로 열어 어긋난 곳을 모은다 */
async function sweep(url: string, ids: string[], sizes: [number, number][]) {
  const bad: string[] = [];
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    for (const id of ids) {
      const n = loadLesson(id).slides.length;
      for (let i = 1; i <= n; i++) {
        await open(page, `${url}/${id}/slides/#${i}`);
        for (const p of await page.evaluate(slideProblems)) bad.push(`${id} ${i}번 장 ${w}×${h}: ${p}`);
        for (const p of await page.evaluate(sideProblems)) bad.push(`${id} ${i}번 장 ${w}×${h}: ${p}`);
        if (await page.evaluate(() => !!document.querySelector('.slide:not([hidden])[data-quiz]'))) {
          await page.keyboard.press('ArrowRight');
          for (const p of await page.evaluate(slideProblems)) bad.push(`${id} ${i}번 장(정답) ${w}×${h}: ${p}`);
        }
      }
    }
    await page.close();
  }
  return bad;
}

test('시험용 명세 넷: 모든 장이 화면 크기마다 넘치지 않는다', { skip }, async () => {
  const s = await site('fixtures', FIXTURES);
  try {
    const ids = visibleLessons().map((l) => l.id);
    assert.equal(ids.length, 4);
    assert.deepEqual(await sweep(s.url, ids, [[1920, 1080], [1366, 768], [1280, 720], [1024, 768]]), []);
  } finally { await s.close(); }
});

test('가장 긴 글로 채운 장도 넘치지 않는다 (모든 layout, 그림 있음·없음)', { skip }, async () => {
  const content = path.join(OUT, 'stress-content');
  fs.cpSync(FIXTURES, content, { recursive: true });
  const file = path.join(content, ...STRESS_ID.split('/'), 'lesson.yaml');
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  makeStress(content, raw);
  fs.writeFileSync(file, YAML.stringify(raw));
  const s = await site('stress', content);
  try {
    const layouts = new Set(loadLesson(STRESS_ID).slides.map((x) => x.layout));
    assert.equal(layouts.size, 11, '모든 layout 이 들어 있어야 합니다');
    const bad = await sweep(s.url, [STRESS_ID], [[1920, 1080], [1024, 768]]);
    // 그림 안의 글이 22 단위인 도해는 일부러 넣은 것이다. 재는 함수가 그것을 잡아야 하고, 그 밖에는 어긋난 곳이 없어야 한다.
    const known = bad.filter((b) => b.includes('그림 안의 글자가 작음') && b.includes(`"${SMALL_LABEL.text}"`) && b.includes(`${SMALL_LABEL.media}.svg`));
    assert.equal(known.length, 2, `22 단위 글을 화면 크기마다 한 번씩 잡아야 합니다:\n${bad.join('\n')}`);
    assert.deepEqual(bad.filter((b) => !known.includes(b)), []);

    const lesson = loadLesson(STRESS_ID);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      // R12: 글 곁에 그림 하나를 둔 장은 모두 두 칸 짜임이다 (sideProblems 가 위의 sweep 에서 재었다)
      const sided = lesson.slides.flatMap((x, i) => ((x.layout === 'points' || x.layout === 'question') && x.media ? [i + 1] : []));
      assert.ok(sided.length >= 6);
      for (const at of sided) {
        await open(page, `${s.url}/${STRESS_ID}/slides/#${at}`);
        assert.equal(await page.locator(`#s${at} .sl-side`).count(), 1, `${at}번 장이 두 칸 짜임이 아닙니다`);
      }
      // R13: 그림 넷이고 글이 짧은 단계 장은 2 × 2 로 놓이고, 그림 하나가 1920 무대에서 폭 500px 이상이다
      const four = lesson.slides.findIndex((x) => x.layout === 'steps' && x.steps.length === 4 && x.steps.every((st) => st.media === 'labelled')) + 1;
      await open(page, `${s.url}/${STRESS_ID}/slides/#${four}`);
      assert.equal(await page.locator(`#s${four} [data-arrange]`).getAttribute('data-arrange'), 'grid');
      const widths = await page.locator(`#s${four} .media img`).evaluateAll((imgs) => imgs.map((i) => {
        const im = i as HTMLImageElement; const r = im.getBoundingClientRect();
        return im.naturalWidth * Math.min(r.width / im.naturalWidth, r.height / im.naturalHeight);
      }));
      for (const w of widths) assert.ok(w >= 500, `2 × 2 의 그림 폭 ${w.toFixed(0)}px`);
      // R18: 닫는 따옴표와 조사 사이에 WORD JOINER 를 넣어, 문제 글이 어디에서 줄을 바꾸든 ’ 와 은 이 한 줄에 있다
      const q = lesson.quiz.items.findIndex((it) => it.q === QUOTED_QUESTION) + 1;
      const at = lesson.slides.findIndex((x) => x.layout === 'quiz' && x.item === q) + 1;
      assert.ok(at > 0);
      const html = fs.readFileSync(path.join(s.out, ...STRESS_ID.split('/'), 'slides', 'index.html'), 'utf8');
      assert.ok(html.includes('’\u2060은'), '수업 화면의 글이 keepParticle() 을 거치지 않았습니다');
      await page.setViewportSize({ width: 1024, height: 768 });
      await open(page, `${s.url}/${STRESS_ID}/slides/#${at}`);
      const split = await page.evaluate((no) => {
        const h = document.querySelector<HTMLElement>(`#s${no} .sl-quiz-q`)!;
        const text = h.textContent!;
        const out: number[] = [];
        // 앞에 낱말을 하나씩 더 붙여 줄이 바뀌는 자리를 옮겨 가며 본다
        for (let k = 0; k <= 24; k++) {
          h.textContent = `${'가나 '.repeat(k)}${text}`;
          const node = h.firstChild!;
          const i = node.textContent!.indexOf('’');
          const r = document.createRange();
          r.setStart(node, i); r.setEnd(node, i + 1);
          const a = r.getBoundingClientRect();
          r.setStart(node, node.textContent!.indexOf('은', i)); r.setEnd(node, node.textContent!.indexOf('은', i) + 1);
          const b = r.getBoundingClientRect();
          if (Math.abs(a.top - b.top) > 2) out.push(k);
        }
        h.textContent = text;
        return out;
      }, at);
      assert.deepEqual(split, [], `’ 와 은 이 다른 줄로 갈렸습니다 (앞에 붙인 낱말 수: ${split})`);
    } finally { await page.close(); }
  } finally { await s.close(); }
});

test('장 수·표지·교사 메모·조작', { skip }, async () => {
  const s = await site('controls', FIXTURES);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const cur = () => page.evaluate(() => Number(document.querySelector<HTMLElement>('.slide:not([hidden])')!.dataset.no));
  try {
    const one = loadLesson('5-2/1/01');
    await open(page, `${s.url}/5-2/1/01/slides/`);
    // 명세의 장 하나 = 화면 한 장
    assert.equal(await page.locator('.slide').count(), one.slides.length);
    assert.equal(await cur(), 1);
    // 표지에 footerNotice(lesson)
    assert.equal(await page.locator('#s1 .sl-notice').textContent(), footerNotice(one));
    // 장마다 교사 메모가 slideNotes 와 같다
    for (let i = 1; i <= one.slides.length; i++) {
      assert.deepEqual(await page.locator(`#s${i} .slide-notes li`).allTextContents(), slideNotes(one, i), `${i}번 장 메모`);
    }
    // 장 번호: 한 차시 묶음은 "2 / 20"
    assert.equal(await page.locator('#s2 .sl-counter').textContent(), `2 / ${one.slides.length}`);
    // 다음·이전: → Space PageDown / ← PageUp
    await page.keyboard.press('ArrowRight'); assert.equal(await cur(), 2);
    assert.equal(new URL(page.url()).hash, '#2');
    await page.keyboard.press('Space'); assert.equal(await cur(), 3);
    await page.keyboard.press('PageUp'); assert.equal(await cur(), 2);
    await page.keyboard.press('PageDown'); assert.equal(await cur(), 3);
    await page.keyboard.press('ArrowLeft'); assert.equal(await cur(), 2);
    // 화면 오른쪽·왼쪽 클릭
    await page.mouse.click(1100, 360); assert.equal(await cur(), 3);
    await page.mouse.click(100, 360); assert.equal(await cur(), 2);
    // 퀴즈 장(4번): 다음 글쇠를 처음 누르면 정답이 드러나고, 한 번 더 누르면 넘어간다
    await page.keyboard.press('End'); assert.equal(await cur(), one.slides.length);
    await page.keyboard.press('Home'); assert.equal(await cur(), 1);
    await open(page, `${s.url}/5-2/1/01/slides/#4`);
    assert.equal(await cur(), 4);
    const answer = page.locator('#s4 [data-answer] .sl-correct');
    assert.equal(await answer.isVisible(), false);
    await page.keyboard.press('ArrowRight');
    assert.equal(await cur(), 4);
    assert.equal(await answer.isVisible(), true);
    // ○× 는 lib 의 MARK 와 MARK_LABEL (R17): 드러난 정답의 기호가 교사 메모의 answerText() 와 같다
    assert.deepEqual(SLIDE_COPY.ox, MARK);
    assert.equal(await page.locator('#s4 [data-answer] .sl-ox-glyph').textContent(), answerText(one.quiz.items[0]));
    assert.deepEqual(await page.locator('#s4 .sl-ox-glyph').allTextContents(), [MARK.yes, MARK.no]);
    assert.deepEqual(await page.locator('#s4 .sl-ox-glyph').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), [MARK_LABEL.yes, MARK_LABEL.no]);
    await page.keyboard.press('ArrowRight'); assert.equal(await cur(), 5);
    // 교사 메모 (N): 반 아이들이 보는 화면에 뜨므로 퀴즈의 정답·풀이는 정답이 드러나기 전에 보이지 않는다
    await open(page, `${s.url}/5-2/1/01/slides/#4`);
    await page.keyboard.press('n');
    assert.equal(await page.locator('.notes').isVisible(), true);
    const before = (await page.locator('.notes-body').textContent())!;
    assert.ok(!before.includes(NOTE_COPY.answer) && !before.includes(one.quiz.items[0].explain), before);
    assert.equal(await page.locator('.notes dl').count(), 0);
    assert.equal(await page.locator('.notes-hint').isVisible(), true);
    await page.keyboard.press('ArrowRight');
    assert.ok((await page.locator('.notes-body').textContent())!.includes(one.quiz.items[0].explain));
    assert.equal(await page.locator('.notes-hint').isVisible(), false);
    await page.keyboard.press('n');
    // 지금 장의 메모와 퀴즈의 정답·풀이 (앞 장으로 돌아오면 정답이 드러난 채다)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('n');
    assert.equal(await page.locator('.notes').isVisible(), true);
    const notes = await page.locator('.notes-body').textContent();
    assert.ok(notes!.includes(answerText(one.quiz.items[0])) && notes!.includes(one.quiz.items[0].explain), notes!);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.notes').isVisible(), false);
    // Esc: 차시 안내 페이지로
    await page.keyboard.press('Escape');
    await page.waitForURL(`${s.url}/5-2/1/01/`);
    // 두 차시 묶음: 3차시는 5번 장에서 시작한다 (flowByLesson 의 firstSlide)
    await open(page, `${s.url}/5-2/1/02-03/slides/#5`);
    assert.equal(await cur(), 5);
    assert.equal(await page.locator('#s5 .sl-notice').count(), 0, '둘째 표지에는 초안 표시를 다시 찍지 않는다');
    // 두 차시 묶음의 장 번호는 차시마다 따로 센다. Home 은 지금 차시의 첫 장으로 간다.
    const two = loadLesson('5-2/1/02-03');
    assert.equal(slideCounter(two, 5).text, '3차시 1 / 4');
    assert.equal(await page.locator('#s5 .sl-counter').textContent(), '3차시 1 / 4');
    assert.equal(await page.locator('.hud-count').textContent(), '3차시 1 / 4');
    assert.equal(await page.locator('#s1 .sl-counter').textContent(), '2차시 1 / 4');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.equal(await cur(), 7);
    await page.keyboard.press('Home'); assert.equal(await cur(), 5);
    // 초안은 장마다 왼쪽 아래에 초안 표시를 찍는다 (1번 장은 표지 아래에 있다)
    for (let i = 2; i <= two.slides.length; i++) assert.equal(await page.locator(`#s${i} .sl-draft`).textContent(), footerNotice(two));
    // 범위 밖의 번호는 끝 장으로
    await open(page, `${s.url}/5-2/1/02-03/slides/#99`);
    assert.equal(await cur(), 8);
    // 재는 함수가 넘친 장을 실제로 잡는지 (제목을 일부러 길게 늘인다)
    assert.deepEqual(await page.evaluate(slideProblems), []);
    await page.evaluate(() => { document.querySelector('#s8 h2')!.textContent = '아주 긴 제목을 '.repeat(40); });
    assert.ok((await page.evaluate(slideProblems)).some((p) => p.startsWith('장 밖으로 나감')));
  } finally { await page.close(); await s.close(); }
});

test('조작 단추: 가만히 두면 숨고, 마우스로 누른 뒤에도 숨고, 손가락으로 아래쪽을 누르면 장을 넘기지 않고 보인다', { skip }, async () => {
  const s = await site('hud', FIXTURES);
  const hud = (p: Page) => p.locator('.hud').evaluate((e) => Number(getComputedStyle(e).opacity));
  const no = (p: Page) => p.evaluate(() => Number(document.querySelector<HTMLElement>('.slide:not([hidden])')!.dataset.no));
  try {
    // 열고 3초 동안 아무것도 하지 않으면 숨어 있다 (브라우저가 보내는 가짜 pointermove 로 깨지 않는다)
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.mouse.move(640, 360);
    await open(page, `${s.url}/5-2/1/01/slides/#2`);
    await page.mouse.move(640, 360);
    await page.waitForTimeout(3000);
    assert.equal(await hud(page), 0);
    // 실제로 움직이면 보인다
    await page.mouse.move(700, 400, { steps: 4 });
    await page.waitForTimeout(300);
    assert.equal(await hud(page), 1);
    // 교사 메모 단추를 마우스로 누르고 3.5초 기다리면 다시 숨고, Space 는 다음 장으로 간다
    await page.locator('[data-act="notes"]').click();
    assert.equal(await page.locator('.notes').isVisible(), true);
    await page.waitForTimeout(3500);
    assert.equal(await hud(page), 0);
    await page.keyboard.press('Space');
    assert.equal(await no(page), 3);
    // 그림 출처 링크는 차시 안내 페이지의 접힌 그림 출처로 간다
    assert.equal(await page.locator('[data-act="credits"]').getAttribute('href'), '/5-2/1/01/#credits');
    // 화면 가리기: B 로 가리고, 다음 키를 누르면 장은 그대로 두고 다시 보인다
    await page.keyboard.press('b');
    assert.equal(await page.locator('.stage-blank').isVisible(), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.stage-blank').isVisible(), false);
    assert.equal(await no(page), 3);
    await page.keyboard.press('.');
    assert.equal(await page.locator('.stage-blank').isVisible(), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.stage-blank').isVisible(), false);
    assert.equal(await no(page), 3);
    await page.close();

    // 터치 화면: 3.5초 가만히 둔 뒤 아래 가장자리를 누르면 조작 단추가 보이고 장은 그대로, 가운데를 누르면 다음 장
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    const tp = await ctx.newPage();
    await open(tp, `${s.url}/5-2/1/01/slides/#2`);
    await tp.waitForTimeout(3500);
    assert.equal(await hud(tp), 0);
    await tp.touchscreen.tap(900, 712);
    await tp.waitForTimeout(300);
    assert.equal(await hud(tp), 1);
    assert.equal(new URL(tp.url()).hash, '#2');
    await tp.touchscreen.tap(900, 360);
    assert.equal(await no(tp), 3);
    assert.equal(new URL(tp.url()).hash, '#3');
    await ctx.close();
  } finally { await s.close(); }
});

test('그림 파일을 불러오지 못하면 틀과 짧은 안내를 두고 출처 표시는 남긴다', { skip }, async () => {
  const s = await site('missing', FIXTURES);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    const one = loadLesson('5-2/1/01');
    const at = one.slides.findIndex((x) => x.layout === 'picture') + 1;
    const ref = (one.slides[at - 1] as { media: string }).media;
    const file = one.media.find((m) => m.id === ref)!.file;
    fs.rmSync(path.join(s.out, 'media', '5-2/1/01', path.basename(file)));
    await page.goto(`${s.url}/5-2/1/01/slides/#${at}`);
    const box = page.locator(`#s${at} .sl-missing`);
    await box.waitFor();
    assert.equal(await box.textContent(), '그림을 불러오지 못했습니다');
    assert.equal(await box.evaluate((e) => getComputedStyle(e).fontSize), '30px');
    assert.equal(await page.locator(`#s${at} .media img`).count(), 0);
    assert.ok(await page.locator(`#s${at} .media-credit`).isVisible());
  } finally { await page.close(); await s.close(); }
});

test('스크립트 없이도 모든 장이 위에서 아래로 보이고, 바깥 주소를 부르지 않는다', { skip }, async () => {
  const s = await site('nojs', FIXTURES);
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  try {
    await page.goto(`${s.url}/5-2/1/01/slides/`);
    const visible = await page.locator('.slide').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetHeight > 0).length);
    assert.equal(visible, loadLesson('5-2/1/01').slides.length);
    assert.deepEqual(asked.filter((u) => !u.startsWith(s.url)), []);
    const html = fs.readFileSync(path.join(s.out, '5-2', '1', '01', 'slides', 'index.html'), 'utf8');
    assert.ok(!html.includes('data-pagefind-body'));
    assert.match(html, /<body data-kind="stage" data-draft="true">/);
  } finally { await ctx.close(); await s.close(); }
});
