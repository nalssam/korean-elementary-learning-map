// 내 자료함의 저장 (src/components/site/collect.ts, R51). 가짜 localStorage 로 본다: 보통 저장소, 망가진 값, 읽기·쓰기가 막힌 저장소.
// 페이지에서 단추를 누르는 것은 tests/contract/ui.test.ts 가 Chromium 으로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE_EVENT, STORAGE_KEY, count, decodeKnown, encodeKnown, has, isKey, read, remove, shownCount, storage, subscribe, toggle } from '#src/components/site/collect.ts';
import { KIND_ORDER } from '#lib/site.ts';
import type { Store } from '#src/components/site/collect.ts';

/** 보통의 저장소 */
function memory(start?: string): Store & { data: Map<string, string> } {
  const data = new Map<string, string>(start === undefined ? [] : [[STORAGE_KEY, start]]);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}
/** 무엇을 하든 오류를 던지는 저장소 (사이트 데이터를 막은 브라우저) */
const blocked: Store = {
  getItem: () => { throw new DOMException('막힘', 'SecurityError'); },
  setItem: () => { throw new DOMException('막힘', 'SecurityError'); },
  removeItem: () => { throw new DOMException('막힘', 'SecurityError'); },
};
/** 읽기는 되고 쓰기는 꽉 찬 저장소 */
const full = (start: string): Store => ({
  getItem: (k) => (k === STORAGE_KEY ? start : null),
  setItem: () => { throw new DOMException('꽉 참', 'QuotaExceededError'); },
  removeItem: () => {},
});

test('열쇠와 담은 값의 꼴: "<묶음 id>#<자료 종류>" 의 JSON 배열', () => {
  assert.equal(STORAGE_KEY, 'nalssam-cloud:saved:v1');
  assert.ok(isKey('5-2/1/01#worksheet') && isKey('5-2/1/02-03#web_activity') && isKey('3-1/10/12#slides'));
  for (const bad of ['5-2/1/01', '5-2/1/01#', '5-2/1/1#slides', '7-1/1/01#slides', '5-2/1/01#<b>', 42, null]) assert.ok(!isKey(bad), String(bad));
  const s = memory();
  assert.deepEqual(read(s), []);
  assert.equal(toggle('5-2/1/01#worksheet', s), true);
  assert.equal(toggle('5-2/1/01#slides', s), true);
  assert.equal(s.data.get(STORAGE_KEY), '["5-2/1/01#worksheet","5-2/1/01#slides"]');
  assert.deepEqual(read(s), ['5-2/1/01#worksheet', '5-2/1/01#slides']);
  assert.ok(has('5-2/1/01#slides', s) && !has('5-2/1/01#quiz', s));
  assert.equal(count(s), 2);
  // 다시 누르면 뺀다
  assert.equal(toggle('5-2/1/01#worksheet', s), false);
  assert.deepEqual(read(s), ['5-2/1/01#slides']);
  remove('5-2/1/01#slides', s);
  remove('5-2/1/01#slides', s);
  assert.deepEqual(read(s), []);
  // 꼴이 틀린 열쇠는 담지 않는다
  assert.equal(toggle('아무 글', s), false);
  assert.deepEqual(read(s), []);
});

test('망가진 값: 꼴이 틀린 줄은 버리고 겹친 줄은 하나로 읽는다', () => {
  assert.deepEqual(read(memory('이건 JSON 이 아님')), []);
  assert.deepEqual(read(memory('{"a":1}')), []);
  assert.deepEqual(read(memory('["5-2/1/01#quiz", 3, "x", "5-2/1/01#quiz", "5-2/1/01#cards"]')), ['5-2/1/01#quiz', '5-2/1/01#cards']);
});

test('막힌 저장소: 오류를 던지지 않고 빈 자료함처럼 군다', () => {
  assert.deepEqual(read(blocked), []);
  assert.equal(count(blocked), 0);
  assert.equal(has('5-2/1/01#quiz', blocked), false);
  assert.equal(toggle('5-2/1/01#quiz', blocked), false);
  assert.doesNotThrow(() => remove('5-2/1/01#quiz', blocked));
  // 쓰기만 막힌 저장소: 누르면 바뀌지 않은 상태를 돌려준다 (단추가 담긴 척하지 않는다)
  const f = full('["5-2/1/01#quiz"]');
  assert.equal(toggle('5-2/1/01#quiz', f), true);
  assert.equal(toggle('5-2/1/01#cards', f), false);
  // 저장소가 없을 때
  assert.deepEqual(read(undefined), []);
  assert.equal(toggle('5-2/1/01#quiz', undefined), false);
});

test('storage(): 이 브라우저의 저장소를 쓸 수 있을 때만 준다', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const put = (get: () => unknown) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, get });
  try {
    const s = memory();
    put(() => s);
    assert.equal(storage(), s);
    // 쓸 수 있는지 볼 때 쓴 것은 곧바로 지운다 (담은 것이 없는 사람의 브라우저에 아무것도 남기지 않는다)
    assert.deepEqual([...s.data.keys()], []);
    put(() => { throw new DOMException('막힘', 'SecurityError'); });
    assert.equal(storage(), undefined);
    put(() => full('[]'));
    assert.equal(storage(), undefined);
    put(() => undefined);
    assert.equal(storage(), undefined);
    assert.deepEqual(read(), []);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('subscribe(): 이 페이지에서 바꾸거나 다른 탭에서 바꾸면 알린다', () => {
  // Node 에는 window 가 없으므로 globalThis 에 이벤트를 잠깐 붙인다
  const bus = new EventTarget();
  const g = globalThis as unknown as Record<string, unknown>;
  const s = memory();
  const saved = { add: g.addEventListener, remove: g.removeEventListener, dispatch: g.dispatchEvent, ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  g.addEventListener = bus.addEventListener.bind(bus);
  g.removeEventListener = bus.removeEventListener.bind(bus);
  g.dispatchEvent = bus.dispatchEvent.bind(bus);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => s });
  try {
    const seen: string[][] = [];
    const stop = subscribe((keys) => seen.push(keys));
    toggle('5-2/1/01#cards');
    // 다른 탭: storage 이벤트. 다른 열쇠의 이벤트는 듣지 않는다
    s.data.set(STORAGE_KEY, '["5-2/1/01#cards","5-2/1/01#quiz"]');
    const other = (key: string | null) => Object.assign(new Event('storage'), { key });
    bus.dispatchEvent(other(STORAGE_KEY));
    bus.dispatchEvent(other('다른 열쇠'));
    assert.deepEqual(seen, [['5-2/1/01#cards'], ['5-2/1/01#cards', '5-2/1/01#quiz']]);
    stop();
    bus.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    assert.equal(seen.length, 2);
  } finally {
    g.addEventListener = saved.add; g.removeEventListener = saved.remove; g.dispatchEvent = saved.dispatch;
    if (saved.ls) Object.defineProperty(globalThis, 'localStorage', saved.ls);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('머리의 담은 수는 이번 빌드에 실린 자료만 센다: encodeKnown·decodeKnown·shownCount', () => {
  const keys = ['5-2/1/01#slides', '5-2/1/01#worksheet', '5-2/1/01#making_kit', '5-2/1/02-03#quiz', '5-2/1/02-03#web_activity'];
  const text = encodeKnown(keys, KIND_ORDER);
  // 묶음마다 한 덩어리, 종류는 KIND_ORDER 의 자리 한 글자
  assert.equal(text.split(' ').length, 2);
  assert.ok(text.startsWith('5-2/1/01:'));
  assert.deepEqual([...decodeKnown(text, KIND_ORDER)].sort(), [...keys].sort());
  // 모르는 종류는 버린다. 빈 글은 빈 모음
  assert.equal(encodeKnown(['5-2/1/01#nothing'], KIND_ORDER), '');
  assert.equal(decodeKnown('', KIND_ORDER).size, 0);
  // 담은 것 가운데 실리지 않은 것(다른 묶음, 사라진 자료)은 세지 않는다. 목록이 없으면 모두 센다
  const saved = ['5-2/1/01#slides', '5-2/1/04#slides', '5-2/1/02-03#cards'];
  assert.equal(shownCount(saved, decodeKnown(text, KIND_ORDER)), 1);
  assert.equal(shownCount(saved), 3);
  assert.equal(shownCount(saved, new Set()), 0);
});
