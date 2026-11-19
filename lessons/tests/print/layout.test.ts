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
