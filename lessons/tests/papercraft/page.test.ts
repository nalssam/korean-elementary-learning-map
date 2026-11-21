// 페이퍼크래프트 인쇄 페이지를 빌드하고 Chromium 으로 열어, 7절의 넘침 조건과 실제 크기를 잰다.
// 시험용 명세(tests/contract/fixtures/content)의 복사본에서 두 묶음의 페이퍼크래프트를 ready 로 바꾼다:
//   5-2/1/01    — 검수 담당이 정한 R21 의 글 (만드는 순서 5, 차례 카드 4, 해 보기 4, 생각해 보기 1)
//   5-2/1/02-03 — 형식이 받는 끝까지 긴 것 (만드는 순서 8개 모두 두 줄, 차례 카드 8, 해 보기 4, 생각해 보기 2)
// 만든 것은 .cache/tests/papercraft-<pid>/ 아래에 두고 끝나면 지운다. Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';
import { type3Fonts } from '../print/fonts.ts';
import { cardProblems, serve, sheetProblems } from './helpers.ts';

const skip = await noChromium();
const OUT = path.join(c.ROOT, '.cache', 'tests', `papercraft-${process.pid}`);
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

const SHORT = {
  state: 'ready', title: '종이 고인돌 세우기', module: 'dolmen-table', pages: 3,
  print: { per: 'group', paper: 'A4 180g 이상 두꺼운 종이 (1·2쪽)', materials: ['가위', '풀', '자', '볼펜'], note: '실제 크기(100%)로 인쇄합니다.' },
  steps: [
    '자르는 선을 따라 조각과 차례 카드를 오립니다.',
    '자를 대고 볼펜으로 접는 선을 꾹 눌러 금을 긋습니다.',
    '그림이 찍힌 쪽이 바깥으로 오게 접는 선을 접습니다.',
    '빗금 친 풀칠 칸에 풀을 바릅니다. 풀칠 칸을 안으로 접어 넣고, 같은 글자가 찍힌 면의 뒤쪽에 붙입니다.',
    '조각은 바닥판에 붙이지 않습니다. 수업 때 바닥판에 찍힌 자리에 올려놓습니다.',
  ],
  texts: ['받침돌을 세웁니다.', '흙을 쌓아 비탈을 만듭니다.', '덮개돌을 비탈 위로 끌어 올립니다.', '흙을 걷어 냅니다.'],
  try_it: [
    '바닥판의 받침돌 자리에 받침돌 두 개를 세우고 덮개돌을 얹어 봅시다.',
    '차례 카드 네 장을 섞은 뒤 모둠이 생각한 차례로 놓아 봅시다.',
    '카드를 놓은 차례대로 조각을 움직여 봅시다. 받침돌이 쓰러지지 않게 한 사람이 잡아 줍시다.',
    '그 차례로 놓은 까닭을 한 문장으로 말해 봅시다.',
  ],
  reflect: ['고인돌을 세우는 모습을 지켜본 사람이 지금 있을까요? 없다면 우리는 무엇을 보고 짐작했나요?'],
};
const LONG = {
  ...SHORT,
  print: { per: 'student', paper: 'A4 180g 이상 두꺼운 종이', materials: ['가위', '풀', '자', '다 쓴 볼펜'] },
  // 만드는 순서는 형식이 받는 끝(8개)까지, 그 가운데 넷은 13pt 로 두 줄이 되는 길이. 이보다 길면 빌드가 줄이라고 알리며 멈춘다.
  steps: [
    '자르는 선을 따라 조각을 모두 오립니다. 탭을 오려 내지 않도록 빗금 둘레를 천천히 따라 오리고, 차례 카드도 오립니다.',
    '자를 대고 다 쓴 볼펜으로 접는 선을 꾹 눌러 금을 긋습니다.',
    '그림이 찍힌 쪽이 바깥으로 오게 접는 선을 모두 접습니다.',
    '받침돌은 네 면을 둘러 판돌을 만들고, 빗금 친 풀칠 칸에 풀을 발라 같은 글자끼리 붙입니다. 두 개를 똑같이 만듭니다.',
    '덮개돌은 네 옆면을 접어 내리고 같은 글자끼리 붙인 뒤, 밑면을 접어 올려 닫는 탭을 밑면 안쪽에 붙입니다.',
    '흙 비탈은 높은 쪽 면 양옆의 탭을 옆면 안쪽에 붙입니다. 바닥판에 세워 보아 흔들리지 않는지 확인합니다.',
    '차례 카드는 네 귀를 둥글게 다듬어 두면 여러 번 섞어도 잘 닳지 않습니다.',
    '조각은 바닥판에 붙이지 않습니다. 수업 때 바닥판에 찍힌 자리에 올려놓습니다.',
  ],
  texts: [...SHORT.texts, '돌을 캐어 다듬습니다.', '여럿이 돌을 끌어 옮깁니다.', '여럿이 줄을 당깁니다.', '마을 사람들이 모입니다.'],
  try_it: [
    ...SHORT.try_it.slice(0, 3),
    '그 차례로 놓은 까닭을 한 문장으로 말해 보고, 다른 모둠의 차례와 견주어 어디가 다른지 찾아 봅시다.',
  ],
  reflect: ['고인돌을 세우는 모습을 지켜본 사람이 지금 있을까요? 없다면 우리는 무엇을 보고 짐작했나요?', '흙은 마지막에 왜 걷어 냈을까요?'],
};

const squash = (s: string) => s.replace(/[\s\u2060]+/g, '');
/** 페이지가 따옴표 뒤 조사를 묶는 데 쓰는 U+2060 을 걷어 낸 글 (R18) */
const plain = (s: string | null) => (s ?? '').replace(/\u2060/g, '');
/** 9pt, 8pt (PDF 단위 pt) */
const PT9 = 9, PT8 = 8;

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
          // 그림 안의 글이 인쇄되는 크기 (pt). 그림은 칸에 맞춰 줄어드므로 화면의 변환 행렬로 잰다.
          figPt: (() => {
            const svg = guide.querySelector('.pc-preview-art svg') as SVGSVGElement | null;
            if (!svg) return [];
            const k = svg.getScreenCTM()!.a;
            return [...svg.querySelectorAll('text')].map((t) => (Number(t.getAttribute('font-size')) * k * 72) / 96);
          })(),
          lines: guide.querySelectorAll('.pc-line').length,
          // 해 보기의 칸: 크기(mm)와, 칸의 세로 가운데가 첫 줄의 가운데에서 벗어난 거리(mm)
          boxes: [...guide.querySelectorAll('.pc-try li')].map((li) => {
            const b = getComputedStyle(li, '::before'), lh = parseFloat(getComputedStyle(li).lineHeight);
            const w = parseFloat(b.width), h = parseFloat(b.height), top = parseFloat(b.top);
            return [mm(w), mm(h), mm(Math.abs(top + h / 2 - lh / 2))];
          }),
          // 덩이(만드는 순서·그림·해 보기·생각해 보기) 사이의 틈 (mm)
          gaps: [...guide.querySelectorAll('.pc-gap')].map((g) => mm(g.getBoundingClientRect().height)),
          lineGap: mm(guide.querySelector('.pc-line')!.getBoundingClientRect().height),
          preview: mm(guide.querySelector('.pc-preview-art svg')?.getBoundingClientRect().height ?? 0),
          heads: [...document.querySelectorAll('.sheet-head')].map((h) => h.textContent ?? ''),
        };
      });
      // 전개도 SVG 는 본문 190 × 249mm 를 1:1 로 채운다
      assert.equal(seen.svgs.length, 2);
      for (const [w, h] of seen.svgs) assert.ok(Math.abs(w - 190) < 0.1 && Math.abs(h - 249) < 0.1, `${id}: 전개도가 ${w} × ${h}mm 입니다`);
      assert.deepEqual(seen.steps.map(plain), spec.steps);
      assert.deepEqual(seen.tries.map(plain), spec.try_it);
      assert.deepEqual(seen.reflects.map(plain), spec.reflect);
      assert.ok(seen.figPt.length >= 10, `${id}: 그림의 이름표가 없습니다`);
      assert.ok(Math.min(...seen.figPt) >= PT9 - 0.01, `${id}: 그림의 글이 ${Math.min(...seen.figPt).toFixed(2)}pt 로 찍힙니다 (9pt 이상)`);
      assert.ok(seen.lines >= spec.reflect.length && Math.abs(seen.lineGap - 10) < 0.1, `${id}: 쓰는 줄은 10mm 간격입니다`);
      assert.ok(seen.preview >= 40, `${id}: 만드는 법의 그림이 ${seen.preview}mm 로 너무 작습니다`);
      for (const [w, h, off] of seen.boxes) {
        assert.ok(w >= 4 - 0.01 && w <= 5 + 0.01 && Math.abs(w - h) < 0.01, `${id}: 해 보기의 칸이 ${w.toFixed(2)} × ${h.toFixed(2)}mm 입니다 (4~5mm 네모)`);
        assert.ok(off < 0.3, `${id}: 해 보기의 칸이 첫 줄 가운데에서 ${off.toFixed(2)}mm 벗어납니다`);
      }
      // 덩이 사이의 틈은 고르다 (가장 넓은 틈과 가장 좁은 틈의 차가 1mm 아래)
      assert.ok(Math.max(...seen.gaps) - Math.min(...seen.gaps) < 1, `${id}: 덩이 사이가 고르지 않습니다 (${seen.gaps.map((g) => g.toFixed(1)).join(', ')}mm)`);
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
        const items = (await p.getTextContent()).items.filter((it) => 'str' in it && it.str.trim());
        all += squash(items.map((it) => ('str' in it ? it.str : '')).join(''));
        // 글자 크기: 전개도(1·2쪽)는 8pt 이상, 만드는 법(3쪽)은 9pt 이상.
        // 머리(위 30mm)와 바닥글(아래 17mm)은 인쇄 틀(인쇄 담당)의 것이라 본문만 잰다.
        const floor = n < doc.numPages ? PT8 : PT9;
        for (const it of items) {
          if (!('str' in it)) continue;
          const fromTop = h - (it.transform[5] / 72) * 25.4;
          if (fromTop < 30 || fromTop > h - 17) continue;
          const pt = Math.hypot(it.transform[2], it.transform[3]);
          assert.ok(pt >= floor - 0.05, `${id} ${n}쪽: "${it.str}" 가 ${pt.toFixed(2)}pt 입니다 (${floor}pt 이상)`);
        }
      }
      // Type 3 글꼴이 없다 (7절 '글꼴', R19). 글자에 테두리(stroke)를 두르면 생긴다.
      const file = path.join(OUT, `${id.replaceAll('/', '-')}.pdf`);
      fs.writeFileSync(file, pdf);
      assert.deepEqual(type3Fonts(file), [], `${id}: papercraft.pdf 에 Type 3 글꼴이 있습니다`);
      for (const s of [...spec.steps, ...spec.try_it, ...spec.reflect, '5cm', '자르는선', '덮개돌']) assert.ok(all.includes(squash(s)), `${id}: PDF 에 "${s}" 가 없습니다`);
      for (const s of spec.texts) for (const word of s.split(' ')) assert.ok(all.includes(squash(word)), `${id}: PDF 에 차례 카드의 "${word}" 가 없습니다`);
      assert.ok(!all.includes('통나무'), `${id}: PDF 에 통나무가 있습니다 (R21)`);
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
