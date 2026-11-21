// 플랫폼 페이지(교과서 목차·자료 유형별·제작 현황·업데이트·내 자료함)가 같이 쓰는 도우미 (lib/content.ts 10절, R41~R52).
// 시험용 명세 넷(모두 초안)과 시험용 업데이트 소식으로 본다. 공개된 차시가 있는 경우는 복사본의 한 차시를 공개해 본다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import {
  ACTIVITY_LABEL, ASSET_LABEL, ASSET_ROUTE, FOOT_LINKS, GROUP_LABEL, GROUP_ORDER, KIND_GROUP, KIND_ORDER, NAV, NAV_TOOLS, OPEN_LABEL, SITE, UPDATE_LABEL,
} from '#lib/site.ts';
import { AssetKind } from '#schema/lesson.ts';
import { UPDATE_KINDS } from '#schema/updates.ts';
import { FIXTURES, failsWith, passRows, tempContent } from './helpers.ts';

const preview = <T>(fn: () => T): T => {
  const saved = process.env.SHOW_DRAFTS;
  process.env.SHOW_DRAFTS = '1';
  try { return fn(); } finally { if (saved === undefined) delete process.env.SHOW_DRAFTS; else process.env.SHOW_DRAFTS = saved; }
};
const publicBuild = <T>(fn: () => T): T => {
  const saved = process.env.SHOW_DRAFTS;
  delete process.env.SHOW_DRAFTS;
  try { return fn(); } finally { if (saved !== undefined) process.env.SHOW_DRAFTS = saved; }
};
const fixtures = () => { process.env.CONTENT_DIR = FIXTURES; };
after(() => { delete process.env.CONTENT_DIR; });

test('사이트 이름과 길잡이 (R40, R42, R54)', () => {
  assert.equal(SITE.name, 'nalssam의 초등사회콘텐츠 클라우드');
  assert.equal(`${SITE.nameLead} ${SITE.shortName}`, SITE.name);
  assert.equal(SITE.shortName, '초등사회콘텐츠 클라우드');
  assert.deepEqual(NAV.map((n) => n.label), ['교과서 자료', '자료 유형별', '업데이트', '제작 현황', '소개']);
  assert.deepEqual(NAV.map((n) => ('route' in n ? n.route : undefined)), [undefined, '/types/', '/updates/', '/status/', '/about/']);
  assert.deepEqual([NAV_TOOLS.search.label, NAV_TOOLS.my.label, NAV_TOOLS.my.route], ['찾기', '내 자료함', '/my/']);
  assert.deepEqual(FOOT_LINKS.map((l) => l.label), ['소개', '이용 조건', '오류 제보', '깃허브 저장소']);
  assert.equal(FOOT_LINKS[3].url, SITE.repo);
});

test('자료 종류의 차례와 갈래 (R43, R46, R47)', () => {
  // 열 가지가 한 번씩, 정한 차례대로
  assert.deepEqual([...KIND_ORDER].sort(), [...AssetKind.options].sort());
  assert.deepEqual(KIND_ORDER.map((k) => ASSET_LABEL[k]), ['수업 화면', '학습지', '확인 퀴즈', '웹 활동', '페이퍼크래프트', '카드', '컬러링 도안', '만들기 세트', '방탈출', '3D·가상 체험']);
  assert.deepEqual(GROUP_ORDER.map((g) => GROUP_LABEL[g]), ['수업', '인쇄', '학생 활동']);
  const inGroup = (g: string) => KIND_ORDER.filter((k) => KIND_GROUP[k] === g);
  assert.deepEqual(inGroup('class'), ['slides']);
  assert.deepEqual(inGroup('print'), ['worksheet', 'papercraft', 'cards', 'coloring', 'making_kit']);
  assert.deepEqual(inGroup('student'), ['quiz', 'web_activity', 'escape', 'virtual3d']);
  assert.deepEqual([OPEN_LABEL.slides, OPEN_LABEL.worksheet, OPEN_LABEL.quiz, OPEN_LABEL.making_kit], ['띄우기', '인쇄 페이지', '열기', '열기']);
  assert.deepEqual(UPDATE_KINDS.map((k) => UPDATE_LABEL[k]), ['새 자료', '고침', '알림']);
  assert.deepEqual(Object.values(ACTIVITY_LABEL), ['분류하기', '짝 맞추기', '차례 맞추기', '그림에 이름표 놓기']);
});

test('readyKinds·formatLine: 준비된 자료와 한 줄 설명', () => {
  fixtures();
  preview(() => {
    const one = c.loadLesson('5-2/1/01');
    const two = c.loadLesson('5-2/1/02-03');
    assert.deepEqual(c.readyKinds(one), ['slides', 'worksheet', 'quiz', 'web_activity', 'cards']);
    assert.deepEqual(c.readyKinds(two), ['slides', 'worksheet', 'quiz', 'web_activity', 'papercraft', 'cards', 'coloring', 'making_kit']);
    assert.deepEqual(c.readyKinds(one).map((k) => c.formatLine(one, k)), ['PPTX 5장', 'PDF · A4 1쪽', '휴대폰·태블릿 · 3문항', '휴대폰·태블릿 · 분류하기', 'PDF · A4 2쪽']);
    // 가로 학습지는 가로라고 밝힌다. 만들기 세트는 수업 밖 활동과 재료 수
    assert.deepEqual(c.readyKinds(two).map((k) => c.formatLine(two, k)), [
      'PPTX 8장', 'PDF · A4 가로 2쪽', '휴대폰·태블릿 · 4문항', '휴대폰·태블릿 · 그림에 이름표 놓기', 'PDF · A4 3쪽', 'PDF · A4 2쪽', 'PDF · A4 1쪽', '수업 밖 활동 · 재료 2가지',
    ]);
    // 준비되지 않은 자료에는 설명이 없다
    assert.equal(c.formatLine(one, 'papercraft'), undefined);
    assert.equal(c.formatLine(one, 'escape'), undefined);
  });
  // 수업 안에서 하는 만들기는 걸리는 시간을 앞에 둔다
  const t = tempContent('platform-kit');
  try {
    t.edit('5-2/1/02-03', (l) => { l.assets.making_kit.when = 'in_class'; l.assets.making_kit.minutes = 20; });
    preview(() => assert.equal(c.formatLine(c.loadLesson('5-2/1/02-03'), 'making_kit'), '수업 안 20분 · 재료 2가지'));
  } finally { t.cleanup(); }
});

test('catalog(): 실리는 차시의 준비된 자료 전부, 차시표 차례 다음 KIND_ORDER 차례', () => {
  fixtures();
  const items = preview(() => c.catalog());
  assert.deepEqual(items.map((i) => i.key), [
    '5-2/1/01#slides', '5-2/1/01#worksheet', '5-2/1/01#quiz', '5-2/1/01#web_activity', '5-2/1/01#cards',
    '5-2/1/02-03#slides', '5-2/1/02-03#worksheet', '5-2/1/02-03#quiz', '5-2/1/02-03#web_activity', '5-2/1/02-03#papercraft', '5-2/1/02-03#cards', '5-2/1/02-03#coloring', '5-2/1/02-03#making_kit',
    '5-2/1/04#slides', '5-2/1/04#worksheet', '5-2/1/04#quiz', '5-2/1/04#web_activity', '5-2/1/04#cards',
    '5-2/1/05#slides', '5-2/1/05#worksheet', '5-2/1/05#quiz', '5-2/1/05#web_activity', '5-2/1/05#cards',
  ]);
  const at = (key: string) => items.find((i) => i.key === key)!;
  assert.deepEqual(at('5-2/1/01#slides'), {
    key: '5-2/1/01#slides', lessonId: '5-2/1/01', kind: 'slides', label: '수업 화면', title: '시험용 한 차시', lessonTitle: '시험용 한 차시',
    semester: '5-2', unit: 1, lessonsLabel: '1차시', pagesLabel: '6~9쪽', course: '5학년 2학기 1단원 1차시',
    route: '/5-2/1/01/slides/', file: { route: '/files/5-2/1/01/slides.pptx', name: '5-2_1단원_1차시_수업 화면.pptx' },
    format: 'PPTX 5장', thumb: '/files/5-2/1/01/thumbs/slides.jpg', draft: true,
  });
  // 자료의 이름은 명세에 적은 그 자료의 title, 없으면 차시의 title
  assert.equal(at('5-2/1/01#worksheet').title, '시험용 학습지');
  assert.equal(at('5-2/1/01#quiz').title, '시험용 한 차시');
  assert.equal(at('5-2/1/02-03#papercraft').title, '시험용 종이 돌');
  // 학생 페이지에는 내려받는 파일이 없고, 웹 활동의 주소 조각은 play 다
  assert.equal(at('5-2/1/01#quiz').file, undefined);
  assert.equal(at('5-2/1/01#web_activity').route, '/5-2/1/01/play/');
  assert.equal(at('5-2/1/01#web_activity').thumb, '/files/5-2/1/01/thumbs/web_activity.jpg');
  assert.deepEqual(at('5-2/1/02-03#worksheet').file, { route: '/files/5-2/1/02-03/worksheet.pdf', name: '5-2_1단원_2~3차시_학습지.pdf' });
  // 만들기 세트는 페이지가 없어 차시 자료실 안의 자리로 가고, 미리보기 그림도 파일도 없다
  const kit = at('5-2/1/02-03#making_kit');
  assert.deepEqual([kit.route, kit.thumb, kit.file], ['/5-2/1/02-03/#making-kit', undefined, undefined]);
  // 미리보기 그림은 페이지가 있는 자료마다 있다
  for (const i of items) assert.equal(Boolean(i.thumb), i.kind in ASSET_ROUTE, i.key);
  // 공개 빌드에는 초안의 자료가 없다 (시험용 차시는 모두 초안)
  assert.deepEqual(publicBuild(() => c.catalog()), []);
});

test('catalog(): 공개된 차시는 공개 빌드에 실리고 draft 가 false 다', () => {
  const t = tempContent('platform-public');
  try {
    const seals = preview(() => c.sealsOf('5-2/1/01'));
    t.edit('5-2/1/01', (l) => {
      for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
      l.reviews = passRows(seals.lesson);
      l.status = 'published';
    });
    const open = publicBuild(() => c.catalog());
    assert.deepEqual(open.map((i) => i.key), ['5-2/1/01#slides', '5-2/1/01#worksheet', '5-2/1/01#quiz', '5-2/1/01#web_activity', '5-2/1/01#cards']);
    assert.ok(open.every((i) => !i.draft));
    // 미리 보기에서는 공개된 것과 초안이 함께 나오고, 초안만 draft 다
    const all = preview(() => c.catalog());
    assert.deepEqual([...new Set(all.filter((i) => i.draft).map((i) => i.lessonId))], ['5-2/1/02-03', '5-2/1/04', '5-2/1/05']);
    // 진행: 공개 빌드는 초안을 세지 않는다
    assert.deepEqual(publicBuild(() => c.semesterProgress('5-2')), { total: 6, published: 1, draft: 0, planned: 5 });
    assert.deepEqual(preview(() => c.semesterProgress('5-2')), { total: 6, published: 1, draft: 4, planned: 1 });
    // 공개된 차시의 소식은 공개 빌드에도 보인다. 함께 가리킨 차시가 초안이면 그 소식은 아직 숨는다.
    assert.deepEqual(publicBuild(() => c.visibleUpdates()).map((u) => [u.date, u.title, u.draft]), [
      ['2026-11-03', '시험용 알림', false], ['2026-11-02', '시험용 한 차시를 올렸습니다', false], ['2026-10-30', '시험용 고침', false],
    ]);
  } finally { t.cleanup(); }
});

test('semesterProgress·unitProgress: 묶음이 아니라 차시를 센다', () => {
  fixtures();
  // 1단원: 01(1) + 02-03(2) + 04(1) + 05(1) = 5차시, 2단원: 명세가 없는 01(1)
  assert.deepEqual(preview(() => c.semesterProgress('5-2')), { total: 6, published: 0, draft: 5, planned: 1 });
  assert.deepEqual(publicBuild(() => c.semesterProgress('5-2')), { total: 6, published: 0, draft: 0, planned: 6 });
  assert.deepEqual(preview(() => c.unitProgress('5-2', 1)), { total: 5, published: 0, draft: 5, planned: 0 });
  assert.deepEqual(preview(() => c.unitProgress('5-2', 2)), { total: 1, published: 0, draft: 0, planned: 1 });
  // 차시표가 아직 없는 학기
  assert.deepEqual(preview(() => c.semesterProgress('3-1')), { total: 0, published: 0, draft: 0, planned: 0 });
});

test('lessonNeighbours(): 같은 학기 안에서 차시표의 앞뒤 묶음 (단원을 건너서도)', () => {
  fixtures();
  preview(() => {
    const first = c.lessonNeighbours('5-2/1/01');
    assert.equal(first.prev, undefined);
    assert.deepEqual(first.next, { id: '5-2/1/02-03', unit: 1, lessonsLabel: '2~3차시', pagesLabel: '10~15쪽', ready: true, title: '시험용 두 차시' });
    // 단원 정리 묶음의 다음은 2단원 첫 묶음 (명세가 없어 준비 중)
    assert.deepEqual(c.lessonNeighbours('5-2/1/05').next, { id: '5-2/2/01', unit: 2, lessonsLabel: '1차시', pagesLabel: '24~27쪽', ready: false });
    const last = c.lessonNeighbours('5-2/2/01');
    assert.equal(last.next, undefined);
    assert.equal(last.prev?.id, '5-2/1/05');
  });
  // 공개 빌드에서 초안인 이웃은 이름 없이 '준비 중'
  assert.deepEqual(publicBuild(() => c.lessonNeighbours('5-2/1/01').next), { id: '5-2/1/02-03', unit: 1, lessonsLabel: '2~3차시', pagesLabel: '10~15쪽', ready: false });
  assert.throws(() => c.lessonNeighbours('5-2/9/01'), /차시표\(content\/registry\.yaml\)에 5-2\/9\/01 가 없습니다/);
});

test('slidePhase(): 장을 쓰는 흐름 단계와 "01 도입" 머리말. 두 차시 묶음은 차시마다 1부터', () => {
  fixtures();
  preview(() => {
    const one = c.loadLesson('5-2/1/01');
    assert.deepEqual(c.slidePhase(one, 1), { index: 1, label: '도입', title: '시험용 도입', kicker: '01 도입' });
    assert.deepEqual(c.slidePhase(one, 3), { index: 2, label: '전개', title: '시험용 전개', kicker: '02 전개' });
    assert.equal(c.slidePhase(one, 5)?.kicker, '03 정리');
    assert.equal(c.slidePhase(one, 6), undefined);
    // 2차시: 도입[1,2] 전개[3,4] 정리(장 없음), 3차시: 도입[5] 전개[6] 정리[7,8]
    const two = c.loadLesson('5-2/1/02-03');
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => c.slidePhase(two, n)?.kicker), ['01 도입', '01 도입', '02 전개', '02 전개', '01 도입', '02 전개', '03 정리', '03 정리']);
    assert.equal(c.slidePhase(two, 5)?.title, '3차시 도입');
  });
});

test('courseLine·stageFooter·thumbRoute·thumbFile', () => {
  fixtures();
  preview(() => {
    assert.equal(c.courseLine('5-2/1/02-03'), '5학년 2학기 1단원 2~3차시');
    assert.equal(c.courseLine('5-2/1/02-03', ' · '), '5학년 2학기 · 1단원 · 2~3차시');
    const one = c.loadLesson('5-2/1/01');
    assert.equal(c.stageFooter(one), `nalssam의 초등사회콘텐츠 클라우드  |  5학년 2학기 1단원 1차시  |  ${SITE.draftNotice}`);
  });
  assert.equal(c.thumbRoute('5-2/1/02-03', 'web_activity'), '/files/5-2/1/02-03/thumbs/web_activity.jpg');
  assert.equal(c.thumbFile('5-2/1/02-03', 'slides', ['--out', '.cache/tests/x']), path.join(c.ROOT, '.cache', 'tests', 'x', 'files', '5-2', '1', '02-03', 'thumbs', 'slides.jpg'));
});

test('업데이트 소식: 날짜가 늦은 것부터, 가리킨 차시가 모두 실릴 때만 보인다 (R49)', () => {
  fixtures();
  // 같은 날의 소식은 적은 차례
  assert.deepEqual(c.loadUpdates().map((u) => [u.date, u.kind]), [
    ['2026-11-03', 'notice'], ['2026-11-02', 'new'], ['2026-11-02', 'fix'], ['2026-11-01', 'new'], ['2026-10-30', 'fix'],
  ]);
  // 미리 보기: 초안을 가리킨 소식도 보이되 draft 표가 붙는다. 명세가 없는 묶음의 소식은 어느 빌드에도 없다.
  const shown = preview(() => c.visibleUpdates());
  assert.deepEqual(shown.map((u) => [u.title, u.draft]), [
    ['시험용 알림', false], ['시험용 한 차시를 올렸습니다', true], ['시험용 두 차시와 무거운 차시를 고쳤습니다', true], ['시험용 고침', false],
  ]);
  assert.deepEqual(shown[2].links, [
    { id: '5-2/1/02-03', title: '시험용 두 차시', route: '/5-2/1/02-03/', draft: true },
    { id: '5-2/1/04', title: '시험용 무거운 차시', route: '/5-2/1/04/', draft: true },
  ]);
  assert.deepEqual(shown[0].links, []);
  // 공개 빌드: 차시를 가리키지 않는 소식만
  assert.deepEqual(publicBuild(() => c.visibleUpdates()).map((u) => u.title), ['시험용 알림', '시험용 고침']);
});

test('업데이트 소식의 형식: 달력에 있는 날짜, 세 갈래, 차시표에 있는 묶음 id', () => {
  const t = tempContent('platform-updates');
  const file = path.join(t.dir, 'updates.yaml');
  const write = (text: string) => { fs.writeFileSync(file, text); t.touch(file); };
  try {
    write('- date: "2026-02-30"\n  kind: new\n  title: 날짜가 틀린 소식\n');
    failsWith(() => c.loadUpdates(), '1번째 줄 · 1번째 · date: 달력에 없는 날짜입니다');
    write('- date: "2026-11-21"\n  kind: news\n  title: 갈래가 틀린 소식\n');
    failsWith(() => c.loadUpdates(), 'kind 에는 new(새 자료), fix(고침), notice(알림) 가운데 하나를 씁니다');
    write('- date: "2026-11-21"\n  kind: new\n  title: 칸 이름이 틀린 소식\n  lesson: ["5-2/1/01"]\n');
    failsWith(() => c.loadUpdates(), '모르는 칸 이름입니다: lesson');
    write('- date: "2026-11-21"\n  kind: new\n  title: 없는 묶음의 소식\n  lessons: ["5-2/1/01", "5-2/9/01"]\n');
    failsWith(() => c.loadUpdates(), '4번째 줄 · 1번째 · lessons: 차시표(registry.yaml)에 없는 묶음 id 입니다: 5-2/9/01');
    write('- date: "2026-11-21"\n  kind: new\n  title: 꼴이 틀린 묶음 id\n  lessons: ["5-2-1-01"]\n');
    failsWith(() => c.loadUpdates(), '"5-2/1/01"처럼 학기/단원/묶음으로 씁니다');
    write('date: "2026-11-21"\n');
    failsWith(() => c.loadUpdates(), '업데이트 소식은 "- date: …" 로 시작하는 목록으로 적습니다');
    // 파일이 없으면 소식이 없는 것이다
    fs.rmSync(file);
    assert.deepEqual(c.loadUpdates(), []);
    // 다른 날짜 칸(검수 기록)도 달력에 없는 날짜를 받지 않는다
    t.edit('5-2/1/01', (l) => { l.reviews = [{ kind: 'voice', by: 'ai:다듬기', date: '2026-04-31', result: 'fix' }]; });
    failsWith(() => c.loadLesson('5-2/1/01'), '달력에 없는 날짜입니다');
  } finally { t.cleanup(); }
});

test('실제 업데이트 소식: 공개 빌드에는 알림만, 미리 보기에는 첫 차시의 소식도 (C-04)', () => {
  delete process.env.CONTENT_DIR;
  try {
    assert.deepEqual(c.loadUpdates().map((u) => [u.date, u.kind]), [['2026-11-21', 'notice'], ['2026-11-20', 'new']]);
    // 첫 차시가 공개되기 전에는 공개 빌드에 그 소식이 없다
    if (publicBuild(() => c.visibleLessons()).length === 0) assert.deepEqual(publicBuild(() => c.visibleUpdates()).map((u) => u.kind), ['notice']);
    assert.deepEqual(preview(() => c.visibleUpdates()).map((u) => u.kind), ['notice', 'new']);
  } finally { fixtures(); }
});
