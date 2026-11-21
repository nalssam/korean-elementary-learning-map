// 자료 유형별(/types/)·업데이트(/updates/)·제작 현황(/status/)·내 자료함(/my/) (R48~R51).
// 시험용 명세로 미리 보기와 공개 빌드를, 실제 명세로 미리 보기를 .cache/tests/ 아래에 만들고 HTML 을 읽은 뒤,
// Chromium 으로 거르기(키보드), 담기와 내 자료함, 막힌 저장소, 스크립트 없이, 320px 를 본다. 끝나면 지운다 (docs/CONTRACT.md 16절).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_LABEL, KIND_ORDER } from '#lib/site.ts';
import { STORAGE_KEY } from '#src/components/site/collect.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';

const OUT = path.join(c.ROOT, '.cache', 'tests', `catalog-${process.pid}`);
const FIX = path.join(OUT, 'fix');
const PUB = path.join(OUT, 'pub');
const REAL = path.join(OUT, 'real');
const PAGES = ['types', 'updates', 'status', 'my'];
const skip = await noChromium();
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

before(() => {
  buildSite(FIX, { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' });
  buildSite(PUB, { CONTENT_DIR: FIXTURES, SITE_URL: 'https://example.org' });
  buildSite(REAL, { SHOW_DRAFTS: '1' });
});

const read = (out: string, page: string) => fs.readFileSync(path.join(out, page, 'index.html'), 'utf8');
const count = (html: string, re: RegExp) => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
/** env 를 잠깐 걸고 도우미를 부른다 (빌드와 같은 명세를 읽게) */
function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const saved = { ...process.env };
  for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS']) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
const FIX_ENV = { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' };

test('자료 유형별: 실린 자료마다 카드 한 장, KIND_ORDER 차례의 묶음(#종류), 준비된 것이 없는 종류는 준비 중 한 줄', () => {
  const html = read(FIX, 'types');
  const items = withEnv(FIX_ENV, () => c.catalog());
  assert.equal(count(html, /<article class="rc"/), items.length);
  for (const i of items) assert.equal(count(html, new RegExp(`data-key="${i.key.replace(/[/#]/g, (m) => `\\${m}`)}"`)), 1, i.key);
  // 차시를 함께 보여 준다 (여러 차시의 자료를 늘어놓는 페이지)
  assert.equal(count(html, /<p class="rc-lesson">/), items.length);
  // 묶음은 열 가지 모두, 정한 차례대로
  const order = [...html.matchAll(/<section class="ty-group[^"]*" id="([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [...KIND_ORDER]);
  for (const kind of KIND_ORDER) {
    const at = html.lastIndexOf('<section', html.indexOf(`id="${kind}"`));
    const section = html.slice(at, html.indexOf('</section>', at));
    const n = items.filter((i) => i.kind === kind).length;
    if (n) {
      assert.match(section, /<ul class="cat-cards ty-cards" data-pagefind-ignore>/, kind);
      assert.match(section, new RegExp(`<span data-ty-n>${n}</span>개`), kind);
    } else {
      assert.match(section, /ty-group-empty/, kind);
      assert.match(section, /<span class="status-chip" data-state="planned">준비 중<\/span>/, kind);
      assert.doesNotMatch(section, /class="rc"/, kind);
    }
  }
  // 거르기 줄은 스크립트가 드러낸다. 준비된 종류만 단추가 있다.
  assert.match(html, /<div class="ty-tools" id="ty-tools" data-ty-tools hidden data-pagefind-ignore>/);
  assert.equal(count(html, /class="ty-chip"/), 1 + new Set(items.map((i) => i.kind)).size);
});

test('업데이트: 보여 줄 소식만 날짜가 늦은 것부터, 초안을 가리키면 초안 표, 차시 자료실로 가는 링크', () => {
  const html = read(FIX, 'updates');
  const updates = withEnv(FIX_ENV, () => c.visibleUpdates());
  const titles = [...html.matchAll(/<h3 class="up-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, updates.map((u) => u.title));
  // 명세가 없는 묶음을 가리키는 소식은 나오지 않는다
  assert.ok(!html.includes('명세가 아직 없는 묶음의 소식'));
  assert.equal(count(html, /<span class="status-chip" data-state="draft">초안<\/span>/), updates.filter((u) => u.draft).length);
  assert.equal(count(html, /<span class="status-chip" data-state="new">새 자료<\/span>/), updates.filter((u) => u.kind === 'new').length);
  assert.match(html, /<a class="up-link" href="\/5-2\/1\/01\/"><span class="up-link-course">5학년 2학기 1단원 1차시<\/span><span class="up-link-title">시험용 한 차시<\/span><\/a>/);
  // 달마다 묶는다
  assert.deepEqual([...html.matchAll(/<h2 class="up-month-title"[^>]*>([^<]+)</g)].map((m) => m[1]), ['2026년 11월', '2026년 10월']);
});

test('제작 현황: 학년 × 학기 표, 차시 수는 semesterProgress(), 단원마다 묶음 칩, 초안은 미리 보기에서만', () => {
  const html = read(FIX, 'status');
  const p = withEnv(FIX_ENV, () => c.semesterProgress('5-2'));
  assert.match(html, new RegExp(`<span class="st-count"><b>${p.published}</b> <span>/ ${p.total}차시</span> <span>공개</span></span>`));
  assert.match(html, new RegExp(`<span>초안 ${p.draft}</span> · <span>준비 중 ${p.planned}</span>`));
  assert.equal(count(html, /<td class="st-cell st-cell-off"><span class="st-off">교과서 차시표 준비 중<\/span><\/td>/), 7);
  // 묶음마다 칩 하나: 실리는 묶음은 차시 자료실 링크, 명세가 없는 묶음은 글자만
  const bundles = withEnv(FIX_ENV, () => c.allBundles());
  assert.equal(count(html, /class="st-b" data-state=/), bundles.length);
  assert.equal(count(html, /<a class="st-b" data-state="draft" href="\/5-2\/1\/\d\d(?:-\d\d)?\/"/), 4);
  assert.equal(count(html, /<span class="st-b" data-state="planned"/), 1);
  assert.match(html, /<a href="\/5-2\/2\/"><span class="st-unit-no">2단원<\/span> 시험용 둘째 단원<\/a>/);

  // 공개 빌드에는 초안이 없다: 초안의 수도, 초안 칩도 없다 (맨 아래 문구의 "초안을 만들고"는 그대로)
  const pub = read(PUB, 'status');
  assert.doesNotMatch(pub, /초안 \d|data-state="draft"|st-bar-draft|st-key-draft/);
  assert.equal(count(pub, /<span class="st-b" data-state="planned"/), bundles.length);
  assert.doesNotMatch(pub, /<a class="st-b"/);
});

test('공개 빌드: 초안의 자료·소식은 어디에도 없다', () => {
  const types = read(PUB, 'types');
  assert.equal(count(types, /<article class="rc"/), 0);
  assert.match(types, /아직 실린 자료가 없습니다/);
  assert.doesNotMatch(types, /<div class="ty-tools"/);
  const updates = read(PUB, 'updates');
  assert.deepEqual([...updates.matchAll(/<h3 class="up-title">([^<]+)<\/h3>/g)].map((m) => m[1]), ['시험용 알림', '시험용 고침']);
  assert.doesNotMatch(updates, /data-state="draft"/);
  const my = read(PUB, 'my');
  assert.match(my, /<script type="application\/json" id="my-catalog">\[\]<\/script>/);
  for (const page of PAGES) assert.doesNotMatch(read(PUB, page), /\sdata-draft\b/, page);
});

test('내 자료함: 검색 색인에서 빠지고, 실린 자료의 목록을 JSON 으로 싣는다', () => {
  const html = read(FIX, 'my');
  assert.doesNotMatch(html, /data-pagefind-body/);
  const json = JSON.parse(/<script type="application\/json" id="my-catalog">(.*?)<\/script>/s.exec(html)![1]);
  const items = withEnv(FIX_ENV, () => c.catalog());
  assert.deepEqual(json.map((i: { key: string }) => i.key), items.map((i) => i.key));
  // QR 은 학생 페이지에만, 종이에 박는 것과 같은 온전한 주소로
  assert.deepEqual(json.filter((i: { qr?: string }) => i.qr).map((i: { kind: string }) => i.kind).sort(), items.filter((i) => i.kind === 'quiz' || i.kind === 'web_activity').map((i) => i.kind).sort());
  // 자료 종류의 선 그림은 템플릿에 한 번씩 (두 크기)
  for (const k of KIND_ORDER) assert.equal(count(html, new RegExp(`<svg class="type-icon[^"]*" data-kind="${k}"`)), 2, k);
  // 다른 세 페이지는 색인에 든다 (자료 유형별의 카드 목록은 data-pagefind-ignore)
  for (const page of ['types', 'updates', 'status']) assert.match(read(FIX, page), /<main id="main" data-pagefind-body/, page);
});

test('네 페이지의 사이트 안 링크는 모두 빌드에 있고, 차시표의 focus 는 실리지 않는다', () => {
  for (const [out, env] of [[FIX, FIX_ENV], [REAL, { SHOW_DRAFTS: '1' }]] as const) {
    const focus = withEnv(env, () => c.allBundles().map((b) => b.bundle.focus.trim()).filter((f) => f.length >= 4));
    for (const page of PAGES) {
      const html = read(out, page);
      for (const f of focus) assert.ok(!html.includes(f), `${page}: 차시표의 focus "${f}" 가 실렸습니다`);
      for (const [, href] of html.matchAll(/\shref="(\/[^"#?]*)/g)) {
        // 만들어진 파일(PDF·PPTX·미리보기)은 빌드 3·4단계가 만든다. 이 시험은 1단계만 돌린다.
        if (href.startsWith('/files/') || href.startsWith('/_astro/')) continue;
        const file = path.join(out, href.endsWith('/') ? `${href}index.html` : href);
        assert.ok(fs.existsSync(file), `${page}: 링크 ${href} 가 빌드에 없습니다`);
      }
    }
  }
});

// ───────────── Chromium ─────────────

async function serve(root: string): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', woff2: 'font/woff2', json: 'application/json' };
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

test('자료 유형별: 스크립트 없이 모든 묶음이 보이고, 키보드로 종류를 고르면 그 묶음만 남는다. #종류 로 들어오면 고른 채로 열린다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve(FIX);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const plain = await browser.newContext({ javaScriptEnabled: false });
    let page = await plain.newPage();
    await page.goto(`${site.origin}/types/`);
    assert.equal(await page.locator('[data-ty-tools]').isVisible(), false);
    assert.equal(await page.locator('section.ty-group:visible').count(), KIND_ORDER.length);
    await plain.close();

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.origin}/types/`);
    assert.equal(await page.locator('[data-ty-tools]').isVisible(), true);
    // 키보드로 학습지 단추까지 가서 누른다
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.tyKind === 'worksheet');
    }
    assert.ok(reached, '키보드로 학습지 단추에 닿지 못했습니다');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-ty-kind="worksheet"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-ty-kind=""]').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.locator('section.ty-group:visible').evaluateAll((s) => s.map((x) => x.id)), ['worksheet']);
    assert.equal(new URL(page.url()).hash, '#worksheet');
    assert.match(await page.locator('[data-ty-status]').textContent() ?? '', /^학습지 \d+개$/);
    // 스페이스로 전체로 되돌린다
    await page.locator('[data-ty-kind=""]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('section.ty-group:visible').count(), KIND_ORDER.length);
    // 학기를 고르면 그 학기의 카드만. 시험용 명세는 모두 5-2 라 그대로다.
    await page.locator('[data-ty-semester]').selectOption('5-2');
    assert.equal(await page.locator('.ty-cards > li:visible').count(), await page.locator('.ty-cards > li').count());

    await page.goto(`${site.origin}/types/#cards`);
    assert.equal(await page.locator('[data-ty-kind="cards"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('section.ty-group:visible').evaluateAll((s) => s.map((x) => x.id)), ['cards']);
    // 거르기 줄이 화면 안에 보인다 (묶음으로 내려가도 단추 줄을 가리지 않는다)
    const box = await page.locator('[data-ty-tools]').boundingBox();
    assert.ok(box && box.y >= 0, `거르기 줄이 화면 위로 밀려났습니다 (${box?.y})`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    site.close();
  }
});

test('내 자료함: 담은 것이 담은 차례대로 카드로 나오고 다시 열어도 남는다. 빼기, 모르는 열쇠, 막힌 저장소, 스크립트 없이', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve(FIX);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 빈 자료함
    await page.goto(`${site.origin}/my/`);
    assert.equal(await page.locator('[data-my-empty]').isVisible(), true);
    assert.equal(await page.locator('[data-my-saved]').isVisible(), false);
    assert.equal(await page.locator('.my-note').isVisible(), true);

    // 차시 자료실에 자료 카드가 있으면 거기에서, 없으면 자료 유형별에서 담는다
    const a = '5-2/1/02-03#worksheet', b = '5-2/1/01#quiz';
    await page.goto(`${site.origin}/5-2/1/02-03/`);
    if (await page.locator(`[data-collect="${a}"]`).count()) await page.locator(`[data-collect="${a}"]`).first().click();
    else { await page.goto(`${site.origin}/types/`); await page.locator(`[data-collect="${a}"]`).click(); }
    await page.goto(`${site.origin}/types/`);
    await page.locator(`[data-collect="${b}"]`).click();
    assert.equal(await page.locator(`[data-collect="${b}"]`).getAttribute('aria-pressed'), 'true');

    await page.goto(`${site.origin}/my/`);
    const keys = () => page.locator('[data-my-list] article.rc').evaluateAll((x) => x.map((e) => (e as HTMLElement).dataset.key));
    assert.deepEqual(await keys(), [a, b]);
    assert.equal(await page.locator('[data-my-count]').textContent(), '2');
    assert.equal(await page.locator('[data-my-empty]').isVisible(), false);
    await page.reload();
    assert.deepEqual(await keys(), [a, b]);

    // 카드는 ResourceCard 와 같은 짜임이다 (자료 유형별의 같은 자료 카드와 class 차례를 견준다. 담기·빼기 단추와 QR 그림은 빼고)
    const shape = (p: typeof page, key: string) => p.locator(`article.rc[data-key="${key}"]`).first().evaluate((el) =>
      [...el.querySelectorAll('[class]')].filter((x) => !x.closest('.rc-collect, .qr')).map((x) => x.getAttribute('class')));
    const mine = await shape(page, b);
    const other = await browser.newPage();
    await other.goto(`${site.origin}/types/`);
    assert.deepEqual(mine, await shape(other, b));
    await other.close();
    // QR 창을 열면 QR 을 그린다 (자료 유형별의 것과 같은 QR)
    await page.locator(`article.rc[data-key="${b}"] .rc-qr`).click();
    await page.locator(`article.rc[data-key="${b}"] .rc-pop svg.qr`).waitFor();
    assert.equal(await page.locator(`article.rc[data-key="${b}"] .rc-pop`).evaluate((p) => p.matches(':popover-open')), true);
    await page.keyboard.press('Escape');

    // 빼기: 카드가 사라지고 초점은 남은 카드의 빼기 단추로
    await page.locator(`[data-remove="${a}"]`).click();
    assert.deepEqual(await keys(), [b]);
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.remove), b);
    assert.match(await page.locator('[data-my-live]').textContent() ?? '', /내 자료함에서 뺐습니다: 학습지/);
    assert.deepEqual(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), STORAGE_KEY), [b]);
    // 마지막 하나를 빼면 빈 자료함과 그 제목으로 초점
    await page.locator(`[data-remove="${b}"]`).click();
    assert.equal(await page.locator('[data-my-empty]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'my-empty-title');

    // 목록에 없는 열쇠(공개 빌드에서 사라진 초안 따위)는 그리지 않고 지우지도 않는다. 몇 개가 안 보이는지 알린다.
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, ['5-2/2/01#worksheet', b]] as const);
    await page.reload();
    assert.deepEqual(await keys(), [b]);
    assert.match(await page.locator('[data-my-missing]').textContent() ?? '', /1개는 지금 이 사이트에 실려 있지 않아/);
    assert.deepEqual(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), STORAGE_KEY), ['5-2/2/01#worksheet', b]);
    assert.deepEqual(errors, []);
    await ctx.close();

    // 저장소가 막힌 브라우저: 빈 자료함 대신 담을 수 없다는 안내와, 늘 보이는 안내
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('막힌 저장소'); } }); });
    const bp = await blocked.newPage();
    const berrors: string[] = [];
    bp.on('pageerror', (e) => berrors.push(e.message));
    await bp.goto(`${site.origin}/my/`);
    assert.equal(await bp.locator('[data-my-blocked]').isVisible(), true);
    assert.equal(await bp.locator('[data-my-saved]').isVisible(), false);
    assert.equal(await bp.locator('.my-note').isVisible(), true);
    assert.deepEqual(berrors, []);
    await blocked.close();

    // 스크립트 없이: 빈 자료함, 안내, 스크립트를 켜라는 말
    const plain = await browser.newContext({ javaScriptEnabled: false });
    const pp = await plain.newPage();
    await pp.goto(`${site.origin}/my/`);
    assert.equal(await pp.locator('[data-my-empty]').isVisible(), true);
    assert.equal(await pp.locator('.my-note').isVisible(), true);
    assert.match(await pp.locator('main').textContent() ?? '', /스크립트가 켜져 있어야 보입니다/);
    await plain.close();
  } finally {
    await browser.close();
    site.close();
  }
});

test('320px 에서 네 페이지 모두 가로로 밀리지 않고, 휴대폰에서 누르는 자리는 44px 이상이다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve(REAL);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, ['5-2/1/01#worksheet', '5-2/1/01#quiz']] as const);
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${site.origin}/${p}/`);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(width <= 320, `/${p}/ 가 ${width}px 로 넓어졌습니다`);
      const small = await page.locator('main :is(.ty-chip, .ty-sem-select, a.st-b, .up-link, .my-go, .rc-open, .rc-btn)').evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().height < 44).map((e) => `${e.className}: ${Math.round(e.getBoundingClientRect().height)}px`));
      assert.deepEqual(small, [], `/${p}/`);
    }
    // 실제 명세의 내 자료함: 담은 둘이 나온다
    await page.goto(`${site.origin}/my/`);
    assert.equal(await page.locator('[data-my-list] article.rc').count(), 2);
    assert.deepEqual(await page.locator('[data-my-list] .rc-label').allTextContents(), [ASSET_LABEL.worksheet, ASSET_LABEL.quiz]);
  } finally {
    await browser.close();
    site.close();
  }
});
