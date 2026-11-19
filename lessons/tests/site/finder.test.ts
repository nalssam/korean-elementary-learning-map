// 쪽수·차시로 찾기의 셈 (src/components/site/finder.ts). 브라우저에서 도는 것과 같은 코드를 Node 에서 돌려 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUERY_HELP, emptyMessage, findBundles, pageRange, parseQuery } from '#src/components/site/finder.ts';
import type { FinderSemester } from '#src/components/site/finder.ts';

const semester: FinderSemester = {
  id: '5-2',
  label: '5학년 2학기',
  bundles: [
    { unit: 1, lessons: [1], pages: [6, 9], where: '1단원 1차시 · 6~9쪽', href: '/5-2/1/01/', title: '첫 차시' },
    { unit: 1, lessons: [2, 3], pages: [10, 15], where: '1단원 2~3차시 · 10~15쪽', href: '/5-2/1/02-03/', title: '두 차시' },
    { unit: 1, lessons: [4], pages: [15, 19], where: '1단원 4차시 · 15~19쪽' },
    { unit: 2, lessons: [1], pages: [24, 27], where: '2단원 1차시 · 24~27쪽' },
  ],
};

test('적은 글에서 숫자와 종류를 읽는다', () => {
  assert.deepEqual(parseQuery('34'), { n: 34, by: 'either' });
  assert.deepEqual(parseQuery(' 34쪽 '), { n: 34, by: 'page' });
  assert.deepEqual(parseQuery('p.34'), { n: 34, by: 'page' });
  assert.deepEqual(parseQuery('5차시'), { n: 5, by: 'lesson' });
  assert.deepEqual(parseQuery('2단원 1차시'), { n: 1, by: 'lesson', unit: 2 });
  assert.deepEqual(parseQuery('2단원 1'), { n: 1, by: 'lesson', unit: 2 });
  assert.equal(parseQuery('고인돌'), undefined);
  assert.equal(parseQuery(''), undefined);
});

test('전각 숫자는 바꾸어 읽고, 숫자가 하나가 아닌 글은 받지 않는다', () => {
  assert.deepEqual(parseQuery('７'), { n: 7, by: 'either' });
  assert.deepEqual(parseQuery('３４쪽'), { n: 34, by: 'page' });
  assert.deepEqual(parseQuery('34 쪽'), { n: 34, by: 'page' });
  // 예전에는 첫 숫자만 읽어 '-1' 은 1을, '6-9' 는 6을 찾았다. 어느 쪽을 찾을지 모르므로 받지 않고 QUERY_HELP 를 보여 준다.
  for (const bad of ['-1', '1.5', '6-9', '0', '34쪽 35쪽', '2단원']) assert.equal(parseQuery(bad), undefined, bad);
  assert.equal(QUERY_HELP, '쪽수나 차시 번호를 숫자 하나로 넣어 주세요. 예: 34, 34쪽, 5차시');
});

test('쪽수로 찾으면 그 쪽을 다루는 묶음이 모두 나온다', () => {
  // 15쪽은 두 묶음이 나눠 쓴다
  const hits = findBundles(semester, { n: 15, by: 'page' });
  assert.deepEqual(hits.page.map((b) => b.where), ['1단원 2~3차시 · 10~15쪽', '1단원 4차시 · 15~19쪽']);
  assert.deepEqual(hits.lesson, []);
});

test('차시 번호로 찾으면 단원마다 나오고, 단원을 적으면 그 단원만 나온다', () => {
  assert.equal(findBundles(semester, { n: 1, by: 'lesson' }).lesson.length, 2);
  assert.deepEqual(findBundles(semester, { n: 1, by: 'lesson', unit: 2 }).lesson.map((b) => b.unit), [2]);
  assert.deepEqual(findBundles(semester, { n: 3, by: 'lesson' }).lesson.map((b) => b.href), ['/5-2/1/02-03/']);
});

test('숫자만 적으면 쪽수와 차시를 함께 보고, 쪽수로 나온 묶음은 차시 쪽에 다시 넣지 않는다', () => {
  const hits = findBundles(semester, { n: 9, by: 'either' });
  assert.deepEqual(hits.page.map((b) => b.href), ['/5-2/1/01/']);
  assert.deepEqual(hits.lesson, []);
  const both = findBundles(semester, { n: 1, by: 'either' });
  assert.equal(both.page.length, 0);
  assert.equal(both.lesson.length, 2);
});

test('찾지 못하면 학기의 쪽수 범위를 알려 준다', () => {
  assert.deepEqual(pageRange(semester), [6, 27]);
  assert.equal(emptyMessage(semester, { n: 99, by: 'page' }), '5학년 2학기 차시표에 99쪽이 없습니다. 교과서 쪽수는 6쪽부터 27쪽까지입니다.');
  assert.equal(emptyMessage(semester, { n: 9, by: 'lesson', unit: 2 }), '5학년 2학기 2단원 차시표에 9차시가 없습니다.');
  assert.ok(emptyMessage(semester, { n: 99, by: 'either' }).includes('99쪽도 99차시도'));
});
