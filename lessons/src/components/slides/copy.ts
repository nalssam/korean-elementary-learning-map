// 수업 화면과 PPTX 가 같이 쓰는 문구와 글자 크기.
// 웹 무대(Stage.astro 와 장 컴포넌트)와 PPTX 생성기(generators/pptx/build.mjs → .cache/lessons.json → Python)가 이 파일 하나에서 가져간다.
// Python 쪽에 문구를 다시 적지 않으려는 것이다 (docs/CONTRACT.md 8절).
import { ASSET_LABEL } from '#lib/site.ts';

/** 장 안에 찍히는 이름표 */
export const SLIDE_COPY = {
  /** 낱말 장의 머리 */
  term: '새 낱말',
  /** 낱말 장의 쓰임 예 앞 */
  example: '이렇게 써요',
  /** 퀴즈 장의 머리 */
  quiz: ASSET_LABEL.quiz,
  /** OX 문항의 두 칸 */
  ox: { yes: 'O', no: 'X' },
  /** 단답 문항의 빈칸 앞 */
  shortAnswer: '답',
  /** 드러난 정답에 붙는 표 */
  correct: '정답',
  /** 활동 장의 시간 칸 */
  minutes: '시간',
  /** 분 단위. 예: "15분" */
  minuteUnit: '분',
  /** 활동 장의 준비물 칸 */
  materials: '준비물',
} as const;

/** 교사 메모(발표 화면의 메모, PPTX 메모란)에 붙는 머리 */
export const NOTE_COPY = {
  heading: '교사 메모',
  empty: '이 장에는 메모가 없습니다.',
  answer: '정답',
  explain: '풀이',
} as const;

/** PPTX 마지막 장 */
export const CREDIT_COPY = {
  heading: '그림 출처',
  /** 수업 화면에 실린 그림이 없을 때 */
  empty: '이 수업 화면에는 그림이 실리지 않았습니다.',
  /** 출처가 여러 장으로 나뉠 때 제목 뒤에 붙는다. {n}·{total} 을 채운다. 예: "그림 출처 (2/3)" */
  more: '({n}/{total})',
} as const;

/** 웹 무대의 조작 단추와 안내 */
export const STAGE_COPY = {
  prev: '이전 장',
  next: '다음 장',
  fullscreen: '전체 화면',
  notes: '교사 메모',
  exit: '차시 안내로',
  /** 차시 안내 페이지의 접힌 '그림 출처'로 가는 링크 */
  credits: '그림 출처',
  /** 단추 옆 글쇠 안내 */
  keys: { prev: '←', next: '→', fullscreen: 'F', notes: 'N', exit: 'Esc' },
  /** 퀴즈 장에서 정답이 아직 가려져 있을 때 메모 칸에 보이는 한 줄 */
  revealHint: '다음 장 키(→, 스페이스 바)를 누르면 화면에 정답이 나옵니다.',
  /** 그림 파일을 불러오지 못했을 때 그림 자리에 보이는 글 */
  missing: '그림을 불러오지 못했습니다',
  /** 화면 가리기(B, .)를 켰을 때 화면 읽기 프로그램에 알리는 글 */
  blank: '화면을 가렸습니다. 다음 장이나 이전 장 키를 누르면 다시 보입니다.',
  /** 화면 읽기 프로그램용 */
  slideLabel: (no: number, total: number) => `${total}장 가운데 ${no}번째 장`,
  region: '수업 화면',
} as const;

/**
 * 차시 안내 페이지에서 그림 출처를 접어 둔 상자의 id. 수업 화면의 '그림 출처' 링크가 `<안내 페이지>#credits` 로 연다.
 * 안내 페이지(사이트 담당의 KitTeacher.astro)의 그림 출처 상자가 이 id 를 쓴다.
 */
export const CREDITS_ANCHOR = 'credits';

/**
 * 글자 크기 (1920 × 1080 무대의 px). PPTX 는 이 값의 절반을 pt 로 쓴다 (13.333in × 72 = 960pt ↔ 1920px).
 * 아이가 읽는 글은 제목 72px, 본문 44px 를 기본으로 쓴다 (docs/CONTRACT.md 8절).
 * 그림 출처와 장 번호 말고는 그림 안의 글까지 어떤 글도 min(28px)보다 작게 그리지 않는다.
 * 표지의 차시표·초안 표시·읽기 자료의 출처 한 줄은 아이가 읽는 본문이 아니라서 meta(30px)로 쓴다.
 */
export const STAGE_TYPE = {
  cover: 104,
  coverSub: 52,
  title: 72,
  question: 80,
  term: 128,
  meaning: 56,
  lead: 52,
  body: 44,
  label: 44,
  meta: 30,
  credit: 24,
  counter: 24,
  /** 장마다 왼쪽 아래에 찍는 초안 표시 (공개하지 않은 차시만) */
  draft: 28,
  /** 그림 출처·장 번호를 뺀 모든 글의 바닥 (그림 안의 글 포함) */
  min: 28,
} as const;

/**
 * 글이 장에 맞게 줄어드는 자리. 앞의 크기부터 해 보고, 넘치거나 그림 틀이 pictureMin 보다 낮아지면 다음 크기로 내린다.
 * 웹 무대는 Stage.astro 의 스크립트가 재 보고 고르고, PPTX 는 build_pptx.py 가 글꼴 폭으로 셈해 고른다.
 * 스크립트가 없으면 마지막(가장 작은) 크기로 그린다.
 */
export const STAGE_FIT = {
  /** 그림 없는 항목 장의 항목 (항목 사이 48px, 위아래 가운데) */
  points: [56, 52, 48, 44],
  /** 그림 없는 견주기 장의 항목 */
  compare: [52, 48, 44],
  /** 그림 있는 견주기 장의 항목. 그림 틀이 pictureMin 보다 낮아지지 않게 글을 먼저 줄인다 */
  compareMedia: [44, 40, 36, 32],
  /** 활동 장의 할 일 */
  activity: [52, 48, 44],
  /** 그림 있는 단계 장의 글 */
  stepsMedia: [44, 40, 36],
} as const;

/** 그림 틀의 크기 (무대 px) */
export const STAGE_PICTURE = {
  /** 견주기 장의 그림 틀이 지키려는 높이. 글을 다 줄여도 안 되면 이보다 낮아진다 */
  compareMin: 360,
  /** 어느 장에서든 그림 틀의 짧은 변이 이보다 작으면 너무 작다 (tests/slides 와 build_pptx.py 가 본다) */
  shortSide: 200,
} as const;
