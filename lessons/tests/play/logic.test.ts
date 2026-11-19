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
  assert.ok(!markShort('ABC', 'abc'));
});

test('단답 채점: 흔한 끝말(입니다·이에요·예요·이요·요·이야·야·이다)은 떼고 견준다 (R28, 9절)', () => {
  for (const said of ['유물이에요', '유물이다', '유물예요', '유물이야', '유물요', '유 물 입니다.', '유물이에요!', '유물야', '유물이요?', ' 유물 ']) {
    assert.ok(markShort(said, '유물'), `'${said}' 는 '유물' 로 맞아야 합니다`);
    assert.equal(normalizeShort(said), '유물', said);
  }
  // 긴 끝말부터 뗀다 ('이에요' 를 '요' 하나로 떼지 않는다)
  assert.equal(normalizeShort('고인돌이에요'), '고인돌');
  // 끝말만 쓴 답은 아무것도 아닌 글로 줄이지 않는다. 그래서 맞는 답이 되지 않는다.
  for (const only of ['입니다', '요', '이에요', '야', '이다.']) {
    assert.ok(normalizeShort(only).length > 0, only);
    assert.ok(!markShort(only, '유물'), `'${only}' 가 맞는 답이 되었습니다`);
  }
  assert.equal(normalizeShort('입니다'), '입니다');
  assert.equal(normalizeShort('요'), '요');
  // 틀린 낱말은 끝말을 떼어도 틀린다
  for (const wrong of ['유적이에요', '유적입니다', '유적요', '돌이다', '유물들이에요']) assert.ok(!markShort(wrong, '유물'), wrong);
  // 정답 쪽 끝말은 떼지 않는다: '가야' 의 '야' 는 끝말이 아니다
  assert.ok(markShort('가야', '가야'));
  assert.ok(markShort('가야예요', '가야'));
  assert.ok(markShort('가야요.', '가야'));
  assert.ok(!markShort('가', '가야'), "'가' 가 '가야' 로 맞았습니다");
  // 정답이 '이'로 끝나는 낱말이어도 '요'만 떼면 맞는다
  assert.ok(markShort('거북이요', '거북이'));
  // accept 에 끝말을 적은 옛 명세도 그대로 맞는다
  assert.ok(markShort('유물입니다', '유물', ['유물입니다']));
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
