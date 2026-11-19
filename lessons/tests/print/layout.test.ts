// 인쇄 페이지가 쓰는 셈(src/components/print/layout.ts)을 Chromium 없이 시험한다.
// 학습지 번호, 선 잇기의 섞는 순서, 문장 틀 나누기, 카드 쪽 나누기와 뒷면의 좌우 바꾸기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES } from '../contract/helpers.ts';

process.env.CONTENT_DIR = FIXTURES;
process.env.SHOW_DRAFTS = '1';
const c = await import('#lib/content.ts');
const L = await import('#src/components/print/layout.ts');

test('학습지 번호는 number: true 인 지시문과 퀴즈 문항에 붙고 쪽이 바뀌어도 이어 센다', () => {
  const lesson = c.loadLesson('5-2/1/05');
  const pages = L.placeWorksheet(lesson);
  assert.equal(pages.length, lesson.worksheet.pages.length);
  const nos: number[] = [];
  for (const p of pages) for (const it of p.items) {
    if (it.no !== undefined) nos.push(it.no);
    if (it.quizNos) nos.push(...it.quizNos);
    for (const col of it.columns ?? []) for (const inner of col) if (inner.no !== undefined) nos.push(inner.no);
  }
  assert.ok(nos.length > 0);
  assert.deepEqual(nos, nos.map((_, i) => i + 1));
  // 넘침 알림이 짚는 자리 이름
  assert.match(pages[0].items[0].where, /^1번째 블록\(.+\)$/);
});

test('선 잇기: 빌드마다 같은 차례로 섞이고, 적힌 차례 그대로 나오지 않는다', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const a = L.matchOrder('5-2/1/02-03', '1-3', n);
    assert.deepEqual(a, L.matchOrder('5-2/1/02-03', '1-3', n));
    assert.deepEqual([...a].sort(), Array.from({ length: n }, (_, i) => i));
    assert.ok(a.some((v, i) => v !== i), `${n}쌍이 섞이지 않았습니다`);
  }
  // 다른 묶음은 대개 다른 차례다 (묶음 id 로 씨앗을 정한다)
  const seen = new Set(['01', '02-03', '04', '05', '06', '07'].map((b) => L.matchOrder(`5-2/1/${b}`, '1-1', 6).join()));
  assert.ok(seen.size > 1);
});

test('문장 틀: splitFrame 의 조각 사이에 빈칸이 들고, 문장이 바뀌는 곳에서 줄을 바꾼다', () => {
  const parts = L.frameParts('나는 ___을 보았다. 그래서 ___라고 생각한다.');
  assert.deepEqual(parts, [
    { kind: 'text', text: '나는' }, { kind: 'blank' }, { kind: 'text', text: '을 보았다.' },
    { kind: 'break' }, { kind: 'text', text: '그래서' }, { kind: 'blank' }, { kind: 'text', text: '라고 생각한다.' },
  ]);
  assert.equal(L.frameParts('___').filter((p) => p.kind === 'blank').length, 1);
  assert.deepEqual(L.frameParts('___ 때문이다.').map((p) => p.kind), ['blank', 'text']);
});

test('카드: 한 면에 8장, 앞면 쪽 다음에 뒷면 쪽, 뒷면은 줄마다 좌우를 바꾼다', () => {
  const lesson = c.loadLesson('5-2/1/05');
  const cards = c.deckCards(lesson);
  const sheets = L.cardSheets(cards);
  const job = c.printJobs(lesson).find((j) => j.kind === 'cards')!;
  assert.equal(sheets.length, job.pages);
  assert.deepEqual(sheets.map((s) => s.side), sheets.map((_, i) => (i % 2 ? 'back' : 'front')));
  for (let i = 0; i < sheets.length; i += 2) {
    const [front, back] = [sheets[i], sheets[i + 1]];
    assert.equal(front.cells.length, 8);
    for (let k = 0; k < 8; k++) assert.equal(back.cells[k], front.cells[k % 2 ? k - 1 : k + 1]);
  }
  // 모든 카드가 한 번씩 앞면에 나온다
  assert.deepEqual(sheets.filter((s) => s.side === 'front').flatMap((s) => s.cells).filter(Boolean), cards);
  // 단원 덱의 카드에는 모은 묶음의 이름표가 있다
  assert.ok(cards.some((card) => card.label));
});

test('카드 앞면 글자는 길수록 작게 찍는다 (14자까지)', () => {
  assert.equal(L.frontSize('돌'), 'xl');
  assert.equal(L.frontSize('가나다라마바'), 'lg');
  assert.equal(L.frontSize('가나다라마바사아자'), 'md');
  assert.equal(L.frontSize('가나다라마바사아자차카타파하'), 'sm');
});

test('번호 없는 지시문은 번호를 건너뛰고, ○표를 하라는 지시 아래의 표만 표시 받는 표가 된다', () => {
  const lesson = structuredClone(c.loadLesson('5-2/1/01'));
  const table = (columns: string[]) => ({ type: 'table' as const, columns, rows: [['가', '', '']] });
  lesson.worksheet.pages = [
    { blocks: [
      { type: 'prompt', text: '본 것인지 짐작한 것인지 ○표 해 봅시다.', number: true },
      table(['말', '본 것', '짐작']),
      { type: 'prompt', text: '표를 채워 봅시다.', number: true },
      { type: 'prompt', text: '그릇', number: false },
      table(['곳', '본 것', '짐작']),
    ] },
    { blocks: [table(['곳', '본 것', '짐작']), { type: 'prompt', text: '돌 도구', number: false }, { type: 'prompt', text: '써 봅시다.', number: true }] },
  ] as typeof lesson.worksheet.pages;
  const [one, two] = L.placeWorksheet(lesson);
  assert.deepEqual(one.items.map((it) => it.no), [1, undefined, 2, undefined, undefined]);
  assert.deepEqual(two.items.map((it) => it.no), [undefined, undefined, 3]);
  assert.deepEqual([one.items[1].marks, one.items[4].marks, two.items[0].marks], [true, false, false]);
  assert.equal(L.asksForMarks('맞으면 ○, 틀리면 × 해 봅시다.'), true);
  assert.equal(L.asksForMarks('표를 채워 봅시다.'), false);
});

test('괄호로 묶은 말과 "~낱말"은 줄을 바꾸지 않는 한 덩어리다', () => {
  assert.deepEqual(L.keepParts('어떻게 이어지나요? (~하니까)'), [{ text: '어떻게 이어지나요? ', keep: false }, { text: '(~하니까)', keep: true }]);
  assert.deepEqual(L.keepParts('~하니까 생각'), [{ text: '~하니까', keep: true }, { text: ' 생각', keep: false }]);
  assert.deepEqual(L.keepParts('그냥 말'), [{ text: '그냥 말', keep: false }]);
});

test('표의 칸 폭: 표시만 받는 열은 40mm 남짓, 글을 쓰는 열은 넓게, 합은 표 폭', () => {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const statements = ['많은 사람이 힘을 모아 돌을 옮겼다.', '덮개돌이 받침돌 위에 얹혀 있다.'];
  const marks = L.tableWidths(['말', '눈으로 본 것', '짐작한 것'], statements.map((s) => [s, '', '']), { width: 190, marks: true });
  assert.ok(Math.abs(sum(marks) - 190) < 0.01);
  assert.ok(marks[1] <= 45 && marks[2] <= 45, `표시 열 ${marks}`);
  assert.ok(marks[0] > marks[1], '문장 열이 표시 열보다 넓어야 합니다');
  const write = L.tableWidths(['살펴볼 곳', '눈으로 본 것', '짐작한 것', '어떻게 이어지나요? (~하니까)'], [['바닥 모양', '', '', ''], ['가장자리와 끝', '', '', '']], { width: 190 });
  assert.ok(Math.abs(sum(write) - 190) < 0.01);
  assert.ok(write.slice(1).every((w) => w > write[0]), `채우는 열이 이름표 열보다 넓어야 합니다: ${write}`);
  // 채우는 열이 없으면 똑같이 나눈다
  assert.deepEqual(L.tableWidths(['가', '나'], [['1', '2']], { width: 100 }), [50, 50]);
});

test('바닥글 앞의 틈: 바닥글이 한 줄이면 본문에서 3mm 남짓, 두 줄(공개된 차시의 주소)이면 6mm 남짓을 비운다', async () => {
  const { SITE } = await import('#lib/site.ts');
  assert.equal(L.footLines(`${SITE.draftNotice} · 2/2`), 1);
  const published = `${SITE.printFooter} · https://nalssam.github.io/korean-elementary-learning-map/5-2/1/01/ · 2/2`;
  assert.equal(L.footLines(published), 2);
  // 바닥글 상자 6mm 의 위쪽 빈자리와 본문에서 비운 높이를 더하면 6mm 이상
  for (const [text, lines] of [[`${SITE.draftNotice} · 1/1`, 1], [published, 2]] as const) {
    const reserve = L.footReserve(text);
    assert.ok(reserve + (6 - lines * 8 * 1.05 * 25.4 / 72) >= L.FOOT_GAP_MM, `${lines}줄: ${reserve}mm`);
    assert.ok(reserve < lines * 3 + 0.5, `${lines}줄: 너무 많이 비웁니다 (${reserve}mm)`);
  }
});

test('카드 높이: 덱의 가장 많이 든 쪽의 줄이 본문을 나누어 갖고, 85mm 를 넘지 않는다', () => {
  const r = 3.2;
  assert.equal(L.cardRows(8), 4);
  assert.equal(L.cardRows(9), 4);
  assert.equal(L.cardRows(6), 3);
  assert.equal(L.cardRows(1), 1);
  assert.ok(Math.abs(L.cardHeight(8, r) - (249 - r) / 4) < 0.1);
  assert.ok(Math.abs(L.cardHeight(6, r) - (249 - r) / 3) < 0.1);
  assert.equal(L.cardHeight(4, r), L.CARD_MAX_MM);
  assert.equal(L.cardHeight(17, r), L.cardHeight(8, r), '쪽이 늘어도 한 덱의 카드는 같은 크기다');
  // 그림 줄: 줄의 어느 한 장에 그림이 있으면 그 줄의 두 장 모두
  assert.deepEqual(L.pictureRows([{}, {}, { media: 'a' }, {}, undefined, undefined]), [false, false, true, true, false, false]);
});
