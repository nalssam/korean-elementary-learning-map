// 수업 화면(/<id>/slides/)을 빌드해 Chromium 으로 열어 본다.
//  - 명세의 장 하나가 화면 한 장이고, 모든 장이 1920 × 1080, 1280 × 720, 1024 × 768 에서 넘치거나 겹치지 않는다
//  - 형식이 허락하는 가장 긴 글로 채운 장(stress.ts)도 넘치지 않는다
//  - 조작: 글쇠·클릭·주소의 #번호·퀴즈 정답 드러내기·교사 메모·차시 안내로 돌아가기
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Browser, Page } from 'playwright';
import { ROOT, answerText, footerNotice, loadLesson, slideNotes, visibleLessons } from '#lib/content.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';
import { copyMedia, serve, slideProblems } from './helpers.ts';
import { STRESS_ID, makeStress } from './stress.ts';

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
    assert.deepEqual(await sweep(s.url, ids, [[1920, 1080], [1280, 720], [1024, 768]]), []);
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
    assert.deepEqual(await sweep(s.url, [STRESS_ID], [[1920, 1080], [1024, 768]]), []);
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
    assert.equal(await page.locator('#s4 [data-answer] .sl-ox-glyph').textContent(), answerText(one.quiz.items[0]));
    await page.keyboard.press('ArrowRight'); assert.equal(await cur(), 5);
    // 교사 메모 (N): 지금 장의 메모와 퀴즈의 정답·풀이
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
    // 범위 밖의 번호는 끝 장으로
    await open(page, `${s.url}/5-2/1/02-03/slides/#99`);
    assert.equal(await cur(), 8);
    // 재는 함수가 넘친 장을 실제로 잡는지 (제목을 일부러 길게 늘인다)
    assert.deepEqual(await page.evaluate(slideProblems), []);
    await page.evaluate(() => { document.querySelector('#s8 h2')!.textContent = '아주 긴 제목을 '.repeat(40); });
    assert.ok((await page.evaluate(slideProblems)).some((p) => p.startsWith('장 밖으로 나감')));
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
