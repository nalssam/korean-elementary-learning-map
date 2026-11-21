// 쪽수·차시로 찾기의 셈. 브라우저(Finder.astro 의 스크립트)와 시험(tests/site)이 같이 쓴다.
// 파일을 읽지 않는다. 찾을 거리는 페이지가 HTML 에 실어 준 값(FinderSemester)뿐이다.
// 차시표의 focus 는 이 값에 들어 있지 않다. 검수를 거치지 않은 계획 글이라 찾기 결과에도 찍지 않는다 (docs/CONTRACT.md 3절).

/** 차시표의 묶음 하나. 이번 빌드에 실리지 않는 묶음은 href 와 title 이 없다. */
export interface FinderBundle {
  /** 단원 번호 */
  unit: number;
  /** 차시 번호. 예: [4, 5] */
  lessons: number[];
  /** 교과서 쪽수 [시작, 끝] */
  pages: [number, number];
  /** 보여 줄 자리. 예: "1단원 4~5차시 · 14~19쪽" */
  where: string;
  /** 차시 안내 페이지의 주소 (하위 경로까지 붙은 것) */
  href?: string;
  /** 명세의 차시 이름 */
  title?: string;
}

export interface FinderSemester {
  /** "5-2" */
  id: string;
  /** "5학년 2학기" */
  label: string;
  bundles: FinderBundle[];
}

export interface FinderQuery {
  n: number;
  /** "2단원 5차시"처럼 단원을 함께 적었을 때 */
  unit?: number;
  /** page: "34쪽" · lesson: "5차시" · either: 숫자만 */
  by: 'page' | 'lesson' | 'either';
}

/** 첫 화면의 두 찾기(쪽수·차시로 찾기, 낱말로 찾기)가 서로에게 '내가 결과를 띄웠다'고 알리는 이벤트 이름. detail 은 보낸 쪽('finder' 또는 'search')이다. */
export const FIND_EVENT = 'site-find';

/** 적은 글을 읽지 못했을 때의 한 줄. 찾기 단추를 눌렀을 때 보여 준다. */
export const QUERY_HELP = '쪽수나 차시 번호를 숫자 하나로 넣어 주세요. 예: 34, 34쪽, 5차시';

// 받는 꼴: [N단원] [p.]숫자 [쪽|p|차시]. 숫자는 하나만 받는다.
// "-1", "1.5", "6-9" 처럼 숫자가 둘이거나 부호가 붙은 글은 어느 쪽을 찾을지 모르므로 받지 않는다 (예전에는 첫 숫자만 읽어 1 이나 6 을 찾았다).
const QUERY = /^(?:(\d{1,2})\s*단원\s*)?(?:(p)\.?\s*)?(\d{1,3})\s*(쪽|차시|p)?$/i;

/**
 * 적은 글에서 찾을 숫자를 읽는다. "34", "34쪽", "p.34", "5차시", "2단원 5차시", "2단원 1".
 * 전각 숫자(７)와 전각 글자는 NFKC 로 바꾸어 읽는다. 꼴에 맞지 않거나 0 이면 undefined.
 */
export function parseQuery(text: string): FinderQuery | undefined {
  const m = QUERY.exec(text.normalize('NFKC').trim());
  if (!m) return undefined;
  const [, unitText, pagePrefix, num, suffix] = m;
  const n = Number(num);
  if (n < 1) return undefined;
  const unit = unitText === undefined ? undefined : Number(unitText);
  const by = suffix === '차시' ? 'lesson' : suffix || pagePrefix ? 'page' : unit !== undefined ? 'lesson' : 'either';
  return { n, by, ...(unit !== undefined ? { unit } : {}) };
}

export interface FinderHits {
  /** 그 쪽을 다루는 묶음. 두 묶음이 한 쪽을 나눠 쓰면 둘 다 나온다. */
  page: FinderBundle[];
  /** 그 차시 번호가 든 묶음 (단원마다 하나씩). 쪽수로 이미 나온 묶음은 뺀다. */
  lesson: FinderBundle[];
}

export function findBundles(semester: FinderSemester, q: FinderQuery): FinderHits {
  const inUnit = (b: FinderBundle) => q.unit === undefined || b.unit === q.unit;
  const page = q.by === 'lesson' ? [] : semester.bundles.filter((b) => inUnit(b) && b.pages[0] <= q.n && q.n <= b.pages[1]);
  const lesson = q.by === 'page' ? [] : semester.bundles.filter((b) => inUnit(b) && b.lessons.includes(q.n) && !page.includes(b));
  return { page, lesson };
}

/** 학기의 교과서 쪽수 범위. 찾지 못했을 때 알려 준다. */
export function pageRange(semester: FinderSemester): [number, number] | undefined {
  if (semester.bundles.length === 0) return undefined;
  return [Math.min(...semester.bundles.map((b) => b.pages[0])), Math.max(...semester.bundles.map((b) => b.pages[1]))];
}

/** 아무것도 찾지 못했을 때의 한 줄 */
export function emptyMessage(semester: FinderSemester, q: FinderQuery): string {
  const range = pageRange(semester);
  const pages = range ? ` 교과서 쪽수는 ${range[0]}쪽부터 ${range[1]}쪽까지입니다.` : '';
  const unit = q.unit === undefined ? '' : ` ${q.unit}단원`;
  if (q.by === 'page') return `${semester.label}${unit} 차시표에 ${q.n}쪽이 없습니다.${pages}`;
  if (q.by === 'lesson') return `${semester.label}${unit} 차시표에 ${q.n}차시가 없습니다.`;
  return `${semester.label} 차시표에 ${q.n}쪽도 ${q.n}차시도 없습니다.${pages}`;
}
