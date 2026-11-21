// 수업 화면(/<id>/slides/)을 빌드해 Chromium 으로 열어 본다.
//  - 명세의 장 하나가 화면 한 장이고, 모든 장이 1920 × 1080, 1280 × 720, 1024 × 768 에서 넘치거나 겹치지 않는다
//  - 형식이 허락하는 가장 긴 글로 채운 장(stress.ts)도 넘치지 않는다
//  - 글 곁에 그림 하나를 둔 장은 두 칸 짜임(R12)을 지킨다: 그림 칸 42% 이상, 그림을 크게, 세로 가운데(긴 글은 위 끝), 빈 자리 3분의 1 남짓
//  - 그림 넷의 단계 장은 2 × 2 로 제목 아래를 다 쓰고, 칸마다 머리 한 줄 아래에 칸 폭 전체의 그림 상자를 둔다 (R22)
//  - 견주기 장: 함께 보는 그림 하나는 두 칸 짜임, 쪽마다 그림이면 출처 표시와 첫 항목이 같은 높이 (R23)
//  - 교사 메모 창은 장을 가리지 않는다 (R24). QR 창 (R25). 정답 표와 머리표 (R27)
//  - ○× 표시와 읽는 말은 lib 의 MARK·MARK_LABEL (R17), 닫는 따옴표와 조사는 한 줄에 (R18)
//  - 장의 둘레 (R55): 모든 장의 바닥글 줄(stageFooter), 표지가 아닌 장의 두 자리 장 번호, 제 머리말이 없는 장의 단계 머리말
//  - 조작: 글쇠·클릭·터치·주소의 #번호·퀴즈 정답 드러내기·교사 메모·화면 가리기·차시 안내로 돌아가기
//  - 조작 단추는 가만히 있으면 숨는다 (열자마자, 단추를 마우스로 누른 뒤에도)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Browser, Page } from 'playwright';
import { ROOT, answerText, loadLesson, slideNotes, stageFooter, visibleLessons } from '#lib/content.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';
import { MARK, MARK_LABEL } from '#lib/site.ts';
import { copyMedia, serve, sideProblems, slideProblems } from './helpers.ts';
import { DOLMEN_STEPS, QUOTED_QUESTION, SMALL_LABEL, STRESS_ID, makeStress } from './stress.ts';
import { QR_COPY, SLIDE_COPY, STAGE_COPY } from '#src/components/slides/copy.ts';
import { studentPages } from '#src/components/slides/qr.ts';
import QRCode from 'qrcode';
import { PHASE_LAYOUTS, slideCounter, slideFrame } from '#src/components/slides/counter.ts';
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
      // R22: 그림 넷이고 글이 짧은 단계 장은 2 × 2 로 놓이고, 그림 상자는 칸 폭 전체(1920 무대에서 500px 넘게)이며 그림은 그 안에 contain 으로 가장 크게
      const four = lesson.slides.findIndex((x) => x.layout === 'steps' && x.steps.length === 4 && x.steps.every((st) => st.media === 'labelled')) + 1;
      await open(page, `${s.url}/${STRESS_ID}/slides/#${four}`);
      assert.equal(await page.locator(`#s${four} [data-arrange]`).getAttribute('data-arrange'), 'grid');
      for (const f of await page.locator(`#s${four} .sl-step > .media`).evaluateAll((els) => els.map((e) => {
        const step = e.parentElement!.getBoundingClientRect(); const r = e.getBoundingClientRect(); const im = e.querySelector('img')!; const ir = im.getBoundingClientRect();
        const k = Math.min(ir.width / im.naturalWidth, ir.height / im.naturalHeight);
        return { box: r.width, cell: step.width, drawnW: im.naturalWidth * k, drawnH: im.naturalHeight * k, w: ir.width, h: ir.height };
      }))) {
        assert.ok(Math.abs(f.box - f.cell) < 1, `그림 상자 폭 ${f.box} / 칸 폭 ${f.cell}`);
        assert.ok(f.box >= 500, `그림 상자 폭 ${f.box.toFixed(0)}px`);
        assert.ok(Math.abs(f.drawnW - f.w) < 1 || Math.abs(f.drawnH - f.h) < 1, '그림이 상자에 맞게 가장 크게 그려지지 않았습니다');
      }
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

/** 가장 긴 글 묶음을 빌드해 내준다 (R22·R23 를 재는 시험이 같이 쓴다) */
async function stressSite(name: string) {
  const content = path.join(OUT, `${name}-content`);
  fs.cpSync(FIXTURES, content, { recursive: true });
  const file = path.join(content, ...STRESS_ID.split('/'), 'lesson.yaml');
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  makeStress(content, raw);
  fs.writeFileSync(file, YAML.stringify(raw));
  return site(name, content);
}

test('단계 장 2 × 2 (R22): 실제 차시의 단계 글 넷이 머리 한 줄에 40px 이상, 그림 상자는 칸 폭 전체, 제목 아래를 다 쓴다', { skip }, async () => {
  const s = await stressSite('steps');
  const lesson = loadLesson(STRESS_ID);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    const at = lesson.slides.findIndex((x) => x.layout === 'steps' && x.steps.map((st) => st.text).join() === DOLMEN_STEPS.join() && x.steps.every((st) => st.media?.startsWith('step'))) + 1;
    assert.ok(at > 0);
    await open(page, `${s.url}/${STRESS_ID}/slides/#${at}`);
    assert.equal(await page.locator(`#s${at} [data-arrange]`).getAttribute('data-arrange'), 'grid');
    const m = await page.evaluate((no) => {
      const sl = document.querySelector<HTMLElement>(`#s${no}`)!;
      const u = sl.getBoundingClientRect().width / 1920;
      const inner = sl.querySelector<HTMLElement>('.slide-in')!;
      const pad = Number.parseFloat(getComputedStyle(inner).paddingBottom);
      const bodyBottom = inner.getBoundingClientRect().bottom - pad;
      const title = sl.querySelector<HTMLElement>('.sl-title')!;
      const list = sl.querySelector<HTMLElement>('.sl-steps-list')!;
      const credit = sl.querySelector<HTMLElement>('.sl-shared-credit');
      const steps = [...sl.querySelectorAll<HTMLElement>('.sl-step')].map((st) => {
        const text = st.querySelector<HTMLElement>('.sl-step-text')!;
        const chip = st.querySelector<HTMLElement>('.sl-chip')!;
        const range = document.createRange(); range.selectNodeContents(text);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top)));
        const fig = st.querySelector<HTMLElement>('.media')!; const fr = fig.getBoundingClientRect();
        const im = fig.querySelector('img')!; const ir = im.getBoundingClientRect();
        const k = Math.min(ir.width / im.naturalWidth, ir.height / im.naturalHeight);
        return {
          lines: tops.size, size: Number.parseFloat(getComputedStyle(text).fontSize) / u, chip: Number.parseFloat(getComputedStyle(chip).fontSize) / u,
          chipRight: chip.getBoundingClientRect().right, textLeft: text.getBoundingClientRect().left, headBottom: Math.max(chip.getBoundingClientRect().bottom, text.getBoundingClientRect().bottom),
          figTop: fr.top, figW: fr.width / u, cellW: st.getBoundingClientRect().width / u, drawnW: (im.naturalWidth * k) / u,
          cx: (ir.left + ir.width / 2 - (fr.left + fr.width / 2)) / u,
        };
      });
      return {
        steps,
        titleGap: (list.getBoundingClientRect().top - (title.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(title).marginBottom))) / u,
        bottomGap: (bodyBottom - (credit ?? list).getBoundingClientRect().bottom) / u,
      };
    }, at);
    for (const [i, st] of m.steps.entries()) {
      assert.equal(st.lines, 1, `${i + 1}단계 글이 ${st.lines}줄입니다`);
      assert.ok(st.size >= 40 - 0.5, `${i + 1}단계 글 ${st.size.toFixed(1)}px`);
      assert.ok(Math.abs(st.chip - st.size) < 0.5, '단계 표와 글의 크기가 다릅니다');
      assert.ok(st.textLeft > st.chipRight, '단계 표와 글이 한 줄에 나란하지 않습니다');
      assert.ok(st.figTop >= st.headBottom - 1, '그림 상자가 머리 아래에 있지 않습니다');
      assert.ok(Math.abs(st.figW - st.cellW) < 1 && st.figW >= 500, `그림 상자 폭 ${st.figW.toFixed(0)}px (칸 ${st.cellW.toFixed(0)}px)`);
      assert.ok(st.drawnW >= 500, `${i + 1}단계 그림 폭 ${st.drawnW.toFixed(0)}px`);
      assert.ok(Math.abs(st.cx) < 1, '그림이 상자의 가운데에 있지 않습니다');
    }
    // 제목 아래 자리를 모두 쓴다: 목록은 제목 바로 아래에서 시작하고, 목록(과 출처 표시)이 본문 자리의 아래 끝까지 닿는다
    assert.ok(Math.abs(m.titleGap) < 2, `제목과 목록 사이 ${m.titleGap.toFixed(0)}px`);
    assert.ok(Math.abs(m.bottomGap) < 2, `목록 아래 빈 자리 ${m.bottomGap.toFixed(0)}px`);

    // 꼴이 다른 그림(사진, 정사각형, 넓은 도해, 세로로 긴 도해)도 2 × 2 의 상자 안에 contain 으로 가운데 놓인다
    const mixed = lesson.slides.findIndex((x) => x.layout === 'steps' && x.steps.some((st) => st.media === 'sample')) + 1;
    await open(page, `${s.url}/${STRESS_ID}/slides/#${mixed}`);
    assert.equal(await page.locator(`#s${mixed} [data-arrange]`).getAttribute('data-arrange'), 'grid');
    assert.deepEqual(await page.evaluate(slideProblems), []);
    const offs = await page.locator(`#s${mixed} .sl-step > .media img`).evaluateAll((imgs) => imgs.map((i) => {
      const im = i as HTMLImageElement; const r = im.getBoundingClientRect(); const f = im.closest('.media')!.getBoundingClientRect();
      return { fit: getComputedStyle(im).objectFit, pos: getComputedStyle(im).objectPosition, dx: Math.abs(r.left + r.width / 2 - (f.left + f.width / 2)) };
    }));
    for (const o of offs) { assert.equal(o.fit, 'contain'); assert.equal(o.pos, '50% 50%'); assert.ok(o.dx < 1); }
  } finally { await page.close(); await s.close(); }
});

test('견주기 장 (R23): 쪽마다 그림이면 출처 표시와 첫 항목이 같은 높이, 함께 보는 그림 하나는 두 칸 짜임', { skip }, async () => {
  const s = await stressSite('compare');
  const lesson = loadLesson(STRESS_ID);
  try {
    for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768]] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      // 쪽마다 그림 하나 (꼴과 항목 수가 다른 두 쪽, 실제 차시 17번 장과 같은 꼴)
      const pair = lesson.slides.findIndex((x) => x.layout === 'compare' && x.left.media === 'square' && x.right.media === 'sample') + 1;
      await open(page, `${s.url}/${STRESS_ID}/slides/#${pair}`);
      const m = await page.evaluate((no) => {
        const cards = [...document.querySelectorAll<HTMLElement>(`#s${no} .sl-card`)];
        return cards.map((c) => ({
          fig: c.querySelector('.media')!.getBoundingClientRect().height,
          credit: c.querySelector('.media-credit')!.getBoundingClientRect().top,
          bullet: c.querySelector('.sl-bullets > li')!.getBoundingClientRect().top,
        }));
      }, pair);
      assert.ok(Math.abs(m[0].fig - m[1].fig) < 1, `${w}×${h}: 그림 상자 높이 ${m[0].fig} / ${m[1].fig}`);
      assert.ok(Math.abs(m[0].credit - m[1].credit) < 1, `${w}×${h}: 출처 표시 높이 ${m[0].credit} / ${m[1].credit}`);
      assert.ok(Math.abs(m[0].bullet - m[1].bullet) < 1, `${w}×${h}: 첫 항목 높이 ${m[0].bullet} / ${m[1].bullet}`);
      assert.deepEqual(await page.evaluate(slideProblems), []);
      // 함께 보는 그림 하나 (R23a): 왼쪽에 상자 둘을 위아래로, 오른쪽에 그림. R12 의 잣대(sideProblems)를 지킨다
      const shared = lesson.slides.findIndex((x) => x.layout === 'compare' && !!x.media) + 1;
      await open(page, `${s.url}/${STRESS_ID}/slides/#${shared}`);
      const k = await page.evaluate((no) => {
        const cards = [...document.querySelectorAll<HTMLElement>(`#s${no} .sl-side .sl-card`)].map((c) => c.getBoundingClientRect());
        const fig = document.querySelector<HTMLElement>(`#s${no} .sl-side > .media`)!.getBoundingClientRect();
        return { n: cards.length, stacked: cards.length === 2 && cards[1].top >= cards[0].bottom, left: cards.every((c) => c.right < fig.left) };
      }, shared);
      assert.deepEqual(k, { n: 2, stacked: true, left: true }, `${w}×${h}`);
      assert.deepEqual(await page.evaluate(sideProblems), [], `${w}×${h}`);
      assert.deepEqual(await page.evaluate(slideProblems), [], `${w}×${h}`);
      await page.close();
    }
  } finally { await s.close(); }
});

test('교사 메모 창은 장을 가리지 않는다 (R24): 장 전체가 메모 창 위에 들어가고, 닫으면 제 크기로 돌아온다', { skip }, async () => {
  const s = await site('notes', FIXTURES);
  try {
    for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768]] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      for (const [id, no] of [['5-2/1/05', 3], ['5-2/1/02-03', 2], ['5-2/1/02-03', 6], ['5-2/1/01', 2]] as const) {
        await open(page, `${s.url}/${id}/slides/#${no}`);
        const rect = () => page.evaluate(() => { const r = document.querySelector<HTMLElement>('.slide:not([hidden])')!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
        const full = await rect();
        await page.keyboard.press('n');
        assert.equal(await page.locator('.notes').isVisible(), true);
        const small = await rect();
        const notesTop = await page.locator('.notes').evaluate((e) => e.getBoundingClientRect().top);
        assert.ok(small.y >= -0.5 && small.y + small.h <= notesTop + 0.5, `${id} ${no}번 장 ${w}×${h}: 장(${small.y}–${small.y + small.h})이 메모 창(${notesTop})과 겹칩니다`);
        assert.ok(small.x >= -0.5 && small.x + small.w <= w + 0.5, `${id} ${no}번 장 ${w}×${h}: 장이 화면 밖으로 나갑니다`);
        assert.ok(Math.abs(small.w / small.h - 16 / 9) < 0.01, '16:9 가 아닙니다');
        assert.ok(Math.abs(small.x + small.w / 2 - w / 2) < 1, '가운데가 아닙니다');
        // 줄여 그린 장도 넘치거나 겹치지 않는다
        assert.deepEqual(await page.evaluate(slideProblems), [], `${id} ${no}번 장 ${w}×${h} (메모 창을 연 채)`);
        // 메모 창을 연 채로 장을 넘겨도 장은 메모 창 위에 있다
        await page.keyboard.press('ArrowRight');
        const next = await rect();
        assert.ok(next.y + next.h <= notesTop + 0.5);
        await page.keyboard.press('ArrowLeft');
        // 화면 가리기는 메모 창까지 모두 가린다
        await page.keyboard.press('b');
        assert.deepEqual(await page.locator('.stage-blank').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.top, r.height, Number(getComputedStyle(e).zIndex) > Number(getComputedStyle(document.querySelector('.notes')!).zIndex)]; }), [0, h, true]);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('n');
        assert.deepEqual(await rect(), full, `${id} ${no}번 장 ${w}×${h}: 메모 창을 닫아도 제 크기로 돌아오지 않았습니다`);
      }
      await page.close();
    }
  } finally { await s.close(); }
});

/** QR 그림(SVG path)을 칸 배열로 되읽는다 (Qr.astro 는 둘레에 네 칸의 여백을 두고 가로로 이은 검은 칸을 그린다) */
function readQr(d: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const [x, y, run] = m.slice(1).map(Number);
    for (let i = 0; i < run; i++) grid[y - 4][x - 4 + i] = true;
  }
  return grid;
}

test('QR 창 (R25): Q 와 단추로 열고, 학생 페이지의 QR 과 주소만 싣고, Esc·Q·바깥 누르기로 닫는다', { skip }, async () => {
  const s = await site('qr', FIXTURES);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    const lesson = loadLesson('5-2/1/02-03');
    const want = studentPages(lesson);
    assert.deepEqual(want.map((p) => p.name), ['확인 퀴즈', '웹 활동']);
    await open(page, `${s.url}/5-2/1/02-03/slides/#2`);
    const layer = page.locator('.qr-layer');
    assert.equal(await layer.isVisible(), false);
    await page.keyboard.press('q');
    assert.equal(await layer.isVisible(), true);
    assert.equal(await page.locator('.qr-heading').textContent(), QR_COPY.heading);
    // 이름, QR, 주소. 주소는 차시 안내 페이지와 같은 absoluteUrl()
    assert.deepEqual(await page.locator('.qr-name').allTextContents(), want.map((p) => p.name));
    assert.deepEqual(await page.locator('.qr-addr').allTextContents(), want.map((p) => p.url));
    const kit = fs.readFileSync(path.join(s.out, '5-2', '1', '02-03', 'index.html'), 'utf8');
    for (const p of want) assert.ok(kit.replace(/<[^>]+>/g, '').includes(p.url), `안내 페이지에 같은 주소가 없습니다: ${p.url}`);
    // 주소는 '/' 뒤에서만 줄이 바뀐다: '/' 사이의 조각마다 줄바꿈 없는 덩이이고, 그 사이에만 <wbr> 이 있다 (C3-10)
    for (const addr of await page.locator('.qr-addr').all()) {
      const parts = await addr.locator('.url-part').allTextContents();
      assert.ok(parts.length > 1 && parts.slice(0, -1).every((t) => t.endsWith('/')), `주소 조각: ${parts.join(' | ')}`);
      assert.equal(await addr.locator('.url-part').first().evaluate((e) => getComputedStyle(e).whiteSpace), 'nowrap');
    }
    // QR 을 칸 배열로 되읽어 그 주소를 담은 QR 과 견준다 (주소를 바꾸면 칸이 달라진다)
    const paths = await page.locator('.qr-layer .qr-ink').evaluateAll((els) => els.map((e) => e.getAttribute('d')!));
    assert.equal(paths.length, want.length);
    want.forEach((p, i) => {
      const { modules } = QRCode.create(p.url, { errorCorrectionLevel: 'M' });
      const expect = Array.from({ length: modules.size }, (_, y) => Array.from({ length: modules.size }, (_, x) => !!modules.get(y, x)));
      assert.deepEqual(readQr(paths[i], modules.size), expect, `${p.name} QR 이 주소와 맞지 않습니다`);
    });
    // 교실 뒤에서도 찍히게 크게: 1920 × 1080 에서 한 변 360px 넘게. 장 위에 뜨고, 바깥 주소를 부르지 않는다
    for (const r of await page.locator('.qr-layer .qr').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))) assert.ok(r >= 360, `QR ${r}px`);
    // 열려 있는 동안 다른 글쇠는 장을 넘기지 않는다
    await page.keyboard.press('ArrowRight');
    assert.equal(new URL(page.url()).hash, '#2');
    await page.keyboard.press('Escape');
    assert.equal(await layer.isVisible(), false);
    assert.equal(new URL(page.url()).pathname, '/5-2/1/02-03/slides/', 'Esc 가 차시 안내로 나갔습니다');
    await page.keyboard.press('q');
    await page.keyboard.press('q');
    assert.equal(await layer.isVisible(), false);
    // 조작 단추로 열고, 창 바깥을 누르면 닫힌다 (장은 넘어가지 않는다)
    await page.mouse.move(900, 500); await page.mouse.move(960, 540, { steps: 4 });
    const btn = page.locator('[data-act="qr"]');
    assert.equal(await btn.locator('span').textContent(), STAGE_COPY.qr);
    await btn.click();
    assert.equal(await layer.isVisible(), true);
    await page.mouse.click(30, 540);
    assert.equal(await layer.isVisible(), false);
    assert.equal(new URL(page.url()).hash, '#2');
    // 닫기 단추
    await page.keyboard.press('q');
    await page.locator('.qr-close').click();
    assert.equal(await layer.isVisible(), false);
    // 준비된 학생 페이지가 없으면 싣지 않는다 (확인 퀴즈는 형식이 모든 차시에 요구하므로 실제로는 늘 하나 이상이다)
    const bare = { ...lesson, quiz: { items: [] }, assets: { ...lesson.assets, web_activity: { state: 'planned' } } } as unknown as typeof lesson;
    assert.deepEqual(studentPages(bare), []);
  } finally { await page.close(); await s.close(); }
});

test('정답 표와 머리표 (R27): 정답은 청록 표와 번호를 그대로, 산호색은 정답에 쓰지 않는다. 항목은 번호, 상자 안은 점, 마무리는 확인 표시', { skip }, async () => {
  const s = await stressSite('marks');
  const lesson = loadLesson(STRESS_ID);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    for (let no = 1; no <= lesson.slides.length; no++) {
      const sl = lesson.slides[no - 1];
      await open(page, `${s.url}/${STRESS_ID}/slides/#${no}`);
      if (sl.layout === 'quiz') await page.keyboard.press('ArrowRight');
      const r = await page.evaluate((n) => {
        const root = document.querySelector<HTMLElement>(`#s${n}`)!;
        const probe = document.createElement('i'); probe.style.color = 'var(--coral)'; document.body.append(probe);
        const coral = getComputedStyle(probe).color; probe.remove();
        const teal = (() => { const p = document.createElement('i'); p.style.color = 'var(--teal)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })();
        const coralIn = (el: Element) => { const cs = getComputedStyle(el); return [cs.color, cs.backgroundColor, cs.borderTopColor].includes(coral); };
        const answer = root.querySelector('[data-answer]');
        const tag = answer?.querySelector<HTMLElement>('.sl-correct');
        const num = answer?.querySelector<HTMLElement>('.sl-num');
        return {
          coralOnAnswer: answer ? [answer, ...answer.querySelectorAll('*')].some((e) => coralIn(e)) : false,
          tag: tag ? { shown: tag.getClientRects().length > 0, color: getComputedStyle(tag).color, border: getComputedStyle(tag).borderTopColor, bg: getComputedStyle(tag).backgroundColor } : null,
          num: num ? { shown: num.getClientRects().length > 0, bg: getComputedStyle(num).backgroundColor, rowBg: getComputedStyle(answer!).backgroundColor } : null,
          teal,
          points: [...root.querySelectorAll('.sl-points .sl-list > li')].map((li) => !!li.querySelector(':scope > .sl-num')),
          dots: [...root.querySelectorAll('.sl-bullets > li, .sl-materials > li')].map((li) => getComputedStyle(li, '::before').backgroundColor === teal && getComputedStyle(li, '::before').borderRadius === '50%'),
          checks: [...root.querySelectorAll('.sl-checks > li')].map((li) => getComputedStyle(li, '::before').borderRightColor === teal && getComputedStyle(li, '::before').transform !== 'none'),
        };
      }, no);
      assert.equal(r.coralOnAnswer, false, `${no}번 장: 정답에 산호색이 있습니다`);
      if (r.tag) {
        assert.ok(r.tag.shown, `${no}번 장: 정답 표가 보이지 않습니다`);
        assert.equal(r.tag.color, r.teal); assert.equal(r.tag.border, r.teal);
      }
      if (r.num) {
        assert.ok(r.num.shown, `${no}번 장: 정답 칸의 번호가 없습니다`);
        assert.notEqual(r.num.bg, r.num.rowBg, `${no}번 장: 정답 칸의 번호 동그라미가 바탕에 묻힙니다`);
      }
      if (sl.layout === 'points') assert.deepEqual(r.points, sl.points.map(() => true), `${no}번 장: 항목에 번호가 없습니다`);
      assert.ok(r.dots.every(Boolean), `${no}번 장: 상자 안 목록의 머리표가 점이 아닙니다`);
      if (sl.layout === 'compare') assert.equal(r.dots.length, sl.left.points.length + sl.right.points.length);
      if (sl.layout === 'activity') assert.equal(r.dots.length, sl.materials.length);
      if (sl.layout === 'closing') { assert.equal(r.checks.length, sl.points.length); assert.ok(r.checks.every(Boolean)); }
    }
  } finally { await page.close(); await s.close(); }
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
    // 표지에도 바닥글 줄(stageFooter: AI 사용 표시나 초안 표시가 든다)이 있고, 장 번호는 없다 (R55)
    assert.equal(await page.locator('#s1 .sl-foot').textContent(), stageFooter(one));
    assert.equal(await page.locator('#s1 .sl-counter').count(), 0);
    // 장마다 교사 메모가 slideNotes 와 같다
    for (let i = 1; i <= one.slides.length; i++) {
      assert.deepEqual(await page.locator(`#s${i} .slide-notes li`).allTextContents(), slideNotes(one, i), `${i}번 장 메모`);
    }
    // 장 번호: 한 차시 묶음은 두 자리로 "02 / 05"
    assert.equal(await page.locator('#s2 .sl-counter').textContent(), `02 / ${String(one.slides.length).padStart(2, '0')}`);
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
    assert.equal(await page.locator('#s5 .sl-cover-meta').count(), 0, '둘째 표지에는 차시표 값을 다시 찍지 않는다');
    // 두 차시 묶음의 장 번호는 차시마다 따로 센다. 둘째 표지에도 장 번호가 없고, 조작 단추의 번호는 있다. Home 은 지금 차시의 첫 장으로 간다.
    const two = loadLesson('5-2/1/02-03');
    assert.equal(slideCounter(two, 5).text, '3차시 01 / 04');
    assert.equal(await page.locator('#s5 .sl-counter').count(), 0);
    assert.equal(await page.locator('.hud-count').textContent(), '3차시 01 / 04');
    assert.equal(await page.locator('#s6 .sl-counter').textContent(), '3차시 02 / 04');
    assert.equal(await page.locator('#s2 .sl-counter').textContent(), '2차시 02 / 04');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.equal(await cur(), 7);
    await page.keyboard.press('Home'); assert.equal(await cur(), 5);
    // 모든 장(표지 포함)의 왼쪽 아래에 바닥글 줄. 초안은 그 끝에 초안 표시가 든다 (R55)
    for (let i = 1; i <= two.slides.length; i++) assert.equal(await page.locator(`#s${i} .sl-foot`).textContent(), stageFooter(two));
    // 범위 밖의 번호는 끝 장으로
    await open(page, `${s.url}/5-2/1/02-03/slides/#99`);
    assert.equal(await cur(), 8);
    // 재는 함수가 넘친 장을 실제로 잡는지 (제목을 일부러 길게 늘인다)
    assert.deepEqual(await page.evaluate(slideProblems), []);
    await page.evaluate(() => { document.querySelector('#s8 h2')!.textContent = '아주 긴 제목을 '.repeat(40); });
    assert.ok((await page.evaluate(slideProblems)).some((p) => p.startsWith('장 밖으로 나감')));
  } finally { await page.close(); await s.close(); }
});

test('장의 둘레 (R55): 바닥글 줄, 두 자리 장 번호, 단계 머리말', { skip }, async () => {
  const s = await site('frame', FIXTURES);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    let phased = 0;
    for (const lesson of visibleLessons()) {
      for (let no = 1; no <= lesson.slides.length; no++) {
        const slide = lesson.slides[no - 1];
        const want = slideFrame(lesson, no);
        await open(page, `${s.url}/${lesson.id}/slides/#${no}`);
        const at = `${lesson.id} ${no}번 장(${slide.layout})`;
        const m = await page.evaluate((n) => {
          const sl = document.querySelector<HTMLElement>(`#s${n}`)!;
          const u = sl.getBoundingClientRect().width / 1920;
          const top = sl.getBoundingClientRect().top;
          const box = (sel: string) => { const e = sl.querySelector<HTMLElement>(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { text: e.textContent, top: (r.top - top) / u, bottom: (r.bottom - top) / u, left: r.left / u, right: r.right / u, size: Number.parseFloat(cs.fontSize) / u, weight: cs.fontWeight, color: cs.color }; };
          const probe = document.createElement('i'); probe.style.color = 'var(--teal)'; document.body.append(probe);
          const teal = getComputedStyle(probe).color; probe.remove();
          return { foot: box('.sl-foot'), counter: box('.sl-counter'), phase: box('.sl-phase'), title: box('.sl-title'), teal };
        }, no);
        // 바닥글 줄: 모든 장, 장 번호와 같은 크기
        assert.equal(m.foot?.text, want.footer, `${at}: 바닥글 줄`);
        assert.ok(Math.abs(m.foot!.size - 24) < 0.5, `${at}: 바닥글 줄 ${m.foot!.size}px`);
        // 장 번호: 표지에는 없고, 그 밖에는 두 자리 ("05 / 22", "3차시 01 / 04"), 바닥글 줄과 같은 줄에 겹치지 않게
        if (slide.layout === 'title') assert.equal(m.counter, null, `${at}: 표지에 장 번호가 있습니다`);
        else {
          assert.equal(m.counter?.text, slideCounter(lesson, no).text);
          assert.match(m.counter!.text!, /^(\d+차시 )?\d{2} \/ \d{2}$/);
          assert.equal(m.counter!.weight, '500', `${at}: 장 번호는 Pretendard Medium(500)`);
          assert.ok(Math.abs(m.counter!.bottom - m.foot!.bottom) < 0.5, `${at}: 장 번호와 바닥글 줄의 아래 끝이 다릅니다`);
          assert.ok(m.foot!.right < m.counter!.left - 24, `${at}: 바닥글 줄이 장 번호에 닿습니다`);
        }
        // 단계 머리말: 제 머리말이 없는 장만, 청록 굵게 28px 이상, 제목 위에서 제목과 겹치지 않는다. 제목은 머리말이 없는 장과 같은 높이(80)
        assert.equal(m.phase?.text ?? undefined, want.phase, `${at}: 단계 머리말`);
        if (!PHASE_LAYOUTS.includes(slide.layout)) assert.equal(m.phase, null, `${at}: 제 머리말이 있는 장에 단계 머리말이 있습니다`);
        if (m.phase) {
          phased++;
          assert.ok(m.phase.size >= 28, `${at}: 단계 머리말 ${m.phase.size}px`);
          assert.equal(m.phase.color, m.teal);
          assert.ok(Number(m.phase.weight) >= 700);
          assert.ok(m.phase.bottom <= m.title!.top + 0.5, `${at}: 단계 머리말이 제목과 겹칩니다`);
        }
        if (m.title) assert.ok(Math.abs(m.title.top - 80) < 0.5, `${at}: 제목이 ${m.title.top.toFixed(1)} 에서 시작합니다`);
      }
    }
    assert.ok(phased >= 6, `단계 머리말이 있는 장 ${phased}`);
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
