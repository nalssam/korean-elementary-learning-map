// 페이퍼크래프트 인쇄 페이지를 빌드하고 Chromium 으로 열어, 7절의 넘침 조건과 실제 크기를 잰다.
// 시험용 명세(tests/contract/fixtures/content)의 복사본에서 두 묶음의 페이퍼크래프트를 ready 로 바꾼다:
//   5-2/1/01    — 명세 초안과 같은 길이 (만드는 순서 4, 차례 카드 4, 해 보기 1, 생각해 보기 1)
//   5-2/1/02-03 — 형식이 받는 끝까지 긴 것 (만드는 순서 8, 차례 카드 8, 해 보기 2, 생각해 보기 3)
// 만든 것은 .cache/tests/papercraft-<pid>/ 아래에 두고 끝나면 지운다. Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';
import { cardProblems, serve, sheetProblems } from './helpers.ts';

const skip = await noChromium();
const OUT = path.join(c.ROOT, '.cache', 'tests', `papercraft-${process.pid}`);
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

const SHORT = {
  state: 'ready', title: '탁자식 고인돌 만들기', module: 'dolmen-table', pages: 3,
  print: { per: 'group', paper: 'A4 두꺼운 종이', materials: ['가위', '풀'], note: '실제 크기(100%)로 인쇄합니다.' },
  steps: ['실선을 따라 조각을 오립니다.', '점선을 따라 접습니다.', '굄돌 둘과 막음돌을 받침판에 세워 붙입니다.', '덮개돌을 세 돌 위에 올립니다.'],
  texts: ['땅을 파고 굄돌을 세웁니다.', '굄돌이 묻히도록 흙을 쌓아 언덕을 만듭니다.', '통나무를 깔고 덮개돌을 끌어 올립니다.', '흙을 걷어 내면 고인돌이 드러납니다.'],
  try_it: ['차례 카드를 섞은 뒤 알맞은 차례로 놓아 봅시다.'],
  reflect: ['이 돌을 옮기려면 몇 사람이 있어야 했을까요?'],
};
const LONG = {
  ...SHORT,
  print: { per: 'student', paper: 'A4 180g 이상 두꺼운 종이', materials: ['가위', '풀', '자', '다 쓴 볼펜'] },
  steps: [
    '실선을 따라 조각을 모두 오립니다. 탭을 오려 내지 않도록 빗금 둘레를 천천히 오립니다.',
    '자와 다 쓴 볼펜으로 점선을 한 번씩 눌러 둡니다.',
    '점선을 따라 모두 접습니다.',
    '굄돌과 막음돌은 네 면을 둘러 기둥을 만들고 같은 글자끼리 붙입니다.',
    '덮개돌은 네 옆면을 접어 내리고 같은 글자끼리 붙입니다.',
    '받침판의 자리에 굄돌 둘과 막음돌을 세워 붙입니다.',
    '통나무는 둥글게 말아 붙이고, 흙 경사로는 발을 접어 세웁니다.',
    '덮개돌을 세 돌 위에 얹습니다. 붙이지 않고 얹기만 합니다.',
  ],
  texts: [...SHORT.texts, '돌을 캐어 다듬습니다.', '통나무 위로 돌을 굴려 옮깁니다.', '여럿이 줄을 당깁니다.', '마을 사람들이 모입니다.'],
  try_it: ['차례 카드를 섞은 뒤 알맞은 차례로 놓아 봅시다.', '통나무 셋 위에 덮개돌을 얹고 밀어 봅시다.'],
  reflect: ['이 돌을 옮기려면 몇 사람이 있어야 했을까요?', '흙은 마지막에 왜 걷어 냈을까요?', '이렇게 큰 무덤을 만든 까닭은 무엇일까요?'],
};

const squash = (s: string) => s.replace(/\s+/g, '');

test('페이퍼크래프트 인쇄 페이지: 넘침 조건을 채우고, 전개도가 실제 크기로 찍히며, 만드는 법 쪽이 명세의 글로 채워진다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const t = tempContent('papercraft');
  const saved = { ...process.env };
  let stop = () => {};
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    t.edit('5-2/1/01', (l) => { l.assets.papercraft = { ...SHORT, facts: [l.facts[0].id] }; });
    t.edit('5-2/1/02-03', (l) => { l.assets.papercraft = { ...LONG, facts: [l.facts[0].id] }; });
    const env = { CONTENT_DIR: t.dir, SHOW_DRAFTS: '1' };
    const out = buildSite(path.join(OUT, 'site'), env);
    Object.assign(process.env, env);
    const site = await serve(out);
    stop = site.close;

    for (const [id, spec] of [['5-2/1/01', SHORT], ['5-2/1/02-03', LONG]] as const) {
      const lesson = c.loadLesson(id);
      const job = c.printJobs(lesson).find((j) => j.kind === 'papercraft')!;
      assert.equal(job.pages, 3);
      const page = await browser.newPage();
      await page.emulateMedia({ media: 'print' });
      await page.goto(site.origin + job.route, { waitUntil: 'load' });
      assert.deepEqual(await page.evaluate(sheetProblems, job.pages), [], id);
      assert.deepEqual(await page.evaluate(cardProblems), [], id);

      const seen = await page.evaluate(() => {
        const mm = (px: number) => (px * 25.4) / 96;
        const svgs = [...document.querySelectorAll('.sheet-body > svg')].map((s) => s.getBoundingClientRect());
        const guide = document.querySelector('.pc-guide')!;
        return {
          svgs: svgs.map((r) => [mm(r.width), mm(r.height)]),
          steps: [...guide.querySelectorAll('.pc-steps li')].map((li) => li.textContent),
          tries: [...guide.querySelectorAll('.pc-try li')].map((li) => li.textContent),
          reflects: [...guide.querySelectorAll('.pc-reflect li p')].map((p) => p.textContent),
          lines: guide.querySelectorAll('.pc-line').length,
          lineGap: mm(guide.querySelector('.pc-line')!.getBoundingClientRect().height),
          preview: mm(guide.querySelector('.pc-preview-art svg')?.getBoundingClientRect().height ?? 0),
          heads: [...document.querySelectorAll('.sheet-head')].map((h) => h.textContent ?? ''),
        };
      });
      // 전개도 SVG 는 본문 190 × 249mm 를 1:1 로 채운다
      assert.equal(seen.svgs.length, 2);
      for (const [w, h] of seen.svgs) assert.ok(Math.abs(w - 190) < 0.1 && Math.abs(h - 249) < 0.1, `${id}: 전개도가 ${w} × ${h}mm 입니다`);
      assert.deepEqual(seen.steps, spec.steps);
      assert.deepEqual(seen.tries, spec.try_it);
      assert.deepEqual(seen.reflects, spec.reflect);
      assert.ok(seen.lines >= spec.reflect.length && Math.abs(seen.lineGap - 10) < 0.1, `${id}: 쓰는 줄은 10mm 간격입니다`);
      assert.ok(seen.preview >= 25, `${id}: 완성 모습 그림이 ${seen.preview}mm 로 너무 작습니다`);
      assert.ok(seen.heads[2].includes(spec.title) && seen.heads[2].includes('만드는 법'));

      // PDF: 쪽수, A4 세로, 5cm 자의 길이, 명세의 글
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
      const doc = await task.promise;
      assert.equal(doc.numPages, job.pages);
      let all = '';
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n);
        const [, , w, h] = p.view.map((v) => (v / 72) * 25.4);
        assert.ok(Math.abs(w - 210) <= 1 && Math.abs(h - 297) <= 1, `${id} ${n}쪽: A4 세로여야 합니다 (${w} × ${h}mm)`);
        all += squash((await p.getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(''));
      }
      for (const s of [...spec.steps, ...spec.try_it, ...spec.reflect, '5cm', '자르는선', '덮개돌']) assert.ok(all.includes(squash(s)), `${id}: PDF 에 "${s}" 가 없습니다`);
      for (const s of spec.texts) for (const word of s.split(' ')) assert.ok(all.includes(squash(word)), `${id}: PDF 에 차례 카드의 "${word}" 가 없습니다`);
      await task.destroy();
      await page.close();
    }
  } finally {
    await browser.close();
    stop();
    for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    t.cleanup();
  }
});

test('명세의 pages 가 모듈의 쪽수와 다르면 빌드가 고칠 값을 알려 주며 멈춘다', () => {
  const t = tempContent('papercraft-pages');
  try {
    t.edit('5-2/1/01', (l) => { l.assets.papercraft = { ...SHORT, pages: 4, facts: [l.facts[0].id] }; });
    assert.throws(() => buildSite(path.join(OUT, 'pages'), { CONTENT_DIR: t.dir, SHOW_DRAFTS: '1' }), /pages 를 고칩니다 \(맞는 값: 3\)/);
  } finally {
    t.cleanup();
  }
});
