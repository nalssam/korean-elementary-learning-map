// 사이트 화면을 Chromium 으로 열어 모양을 본다. 지금은 한 가지: 가로줄 두 개 사이에 아무것도 없는 빈 띠가 없어야 한다.
// 목록이 선으로 끝나는데 바로 다음 칸이 또 위에 선을 그으면, 두 선 사이에 빈 띠가 생긴다 (2차 검수 T2-site-01).
// 시험용 명세를 .cache/tests/ 아래에 빌드하고, 그 폴더를 잠깐 띄운 작은 서버로 연다. 끝나면 지운다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';

const OUT = path.join(c.ROOT, '.cache', 'tests', `site-look-${process.pid}`);
const skip = await noChromium();
let out = '';
before(() => { if (!skip) out = buildSite(OUT, { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' }); });
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

async function serve(dir: string): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (file.endsWith(path.sep) || file.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/**
 * <main> 안의 가로줄(위나 아래 테두리만 있는 넓은 요소)을 위에서부터 늘어놓고, 이웃한 두 줄 사이에 글자나 그림이 하나도 없으면 그 자리를 돌려준다.
 * 네 변에 테두리가 있는 상자(카드·단추)는 줄로 보지 않는다. 접힌 상자는 모두 연 뒤에 잰다.
 */
function emptyBands(): string[] {
  const main = document.querySelector('main');
  if (!main) return ['<main> 이 없습니다'];
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const W = main.getBoundingClientRect().width;
  const rules: { y: number; what: string }[] = [];
  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < W * 0.4 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) continue;
    const name = `${el.tagName.toLowerCase()}.${el.className}`;
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') rules.push({ y: r.top + scrollY, what: `${name} 의 윗선` });
    if (parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none') rules.push({ y: r.bottom + scrollY, what: `${name} 의 밑선` });
    if (el.tagName === 'HR') rules.push({ y: r.top + scrollY, what: 'hr' });
  }
  rules.sort((a, b) => a.y - b.y);
  const filled: [number, number][] = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.height > 0) filled.push([r.top + scrollY, r.bottom + scrollY]);
  }
  for (const el of main.querySelectorAll('img, svg, canvas, input, button, select, textarea, video')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) filled.push([r.top + scrollY, r.bottom + scrollY]);
  }
  const bands: string[] = [];
  for (let i = 1; i < rules.length; i++) {
    const [a, b] = [rules[i - 1], rules[i]];
    if (b.y - a.y < 6) continue; // 붙어 있는 두 줄은 한 줄로 보인다
    if (!filled.some(([top, bottom]) => bottom > a.y + 1 && top < b.y - 1)) bands.push(`${Math.round(a.y)}~${Math.round(b.y)}px: ${a.what} 과 ${b.what} 사이가 비었습니다`);
  }
  return bands;
}

test('두 가로줄 사이에 빈 띠가 없다 (차시 안내·단원·학기 페이지, 1280px 과 390px, 앞뒤 링크가 있을 때와 없을 때)', { skip }, async () => {
  const { chromium } = await import('playwright');
  const server = await serve(out);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const kits = (fs.readdirSync(path.join(out, '5-2', '1'), { withFileTypes: true }) as fs.Dirent[]).filter((d) => d.isDirectory()).map((d) => `/5-2/1/${d.name}/`);
    assert.ok(kits.length >= 4, '시험용 차시 안내 페이지가 모자랍니다');
    const pages = ['/', '/5-2/', '/5-2/1/', '/5-2/2/', '/about/', '/licence/', '/report/', ...kits];
    const problems: string[] = [];
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      for (const url of pages) {
        await page.goto(server.origin + url);
        for (const band of await page.evaluate(emptyBands)) problems.push(`${width}px ${url} ${band}`);
        // 앞뒤 링크가 없는 페이지(단원의 첫 차시이자 마지막 차시)도 본다
        if (await page.evaluate(() => { const p = document.querySelector('.pager'); p?.remove(); return !!p; })) {
          for (const band of await page.evaluate(emptyBands)) problems.push(`${width}px ${url} (앞뒤 링크 없이) ${band}`);
        }
      }
      await page.close();
    }
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('차시 자료실의 자료 카드: 1280px 에서 수업 화면 카드가 한 줄을 다 쓰고, 390px 에서는 한 줄에 하나씩 가득 (R46)', { skip }, async () => {
  const { chromium } = await import('playwright');
  const server = await serve(out);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const kits = (fs.readdirSync(path.join(out, '5-2', '1'), { withFileTypes: true }) as fs.Dirent[]).filter((d) => d.isDirectory()).map((d) => `/5-2/1/${d.name}/`);
    const problems: string[] = [];
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      for (const url of kits) {
        await page.goto(server.origin + url);
        const m = await page.evaluate(() => {
          const list = document.querySelector('.kit-cards');
          if (!list) return null;
          const box = list.getBoundingClientRect();
          return { left: box.left, right: box.right, cards: [...list.children].map((li) => { const r = li.getBoundingClientRect(); return { left: r.left, right: r.right, kind: li.querySelector<HTMLElement>('.rc')?.dataset.kind }; }) };
        });
        if (!m) { problems.push(`${width}px ${url} 자료 카드가 없습니다`); continue; }
        const full = (b: { left: number; right: number }) => Math.abs(b.left - m.left) <= 1 && Math.abs(b.right - m.right) <= 1;
        if (m.cards[0]?.kind !== 'slides' || !full(m.cards[0])) problems.push(`${width}px ${url} 수업 화면 카드가 맨 앞에서 한 줄을 다 쓰지 않습니다`);
        if (width === 390) for (const b of m.cards) if (!full(b)) problems.push(`${width}px ${url} ${b.kind} 카드가 칸을 채우지 않습니다`);
        if (width === 1280 && m.cards.length > 2 && !m.cards.slice(1).some((b) => !full(b))) problems.push(`${width}px ${url} 나머지 카드가 격자로 놓이지 않습니다`);
      }
      await page.close();
    }
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    server.close();
  }
});
