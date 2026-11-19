// 명세 전체에서 같이 쓰는 작은 형식들.
//
// 이 폴더의 형식은 교사가 YAML 을 손으로 고칠 때 바로 알아볼 수 있어야 한다.
//  - 모든 묶음은 strictObject 다. 오타 난 칸 이름이 말없이 버려지지 않는다.
//  - 정규식과 refine 에는 "대신 무엇을 적는지"를 한국어로 적는다.
//  - 나머지 오류(빠진 칸, 틀린 선택값, 개수)는 lib/content.ts 가 한국어로 풀어 준다.
import { z } from 'zod';

// YAML 은 따옴표 없는 1392 를 숫자로 읽는다. 연도·개수를 글 자리에 그대로 적을 수 있게 글로 바꿔 받는다.
const numberAsText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : v);

/** 빈 글을 허용하지 않는 글. 숫자만 적은 값(1392)도 글로 받는다. */
export const Text = z.preprocess(numberAsText, z.string().trim().min(1, '빈 글은 쓸 수 없습니다. 칸을 지우거나 내용을 적습니다'));

/**
 * 길이를 제한한 글. 수업 화면·PPTX·카드·퀴즈는 넘침을 자동으로 잡지 못하므로 형식에서 막는다.
 * 숫자는 "이 틀에 들어가는 글자 수"이고 틀을 만드는 쪽(슬라이드·활동·인쇄물)이 이 길이까지는 넘치지 않게 그린다.
 */
export const T = (max: number) =>
  z.preprocess(
    numberAsText,
    z.string().trim().min(1, '빈 글은 쓸 수 없습니다. 칸을 지우거나 내용을 적습니다')
      .max(max, { error: (iss) => `${max}자까지만 씁니다 (지금 ${String(iss.input).length}자). 문장을 줄이거나 둘로 나눕니다` }),
  );

/**
 * 지금 형식의 판. 차시표(registry.yaml)와 차시 명세(lesson.yaml)가 같이 쓴다.
 * 칸 이름·값·뜻이 바뀌거나 필수 칸이 늘 때만 올린다 (docs/CONTRACT.md "형식을 바꿀 때").
 */
export const SCHEMA_VERSION = 1;
export const SchemaVersion = z.literal(SCHEMA_VERSION, {
  error: `이 칸에는 ${SCHEMA_VERSION} 을 적습니다 (schema_version: ${SCHEMA_VERSION}). 옛 형식 파일이면 scripts/migrate/ 의 스크립트로 옮깁니다`,
});

/** 영문 소문자·숫자·하이픈으로 된 식별자 (그림 id, 읽기 자료 id, 전개도 모듈 이름) */
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '영문 소문자·숫자·하이픈만 씁니다. 예: dolmen-parts');

/** 날짜 */
export const DateStr = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 "2026-11-18"처럼 씁니다')
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: '달력에 없는 날짜입니다. "2026-11-18"처럼 씁니다' });

/**
 * 누르면 열리는 웹 주소. javascript:, data:, file: 같은 것을 막는다 (명세는 낯선 사람의 PR 로도 들어온다).
 * "@" 앞에 이름을 붙인 주소(https://www.museum.go.kr@다른.곳/…)도 막는다. 박물관 주소처럼 읽히지만 열리는 곳은 "@" 뒤다.
 */
export const Url = z.httpUrl({ error: 'https:// 로 시작하는 웹 주소를 씁니다' })
  .refine((u) => !/^https?:\/\/[^/?#]*@/i.test(u.trim()), { message: '주소의 "@" 앞부분(이름·암호)을 지웁니다. "@" 뒤가 실제로 열리는 곳입니다' });

/** 학기 id: "5-2" */
export const SemesterId = z.string().regex(/^[3-6]-[12]$/, '"5-2"처럼 학년-학기로 씁니다');

/** "03-04" → [3, 4], "5-2/1/03-04" → [3, 4]. 차시 번호는 묶음 id 에서만 나온다. */
export function lessonsOf(id: string): number[] {
  const [a, b = a] = (id.split('/').pop() ?? '').split('-').map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/**
 * 차시 묶음 id: "01" 또는 "03-04". 폴더 이름이자 주소다.
 * YAML 은 따옴표 없는 01 을 숫자 1 로 읽는다. 그렇게 적어도 "01" 로 받는다.
 */
export const BundleId = z.preprocess(
  (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100 ? String(v).padStart(2, '0') : v),
  z.string()
    .regex(/^\d{2}(?:-\d{2})?$/, '"01" 또는 "03-04"처럼 두 자리 차시 번호로 씁니다')
    .refine((s) => { const n = lessonsOf(s).length; return n >= 1 && n <= 3; }, { message: '한 묶음은 1~3차시입니다. "03-04"처럼 앞 번호가 작아야 합니다' }),
);

/** 차시 명세의 id: "5-2/1/03-04" */
export const LessonId = z.string()
  .regex(/^[3-6]-[12]\/[1-9]\d?\/\d{2}(?:-\d{2})?$/, '"5-2/1/01"처럼 학기/단원/묶음으로 씁니다. 파일이 놓인 폴더와 같습니다')
  .refine((s) => { const n = lessonsOf(s).length; return n >= 1 && n <= 3; }, { message: '한 묶음은 1~3차시입니다. "5-2/1/03-04"처럼 앞 번호가 작아야 합니다' });

/** 2022 개정 사회과 성취기준 코드: "6사05-01" (대괄호 없이) */
export const StandardCode = z.string().regex(/^[46]사\d{2}-\d{2}$/, '"6사05-01"처럼 대괄호 없이 씁니다');

/** 사실 id */
export const FactId = z.string().regex(/^f\d{1,3}$/, '"f1", "f12"처럼 씁니다');

/** 사실을 가리키는 말. "f3" 은 이 묶음의 사실, "05/f3" 은 같은 단원 05 묶음의 사실이다. */
export const FactRef = z.string().regex(/^(?:\d{2}(?:-\d{2})?\/)?f\d{1,3}$/, 'facts 에 적은 id 를 씁니다. 예: f3 (같은 단원의 앞 묶음 것은 "05/f3")');
/** 사실을 가리키는 목록 (없어도 된다) */
export const FactRefs = z.array(FactRef).default([]);
/** 맞고 틀림이 있는 글(퀴즈 문항, 카드, 낱말 풀이)은 사실을 하나 이상 가리킨다. */
export const FactRefs1 = z.array(FactRef, { error: '근거가 되는 사실 id 를 facts 에 하나 이상 적습니다. 예: facts: [f1]' })
  .min(1, '근거가 되는 사실 id 를 facts 에 하나 이상 적습니다. 예: facts: [f1]');

/** 그림을 가리키는 말. "dolmen-parts" 는 이 묶음의 그림, "05/rain-gauge" 는 같은 단원 05 묶음의 그림이다. */
export const MediaRef = z.string().regex(/^(?:\d{2}(?:-\d{2})?\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/, 'media 에 적은 id 를 씁니다. 예: dolmen-parts (같은 단원의 앞 묶음 것은 "05/rain-gauge")');

/** 검수한 내용의 지문. `npm run sign` 이 적는다. 손으로 적지 않는다. */
export const Seal = z.string().regex(/^[0-9a-f]{12}$/, '지문은 손으로 적지 않습니다. npm run sign 이 적습니다');

/**
 * 이용 조건.
 * - original: 이 프로젝트에서 직접 만든 것 (CC BY-NC-SA 4.0 으로 공개)
 * - KOGL-1~4: 공공누리 1~4유형
 * - CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, CC-BY-ND, CC-BY-NC-ND
 * - PD: 저작권이 없다 (credit.note 에 그렇게 본 까닭을 적는다)
 * - permission: 권리자에게 따로 허락받음 (credit.note 에 허락 범위를 적는다)
 */
export const Licence = z.enum([
  'original',
  'KOGL-1', 'KOGL-2', 'KOGL-3', 'KOGL-4',
  'CC0', 'CC-BY', 'CC-BY-SA', 'CC-BY-NC', 'CC-BY-NC-SA', 'CC-BY-ND', 'CC-BY-NC-ND',
  'PD',
  'permission',
]);
export type Licence = z.infer<typeof Licence>;

/** 자르거나 본떠 그릴 수 없는 이용 조건 (변경 금지) */
export const NO_DERIVATIVE: readonly Licence[] = ['KOGL-3', 'KOGL-4', 'CC-BY-ND', 'CC-BY-NC-ND'];
/** 본떠 그릴 수 없는 이용 조건. CC BY-SA 를 본뜬 그림은 CC BY-SA 로만 내놓을 수 있어 이 사이트의 조건(CC BY-NC-SA)과 맞지 않는다. */
export const NO_TRACE: readonly Licence[] = [...NO_DERIVATIVE, 'CC-BY-SA'];

/**
 * 인쇄 안내. 화면의 인쇄 안내 줄과 안내 페이지의 준비물이 여기에서 나온다.
 * 쪽수는 적지 않는다 (학습지는 pages 의 수, 카드는 장수, 컬러링은 1쪽, 페이퍼크래프트는 그 자료의 pages).
 * 적지 않은 칸은 lib/site.ts 의 PRINT_DEFAULT 로 채워진다. 채운 값은 printJobs() 로만 읽는다.
 */
export const PrintSpec = z.strictObject({
  /** 누구에게 한 부씩인가 */
  per: z.enum(['student', 'pair', 'group', 'class']),
  /** 단면·양면. 적지 않으면 단면 (카드는 늘 양면) */
  sides: z.enum(['single', 'duplex']).optional(),
  /** 세로·가로. 적지 않으면 세로 */
  orientation: z.enum(['portrait', 'landscape']).optional(),
  /** 흑백으로 뽑아도 되는가. 적지 않으면 된다(true). 색이 꼭 있어야 하는 자료에만 false 를 적는다. */
  bw_ok: z.boolean().optional(),
  /** 권하는 종이. 예: "A4 180g 이상 두꺼운 종이". 적지 않으면 A4 보통 용지 */
  paper: Text.optional(),
  /** 이 인쇄물을 쓸 때 필요한 준비물. 예: [가위, 풀] */
  materials: z.array(Text).default([]),
  /** 인쇄할 때 주의할 점 한 줄 */
  note: Text.optional(),
});
export type PrintSpec = z.infer<typeof PrintSpec>;
