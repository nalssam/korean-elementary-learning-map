// 함께 쓰는 틀(Base.astro, Media.astro, 인쇄 틀의 뼈대)과 lessonPaths() 를 실제로 빌드해 본다.
// tests/contract/fixtures/site 의 작은 사이트를 시험용 명세로 빌드하고 만들어진 HTML 을 읽는다. 저장소의 src/pages 는 건드리지 않는다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as c from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { FIXTURES, buildSite, passRows, tempContent } from './helpers.ts';

const SITE_DIR = path.join(c.ROOT, 'tests', 'contract', 'fixtures', 'site');
const OUT = path.join(c.ROOT, '.cache', 'tests', `frame-${process.pid}`);
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

const build = (name: string, env: Record<string, string>, extra: string[] = [], root = SITE_DIR): string => buildSite(path.join(OUT, name), env, { root, extra });
const pages = (out: string) => (fs.readdirSync(out, { recursive: true }) as string[]).filter((f) => f.endsWith('index.html')).map((f) => f.split(path.sep).join('/')).sort();
const read = (out: string, page: string) => fs.readFileSync(path.join(out, page), 'utf8');

test('미리 보기 빌드 (SHOW_DRAFTS=1, 하위 경로 없음)', () => {
  const out = build('drafts', { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' });
  // 차시 넷의 안내 페이지와 학생 페이지, 컬러링이 ready 인 차시의 인쇄 페이지 하나
  assert.deepEqual(pages(out), [
    '5-2/1/01/index.html', '5-2/1/01/quiz/index.html',
    '5-2/1/02-03/coloring/index.html', '5-2/1/02-03/index.html', '5-2/1/02-03/quiz/index.html',
    '5-2/1/04/index.html', '5-2/1/04/quiz/index.html',
    '5-2/1/05/index.html', '5-2/1/05/quiz/index.html',
    'index.html',
  ]);
  const home = read(out, 'index.html');
  assert.match(home, /<html lang="ko">/);
  assert.match(home, /<title>시험용 첫 화면 · 날쌤 초등사회<\/title>/);
  assert.match(home, /<p id="bundles">5<\/p>/);
  assert.match(home, /href="\/5-2\/1\/02-03\/"/);
  // 미리 보기 빌드는 통째로 검색에서 뺀다
  for (const p of pages(out)) assert.match(read(out, p), /<meta name="robots" content="noindex,nofollow">/, p);
  // 글꼴과 기준값은 Base 가 싣는다 (외부 주소 없음)
  assert.match(home, /<link rel="stylesheet" href="\/_astro\/[^"]+\.css">/);
  assert.ok(!/https?:\/\/(?!localhost)/.test(home.replace(/<meta[^>]*>/g, '')), '외부 주소가 있습니다');

  // 초안의 맨 아래 문구
  const kit = read(out, '5-2/1/01/index.html');
  assert.match(kit, /<body data-kind="site" data-draft="true">/);
  assert.ok(kit.includes(`<p class="site-notice">${SITE.draftNotice}</p>`));
  assert.ok(!kit.includes(SITE.aiNotice));
  // 차시가 없는 페이지: 초안을 늘어놓고 링크하는 미리 보기에서는 "교사가 검수한 자료"라고 쓰지 않는다
  assert.ok(home.includes(`<p class="site-notice">${SITE.previewNotice}</p>`) && !home.includes(SITE.aiNotice));
  // /published.json 은 공개된 묶음 id 의 JSON 배열이다. 미리 보기 빌드에서도 공개된 것만 나온다 (여기에는 공개된 묶음이 없다).
  assert.deepEqual(JSON.parse(read(out, 'published.json')), []);
  // 그림: 대체 글, 설명, 출처 표시
  assert.match(kit, /<figure class="media"><img src="\/media\/5-2\/1\/01\/stone\.svg" alt="네모난 돌 세 개가 차곡차곡 쌓여 있는 그림" decoding="async">/);
  assert.match(kit, /<span class="media-caption">시험용 돌탑<\/span>/);
  assert.match(kit, /<span class="media-credit">그림: 시험용 그린이<\/span>/);
  assert.ok(!kit.includes('loading="lazy"'));
  // 인쇄물 목록과 QR 주소
  assert.match(kit, /href="\/5-2\/1\/01\/cards\/"/);
  assert.match(kit, /href="\/files\/5-2\/1\/01\/worksheet\.pdf" download="5-2_1단원_1차시_학습지\.pdf"/);
  assert.match(kit, /<p id="qr">http:\/\/localhost:4321\/5-2\/1\/01\/quiz\/<\/p>/);
  // 카드의 놀이 방법(assets.cards.games)은 안내 페이지의 카드 줄 아래에 보인다. 단원 덱의 놀이 방법도 단원 정리 묶음의 안내 페이지에 보인다.
  assert.match(kit, /href="\/5-2\/1\/01\/cards\/">카드<\/a>.*<dl class="games"><dt>뜻 듣고 맞히기<\/dt><dd>뒷면을 읽으면 앞면을 맞힙니다\.<\/dd><\/dl>/s);
  assert.match(read(out, '5-2/1/05/index.html'), /<dl class="games"><dt>차례대로 놓기<\/dt><dd>카드를 차례대로 놓습니다\.<\/dd><\/dl>/);

  // 단원 정리 묶음은 앞 묶음의 그림을 그 묶음의 주소에서 가져온다
  const review = read(out, '5-2/1/05/index.html');
  assert.match(review, /<img src="\/media\/5-2\/1\/01\/stone\.svg"/);
  // 두 차시 묶음: 본떠 그린 그림과 CC 사진의 출처 표시
  const two = read(out, '5-2/1/02-03/index.html');
  assert.ok(two.includes('그림: 몽당분필 날쌤 · 시험용 박물관 자료를 본떠 그림 (공공누리 제1유형)'));
  assert.ok(two.includes('사진: 시험용 사진가 · CC BY-SA 3.0'));

  // 인쇄 페이지: 맨 아래 문구는 Base 가 아니라 바닥글이 맡는다. 설명은 끄고 출처 표시는 남긴다.
  const coloring = read(out, '5-2/1/02-03/coloring/index.html');
  assert.match(coloring, /<body data-kind="print" data-draft="true">/);
  assert.ok(!coloring.includes('site-notice'));
  assert.match(coloring, /<div class="coloring"><figure class="media coloring-picture">/);
  assert.ok(!coloring.includes('media-caption'));
  // 컬러링의 '찾아볼 것'(assets.coloring.look_for)은 그림 아래에 찍힌다
  assert.match(coloring, /<\/figure><ul class="coloring-tasks"><li>돌의 모서리가 몇 개인지 세어 봅시다\.<\/li><\/ul>/);
  // 인쇄 틀의 뼈대(PrintLayout, Sheet): 한 쪽의 짜임, 바닥글의 쪽/전체, 인쇄 안내와 내려받기
  assert.match(coloring, /<section class="sheet" data-orientation="portrait"><header class="sheet-head">.*<\/header><div class="sheet-body">.*<\/div><footer class="sheet-foot">/s);
  assert.ok(coloring.includes(`<footer class="sheet-foot">${SITE.draftNotice} · 1/1</footer>`));
  assert.equal(coloring.match(/class="sheet"/g)?.length, 1);
  assert.match(coloring, /<div class="print-bar no-print">/);
  assert.match(coloring, /href="\/files\/5-2\/1\/02-03\/coloring\.pdf" download="5-2_1단원_2~3차시_컬러링 도안\.pdf"/);
  assert.ok(coloring.includes('학생마다 1부 · A4 세로 1쪽 · 단면 · 흑백으로 뽑아도 됩니다 · A4 보통 용지'));
  assert.ok(coloring.includes('.sheet-body{') && coloring.includes('@page portrait{size:210mm 297mm'), 'print.css 가 실리지 않았습니다');
  // 학생 페이지
  const quiz = read(out, '5-2/1/04/quiz/index.html');
  assert.match(quiz, /<body data-kind="student" data-draft="true">/);
  assert.match(quiz, /data-scored="false"/);
  assert.ok(quiz.includes(SITE.draftNotice));
});

test('초안은 dev 명령에서만 저절로 열린다 (astro build --mode dev 로는 열리지 않는다)', () => {
  const out = build('mode-dev', { CONTENT_DIR: FIXTURES, SITE_URL: 'https://example.org' }, ['--mode', 'dev']);
  assert.deepEqual(pages(out), ['index.html']);
  assert.ok(!read(out, 'index.html').includes('/5-2/1/'));
});

test('공개 빌드 (하위 경로, 공개된 차시만)', () => {
  const t = tempContent('frame');
  try {
    // 한 차시만 검수를 마치고 공개한다
    process.env.SHOW_DRAFTS = '1';
    const seals = c.sealsOf('5-2/1/01');
    t.edit('5-2/1/01', (l) => {
      for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
      l.reviews = passRows(seals.lesson);
      l.status = 'published';
    });
    const out = build('public', { CONTENT_DIR: t.dir, SITE_BASE: '/korean-elementary', SITE_URL: 'https://example.org' });
    // 초안은 페이지도 링크도 없다
    assert.deepEqual(pages(out), ['5-2/1/01/index.html', '5-2/1/01/quiz/index.html', 'index.html']);
    const home = read(out, 'index.html');
    assert.ok(!home.includes('02-03'));
    // 공개된 묶음 id 의 JSON 배열 (감싸는 칸 없이). 배포 워크플로가 지금 사이트의 것과 견준다.
    assert.equal(read(out, 'published.json'), '["5-2/1/01"]');
    assert.match(home, /href="\/korean-elementary\/5-2\/1\/01\/"/);
    assert.match(home, /<link rel="stylesheet" href="\/korean-elementary\/_astro\/[^"]+\.css">/);
    // 사이트 화면은 검색에 나오고, 학생 페이지는 나오지 않는다
    assert.ok(!home.includes('name="robots"'));
    // 공개 빌드에는 공개된 차시만 실리므로 차시가 없는 페이지도 "교사가 검수한 자료"라고 쓴다
    assert.ok(home.includes(`<p class="site-notice">${SITE.aiNotice}</p>`) && !home.includes(SITE.previewNotice));
    const kit = read(out, '5-2/1/01/index.html');
    assert.ok(!kit.includes('name="robots"'));
    assert.match(read(out, '5-2/1/01/quiz/index.html'), /<meta name="robots" content="noindex">/);
    // 공개된 차시의 문구와, 하위 경로가 붙은 주소
    assert.match(kit, /<body data-kind="site">/);
    assert.ok(kit.includes(`<p class="site-notice">${SITE.aiNotice}</p>`));
    assert.match(kit, /<img src="\/korean-elementary\/media\/5-2\/1\/01\/stone\.svg"/);
    assert.match(kit, /href="\/korean-elementary\/files\/5-2\/1\/01\/cards\.pdf"/);
    assert.match(kit, /<p id="qr">https:\/\/example\.org\/korean-elementary\/5-2\/1\/01\/quiz\/<\/p>/);
    assert.ok(!kit.includes('localhost'));

    // 초안이 공개 빌드에 섞여 들어가는 실수: lessonPaths() 대신 lessonIds() 로 주소를 만든 페이지 (3절이 하지 말라는 것)를 일부러 만들어 빌드한다.
    // Base.astro 는 그런 페이지도 검색에 내놓지 않고 data-draft 를 붙인다. 산출물 검사(checks/outputs.mjs)는 이 표시로 섞인 초안을 찾는다.
    const leak = path.join(OUT, 'leak-site');
    fs.mkdirSync(path.join(leak, 'src', 'pages', '[semester]', '[unit]'), { recursive: true });
    fs.writeFileSync(path.join(leak, 'astro.config.mjs'), `export { default } from ${JSON.stringify(pathToFileURL(path.join(SITE_DIR, 'astro.config.mjs')).href)};\n`);
    fs.writeFileSync(path.join(leak, 'src', 'pages', '[semester]', '[unit]', '[bundle].astro'), [
      '---',
      "import Base from '#src/layouts/Base.astro';",
      "import { lessonIds, loadLesson, splitId } from '#lib/content.ts';",
      'export function getStaticPaths() { return lessonIds().map((id) => ({ params: splitId(id), props: { id } })); }',
      'const lesson = loadLesson(Astro.props.id);',
      '---',
      '<Base title={lesson.title} kind="site" lesson={lesson}><main data-pagefind-body><h1>{lesson.title}</h1></main></Base>',
      '',
    ].join('\n'));
    const leaked = build('leak', { CONTENT_DIR: t.dir, SITE_URL: 'https://example.org' }, [], leak);
    assert.deepEqual(pages(leaked), ['5-2/1/01/index.html', '5-2/1/02-03/index.html', '5-2/1/04/index.html', '5-2/1/05/index.html']);
    for (const id of ['5-2/1/02-03', '5-2/1/04', '5-2/1/05']) {
      const page = read(leaked, `${id}/index.html`);
      assert.match(page, /<meta name="robots" content="noindex,nofollow">/, id);
      assert.match(page, /<body data-kind="site" data-draft="true">/, id);
      assert.ok(page.includes(SITE.draftNotice) && !page.includes(SITE.aiNotice), id);
    }
    // 공개된 차시의 페이지는 그대로 검색에 나온다
    const open = read(leaked, '5-2/1/01/index.html');
    assert.ok(!open.includes('name="robots"') && !open.includes('data-draft'));
  } finally {
    delete process.env.SHOW_DRAFTS;
    t.cleanup();
  }
});
