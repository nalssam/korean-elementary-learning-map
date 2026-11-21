// 함께 쓰는 화면 부품(src/components/site/ui/)과 내 자료함의 담기(collect.ts)를 실제로 빌드해 본다 (docs/CONTRACT.md 6절, R47·R51·R53·R58).
// tests/contract/fixtures/site 의 시험용 쪽(/ui/)이 부품을 모두 그린다. HTML 을 읽고, Chromium 으로 담기·QR 창·막힌 저장소·좁은 화면을 본다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { KIND_ORDER } from '#lib/site.ts';
import { STORAGE_KEY } from '#src/components/site/collect.ts';
import { FIXTURES, buildSite, noChromium } from './helpers.ts';

const SITE_DIR = path.join(c.ROOT, 'tests', 'contract', 'fixtures', 'site');
const OUT = path.join(c.ROOT, '.cache', 'tests', `ui-${process.pid}`);
const UI_DIR = path.join(c.ROOT, 'src', 'components', 'site', 'ui');
// 시험을 모두 적은 뒤에 기다리면 그 사이에 앞의 시험과 after() 가 먼저 돌아 버린다. 기다릴 것은 맨 위에서 기다린다.
const skip = await noChromium();
let html = '';
let items: c.CatalogItem[] = [];
// HTML 이 길어서 assert.match 가 실패하면 쪽 전체를 찍는다. 무엇을 찾지 못했는지만 알린다.
const seen = (re: RegExp, what = re.source) => assert.ok(re.test(html), `시험용 쪽에 없습니다: ${what}`);

before(() => {
  buildSite(OUT, { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' }, { root: SITE_DIR });
  html = fs.readFileSync(path.join(OUT, 'ui', 'index.html'), 'utf8');
  process.env.CONTENT_DIR = FIXTURES;
  process.env.SHOW_DRAFTS = '1';
  items = c.catalog();
  delete process.env.SHOW_DRAFTS;
});
after(() => { fs.rmSync(OUT, { recursive: true, force: true }); delete process.env.CONTENT_DIR; });

test('ResourceCard: 자료마다 한 장, 담기 단추는 숨은 채로 그려지고 init() 이 드러낸다', () => {
  const cards = html.match(/<article class="rc"/g) ?? [];
  // 시험용 쪽은 자료 전부와, 차시를 함께 보여 주는 카드 셋을 그린다
  assert.equal(cards.length, items.length + 3);
  for (const i of items) {
    assert.ok(html.includes(`data-key="${i.key}"`), i.key);
    assert.ok(html.includes(`data-collect="${i.key}" aria-pressed="false" hidden`), i.key);
  }
  // 여는 단추와 내려받기. 단추의 말에 어느 자료인지가 붙는다 (화면 읽기 프로그램)
  seen(/<a class="rc-open" href="\/5-2\/1\/01\/slides\/">띄우기<span class="visually-hidden">: 수업 화면 시험용 한 차시<\/span><\/a>/);
  seen(/<a class="rc-btn" href="\/files\/5-2\/1\/01\/slides\.pptx" download="5-2_1단원_1차시_수업 화면\.pptx">내려받기/);
  seen(/<a class="rc-open" href="\/5-2\/1\/01\/worksheet\/">인쇄 페이지/);
  seen(/<a class="rc-open" href="\/5-2\/1\/02-03\/#making-kit">열기/);
  // 미리보기 그림: 대체 글, 늦게 싣기. 그 뒤에 자료 종류의 선 그림이 있다
  seen(/<div class="rc-frame"><svg class="type-icon rc-icon" data-kind="worksheet"[^>]*>.*?<\/svg><img class="rc-thumb" src="\/files\/5-2\/1\/01\/thumbs\/worksheet\.jpg" alt="학습지 미리보기" loading="lazy" decoding="async" onerror="this\.remove\(\)">/s);
  // 만들기 세트는 미리보기 그림이 없고 선 그림만
  const kit = html.slice(html.indexOf('data-key="5-2/1/02-03#making_kit"'));
  assert.ok(!kit.slice(0, kit.indexOf('</article>')).includes('rc-thumb'));
  // 초안 표
  seen(/<p class="rc-format">PPTX 5장<span class="status-chip" data-state="draft">초안<\/span><\/p>/);
  // 여러 차시를 늘어놓을 때는 학기·단원·차시와 차시 이름이 붙는다
  seen(/<p class="rc-lesson"><a href="\/5-2\/1\/01\/">5학년 2학기 1단원 1차시 · 시험용 한 차시<\/a><\/p>/);
  seen(/<h4 class="rc-title">시험용 학습지<\/h4>/);
});

test('QR 창은 학생 페이지(확인 퀴즈, 웹 활동)에만 있고, id 가 겹치지 않는다', () => {
  const qr = [...html.matchAll(/popovertarget="([^"]+)">QR/g)].map((m) => m[1]);
  const student = items.filter((i) => i.kind === 'quiz' || i.kind === 'web_activity').map((i) => `qr-${i.key.replace(/[^a-z0-9]+/gi, '-')}`);
  assert.deepEqual(qr.slice(0, student.length), student);
  // 시험용 쪽의 둘째 목록에 확인 퀴즈가 한 번 더 나온다. 붙이는 말(uid)로 id 가 갈린다
  assert.ok(qr.includes('qr-5-2-1-01-quiz-b'));
  seen(/<div class="rc-pop" id="qr-5-2-1-01-quiz" popover data-pagefind-ignore><p class="rc-pop-title">확인 퀴즈<\/p><p class="rc-pop-sub">시험용 한 차시<\/p><svg class="qr"[^>]*aria-label="확인 퀴즈 QR 코드"/);
  // 주소는 absoluteUrl() 로 만들고 '/' 뒤에서만 줄을 바꾼다 (UrlText)
  assert.ok(html.includes('<span class="url-part" style="white-space:nowrap">quiz/</span>'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], '같은 id 가 두 번 나옵니다');
  // 수업 화면·인쇄물 카드에는 QR 이 없다
  const slides = html.slice(html.indexOf('data-key="5-2/1/01#slides"'));
  assert.ok(!slides.slice(0, slides.indexOf('</article>')).includes('popover'));
});

test('Kicker·Band·StatusChip·TypeIcon', () => {
  seen(/<p class="kicker">최근 올라온 자료<\/p>/);
  seen(/<p id="numbered" class="kicker"><span class="kicker-no">02<\/span>전개<\/p>/);
  seen(/<p class="band">사실마다 공개 출처를 붙이고, <strong[^>]*>교사가 승인한 차시만<\/strong> 공개합니다\.<\/p>/);
  const chips = [...html.slice(html.indexOf('id="chips"')).matchAll(/data-state="(\w+)">([^<]+)</g)].slice(0, 7).map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(chips, ['published:공개', 'draft:초안', 'planned:준비 중', 'new:새 자료', 'fix:고침', 'notice:알림', 'draft:초안 5차시']);
  // 선 그림은 열 가지 모두, 화면 읽기 프로그램에는 숨긴다
  const icons = html.slice(html.indexOf('id="icons"'), html.indexOf('id="cards"'));
  assert.deepEqual([...icons.matchAll(/data-kind="(\w+)"/g)].map((m) => m[1]), [...KIND_ORDER]);
  for (const svg of html.match(/<svg class="type-icon[^>]*>/g) ?? []) assert.match(svg, /aria-hidden="true"/);
});

test('부품의 모양: 그림자·그러데이션·이모지·바깥 주소가 없고, 색은 tokens.css 의 변수만 쓴다 (R53)', () => {
  const files = [...fs.readdirSync(UI_DIR).map((f) => path.join(UI_DIR, f)), path.join(c.ROOT, 'src', 'components', 'site', 'collect.ts')];
  const tokens = fs.readFileSync(path.join(c.ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const name = path.relative(c.ROOT, f);
    assert.doesNotMatch(text, /box-shadow|drop-shadow|text-shadow|gradient\(/, name);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, name);
    assert.doesNotMatch(text.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /https?:\/\//, name);
    // 색: #값을 새로 적지 않고 var(--…) 로. 쓰는 변수는 tokens.css 에 있다
    const style = text.slice(text.indexOf('<style'));
    if (text.includes('<style')) {
      assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${name}: 색을 tokens.css 의 변수로 씁니다`);
      for (const [, v] of style.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(tokens.includes(`${v}:`), `${name}: tokens.css 에 없는 변수 ${v}`);
    }
  }
});

// ── 브라우저에서 ──

async function serve(): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    let file = path.join(OUT, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    if (!file.startsWith(OUT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

test('담기: 누르면 aria-pressed 와 담은 수가 바뀌고, 다시 열어도 남는다. 같은 자료의 카드는 함께 바뀐다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.origin}/ui/`);
    const key = '5-2/1/01#slides';
    const buttons = page.locator(`[data-collect="${key}"]`);
    assert.equal(await buttons.count(), 2);
    // 저장소를 쓸 수 있으니 단추가 드러난다. 아직 아무것도 담지 않았다
    assert.equal(await page.locator('[data-collect][hidden]').count(), 0);
    assert.equal(await page.locator('[data-collect-count]').textContent(), '0');
    // 담기 전에는 저장소에 아무것도 남기지 않는다
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await buttons.first().click();
    assert.deepEqual(await buttons.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-pressed'))), ['true', 'true']);
    assert.equal(await page.locator('[data-collect-count]').textContent(), '1');
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY), JSON.stringify([key]));
    // 키보드로: 앞 카드의 마지막 단추에서 Tab 으로 다음 카드의 담기에 가서 Space. 초점 표시가 보인다
    const quiz = page.locator('#cards [data-collect="5-2/1/01#quiz"]');
    await page.locator('#cards [data-key="5-2/1/01#worksheet"] .rc-actions a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await quiz.evaluate((b) => b === document.activeElement && b.matches(':focus-visible')), true);
    assert.notEqual(await quiz.evaluate((b) => getComputedStyle(b).outlineStyle), 'none');
    await page.keyboard.press('Space');
    assert.equal(await quiz.getAttribute('aria-pressed'), 'true');
    // 다시 열어도 남는다
    await page.reload();
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => (b as HTMLElement).dataset.collect)), [key, '5-2/1/01#quiz', key, '5-2/1/01#quiz']);
    assert.equal(await page.locator('[data-collect-count]').textContent(), '2');
    // 다시 누르면 뺀다
    await buttons.last().click();
    assert.deepEqual(await buttons.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-pressed'))), ['false', 'false']);
    assert.equal(await page.locator('[data-collect-count]').textContent(), '1');
    // 다른 탭에서 바꾸면 이 탭도 따라온다 (storage 이벤트)
    const other = await context.newPage();
    await other.goto(`${site.origin}/ui/`);
    await other.locator(`[data-collect="${key}"]`).first().click();
    await page.waitForFunction(() => document.querySelector('[data-collect-count]')?.textContent === '2');
    await other.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    site.close();
  }
});

test('QR 창: 누르면 열리고 Esc 로 닫히며 초점이 QR 단추로 돌아온다. 키보드 초점이 보인다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${site.origin}/ui/`);
    const open = page.locator('[popovertarget="qr-5-2-1-01-quiz"]').first();
    await open.focus();
    await page.keyboard.press('Enter');
    const pop = page.locator('#qr-5-2-1-01-quiz');
    assert.equal(await pop.evaluate((p) => p.matches(':popover-open')), true);
    // 창 안의 닫기 단추에 초점이 가고, 초점 표시가 보인다
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('rc-pop-close')), true);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle), 'none');
    await page.keyboard.press('Escape');
    assert.equal(await pop.evaluate((p) => p.matches(':popover-open')), false);
    assert.equal(await open.evaluate((b) => b === document.activeElement), true);
    // 바깥을 누르면 닫힌다
    await open.click();
    assert.equal(await pop.evaluate((p) => p.matches(':popover-open')), true);
    await page.mouse.click(5, 5);
    assert.equal(await pop.evaluate((p) => p.matches(':popover-open')), false);
  } finally {
    await browser.close();
    site.close();
  }
});

test('저장소가 막힌 브라우저: 오류 없이 담기 단추를 숨기고 담은 수는 0', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘', 'SecurityError'); } });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.origin}/ui/`);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('[data-collect]:not([hidden])').count(), 0);
    assert.equal(await page.locator('[data-collect-count]').textContent(), '0');
    // 나머지는 그대로 쓴다
    assert.ok(await page.locator('.rc-open').first().isVisible());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    site.close();
  }
});

test('좁은 화면: 320px 에서 가로 스크롤이 없고, 휴대폰에서 누를 자리는 44px 이상이다. 미리보기 그림이 없으면 선 그림이 보인다', { skip }, async () => {
  const { chromium } = await import('playwright');
  const site = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const width of [320, 360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 740 } });
      await page.goto(`${site.origin}/ui/`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 에서 가로 스크롤이 생깁니다`);
      // 휴대폰에서는 미리보기를 왼쪽에 작게 둔다
      assert.equal(await page.locator('.rc').first().evaluate((el) => getComputedStyle(el).display), 'grid');
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rc-open, .rc-btn')]
        .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent));
      assert.deepEqual(small, [], `${width}px`);
      // 담기는 보이는 크기가 작아도 위아래 6px 까지 눌린다
      const hits = await page.evaluate(() => {
        const b = document.querySelector<HTMLElement>('.rc-collect')!;
        const r = b.getBoundingClientRect();
        return [r.top - 5, r.bottom + 5].map((y) => document.elementFromPoint(r.left + r.width / 2, y) === b);
      });
      assert.deepEqual(hits, [true, true], `${width}px`);
      // 시험 빌드에는 미리보기 그림 파일이 없다: 그림을 지우고 선 그림을 보인다
      await page.waitForFunction(() => document.querySelector('.rc')?.querySelector('img') === null);
      assert.ok(await page.locator('.rc-icon').first().isVisible());
      await page.close();
    }
  } finally {
    await browser.close();
    site.close();
  }
});
