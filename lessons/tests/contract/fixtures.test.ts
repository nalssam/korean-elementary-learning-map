// 시험용 가짜 명세 넷(한 차시, 두 차시, no_play, 단원 정리)이 통과하고, 도우미들이 약속한 값을 내놓는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ASSET_ROUTE, CARDS_PER_SIDE, PRINT_DEFAULT, SITE, printLine } from '#lib/site.ts';
import { OPTIONAL_ASSET_KINDS } from '#schema/lesson.ts';
import { FIXTURES } from './helpers.ts';

process.env.CONTENT_DIR = FIXTURES;
process.env.SHOW_DRAFTS = '1';

const one = () => c.loadLesson('5-2/1/01');
const two = () => c.loadLesson('5-2/1/02-03');
const heavy = () => c.loadLesson('5-2/1/04');
const review = () => c.loadLesson('5-2/1/05');

test('시험용 명세 넷이 모두 통과한다', () => {
  assert.equal(c.contentDir(), FIXTURES);
  assert.deepEqual(c.lessonIds(), ['5-2/1/01', '5-2/1/02-03', '5-2/1/04', '5-2/1/05']);
  for (const id of c.lessonIds()) assert.equal(c.loadLesson(id).id, id);
  assert.deepEqual(c.orphanLessons(), []);
  // 명세가 없는 묶음도 차시표에는 있다
  assert.equal(c.hasLesson('5-2/2/01'), false);
  assert.equal(c.bundleOf('5-2/2/01').bundle.focus, '명세가 아직 없는 묶음');
});

test('차시표 값: 묶음에 적은 성취기준이 있으면 그것, 없으면 단원의 것', () => {
  assert.deepEqual(c.bundleOf(two()).standards, ['6사04-02']);
  assert.deepEqual(c.bundleOf(one()).standards, ['6사04-01', '6사04-02']);
  assert.deepEqual(c.bundleOf(two()).lessons, [2, 3]);
  assert.equal(c.bundleOf(review()).role, 'review');
  // 두 묶음이 한 쪽을 나눠 쓰면 둘 다 나온다
  assert.deepEqual(c.findByPage('5-2', 15).map((b) => b.id), ['5-2/1/02-03', '5-2/1/04']);
});

test('lessonPaths: 주소 조각은 모두 글이고, props 로는 id 만 넘긴다', () => {
  assert.deepEqual(c.lessonPaths()[1], { params: { semester: '5-2', unit: '1', bundle: '02-03' }, props: { id: '5-2/1/02-03' } });
  assert.equal(c.lessonPaths().length, 4);
  assert.deepEqual(c.lessonPaths('coloring').map((p) => p.props.id), ['5-2/1/02-03']);
  assert.deepEqual(c.lessonPaths('papercraft'), []);
  assert.equal(c.lessonPaths('cards').length, 4);
  assert.equal(c.lessonPaths('web_activity').length, 4);
  for (const p of c.lessonPaths()) for (const v of Object.values(p.params)) assert.equal(typeof v, 'string');
  assert.deepEqual(c.readyAssets(two()), ['coloring', 'making_kit', 'web_activity', 'cards']);
});

test('flowByLesson: 차시마다 따로, 차시마다 40분', () => {
  assert.deepEqual(c.flowByLesson(one()).map((f) => [f.lesson, f.steps.length, f.firstSlide]), [[1, 3, 1]]);
  const parts = c.flowByLesson(two());
  assert.deepEqual(parts.map((f) => f.lesson), [2, 3]);
  assert.deepEqual(parts.map((f) => f.steps.map((s) => s.phase)), [['도입', '전개', '정리'], ['도입', '전개', '정리']]);
  assert.deepEqual(parts.map((f) => f.steps.reduce((n, s) => n + s.minutes, 0)), [40, 40]);
  // 3차시는 5번 장에서 시작한다 → /5-2/1/02-03/slides/#5
  assert.deepEqual(parts.map((f) => f.firstSlide), [1, 5]);
});

test('quizByLesson: lesson 을 적지 않은 문항은 마지막 차시의 것', () => {
  assert.deepEqual(c.quizByLesson(two()).map((q) => [q.lesson, q.items.map((x) => x.no)]), [[2, [1, 2]], [3, [3, 4]]]);
  assert.deepEqual(c.quizByLesson(one()).map((q) => [q.lesson, q.items.length]), [[1, 3]]);
});

test('answerText·worksheetKey: 정답과 교사용 풀이는 명세에서 저절로 나온다', () => {
  assert.deepEqual(one().quiz.items.map(c.answerText), ['O', '1번 돌', '1392']);
  assert.deepEqual(two().quiz.items.map(c.answerText), ['O', '1번 서쪽', '1446', 'X']);
  assert.deepEqual(c.worksheetKey(two()), [
    { where: '2쪽 연표', text: '1446년 — 둘째 해' },
    { where: '2쪽 선 잇기', text: '서쪽 — 길이 시작하는 곳 / 동쪽 — 길이 끝나는 곳' },
    { where: '2쪽 확인 퀴즈', text: 'O / 1번 서쪽' },
    { where: '표', text: '규칙에서 길이 중요했다는 것을 찾으면 됩니다.' },
  ]);
  assert.deepEqual(c.worksheetKey(review()), [
    { where: '1쪽 연표', text: '1392 — 첫 해' },
    { where: '2쪽 확인 퀴즈', text: 'O / 1392 / X' },
  ]);
  assert.deepEqual(c.worksheetKey(one()), [{ where: '문장 틀', text: '앞 칸에 본 것이 들어 있으면 됩니다.' }]);
});

test('slideNotes: notes 가 없으면 그 장을 쓰는 흐름 단계의 title·do·ask', () => {
  assert.deepEqual(c.slideNotes(one(), 1), ['시험용 진행 메모']);
  assert.deepEqual(c.slideNotes(one(), 2), ['시험용 도입', '그림을 띄웁니다.', '무엇이 보이나요?']);
  assert.deepEqual(c.slideNotes(one(), 3), ['시험용 전개', '학습지를 나누어 줍니다.', '카드를 나누어 줍니다.']);
  assert.throws(() => c.slideNotes(one(), 99), /없습니다/);
});

test('printJobs: 쪽수는 계산하고, 빈 칸은 기본값으로 채운다', () => {
  const jobs = c.printJobs(two());
  assert.deepEqual(jobs.map((j) => [j.kind, j.pages]), [['worksheet', 2], ['coloring', 1], ['cards', 2]]);
  const [ws, coloring, cards] = jobs;
  assert.deepEqual(ws.print, { per: 'student', sides: 'duplex', orientation: 'landscape', bw_ok: true, paper: 'A4 보통 용지', materials: [] });
  assert.deepEqual(coloring.print, PRINT_DEFAULT.coloring);
  // 카드는 늘 A4 세로 양면. 적은 칸만 바뀐다.
  assert.deepEqual(cards.print, { per: 'pair', sides: 'duplex', orientation: 'portrait', bw_ok: true, paper: 'A4 두꺼운 종이', materials: ['가위'] });
  assert.equal(cards.route, '/5-2/1/02-03/cards/');
  assert.equal(cards.file, '/files/5-2/1/02-03/cards.pdf');
  assert.equal(cards.download, '5-2_1단원_2~3차시_카드.pdf');
  assert.equal(cards.label, '카드');
  assert.equal(printLine(cards.print, cards.pages), '짝마다 1부 · A4 세로 2쪽 · 양면 · 흑백으로 뽑아도 됩니다');
  assert.equal(printLine(ws.print, ws.pages), '학생마다 1부 · A4 가로 2쪽 · 양면 · 흑백으로 뽑아도 됩니다');
  // 기본값을 고쳐 써도 다음 차시에 번지지 않는다
  c.printJobs(one())[1].print.materials.push('풀');
  assert.deepEqual(c.printJobs(one())[1].print.materials, ['가위']);
  assert.deepEqual(c.pptxFile(one()), { file: '/files/5-2/1/01/slides.pptx', download: '5-2_1단원_1차시_수업 화면.pptx' });
});

test('단원 정리 묶음: 앞 묶음의 사실·그림을 가리키고 카드를 모은다', () => {
  const l = review();
  assert.equal(l.facts.length, 0);
  // 가리키는 것 풀기
  assert.equal(c.getFact(l, '01/f2').claim, '시험용 연표의 첫 해는 1392년이다.');
  assert.equal(c.getFact(l, '02-03/f2').lessonId, '5-2/1/02-03');
  const m = c.getMedia(l, '01/stone');
  assert.equal(m.lessonId, '5-2/1/01');
  assert.equal(c.mediaRoute(l, '01/stone'), '/media/5-2/1/01/stone.svg');
  assert.equal(c.mediaFile(l, '01/stone'), path.join(FIXTURES, '5-2/1/01/media/stone.svg'));
  assert.ok(fs.existsSync(c.mediaFile(l, '01/stone')));
  assert.equal(c.mediaRoute(one(), 'stone'), '/media/5-2/1/01/stone.svg');
  assert.throws(() => c.getMedia(l, '01/nope'), /없는 그림/);
  assert.throws(() => c.getFact(l, 'f1'), /없는 사실/);
  // 단원 덱: 모은 묶음의 카드(적은 차례) 다음에 이 묶음의 카드
  const deck = c.deckCards(l);
  assert.equal(deck.length, 9);
  assert.deepEqual(deck.map((d) => d.label), ['가', '가', '가', '가', '나', '나', '나', '나', '나']);
  assert.deepEqual(deck.slice(0, 5).map((d) => d.front), ['돌탑', '바위', '자갈', '1392', '길']);
  assert.equal(deck[0].lesson.id, '5-2/1/01');
  // 뒷면을 적지 않은 카드는 그 카드가 적힌 차시의 낱말 풀이로 채워진다
  assert.equal(deck[0].back, '돌을 차곡차곡 쌓아 올린 것');
  assert.equal(deck[4].back, '사람이 다니는 곳');
  // 그림은 카드가 적힌 차시에서 찾는다
  assert.equal(deck[2].media, 'stone');
  assert.equal(c.mediaRoute(deck[2].lesson, deck[2].media!), '/media/5-2/1/01/stone.svg');
  // 쪽수 = 2 × ceil(장수 ÷ 8)
  assert.equal(CARDS_PER_SIDE, 8);
  assert.deepEqual(c.printJobs(l).map((j) => [j.kind, j.pages]), [['worksheet', 2], ['cards', 4]]);
  // 이 묶음의 카드만 있는 차시
  assert.deepEqual(c.deckCards(one()).map((d) => [d.label, d.front]), [[undefined, '돌탑'], [undefined, '바위'], [undefined, '자갈'], [undefined, '1392']]);
});

test('no_play·care 차시는 점수를 보여 주지 않는다', () => {
  assert.equal(c.scored(one()), true);
  assert.equal(c.scored(two()), false);
  assert.equal(c.scored(heavy()), false);
  // no_play: 놀이 자료 다섯 가지는 모두 skip, 카드는 낱말만
  const l = heavy();
  assert.deepEqual(c.readyAssets(l), ['web_activity', 'cards']);
  assert.deepEqual(c.deckCards(l).map((d) => d.back), ['시험용 첫째 규칙', '시험용 둘째 규칙', '시험용 셋째 규칙', '시험용 넷째 규칙']);
});

test('낱말 풀이, 문장 틀, 숫자로 적은 글', () => {
  assert.equal(c.termMeaning(one(), '돌탑'), '돌을 차곡차곡 쌓아 올린 것');
  assert.throws(() => c.termMeaning(one(), '없는 낱말'), /terms\.new/);
  assert.deepEqual(c.splitFrame('나는 ___을 보았다. 그래서 ___라고 생각한다.'), ['나는 ', '을 보았다. 그래서 ', '라고 생각한다.']);
  assert.deepEqual(c.splitFrame('나는 ＿＿라고 짐작했다.'), ['나는 ', '라고 짐작했다.']);
  assert.deepEqual(c.splitFrame('______ 때문이다'), ['', ' 때문이다']);
  // 따옴표 없이 적은 연도는 글로 읽힌다
  const short = one().quiz.items[2];
  assert.equal(short.type === 'short' && short.answer, '1392');
  const cards = one().assets.cards;
  assert.equal(cards.state === 'ready' && cards.cards[3].front, '1392');
  const table = two().worksheet.pages[0].blocks[2];
  assert.deepEqual(table.type === 'table' && table.rows[1], ['1446', '']);
  assert.equal(c.getPassage(two(), 'old-rule').text.length, 2);
});

test('출처 표시는 creditShort·creditFull 이 만든다', () => {
  const l = two();
  assert.equal(c.creditShort(c.getMedia(l, 'map')), '지도: 시험용 그린이');
  assert.equal(c.creditShort(c.getMedia(l, 'stone-line')), '그림: 몽당분필 날쌤 · 시험용 박물관 자료를 본떠 그림 (공공누리 제1유형)');
  assert.equal(c.creditShort(c.getMedia(l, 'sample')), '사진: 시험용 사진가 · CC BY-SA 3.0');
  assert.deepEqual(c.creditFull(c.getMedia(l, 'sample')), {
    text: '사진: 「시험용 사진」, 시험용 사진가, CC BY-SA 3.0',
    sourceUrl: 'https://example.org/item/2',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  });
  assert.deepEqual(c.creditFull(c.getMedia(l, 'stone-line')), {
    text: '원본: 「시험용 큰 돌」, 시험용 박물관, 공공누리 제1유형, 몽당분필 날쌤이(가) 본떠 그림',
    sourceUrl: 'https://example.org/item/1',
    licenceUrl: undefined,
  });
  assert.deepEqual(c.creditFull(c.getMedia(l, 'map')), { text: '지도: 시험용 그린이, CC BY-NC-SA 4.0', licenceUrl: SITE.licence.url });
  assert.equal(c.licenceName({ holder: 'x', licence: 'CC-BY', licence_url: 'https://creativecommons.org/licenses/by/2.0/kr/' }), 'CC BY 2.0 KR');
  assert.equal(c.licenceName({ holder: 'x', licence: 'CC0', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/' }), 'CC0');
  // CC 누리집과 위키미디어 공용이 거는 주소는 deed.ko·legalcode 로 끝난다. 그 앞 두 글자("de", "le")를 나라 이름으로 읽지 않는다.
  const cc = (licence: 'CC-BY' | 'CC-BY-SA', licence_url: string) => c.licenceName({ holder: 'x', licence, licence_url });
  assert.equal(cc('CC-BY-SA', 'https://creativecommons.org/licenses/by-sa/3.0/deed.ko'), 'CC BY-SA 3.0');
  assert.equal(cc('CC-BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/legalcode'), 'CC BY-SA 4.0');
  assert.equal(cc('CC-BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/legalcode.ko'), 'CC BY-SA 4.0');
  assert.equal(cc('CC-BY', 'https://creativecommons.org/licenses/by/2.0/kr/deed.ko'), 'CC BY 2.0 KR');
  assert.equal(cc('CC-BY', 'https://creativecommons.org/licenses/by/2.0/kr'), 'CC BY 2.0 KR');
  assert.equal(cc('CC-BY', 'https://creativecommons.org/licenses/by/3.0/de/'), 'CC BY 3.0 DE');
  assert.equal(cc('CC-BY', 'https://creativecommons.org/licenses/by/4.0'), 'CC BY 4.0');
  assert.equal(c.creditShort({ ...c.getMedia(l, 'sample'), credit: { ...c.getMedia(l, 'sample').credit, licence_url: 'https://creativecommons.org/licenses/by-sa/3.0/deed.ko' } }), '사진: 시험용 사진가 · CC BY-SA 3.0');
});

test('AI 로 만든 그림은 누가 만들었든 출처 표시에 그렇게 밝힌다', () => {
  const sample = c.getMedia(two(), 'sample');
  // 남이 만든 AI 그림 (CC0)
  const theirs = { ...sample, kind: 'drawing' as const, ai_generated: true, factual: false, credit: { holder: '어느 누리집', title: '시험용 장면', source_url: 'https://example.org/a', licence: 'CC0' as const, checked: '2026-11-01' } };
  assert.equal(c.creditShort(theirs), '그림: 어느 누리집 · CC0 · AI로 만든 그림');
  assert.equal(c.creditFull(theirs).text, '그림: 「시험용 장면」, 어느 누리집, CC0, AI로 만든 그림');
  assert.equal(c.creditShort({ ...theirs, change: 'cropped' }), '그림: 어느 누리집 · CC0 · 일부를 잘라 씀 · AI로 만든 그림');
  // 우리가 만든 AI 그림은 kind 를 photo 로 적었어도 '사진'이라고 부르지 않는다
  const ours = { ...sample, kind: 'photo' as const, ai_generated: true, factual: false, credit: { holder: '몽당분필 날쌤', licence: 'original' as const } };
  assert.equal(c.creditShort(ours), '그림: 몽당분필 날쌤 · AI로 만든 그림');
  assert.equal(c.creditFull(ours).text, '그림: 몽당분필 날쌤, CC BY-NC-SA 4.0, AI로 만든 그림');
  // 본떠 그린 것은 우리가 그린 그림이다
  assert.equal(c.creditShort({ ...theirs, change: 'traced' }), '그림: 몽당분필 날쌤 · 어느 누리집 자료를 본떠 그림 (CC0)');
  assert.equal(c.creditFull({ ...theirs, change: 'traced' }).text, '원본: 「시험용 장면」, 어느 누리집, CC0, 몽당분필 날쌤이(가) 본떠 그림');
});

test("shownMedia: 안내 페이지의 '출처'와 PPTX 마지막 장에 올릴 그림", () => {
  const ids = (ms: c.ResolvedMedia[]) => ms.map((m) => `${m.lessonId}#${m.id}`);
  // 단원 정리 묶음은 제 그림이 없다. 빌려 온 그림과 단원 덱에 모은 카드의 그림이 나온다 (겹치지 않게, 처음 나오는 차례로).
  assert.equal(review().media.length, 0);
  assert.deepEqual(ids(c.shownMedia(review())), ['5-2/1/01#stone']);
  assert.deepEqual(ids(c.shownMedia(review(), 'slides')), ['5-2/1/01#stone']);
  // 수업 화면에 실리는 그림만 / 화면·인쇄물에 실리는 그림 전부
  assert.deepEqual(ids(c.shownMedia(two(), 'slides')), ['5-2/1/02-03#sample']);
  assert.deepEqual(ids(c.shownMedia(two())), ['5-2/1/02-03#sample', '5-2/1/02-03#map', '5-2/1/02-03#stone-line']);
  assert.deepEqual(ids(c.shownMedia(one())), ['5-2/1/01#stone']);
  assert.deepEqual(c.shownMedia(heavy()), []);
  // 출처 표시는 이 목록에서 만든다
  assert.deepEqual(c.shownMedia(review()).map((m) => c.creditFull(m).text), ['그림: 시험용 그린이, CC BY-NC-SA 4.0']);
});

test('초안의 맨 아래 문구와 지문', () => {
  assert.equal(c.footerNotice(one()), SITE.draftNotice);
  // 차시가 없는 페이지(첫 화면·학기·단원): 미리 보기 빌드에서는 초안이 섞여 있다고 밝히고, 공개 빌드에서만 "교사가 검수한 자료"라고 쓴다
  assert.equal(c.footerNotice(), SITE.previewNotice);
  assert.ok(!SITE.previewNotice.includes('검수한'));
  delete process.env.SHOW_DRAFTS;
  try { assert.equal(c.footerNotice(), SITE.aiNotice); } finally { process.env.SHOW_DRAFTS = '1'; }
  assert.equal(c.sheetFooter(one()), SITE.draftNotice);
  const seals = c.sealsOf('5-2/1/01');
  assert.match(seals.lesson, /^[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(seals.facts), ['f1', 'f2']);
  assert.deepEqual(c.reviewState('5-2/1/01'), { fact: 'none', originality: 'none', voice: 'none', print: 'none', owner: 'none' });
  const gaps = c.publishGaps('5-2/1/01');
  assert.ok(gaps.some((g) => g.includes('베끼기 검사(originality) 기록이 없습니다')));
  assert.ok(gaps.some((g) => g.includes('사실 f1: 지금 문장을 확인한 이가 0명')));
});

// 명세의 글은 아이가 읽는 글·교사가 읽는 글·제작 기록 가운데 하나 이상에 들어가야 한다.
// 새 칸을 더하고 글 뽑기를 고치지 않으면 이 시험이 실패한다.
test('글 뽑기: 빠지는 글이 없다', () => {
  // 칸 이름으로 가리는 것(NOT_PROSE)과, 경로로 가리는 것(NOT_PROSE_AT: 같은 이름의 다른 칸은 글이다) 말고는 모두 글이다
  const allStrings = (node: unknown, key: string, at: string, out: string[]) => {
    if (c.NOT_PROSE.has(key) || c.NOT_PROSE_AT.has(at)) return;
    if (typeof node === 'string') { if (node.trim()) out.push(node); return; }
    if (Array.isArray(node)) { node.forEach((v) => allStrings(v, key, at, out)); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) allStrings(v, k, at ? `${at}.${k}` : k, out);
  };
  for (const id of c.lessonIds()) {
    const l = c.loadLesson(id);
    const child = c.childStrings(l), teacher = c.teacherStrings(l), record = c.recordStrings(l);
    const seen = new Set([...child, ...teacher, ...record].map((s) => s.text));
    const every: string[] = [];
    allStrings(l, '', '', every);
    for (const s of every) assert.ok(seen.has(s), `${id}: 어느 목록에도 없는 글: ${s}`);
    for (const s of [...child, ...teacher, ...record]) assert.ok(s.text.trim() && s.path, `${id}: 빈 글 ${s.path}`);
  }
  const paths = (xs: c.Str[]) => xs.map((s) => s.path);
  const child = paths(c.childStrings(two())), teacher = paths(c.teacherStrings(two())), record = paths(c.recordStrings(two()));
  // 아이가 읽는 글
  for (const p of ['title', 'terms.new[0].term', 'terms.new[0].meaning', 'media.map.alt', 'passages[0].title', 'passages[0].text[1]', 'passages[0].source',
    'slides[1].kicker', 'slides[3].points[0]', 'worksheet.title', 'worksheet.pages[0].heading', 'worksheet.pages[0].blocks[1].text[0]',
    'worksheet.pages[0].blocks[2].rows[0][0]', 'worksheet.pages[1].blocks[0].points[1].when', 'worksheet.pages[1].blocks[0].points[1].what', 'worksheet.pages[1].blocks[1].pairs[0].right',
    'worksheet.pages[1].blocks[2].columns[3][0].label', 'quiz.items[0].q', 'quiz.items[0].explain', 'quiz.items[1].choices[0]', 'quiz.items[2].answer',
    'assets.coloring.look_for[0]', 'assets.making_kit.steps[0]', 'assets.making_kit.safety', 'assets.web_activity.activity.spots[0].why', 'assets.cards.cards[1].back']) {
    assert.ok(child.includes(p), `childStrings 에 없음: ${p}`);
  }
  assert.ok(paths(c.childStrings(review())).includes('assets.cards.collect[0].label'));
  assert.ok(paths(c.childStrings(one())).includes('media.stone.caption'));
  // 아이가 읽지 않는 글은 들어가지 않는다 (빈 표 칸, 교사용 풀이, 인쇄 안내, 제작 기록)
  for (const p of child) assert.ok(!/\.guide|\.print\.|\.notes$|\.reason$|\.idea$|^flow/.test(p), `childStrings 에 들어가면 안 됨: ${p}`);
  assert.ok(!child.includes('worksheet.pages[0].blocks[2].rows[0][1]'));
  // 연표의 when 은 늘 찍히는 글이고, 만들기 세트의 when(in_class·extended)은 선택값이라 글이 아니다
  assert.equal(c.childStrings(two()).find((s) => s.path === 'worksheet.pages[1].blocks[0].points[1].when')?.text, '1446년');
  assert.ok(!c.NOT_PROSE.has('when'));
  for (const list of [child, teacher, record]) assert.ok(!list.includes('assets.making_kit.when'));
  // 교사가 읽는 글
  for (const p of ['title', 'tagline', 'objectives[1]', 'sensitivity.note', 'facts[0].claim', 'facts[0].sources[0].name', 'media.sample.credit.holder', 'media.sample.credit.title',
    'flow[1].title', 'flow[1].do[0]', 'flow[1].ask[0].q', 'worksheet.guide[0].text', 'assets.cards.print.paper']) {
    assert.ok(teacher.includes(p), `teacherStrings 에 없음: ${p}`);
  }
  const t1 = paths(c.teacherStrings(one()));
  for (const p of ['prepare[0].item', 'prepare[0].qty', 'flow[0].ask[0].listen_for', 'flow[1].tip', 'slides[0].notes', 'misconceptions[0].response', 'assessment.look_for', 'teacher_notes[0].body[0]']) {
    assert.ok(t1.includes(p), `teacherStrings 에 없음: ${p}`);
  }
  // 제작 기록: 만들지 않는 까닭과 계획, 근거 구절은 사이트에 보여 주지 않는다
  for (const p of ['assets.papercraft.reason', 'assets.virtual3d.idea', 'facts[0].sources[0].quote']) assert.ok(record.includes(p), `recordStrings 에 없음: ${p}`);
  for (const p of [...child, ...teacher]) assert.ok(!record.includes(p), `두 목록에 겹침: ${p}`);
});

test('xmlText: 전개도 모듈이 명세의 글을 SVG 에 넣을 때 거친다', () => {
  assert.equal(c.xmlText(`굄돌 & 덮개돌 <script>document.title='x'</script> "따옴표"`), '굄돌 &amp; 덮개돌 &lt;script&gt;document.title=\'x\'&lt;/script&gt; &quot;따옴표&quot;');
  assert.equal(c.xmlText('덮개돌을 올린다'), '덮개돌을 올린다');
});

test('선택 자료 7종의 이름은 형식에서 나온다', () => {
  assert.deepEqual(OPTIONAL_ASSET_KINDS, ['papercraft', 'coloring', 'making_kit', 'escape', 'virtual3d', 'web_activity', 'cards']);
  assert.deepEqual(Object.keys(ASSET_ROUTE), ['slides', 'worksheet', 'quiz', 'papercraft', 'coloring', 'cards', 'web_activity']);
  assert.equal(ASSET_ROUTE.web_activity, 'play');
});
