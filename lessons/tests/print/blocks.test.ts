// 학습지의 보기·그림 줄·○× 표시·조사 붙이기와 카드의 자르는 선을 찍힌 그대로 재어 본다 (docs/CONTRACT.md 7절, R14·R15·R17·R18).
//  - 보기(example)는 번호가 없고, 이름표 말고는 굵은 글이 없고, 칸 네 개에 30자씩 적어도 상자 밖으로 넘치지 않는다.
//    좁은 단에서는 칸이 위아래로 쌓인다.
//  - 그림 줄(단마다 그림 한 장)은 그림 상자의 높이가 같고(자르지 않는다), 설명과 출처 표시가 단마다 같은 줄에 놓인다.
//    출처 표시가 모두 같으면 줄 아래에 한 번만, 다르면 그림마다 찍는다.
//  - 맞고 틀림 문항의 표시는 lib 의 MARK(○ ×)이다.
//  - 닫는 따옴표와 뒤의 조사(’은)는 좁은 단에서도 갈리지 않는다. 같은 폭에서 keepParticle 을 거치지 않은 글은 갈린다.
//    줄 전체의 출처 표시는 줄의 왼쪽 끝에서 시작한다 (가운데 그림 하나의 것으로 읽히지 않게).
//  - 카드 앞면의 자르는 선은 300dpi 로 그려 보아 모두 같은 굵기다 (가운데 선만 두 겹으로 굵어지지 않는다).
//  - 카드는 덱마다 한 높이로 본문을 바닥글 앞의 틈까지 채우고, 그림이 든 줄도 낱말이 한 기준선에 선다. 뒷면은 긴 변으로 뒤집으면 앞면과 겹친다.
// 만든 것은 .cache/tests/print-blocks-<pid>/ 아래에만 둔다. Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { MARK } from '#lib/site.ts';
import { cardHeight, footReserve } from '#src/components/print/layout.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';

const skip = await noChromium();
const ROOT_OUT = path.join(c.ROOT, '.cache', 'tests', `print-blocks-${process.pid}`);
after(() => fs.rmSync(ROOT_OUT, { recursive: true, force: true }));

const LONG = (n: number) => '가나다라마바사아자차카타파하'.repeat(5).slice(0, n);
const QUOTED = '‘눈으로 본 것’은 무엇이고 ‘짐작한 것’은 무엇인가요?';

/** 빌드한 사이트를 127.0.0.1 에서 내준다 */
async function serve(out: string): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(out, url);
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(out) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/** pdftoppm 으로 PDF 한 쪽을 300dpi 회색조(PGM)로 그린다. pdftoppm 이 없으면 undefined */
function rasterize(file: string, pageNo: number, dir: string): { w: number; h: number; at: (x: number, y: number) => number } | undefined {
  const prefix = path.join(dir, `p${pageNo}`);
  const r = spawnSync('pdftoppm', ['-r', '300', '-gray', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', file, prefix], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return undefined;
  const buf = fs.readFileSync(`${prefix}.pgm`);
  // P5 머리: "P5\n<w> <h>\n255\n"
  const head = buf.subarray(0, 64).toString('latin1').split(/\s+/);
  const [w, h] = [Number(head[1]), Number(head[2])];
  const start = buf.length - w * h;
  return { w, h, at: (x, y) => buf[start + y * w + x] };
}

/** 한 줄로 늘어선 화소에서 어두운 토막(값 < 128)의 [시작, 길이] */
function darkRuns(values: number[]): [number, number][] {
  const runs: [number, number][] = [];
  let from = -1;
  values.forEach((v, i) => {
    if (v < 128 && from < 0) from = i;
    if (v >= 128 && from >= 0) { runs.push([from, i - from]); from = -1; }
  });
  if (from >= 0) runs.push([from, values.length - from]);
  return runs;
}

test('학습지 보기·그림 줄·○× 표시·조사 붙이기, 카드의 자르는 선', { skip, timeout: 240_000 }, async () => {
  const { chromium } = await import('playwright');
  const t = tempContent('print-blocks');
  let stop = () => {};
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    t.edit('5-2/1/01', (l) => {
      l.worksheet.pages = [
        { heading: '보기', blocks: [
          { type: 'prompt', text: '본 것과 아는 것을 이어 짐작해 봅시다.' },
          // 가장 긴 보기: 칸 넷에 30자씩
          { type: 'example', parts: Array.from({ length: 4 }, (_, i) => ({ label: `칸 ${i + 1}`, text: LONG(30) })) },
          { type: 'example', text: '덮개돌이 아주 크니까 여러 사람이 함께 옮겼을 것이다.' },
          { type: 'quiz', items: [1] },
          { type: 'columns', columns: [
            [{ type: 'example', parts: [{ label: '본 것', text: '돌이 여러 개 쌓여 있다.' }, { label: '아는 것', text: '돌은 무겁다.' }, { label: '짐작', text: '여럿이 힘을 모아 쌓았을 것이다.' }] }],
            [{ type: 'prompt', text: QUOTED }, { type: 'lines', count: 2 }],
            [{ type: 'lines', count: 3 }],
          ] },
        ] },
      ];
    });
    t.edit('5-2/1/02-03', (l) => {
      l.worksheet.print.orientation = 'portrait';
      l.worksheet.pages = [
        { heading: '그림 줄', blocks: [
          // 출처가 모두 같은 줄: 줄 아래에 한 번
          { type: 'columns', columns: [0, 1, 2].map(() => [{ type: 'figure', media: '01/stone', width: 'full', show_caption: true }]) },
          // 출처가 다른 줄: 그림마다
          { type: 'columns', columns: ['map', 'stone-line', 'sample'].map((m) => [{ type: 'figure', media: m, width: 'full', show_caption: true }]) },
          { type: 'lines', count: 2 },
        ] },
      ];
    });
    const env = { CONTENT_DIR: t.dir, SHOW_DRAFTS: '1' };
    Object.assign(process.env, env);
    const out = buildSite(path.join(ROOT_OUT, 'site'), env);
    for (const l of c.visibleLessons()) for (const m of l.media) {
      const to = path.join(out, c.mediaRoute(l, m.id));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(c.mediaFile(l, m.id), to);
    }
    // render-pdf 의 일곱 조건(넘침 없음 포함)을 채운다
    const r = spawnSync(process.execPath, [path.join(c.ROOT, 'scripts', 'render-pdf.mjs'), '--out', out], { cwd: c.ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    // 눈으로 보려면 KEEP_PRINT_TEST=<폴더> 로 PDF 를 남긴다
    if (process.env.KEEP_PRINT_TEST) fs.cpSync(path.join(out, 'files'), process.env.KEEP_PRINT_TEST, { recursive: true });

    const site = await serve(out);
    stop = site.close;
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });

    // ── 보기, ○×, 조사 ──
    const ws = c.printJobs(c.loadLesson('5-2/1/01')).find((j) => j.kind === 'worksheet')!;
    await page.goto(site.origin + ws.route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate((QUOTED) => {
      const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      const examples = [...document.querySelectorAll('.ws-example')].map((ex) => {
        const box = ex.getBoundingClientRect();
        const heavy: string[] = [];
        const walk = document.createTreeWalker(ex, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const el = walk.currentNode.parentElement!;
          if (!walk.currentNode.textContent?.trim() || el.closest('.ws-example-label')) continue;
          if (Number(getComputedStyle(el).fontWeight) > 500) heavy.push(walk.currentNode.textContent);
        }
        const parts = [...ex.querySelectorAll('.ws-example-part')].map((p) => p.getBoundingClientRect());
        return {
          tag: ex.querySelector('.ws-example-tag')?.textContent,
          numbered: !!ex.querySelector('.ws-no') || !!ex.closest('.ws-prompt'),
          heavy,
          overflow: ex.scrollWidth > ex.clientWidth + 1 || ex.scrollHeight > ex.clientHeight + 1,
          partsInside: parts.every((p) => inside(p, box)),
          stacked: parts.length > 1 && parts.every((p, i) => i === 0 || p.top >= parts[i - 1].bottom - 1),
          oneRow: parts.length > 1 && parts.every((p) => Math.abs(p.top - parts[0].top) < 1),
          arrows: ex.querySelectorAll('.ws-example-arrow').length,
          width: box.width,
        };
      });
      // 좁은 단의 지시문: 따옴표 뒤 조사가 같은 줄에 있는가. 같은 폭의 짝(조사 붙이기를 뺀 글)은 갈리는가.
      const lineOf = (el: Element, at: number) => {
        const node = el.firstChild as Text;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        return Math.round(range.getClientRects()[0].top);
      };
      const prompt = [...document.querySelectorAll('.ws-col .ws-prompt-text')].find((p) => p.textContent?.replace(/⁠/g, '') === QUOTED)! as HTMLElement;
      const text = prompt.textContent!;
      const close = text.indexOf('’');
      // 줄이 꼭 닫는 따옴표 바로 뒤에서 끝나도록 폭을 맞춘다 (‘눈으로 본 것’ 까지)
      const r = document.createRange();
      r.setStart(prompt.firstChild!, 0);
      r.setEnd(prompt.firstChild!, close + 1);
      const fit = r.getBoundingClientRect().width;
      prompt.style.flex = 'none';
      prompt.style.width = `${fit + 0.5}px`;
      const plain = prompt.cloneNode() as HTMLElement;
      plain.textContent = text.replace(/⁠/g, '');
      prompt.after(plain);
      const kept = lineOf(prompt, close) === lineOf(prompt, close + 2);
      const split = lineOf(plain, close) !== lineOf(plain, close + 1);
      const narrowCol = prompt.closest('.ws-col')!.getBoundingClientRect().width * 25.4 / 96;
      plain.remove();
      return {
        examples,
        ox: [...document.querySelectorAll('.ws-ox span')].map((s) => s.textContent),
        nos: [...document.querySelectorAll('.ws-no')].map((n) => n.textContent?.trim()),
        joiner: text.includes('’⁠은'),
        kept, split, narrowCol,
      };
    }, QUOTED);

    assert.equal(m.examples.length, 3);
    for (const ex of m.examples) {
      assert.equal(ex.tag, '예');
      assert.equal(ex.numbered, false, '보기에 번호가 붙었습니다');
      assert.deepEqual(ex.heavy, [], `보기에 굵은 글이 있습니다: ${ex.heavy}`);
      assert.equal(ex.overflow, false, '보기의 글이 상자 밖으로 넘칩니다');
      assert.equal(ex.partsInside, true, '보기의 칸이 상자 밖으로 나갑니다');
    }
    // 넓은 쪽의 칸 넷(30자씩)은 한 줄에 화살표 셋으로 이어지고, 좁은 단의 칸은 위아래로 쌓인다
    assert.equal(m.examples[0].oneRow, true);
    assert.equal(m.examples[0].arrows, 3);
    assert.equal(m.examples[2].stacked, true, `좁은 단(${m.examples[2].width}px)의 보기 칸이 쌓이지 않습니다`);
    // 번호: 지시문 1, 퀴즈 1, 좁은 단의 지시문 1. 보기는 세지 않는다.
    assert.deepEqual(m.nos, ['1', '2', '3']);
    assert.deepEqual(m.ox, [MARK.yes, MARK.no]);
    // 조사 붙이기
    assert.ok(m.narrowCol < 70, `단 폭 ${m.narrowCol.toFixed(0)}mm`);
    assert.equal(m.joiner, true, '따옴표와 조사 사이에 U+2060 이 없습니다');
    assert.equal(m.split, true, '시험이 쓸모없습니다: 조사 붙이기 없이도 따옴표 뒤에서 줄이 바뀌지 않습니다');
    assert.equal(m.kept, true, '닫는 따옴표와 조사가 다른 줄로 갈립니다');

    // ── 그림 줄 ──
    const fig = c.printJobs(c.loadLesson('5-2/1/02-03')).find((j) => j.kind === 'worksheet')!;
    await page.goto(site.origin + fig.route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.ws-figrow')].map((row) => {
      const visible = (el: Element) => el.getClientRects().length > 0;
      const cells = [...row.querySelectorAll('.ws-figcell')];
      return {
        imgHeights: cells.map((cell) => Math.round(cell.querySelector('img')!.getBoundingClientRect().height)),
        // contain 으로 그려진 그림의 높이 (상자가 아니라 그림). 가로로 긴 그림도 이웃과 같은 높이로 그려져야 한다 (R15, C3-08).
        drawn: cells.map((cell) => {
          const img = cell.querySelector('img')!;
          const q = img.getBoundingClientRect();
          return Math.min(q.height, (q.width * img.naturalHeight) / img.naturalWidth);
        }),
        fit: cells.map((cell) => getComputedStyle(cell.querySelector('img')!).objectFit),
        captionTops: cells.map((cell) => Math.round(cell.querySelector('.ws-fig-caption')!.getBoundingClientRect().top)),
        creditTops: cells.map((cell) => cell.querySelector('.media-credit')!).filter(visible).map((el) => Math.round(el.getBoundingClientRect().top)),
        rowCredit: row.querySelector('.ws-figrow-credit')?.textContent ?? null,
        creditLeft: (() => {
          const credit = row.querySelector('.ws-figrow-credit');
          if (!credit) return null;
          const range = document.createRange();
          range.selectNodeContents(credit);
          return Math.round(range.getClientRects()[0].left - row.getBoundingClientRect().left);
        })(),
      };
    }));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(new Set(row.imgHeights).size, 1, `그림 상자의 높이가 다릅니다: ${row.imgHeights}`);
      assert.ok(Math.max(...row.drawn) - Math.min(...row.drawn) <= 1.5, `그려진 그림의 높이가 다릅니다: ${row.drawn.map((h) => h.toFixed(1))}`);
      assert.deepEqual(row.fit, row.fit.map(() => 'contain'), '그림을 잘라 넣습니다');
      assert.equal(new Set(row.captionTops).size, 1, `설명이 다른 높이에 있습니다: ${row.captionTops}`);
    }
    // 같은 출처: 그림마다 찍지 않고 줄 아래에 한 번, 몇 장의 것인지 밝혀서
    assert.deepEqual(rows[0].creditTops, []);
    assert.match(rows[0].rowCredit ?? '', /^그림 3장: 시험용 그린이/);
    assert.ok(Math.abs(rows[0].creditLeft ?? 99) <= 1, `줄의 출처 표시가 줄의 왼쪽 끝에서 시작하지 않습니다 (${rows[0].creditLeft}px)`);
    // 다른 출처: 그림마다, 같은 높이에
    assert.equal(rows[1].rowCredit, null);
    assert.equal(rows[1].creditTops.length, 3);
    assert.equal(new Set(rows[1].creditTops).size, 1, `출처 표시가 다른 높이에 있습니다: ${rows[1].creditTops}`);

    // ── 카드의 크기·낱말의 기준선·양면 맞춤 ──
    for (const id of ['5-2/1/01', '5-2/1/05']) {
      const lesson = c.loadLesson(id);
      const job = c.printJobs(lesson).find((j) => j.kind === 'cards')!;
      await page.goto(site.origin + job.route, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const sheets = await page.evaluate(() => [...document.querySelectorAll('.sheet')].map((sheet) => {
        const s = sheet.getBoundingClientRect();
        const mm = (px: number) => (px * 25.4) / 96;
        const range = document.createRange();
        range.selectNodeContents(sheet.querySelector('.sheet-foot')!);
        const footTop = Math.min(...[...range.getClientRects()].map((q) => q.top));
        return [...sheet.querySelectorAll('.cards > .card')].map((card) => {
          const q = card.getBoundingClientRect();
          const word = card.querySelector('.card-word');
          let baseline: number | null = null;
          if (word) {
            // 낱말 줄 끝에 크기 없는 inline-block 을 붙이면 그 아래끝이 기준선에 선다
            const probe = document.createElement('span');
            probe.style.cssText = 'display:inline-block;width:0;height:0';
            word.append(probe);
            baseline = mm(probe.getBoundingClientRect().bottom - s.top);
            probe.remove();
          }
          return {
            empty: card.classList.contains('card-empty'),
            front: card.classList.contains('card-front'),
            text: (word ?? card.querySelector('.card-meaning'))?.textContent ?? '',
            picture: !!card.querySelector('img'),
            left: mm(q.left - s.left), right: mm(q.right - s.left), top: mm(q.top - s.top), height: mm(q.height),
            baseline, gap: mm(footTop - q.bottom),
          };
        });
      }));
      const deck = c.deckCards(lesson);
      const want = cardHeight(deck.length, footReserve(`${c.sheetFooter(lesson)} · ${job.pages}/${job.pages}`));
      for (const [si, cells] of sheets.entries()) {
        const filled = cells.filter((x) => !x.empty);
        for (const x of filled) assert.ok(Math.abs(x.height - want) < 0.3, `${id} ${si + 1}쪽: 카드 높이 ${x.height.toFixed(1)}mm (덱의 높이 ${want}mm)`);
        // 바닥글 앞의 틈 (R29)
        for (const x of filled) assert.ok(x.gap >= 6 - 0.05, `${id} ${si + 1}쪽: 카드와 바닥글 사이 ${x.gap.toFixed(1)}mm`);
        if (si % 2 === 1) continue;
        // 앞면: 한 줄의 낱말은 그림이 있든 없든 같은 기준선에 선다
        for (let i = 0; i + 1 < cells.length; i += 2) {
          const [a, b] = [cells[i], cells[i + 1]];
          if (a.empty || b.empty) continue;
          assert.ok(Math.abs(a.baseline! - b.baseline!) < 0.2, `${id} ${si + 1}쪽 ${i / 2 + 1}째 줄: 낱말 기준선 ${a.baseline!.toFixed(1)} / ${b.baseline!.toFixed(1)}mm (${a.text} · ${b.text})`);
        }
        // 뒷면: 긴 변으로 뒤집으면 앞면의 카드 자리와 겹친다 (왼쪽 ↔ 오른쪽, 같은 높이)
        const backs = sheets[si + 1];
        filled.forEach((f, i) => {
          const back = backs[i % 2 === 0 ? i + 1 : i - 1];
          assert.ok(back && !back.empty, `${id} ${si + 2}쪽: ${f.text} 의 뒷면 자리가 비었습니다`);
          assert.ok(Math.abs(f.left - (210 - back.right)) < 0.2 && Math.abs(f.top - back.top) < 0.2 && Math.abs(f.height - back.height) < 0.2,
            `${id} ${si + 1}쪽 ${f.text}: 앞면 (${f.left.toFixed(1)}, ${f.top.toFixed(1)}) 뒷면을 뒤집은 자리 (${(210 - back.right).toFixed(1)}, ${back.top.toFixed(1)})`);
        });
      }
      if (id === '5-2/1/01') assert.ok(sheets[0].some((x) => x.picture), '시험이 쓸모없습니다: 그림이 든 카드가 없습니다');
    }

    // ── 카드의 자르는 선: 300dpi 에서 모두 같은 굵기 ──
    const dpi = (mm: number) => Math.round((mm / 25.4) * 300);
    const tmp = fs.mkdtempSync(path.join(ROOT_OUT, 'raster-'));
    for (const id of ['5-2/1/01', '5-2/1/05']) {
      const lesson = c.loadLesson(id);
      const job = c.printJobs(lesson).find((j) => j.kind === 'cards')!;
      const file = path.join(out, job.file);
      const cards = c.deckCards(lesson).length;
      for (let sheet = 0; sheet * 8 < cards; sheet++) {
        const img = rasterize(file, sheet * 2 + 1, tmp); // 앞면 쪽만 (뒷면에는 선이 없다)
        if (!img) return; // pdftoppm 이 없으면 여기까지만 잰다
        const onSheet = Math.min(8, cards - sheet * 8);
        const rowsOnSheet = Math.ceil(onSheet / 2);
        // 본문은 왼쪽 10mm, 위 32mm(여백 10 + 머리 22)에서 시작한다. 카드 안쪽 1.5mm 를 지나는 줄을 따라 선을 센다.
        const across = darkRuns(Array.from({ length: img.w }, (_, x) => img.at(x, dpi(32 + 1.5))));
        const cardH = cardHeight(cards, footReserve(`${c.sheetFooter(lesson)} · ${job.pages}/${job.pages}`));
        const down = darkRuns(Array.from({ length: dpi(cardH * rowsOnSheet + 2) }, (_, y) => img.at(dpi(10 + 1.5), dpi(31) + y)));
        assert.equal(across.length, onSheet > 1 ? 3 : 2, `${id} ${sheet * 2 + 1}쪽: 세로 선 ${across.length}개`);
        assert.equal(down.length, rowsOnSheet + 1, `${id} ${sheet * 2 + 1}쪽: 가로 선 ${down.length}개`);
        const widths = [...across, ...down].map(([, w]) => w);
        assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `${id} ${sheet * 2 + 1}쪽: 자르는 선의 굵기가 다릅니다 (${widths.join(', ')}px, 300dpi)`);
        assert.ok(Math.min(...widths) >= 5, `${id} 자르는 선이 0.5mm 보다 가늘게 찍힙니다 (${widths.join(', ')}px)`);
      }
    }
  } finally {
    stop();
    await browser.close();
    for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS']) delete process.env[k];
    t.cleanup();
  }
});
