// 사이트 전체에서 쓰는 고정 문구와 이름표. 화면·인쇄물·PPTX 가 모두 여기에서 가져다 쓴다.
// 같은 것을 여러 담당이 저마다 다른 말로 부르지 않게 하려고 한 파일에 모았다.
import type { Licence, PrintSpec } from '../schema/common.ts';
import type { AssetKind, Media, OptionalAssetKind, ReviewKind } from '../schema/lesson.ts';

const author = '몽당분필 날쌤';
const licence = { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko' };
const aiNotice = 'AI 도구로 초안을 만들고 교사가 검수한 자료입니다.';
const licenceNote = '출처를 따로 적은 사진·그림은 이 조건이 아니라 저마다 적힌 조건을 따릅니다.';

export const SITE = {
  /** 사이트 이름 (임시. 날쌤이 정하면 여기 한 곳만 고친다) */
  name: '날쌤 초등사회',
  tagline: '초등 사회 3~6학년, 차시마다 바로 쓰는 수업 자료',
  author,
  /** 직접 만든 글·그림의 이용 조건 */
  licence,
  /** 이용 조건을 말하는 자리에 licence.name 과 늘 함께 쓴다 */
  licenceNote,
  /** 공개된 차시의 화면 맨 아래 문구. 직접 쓰지 말고 footerNotice() 로 얻는다. */
  aiNotice,
  /** 공개되지 않은 차시의 화면·인쇄물·PPTX 에 aiNotice 대신 넣는 문구 */
  draftNotice: '검수 전 초안입니다. 수업에 쓰지 마세요.',
  /** 공개 빌드에서 차시가 없는 페이지(첫 화면·학기·단원·소개)의 맨 아래 문구. 그 페이지 자체는 검수한 자료가 아니므로 aiNotice 를 쓰지 않는다. footerNotice() 가 고른다. */
  siteNotice: '차시 자료는 AI 도구로 초안을 만들고, 교사가 검수한 것만 공개합니다.',
  /** 미리 보기(SHOW_DRAFTS=1, astro dev)에서 차시가 없는 페이지(첫 화면·학기·단원)에 aiNotice 대신 넣는 문구. footerNotice() 가 고른다. */
  previewNotice: '검수 전 초안이 섞여 있는 미리 보기입니다.',
  /** 공개된 차시의 인쇄물 바닥글. 직접 쓰지 말고 sheetFooter() 로 얻는다. */
  // ·로 잇는 한 줄이라 괄호 안에 마침표 있는 문장을 넣지 않는다
  printFooter: `${author} · ${licence.name} (따로 적은 사진·그림은 그 조건) · ${aiNotice}`,
  repo: 'https://github.com/nalssam/korean-elementary-learning-map',
  /** 오류 제보 양식 주소. 날쌤이 정하면 채운다. 비어 있으면 깃허브 이슈 링크만 보여 준다. */
  reportUrl: '',
} as const;

/** 자료 종류의 우리말 이름 */
export const ASSET_LABEL = {
  slides: '수업 화면',
  worksheet: '학습지',
  quiz: '확인 퀴즈',
  papercraft: '페이퍼크래프트',
  coloring: '컬러링 도안',
  making_kit: '만들기 세트',
  escape: '방탈출',
  virtual3d: '3D·가상 체험',
  web_activity: '웹 활동',
  cards: '카드',
} as const satisfies Record<AssetKind, string>;

/**
 * 자료 페이지의 주소 조각. 페이지 주소는 lessonRoute(id, ASSET_ROUTE[kind]) 로 만든다.
 * 여기 없는 종류는 페이지가 없다: making_kit 은 안내 페이지 안에 나오고, escape·virtual3d 는 아직 만들지 않는다.
 */
export const ASSET_ROUTE = {
  slides: 'slides',
  worksheet: 'worksheet',
  quiz: 'quiz',
  papercraft: 'papercraft',
  coloring: 'coloring',
  cards: 'cards',
  web_activity: 'play',
} as const satisfies Partial<Record<AssetKind, string>>;
/** 페이지가 따로 있는 선택 자료 */
export type PagedAssetKind = Extract<keyof typeof ASSET_ROUTE, OptionalAssetKind>;

/** 이용 조건의 우리말 이름. CC 는 판(4.0 등)이 licence_url 에서 붙는다 (lib/content.ts 의 licenceName). */
export const LICENCE_LABEL: Record<Licence, string> = {
  original: licence.name,
  PD: '저작권 없음(퍼블릭 도메인)',
  CC0: 'CC0',
  'KOGL-1': '공공누리 제1유형',
  'CC-BY': 'CC BY',
  'CC-BY-SA': 'CC BY-SA',
};

/** 출처 표시의 첫 낱말 */
export const MEDIA_KIND_LABEL: Record<Media['kind'], string> = { photo: '사진', drawing: '그림', diagram: '그림', map: '지도' };

export const PER_LABEL = { student: '학생마다 1부', pair: '짝마다 1부', group: '모둠마다 1부', class: '학급에 1부' } as const satisfies Record<PrintSpec['per'], string>;
export const SIDES_LABEL = { single: '단면', duplex: '양면' } as const;
export const ORIENTATION_LABEL = { portrait: '세로', landscape: '가로' } as const;

/** 검수 종류의 우리말 이름 */
export const REVIEW_LABEL: Record<ReviewKind, string> = {
  fact: '사실 대조',
  originality: '베끼기 검사',
  voice: '문장 다듬기',
  print: '화면·인쇄 점검',
  owner: '날쌤 승인',
};

/** 차시표의 role 을 보여 줄 때 쓰는 말 (content 는 표시하지 않는다) */
export const ROLE_LABEL = { intro: '단원 도입', content: '', review: '단원 정리' } as const;

/** 채워진 인쇄 안내. printJobs() 가 PrintSpec 의 빈 칸을 PRINT_DEFAULT 로 채워 돌려준다. */
export interface PrintInfo {
  per: PrintSpec['per'];
  sides: 'single' | 'duplex';
  orientation: 'portrait' | 'landscape';
  bw_ok: boolean;
  paper: string;
  materials: string[];
  note?: string;
}

/** 인쇄물 종류 */
export type PrintKind = 'worksheet' | 'papercraft' | 'coloring' | 'cards';

/** 명세에 적지 않은 인쇄 안내의 기본값. 카드는 늘 A4 세로 양면이다. */
export const PRINT_DEFAULT: Record<PrintKind, PrintInfo> = {
  worksheet: { per: 'student', sides: 'single', orientation: 'portrait', bw_ok: true, paper: 'A4 보통 용지', materials: [] },
  papercraft: { per: 'group', sides: 'single', orientation: 'portrait', bw_ok: true, paper: 'A4 보통 용지', materials: [] },
  coloring: { per: 'student', sides: 'single', orientation: 'portrait', bw_ok: true, paper: 'A4 보통 용지', materials: [] },
  cards: { per: 'group', sides: 'duplex', orientation: 'portrait', bw_ok: true, paper: 'A4 보통 용지', materials: ['가위'] },
};

/** 카드는 A4 세로 한 면에 8장 (2열 × 4행). 앞면 쪽 다음에 뒷면 쪽이 온다. */
export const CARDS_PER_SIDE = 8;

/** 인쇄 안내 한 줄. 안내 페이지와 인쇄 페이지가 같은 말을 쓰도록 여기에서 만든다. 예: "모둠마다 1부 · A4 세로 3쪽 · 단면 · 흑백으로 뽑아도 됩니다" */
export function printLine(p: PrintInfo, pages: number): string {
  return [PER_LABEL[p.per], `A4 ${ORIENTATION_LABEL[p.orientation]} ${pages}쪽`, SIDES_LABEL[p.sides], p.bw_ok ? '흑백으로 뽑아도 됩니다' : '색으로 뽑습니다'].join(' · ');
}
