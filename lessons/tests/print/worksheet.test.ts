// 학습지의 모양을 찍힌 그대로 재어 본다 (docs/CONTRACT.md 7절 '학습지').
//  - 번호는 무엇을 하라고 하는 지시문과 퀴즈 문항에만 붙고, number: false 지시문은 번호 없는 작은 제목으로 찍힌다.
//  - 표의 머리 칸은 괄호 안이나 "~"와 그 뒤 낱말 사이에서 줄을 바꾸지 않는다 (좁은 단 안의 표에서도).
//  - ○표만 받는 표는 문장이 한 줄에 들고, 글을 쓰는 표의 채우는 칸은 20mm 이상이다.
//  - 비어 보이는 쪽은 쓰는 칸이 늘어나 본문의 80% 이상을 쓰고, 20% 넘는 빈 띠가 없다.
//  - 고르기 문항의 보기 번호는 "1)" 꼴이고, 문장 틀의 빈칸 뒤 말은 빈칸에 붙는다.
//  - 초안 PDF 의 제목(Title)은 "[검수 전 초안] " 으로 시작하고, 어느 PDF 에도 Type 3 글꼴이 없다.
// 만든 것은 .cache/tests/print-worksheet-<pid>/ 아래에만 둔다. Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';
import { type3Fonts } from './fonts.ts';

const skip = await noChromium();
const ROOT_OUT = path.join(c.ROOT, '.cache', 'tests', `print-worksheet-${process.pid}`);
after(() => fs.rmSync(ROOT_OUT, { recursive: true, force: true }));

const HEAD = '어떻게 이어지나요? (~하니까)';
const STATEMENTS = ['덮개돌이 받침돌 위에 얹혀 있다.', '많은 사람이 힘을 모아 돌을 옮겼다.', '덮개돌이 받침돌보다 훨씬 길다.'];

/** 빌드한 사이트를 127.0.0.1 에서 내준다 (SITE_BASE 없이 빌드한다) */
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

test('학습지: 번호, 작은 제목, 표의 칸, 남는 자리, 보기 번호, 문장 틀, PDF 의 제목과 글꼴', { skip, timeout: 240_000 }, async () => {
  const { chromium } = await import('playwright');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const t = tempContent('print-worksheet');
  let stop = () => {};
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    t.edit('5-2/1/01', (l) => {
      l.worksheet.pages = [
        // 1쪽: 쓰는 칸이 셋 줄뿐인 비어 보이는 쪽
        { heading: '비어 보이는 쪽', blocks: [
          { type: 'prompt', text: '돌탑을 보고 떠오르는 것을 써 봅시다.' },
          { type: 'lines', label: '떠오르는 것', count: 3 },
        ] },
        // 2쪽: ○표 표, 작은 제목 아래 글을 쓰는 표, 퀴즈, 문장 틀
        { heading: '표와 퀴즈', blocks: [
          { type: 'prompt', text: '눈으로 본 것인지, 짐작한 것인지 ○표 해 봅시다.' },
          { type: 'table', columns: ['말', '눈으로 본 것', '짐작한 것'], rows: STATEMENTS.map((s) => [s, '', '']) },
          { type: 'prompt', text: '홀수 모둠은 그릇을 살펴보고 표를 채워 봅시다.' },
          { type: 'prompt', text: '그릇', number: false },
          { type: 'table', columns: ['살펴볼 곳', '눈으로 본 것', '짐작한 것', HEAD], rows: [['바닥 모양', '', '', ''], ['아래쪽 구멍', '', '', '']] },
          { type: 'quiz', items: [2] },
          { type: 'sentence_frame', frame: '나는 ___을 보았다.' },
        ] },
        // 3쪽: 좁은 단 안의 표
        { blocks: [
          { type: 'columns', columns: [
            [{ type: 'table', columns: ['곳', HEAD], rows: [['바닥', ''], ['구멍', '']] }],
            [{ type: 'lines', count: 3 }],
            [{ type: 'lines', count: 3 }],
          ] },
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
    const lesson = c.loadLesson('5-2/1/01');
    const job = c.printJobs(lesson).find((j) => j.kind === 'worksheet')!;
    assert.equal(job.pages, 3);

    // render-pdf 의 일곱 조건을 모두 채운다
    const r = spawnSync(process.execPath, [path.join(c.ROOT, 'scripts', 'render-pdf.mjs'), '--out', out, '--only', '5-2/1/01'], { cwd: c.ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);

    const site = await serve(out);
    stop = site.close;
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.goto(site.origin + job.route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(({ HEAD, STATEMENTS }) => {
      const mm = (px: number) => (px * 25.4) / 96;
      /** el 안에서 글 text 가 차지하는 줄의 수 (글 조각이 여러 노드에 걸쳐도 센다) */
      const linesOf = (el: Element, text: string) => {
        const nodes: Text[] = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) nodes.push(walk.currentNode as Text);
        const all = nodes.map((n) => n.data).join('');
        const at = all.indexOf(text);
        if (at < 0) return -1;
        const range = document.createRange();
        let pos = 0;
        for (const n of nodes) {
          const end = pos + n.data.length;
          if (at >= pos && at < end) range.setStart(n, at - pos);
          if (at + text.length > pos && at + text.length <= end) range.setEnd(n, at + text.length - pos);
          pos = end;
        }
        return new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
      };
      const sheets = [...document.querySelectorAll('.sheet')];
      // 1쪽: 본문에서 블록이 차지한 비율과 가장 큰 빈 띠
      const body = sheets[0].querySelector('.sheet-body')!.getBoundingClientRect();
      const blocks = [...sheets[0].querySelectorAll('.ws > *')].map((b) => b.getBoundingClientRect());
      const bands = [blocks[0].top - body.top, ...blocks.slice(1).map((b, i) => b.top - blocks[i].bottom), body.bottom - blocks.at(-1)!.bottom];
      const two = sheets[1];
      const [marks, write] = [...two.querySelectorAll('table')];
      const frame = two.querySelector('.ws-frame')!;
      const blank = frame.querySelector('.ws-frame-blank')!.getBoundingClientRect();
      const after = (frame.querySelector('.ws-frame-blank')!.nextElementSibling as Element).getBoundingClientRect();
      const back = document.querySelector('.print-back');
      return {
        fill: (blocks.at(-1)!.bottom - body.top) / body.height,
        band: Math.max(...bands) / body.height,
        nos: [...document.querySelectorAll('.ws-no')].map((n) => n.textContent?.trim()),
        subs: [...two.querySelectorAll('.ws-sub')].map((s) => ({ text: s.textContent?.trim(), numbered: !!s.querySelector('.ws-no') })),
        statementLines: STATEMENTS.map((s) => linesOf(marks, s)),
        writeRows: [...write.querySelectorAll('tbody tr')].map((tr) => mm(tr.getBoundingClientRect().height)),
        headLines: [...document.querySelectorAll('th')].filter((th) => th.textContent?.includes('(~')).map((th) => ({ paren: linesOf(th, '(~하니까)'), width: mm(th.getBoundingClientRect().width) })),
        headText: [...document.querySelectorAll('th')].some((th) => th.textContent === HEAD),
        choiceNos: [...document.querySelectorAll('.ws-choice-no')].map((n) => n.textContent?.trim()),
        frameGap: mm(after.left - blank.right),
        blankWidth: mm(blank.width),
        backHas: !!back,
      };
    }, { HEAD, STATEMENTS });

    // 번호는 지시문 셋과 퀴즈 문항 하나에만 (작은 제목 '그릇'은 건너뛰고 이어 센다)
    assert.deepEqual(m.nos, ['1', '2', '3', '4']);
    assert.deepEqual(m.subs, [{ text: '그릇', numbered: false }]);
    // ○표만 받는 표: 문장마다 한 줄
    assert.deepEqual(m.statementLines, STATEMENTS.map(() => 1), `문장이 줄을 바꿉니다: ${m.statementLines}`);
    // 글을 쓰는 표: 채우는 칸 20mm 이상
    for (const h of m.writeRows) assert.ok(h >= 20, `글을 쓰는 표의 칸 높이 ${h.toFixed(1)}mm`);
    // 머리 칸: "(~하니까)"는 넓은 표에서도 좁은 단의 표에서도 한 줄. 좁은 단의 표는 실제로 좁다.
    assert.equal(m.headText, true);
    assert.equal(m.headLines.length, 2);
    for (const h of m.headLines) assert.equal(h.paren, 1, `"(~하니까)"가 ${h.width.toFixed(0)}mm 칸에서 줄을 바꿉니다`);
    assert.ok(Math.min(...m.headLines.map((h) => h.width)) < 45, `좁은 단의 머리 칸 폭 ${m.headLines.map((h) => h.width.toFixed(0))}`);
    // 비어 보이는 쪽은 쓰는 칸이 늘어난다
    assert.ok(m.fill >= 0.8, `1쪽이 본문의 ${(m.fill * 100).toFixed(0)}%만 씁니다`);
    assert.ok(m.band <= 0.2, `1쪽에 본문의 ${(m.band * 100).toFixed(0)}% 되는 빈 띠가 있습니다`);
    // 보기 번호와 문장 틀
    assert.deepEqual(m.choiceNos, ['1)', '2)', '3)']);
    // 빈칸은 줄 끝까지 늘어나지 않고(60mm), 뒤의 말이 5mm 안에 붙는다
    assert.ok(m.blankWidth <= 61, `빈칸이 ${m.blankWidth.toFixed(0)}mm 로 늘어나 뒤의 말을 줄 끝으로 밉니다`);
    assert.ok(m.frameGap >= 0 && m.frameGap <= 5, `빈칸 뒤 말이 ${m.frameGap.toFixed(1)}mm 떨어져 있습니다`);
    assert.equal(m.backHas, true);

    // 화면: 차시 안내로 돌아가는 링크는 밑줄이 있고 44px 이상이다
    await page.emulateMedia({ media: 'screen' });
    const back = await page.evaluate(() => {
      const a = document.querySelector('.print-back')!;
      return { height: a.getBoundingClientRect().height, line: getComputedStyle(a).textDecorationLine };
    });
    assert.ok(back.height >= 44, `돌아가기 링크 높이 ${back.height}px`);
    assert.match(back.line, /underline/);

    // PDF: 초안의 제목, Type 3 글꼴 없음, 머리 칸의 "(~하니까)"가 한 줄
    const file = path.join(out, job.file);
    const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 });
    try {
      const doc = await task.promise;
      const { info } = await doc.getMetadata() as { info: { Title?: string } };
      assert.ok(info.Title?.startsWith('[검수 전 초안] '), `PDF 제목: ${info.Title}`);
    } finally {
      await task.destroy();
    }
    assert.deepEqual(type3Fonts(file), []);
    const text = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    if (!text.error) assert.ok(text.stdout.split('\n').some((line) => line.includes('(~하니까)')), '"(~하니까)"가 PDF 에서 한 줄에 있지 않습니다');
  } finally {
    stop();
    await browser.close();
    for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS']) delete process.env[k];
    t.cleanup();
  }
});
