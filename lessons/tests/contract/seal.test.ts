// 지문과 공개 조건: 검수 기록은 그때 검수한 내용에 묶여 있고, 내용이 바뀌면 그 기록은 없는 것으로 친다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { factSeal, fileSeal, lessonSeal } from '#lib/seal.ts';
import { SITE } from '#lib/site.ts';
import { REVIEW_KINDS } from '#schema/lesson.ts';
import { GUARD, failsWith, passRows, tempContent } from './helpers.ts';

const t = tempContent('seal');
process.env.SHOW_DRAFTS = '1';
after(() => t.cleanup());

const ONE = '5-2/1/01', REVIEW = '5-2/1/05', TWO = '5-2/1/02-03';
type Raw = Record<string, any>;

/** `npm run sign` 이 하는 일을 흉내 낸다: 지금 내용의 지문으로 확인·검수 기록을 적고 공개로 바꾼다. */
function sign(id: string, { publish = true, checkers = ['ai:검증자A', 'ai:검증자B'], owner = '날쌤' } = {}) {
  const seals = c.sealsOf(id);
  t.edit(id, (l) => {
    for (const f of l.facts ?? []) f.checks = checkers.map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
    l.reviews = passRows(seals.lesson, owner);
    if (publish) l.status = 'published';
  });
}
/** 공개된 차시를 고친 뒤 읽으면 실패해야 한다 */
function publishedFails(id: string, change: (l: Raw) => void, ...fragments: string[]) {
  sign(id);
  assert.equal(c.loadLesson(id).status, 'published');
  t.edit(id, change);
  try { failsWith(() => c.loadLesson(id), 'status: 공개(published)할 수 없습니다', ...fragments); } finally { t.reset(); }
}

test('지문: 검수 기록을 적는 일은 지문을 바꾸지 않는다', () => {
  const before = c.sealsOf(ONE);
  sign(ONE, { publish: false });
  assert.deepEqual(c.sealsOf(ONE), before);
  t.edit(ONE, (l) => { l.status = 'published'; });
  assert.deepEqual(c.sealsOf(ONE), before);
  t.reset();
});

test('지문: 칸의 순서가 달라도 같고, 내용이 한 글자라도 다르면 다르다', () => {
  const raw = t.read(ONE);
  const dir = path.dirname(t.file(ONE));
  const reordered = Object.fromEntries(Object.entries(raw).reverse());
  assert.equal(lessonSeal(reordered, dir), lessonSeal(raw, dir));
  assert.notEqual(lessonSeal({ ...raw, title: raw.title + '.' }, dir), lessonSeal(raw, dir));
  // 그림 파일의 내용도 지문에 들어간다
  assert.notEqual(lessonSeal(raw), lessonSeal(raw, dir));
  // 형식의 판은 내용이 아니다. 판만 올리는 옮김이 검수 기록을 무효로 만들지 않는다.
  assert.equal(lessonSeal({ ...raw, schema_version: 2 }, dir), lessonSeal(raw, dir));
  // 빌려 온 것도 전개도 모듈도 없는 묶음의 지문은 명세와 그림만으로 정해진다
  assert.equal(c.sealsOf(ONE).lesson, lessonSeal(raw, dir));
  assert.equal(lessonSeal(raw, dir, { borrowed: [], files: [] }), lessonSeal(raw, dir));
  assert.notEqual(lessonSeal(raw, dir, { borrowed: [['fact 01/f1', 'x']] }), lessonSeal(raw, dir));
  // 사실의 지문은 문장과 출처 주소만 본다
  const f = raw.facts[0];
  assert.equal(factSeal({ ...f, checks: [{ by: 'x' }], painful: true }), factSeal(f));
  assert.equal(factSeal({ ...f, sources: [{ ...f.sources[0], accessed: '2027-01-01', quote: '다른 구절' }] }), factSeal(f));
  assert.notEqual(factSeal({ ...f, claim: f.claim.replace('돌', '흙') }), factSeal(f));
  assert.notEqual(factSeal({ ...f, sources: [{ ...f.sources[0], url: 'https://example.org/blog' }] }), factSeal(f));
  assert.match(factSeal(f), /^[0-9a-f]{12}$/);
});

test('적는 꼴만 바꾼 것은 지문을 바꾸지 않는다 (따옴표를 두른 숫자, 여러 줄 글, 따옴표 없는 묶음 id)', () => {
  // 형식은 1392 와 "1392", 한 줄 글과 여러 줄 글(|), 01 과 "01" 을 같은 값으로 읽는다. 지문도 형식이 읽은 값으로 낸다.
  // (예전에는 YAML 을 읽은 그대로의 값으로 내서, 연도에 따옴표만 둘러도 검수 다섯 가지가 모두 낡은 기록이 되고 공개된 묶음이 읽히지 않았다.)
  assert.equal(lessonSeal({ a: 1392 }), lessonSeal({ a: '1392' }));
  assert.equal(lessonSeal({ t: '글' }), lessonSeal({ t: '글\n' }));
  assert.notEqual(lessonSeal({ a: 1392 }), lessonSeal({ a: 1393 }));
  assert.notEqual(lessonSeal({ t: '글' }), lessonSeal({ t: '글.' }));

  sign(ONE); sign(TWO); sign(REVIEW);
  const ids = [ONE, TWO, REVIEW];
  const before = ids.map((id) => c.sealsOf(id));
  t.edit(ONE, (l) => {
    assert.equal(l.quiz.items[2].answer, 1392);
    l.quiz.items[2].answer = '1392';              // 따옴표 없는 연도 → 따옴표를 두른 연도
    l.assets.cards.cards[3].front = '1392';
    l.tagline = `${l.tagline}\n`;                 // 한 줄 글 → 여러 줄 글 (끝에 줄바꿈이 붙는다)
    l.facts[1].claim = `  ${l.facts[1].claim}\n`;
  });
  t.edit(TWO, (l) => {
    assert.equal(l.quiz.items[2].answer, '1446');
    l.quiz.items[2].answer = 1446;                // 거꾸로: 따옴표를 뗀다
    l.worksheet.pages[0].blocks[2].rows[1] = ['1446', ''];
    l.worksheet.pages[1].blocks[0].points[0].when = '1392';
    l.passages[0].text[0] = `${l.passages[0].text[0]}\n\n`;
  });
  t.edit(REVIEW, (l) => {
    assert.deepEqual(l.assets.cards.collect[0].bundles, ['01']);
    l.assets.cards.collect[0].bundles = [1];      // YAML 은 따옴표 없는 01 을 숫자 1 로 읽는다
    l.worksheet.pages[0].blocks[0].points[1].when = '1446';
  });
  assert.match(fs.readFileSync(t.file(ONE), 'utf8'), /answer: "1392"/);
  assert.match(fs.readFileSync(t.file(REVIEW), 'utf8'), /bundles:\n\s+- 1\n/);
  assert.deepEqual(ids.map((id) => c.sealsOf(id)), before);
  for (const id of ids) {
    assert.equal(c.loadLesson(id).status, 'published', id);
    assert.deepEqual(c.publishGaps(id), [], id);
    assert.deepEqual(c.reviewState(id), { fact: 'pass', originality: 'pass', voice: 'pass', print: 'pass', owner: 'pass' }, id);
  }
  // 값이 달라지면 지문도 달라진다
  t.edit(ONE, (l) => { l.quiz.items[2].answer = '1393'; });
  assert.notEqual(c.sealsOf(ONE).lesson, before[0].lesson);
  assert.equal(c.reviewState(ONE).fact, 'stale');
  t.reset();
});

test('적지 않은 칸의 기본값은 지문에 들지 않는다', () => {
  // 형식에 기본값이 새로 생겨도 지문이 바뀌지 않아야 한다. 지문은 명세에 적은 칸만, 형식이 읽은 값으로 낸다.
  const raw = t.read(ONE);
  const dir = path.dirname(t.file(ONE));
  assert.equal(raw.facts[0].painful, undefined);
  assert.equal(c.loadLesson(ONE).facts[0].painful, false);
  assert.equal(c.sealsOf(ONE).lesson, lessonSeal(raw, dir));
});

test('검수를 모두 거친 차시는 공개된다', () => {
  sign(ONE);
  const l = c.loadLesson(ONE);
  assert.equal(c.isPublic(l), true);
  assert.deepEqual(c.publishGaps(ONE), []);
  assert.deepEqual(c.reviewState(ONE), { fact: 'pass', originality: 'pass', voice: 'pass', print: 'pass', owner: 'pass' });
  assert.equal(c.reviewedOn(l), '2026-11-20');
  assert.equal(c.footerNotice(l), SITE.aiNotice);
  // 인쇄물 바닥글에는 안내 페이지의 온전한 주소가 들어간다
  process.env.SITE_URL = 'https://example.org'; process.env.SITE_BASE = '/social';
  assert.equal(c.sheetFooter(l), `${SITE.printFooter} · https://example.org/social/5-2/1/01/`);
  delete process.env.SITE_URL; delete process.env.SITE_BASE;
  // 공개 빌드에는 공개된 차시만 실린다
  delete process.env.SHOW_DRAFTS;
  assert.deepEqual(c.visibleLessons().map((x) => x.id), [ONE]);
  assert.deepEqual(c.lessonPaths('cards').map((p) => p.props.id), [ONE]);
  process.env.SHOW_DRAFTS = '1';
  assert.equal(c.visibleLessons().length, 4);
  t.reset();
});

test('검수 기록 없이 published 라고만 적으면 읽지 못한다', () => {
  t.edit(ONE, (l) => { l.status = 'published'; });
  const message = failsWith(() => c.loadLesson(ONE), 'status: 공개(published)할 수 없습니다. 사실 대조(fact) 기록이 없습니다', '날쌤 승인(owner) 기록이 없습니다',
    '사실 f1: 지금 문장을 확인한 이가 0명입니다');
  for (const k of REVIEW_KINDS) assert.ok(message.includes(`(${k}) 기록이 없습니다`), k);
  t.reset();
});

test('지문 없이 손으로 적은 pass 는 치지 않는다', () => {
  sign(ONE, { publish: false });
  t.edit(ONE, (l) => { for (const r of l.reviews) delete r.seal; for (const f of l.facts) for (const ch of f.checks) delete ch.seal; l.status = 'published'; });
  failsWith(() => c.loadLesson(ONE), '사실 대조(fact)를 통과한 뒤에 내용이 바뀌었습니다', '사실 f1: 지금 문장을 확인한 이가 0명입니다');
  t.reset();
});

test('공개한 뒤에 고치면 다시 검수해야 한다', () => {
  // 아이가 읽는 문장을 고침 → 명세 전체의 검수가 무효
  publishedFails(ONE, (l) => { l.slides[1].title = '고친 제목'; }, '사실 대조(fact)를 통과한 뒤에 내용이 바뀌었습니다', '날쌤 승인(owner)를 통과한 뒤에 내용이 바뀌었습니다', 'npm run sign');
  // 사실의 문장을 고침 → 그 사실의 확인도 무효
  publishedFails(ONE, (l) => { l.facts[1].claim = '시험용 연표의 첫 해는 1995년이다.'; }, '사실 f2: 지금 문장을 확인한 이가 0명입니다. 서로 다른 둘의 confirmed 확인이 필요합니다');
  // 출처를 바꿔 끼움
  publishedFails(ONE, (l) => { l.facts[0].sources[0].url = 'https://example.org/blog/1'; }, '사실 f1: 지금 문장을 확인한 이가 0명입니다');
  // 정답을 고침
  publishedFails(ONE, (l) => { l.quiz.items[0].answer = false; }, '베끼기 검사(originality)를 통과한 뒤에 내용이 바뀌었습니다');
  // 그림 파일만 바꿔 끼움
  sign(ONE);
  const svg = path.join(path.dirname(t.file(ONE)), 'media', 'stone.svg');
  fs.writeFileSync(svg, fs.readFileSync(svg, 'utf8').replace('#132c3d', '#000000'));
  t.touch(svg);
  failsWith(() => c.loadLesson(ONE), '화면·인쇄 점검(print)를 통과한 뒤에 내용이 바뀌었습니다');
  t.reset();
});

test('다른 사실을 고쳐도 고치지 않은 사실의 확인은 살아 있다', () => {
  sign(ONE, { publish: false });
  t.edit(ONE, (l) => { l.facts[1].claim = '시험용 연표의 첫 해는 1393년이다.'; });
  const gaps = c.publishGaps(ONE);
  assert.ok(gaps.some((g) => g.startsWith('사실 f2:')));
  assert.ok(!gaps.some((g) => g.startsWith('사실 f1:')));
  t.reset();
});

test('나중에 적힌 기록이 앞의 pass 를 뒤집는다', () => {
  publishedFails(ONE, (l) => { l.reviews.push({ kind: 'fact', by: '검수자2', date: '2026-12-01', result: 'fix', note: 'f2 연도 다시 확인' }); },
    '사실 대조(fact)의 마지막 기록이 fix 입니다. 고친 뒤 다시 검수합니다');
  publishedFails(ONE, (l) => { l.reviews.push({ kind: 'owner', by: '날쌤', date: '2026-12-01', result: 'fix' }); }, '날쌤 승인(owner)의 마지막 기록이 fix 입니다');
  publishedFails(ONE, (l) => { l.facts[0].checks.push({ by: 'ai:검증자C', date: '2026-11-21', verdict: 'disputed' }); },
    '사실 f1: 마지막 확인 기록이 지금 문장의 confirmed 가 아닙니다 (이의가 남아 있습니다)');
  // fix 뒤에 다시 pass 를 받으면 된다
  sign(ONE);
  const seal = c.sealsOf(ONE).lesson;
  t.edit(ONE, (l) => { l.reviews.push({ kind: 'voice', by: 'x', date: '2026-12-01', result: 'fix' }, { kind: 'voice', by: 'x', date: '2026-12-02', result: 'pass', seal }); });
  assert.equal(c.loadLesson(ONE).status, 'published');
  t.reset();
});

test('혼자서는 공개할 수 없다', () => {
  // 한 사람이 두 번 확인
  sign(ONE, { publish: false, checkers: ['ai:검증자A', 'ai:검증자A'] });
  t.edit(ONE, (l) => { l.status = 'published'; });
  failsWith(() => c.loadLesson(ONE), '사실 f1: 지금 문장을 확인한 이가 1명입니다. 서로 다른 둘의 confirmed 확인이 필요합니다');
  t.reset();
  // 승인은 사람이
  sign(ONE, { publish: false, owner: 'ai:claude' });
  t.edit(ONE, (l) => { l.status = 'published'; });
  failsWith(() => c.loadLesson(ONE), '날쌤 승인(owner)은 사람이 적습니다');
  t.reset();
});

test('공개하려면 사실마다 근거 구절이 있어야 한다', () => {
  t.edit(ONE, (l) => { delete l.facts[0].sources[0].quote; });
  sign(ONE, { publish: false });
  assert.deepEqual(c.publishGaps(ONE), ['사실 f1: 출처의 근거 구절(quote)이 없습니다']);
  t.edit(ONE, (l) => { l.status = 'published'; });
  failsWith(() => c.loadLesson(ONE), '사실 f1: 출처의 근거 구절(quote)이 없습니다');
  t.reset();
});

test('공개된 차시는 공개된 묶음만 가리킬 수 있다', () => {
  sign(REVIEW, { publish: false });
  // 남은 것을 묻는 함수가 네 번째 조건(가리키는 묶음도 공개)까지 알려 준다. 빈 목록이면 정말로 공개할 수 있다.
  assert.deepEqual(c.publishGaps(REVIEW), [
    '가리키는 5-2/1/01 묶음이 아직 초안입니다. 공개된 차시는 공개된 묶음만 가리킬 수 있습니다',
    '가리키는 5-2/1/02-03 묶음이 아직 초안입니다. 공개된 차시는 공개된 묶음만 가리킬 수 있습니다',
  ]);
  t.edit(REVIEW, (l) => { l.status = 'published'; });
  failsWith(() => c.loadLesson(REVIEW), 'status: 공개(published)할 수 없습니다. 가리키는 5-2/1/01 묶음이 아직 초안입니다');
  t.reset();
  // 가리키는 묶음을 먼저 공개하면 된다
  sign(ONE); sign(TWO); sign(REVIEW);
  assert.deepEqual(c.publishGaps(REVIEW), []);
  assert.equal(c.loadLesson(REVIEW).status, 'published');
  delete process.env.SHOW_DRAFTS;
  assert.deepEqual(c.visibleLessons().map((x) => x.id), [ONE, TWO, REVIEW]);
  process.env.SHOW_DRAFTS = '1';
  // 앞 묶음이 고쳐져 공개 조건을 잃으면 뒤 묶음도 읽지 못한다 (빌려 오지 않은 글을 고쳤으므로 뒤 묶음의 지문은 그대로다)
  const before = c.sealsOf(REVIEW).lesson;
  t.edit(ONE, (l) => { l.title = '고친 제목'; });
  failsWith(() => c.loadLesson(REVIEW), '가리키는 5-2/1/01 묶음이 공개 조건을 잃었습니다. 그 묶음부터 바로잡습니다 (남은 것은 publishGaps("5-2/1/01") 가 알려 줍니다)');
  assert.equal(c.sealsOf(REVIEW).lesson, before);
  t.reset();
});

test('공개된 차시를 고칠 때: 그 차시를 가리키는 공개된 묶음도 draft 로 되돌려야 미리 보기가 돈다', () => {
  sign(ONE); sign(TWO); sign(REVIEW);
  // 빌려 가지 않은 글(교사 메모)을 고치고 01 만 draft 로 되돌렸다
  t.edit(ONE, (l) => { l.slides[0].notes = '교사 메모를 고침'; l.status = 'draft'; });
  assert.equal(c.loadLesson(ONE).status, 'draft');
  // 01 을 가리키는 공개된 묶음(02-03, 05)에서 목록 전체가 멈춘다. 문구가 손대지 않은 그 묶음에서 무엇을 할지 알려 준다.
  const WAIT = '이 묶음도 status 를 draft 로 둡니다 (가리키는 묶음을 고치는 중이면 같은 커밋에서 draft 로 되돌립니다)';
  for (const list of [() => c.visibleLessons(), () => c.lessonPaths()]) failsWith(list, '5-2/1/02-03/lesson.yaml', '가리키는 5-2/1/01 묶음이 아직 초안입니다', WAIT);
  const message = failsWith(() => c.loadLesson(REVIEW), '가리키는 5-2/1/01 묶음이 아직 초안입니다', '가리키는 5-2/1/02-03 묶음이 공개 조건을 잃었습니다. 그 묶음부터 바로잡습니다', WAIT, '빌려 온 사실·그림·카드가 그대로이면 이 묶음의 검수 기록은 그대로 맞습니다');
  // 이 묶음의 기록은 낡지 않았으므로 "고친 차시"에 붙이는 말은 붙이지 않는다
  assert.ok(!message.includes('공개된 차시를 고칠 때는'));
  // 지문과 검수 상태는 그동안에도 읽힌다
  assert.deepEqual(c.reviewState(REVIEW), { fact: 'pass', originality: 'pass', voice: 'pass', print: 'pass', owner: 'pass' });
  // 가리키는 묶음도 draft 로 되돌리면 미리 보기에서 넷이 다 읽힌다
  t.edit(TWO, (l) => { l.status = 'draft'; }); t.edit(REVIEW, (l) => { l.status = 'draft'; });
  assert.deepEqual(c.visibleLessons().map((x) => x.status), ['draft', 'draft', 'draft', 'draft']);
  assert.equal(c.lessonPaths().length, 4);
  // 01 을 다시 검수해 공개한다. 빌려 간 것이 그대로이므로 뒤 묶음은 검수 기록이 그대로 맞고, status 만 되돌리면 된다.
  sign(ONE);
  for (const id of [TWO, REVIEW]) {
    assert.deepEqual(c.publishGaps(id), [], id);
    t.edit(id, (l) => { l.status = 'published'; });
  }
  delete process.env.SHOW_DRAFTS;
  assert.deepEqual(c.visibleLessons().map((x) => x.id), [ONE, TWO, REVIEW]);
  process.env.SHOW_DRAFTS = '1';
  t.reset();
  // 고친 차시 자신에게는 "draft 로 되돌립니다"만 붙는다 (가리키는 묶음 이야기는 붙이지 않는다)
  sign(ONE);
  t.edit(ONE, (l) => { l.title = '고친 제목'; });
  assert.ok(!failsWith(() => c.loadLesson(ONE), '공개된 차시를 고칠 때는 같은 커밋에서 status 를 draft 로 되돌립니다').includes('가리키는 묶음'));
  t.reset();
});

test('공개된 차시에 출처 없는 사실을 보태도 지문과 남은 검수를 읽을 수 있다', () => {
  sign(ONE);
  t.edit(ONE, (l) => { l.facts.push({ id: 'f9', claim: '새로 보탠 사실 문장이다.' }); l.slides[0].facts = ['f9']; });
  // 페이지와 빌드는 멈추고, 남은 것을 한꺼번에 알려 준다 (출처 한 줄에 가려지지 않는다)
  failsWith(() => c.loadLesson(ONE), '사실 f9: 공개 출처가 없습니다', '사실 f9: 지금 문장을 확인한 이가 0명입니다', '사실 대조(fact)를 통과한 뒤에 내용이 바뀌었습니다', '공개된 차시를 고칠 때는');
  assert.match(c.sealsOf(ONE).lesson, /^[0-9a-f]{12}$/);
  assert.match(c.sealsOf(ONE).facts.f9, /^[0-9a-f]{12}$/);
  assert.equal(c.reviewState(ONE).fact, 'stale');
  assert.ok(c.publishGaps(ONE).includes('사실 f9: 공개 출처가 없습니다'));
  t.reset();
});

test('줄 끝만 다른 그림·명세(Windows 에서 꺼낸 저장소)는 지문이 같다', () => {
  const svg = path.join(path.dirname(t.file(ONE)), 'media', 'stone.svg');
  const eol = (end: string) => { for (const f of [t.file(ONE), svg]) { fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r?\n/g, end)); t.touch(f); } };
  // 줄 끝이 LF 일 때 검수를 마치고 공개했다
  eol('\n');
  sign(ONE);
  const before = c.sealsOf(ONE);
  const lf = fileSeal(svg);
  // 같은 커밋을 줄 끝이 CRLF 인 채로 꺼냈다
  eol('\r\n');
  assert.ok(fs.readFileSync(svg, 'utf8').includes('\r\n') && fs.readFileSync(t.file(ONE), 'utf8').includes('\r\n'));
  assert.equal(fileSeal(svg), lf);
  assert.deepEqual(c.sealsOf(ONE), before);
  assert.equal(c.loadLesson(ONE).status, 'published');
  // 줄 끝 말고 다른 것이 바뀌면 지문이 달라진다
  fs.writeFileSync(svg, fs.readFileSync(svg, 'utf8').replace('#132c3d', '#000000')); t.touch(svg);
  assert.notEqual(fileSeal(svg), lf);
  // 글 파일이 아닌 그림(png)은 바이트 그대로 본다
  const png = path.join(path.dirname(t.file(TWO)), 'media', 'sample.png');
  const raw = fileSeal(png);
  fs.writeFileSync(png, Buffer.concat([fs.readFileSync(png), Buffer.from('\r\n')]));
  const crlf = fileSeal(png);
  fs.writeFileSync(png, Buffer.concat([fs.readFileSync(png).subarray(0, -2), Buffer.from('\n')]));
  assert.notEqual(crlf, raw);
  assert.notEqual(fileSeal(png), crlf);
  t.reset();
});

test('단원 덱에 모은 카드의 그림이 더 앞 묶음의 것이어도 지문에 들어간다', () => {
  // 02-03 의 카드가 01 의 그림을 쓰고, 05 는 02-03 의 카드를 모은다. 05 가 01/extra 를 직접 가리키는 곳은 없다.
  t.edit(ONE, (l) => { l.media.push({ id: 'extra', kind: 'drawing', file: 'media/stone.svg', alt: '처음 설명', credit: { holder: '시험용 그린이', licence: 'original' }, facts: ['f1'] }); });
  t.edit(TWO, (l) => { l.assets.cards.cards[0].media = '01/extra'; });
  const card = c.deckCards(c.loadLesson(REVIEW)).find((d) => d.media === '01/extra')!;
  assert.equal(c.getMedia(card.lesson, card.media!).alt, '처음 설명');
  sign(ONE); sign(TWO); sign(REVIEW);
  const before = c.sealsOf(REVIEW).lesson;
  // 01 에서 그 그림의 설명과 권리 정보를 바꾸고, 01 과 02-03 은 다시 검수를 받았다
  t.edit(ONE, (l) => { const m = l.media.at(-1); m.alt = '바뀐 설명'; m.credit.holder = '다른 그린이'; });
  sign(ONE); sign(TWO);
  // 05 의 덱에 찍히는 그림이 바뀌었으므로 05 의 옛 검수 기록은 치지 않는다
  assert.notEqual(c.sealsOf(REVIEW).lesson, before);
  assert.equal(c.reviewState(REVIEW).print, 'stale');
  failsWith(() => c.loadLesson(REVIEW), '화면·인쇄 점검(print)를 통과한 뒤에 내용이 바뀌었습니다');
  t.reset();
});

test('앞 묶음에서 빌려 온 사실·그림·카드를 고치면 뒤 묶음도 다시 검수해야 한다', () => {
  const STALE = { fact: 'stale', originality: 'stale', voice: 'stale', print: 'stale', owner: 'stale' };
  const borrowedChange = (change: () => void) => {
    sign(ONE); sign(TWO); sign(REVIEW);
    const before = c.sealsOf(REVIEW).lesson;
    change();
    sign(ONE); // 앞 묶음은 고친 뒤 다시 검수를 받아 공개되었다
    assert.equal(c.loadLesson(ONE).status, 'published');
    try {
      // 뒤 묶음은 손대지 않았지만, 찍어 내는 것이 바뀌었으므로 옛 검수 기록은 치지 않는다
      assert.notEqual(c.sealsOf(REVIEW).lesson, before);
      assert.deepEqual(c.reviewState(REVIEW), STALE);
      failsWith(() => c.loadLesson(REVIEW), '사실 대조(fact)를 통과한 뒤에 내용이 바뀌었습니다', '날쌤 승인(owner)를 통과한 뒤에 내용이 바뀌었습니다');
    } finally { t.reset(); }
  };
  // 뒤 묶음의 퀴즈가 가리키는 사실의 문장 (01/f2)
  borrowedChange(() => t.edit(ONE, (l) => { l.facts[1].claim = '시험용 연표의 첫 해는 1392년이라고 한다.'; }));
  // 단원 덱에 모인 카드의 뒷면
  borrowedChange(() => t.edit(ONE, (l) => { l.assets.cards.cards[1].back = '고친 뒷면'; }));
  // 뒷면을 적지 않은 카드는 낱말 풀이가 찍힌다
  borrowedChange(() => t.edit(ONE, (l) => { l.terms.new[0].meaning = '돌을 높이 쌓은 것'; }));
  // 뒤 묶음이 싣는 그림의 권리 정보와 파일 내용 (01/stone)
  borrowedChange(() => t.edit(ONE, (l) => { l.media[0].credit.holder = '다른 그린이'; }));
  borrowedChange(() => {
    const svg = path.join(path.dirname(t.file(ONE)), 'media', 'stone.svg');
    fs.writeFileSync(svg, fs.readFileSync(svg, 'utf8').replace('#132c3d', '#000000'));
    t.touch(svg);
  });
  // 빌려 온 적 없는 것을 고치면 뒤 묶음의 지문은 그대로다
  sign(ONE); sign(TWO); sign(REVIEW);
  const before = c.sealsOf(REVIEW).lesson;
  t.edit(ONE, (l) => { l.objectives[0] = '고친 목표를 말한다.'; });
  assert.equal(c.sealsOf(REVIEW).lesson, before);
  t.reset();
});

test('공개된 차시를 고친 뒤에도 지문과 남은 검수를 읽을 수 있다 (다시 서명할 수 있다)', () => {
  sign(ONE);
  t.edit(ONE, (l) => { l.slides[0].subtitle = '고친 부제'; });
  // 페이지와 빌드는 멈춘다. 무엇을 해야 하는지가 문구에 있다.
  failsWith(() => c.loadLesson(ONE), 'npm run sign', '공개된 차시를 고칠 때는 같은 커밋에서 status 를 draft 로 되돌립니다');
  failsWith(() => c.visibleLessons(), 'status: 공개(published)할 수 없습니다');
  // 지문·검수 상태·남은 것은 읽힌다
  const seals = c.sealsOf(ONE);
  assert.match(seals.lesson, /^[0-9a-f]{12}$/);
  assert.deepEqual(c.reviewState(ONE), { fact: 'stale', originality: 'stale', voice: 'stale', print: 'stale', owner: 'stale' });
  assert.equal(c.publishGaps(ONE).length, 5);
  // status 를 draft 로 되돌리면 미리 보기에서 읽히고, 다시 검수한 뒤 공개한다
  t.edit(ONE, (l) => { l.status = 'draft'; });
  assert.equal(c.loadLesson(ONE).status, 'draft');
  assert.deepEqual(c.sealsOf(ONE), seals);
  sign(ONE);
  assert.equal(c.loadLesson(ONE).status, 'published');
  t.reset();
  // 처음부터 검수 기록이 없는 차시에는 draft 로 되돌리라는 말을 붙이지 않는다
  t.edit(ONE, (l) => { l.status = 'published'; });
  assert.ok(!failsWith(() => c.loadLesson(ONE), '기록이 없습니다').includes('draft 로 되돌립니다'));
  t.reset();
});

test('베끼기 검사의 통과는 검사 도구가 적은 기록만 친다', () => {
  for (const by of ['ai:다듬기', '날쌤', 'copy-guard', 'copy-guard@XYZ']) {
    sign(ONE, { publish: false });
    t.edit(ONE, (l) => { l.reviews.find((r: Raw) => r.kind === 'originality').by = by; });
    assert.equal(c.reviewState(ONE).originality, 'none', by);
    assert.deepEqual(c.publishGaps(ONE), ['베끼기 검사(originality)의 통과 기록은 npm run check:originality -- 5-2/1/01 --record 가 적습니다 (by 가 "copy-guard@…" 인 기록만 칩니다)']);
    t.edit(ONE, (l) => { l.status = 'published'; });
    failsWith(() => c.loadLesson(ONE), 'npm run check:originality -- 5-2/1/01 --record 가 적습니다');
    t.reset();
  }
  assert.match(GUARD, c.COPY_GUARD);
  // 고치라는 기록(fix)은 누가 적어도 친다
  sign(ONE, { publish: false });
  t.edit(ONE, (l) => { l.reviews.push({ kind: 'originality', by: '검수자2', date: '2026-12-01', result: 'fix', note: '교과서 8쪽, 14자' }); });
  assert.equal(c.reviewState(ONE).originality, 'fix');
  t.reset();
});

test('전개도 모듈 파일도 명세의 지문에 들어간다', () => {
  // 모듈은 generators/papercraft/modules/<module>.ts 에 있다. 시험이 끝나면 만든 파일과 폴더를 지운다.
  const name = `contract-test-${process.pid}`;
  const modules = path.join(c.ROOT, 'generators', 'papercraft', 'modules');
  const made = [modules, path.dirname(modules), path.dirname(path.dirname(modules))].filter((d) => !fs.existsSync(d));
  const file = path.join(modules, `${name}.ts`);
  try {
    t.edit(ONE, (l) => {
      l.assets.papercraft = { state: 'ready', title: '시험용 만들기', module: name, pages: 2, print: { per: 'group' }, steps: ['자릅니다.', '붙입니다.'] };
    });
    assert.equal(c.papercraftModuleFile(c.loadLesson(ONE)), file);
    assert.equal(c.papercraftModuleFile(c.loadLesson(TWO)), undefined);
    const none = c.sealsOf(ONE).lesson;
    fs.mkdirSync(modules, { recursive: true });
    fs.writeFileSync(file, 'export default { sheets: () => [{ title: "하나", sub: "", svg: "<svg/>" }] };\n');
    t.touch(file);
    const v1 = c.sealsOf(ONE).lesson;
    assert.notEqual(v1, none);
    assert.equal(v1, lessonSeal(t.read(ONE), path.dirname(t.file(ONE)), { files: [file] }));
    assert.match(fileSeal(file), /^[0-9a-f]{12}$/);
    // 검수를 마친 뒤 도안만 고치면 그 검수는 없는 것이 된다
    sign(ONE);
    fs.writeFileSync(file, 'export default { sheets: () => [{ title: "둘", sub: "", svg: "<svg/>" }] };\n');
    t.touch(file);
    assert.notEqual(c.sealsOf(ONE).lesson, v1);
    failsWith(() => c.loadLesson(ONE), '화면·인쇄 점검(print)를 통과한 뒤에 내용이 바뀌었습니다');
  } finally {
    fs.rmSync(file, { force: true });
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
    t.reset();
  }
});

test('차시표의 글(blurb·focus)도 베끼기 검사 기록을 갖는다', () => {
  assert.equal(c.registryOriginality(), 'none');
  const seal = c.registrySeal();
  assert.match(seal, /^[0-9a-f]{12}$/);
  t.editRegistry((r) => { r.originality = { by: GUARD, date: '2026-11-20', seal }; });
  assert.equal(c.registryOriginality(), 'pass');
  // 교과서에서 가져오는 값(단원명·쪽수)과 기록 자체는 지문에 들지 않는다
  t.editRegistry((r) => { r.semesters[5].units[0].title = '고친 단원명'; r.semesters[5].units[0].bundles[0].pages = [6, 8]; });
  assert.equal(c.registryOriginality(), 'pass');
  // 검사한 뒤에 초점이나 학기 소개를 고치면 그 기록은 없는 것이 된다
  t.editRegistry((r) => { r.semesters[5].units[1].bundles[0].focus = '고친 초점'; });
  assert.equal(c.registryOriginality(), 'stale');
  t.editRegistry((r) => { r.semesters[5].units[1].bundles[0].focus = '명세가 아직 없는 묶음'; r.semesters[5].blurb = '고친 학기 소개'; });
  assert.equal(c.registryOriginality(), 'stale');
  // 손으로 적은 기록은 받지 않는다
  t.editRegistry((r) => { r.originality.by = '날쌤'; });
  failsWith(() => c.loadRegistry(), 'originality · by', '이 기록은 손으로 적지 않습니다. npm run check:originality -- --registry --record 가 적습니다');
  t.reset();
});

test('초안에서도 어떤 검수가 남았는지 볼 수 있다', () => {
  sign(ONE, { publish: false });
  t.edit(ONE, (l) => { l.reviews = l.reviews.filter((r: Raw) => r.kind !== 'owner' && r.kind !== 'print'); l.reviews.push({ kind: 'voice', by: 'x', date: '2026-12-01', result: 'fix' }); });
  assert.deepEqual(c.reviewState(ONE), { fact: 'pass', originality: 'pass', voice: 'fix', print: 'none', owner: 'none' });
  assert.equal(c.loadLesson(ONE).status, 'draft');
  assert.equal(c.reviewedOn(c.loadLesson(ONE)), undefined);
  t.edit(ONE, (l) => { l.tagline = '고친 소개'; });
  assert.equal(c.reviewState(ONE).fact, 'stale');
  t.reset();
});
