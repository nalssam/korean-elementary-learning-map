// 내 자료함 (R51). 담은 자료는 이 브라우저의 localStorage 에만 남는다. 사이트 밖으로 아무것도 보내지 않는다.
//
// 담는 값은 "<묶음 id>#<자료 종류>" 글의 JSON 배열이다. 예: ["5-2/1/01#worksheet","5-2/1/01#slides"]. catalog() 의 key 와 같다.
// 저장소를 쓸 수 없는 브라우저(사생활 보호 창, 막아 둔 사이트 데이터, 꽉 찬 저장소)도 있다. 그래서 저장소를 만지는 곳은 모두 try/catch 안에 두고,
// 쓸 수 없으면 아무것도 담지 않은 것처럼 군다 (담기 단추는 숨은 채 남고, 내 자료함은 빈 자료함과 안내를 보여 준다).
//
// 페이지에서 쓰는 법:
//   <button type="button" data-collect="5-2/1/01#worksheet" aria-pressed="false" hidden>담기</button>   담기 단추 (ResourceCard 가 그린다)
//   <span data-collect-count></span>                                                                     담은 수 (머리의 내 자료함 단추)
//   <script>import { init } from '…/collect.ts'; init();</script>
// init() 은 여러 번 불러도 된다 (단추를 새로 그린 뒤에 다시 부르면 그 단추의 상태도 맞춘다).
// 이 파일은 Node 에서도 읽힌다 (시험). window·document 는 함수 안에서만 만진다.

/** localStorage 의 열쇠. 판(v1)을 바꾸면 옛 값은 읽지 않는다. */
export const STORAGE_KEY = 'nalssam-cloud:saved:v1';
/** 담은 것이 바뀌면 window 에 보내는 이벤트. detail 은 담은 열쇠의 배열 */
export const CHANGE_EVENT = 'nalssam-cloud:saved';

/** localStorage 의 쓰는 부분만. 시험은 가짜를 넘긴다. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// 쓸 수 있는지 볼 때 잠깐 썼다가 지우는 열쇠. 담은 것이 없는 사람의 브라우저에는 아무것도 남기지 않는다.
const PROBE = 'nalssam-cloud:probe';

/** "5-2/1/01#worksheet" 꼴인가. 다른 글(손으로 고친 값, 옛 판의 값)은 읽을 때 버린다. */
export function isKey(value: unknown): value is string {
  return typeof value === 'string' && /^[3-6]-[12]\/[1-9]\d?\/\d{2}(?:-\d{2})?#[a-z0-9_]+$/.test(value);
}

/** 이 브라우저의 localStorage. 쓸 수 없으면(막혀 있거나, 읽기만 되거나) undefined. */
export function storage(): Store | undefined {
  try {
    const s = (globalThis as { localStorage?: Store }).localStorage;
    if (!s) return undefined;
    // 읽기는 되는데 쓰기가 막힌 브라우저가 있다 (옛 사파리의 사생활 보호 창). 써 보고 곧바로 지운다.
    s.setItem(PROBE, '1');
    s.removeItem(PROBE);
    s.getItem(STORAGE_KEY);
    return s;
  } catch {
    return undefined;
  }
}

/** 담은 열쇠, 담은 차례. 저장소를 쓸 수 없거나 값이 망가졌으면 빈 목록. */
export function read(store: Store | undefined = storage()): string[] {
  if (!store) return [];
  try {
    const raw: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? [...new Set(raw.filter(isKey))] : [];
  } catch {
    return [];
  }
}

// 쓰고 알린다. 쓰지 못하면 false (바뀐 것이 없다).
function write(keys: string[], store: Store | undefined): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    return false;
  }
  try {
    globalThis.dispatchEvent?.(new CustomEvent(CHANGE_EVENT, { detail: keys }));
  } catch { /* 알림을 보내지 못해도 담은 것은 그대로다 */ }
  return true;
}

export function has(key: string, store: Store | undefined = storage()): boolean {
  return read(store).includes(key);
}

export function count(store: Store | undefined = storage()): number {
  return read(store).length;
}

/** 담겨 있으면 빼고, 없으면 담는다. 돌려주는 값은 바꾼 뒤에 담겨 있는가. 저장하지 못했으면 원래 상태를 돌려준다. */
export function toggle(key: string, store: Store | undefined = storage()): boolean {
  const keys = read(store);
  const on = keys.includes(key);
  if (!isKey(key)) return on;
  const next = on ? keys.filter((k) => k !== key) : [...keys, key];
  return write(next, store) ? !on : on;
}

/** 뺀다 (내 자료함의 빼기 단추). 없던 것이면 아무 일도 없다. */
export function remove(key: string, store: Store | undefined = storage()): void {
  const keys = read(store);
  if (keys.includes(key)) write(keys.filter((k) => k !== key), store);
}

/**
 * 담은 것이 바뀔 때마다 fn 을 부른다: 이 페이지에서 담거나 뺐을 때, 다른 탭에서 바꿨을 때(storage 이벤트).
 * 돌려주는 함수를 부르면 그만 듣는다.
 */
export function subscribe(fn: (keys: string[]) => void): () => void {
  const target = globalThis as unknown as EventTarget;
  if (!target.addEventListener) return () => {};
  const own = () => fn(read());
  const other = (e: Event) => { if ((e as StorageEvent).key === STORAGE_KEY || (e as StorageEvent).key === null) fn(read()); };
  target.addEventListener(CHANGE_EVENT, own);
  target.addEventListener('storage', other);
  return () => { target.removeEventListener(CHANGE_EVENT, own); target.removeEventListener('storage', other); };
}

// 같은 페이지에 이 파일이 두 번 실려도(카드와 머리가 따로 부를 때) 누르기를 한 번만 듣게 한다. 두 번 들으면 담고 곧바로 뺀다.
const WIRED = Symbol.for('nalssam-cloud.collect');

/** 페이지의 담기 단추와 담은 수를 지금 담긴 것에 맞춘다. */
export function refresh(root: ParentNode = document, store: Store | undefined = storage()): void {
  const keys = read(store);
  for (const b of root.querySelectorAll<HTMLElement>('[data-collect]')) {
    // 저장소를 쓸 수 없으면 누를 수 없는 단추를 보여 주지 않는다
    b.hidden = !store;
    b.setAttribute('aria-pressed', String(keys.includes(b.dataset.collect ?? '')));
  }
  for (const c of root.querySelectorAll<HTMLElement>('[data-collect-count]')) {
    c.textContent = String(keys.length);
    c.dataset.count = String(keys.length);
  }
}

/**
 * 담기 단추([data-collect])와 담은 수([data-collect-count])를 잇는다. 여러 번 불러도 된다.
 * 누르기는 document 에서 한 번만 듣는다. 그래서 나중에 그린 단추도 누르면 담긴다 (상태는 다시 init() 이나 refresh() 로 맞춘다).
 */
export function init(): void {
  if (typeof document === 'undefined') return;
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (!g[WIRED]) {
    g[WIRED] = true;
    document.addEventListener('click', (e) => {
      const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-collect]');
      if (!b || !b.dataset.collect) return;
      toggle(b.dataset.collect);
      refresh();
    });
    subscribe(() => refresh());
  }
  refresh();
}
