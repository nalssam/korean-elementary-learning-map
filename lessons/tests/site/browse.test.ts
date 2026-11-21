// 교과서 목차(/<학기>/, R44), 단원(/<학기>/<단원>/, R45), 차시 자료실(/<id>/, R46).
// 실제 차시표(5-2 학기, 미리 보기 빌드)와 시험용 명세 넷으로 빌드해 HTML 을 읽고, Chromium 이 있으면 열어서 눌러 본다.
// .cache/tests/site-browse-<pid>/ 아래에만 쓰고 끝나면 지운다 (docs/CONTRACT.md 16절). dev 서버를 띄우지 않는다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_ROUTE, GROUP_LABEL, KIND_GROUP } from '#lib/site.ts';
import { guideSections } from '#src/components/site/book.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';

const OUT = path.join(c.ROOT, '.cache', 'tests', `site-browse-${process.pid}`);
const skip = await noChromium();
let real = '';
let fix = '';
before(() => {
  real = buildSite(path.join(OUT, 'real'), { SHOW_DRAFTS: '1' });
  fix = buildSite(path.join(OUT, 'fix'), { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' });
});
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

const read = (out: string, page: string) => fs.readFileSync(path.join(out, page), 'utf8');
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
/** 넓은 화면의 왼쪽 목차 (BookToc place="rail") */
const rail = (html: string) => html.slice(html.indexOf('<nav class="toc toc-in-rail"'), html.indexOf('</nav>', html.indexOf('<nav class="toc toc-in-rail"')));
/** 좁은 화면의 '목차' 상자 안 */
const fold = (html: string) => html.slice(html.indexOf('<details class="toc-fold"'), html.indexOf('</details>', html.indexOf('<details class="toc-fold"')));

/** 실제 명세(또는 시험용 명세)를 읽는 동안만 환경 변수를 빌드와 같게 둔다 */
function withContent<T>(dir: string | undefined, fn: () => T): T {
  const before = { CONTENT_DIR: process.env.CONTENT_DIR, SHOW_DRAFTS: process.env.SHOW_DRAFTS };
  if (dir) process.env.CONTENT_DIR = dir;
  else delete process.env.CONTENT_DIR;
  process.env.SHOW_DRAFTS = '1';
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ───────────── 교과서 목차 (R44) ─────────────

test('교과서 목차(실제 5-2): 단원 셋과 묶음 전부, 상태 표, 실리는 묶음에만 링크', () => {
  const html = read(real, '5-2/index.html');
  withContent(undefined, () => {
    const units = c.loadRegistry().semesters.find((s) => s.id === '5-2')!.units;
    const bundles = c.allBundles().filter((b) => b.semester.id === '5-2');
    const visible = new Map(c.visibleLessons().map((l) => [l.id, l]));
    assert.equal(units.length, 3);
    assert.equal(bundles.length, 32);
    for (const u of units) {
      assert.ok(html.includes(`<section class="book-unit" id="unit-${u.no}"`), `${u.no}단원 칸이 없습니다`);
      assert.ok(html.includes(`>${esc(u.title)}</h2>`), `${u.no}단원 이름`);
      assert.ok(html.includes(c.pagesLabel(c.unitPages(u))));
    }
    // 묶음 표: 차시표의 묶음마다 한 줄. 실리는 묶음에만 링크와 상태 표, 아직인 묶음은 '준비 중'
    assert.equal(count(html, /<li class="bt-row[ "]/g), bundles.length);
    assert.equal(count(html, /<li class="bt-row is-off"/g), bundles.filter((b) => !visible.has(b.id)).length);
    for (const b of bundles) {
      const l = visible.get(b.id);
      if (l) assert.ok(html.includes(`href="/${b.id}/"`) && html.includes(`>${esc(l.title)}</a>`), b.id);
      else assert.ok(!html.includes(`href="/${b.id}/"`), `${b.id} 는 실리지 않는데 링크가 있습니다`);
    }
    const drafts = [...visible.values()].filter((l) => l.id.startsWith('5-2/') && !c.isPublic(l)).length;
    assert.equal(count(html, /<span class="bt-state"><span class="status-chip" data-state="draft">/g), drafts);
    // N/M 차시 공개는 차시를 센다 (lib 의 semesterProgress)
    const p = c.semesterProgress('5-2');
    assert.ok(html.includes(`${p.published}/${p.total} 차시 공개`));
    assert.ok(html.includes(`${c.loadRegistry().textbook.publisher}(${c.loadRegistry().textbook.author}) 교과서 기준`));
    // 차시표의 focus 는 찍지 않는다
    for (const b of bundles) assert.ok(!html.includes(esc(b.bundle.focus)), `focus(${b.id})가 실렸습니다`);
    // 왼쪽 목차: 학기 페이지에서는 모든 단원의 묶음을 펼친다. 단원 링크는 이 페이지 안의 단원 칸으로, 학기에 aria-current
    const r = rail(html);
    assert.equal(count(r, /<li class="toc-bundle[ "]/g), bundles.length);
    assert.match(r, /<a href="\/5-2\/" aria-current="page">5학년 2학기<\/a>/);
    for (const u of units) assert.ok(r.includes(`href="#unit-${u.no}"`));
    // 좁은 화면의 '목차' 상자에도 같은 목차가 있다
    assert.equal(count(fold(html), /<li class="toc-bundle[ "]/g), bundles.length);
  });
});

test('교과서 목차(시험용): 명세가 없는 묶음은 차시 번호와 쪽수만', () => {
  const html = read(fix, '5-2/index.html');
  for (const id of ['01', '02-03', '04', '05']) assert.ok(html.includes(`href="/5-2/1/${id}/"`), id);
  assert.ok(!html.includes('href="/5-2/2/01/"'));
  assert.ok(html.includes('24~27쪽'));
  // 자료 그림: 실리는 묶음마다 readyKinds() 의 수만큼, 그림 곁에 이름(title)과 화면 읽기용 글
  withContent(FIXTURES, () => {
    for (const l of c.visibleLessons()) {
      const table = html.slice(html.indexOf('<div class="bt"'));
      const row = table.slice(table.indexOf(`href="/${l.id}/"`));
      const kinds = row.slice(0, row.indexOf('</li>'));
      assert.equal(count(kinds, /class="book-kinds-icon"/g), c.readyKinds(l).length, l.id);
    }
  });
});

// ───────────── 단원 (R45) ─────────────

test('단원 페이지(실제 5-2/1, 5-2/2): 같은 목차, 실리는 묶음은 카드, 아직인 묶음은 줄, 앞뒤 단원', () => {
  withContent(undefined, () => {
    const visible = new Set(c.visibleLessons().map((l) => l.id));
    for (const no of [1, 2]) {
      const html = read(real, `5-2/${no}/index.html`);
      const bundles = c.allBundles().filter((b) => b.semester.id === '5-2' && b.unit.no === no);
      assert.equal(count(html, /<li class="ub-card">/g), bundles.filter((b) => visible.has(b.id)).length, `${no}단원 카드`);
      assert.equal(count(html, /<li class="ub-off">/g), bundles.filter((b) => !visible.has(b.id)).length, `${no}단원 줄`);
      // 목차: 지금 단원에 aria-current, 지금 단원의 묶음만 펼친다
      const r = rail(html);
      assert.match(r, new RegExp(`<a class="toc-unit-link" href="/5-2/${no}/" aria-current="page">`));
      assert.equal(count(r, /<li class="toc-bundle[ "]/g), bundles.length);
      // 앞뒤 단원
      assert.ok(html.includes('aria-label="앞뒤 단원"'));
      if (no === 1) assert.ok(html.includes('href="/5-2/2/"') && html.includes('다음 단원'));
      if (no === 2) assert.ok(html.includes('href="/5-2/1/"') && html.includes('앞 단원') && html.includes('href="/5-2/3/"'));
      for (const b of bundles) assert.ok(!html.includes(esc(b.bundle.focus)), `focus(${b.id})가 실렸습니다`);
    }
  });
});

test('단원 페이지(시험용): 단원 정리 묶음의 카드와 학습지를 단원 자료로 맨 위에', () => {
  const unit = read(fix, '5-2/1/index.html');
  const kit = unit.indexOf('id="unit-kit-title"');
  assert.ok(kit > 0 && kit < unit.indexOf('id="lessons-title"'));
  const kitPart = unit.slice(kit, unit.indexOf('id="lessons-title"'));
  assert.deepEqual([...kitPart.matchAll(/<article class="rc" data-kind="([a-z_]+)"/g)].map((m) => m[1]), ['worksheet', 'cards']);
  // 여러 차시를 늘어놓지 않으므로 카드의 차시 줄은 없다 (설명 글이 묶음을 밝힌다)
  assert.ok(kitPart.includes('href="/5-2/1/05/"'));
  // 둘째 단원: 단원 자료가 없고 앞 단원으로 가는 링크만
  const second = read(fix, '5-2/2/index.html');
  assert.ok(!second.includes('id="unit-kit-title"'));
  assert.ok(second.includes('href="/5-2/1/"') && !second.includes('다음 단원'));
});

// ───────────── 차시 자료실 (R46) ─────────────

test('차시 자료실(실제 5-2/1/01): 전에 있던 링크가 모두 있다', () => {
  const html = read(real, '5-2/1/01/index.html');
  withContent(undefined, () => {
    const lesson = c.loadLesson('5-2/1/01');
    const want = [
      c.lessonRoute(lesson.id, ASSET_ROUTE.slides), c.pptxFile(lesson).file,
      c.lessonRoute(lesson.id, ASSET_ROUTE.quiz),
      ...c.printJobs(lesson).flatMap((j) => [j.route, j.file]),
      ...(lesson.assets.web_activity.state === 'ready' ? [c.lessonRoute(lesson.id, ASSET_ROUTE.web_activity)] : []),
    ];
    for (const href of want) assert.ok(html.includes(`href="${href}"`), `${href} 로 가는 링크가 없습니다`);
    assert.ok(html.includes(`download="${esc(c.pptxFile(lesson).download)}"`));
    // QR 은 학생 페이지의 자료 카드가 여는 작은 창에 있다
    assert.match(html, /<button class="rc-btn rc-qr" type="button" popovertarget="qr-5-2-1-01-quiz">/);
    // 수업 화면의 '그림 출처' 링크가 여는 자리
    assert.match(html, /<details class="fold" id="credits">/);
    // 자료 카드가 머리 바로 다음에 온다
    const head = html.indexOf('</header>', html.indexOf('class="kit-head"'));
    assert.ok(head > 0 && html.indexOf('id="materials"') > head && html.indexOf('id="materials"') - head < 200, '자료가 머리 바로 다음에 오지 않습니다');
    // 목차: 지금 묶음에 aria-current, 그 아래에 이 페이지의 길잡이
    const r = rail(html);
    assert.match(r, /<a href="\/5-2\/1\/01\/" aria-current="page">/);
    const sections = guideSections(lesson);
    for (const s of [{ id: 'materials', label: '자료' }, ...sections]) {
      assert.ok(r.includes(`<a href="#${s.id}" data-guide-link>${s.label}</a>`), `왼쪽 길잡이에 ${s.label} 이 없습니다`);
      assert.ok(html.includes(`id="${s.id}"`), `${s.id} 자리가 없습니다`);
    }
    assert.deepEqual(sections.map((s) => s.label), ['준비물', '수업 흐름', '문항과 정답', '학습지 풀이', '예상되는 오개념', '평가', '교사 메모', '사실과 출처', '그림 출처']);
    // 좁은 화면의 길잡이는 교사용 안내 머리에 있다
    const guide = html.slice(html.indexOf('<nav class="guide-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="guide-nav"')));
    assert.equal(count(guide, /data-guide-link/g), sections.length);
    // 앞뒤 차시: 앞은 없고, 다음(2차시)은 실리지 않아 링크 없이 '준비 중'
    const pager = html.slice(html.indexOf('aria-label="앞뒤 차시"'));
    assert.match(pager, /<span class="pager-gap"><\/span>/);
    assert.match(pager, /<p class="pager-link is-off pager-next">\s*<span class="pager-dir">다음 차시<\/span>\s*<span class="pager-name">2차시 · 10~11쪽 <span class="pager-later">준비 중<\/span>/);
    assert.ok(!html.includes('href="/5-2/1/02/"'));
  });
});

test('차시 자료실(시험용): 자료 카드, 거르기 탭, 만들기 세트 자리, 앞뒤 차시', () => {
  withContent(FIXTURES, () => {
    for (const lesson of c.visibleLessons()) {
      const html = read(fix, `${lesson.id}/index.html`);
      const items = c.catalog().filter((i) => i.lessonId === lesson.id);
      // 카드: KIND_ORDER 차례로 자료마다 한 장, data-group 은 KIND_GROUP
      const cards = [...html.matchAll(/<article class="rc" data-kind="([a-z_0-9]+)" data-group="([a-z]+)"/g)];
      assert.deepEqual(cards.map((m) => m[1]), items.map((i) => i.kind), lesson.id);
      for (const m of cards) assert.equal(m[2], KIND_GROUP[m[1] as keyof typeof KIND_GROUP]);
      // 거르기 탭: 스크립트가 풀기 전까지 숨어 있다 (스크립트가 없으면 모든 카드가 보인다). 전체와, 자료가 있는 갈래마다 하나.
      const tabs = html.slice(html.indexOf('<div class="kit-tabs"'), html.indexOf('</div>', html.indexOf('<div class="kit-tabs"')));
      assert.match(tabs, /^<div class="kit-tabs" role="group" aria-label="자료 거르기" data-filter-tabs hidden/);
      assert.match(tabs, new RegExp(`data-filter="all" aria-pressed="true">전체 <span class="kit-tab-n">${items.length}</span>`));
      for (const [g, label] of Object.entries(GROUP_LABEL)) {
        const n = items.filter((i) => KIND_GROUP[i.kind] === g).length;
        if (n > 0) assert.match(tabs, new RegExp(`data-filter="${g}" aria-pressed="false">${label} <span class="kit-tab-n">${n}</span>`), `${lesson.id} ${label}`);
      }
      // 앞뒤 차시: 실리는 이웃은 링크, 다른 단원의 이웃은 단원 번호를 붙인다
      const { prev, next } = c.lessonNeighbours(lesson.id);
      for (const n of [prev, next]) {
        if (!n) continue;
        if (n.ready) assert.ok(html.includes(`<a class="pager-link pager-${n === prev ? 'prev' : 'next'}" href="/${n.id}/">`), `${lesson.id} → ${n.id}`);
        else {
          const where = n.unit === c.bundleOf(lesson).unit.no ? n.lessonsLabel : `${n.unit}단원 ${n.lessonsLabel}`;
          assert.ok(!html.includes(`href="/${n.id}/"`) && html.includes(`${where} · ${n.pagesLabel} <span class="pager-later">준비 중</span>`), `${lesson.id} → ${n.id}`);
        }
      }
    }
    // 두 차시 묶음: 컬러링·페이퍼크래프트·만들기 세트 카드. 만들기 세트는 이 페이지 안의 자리로 간다.
    const two = read(fix, '5-2/1/02-03/index.html');
    for (const k of ['coloring', 'papercraft', 'making_kit', 'cards', 'web_activity']) assert.ok(two.includes(`<article class="rc" data-kind="${k}"`), k);
    assert.ok(two.includes('<a class="rc-open" href="/5-2/1/02-03/#making-kit">열기'));
    assert.equal(count(two, /id="making-kit"/g), 1);
    assert.ok(two.includes('수업 80분 (2차시)'));
    // 두 차시 묶음의 문항 수는 차시마다
    assert.match(two, /<span class="fold-count" data-pagefind-ignore>4문항 \(2차시 \d문항 · 3차시 \d문항\)<\/span>/);
  });
});

test('사이트 화면의 소스는 차시표의 focus 를 읽지 않는다 (교과서 목차·단원·차시 자료실)', () => {
  const files = ['src/components/site/BookToc.astro', 'src/components/site/BookFrame.astro', 'src/components/site/LessonList.astro', 'src/components/site/UnitBundles.astro',
    'src/components/site/book.ts', 'src/pages/[semester]/index.astro', 'src/pages/[semester]/[unit]/index.astro', 'src/pages/[semester]/[unit]/[bundle]/index.astro'];
  for (const f of files) assert.ok(!/\.focus\b/.test(fs.readFileSync(path.join(c.ROOT, f), 'utf8')), `${f} 가 focus 를 읽습니다`);
});

// ───────────── 브라우저에서 (Chromium) ─────────────

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

async function withBrowser(dir: string, fn: (b: import('playwright').Browser, origin: string) => Promise<void>) {
  const { chromium } = await import('playwright');
  const server = await serve(dir);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    await fn(browser, server.origin);
  } finally {
    await browser.close();
    server.close();
  }
}

const FIX_PAGES = ['/5-2/', '/5-2/1/', '/5-2/2/', '/5-2/1/01/', '/5-2/1/02-03/', '/5-2/1/04/', '/5-2/1/05/'];
const REAL_PAGES = ['/5-2/', '/5-2/1/', '/5-2/2/', '/5-2/3/', '/5-2/1/01/'];

test('320px 에서 가로 스크롤이 없다 (교과서 목차·단원·차시 자료실, 목차를 펼쳐도)', { skip }, async () => {
  const problems: string[] = [];
  for (const [dir, pages] of [[fix, FIX_PAGES], [real, REAL_PAGES]] as const) {
    await withBrowser(dir, async (browser, origin) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
      for (const url of pages) {
        await page.goto(origin + url);
        await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
        const over = await page.evaluate(() => {
          const w = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > w + 0.5 && getComputedStyle(el).position !== 'fixed')
            .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`).slice(0, 3);
          return { scroll: document.documentElement.scrollWidth - w, wide };
        });
        if (over.scroll > 0) problems.push(`${dir === fix ? '시험용' : '실제'} ${url}: ${over.scroll}px 넘칩니다 ${over.wide.join(', ')}`);
      }
      await page.close();
    });
  }
  assert.deepEqual(problems, []);
});

test('목차는 키보드로 닿는다 (넓은 화면의 왼쪽 목차, 좁은 화면의 목차 상자)', { skip }, async () => {
  await withBrowser(fix, async (browser, origin) => {
    // 넓은 화면: Tab 으로 왼쪽 목차의 지금 묶음에 닿고, 초점 표시가 보인다
    const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await wide.goto(origin + '/5-2/1/02-03/');
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await wide.keyboard.press('Tab');
      reached = await wide.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return !!a && a.closest('.toc-in-rail') !== null && a.getAttribute('aria-current') === 'page';
      });
    }
    assert.ok(reached, '왼쪽 목차의 지금 묶음에 Tab 으로 닿지 않습니다');
    const outline = await wide.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    assert.notEqual(outline, 'none', '초점 표시가 없습니다');
    // 목차는 따라온다 (sticky)
    assert.equal(await wide.evaluate(() => getComputedStyle(document.querySelector('.book-rail')!).position), 'sticky');
    await wide.close();

    // 좁은 화면: 왼쪽 목차는 숨고, '목차' 상자를 Tab 과 Enter 로 열어 묶음 링크에 닿는다
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(origin + '/5-2/1/02-03/');
    assert.equal(await phone.evaluate(() => getComputedStyle(document.querySelector('.book-rail')!).display), 'none');
    let summary = false;
    for (let i = 0; i < 40 && !summary; i++) {
      await phone.keyboard.press('Tab');
      summary = await phone.evaluate(() => document.activeElement?.matches('.toc-fold > summary') ?? false);
    }
    assert.ok(summary, "'목차' 상자에 Tab 으로 닿지 않습니다");
    await phone.keyboard.press('Enter');
    assert.equal(await phone.evaluate(() => (document.querySelector('.toc-fold') as HTMLDetailsElement).open), true);
    await phone.keyboard.press('Tab');
    assert.ok(await phone.evaluate(() => document.activeElement?.closest('.toc-fold .toc') !== null), '목차를 연 뒤 Tab 이 목차의 링크로 가지 않습니다');
    // 누르는 자리는 44px 이상
    const small = await phone.evaluate(() => [...document.querySelectorAll<HTMLElement>('.toc-fold summary, .toc-fold .toc a, .kit-tab, .guide-nav a, .pager-link')]
      .filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim()));
    assert.deepEqual(small, [], `44px 보다 작은 자리: ${small.join(', ')}`);
    await phone.close();
  });
});

test('거르기 탭: 누르면 그 갈래의 카드만 남고, 스크립트가 없으면 탭이 숨고 카드가 모두 보인다', { skip }, async () => {
  await withBrowser(fix, async (browser, origin) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(origin + '/5-2/1/02-03/');
    const shown = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.kit-cards > li')].filter((li) => li.offsetParent !== null).map((li) => li.querySelector<HTMLElement>('.rc')!.dataset.group));
    const all = await shown();
    assert.equal(all.length, 8);
    assert.equal(await page.locator('.kit-tabs').isVisible(), true);
    await page.locator('.kit-tab[data-filter="print"]').click();
    assert.deepEqual([...new Set(await shown())], ['print']);
    assert.equal((await shown()).length, 5);
    assert.equal(await page.locator('.kit-tab[data-filter="print"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.kit-tab[data-filter="all"]').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('[data-filter-status]').textContent() ?? '', /인쇄 자료 5가지/);
    await page.locator('.kit-tab[data-filter="student"]').click();
    assert.deepEqual([...new Set(await shown())], ['student']);
    await page.locator('.kit-tab[data-filter="all"]').click();
    assert.equal((await shown()).length, 8);
    // 키보드로도 누른다
    await page.locator('.kit-tab[data-filter="class"]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await shown(), ['class']);
    await page.close();

    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    const off = await ctx.newPage();
    await off.goto(origin + '/5-2/1/02-03/');
    assert.equal(await off.locator('.kit-tabs').isVisible(), false);
    assert.equal(await off.evaluate(() => [...document.querySelectorAll<HTMLElement>('.kit-cards > li')].filter((li) => li.offsetParent !== null).length), 8);
    await ctx.close();
  });
});

test('교사용 안내의 길잡이: 접힌 상자를 가리키면 펴 주고, 넓은 화면에서는 읽는 칸을 표시한다', { skip }, async () => {
  await withBrowser(real, async (browser, origin) => {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(origin + '/5-2/1/01/');
    await phone.locator('.guide-nav a[href="#credits"]').click();
    assert.equal(await phone.evaluate(() => (document.getElementById('credits') as HTMLDetailsElement).open), true);
    await phone.close();

    const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await wide.goto(origin + '/5-2/1/01/');
    assert.equal(await wide.locator('.guide-nav').isVisible(), false);
    await wide.locator('.toc-in-rail a[href="#flow"]').click();
    await wide.waitForFunction(() => document.querySelector('.toc-in-rail a[href="#flow"]')?.getAttribute('aria-current') === 'location');
    // 수업 화면 카드는 한 줄을 다 쓰고, 나머지 카드는 그 아래 격자에 놓인다
    const boxes = await wide.evaluate(() => [...document.querySelectorAll('.kit-cards > li')].map((li) => { const r = li.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; }));
    const list = await wide.evaluate(() => { const r = document.querySelector('.kit-cards')!.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(Math.abs(boxes[0].left - list.left) < 1 && Math.abs(boxes[0].right - list.right) < 1, '수업 화면 카드가 한 줄을 다 쓰지 않습니다');
    assert.ok(boxes.slice(1).every((b) => b.top > boxes[0].top));
    await wide.close();
  });
});
