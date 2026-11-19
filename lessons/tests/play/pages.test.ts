// 확인 퀴즈와 웹 활동 페이지를 시험용 명세로 빌드해 본다.
// tests/play/fixtures/site 는 저장소의 quiz.astro·play.astro 와 같은 두 페이지만 가진 작은 사이트다 (다른 담당의 페이지와 떼어 빌드한다).
// 시험용 명세를 .cache/tests/play-<pid>/ 에 복사하고, 04 묶음의 웹 활동을 짝 맞추기로 바꿔 네 가지 활동(sort·place·match·order)을 모두 싣는다.
// 앞쪽은 만들어진 HTML 을 읽고, 뒤쪽은 Chromium 으로 아이처럼 눌러 본다 (Chromium 이 없으면 건너뛴다. 16절).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { buildSite, noChromium, tempContent } from '../contract/helpers.ts';

const skip = await noChromium();
const SITE_DIR = path.join(c.ROOT, 'tests', 'play', 'fixtures', 'site');
const tmp = tempContent('play');
const OUT = path.join(path.dirname(tmp.dir), 'site');
after(() => tmp.cleanup());

const SCORED = '5-2/1/01', CARE = '5-2/1/02-03', NOPLAY = '5-2/1/04', ORDER = '5-2/1/05';
const MATCH = [
  { left: '규칙 하나', right: '첫째로 지킬 것' },
  { left: '규칙 둘', right: '둘째로 지킬 것' },
  { left: '규칙 셋', right: '셋째로 지킬 것' },
];

before(() => {
  tmp.edit(NOPLAY, (raw) => {
    raw.assets.web_activity = { state: 'ready', title: '규칙과 차례를 짝지어 봅시다', instructions: '규칙에 알맞은 카드를 빈칸에 놓아 봅시다.', activity: { kind: 'match', pairs: MATCH, facts: ['f1'] } };
  });
  buildSite(OUT, { CONTENT_DIR: tmp.dir, SHOW_DRAFTS: '1' }, { root: SITE_DIR });
  // 그림: 빌드 2단계(scripts/sync-media.mjs)가 하는 일을 여기에서 줄여서 한다 (명세에 적힌 파일만 /media/<id>/ 로)
  for (const id of c.lessonIds()) {
    const lesson = c.loadLesson(id);
    for (const m of lesson.media) {
      const to = path.join(OUT, 'media', ...id.split('/'), path.basename(m.file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(c.lessonDir(id), m.file), to);
    }
  }
});

/** 태그 하나의 속성 (Astro 는 사용자 정의 요소의 속성 차례를 바꿔 찍기도 한다) */
const attrs = (page: string, tag: string): Record<string, string> => {
  const m = page.match(new RegExp(`<${tag}\\b([^>]*)>`));
  assert.ok(m, `<${tag}> 가 없습니다`);
  return Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
};
const html = (page: string) => fs.readFileSync(path.join(OUT, page, 'index.html'), 'utf8');
const pages = () => (fs.readdirSync(OUT, { recursive: true }) as string[]).filter((f) => f.endsWith('index.html')).map((f) => f.split(path.sep).join('/')).sort();

test('주소: 확인 퀴즈는 모든 차시에, 웹 활동은 ready 인 차시에만 생긴다', () => {
  assert.deepEqual(pages(), [SCORED, CARE, NOPLAY, ORDER].flatMap((id) => [`${id}/play/index.html`, `${id}/quiz/index.html`]));
  tmp.edit(ORDER, (raw) => {
    raw.assets.web_activity = { state: 'planned', idea: '시험' };
    for (const step of raw.flow) if (step.uses) step.uses = step.uses.filter((u: string) => u !== 'web_activity');
  });
  try {
    const out = path.join(path.dirname(tmp.dir), 'site-planned');
    buildSite(out, { CONTENT_DIR: tmp.dir, SHOW_DRAFTS: '1' }, { root: SITE_DIR });
    assert.ok(!fs.existsSync(path.join(out, ORDER, 'play')), 'planned 인 웹 활동에 주소가 생겼습니다');
    assert.ok(fs.existsSync(path.join(out, ORDER, 'quiz', 'index.html')));
  } finally {
    tmp.reset();
    tmp.edit(NOPLAY, (raw) => { raw.assets.web_activity = { state: 'ready', title: '규칙과 차례를 짝지어 봅시다', instructions: '규칙에 알맞은 카드를 빈칸에 놓아 봅시다.', activity: { kind: 'match', pairs: MATCH, facts: ['f1'] } }; });
  }
});

test('학생 페이지의 틀: kind=student, 초안 문구, 검색 색인 밖, 사이트 밖 링크·이름 칸·저장소 없음 (9절)', () => {
  const scripts = new Set<string>();
  for (const p of pages()) {
    const page = html(path.dirname(p));
    assert.match(page, /<body data-kind="student" data-draft="true">/, p);
    assert.ok(page.includes('<p class="site-notice">검수 전 초안입니다. 수업에 쓰지 마세요.</p>'), p);
    assert.ok(!page.includes('data-pagefind-body'), p);
    assert.match(page, /<meta name="robots" content="noindex,nofollow">/, p);
    // 사이트 밖으로 나가는 주소가 없다 (링크·그림·스크립트·스타일)
    for (const [, url] of page.matchAll(/\b(?:href|src|action)="([^"]*)"/g)) assert.ok(url.startsWith('/') && !url.startsWith('//'), `${p}: 사이트 밖 주소 ${url}`);
    // 이름·번호를 묻는 칸이 없다. 단답 칸은 이름이 없고 자동 완성을 끈다 (브라우저가 답을 기억하지 않게).
    assert.ok(!/<input[^>]*\bname=/.test(page), `${p}: name 이 붙은 입력 칸`);
    assert.ok(!/이름|번호를/.test(page.replace(/<[^>]+>/g, ' ').replace(/이름표/g, '')), `${p}: 이름·번호를 묻는 글`);
    for (const m of page.matchAll(/<input[^>]*>/g)) assert.match(m[0], /autocomplete="off"/, p);
    // 짧은 스크립트는 HTML 안에 실리고 긴 것은 /_astro/ 파일로 나간다. 둘 다 본다.
    for (const [, src] of page.matchAll(/<script[^>]*src="([^"]+)"/g)) scripts.add(fs.readFileSync(path.join(OUT, src), 'utf8'));
    for (const [, body] of page.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)) scripts.add(body);
    // 스크립트는 </html> 뒤가 아니라 body 안에 있다
    assert.ok(page.trimEnd().endsWith('</html>'), `${p}: </html> 뒤에 무엇이 있습니다`);
  }
  assert.ok([...scripts].some((js) => js.includes('customElements.define')), '브라우저 스크립트가 없습니다');
  // 브라우저 스크립트는 저장하지도 보내지도 않는다
  for (const js of scripts) {
    const src = js.slice(0, 60);
    for (const bad of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'fetch(']) assert.ok(!js.includes(bad), `${src}: ${bad}`);
  }
});

test('확인 퀴즈: 점수는 scored(lesson) 인 차시에만, 두 차시 묶음은 차시를 고르는 화면이 있다', () => {
  const one = html(`${SCORED}/quiz`);
  assert.equal(attrs(one, 'quiz-runner')['data-scored'], 'true');
  assert.match(one, /class="quiz-end-score"/);
  assert.ok(!one.includes('class="quiz-pick"'), '한 차시 묶음에는 고르는 화면이 없다');
  for (const item of c.loadLesson(SCORED).quiz.items) {
    assert.ok(one.includes(`>${item.q}</h2>`), item.q);
    assert.ok(one.includes(`<p class="feedback-explain">${item.explain}</p>`), item.explain);
  }
  // 단답의 accept 는 글로 싣는다 (숫자로 적은 값도)
  assert.ok(one.includes('data-accept="[&quot;1392년&quot;]"'));

  const two = html(`${CARE}/quiz`);
  assert.equal(attrs(two, 'quiz-runner')['data-scored'], 'false');
  assert.doesNotMatch(two, /class="quiz-end-score"/, '점수를 보여 주지 않는 차시에 점수 자리가 있습니다');
  assert.ok(two.includes('class="quiz-pick"'));
  assert.match(two, /data-start="2">.*2차시 문제.*2문제/s);
  assert.match(two, /data-start="3">.*3차시 문제.*2문제/s);
  // 문항 4개 가운데 lesson 을 적지 않은 문항은 마지막 차시(3)의 것이다 (quizByLesson)
  assert.equal([...two.matchAll(/data-group="3"/g)].length, 2);
  assert.doesNotMatch(html(`${NOPLAY}/quiz`), /class="quiz-end-score"/);
  // 웹 활동이 ready 이면 끝 화면에서 그리로 갈 수 있다 (사이트 안 주소)
  assert.ok(one.includes(`href="/${SCORED}/play/"`));
});

test('웹 활동: 네 가지가 모두 그려지고, 카드는 묶음 id 로 정한 차례로 섞인다', () => {
  const sort = html(`${SCORED}/play`);
  assert.deepEqual([attrs(sort, 'play-board')['data-kind'], attrs(sort, 'play-board')['data-scored']], ['sort', 'true']);
  assert.ok(sort.includes('<p class="chip-why" data-why hidden>큰 돌입니다.</p>'), 'why 는 맞게 놓은 뒤에 보인다');
  assert.equal([...sort.matchAll(/class="bin"/g)].length, 2);
  const place = html(`${CARE}/play`);
  assert.deepEqual([attrs(place, 'play-board')['data-kind'], attrs(place, 'play-board')['data-scored']], ['place', 'false']);
  assert.match(place, /<button type="button" class="marker" data-target="0" style="--x:10%;--y:75%"/);
  assert.match(place, /<figure class="media"><img src="\/media\/5-2\/1\/02-03\/map\.svg"/);
  assert.ok(place.includes('media-credit'), '그림 옆에 출처 표시');
  const match = html(`${NOPLAY}/play`);
  assert.deepEqual([attrs(match, 'play-board')['data-kind'], attrs(match, 'play-board')['data-scored']], ['match', 'false']);
  for (const p of MATCH) assert.ok(match.includes(`>${p.left}</p>`) && match.includes(`>${p.right}</button>`));
  const order = html(`${ORDER}/play`);
  assert.equal(attrs(order, 'order-board')['data-scored'], 'true');
  const shown = [...order.matchAll(/<li class="row" data-item="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(shown.length, 12);
  assert.ok(shown.some((v, i) => v !== i), '처음부터 맞는 차례로 나왔습니다');
  // 다시 빌드해도 같은 차례 (빌드마다 화면이 바뀌지 않는다)
  const again = path.join(path.dirname(tmp.dir), 'site-again');
  buildSite(again, { CONTENT_DIR: tmp.dir, SHOW_DRAFTS: '1' }, { root: SITE_DIR });
  assert.equal(fs.readFileSync(path.join(again, ORDER, 'play', 'index.html'), 'utf8').match(/<ol class="order-list"[\s\S]*?<\/ol>/)![0], order.match(/<ol class="order-list"[\s\S]*?<\/ol>/)![0]);
});

// ─────────────── Chromium 으로 눌러 보기 ───────────────

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

/** 저장소·쿠키·보내기를 건드리면 기록한다. 학생 페이지는 아무것도 남기지 않아야 한다 (9절). */
function watchPrivacy() {
  const w = window as unknown as { __touched: string[] };
  w.__touched = [];
  const note = (what: string) => w.__touched.push(what);
  for (const k of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
    const orig = Storage.prototype[k] as (...a: unknown[]) => unknown;
    (Storage.prototype as unknown as Record<string, unknown>)[k] = function (this: Storage, ...a: unknown[]) { note(`Storage.${k}`); return orig.apply(this, a); };
  }
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  Object.defineProperty(document, 'cookie', { get() { note('cookie'); return cookie.get!.call(document); }, set(v) { note('cookie'); cookie.set!.call(document, v); } });
  const open = indexedDB.open.bind(indexedDB);
  indexedDB.open = (...a: Parameters<IDBFactory['open']>) => { note('indexedDB'); return open(...a); };
  const beacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (...a: Parameters<Navigator['sendBeacon']>) => { note('sendBeacon'); return beacon(...a); };
}

test('아이처럼 눌러 보기: 퀴즈·웹 활동 네 가지 (터치, 마우스 끌기, 키보드만)', { skip }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await serve(OUT);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const open = async (url: string, opts: { touch?: boolean; width?: number } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 844 }, hasTouch: !!opts.touch, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.addInitScript(watchPrivacy);
      const outside: string[] = [];
      const errors: string[] = [];
      page.on('request', (r) => { if (!r.url().startsWith(server.origin)) outside.push(r.url()); });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.origin + url);
      const done = async () => {
        assert.deepEqual(await page.evaluate(() => (window as unknown as { __touched: string[] }).__touched), [], `${url}: 저장소·쿠키·보내기를 건드렸습니다`);
        assert.deepEqual(outside, [], `${url}: 사이트 밖 요청`);
        assert.deepEqual(errors, [], `${url}: 스크립트 오류`);
        assert.equal(await page.evaluate(() => document.getAnimations().length), 0, '움직임 줄이기에서 움직이는 것이 있습니다');
        await ctx.close();
      };
      return { page, done };
    };
    const current = '.q.is-current';

    await t.test('점수를 보여 주는 차시의 퀴즈: 틀린 답, 맞은 답, 단답(빈칸 섞임), 끝 화면의 점수 한 줄', async () => {
      const { page, done } = await open(`/${SCORED}/quiz/`, { touch: true });
      assert.equal(await page.locator('.q').filter({ visible: true }).count(), 1, '한 번에 한 문제');
      await page.locator(`${current} .ox-btn[data-value="false"]`).tap();
      const fb = page.locator(`${current} [data-feedback]`);
      assert.equal(await fb.locator('[data-verdict]').textContent(), '다시 살펴봅시다.');
      assert.ok(await fb.locator('[data-correct]').isVisible());
      assert.equal(await page.locator(`${current} .ox-btn[data-value="true"] [data-tag]`).textContent(), '정답');
      assert.equal(await page.locator(`${current} .ox-btn[data-value="false"] [data-tag]`).textContent(), '고른 답');
      assert.ok(await fb.locator('.feedback-explain').isVisible());
      // 한 번 고르면 바꿀 수 없다
      assert.ok(await page.locator(`${current} .ox-btn[data-value="true"]`).isDisabled());
      await page.locator(`${current} [data-next]`).tap();
      await page.locator(`${current} .choice-btn[data-value="1"]`).tap();
      assert.equal(await page.locator(`${current} [data-verdict]`).textContent(), '맞았습니다.');
      assert.ok(!(await page.locator(`${current} [data-correct]`).isVisible()));
      await page.locator(`${current} [data-next]`).tap();
      // 빈 답은 채점하지 않고 알려 준다
      await page.locator(`${current} .short-submit`).tap();
      assert.match(await page.locator(`${current} [data-hint]`).textContent() ?? '', /답을 써 넣은 뒤에/);
      assert.ok(!(await page.locator(`${current} [data-feedback]`).isVisible()));
      await page.locator(`${current} .short-input`).fill(' 13 92 ');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(`${current} [data-verdict]`).textContent(), '맞았습니다.');
      await page.locator(`${current} [data-next]`).tap();
      assert.equal(await page.locator('[data-score]').textContent(), '3문제 가운데 2문제를 맞혔습니다.');
      // 다시 풀면 처음부터
      await page.locator('[data-restart]').tap();
      assert.ok(await page.locator('.q[data-index="0"]').isVisible());
      assert.ok(!(await page.locator(`${current} [data-feedback]`).isVisible()));
      await done();
    });

    await t.test('점수를 보여 주지 않는 차시(care)의 퀴즈: 차시 고르기, 맞고 틀림과 풀이만, 끝 화면에 점수 없음', async () => {
      const { page, done } = await open(`/${CARE}/quiz/`);
      await page.locator('.pick-btn[data-start="3"]').click();
      assert.match(await page.locator(`${current} .q-count`).textContent() ?? '', /3차시/);
      await page.locator(`${current} .short-input`).fill('1392');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(`${current} [data-verdict]`).textContent(), '다시 살펴봅시다.');
      assert.match(await page.locator(`${current} [data-correct]`).textContent() ?? '', /1446/);
      await page.locator(`${current} [data-next]`).click();
      await page.locator(`${current} .ox-btn[data-value="false"]`).click();
      await page.locator(`${current} [data-next]`).click();
      const end = page.locator('[data-screen="end"]');
      assert.ok(await end.isVisible());
      const text = await end.innerText();
      assert.ok(!/맞혔|점|개 가운데/.test(text), `점수를 보여 주지 않는 차시에 점수가 있습니다: ${text}`);
      assert.ok(await page.locator('[data-other][data-start="2"]').isVisible());
      assert.ok(!(await page.locator('[data-other][data-start="3"]').isVisible()), '방금 푼 차시로 가는 단추는 숨긴다');
      await done();
    });

    /** Tab 만 눌러 selector 에 맞는 곳까지 간다 */
    const tabTo = async (page: import('playwright').Page, selector: string) => {
      for (let i = 0; i < 120; i++) {
        if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
        await page.keyboard.press('Tab');
      }
      assert.fail(`Tab 으로 ${selector} 에 가지 못했습니다`);
    };
    const focusVisible = (page: import('playwright').Page) => page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
    });

    await t.test('분류하기를 키보드만으로: 카드 고르기 → 상자 고르기, 확인, 틀린 카드는 돌아오고 맞은 카드에 까닭', async () => {
      const { page, done } = await open(`/${SCORED}/play/`, { width: 1280 });
      const board = page.locator('play-board');
      // 일부러 모두 '돌' 상자에 넣는다
      for (let n = 0; n < 4; n++) {
        await tabTo(page, '.tray .chip-btn');
        assert.ok(await focusVisible(page), '초점 표시가 보이지 않습니다');
        await page.keyboard.press('Enter');
        assert.ok(await board.locator('[data-pickbar]').isVisible());
        await tabTo(page, '.bin-btn[data-target="stone"]');
        await page.keyboard.press('Enter');
      }
      await tabTo(page, '[data-check]');
      await page.keyboard.press('Enter');
      assert.match(await board.locator('[data-status]').textContent() ?? '', /^4개 가운데 2개가 맞았습니다\./);
      assert.equal(await board.locator('.tray .chip.is-again').count(), 2);
      assert.ok(await board.locator('.chip.is-ok', { hasText: '바위' }).locator('[data-why]').isVisible());
      // 남은 둘을 알맞은 상자로 (Esc 로 한 번 취소도 해 본다)
      await tabTo(page, '.tray .chip-btn');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      assert.ok(!(await board.locator('[data-pickbar]').isVisible()));
      for (let n = 0; n < 2; n++) {
        await tabTo(page, '.tray .chip-btn');
        await page.keyboard.press('Enter');
        await tabTo(page, '.bin-btn[data-target="other"]');
        await page.keyboard.press('Enter');
      }
      await tabTo(page, '[data-check]');
      await page.keyboard.press('Enter');
      assert.equal(await board.locator('[data-status]').textContent(), '모두 알맞게 놓았습니다.');
      await tabTo(page, '[data-again]');
      await page.keyboard.press('Enter');
      assert.equal(await board.locator('.tray .chip').count(), 4);
      await done();
    });

    await t.test('그림에 이름표 놓기를 손가락으로 (care): 바꿔 놓기, 확인, 점수 없이 표시만', async () => {
      const { page, done } = await open(`/${CARE}/play/`, { touch: true, width: 360 });
      assert.ok(await page.locator('[data-layer]').isVisible(), '그림 위 번호 판이 그림에 맞춰지지 않았습니다');
      // 번호 판이 그림과 겹친다
      const [img, layer] = await Promise.all([page.locator('.place-pic img').boundingBox(), page.locator('[data-layer]').boundingBox()]);
      assert.ok(img && layer && Math.abs(img.x - layer.x) < 1 && Math.abs(img.width - layer.width) < 1 && Math.abs(img.height - layer.height) < 1);
      // 1번 자리(x 10%, y 75%)가 그림의 그 자리에 있다
      const m = (await page.locator('.marker[data-target="0"]').boundingBox())!;
      assert.ok(Math.abs(m.x + m.width / 2 - (img!.x + img!.width * 0.1)) < 2 && Math.abs(m.y + m.height / 2 - (img!.y + img!.height * 0.75)) < 2);
      // 일부러 거꾸로 놓는다
      await page.locator('.chip', { hasText: '시작하는 곳' }).locator('.chip-btn').tap();
      await page.locator('.marker[data-target="1"]').tap();
      await page.locator('.chip', { hasText: '끝나는 곳' }).locator('.chip-btn').tap();
      await page.locator('.marker[data-target="0"]').tap();
      assert.equal(await page.locator('.marker[data-target="0"]').getAttribute('aria-label'), '1번 자리: 끝나는 곳');
      await page.locator('[data-check]').tap();
      const status = await page.locator('[data-status]').textContent() ?? '';
      assert.ok(!/가운데/.test(status), `점수를 보여 주지 않는 차시에 점수가 있습니다: ${status}`);
      assert.equal(await page.locator('.tray .chip.is-again').count(), 2);
      // 번호를 눌러 놓아도 되고, 아래 빈칸을 눌러 놓아도 된다
      await page.locator('.chip', { hasText: '시작하는 곳' }).locator('.chip-btn').tap();
      await page.locator('.marker[data-target="0"]').tap();
      await page.locator('.chip', { hasText: '끝나는 곳' }).locator('.chip-btn').tap();
      await page.locator('.slot-empty[data-target="1"]').tap();
      await page.locator('[data-check]').tap();
      assert.equal(await page.locator('[data-status]').textContent(), '모두 알맞게 놓았습니다.');
      assert.ok(await page.locator('.chip', { hasText: '시작하는 곳' }).locator('[data-why]').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), '360px 에서 가로 스크롤');
      await done();
    });

    await t.test('짝 맞추기를 마우스로 끌어 놓기 (no_play): 차 있는 칸에 놓으면 있던 카드가 돌아간다', async () => {
      const { page, done } = await open(`/${NOPLAY}/play/`, { width: 820 });
      const drag = async (text: string, to: string) => {
        const from = (await page.locator('.chip', { hasText: text }).boundingBox())!;
        const target = (await page.locator(to).boundingBox())!;
        await page.mouse.move(from.x + 10, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 40, from.y + 40, { steps: 4 });
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
        await page.mouse.up();
      };
      await drag('둘째로 지킬 것', '.slot[data-target="0"]');
      assert.equal(await page.locator('[data-drop="0"] .chip').textContent().then((s) => s?.trim()), '둘째로 지킬 것');
      // 끌어 놓은 뒤에 고른 상태가 남지 않는다
      assert.ok(!(await page.locator('[data-pickbar]').isVisible()));
      await drag('첫째로 지킬 것', '.slot[data-target="0"]');
      assert.equal(await page.locator('[data-drop="0"] .chip').count(), 1);
      assert.equal(await page.locator('.tray .chip', { hasText: '둘째로 지킬 것' }).count(), 1, '밀려난 카드는 처음 자리로 돌아간다');
      await drag('둘째로 지킬 것', '.slot[data-target="1"]');
      await drag('셋째로 지킬 것', '.slot[data-target="2"]');
      await page.locator('[data-check]').click();
      assert.equal(await page.locator('[data-status]').textContent(), '모두 알맞게 놓았습니다.');
      assert.equal(await page.locator('.chip.is-ok').count(), 3);
      await done();
    });

    await t.test('차례 맞추기를 키보드의 화살표 단추로만: 맞는 차례로 옮기고 확인', async () => {
      const { page, done } = await open(`/${ORDER}/play/`, { width: 820 });
      await page.locator('[data-check]').click();
      assert.match(await page.locator('[data-status]').textContent() ?? '', /^(12개 가운데 [1-9]\d*개가 맞았습니다\.|아직 알맞은 자리에 있는 카드가 없습니다\.)/);
      for (let want = 0; want < 12; want++) {
        const index = () => page.evaluate((k) => [...document.querySelectorAll('.order-list .row')].findIndex((r) => (r as HTMLElement).dataset.item === String(k)), want);
        if ((await index()) === want) continue;
        await tabTo(page, `.row[data-item="${want}"] [data-up]`);
        while ((await index()) > want) await page.keyboard.press('Enter');
      }
      await tabTo(page, '[data-check]');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-status]').textContent(), '모두 알맞은 차례로 놓았습니다.');
      assert.equal(await page.locator('.row.is-ok').count(), 12);
      await done();
    });

    await t.test('휴대폰 폭(360px)에서 가로 스크롤이 없다', async () => {
      for (const p of pages()) {
        const { page, done } = await open(`/${path.dirname(p)}/`, { width: 360 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), `${p}: 가로 스크롤`);
        await done();
      }
    });
  } finally {
    await browser.close();
    server.close();
  }
});
