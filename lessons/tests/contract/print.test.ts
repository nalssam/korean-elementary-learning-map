// 인쇄 틀의 뼈대(PrintLayout, Sheet, print.css)와 시험용 컬러링 페이지를 Chromium 으로 열어 docs/CONTRACT.md 7절 '쪽수와 넘침 검사'의 일곱 조건을 재 본다.
// scripts/render-pdf.mjs(인쇄물)가 PDF 를 찍기 전후에 하는 일의 본보기다. 아래 sheetProblems() 가 조건 1·2·4·6·7 을 적힌 그대로 잰다.
// 만든 것은 모두 .cache/tests/print-<pid>/ 아래에 둔다 (dist/ 와 public/ 에 쓰지 않는다). Chromium 이 없으면 건너뛴다 (16절).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { buildSite, noChromium, passRows, tempContent } from './helpers.ts';

const skip = await noChromium();
const SITE_DIR = path.join(c.ROOT, 'tests', 'contract', 'fixtures', 'site');
const OUT = path.join(c.ROOT, '.cache', 'tests', `print-${process.pid}`);
const BASE = '/korean-elementary';
const ONE = '5-2/1/01', TWO = '5-2/1/02-03';
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

/**
 * 인쇄 페이지 안에서 도는 검사 (7절 조건 1·2·4·6·7). 어긋난 곳을 한 줄씩 돌려준다. 빈 목록이면 찍어도 된다.
 * page.emulateMedia({ media: 'print' }) 를 건 뒤에 page.evaluate(sheetProblems, job.pages) 로 부른다.
 */
async function sheetProblems(pages: number): Promise<string[]> {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  const out: string[] = [];
  const sheets = [...document.querySelectorAll('.sheet')];
  // 조건 1: .sheet 의 개수
  if (sheets.length !== pages) out.push(`조건 1: .sheet 가 ${sheets.length}개입니다 (${pages}개여야 합니다)`);
  sheets.forEach((sheet, i) => {
    // 조건 2: 크기가 고정된 상자의 아래·오른쪽 넘침
    for (const sel of ['.sheet', '.sheet-head', '.sheet-body', '.sheet-foot']) {
      const box = sel === '.sheet' ? sheet : sheet.querySelector(sel);
      if (!box) { out.push(`${i + 1}쪽: ${sel} 가 없습니다`); continue; }
      if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) out.push(`조건 2: ${i + 1}쪽 ${sel} 가 넘칩니다 (${box.scrollWidth}×${box.scrollHeight} > ${box.clientWidth}×${box.clientHeight})`);
    }
    // 조건 6: 머리·본문·바닥글 안의 모든 요소가 그 상자의 사각형 안에 있다 (위·왼쪽으로 나간 것, 잘려서 보이지 않는 것)
    for (const sel of ['.sheet-head', '.sheet-body', '.sheet-foot']) {
      const box = sheet.querySelector(sel);
      if (!box) continue;
      const r = box.getBoundingClientRect();
      for (const el of box.querySelectorAll('*')) {
        if (el.getClientRects().length === 0) continue; // 그려지지 않는 것 (display: none, <defs> 안의 것)
        const q = el.getBoundingClientRect();
        if (q.top < r.top - 1 || q.left < r.left - 1 || q.bottom > r.bottom + 1 || q.right > r.right + 1) {
          out.push(`조건 6: ${i + 1}쪽 ${sel} 안의 <${el.tagName.toLowerCase()}> 가 상자 밖으로 나갔습니다`);
          break;
        }
      }
    }
  });
  // 조건 4: 글꼴
  const fonts = [...document.fonts].map((f) => f.status);
  if (fonts.includes('error')) out.push('조건 4: 싣지 못한 글꼴이 있습니다');
  if (!fonts.includes('loaded')) out.push('조건 4: 실린 글꼴이 없습니다');
  // 조건 7: 그림
  for (const img of document.images) if (!(img.complete && img.naturalWidth > 0)) out.push(`조건 7: 그림을 싣지 못했습니다 (${img.getAttribute('src')})`);
  return out;
}

/** 빌드한 사이트를 127.0.0.1 에서 내준다. astro 는 SITE_BASE 가 있어도 out/5-2/… 에 쓰므로 하위 경로를 떼고 대응시킨다 (10절). */
async function serve(out: string, base: string): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = url.startsWith(`${base}/`) ? path.join(out, url.slice(base.length)) : '';
    if (file && url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file || !file.startsWith(out) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

test('인쇄 페이지: 인쇄 모양으로 재어 일곱 조건을 모두 채우고, PDF 는 A4 한 쪽에 바닥글의 주소가 읽힌다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const t = tempContent('print');
  const saved = { ...process.env };
  let stop = () => {};
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    // 두 묶음을 검수를 마친 것으로 적어 공개한다 (공개된 차시의 바닥글에는 주소가 든 긴 한 줄이 찍힌다)
    for (const id of [ONE, TWO]) {
      const seals = c.sealsOf(id);
      t.edit(id, (l) => {
        for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
        l.reviews = passRows(seals.lesson);
        l.status = 'published';
      });
    }
    // 공개 빌드, 하위 경로. 1단계 astro build → 2단계 그림 복사 (scripts/sync-media.mjs 가 하는 일: 이번 빌드에 실리는 차시의 그림만 <out>/media/<id>/ 로)
    const env = { CONTENT_DIR: t.dir, SITE_BASE: BASE, SITE_URL: 'https://example.org' };
    const out = buildSite(path.join(OUT, 'site'), env, { root: SITE_DIR });
    delete process.env.SHOW_DRAFTS;
    Object.assign(process.env, env);
    assert.deepEqual(c.visibleLessons().map((l) => l.id), [ONE, TWO]);
    for (const l of c.visibleLessons()) for (const m of l.media) {
      const to = path.join(out, c.mediaRoute(l, m.id));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(c.mediaFile(l, m.id), to);
    }
    // /published.json: 공개된 묶음 id 의 JSON 배열, 차시표 순서
    assert.equal(fs.readFileSync(path.join(out, 'published.json'), 'utf8'), JSON.stringify([ONE, TWO]));

    const lesson = c.loadLesson(TWO);
    const job = c.printJobs(lesson).find((j) => j.kind === 'coloring')!;
    const site = await serve(out, BASE);
    stop = site.close;
    const page = await browser.newPage();
    // 재기 전에 인쇄 모양을 건다 (.no-print 와 @media print 로 달라지는 모양이 재는 값에 섞이지 않게)
    await page.emulateMedia({ media: 'print' });
    await page.goto(site.origin + BASE + job.route, { waitUntil: 'load' });
    const measure = () => page.evaluate(sheetProblems, job.pages);
    assert.deepEqual(await measure(), []);
    // 틀의 글(머리의 학기·단원·차시 줄, 반·이름 칸, 바닥글과 쪽 번호)은 8pt 이상이다. 공개된 차시의 긴 바닥글이 두 줄로 접혀도 6mm 안에 든다 (위의 조건 2).
    const frame = await page.evaluate(() => [...document.querySelectorAll('.sheet-head *, .sheet-foot')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      .map((el) => ({ what: el.className || el.tagName, pt: (parseFloat(getComputedStyle(el).fontSize) * 72) / 96, lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) })));
    assert.ok(frame.length >= 3, `틀의 글을 찾지 못했습니다: ${JSON.stringify(frame)}`);
    for (const f of frame) assert.ok(f.pt >= 8 - 0.01, `틀의 글 ${f.what} 이 ${f.pt}pt 입니다 (8pt 이상)`);
    assert.equal(frame.find((f) => f.what === 'sheet-foot')?.lines, 2, '시험용 공개 바닥글은 두 줄로 접혀야 이 시험이 두 줄의 높이를 잽니다');
    // 세로로 긴 도안(190 × 249)도 본문을 넘기지 않고, 그림은 '찾아볼 것'과 출처 표시를 뺀 높이를 거의 다 쓴다
    const size = await page.evaluate(() => {
      const mm = (px: number) => (px * 25.4) / 96;
      const img = document.querySelector<HTMLImageElement>('.sheet-body img')!;
      const body = document.querySelector('.sheet-body')!;
      return { img: mm(img.clientHeight), body: [mm(body.clientWidth), mm(body.clientHeight)], tasks: document.querySelector('.coloring-tasks')?.textContent };
    });
    assert.ok(Math.abs(size.body[0] - 190) < 0.5 && Math.abs(size.body[1] - 249) < 0.5, `본문은 190 × 249mm 입니다 (지금 ${size.body})`);
    assert.ok(size.img > 200 && size.img < 249, `그림의 높이 ${size.img}mm`);
    assert.equal(size.tasks, '돌의 모서리가 몇 개인지 세어 봅시다.');

    // 조건 3·5: 찍은 PDF 의 쪽수와 쪽 크기. PDF 의 글은 조각을 사이에 아무것도 넣지 않고 이은 뒤 빈칸을 모두 빼고 견준다.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    // 고정 굵기 Pretendard 로 찍혀 글꼴이 CID 글꼴로 들어간다. 가변 글꼴로 찍으면 Type 3 글꼴 수십 벌이 들어가 글을 고르고 찾기 어렵다.
    const raw = Buffer.from(pdf).toString('latin1');
    assert.ok(!/\/Subtype\s*\/Type3\b/.test(raw), 'PDF 에 Type 3 글꼴이 있습니다 (인쇄 페이지가 가변 글꼴로 찍혔습니다)');
    assert.match(raw, /\/Subtype\s*\/CIDFontType[02]\b/);
    const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const doc = await task.promise;
    assert.equal(doc.numPages, job.pages);
    const first = await doc.getPage(1);
    const [, , w, h] = first.view.map((v) => (v / 72) * 25.4);
    assert.ok(Math.abs(w - 210) <= 1 && Math.abs(h - 297) <= 1, `A4 세로여야 합니다 (지금 ${w} × ${h}mm)`);
    const squash = (s: string) => s.replace(/\s+/g, '');
    const items = (await first.getTextContent()).items.map((it) => ('str' in it ? it.str : ''));
    const text = squash(items.join(''));
    const address = c.absoluteUrl(c.lessonRoute(TWO));
    assert.equal(address, 'https://example.org/korean-elementary/5-2/1/02-03/');
    assert.ok(text.includes(squash(address)), `PDF 의 글에 안내 페이지 주소가 없습니다: ${text}`);
    assert.ok(text.includes(squash(SITE.aiNotice)) && !text.includes(squash(SITE.draftNotice)));
    assert.ok(text.includes(squash(`${c.sheetFooter(lesson)} · 1/1`)));
    assert.ok(!text.includes('127.0.0.1') && !text.includes('localhost'));
    await task.destroy();

    // ── 일부러 틀리게 만들어 조건이 잡아내는지 본다 ──
    // (가) 화면에만 보이는 안내(.no-print): 인쇄 모양에서는 걸리지 않고, 화면 모양으로 재면 멀쩡한 쪽이 걸린다
    await page.evaluate(() => {
      const hint = document.createElement('div');
      hint.className = 'no-print probe';
      hint.style.height = '300mm';
      hint.textContent = '화면에만 보이는 안내';
      document.querySelector('.sheet-body')!.prepend(hint);
    });
    assert.deepEqual(await measure(), []);
    await page.emulateMedia({ media: 'screen' });
    assert.ok((await measure()).some((p) => p.startsWith('조건 2: 1쪽 .sheet-body 가 넘칩니다')));
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.querySelector('.probe')!.remove());
    // (나) 위로 올라가 머리와 겹친 글: 조건 2 는 아래·오른쪽만 보므로 조건 6 이 잡는다
    await page.evaluate(() => {
      const up = document.createElement('p');
      up.className = 'probe';
      up.style.cssText = 'margin: -30mm 0 0; height: 10mm';
      up.textContent = '머리 위로 올라간 글';
      document.querySelector('.sheet-body')!.prepend(up);
    });
    assert.deepEqual(await measure(), ['조건 6: 1쪽 .sheet-body 안의 <p> 가 상자 밖으로 나갔습니다']);
    await page.evaluate(() => document.querySelector('.probe')!.remove());
    // (다) 싣지 못한 그림 (주소가 틀렸거나 그림을 복사하지 않았을 때)
    await page.evaluate((src) => {
      const img = new Image();
      img.className = 'probe';
      img.alt = '';
      img.style.cssText = 'position: absolute; left: 0; top: 0; width: 10mm; height: 10mm';
      img.src = src;
      document.querySelector('.sheet-body')!.append(img);
    }, `${BASE}/media/${TWO}/none.svg`);
    assert.deepEqual(await measure(), [`조건 7: 그림을 싣지 못했습니다 (${BASE}/media/${TWO}/none.svg)`]);
    await page.evaluate(() => document.querySelector('.probe')!.remove());
    assert.deepEqual(await measure(), []);
    // (라) 쪽수가 다름
    assert.deepEqual(await page.evaluate(sheetProblems, 2), ['조건 1: .sheet 가 1개입니다 (2개여야 합니다)']);
  } finally {
    await browser.close();
    stop();
    for (const k of ['CONTENT_DIR', 'SITE_BASE', 'SITE_URL', 'SHOW_DRAFTS']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    t.cleanup();
  }
});
