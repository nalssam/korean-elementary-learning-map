// 사이트의 틀(머리·휴대폰 메뉴·바닥글)과 첫 화면·소개·이용 조건·오류 제보·404 를 시험용 명세로 빌드해 본다 (R40~R43, R51, R53, R54, R58).
// 미리 보기 빌드와 공개 빌드(시험용 묶음은 모두 초안이라 아무것도 실리지 않는다)를 .cache/tests/shell-<pid>/ 아래에 만들고 끝나면 지운다.
// HTML 을 읽어 보는 시험과, Chromium 으로 열어 보는 시험(좁은 화면, 키보드, 스크립트 없이, 막힌 저장소)이 있다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_LABEL, FOOT_LINKS, KIND_ORDER, NAV, NAV_TOOLS, SITE, UPDATE_LABEL } from '#lib/site.ts';
import { STORAGE_KEY } from '#src/components/site/collect.ts';
import { FIXTURES, buildSite, noChromium } from '../contract/helpers.ts';

const OUT = path.join(c.ROOT, '.cache', 'tests', `shell-${process.pid}`);
// 시험을 모두 적은 뒤에 기다리면 그 사이에 앞의 시험과 after() 가 먼저 돈다. 기다릴 것은 맨 위에서 기다린다.
const skip = await noChromium();
let drafts = '';
let pub = '';
before(() => {
  drafts = buildSite(path.join(OUT, 'drafts'), { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' });
  pub = buildSite(path.join(OUT, 'public'), { CONTENT_DIR: FIXTURES, SITE_URL: 'https://example.org', SITE_BASE: '/sub' });
});
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

// 범위를 가둔 스타일이 붙이는 data-astro-cid-… 를 걷어 내고 읽는다
const read = (out: string, page: string) => fs.readFileSync(path.join(out, page), 'utf8').replace(/\s+data-astro-cid-[a-z0-9]+(="")?/g, '');
const text = (html: string) => html.replace(/<[^>]+>/g, '');
const SHELL_PAGES = ['index.html', 'about/index.html', 'licence/index.html', 'report/index.html', '404.html'];

/** 미리 보기 빌드의 셈. 시험용 명세로 도우미를 부른다. */
function withFixtures<T>(fn: () => T, drafts = true): T {
  process.env.CONTENT_DIR = FIXTURES;
  if (drafts) process.env.SHOW_DRAFTS = '1';
  try { return fn(); } finally { delete process.env.CONTENT_DIR; delete process.env.SHOW_DRAFTS; }
}

test('머리: 두 줄 이름표, 길잡이(NAV 차례), 찾기와 내 자료함, 학기 여덟 개를 펼치는 판', () => {
  const home = read(drafts, 'index.html');
  const head = home.slice(home.indexOf('<header class="hd"'), home.indexOf('</header>'));
  assert.match(head, new RegExp(`<a class="hd-lockup" href="/" aria-current="page">.*<span class="hd-lead">${SITE.nameLead}</span> <span class="hd-short">${SITE.shortName}</span>`, 's'));
  // 길잡이는 NAV 의 차례 그대로. 첫째(교과서 자료)는 펼치는 판이다.
  const nav = head.slice(head.indexOf('<nav class="hd-nav"'), head.indexOf('</nav>'));
  const labels = [...nav.matchAll(/<(?:a|summary) class="hd-link"[^>]*>\s*([^<]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(labels, NAV.map((n) => n.label));
  for (const n of NAV) if ('route' in n) assert.ok(nav.includes(`href="${n.route}"`), n.label);
  assert.match(nav, /<details class="hd-drop" data-menu><summary class="hd-link">/);
  // 학기 여덟 개: 차시표가 있는 학기만 링크. 나머지는 '차시표 준비 중' (첫 화면의 학기 타일과 같은 말)
  const sems = [...nav.matchAll(/class="hd-sem( is-off)?"[^>]*>(?:<span class="hd-sem-name">)([^<]+)<\/span><span class="hd-sem-state">([^<]+)/g)];
  assert.deepEqual(sems.map((m) => m[2]), ['3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2'].map(c.semesterLabel));
  assert.deepEqual(sems.filter((m) => !m[1]).map((m) => m[2]), ['5학년 2학기']);
  assert.ok(sems.filter((m) => m[1]).every((m) => m[3] === '차시표 준비 중'));
  assert.ok(nav.includes('<span class="hd-sem-state">0/6 차시 공개</span><span class="hd-sem-draft">초안 5차시</span>'));
  // 오른쪽 단추: 찾기는 첫 화면의 찾기 자리로, 내 자료함에는 담은 수(처음에는 0 이라 숨는다)
  assert.match(head, new RegExp(`<a class="hd-tool" href="${NAV_TOOLS.search.route}" data-find-link>`));
  assert.match(head, new RegExp(`<a class="hd-tool hd-tool-my" href="${NAV_TOOLS.my.route}">.*?<span data-collect-count data-count="0">0</span>`, 's'));
  // 휴대폰 메뉴: <details> 하나에 같은 링크
  const sheet = head.slice(head.indexOf('<details class="hd-menu" data-menu>'));
  for (const n of NAV) if ('route' in n) assert.ok(sheet.includes(`href="${n.route}"`), `메뉴에 ${n.label}`);
  assert.ok(sheet.includes(`href="${NAV_TOOLS.my.route}"`));
  // 이용 조건과 오류 제보는 머리에 없다 (바닥글로 갔다)
  assert.ok(!head.includes('href="/licence/"') && !head.includes('href="/report/"'));
});

test('머리: 지금 페이지에 aria-current', () => {
  const about = read(drafts, 'about/index.html');
  assert.match(about, /<a class="hd-link" href="\/about\/" aria-current="page">소개<\/a>/);
  assert.ok(!/<a class="hd-lockup"[^>]*aria-current/.test(about));
  // 교과서 목차는 그 학기에 'page', 그 아래 페이지(단원·차시)에서는 'true'
  assert.match(read(drafts, '5-2/index.html'), /<a class="hd-sem" href="\/5-2\/" aria-current="page">/);
  assert.match(read(drafts, '5-2/1/01/index.html'), /<a class="hd-sem" href="\/5-2\/" aria-current="true">/);
  // 바닥글의 링크도
  assert.match(read(drafts, 'licence/index.html'), /<ul class="ft-links">.*<a href="\/licence\/" aria-current="page">이용 조건<\/a>/s);
});

test('바닥글: 링크 · 이용 조건 · 만든 이, 맨 아래 작은 줄은 하나', () => {
  for (const page of SHELL_PAGES) {
    const html = read(drafts, page);
    const foot = html.slice(html.indexOf('<footer class="ft"'), html.indexOf('</footer>'));
    const links = [...foot.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[2]);
    assert.deepEqual(links, FOOT_LINKS.map((l) => l.label), page);
    const order = ['class="ft-links"', `${SITE.licence.name}</a> 조건으로 쓸 수 있습니다. ${SITE.licenceNote}`, `만든 이 ${SITE.author} · ${SITE.name}`].map((s) => foot.indexOf(s));
    assert.ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), `${page} 바닥글의 차례: ${order}`);
    // footerNotice() 는 Base.astro 가 바닥글 뒤에 한 번만 찍는다
    assert.equal(html.match(/class="site-notice"/g)?.length, 1, page);
    assert.ok(html.indexOf('class="site-notice"') > html.indexOf('</footer>'), page);
    assert.ok(!html.includes('날쌤 초등사회'), `${page} 에 옛 이름이 남았습니다`);
  }
  // 차시 자료실에서는 오류 제보에 차시 id 를 붙인다
  const kit = read(drafts, '5-2/1/01/index.html');
  assert.ok(kit.includes('<li><a href="/report/?id=5-2/1/01">오류 제보</a></li>'));
});

test('첫 화면: R43 의 차례와 세는 값 (미리 보기)', () => {
  const home = read(drafts, 'index.html');
  const at = (s: string) => { const i = home.indexOf(s); assert.ok(i > 0, `첫 화면에 없습니다: ${s}`); return i; };
  // ① 머리글과 찾기 ② 학년·학기 ③ 자료 유형 ④ 최근 올라온 자료 ⑤ 제작 현황 ⑥ 이렇게 만듭니다
  const order = ['id="hero-title"', 'id="find"', 'id="sems-title"', 'id="kinds-title"', 'id="news-title"', 'id="status-title"', 'id="ways-title"'].map(at);
  assert.ok(order.every((n, i) => i === 0 || n > order[i - 1]), `첫 화면의 차례: ${order}`);
  assert.match(home, new RegExp(`<p class="kicker">${SITE.name}</p>`));
  assert.ok(text(home.slice(at('id="hero-title"'), home.indexOf('</h1>'))).includes(SITE.tagline));
  // 찾기 둘이 한 카드(id="find")에
  const find = home.slice(at('id="find"'), at('id="sems-title"'));
  assert.ok(find.includes('<lesson-finder class="lookup"') && /<site-search class="lookup lookup-search" hidden/.test(find));
  // 학기 타일 여덟: 5-2 만 링크, 차시를 센다 (1 + 2 + 1 + 1 + 1 = 6차시), 초안 표
  const tiles = home.slice(at('<ul class="st-list">'), home.indexOf('</ul>', at('<ul class="st-list">')));
  assert.equal(tiles.match(/<li>/g)?.length, 8);
  assert.equal(tiles.match(/class="st is-off"/g)?.length, 7);
  assert.equal(tiles.match(/차시표 준비 중/g)?.length, 7);
  assert.ok(tiles.includes('<a class="st" href="/5-2/">') && tiles.includes('0/6 차시 공개') && tiles.includes('>초안 5차시<'));
  assert.equal(tiles.match(/비상교육|시험용 출판사\(시험용 저자\) 교과서/g)?.length, 8);
  // 자료 유형: KIND_ORDER 차례, 수는 catalog() 에서
  const items = withFixtures(() => c.catalog());
  const kinds = [...home.matchAll(/class="kt( is-off)?"[^>]*data-kind="([a-z_0-9]+)">.*?<span class="kt-count">([^<]+)</gs)];
  assert.deepEqual(kinds.map((m) => m[2]), [...KIND_ORDER]);
  for (const m of kinds) {
    const n = items.filter((i) => i.kind === m[2]).length;
    assert.equal(m[3], n ? `${n}개` : '준비 중', ASSET_LABEL[m[2] as keyof typeof ASSET_LABEL]);
    assert.equal(!m[1], n > 0, `${m[2]}: 실린 자료가 있을 때만 링크`);
    if (n) assert.ok(home.includes(`href="/types/#${m[2]}"`));
  }
  // 최근 올라온 자료: visibleUpdates() 의 앞 넷, 갈래 표와 초안 표
  const ups = withFixtures(() => c.visibleUpdates()).slice(0, 4);
  const news = [...home.matchAll(/<li class="hm-news-item">(.*?)<\/li>/gs)].map((m) => m[1]);
  assert.equal(news.length, ups.length);
  ups.forEach((u, i) => {
    assert.ok(text(news[i]).includes(u.title), u.title);
    assert.match(news[i], new RegExp(`data-state="${u.kind}"( data-tone="quiet")?>${UPDATE_LABEL[u.kind]}<`), u.title);
    // 산호색 '새 자료'는 가장 최근의 새 자료 하나에만
    if (u.kind === 'new') assert.equal(news[i].includes('data-tone="quiet"'), u !== ups.find((x) => x.kind === 'new'), u.title);
    assert.equal(news[i].includes('data-state="draft"'), u.draft, u.title);
  });
  // 제작 현황 요약: 여덟 학기를 더한 값, 초안은 미리 보기에서만
  const status = text(home.slice(at('id="status-title"'), at('id="ways-title"')));
  // 큰 숫자는 공개한 차시 (차시표에 오른 수가 '만든 차시'로 읽히지 않게)
  assert.ok(status.includes('지금까지 공개한 차시') && status.includes('0 / 6차시 공개') && status.includes('공개0차시') && status.includes('초안5차시') && status.includes('준비 중1차시'), status);
  assert.ok(status.includes('학기 8개 가운데 1개 학기의 차시표가 있습니다.'));
  // 이렇게 만듭니다: 납작한 카드 넷, 민트 띠는 페이지에 하나
  assert.equal(home.match(/<li class="hm-way">/g)?.length, 4);
  assert.equal(home.match(/<p class="band">/g)?.length, 1);
  const ways = text(home.slice(at('id="ways-title"')));
  for (const fact of ['두 확인자가 사실과 출처를 따로 대조합니다. 확인자는 AI 검증자일 수 있습니다.', '날쌤이 끝까지 읽고 승인해야 공개합니다.', '단원명, 차시 번호, 쪽수만 가져옵니다.', SITE.licence.name]) {
    assert.ok(ways.includes(fact), fact);
  }
  // 공개한 차시가 없으면 머리글 아래에 그렇다고 한 줄 (시험용 명세는 모두 초안)
  assert.ok(text(home).includes('아직 공개한 차시가 없습니다. 첫 차시를 검수하고 있고, 공개하면 업데이트에 알립니다.'));
  // 낱말 찾기의 보기 낱말은 실린 첫 차시의 첫 새 낱말 (찾으면 나오는 낱말)
  const term = withFixtures(() => c.visibleLessons()[0].terms.new[0].term);
  assert.ok(home.includes(`placeholder="예: ${term}"`), term);
  assert.ok(!/<site-search[^>]*data-none/.test(home));
  // 검색 색인에는 머리글만. 나머지 자리는 색인에서 뺀다
  assert.equal(home.match(/<section class="hm-sec"[^>]*data-pagefind-ignore/g)?.length, 3);
  assert.match(home, /<div class="hm-pair" data-pagefind-ignore>/);
  // 이모지를 쓰지 않는다
  assert.ok(!/\p{Extended_Pictographic}/u.test(text(home).replace(/[©®™]/g, '')));
});

test('첫 화면: 공개 빌드에서는 아무것도 실리지 않았다고 정직하게 보여 준다', () => {
  const home = read(pub, 'index.html');
  assert.ok(home.includes('0/6 차시 공개') && !home.includes('초안 5차시'));
  // 자료 유형은 모두 '준비 중', 링크 없이
  assert.equal(home.match(/<span class="kt-count">준비 중<\/span>/g)?.length, KIND_ORDER.length);
  assert.ok(!home.includes('/types/#'));
  // 차시를 가리키는 소식은 그 차시가 실리지 않아 빠진다 (가리키지 않는 소식만 남는다)
  const ups = withFixtures(() => c.visibleUpdates(), false);
  assert.ok(ups.every((u) => !u.lessons));
  assert.deepEqual([...home.matchAll(/<h3 class="hm-news-title">([^<]+)<\/h3>/g)].map((m) => m[1]), ups.slice(0, 4).map((u) => u.title));
  assert.ok(!home.includes('data-state="draft"'));
  // 초안은 세지 않는다
  const status = text(home.slice(home.indexOf('id="status-title"'), home.indexOf('id="ways-title"')));
  assert.ok(!status.includes('초안') && status.includes('준비 중6차시') && status.includes('0 / 6차시 공개'), status);
  // 실린 차시가 없다: 머리글 아래의 한 줄, 낱말 찾기는 보기 낱말 없이 '아직 공개한 차시가 없습니다'로 답한다
  assert.ok(text(home).includes('아직 공개한 차시가 없습니다.'));
  assert.match(home, /<site-search class="lookup lookup-search" hidden[^>]*\sdata-none/);
  assert.ok(!/data-search-input[^>]*placeholder|placeholder="예:[^"]*"[^>]*data-search-input/.test(home));
  // 하위 경로에 놓여도 링크가 맞다
  assert.ok(home.includes('href="/sub/about/"') && home.includes('href="/sub/#find"') && home.includes('href="/sub/my/"'));
  assert.ok(home.includes(`<p class="site-notice">${SITE.siteNotice}</p>`));
});

test('소개: 만드는 법은 12절 그대로, 내 자료함은 이 브라우저에만', () => {
  const about = text(read(drafts, 'about/index.html'));
  assert.ok(about.includes('초안은 AI 도구로 만듭니다.'));
  assert.ok(about.includes('사실마다 두 확인자가 출처와 맞는지 따로 봅니다. 확인자는 AI일 수도 있습니다.'));
  assert.ok(about.includes(`${SITE.author}이 차시 전체를 직접 읽고 승인하면 공개합니다.`));
  assert.ok(about.includes('사실 대조, 베끼기 검사, 문장 다듬기, 화면·인쇄 점검을 거칩니다.'));
  assert.ok(about.includes('내 자료함에 담은 목록은 이 브라우저의 저장 공간(localStorage)에만 남고 사이트 밖으로 보내지 않습니다.'));
  assert.ok(about.includes('답을 기기에 저장하거나 다른 곳으로 보내지 않습니다.'));
  // 늘어나는 방식: 업데이트와 제작 현황을 가리키고, 날짜를 약속하지 않는다
  const html = read(drafts, 'about/index.html');
  assert.ok(html.includes('href="/updates/"') && html.includes('href="/status/"'));
  assert.ok(about.includes('약속하지 않습니다'));
  // 만드는 차례에만 번호 머리말이 붙는다 (01~06)
  assert.deepEqual([...html.matchAll(/<span class="kicker-no">(\d\d)<\/span>/g)].map((m) => m[1]), ['01', '02', '03', '04', '05', '06']);
  assert.equal(html.match(/<p class="band">/g)?.length, 1);
  // 이용 조건의 출처 본보기는 새 이름
  assert.ok(read(drafts, 'licence/index.html').includes(`${SITE.author}, ${SITE.name} (`));
});

test('틀이 그리는 링크가 모두 빌드에 있다', () => {
  // 다른 담당이 만드는 페이지(자료 유형별·업데이트·제작 현황·내 자료함)는 그 페이지의 파일이 이 가지에 있을 때만 본다.
  const later = Object.entries({ '/types/': 'types.astro', '/updates/': 'updates.astro', '/status/': 'status.astro', '/my/': 'my.astro' })
    .filter(([, f]) => !fs.existsSync(path.join(c.ROOT, 'src', 'pages', f))).map(([r]) => r);
  for (const page of [...SHELL_PAGES, '5-2/index.html', '5-2/1/01/index.html']) {
    const html = read(drafts, page);
    for (const m of html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const route = m[1];
      if (later.includes(route) || route.startsWith('/files/')) continue;
      const file = route.endsWith('/') ? path.join(drafts, route, 'index.html') : path.join(drafts, route);
      assert.ok(fs.existsSync(file), `${page}: ${route} 가 빌드에 없습니다`);
    }
  }
});

// ───────────── Chromium ─────────────

async function serve(dir: string, base = ''): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (base && url.startsWith(base)) url = url.slice(base.length);
    let file = path.join(dir, url);
    if (file.endsWith(path.sep) || file.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

async function open() {
  const { chromium } = await import('playwright');
  const server = await serve(drafts);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  return { browser, origin: server.origin, close: async () => { await browser.close(); server.close(); } };
}
const PAGES = ['/', '/about/', '/licence/', '/report/', '/404.html', '/5-2/', '/5-2/1/01/'];

test('가로 스크롤이 없고, 머리는 한 줄이다 (1280·768·390·360·320px, 메뉴를 연 채로도)', { skip }, async () => {
  const { browser, origin, close } = await open();
  const problems: string[] = [];
  try {
    for (const width of [1280, 768, 390, 360, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      for (const url of PAGES) {
        await page.goto(origin + url);
        const m = await page.evaluate(() => {
          const box = (s: string) => document.querySelector(s)?.getBoundingClientRect();
          const lock = box('.hd-lockup');
          const tools = box('.hd-tools');
          return { sw: document.documentElement.scrollWidth, lockTop: lock?.top ?? -1, lockBottom: lock?.bottom ?? -1, toolsTop: tools?.top ?? -1, toolsRight: tools?.right ?? 0 };
        });
        if (m.sw > width) problems.push(`${width}px ${url}: 가로로 ${m.sw}px`);
        // 이름표와 오른쪽 단추가 한 줄에 (단추가 이름표 아래로 밀리지 않는다)
        if (m.toolsTop >= m.lockBottom) problems.push(`${width}px ${url}: 단추가 이름표 아래로 내려갔습니다`);
        if (m.toolsRight > width) problems.push(`${width}px ${url}: 단추가 화면 밖으로 나갔습니다`);
      }
      if (width < 760) {
        await page.goto(origin + '/');
        await page.click('.hd-menu > summary');
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > width) problems.push(`${width}px 메뉴를 연 채로 가로로 ${sw}px`);
      }
      await page.close();
    }
    assert.deepEqual(problems, []);
  } finally {
    await close();
  }
});

test('휴대폰: 누르는 자리는 44px 이상 (머리의 단추, 메뉴의 링크, 바닥글)', { skip }, async () => {
  const { browser, origin, close } = await open();
  try {
    for (const width of [390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(origin + '/about/');
      await page.click('.hd-menu > summary');
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hd-tool, .hd-sheet a, .hd-sheet .hd-sem, .ft-links a')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ what: `${el.className} ${el.textContent?.trim()}`, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
        .filter((r) => r.h < 44 || r.w < 44));
      assert.deepEqual(small, [], `${width}px`);
      await page.close();
    }
  } finally {
    await close();
  }
});

test('메뉴는 키보드로 열고 닫는다: Enter 로 열고, Esc 로 닫으면 초점이 단추로 돌아온다 (휴대폰 메뉴, 교과서 자료 판)', { skip }, async () => {
  const { browser, origin, close } = await open();
  try {
    for (const [width, sel] of [[390, '.hd-menu'], [1280, '.hd-drop']] as const) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(origin + '/about/');
      await page.focus(`${sel} > summary`);
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval(sel, (d) => (d as HTMLDetailsElement).open), true, `${width}px 열림`);
      // 판 안의 첫 링크로 Tab
      await page.keyboard.press('Tab');
      const inside = await page.evaluate((s) => !!document.activeElement?.closest(s), sel);
      assert.ok(inside, `${width}px Tab 이 판 안으로 갑니다`);
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval(sel, (d) => (d as HTMLDetailsElement).open), false, `${width}px Esc 로 닫힘`);
      assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(`${s} > summary`), sel), true, `${width}px 초점이 단추로`);
      // 바깥을 누르면 닫힌다
      await page.click(`${sel} > summary`);
      await page.mouse.click(5, 790);
      assert.equal(await page.$eval(sel, (d) => (d as HTMLDetailsElement).open), false, `${width}px 바깥 누르기로 닫힘`);
      await page.close();
    }
  } finally {
    await close();
  }
});

test('스크립트 없이도 메뉴가 열리고, 링크와 읽기가 된다', { skip }, async () => {
  const { browser, origin, close } = await open();
  try {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(origin + '/');
    await page.click('.hd-menu > summary');
    assert.ok(await page.isVisible('.hd-sheet a[href="/about/"]'));
    assert.ok(await page.isVisible('.hd-sheet a.hd-sem[href="/5-2/"]'));
    // 담은 수는 스크립트가 없으면 0 으로 숨은 채다
    assert.equal(await page.isVisible('.hd-menu [data-collect-count]'), false);
    await page.goto(origin + '/about/');
    assert.ok(await page.isVisible('h1'));
    await ctx.close();
  } finally {
    await close();
  }
});

test('찾기: 첫 화면에서는 찾기 칸으로 초점을 옮기고, 다른 페이지에서는 첫 화면의 찾기로 간다', { skip }, async () => {
  const { browser, origin, close } = await open();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(origin + '/');
      await page.click('[data-find-link]');
      // 이 시험의 빌드에는 검색 색인(pagefind)이 없어 낱말 찾기가 숨어 있다. 쪽수·차시 칸으로 간다.
      assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-finder-input')), true, `${width}px 첫 화면`);
      assert.equal(new URL(page.url()).pathname, '/');
      await page.goto(origin + '/about/');
      await Promise.all([page.waitForURL(/\/#find$/), page.click('[data-find-link]')]);
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-finder-input'), null, { timeout: 3000 });
      await page.close();
    }
  } finally {
    await close();
  }
});

test('내 자료함의 담은 수: 담긴 것이 있으면 머리에 보이고, 저장소가 막혀도 페이지가 그대로 돈다', { skip }, async () => {
  const { browser, origin, close } = await open();
  try {
    // 담긴 것이 둘
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(([key]) => { localStorage.setItem(key, JSON.stringify(['5-2/1/01#slides', '5-2/1/01#worksheet'])); }, [STORAGE_KEY]);
    const page = await ctx.newPage();
    await page.goto(origin + '/about/');
    assert.equal(await page.textContent('.hd-tool-my [data-collect-count]'), '2');
    assert.ok(await page.isVisible('.hd-tool-my .hd-count'));
    await page.setViewportSize({ width: 390, height: 800 });
    assert.ok(await page.isVisible('.hd-menu > summary .hd-count'), '휴대폰에서는 메뉴 단추에 담은 수');
    await ctx.close();

    // 저장소가 막힌 브라우저 (사생활 보호 창, 막아 둔 사이트 데이터)
    const blocked = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('막힘', 'SecurityError'); } });
    });
    const p = await blocked.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    for (const url of ['/', '/about/', '/5-2/1/01/']) {
      await p.goto(origin + url);
      assert.equal(await p.isVisible('.hd-menu > summary .hd-count'), false, url);
      await p.click('.hd-menu > summary');
      assert.ok(await p.isVisible('.hd-sheet a[href="/my/"]'), url);
    }
    assert.deepEqual(errors, []);
    await blocked.close();
  } finally {
    await close();
  }
});
