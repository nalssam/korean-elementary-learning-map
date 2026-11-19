// 명세 하나만 봐서는 알 수 없는 것: 차시표, 폴더, 그림 파일, 같은 단원의 다른 묶음.
// .cache/tests/ 아래에 시험용 명세의 복사본을 만들어 고쳐 본다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { failsWith, tempContent } from './helpers.ts';

const t = tempContent('loader');
process.env.SHOW_DRAFTS = '1';
after(() => t.cleanup());

const ONE = '5-2/1/01', TWO = '5-2/1/02-03', HEAVY = '5-2/1/04', REVIEW = '5-2/1/05';
type Raw = Record<string, any>;
const semester = (r: Raw) => r.semesters[5];

/** 명세를 고친 뒤 읽어 보고, 끝나면 되돌린다 */
function lessonFails(id: string, change: (l: Raw) => void, load: string, ...fragments: string[]) {
  t.edit(id, change);
  try { failsWith(() => c.loadLesson(load), ...fragments); } finally { t.reset(); }
}
function registryFails(change: (r: Raw) => void, ...fragments: string[]) {
  t.editRegistry(change);
  try { failsWith(() => c.loadRegistry(), ...fragments); } finally { t.reset(); }
}

test('복사본에서도 시험용 명세 넷이 통과한다', () => {
  for (const id of [ONE, TWO, HEAVY, REVIEW]) assert.equal(c.loadLesson(id).id, id);
});

test('고친 파일은 다시 읽는다 (astro dev 에서 명세를 고치면 바로 보인다)', () => {
  assert.equal(c.loadLesson(ONE).title, '시험용 한 차시');
  t.edit(ONE, (l) => { l.title = '고친 제목'; });
  assert.equal(c.loadLesson(ONE).title, '고친 제목');
  // 가리키는 앞 묶음이 바뀌면 뒤 묶음도 다시 읽는다
  assert.equal(c.deckCards(c.loadLesson(REVIEW)).length, 9);
  t.edit(ONE, (l) => { l.assets.cards.cards.push({ front: '모래', back: '아주 작은 돌', facts: ['f1'] }); });
  assert.equal(c.deckCards(c.loadLesson(REVIEW)).length, 10);
  // 차시표가 바뀌어도 다시 읽는다
  t.editRegistry((r) => { semester(r).units[0].bundles[0].focus = '고친 초점'; });
  assert.equal(c.bundleOf(ONE).bundle.focus, '고친 초점');
  t.reset();
  assert.equal(c.loadLesson(ONE).title, '시험용 한 차시');
});

test('id 는 파일이 놓인 폴더와 같아야 한다', () => {
  lessonFails(ONE, (l) => { l.id = '5-2/1/04'; }, ONE, 'id: 파일이 놓인 폴더(5-2/1/01)와 다릅니다 (지금: 5-2/1/04)', 'id 를 5-2/1/01 로 고칩니다');
});

test('차시표에 없는 폴더, 명세가 없는 묶음', () => {
  failsWith(() => c.loadLesson('5-2/1/99'), '차시표(content/registry.yaml)에 5-2/1/99 가 없습니다');
  failsWith(() => c.loadLesson('5-2/2/01'), '5-2/2/01 묶음의 명세(lesson.yaml)가 아직 없습니다');
  // 폴더 이름을 잘못 적으면 조용히 빠지지 않고 orphanLessons 에 나온다
  const wrong = path.join(t.dir, '5-2', '1', '2');
  fs.mkdirSync(wrong, { recursive: true });
  fs.copyFileSync(t.file(ONE), path.join(wrong, 'lesson.yaml'));
  try { assert.deepEqual(c.orphanLessons(), ['5-2/1/2']); } finally { t.reset(); }
  assert.deepEqual(c.orphanLessons(), []);
});

test('이름을 잘못 적은 명세 파일도 조용히 빠지지 않는다 (lesson.yml, Lesson.yaml, lesson.yaml.txt)', () => {
  // 로더는 소문자 lesson.yaml 만 읽는다. 다른 이름은 페이지도 오류도 없이 빠지고 있었다.
  // Lesson.yaml 은 대소문자를 가리지 않는 컴퓨터(macOS, Windows)에서는 읽히다가 배포하는 리눅스에서 빠진다.
  const dir = (id: string) => path.dirname(t.file(id));
  fs.mkdirSync(dir('5-2/2/01'), { recursive: true });
  fs.copyFileSync(t.file(ONE), path.join(dir('5-2/2/01'), 'lesson.yml'));
  fs.renameSync(t.file(HEAVY), path.join(dir(HEAVY), 'Lesson.yaml'));
  fs.copyFileSync(t.file(TWO), path.join(dir(TWO), 'lesson.yaml.txt'));
  try {
    assert.deepEqual(c.orphanLessons(), ['5-2/1/02-03/lesson.yaml.txt', '5-2/1/04/Lesson.yaml', '5-2/2/01/lesson.yml']);
    assert.ok(!c.lessonIds().includes('5-2/2/01') && !c.lessonIds().includes(HEAVY));
  } finally { t.reset(); }
  assert.deepEqual(c.orphanLessons(), []);
});

test('명세에 적은 그림 파일이 있어야 한다', () => {
  lessonFails(ONE, (l) => { l.media[0].file = 'media/missing.svg'; }, ONE, 'media · stone: 파일이 없습니다 (media/missing.svg)');
});

test('그림 파일은 묶음의 media/ 폴더에 그대로 있어야 한다 (바로 가기는 받지 않는다)', () => {
  // 바로 가기(심볼릭 링크)를 그대로 복사하면 묶음 밖의 파일이 사이트에 실린다 (명세는 낯선 사람의 PR 로도 들어온다)
  const media = path.join(path.dirname(t.file(ONE)), 'media');
  const outside = path.join(t.dir, '..', 'outside.svg');
  fs.writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const expected = 'media · stone: 그림 파일을 이 묶음의 media/ 폴더에 그대로 넣습니다. 바로 가기(심볼릭 링크)이거나 파일 이름의 대소문자가 다릅니다 (media/stone.svg)';
  try {
    // 파일 하나가 바로 가기
    fs.rmSync(path.join(media, 'stone.svg'));
    fs.symlinkSync(outside, path.join(media, 'stone.svg'));
    t.touch(t.file(ONE));
    failsWith(() => c.loadLesson(ONE), expected);
    // media 폴더가 바로 가기
    fs.rmSync(media, { recursive: true });
    fs.mkdirSync(path.join(t.dir, '..', 'elsewhere'));
    fs.copyFileSync(outside, path.join(t.dir, '..', 'elsewhere', 'stone.svg'));
    fs.symlinkSync(path.join(t.dir, '..', 'elsewhere'), media);
    t.touch(t.file(ONE));
    failsWith(() => c.loadLesson(ONE), expected);
  } finally {
    fs.rmSync(media, { recursive: true, force: true });
    fs.rmSync(path.join(t.dir, '..', 'elsewhere'), { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
    t.reset();
  }
  assert.equal(c.loadLesson(ONE).id, ONE);
});

test('UTF-8 이 아닌 파일과 빈 파일은 무엇을 할지 한 줄로 알려 준다', () => {
  const text = fs.readFileSync(t.file(ONE));
  try {
    fs.writeFileSync(t.file(ONE), Buffer.concat([text, Buffer.from('# '), Buffer.from([0xb0, 0xed, 0xc0, 0xce, 0xb5, 0xb9]), Buffer.from('\n')]));
    t.touch(t.file(ONE));
    failsWith(() => c.loadLesson(ONE), '파일이 UTF-8 로 저장되어 있지 않아 한글이 깨졌습니다');
    fs.writeFileSync(t.file(ONE), '');
    t.touch(t.file(ONE));
    failsWith(() => c.loadLesson(ONE), '파일이 비어 있습니다. 내용을 적습니다 (차시 명세는 docs/template/lesson.yaml 을 복사해 시작합니다)');
    // 차시표도 같은 길로 읽는다
    fs.writeFileSync(path.join(t.dir, 'registry.yaml'), '# 비어 있음\n');
    t.touch(path.join(t.dir, 'registry.yaml'));
    failsWith(() => c.loadRegistry(), '파일이 비어 있습니다');
  } finally { t.reset(); }
});

test('사실이 없는 명세는 단원 정리 묶음만', () => {
  lessonFails(HEAVY, (l) => {
    l.facts = []; l.terms = { new: [] }; l.slides.forEach((s: Raw) => delete s.facts); l.flow.forEach((s: Raw) => delete s.facts);
    l.worksheet.pages[0].blocks.shift(); delete l.worksheet.facts;
    l.quiz.items.forEach((q: Raw) => { q.facts = ['01/f1']; });
    l.assets.web_activity.activity.facts = []; l.assets.cards = { state: 'skip', reason: 'x' }; l.flow[2].uses = ['quiz'];
    l.sensitivity = { level: 'care' };
  }, HEAVY, 'facts: 이 차시의 사실을 하나 이상 적습니다 (단원 정리 묶음만 비워 둘 수 있습니다)');
});

test('단원 덱은 단원 정리 묶음에서만', () => {
  lessonFails(TWO, (l) => { l.assets.cards.collect = [{ label: '가', bundles: ['01'] }]; }, TWO, '단원 덱은 단원 정리(차시표의 role: review) 묶음에서만 만듭니다');
});

test('다른 묶음을 가리킬 때: 같은 단원의 앞 묶음만', () => {
  // 뒤 묶음
  lessonFails(ONE, (l) => { l.quiz.items[0].facts = ['02-03/f1']; }, ONE, 'quiz · items · 1번째 · facts · 1번째', '같은 단원에서 이 묶음보다 앞에 있는 묶음만 가리킬 수 있습니다 (02-03)');
  // 자기 자신
  lessonFails(TWO, (l) => { l.quiz.items[0].facts = ['02-03/f1']; }, TWO, '앞에 있는 묶음만 가리킬 수 있습니다');
  // 차시표에 없는 묶음
  lessonFails(REVIEW, (l) => { l.quiz.items[0].facts = ['09/f1']; }, REVIEW, '앞에 있는 묶음만 가리킬 수 있습니다 (09)');
  // 앞 묶음에 없는 사실·그림. 묶음 사이 검사의 문구에도 줄 번호가 붙는다.
  lessonFails(REVIEW, (l) => { l.quiz.items[0].facts = ['01/f9']; }, REVIEW, '없는 사실 id 입니다: 01/f9');
  t.edit(REVIEW, (l) => { l.quiz.items[0].facts = ['01/f9']; });
  try {
    const line = fs.readFileSync(t.file(REVIEW), 'utf8').split('\n').findIndex((s) => s.includes('01/f9')) + 1;
    failsWith(() => c.loadLesson(REVIEW), `${line}번째 줄 · quiz · items · 1번째 · facts · 1번째: 없는 사실 id 입니다: 01/f9`);
  } finally { t.reset(); }
  lessonFails(REVIEW, (l) => { l.slides[1].media = '01/nope'; }, REVIEW, 'slides · 2번째 · media', '없는 그림 id 입니다: 01/nope');
  // 앞 묶음의 명세에 고칠 곳이 있으면 뒤 묶음도 읽지 못한다
  lessonFails(ONE, (l) => { l.flow[0].phase = '정리'; }, REVIEW, '5-2/1/01 묶음의 명세에 고칠 곳이 있어 읽지 못했습니다');
});

test('다른 묶음의 것을 가리켜도 쓸 수 없는 자리는 같다', () => {
  // 피해를 담은 사실을 다른 묶음의 퀴즈가 가리킴
  lessonFails(REVIEW, (l) => { l.quiz.items[0].facts = ['04/f2']; }, REVIEW, '피해를 담은 사실(04/f2)은 퀴즈·카드·놀이 자료가 가리킬 수 없습니다');
  // 앞 묶음의 피해를 담은 사실을 읽기·생각 쓰기에서 가리키는 것은 되지만, 그 차시는 점수를 보여 주지 않아야 한다 (단원 정리지)
  lessonFails(REVIEW, (l) => { l.slides[1].facts = ['04/f2']; l.worksheet.facts = ['04/f2']; }, REVIEW,
    'sensitivity · level: 앞 묶음의 피해를 담은 사실(04/f2)을 가리키면 sensitivity.level 을 care 나 no_play 로 적습니다');
  t.edit(REVIEW, (l) => { l.slides[1].facts = ['04/f2']; l.sensitivity = { level: 'care' }; });
  try { assert.equal(c.scored(c.loadLesson(REVIEW)), false); } finally { t.reset(); }
  assert.equal(c.scored(c.loadLesson(REVIEW)), true);
  // 앞 묶음의 피해를 담은 사실에 기댄 낱말: 낱말 장에서는 가르칠 수 있지만, 뒷면 없는 카드로 만들면 그 풀이가 카드에 찍힌다
  const painfulTerm = (l: Raw) => { l.sensitivity = { level: 'care' }; l.terms = { new: [{ term: '아픈 낱말', meaning: '시험용 풀이', facts: ['04/f2'] }] }; };
  lessonFails(REVIEW, (l) => { painfulTerm(l); l.assets.cards.cards = [{ front: '아픈 낱말', facts: ['01/f1'] }]; }, REVIEW,
    'assets · cards · cards · 1번째 · front: "아픈 낱말" 의 풀이는 피해를 담은 사실에 기대고 있어 카드로 만들지 않습니다');
  // 뒷면을 따로 적은 카드와, 카드로 만들지 않은 낱말은 된다
  t.edit(REVIEW, (l) => { painfulTerm(l); l.assets.cards.cards = [{ front: '아픈 낱말', back: '따로 적은 뒷면', facts: ['01/f1'] }]; });
  try { assert.equal(c.deckCards(c.loadLesson(REVIEW)).at(-1)?.back, '따로 적은 뒷면'); } finally { t.reset(); }
  // 앞 묶음의 지어낸 그림을 그림 한 장으로
  t.edit(ONE, (l) => {
    l.media.push({ id: 'scene', kind: 'drawing', file: 'media/stone.svg', alt: '지어낸 장면', factual: false, credit: { holder: '시험용 그린이', licence: 'original' } });
  });
  t.edit(REVIEW, (l) => { l.slides[1].media = '01/scene'; });
  try { failsWith(() => c.loadLesson(REVIEW), '지어낸 그림(scene)은 수업 화면의 곁그림으로만 씁니다'); } finally { t.reset(); }
});

test('피해를 담은 사실을 그린 그림은 다른 묶음에서도 놀이 자료에 쓸 수 없다', () => {
  const drawing = (id: string, facts: string[]): Raw => ({ id, kind: 'drawing', file: 'media/stone.svg', alt: '시험용 그림', credit: { holder: '시험용 그린이', licence: 'original' }, facts });
  const withPicture = (id: string) => {
    const media = path.join(path.dirname(t.file(id)), 'media');
    fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(path.join(path.dirname(t.file(ONE)), 'media', 'stone.svg'), path.join(media, 'stone.svg'));
  };
  // ① 앞 묶음(no_play)의 그림이 그 묶음의 피해를 담은 사실을 그린 것 → 단원 정리 묶음의 카드에 쓸 수 없다
  withPicture(HEAVY);
  t.edit(HEAVY, (l) => { l.media = [drawing('harm', ['f2'])]; l.slides[1] = { layout: 'picture', title: '그림을 봅시다', media: 'harm', facts: ['f2'] }; });
  assert.equal(c.loadLesson(HEAVY).id, HEAVY);
  // (단원 정리 묶음의 시험용 명세에는 이 묶음의 카드가 없고 모은 카드만 있다)
  t.edit(REVIEW, (l) => { l.assets.cards.cards = [{ front: '시험용 그림', back: '시험용 뒷면', media: '04/harm', facts: ['01/f1'] }]; });
  try {
    failsWith(() => c.loadLesson(REVIEW), 'assets · cards · cards · 1번째 · media: 피해를 담은 사실을 그린 그림(04/harm)은 카드·컬러링·웹 활동에 쓰지 않습니다. 수업 화면과 학습지에서만 씁니다');
    // 같은 그림을 수업 화면에 싣는 것은 된다
    t.edit(REVIEW, (l) => { delete l.assets.cards.cards; l.slides[1] = { layout: 'picture', title: '그림을 봅시다', media: '04/harm' }; });
    assert.deepEqual(c.shownMedia(c.loadLesson(REVIEW), 'slides').map((m) => m.id), ['harm']);
  } finally { t.reset(); }
  // ② 이 묶음의 그림이 앞 묶음의 피해를 담은 사실을 그린 것 → 이 묶음의 카드에 쓸 수 없다
  withPicture(REVIEW);
  t.edit(REVIEW, (l) => {
    l.sensitivity = { level: 'care' };
    l.media = [drawing('harm', ['04/f2'])];
    l.assets.cards.cards = [{ front: '시험용 그림', back: '시험용 뒷면', media: 'harm', facts: ['01/f1'] }];
  });
  try {
    failsWith(() => c.loadLesson(REVIEW), 'assets · cards · cards · 1번째 · media: 피해를 담은 사실을 그린 그림(harm)은 카드·컬러링·웹 활동에 쓰지 않습니다');
    // 같은 그림을 이 묶음의 학습지에 싣는 것은 된다
    t.edit(REVIEW, (l) => { delete l.assets.cards.cards; l.worksheet.pages[0].blocks.push({ type: 'figure', media: 'harm' }); });
    assert.ok(c.shownMedia(c.loadLesson(REVIEW)).some((m) => m.id === 'harm'));
  } finally { t.reset(); }
});

test('단원 덱에 모을 수 없는 묶음', () => {
  lessonFails(REVIEW, (l) => { l.assets.cards.collect[1].bundles.push('04'); }, REVIEW, '5-2/1/04 는 no_play 차시라 단원 덱에 모으지 않습니다');
  lessonFails(ONE, (l) => { l.assets.cards = { state: 'planned', idea: 'x' }; l.flow[1].uses = ['worksheet', 'slides']; }, REVIEW, '5-2/1/01 묶음에는 모을 카드가 없습니다');
  lessonFails(TWO, (l) => { l.assets.cards.cards[1].front = '바위'; }, REVIEW, '앞면이 같은 카드가 두 묶음에 있습니다: "바위" (5-2/1/01, 5-2/1/02-03)');
});

test('차시표: 같은 것을 두 번 적던 칸은 이제 모르는 칸이다', () => {
  registryFails((r) => { semester(r).grade = 5; semester(r).semester = 2; semester(r).source_status = 'complete'; }, 'semesters · 6번째', '모르는 칸 이름입니다: grade, semester, source_status');
  registryFails((r) => { semester(r).units[0].pages = [6, 23]; }, '모르는 칸 이름입니다: pages');
  registryFails((r) => { semester(r).units[0].bundles[0].lessons = [1]; }, '모르는 칸 이름입니다: lessons');
});

test('차시표: 번호와 쪽수', () => {
  registryFails((r) => { r.semesters[4].id = '5-2'; }, '학기 id 가 겹칩니다: 5-2');
  registryFails((r) => { r.semesters.pop(); }, '3-1 부터 6-2 까지 여덟 학기를 모두 적습니다');
  registryFails((r) => { semester(r).units[1].no = 1; }, '단원 번호는 1부터 차례대로 씁니다 (여기는 2)');
  registryFails((r) => { semester(r).units[0].bundles[2].id = '05'; }, '차시 번호가 이어지지 않습니다. 4차시로 시작하는 묶음이 올 자리입니다');
  registryFails((r) => { semester(r).units[0].bundles[1].id = '2-3'; }, '"01" 또는 "03-04"처럼 두 자리 차시 번호로 씁니다');
  registryFails((r) => { semester(r).units[0].bundles[1].id = '03-02'; }, '한 묶음은 1~3차시입니다');
  registryFails((r) => { semester(r).units[0].bundles[1].id = '02-06'; }, '한 묶음은 1~3차시입니다');
  registryFails((r) => { semester(r).units[0].bundles[1].pages = [8, 300]; }, '쪽수가 앞 묶음(9쪽까지)보다 앞에서 시작합니다');
  registryFails((r) => { semester(r).units[0].bundles[1].pages = [15, 10]; }, '쪽수는 [시작, 끝] 순서로 씁니다');
  registryFails((r) => { semester(r).units[0].bundles[1].pages = '10-15'; }, '쪽수는 [시작, 끝]처럼 숫자 두 개로 씁니다');
  registryFails((r) => { semester(r).units[0].bundles[0].role = 'review'; }, '단원마다 review 묶음은 하나까지입니다');
  registryFails((r) => { delete semester(r).units[0].bundles[0].focus; }, 'focus: 꼭 있어야 하는 칸이 빠졌습니다');
});

test('차시표와 단원 덱: 따옴표 없이 적은 01 도 "01" 로 읽는다', () => {
  // YAML 은 01 을 숫자 1 로 읽는다
  t.editRegistry((r) => { semester(r).units[0].bundles[0].id = 1; semester(r).units[1].bundles[0].id = 1; });
  t.edit(REVIEW, (l) => { l.assets.cards.collect[0].bundles = [1]; });
  try {
    assert.deepEqual(c.allBundles().map((b) => b.id), ['5-2/1/01', '5-2/1/02-03', '5-2/1/04', '5-2/1/05', '5-2/2/01']);
    assert.equal(c.deckCards(c.loadLesson(REVIEW)).length, 9);
  } finally { t.reset(); }
});

test('차시표: 성취기준', () => {
  registryFails((r) => { delete semester(r).units[0].standards; }, 'standards', '꼭 있어야 하는 칸이 빠졌습니다', '단원의 성취기준 코드를 하나 이상 적습니다');
  registryFails((r) => { semester(r).units[0].standards = ['[6사04-01]']; }, '"6사05-01"처럼 대괄호 없이 씁니다');
  registryFails((r) => { semester(r).units[0].standards = ['4사01-01']; }, '5-2 학기의 성취기준은 "6사"로 시작합니다');
  registryFails((r) => { semester(r).units[0].standards.push('6사04-09'); }, '성취기준 자료(data/standards/social-2022.json)에 없는 코드입니다: 6사04-09');
  registryFails((r) => { semester(r).units[0].bundles[0].standards = ['6사05-01']; }, '단원의 성취기준(6사04-01, 6사04-02) 가운데에서 고릅니다');
});
