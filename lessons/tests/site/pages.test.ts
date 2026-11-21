// 사이트 화면(첫 화면·학기·단원·차시 안내·소개·이용 조건·오류 제보·/published.json)과 sync-media 를 시험용 명세로 빌드해 본다.
// .cache/tests/site-<pid>/ 아래에만 쓰고 끝나면 지운다 (docs/CONTRACT.md 16절). dev 서버를 띄우지 않는다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { FIXTURES, buildSite, passRows, tempContent } from '../contract/helpers.ts';

const OUT = path.join(c.ROOT, '.cache', 'tests', `site-${process.pid}`);
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

const read = (out: string, page: string) => fs.readFileSync(path.join(out, page), 'utf8');
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const htmlFiles = (out: string) => (fs.readdirSync(out, { recursive: true }) as string[]).filter((f) => f.endsWith('.html')).map((f) => f.split(path.sep).join('/'));
const syncMedia = (out: string, env: Record<string, string>) =>
  execFileSync(process.execPath, [path.join(c.ROOT, 'scripts', 'sync-media.mjs'), '--out', out], { cwd: c.ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });

// 차시표의 focus. 검수를 거치지 않은 계획 글이라 어느 화면에도 실리지 않아야 한다 (3절).
const FOCUS = ['시험용 한 차시 묶음', '시험용 두 차시 묶음', '시험용 no_play 묶음', '시험용 단원 정리 묶음', '명세가 아직 없는 묶음'];

let drafts = '';
before(() => {
  drafts = buildSite(path.join(OUT, 'drafts'), { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' });
});

test('미리 보기: 사이트 화면이 모두 만들어진다', () => {
  const pages = htmlFiles(drafts).sort();
  for (const p of ['index.html', '404.html', '5-2/index.html', '5-2/1/index.html', '5-2/2/index.html', 'about/index.html', 'licence/index.html', 'report/index.html',
    '5-2/1/01/index.html', '5-2/1/02-03/index.html', '5-2/1/04/index.html', '5-2/1/05/index.html']) assert.ok(pages.includes(p), `${p} 가 없습니다`);
  // 차시표만 있고 명세가 없는 묶음과 차시표가 없는 학기에는 페이지가 없다
  assert.ok(!pages.includes('5-2/2/01/index.html'));
  assert.ok(!pages.includes('3-1/index.html'));
  // 미리 보기에서도 /published.json 에는 공개된 묶음만 나온다
  assert.equal(read(drafts, 'published.json'), '[]');
});

// 첫 화면·머리·바닥글은 tests/site/shell.test.ts 가 본다.

test('차시표의 focus 는 어느 화면에도 실리지 않는다', () => {
  for (const p of htmlFiles(drafts)) {
    const html = read(drafts, p);
    for (const f of FOCUS) assert.ok(!html.includes(f), `${p} 에 차시표의 focus "${f}" 가 실렸습니다`);
  }
});

test('학기·단원 페이지: 차시표 전체를 그리고 실리는 묶음에만 링크를 건다', () => {
  const sem = read(drafts, '5-2/index.html');
  for (const id of ['01', '02-03', '04', '05']) assert.ok(sem.includes(`href="/5-2/1/${id}/"`), id);
  // 명세가 없는 묶음은 차시 번호와 쪽수만
  assert.ok(!sem.includes('href="/5-2/2/01/"'));
  assert.ok(sem.includes('24~27쪽'));
  const unit = read(drafts, '5-2/1/index.html');
  // 단원 정리 묶음의 카드와 학습지가 '단원 자료'로 차시 목록보다 위에 온다
  const kit = unit.indexOf('id="unit-kit-title"');
  assert.ok(kit > 0 && kit < unit.indexOf('id="lessons-title"'));
  assert.ok(unit.indexOf('href="/5-2/1/05/cards/"') > kit && unit.indexOf('href="/5-2/1/05/worksheet/"') > kit);
});

test('차시 안내 페이지: 차례와 쉬는 시간, 띄우기 링크', () => {
  process.env.CONTENT_DIR = FIXTURES;
  process.env.SHOW_DRAFTS = '1';
  try {
    for (const lesson of c.visibleLessons()) {
      const html = read(drafts, `${lesson.id}/index.html`);
      // 머리 → 큰 버튼 → 준비물 → 수업 흐름 → 확인 퀴즈 → 교사용 자료
      const order = ['class="kit-head"', 'class="actions"', 'id="prepare-title"', 'id="flow-title"', 'id="student-title"', 'id="teacher-title"'].map((s) => html.indexOf(s));
      assert.ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), `${lesson.id} 의 차례가 다릅니다: ${order}`);
      // 초안 표시
      assert.match(html, /<body data-kind="site" data-draft="true">/);
      assert.ok(html.includes(`<p class="site-flag">`) && html.includes(SITE.draftNotice));
      // 큰 버튼: 페이퍼크래프트가 ready 인 묶음에만 '페이퍼크래프트 인쇄'가 붙는다. 만들기 세트와 헷갈리는 '만들기 인쇄'는 쓰지 않는다 (6절).
      const papercraft = lesson.assets.papercraft.state === 'ready';
      assert.equal(/<a class="btn btn-big" href="[^"]*\/papercraft\/">페이퍼크래프트 인쇄<\/a>/.test(html), papercraft, lesson.id);
      assert.ok(!html.includes('만들기 인쇄'), lesson.id);
      // 페이퍼크래프트의 인쇄물 줄(준비물이나 '더 해 볼 자료')과 PDF 링크
      const job = c.printJobs(lesson).find((j) => j.kind === 'papercraft');
      assert.equal(Boolean(job), papercraft, lesson.id);
      if (job && lesson.assets.papercraft.state === 'ready') {
        assert.ok(html.includes(`<span class="mat-kind">${job.label}</span>`) && html.includes(`<span class="mat-title">${esc(lesson.assets.papercraft.title)}</span>`), `${lesson.id} 페이퍼크래프트 줄`);
        assert.ok(html.includes(`href="${job.route}"`) && html.includes(`href="${job.file}"`), `${lesson.id} 페이퍼크래프트 링크`);
      }
      // 쪽수는 어느 교과서의 것인지 밝힌다 (차시표의 textbook)
      const tb = c.loadRegistry().textbook;
      assert.ok(html.includes(`${tb.publisher}(${tb.author}) 교과서 ${c.pagesLabel(c.bundleOf(lesson).pages)}`), `${lesson.id} 교과서 이름`);
      // 현재 위치의 단원 이름은 좁은 화면에서 감추는 뒷부분으로 따로 싼다
      assert.ok(html.includes(`<span class="crumb-rest"> ${esc(c.bundleOf(lesson).unit.title)}</span>`), `${lesson.id} 현재 위치`);
      // 웹 활동은 확인 퀴즈 곁의 카드에 한 번만 나온다. 제목(h3)에는 이름표가 끼지 않는다.
      if (lesson.assets.web_activity.state === 'ready') {
        assert.match(html, /<h3 class="qr-title">웹 활동<\/h3>/);
        assert.ok(!html.includes('QR 코드 보기'), lesson.id);
      }
      // 검색 색인: 시간표·분·장 번호는 빼고, 초안 표시를 메타로 싣는다
      assert.match(html, /<ol class="timebar" aria-hidden="true" data-pagefind-ignore>/);
      assert.ok(html.includes('data-pagefind-meta="draft:검수 전 초안"'), lesson.id);
      assert.ok(html.includes(`href="/${lesson.id}/slides/"`) && html.includes(`href="/${lesson.id}/worksheet/"`));
      // 차시마다 시간표, 그 사이에 쉬는 시간
      const flows = c.flowByLesson(lesson);
      assert.equal(html.match(/<p class="break">/g)?.length ?? 0, flows.length - 1, lesson.id);
      for (const f of flows.slice(1)) assert.ok(new RegExp(`href="/${lesson.id}/slides/#${f.firstSlide}"[^>]*>${f.lesson}차시부터 띄우기`).test(html), `${lesson.id} ${f.lesson}차시`);
      // QR 은 absoluteUrl() 로 만든 주소를 담는다
      assert.match(html, /<svg class="qr"[^>]*aria-label="확인 퀴즈 QR 코드"/);
      // 주소 글은 '/' 뒤에서만 줄이 바뀌게 조각으로 나뉘어 찍힌다 (UrlText). 태그를 걷어 내면 주소 그대로다.
      assert.ok(html.replace(/<[^>]+>/g, '').includes(c.absoluteUrl(c.lessonRoute(lesson.id, 'quiz'))));
      // 학습지 풀이는 접힌 상자에만
      for (const k of c.worksheetKey(lesson)) assert.ok(html.includes(esc(k.text)), `${lesson.id} 풀이: ${k.text}`);
      // 그림 출처는 shownMedia() 의 creditFull()
      for (const m of c.shownMedia(lesson)) assert.ok(html.includes(esc(c.creditFull(m).text)), `${lesson.id} 그림 출처`);
      // 성취기준 요약은 공식 문구가 아니라고 밝힌다
      assert.ok(html.includes('교육부가 고시한 문장과 다릅니다'));
      if (!c.scored(lesson)) assert.ok(html.includes('점수를 보여 주지 않습니다'), lesson.id);
    }
  } finally {
    delete process.env.CONTENT_DIR;
    delete process.env.SHOW_DRAFTS;
  }
});

test('외부 주소를 부르지 않는다 (script·link·img)', () => {
  for (const p of htmlFiles(drafts)) {
    const html = read(drafts, p);
    // 스크립트는 </body> 안에 둔다 (틀 밖으로 새어 나가면 </html> 뒤에 붙는다)
    assert.ok(html.trimEnd().endsWith('</html>'), `${p}: </html> 뒤에 무엇이 붙었습니다`);
    for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      assert.ok(!/^(https?:)?\/\//.test(m[1]), `${p}: ${m[1]}`);
    }
  }
});

test('이용 조건·소개·오류 제보', () => {
  const licence = read(drafts, 'licence/index.html');
  assert.ok(licence.includes(SITE.licence.name) && licence.includes(SITE.licenceNote) && licence.includes('MIT'));
  // 남의 그림은 CC BY-NC-SA 에 들지 않는다. 이 사이트가 쓰는 조건에는 '변경 금지'가 없다 (5절).
  assert.ok(licence.includes(`${SITE.licence.name} 에 들지 않고`));
  assert.ok(!licence.includes('변경을 금지한'));
  assert.ok(licence.includes('legalcode.ko') && licence.includes('Pagefind(MIT)'));
  assert.ok(licence.includes(`href="${SITE.repo}/blob/main/lessons/LICENSE"`));
  const about = read(drafts, 'about/index.html');
  assert.ok(about.includes(SITE.author));
  assert.ok(about.includes('사실마다 두 확인자가 출처와 맞는지 따로 봅니다. 확인자는 AI일 수도 있습니다.'));
  assert.ok(about.includes('시험용 출판사와 관계없이 만든 것이며, 시험용 출판사나 교과서 집필진이 만들거나 보증한 자료가 아닙니다.'));
  const report = read(drafts, 'report/index.html');
  // 양식을 넣지 않는다. 깃허브 이슈 양식으로 가는 링크만 (제보 양식 주소는 비어 있으면 뺀다)
  assert.ok(!/<form\b/.test(report.replace(/<form class="(finder|search)-form"/g, '')));
  assert.ok(report.includes(`href="${SITE.repo}/issues/new?template=lessons-error.yml"`));
  assert.ok(report.includes(`href="${SITE.repo}/issues/new?template=lessons-copyright.yml"`));
  assert.ok(report.includes('아이 이름·얼굴이 나온 사진, 학교 이름, 연락처는 올리지 마세요.'));
  assert.equal(/<a [^>]*data-report-form/.test(report), SITE.reportUrl !== '');
});

test('404: 첫 화면과 오류 제보로 가는 링크, 검색 색인에서 빠진다', () => {
  const html = read(drafts, '404.html');
  assert.ok(html.includes('<title>찾는 페이지가 없습니다'));
  assert.ok(html.includes('주소가 바뀌었거나 아직 공개하지 않은 차시입니다.'));
  assert.ok(html.includes('href="/"') && html.includes('href="/report/"'));
  assert.ok(!html.includes('data-pagefind-body'));
  // 다른 사이트 화면은 색인에 들어간다
  assert.ok(read(drafts, 'about/index.html').includes('data-pagefind-body'));
});

test('sync-media: 이번 빌드에 실리는 차시의 명세에 적힌 그림만 복사한다', () => {
  const env = { CONTENT_DIR: FIXTURES, SHOW_DRAFTS: '1' };
  // 지난 빌드에 남은 파일은 지운다
  fs.mkdirSync(path.join(drafts, 'media', 'old'), { recursive: true });
  fs.writeFileSync(path.join(drafts, 'media', 'old', 'x.png'), '');
  syncMedia(drafts, env);
  const files = (fs.readdirSync(path.join(drafts, 'media'), { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/')).filter((f) => f.includes('.')).sort();
  process.env.CONTENT_DIR = FIXTURES;
  process.env.SHOW_DRAFTS = '1';
  try {
    const want = c.visibleLessons().flatMap((l) => l.media.map((m) => c.mediaRoute(l, m.id).replace(/^\/media\//, ''))).sort();
    assert.deepEqual(files, want);
  } finally {
    delete process.env.CONTENT_DIR;
    delete process.env.SHOW_DRAFTS;
  }
});

test('sync-media: dist 가 없으면 알리고 멈춘다', () => {
  assert.throws(() => execFileSync(process.execPath, [path.join(c.ROOT, 'scripts', 'sync-media.mjs'), '--out', path.join(OUT, 'none')], { cwd: c.ROOT, env: { ...process.env, CONTENT_DIR: FIXTURES }, stdio: 'pipe' }));
});

test('공개 빌드: 공개된 묶음만 링크하고, 초안 표시가 없다', () => {
  const t = tempContent('site');
  try {
    process.env.SHOW_DRAFTS = '1';
    const seals = c.sealsOf('5-2/1/01');
    t.edit('5-2/1/01', (l) => {
      for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
      l.reviews = passRows(seals.lesson);
      l.status = 'published';
    });
    delete process.env.SHOW_DRAFTS;
    const out = buildSite(path.join(OUT, 'public'), { CONTENT_DIR: t.dir, SITE_BASE: '/korean-elementary', SITE_URL: 'https://example.org' });
    assert.equal(read(out, 'published.json'), '["5-2/1/01"]');
    const home = read(out, 'index.html');
    assert.ok(home.includes('1/6 차시 공개'));
    assert.ok(!home.includes('class="site-flag"'));
    const sem = read(out, '5-2/index.html');
    assert.ok(sem.includes('href="/korean-elementary/5-2/1/01/"'));
    // 공개되지 않은 묶음은 차시 번호와 쪽수만: 링크도 명세의 이름도 없다
    assert.ok(!sem.includes('/5-2/1/02-03/') && !sem.includes('시험용 두 차시'));
    assert.ok(sem.includes('10~15쪽'));
    const kit = read(out, '5-2/1/01/index.html');
    assert.ok(!kit.includes('data-draft') && !kit.includes('class="site-flag"'));
    // 공개한 차시는 검색 결과에 초안 표시가 붙지 않는다
    assert.ok(!kit.includes('data-pagefind-meta="draft:'));
    assert.ok(kit.replace(/<[^>]+>/g, '').includes('https://example.org/korean-elementary/5-2/1/01/quiz/'));
    assert.ok(!kit.includes('localhost'));
    // 승인한 날을 보여 준다
    assert.ok(kit.includes('<time datetime="2026-11-20">2026년 11월 20일</time>'));
    for (const p of htmlFiles(out)) assert.ok(!read(out, p).includes('data-draft'), p);
    syncMedia(out, { CONTENT_DIR: t.dir });
    assert.deepEqual(fs.readdirSync(path.join(out, 'media', '5-2', '1')), ['01']);
  } finally {
    delete process.env.SHOW_DRAFTS;
    t.cleanup();
  }
});
