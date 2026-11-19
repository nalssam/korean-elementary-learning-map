// 학생 페이지의 작은 셈(src/components/play/logic.ts): 단답 채점과 빌드마다 같은 섞기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markShort, normalizeShort, shuffledOrder } from '#src/components/play/logic.ts';

test('단답 채점: 앞뒤 공백을 떼고 안쪽 공백을 모두 없앤 뒤 answer·accept 와 견준다 (9절)', () => {
  assert.equal(normalizeShort('  13 92 \n'), '1392');
  assert.equal(normalizeShort('네\t가지'), '네가지');
  assert.ok(markShort(' 13 92 ', '1392'));
  assert.ok(markShort('1392년', '1392', ['1392년']));
  assert.ok(markShort('4 가지', '네 가지', ['4', '4가지', '넷']));
  assert.ok(markShort('네가지', '네 가지'), 'answer 쪽의 빈칸도 없앤 뒤 견준다');
  assert.ok(!markShort('1393', '1392', ['1392년']));
  assert.ok(!markShort('   ', '1392'), '빈 답은 맞지 않는다');
  assert.ok(!markShort('', '', []), '빈 답은 정답이 비어 있어도 맞지 않는다');
  // 끝에 붙은 . ! ? 와 답 뒤의 '이요'·'입니다'는 떼고 견준다 (9절)
  assert.equal(normalizeShort('유물입니다.'), normalizeShort('유물'));
  assert.equal(normalizeShort('유물.'), '유물');
  assert.equal(normalizeShort('유물이요!'), '유물');
  assert.equal(normalizeShort('유물 입니다 ?'), '유물');
  assert.equal(normalizeShort('1392년?!'), '1392년');
  assert.ok(markShort('유물.', '유물'));
  assert.ok(markShort('고인돌이요', '고인돌'));
  assert.ok(markShort('1392 입니다.', '1392'));
  // 떼고 나면 빈 글이 되는 것은 그대로 둔다
  assert.equal(normalizeShort('입니다'), '입니다');
  assert.equal(normalizeShort('?'), '?');
  assert.ok(!markShort('.', '', []), '문장부호만 쓴 답은 맞지 않는다');
  // 9절이 정한 것 말고는 바꾸지 않는다 (가운데 문장부호, 끝이 아닌 '입니다', 글자 모양)
  assert.ok(!markShort('13.92', '1392'));
  assert.ok(!markShort('유물입니다만', '유물'));
  assert.ok(!markShort('유물요', '유물'));
  assert.ok(!markShort('ABC', 'abc'));
});

test('섞기: 씨앗이 같으면 늘 같은 차례이고, 모든 번호가 한 번씩 나오며, 처음 차례 그대로 나오지 않는다', () => {
  for (const n of [2, 3, 4, 8, 12]) {
    for (const seed of ['5-2/1/01#sort', '5-2/1/05#order', 'a', '']) {
      const a = shuffledOrder(n, seed);
      assert.deepEqual(a, shuffledOrder(n, seed));
      assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i));
      assert.ok(a.some((v, i) => v !== i), `${n}개 ${seed}: 섞이지 않았습니다`);
    }
  }
  assert.deepEqual(shuffledOrder(1, 'x'), [0]);
  assert.notDeepEqual(shuffledOrder(12, '5-2/1/01#order'), shuffledOrder(12, '5-2/1/02-03#order'));
});
