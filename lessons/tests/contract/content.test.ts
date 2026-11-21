// 실제 content/ 를 읽는 시험: 차시표, 초안 가리기, 고인돌 초안.
// 차시가 늘어도 깨지지 않도록 5학년 2학기에 대해 변하지 않는 것만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_ROUTE, SITE } from '#lib/site.ts';
import { href } from '#src/lib/url.ts';

delete process.env.CONTENT_DIR;

test('저장소 뿌리는 어디에서 실행해도 찾는다', () => {
  assert.ok(fs.existsSync(path.join(c.ROOT, 'content', 'registry.yaml')));
  assert.equal(c.contentDir(), path.join(c.ROOT, 'content'));
});

test('distDir·cacheDir: 빌드한 사이트와 캐시의 자리는 --out 이나 DIST_DIR 로 바꾼다', () => {
  const saved = process.env.DIST_DIR;
  const at = (...p: string[]) => path.join(c.ROOT, ...p);
  try {
    delete process.env.DIST_DIR;
    // 기본 자리
    assert.equal(c.distDir([]), at('dist'));
    assert.equal(c.cacheDir([]), at('.cache'));
    // --out <폴더> 와 --out=<폴더>. 다른 인자와 섞여 있어도 된다. 저장소 뿌리 기준이다.
    assert.equal(c.distDir(['--only', '5-2/1/01', '--out', '.cache/tests/x/site']), at('.cache', 'tests', 'x', 'site'));
    assert.equal(c.distDir(['--out=.cache/tests/x/site', '--only', '5-2/1/01']), at('.cache', 'tests', 'x', 'site'));
    assert.equal(c.distDir(['--out', at('.cache', 'tests', 'abs')]), at('.cache', 'tests', 'abs'));
    // 환경 변수 DIST_DIR. 인자가 먼저다. 빈 값은 주지 않은 것으로 본다.
    process.env.DIST_DIR = '.cache/tests/y';
    assert.equal(c.distDir([]), at('.cache', 'tests', 'y'));
    assert.equal(c.distDir(['--out', '.cache/tests/x']), at('.cache', 'tests', 'x'));
    process.env.DIST_DIR = '';
    assert.equal(c.distDir([]), at('dist'));
    // dist 가 아닌 곳을 가리키면 캐시도 그 옆으로 간다 (같이 도는 시험끼리, 시험과 실제 빌드가 PDF 캐시와 lessons.json 을 섞어 쓰지 않는다)
    assert.equal(c.cacheDir(['--out', '.cache/tests/x/site']), at('.cache', 'tests', 'x', 'site.cache'));
    assert.equal(c.cacheDir(['--out', '.cache/tests/x/site/']), at('.cache', 'tests', 'x', 'site.cache'));
    process.env.DIST_DIR = '.cache/tests/y';
    assert.equal(c.cacheDir([]), at('.cache', 'tests', 'y.cache'));
    delete process.env.DIST_DIR;
    assert.equal(c.cacheDir(['--out', 'dist']), at('.cache'));
    // 폴더를 빠뜨린 --out
    assert.throws(() => c.distDir(['--out']), /--out 뒤에 폴더를 적습니다/);
    assert.throws(() => c.distDir(['--out', '--only']), /--out 뒤에 폴더를 적습니다/);
    // 인자를 주지 않으면 실행한 명령의 인자를 본다 (시험을 돌리는 명령에는 --out 이 없다)
    assert.equal(c.distDir(), at('dist'));
  } finally {
    if (saved === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = saved;
  }
});

test('차시표: 5학년 2학기는 3단원 32묶음 45차시', () => {
  const bundles = c.allBundles().filter((b) => b.semester.id === '5-2');
  assert.equal(bundles.length, 32);
  assert.equal(bundles.reduce((n, b) => n + b.lessons.length, 0), 45);
  assert.deepEqual([1, 2, 3].map((n) => bundles.filter((b) => b.unit.no === n).length), [13, 10, 9]);
  assert.equal(c.loadRegistry().semesters.length, 8);
  // 차시 번호는 묶음 id 에서, 단원 쪽수는 묶음에서 나온다
  assert.deepEqual(c.bundleOf('5-2/1/04-05').lessons, [4, 5]);
  assert.deepEqual(c.unitPages(c.bundleOf('5-2/1/01').unit), [6, 61]);
  assert.deepEqual(c.findByPage('5-2', 34).map((b) => b.id), ['5-2/1/10']);
  // 단원마다 review 묶음은 하나
  for (const n of [1, 2, 3]) assert.equal(bundles.filter((b) => b.unit.no === n && b.role === 'review').length, 1);
});

test('성취기준은 단원에 적혀 있고, 묶음은 단원의 것을 물려받는다', () => {
  // 묶음에 standards 를 적으면 단원의 것 대신 그것을 쓴다 (5-2/1/01 은 6사04-01 만 적었다)
  assert.deepEqual(c.bundleOf('5-2/1/01').standards, ['6사04-01']);
  assert.deepEqual(c.bundleOf('5-2/1/02').standards, ['6사04-01', '6사04-02', '6사04-03']);
  assert.deepEqual(c.bundleOf('5-2/2/05').standards, ['6사05-01', '6사05-02']);
  assert.deepEqual(c.bundleOf('5-2/3/13').standards, ['6사06-01', '6사06-02']);
  assert.equal(c.standardsOf('5-2/3/01').length, 2);
  assert.match(c.standardSummary('6사04-01'), /추론/);
  assert.throws(() => c.standardSummary('6사99-99'), /없는 코드/);
  const data = JSON.parse(fs.readFileSync(path.join(c.ROOT, 'data/standards/social-2022.json'), 'utf8'));
  assert.equal(data.standards.length, 49);
  assert.deepEqual(Object.keys(data.standards[0]), ['code', 'grade_band', 'unit', 'summary']);
});

test('차시표에 없는 폴더에 놓인 명세가 없다', () => {
  assert.deepEqual(c.orphanLessons(), []);
});

test('초안은 SHOW_DRAFTS=1 일 때만 실린다 (그 밖의 값은 닫힌다)', () => {
  const published = (ls: { status: string }[]) => ls.every((l) => l.status === 'published');
  delete process.env.SHOW_DRAFTS;
  assert.ok(published(c.visibleLessons()));
  assert.ok(!c.visibleLessons().some((l) => l.id === '5-2/1/01'));
  process.env.SHOW_DRAFTS = 'true';
  assert.ok(published(c.visibleLessons()));
  process.env.SHOW_DRAFTS = '1';
  assert.ok(c.visibleLessons().some((l) => l.id === '5-2/1/01'));
  assert.ok(c.lessonPaths().some((p) => p.props.id === '5-2/1/01'));
  delete process.env.SHOW_DRAFTS;
  assert.ok(!c.lessonPaths().some((p) => p.props.id === '5-2/1/01'));
});

test('고인돌 초안을 읽는다', () => {
  const l = c.loadLesson('5-2/1/01');
  assert.equal(l.status, 'draft');
  assert.equal(c.isPublic(l), false);
  assert.equal(c.footerNotice(l), SITE.draftNotice);
  assert.equal(c.sheetFooter(l), SITE.draftNotice);
  assert.equal(c.reviewedOn(l), undefined);
  // 쓰이지 않는 사실이 없다
  const used = new Set(JSON.stringify(l).match(/"f\d+"/g));
  for (const f of l.facts) assert.ok(used.has(`"${f.id}"`), f.id);
  // 인쇄물 목록과 쪽수
  const jobs = c.printJobs(l);
  assert.equal(jobs[0].kind, 'worksheet');
  assert.equal(jobs[0].pages, l.worksheet.pages.length);
  for (const j of jobs) {
    assert.equal(j.route, `/5-2/1/01/${ASSET_ROUTE[j.kind]}/`);
    assert.equal(j.file, `/files/5-2/1/01/${j.kind}.pdf`);
    assert.match(j.download, /^5-2_1단원_1차시_.+\.pdf$/);
  }
  // 공개하려면 채울 것이 남아 있다
  assert.ok(c.publishGaps('5-2/1/01').length > 0);
});

test('고인돌 초안: 종이 고인돌의 차례 카드는 수업 화면 단계 장의 글과 글자까지 같고, 통나무가 없다 (R21)', () => {
  const l = c.loadLesson('5-2/1/01');
  const pc = l.assets.papercraft;
  assert.equal(pc.state, 'ready');
  if (pc.state !== 'ready') return;
  const steps = l.slides.filter((s) => s.layout === 'steps');
  assert.equal(steps.length, 1);
  assert.deepEqual(pc.texts, steps[0].layout === 'steps' ? steps[0].steps.map((s) => s.text) : []);
  // 비탈 위의 통나무는 자료가 말하지 않는다: 아이가 만드는 종이 모형(조각·차례 카드·만드는 법)에는 없다
  assert.doesNotMatch(JSON.stringify(pc), /통나무/);
});

test('주소: href 는 Node 에서도 돌고, absoluteUrl 은 SITE_URL·SITE_BASE 를 따른다', () => {
  const saved = { ...process.env };
  try {
    delete process.env.SITE_BASE; delete process.env.SITE_URL;
    assert.equal(href('/5-2/'), '/5-2/');
    assert.equal(href('5-2/'), '/5-2/');
    process.env.SITE_BASE = '/korean-elementary';
    assert.equal(href('/5-2/'), '/korean-elementary/5-2/');
    process.env.SITE_BASE = '/korean-elementary/';
    assert.equal(href('/files/5-2/1/01/worksheet.pdf'), '/korean-elementary/files/5-2/1/01/worksheet.pdf');

    process.env.SITE_URL = 'https://example.org';
    assert.equal(c.absoluteUrl(c.lessonRoute('5-2/1/01', ASSET_ROUTE.quiz)), 'https://example.org/korean-elementary/5-2/1/01/quiz/');
    delete process.env.SITE_BASE;
    assert.equal(c.absoluteUrl(c.lessonRoute('5-2/1/01')), 'https://example.org/5-2/1/01/');
    process.env.SITE_BASE = '/';
    assert.equal(c.absoluteUrl('/5-2/'), 'https://example.org/5-2/');

    // 공개 빌드에서 SITE_URL 이 없으면 멈춘다. localhost 가 종이에 박히지 않게.
    delete process.env.SITE_URL; delete process.env.SHOW_DRAFTS;
    assert.throws(() => c.absoluteUrl('/5-2/1/01/quiz/'), /SITE_URL/);
    process.env.SHOW_DRAFTS = '1';
    assert.equal(c.absoluteUrl('/5-2/1/01/quiz/'), 'http://localhost:4321/5-2/1/01/quiz/');
    // 값을 넣지 않은 변수(빈 글)는 주지 않은 것과 같다
    process.env.SITE_URL = '';
    assert.equal(c.absoluteUrl('/5-2/1/01/quiz/'), 'http://localhost:4321/5-2/1/01/quiz/');
    delete process.env.SHOW_DRAFTS;
    assert.throws(() => c.absoluteUrl('/5-2/1/01/quiz/'), /SITE_URL 이 없습니다/);
    // 하위 경로를 SITE_URL 에 넣으면 종이의 주소에서 소리 없이 빠진다. 멈추고 SITE_BASE 로 주라고 알려 준다.
    for (const site of ['https://example.org/social', 'https://example.org/social/']) {
      process.env.SITE_URL = site;
      assert.throws(() => c.absoluteUrl('/5-2/1/01/quiz/'), /SITE_URL 에는 하위 경로를 넣지 않습니다 .*SITE_URL=https:\/\/example\.org SITE_BASE=\/social\)$/);
    }
    // 주소 꼴이 아니면 무엇을 줄지 알려 준다 ("Invalid URL" 한 줄로 멈추지 않는다)
    for (const site of ['example.org', 'localhost:4321', 'ftp://example.org']) {
      process.env.SITE_URL = site;
      assert.throws(() => c.absoluteUrl('/5-2/1/01/quiz/'), /SITE_URL 이 웹 주소가 아닙니다 \(지금: .+\)\. https:\/\/ 로 시작하는 배포 주소를 줍니다/, site);
    }
    // 끝에 / 가 붙은 주소는 그대로 받는다
    process.env.SITE_URL = 'https://example.org/'; process.env.SITE_BASE = '/social';
    assert.equal(c.absoluteUrl('/5-2/'), 'https://example.org/social/5-2/');
  } finally {
    for (const k of ['SITE_BASE', 'SITE_URL', 'SHOW_DRAFTS']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

test('이름표', () => {
  assert.equal(c.lessonsLabel([1]), '1차시');
  assert.equal(c.lessonsLabel([3, 4]), '3~4차시');
  assert.equal(c.pagesLabel([6, 9]), '6~9쪽');
  assert.equal(c.pagesLabel([7, 7]), '7쪽');
  assert.equal(c.semesterLabel('5-2'), '5학년 2학기');
  assert.deepEqual(c.splitId('5-2/1/03-04'), { semester: '5-2', unit: '1', bundle: '03-04' });
  assert.equal(c.downloadName('5-2/2/03-04', '학습지', 'pdf'), '5-2_2단원_3~4차시_학습지.pdf');
  assert.equal(c.lessonRoute('5-2/1/01'), '/5-2/1/01/');
  assert.equal(c.lessonRoute('5-2/1/01', 'play'), '/5-2/1/01/play/');
  assert.equal(c.fileRoute('5-2/1/01', 'slides.pptx'), '/files/5-2/1/01/slides.pptx');
});
