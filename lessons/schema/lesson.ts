// 차시 명세(lesson.yaml) 형식.
//
// 차시 묶음 하나에 명세 파일 하나. 안내 페이지·수업 화면·PPTX·학습지·퀴즈·카드·만들기는 모두 이 파일에서 나온다.
// 그래서 사실은 facts 에 한 번만 적고, 맞고 틀림이 있는 글(퀴즈·카드·낱말 풀이)은 그 사실을 가리키게 한다.
//
// 차시 번호·쪽수·성취기준·단원명은 차시표(content/registry.yaml)에 있다. 여기에 다시 적지 않는다.
//
// 글의 독자가 셋이다 (lib/content.ts 의 childStrings · teacherStrings · recordStrings 가 이 구분으로 글을 뽑는다).
//  - 아이가 읽는 글: 수업 화면의 글, 읽기 자료, 낱말 풀이, 학습지, 퀴즈, 카드·웹 활동·만들기 순서, 그림 설명
//  - 교사가 읽는 글: tagline, objectives, flow, notes, guide, 인쇄 안내, misconceptions, teacher_notes, 사실 문장
//  - 제작 기록: 만들지 않는 까닭(reason), 계획(idea), 검수·확인 기록. 사이트에 보여 주지 않는다.
//
// 이 파일은 명세 하나만 보고 알 수 있는 것을 검사한다. 차시표나 다른 묶음, 파일, 지문을 봐야 하는 검사는 lib/content.ts 가 한다.
import { z } from 'zod';
import {
  BundleId, DateStr, FactId, FactRefs, FactRefs1, LessonId, Licence, MediaRef,
  PrintSpec, SchemaVersion, Seal, Slug, T, Text, Url, lessonsOf,
} from './common.ts';

const so = z.strictObject;

/** 한 차시는 40분. 흐름의 시간은 차시마다 이 값과 같아야 한다. */
export const PERIOD_MINUTES = 40;
/** 수업 화면은 한 차시에 이만큼까지. 두 차시 묶음은 그 두 배, 세 차시 묶음은 세 배까지 쓴다. */
export const SLIDES_PER_LESSON = 24;
/** 수업 화면의 passage 장 한 장에 들어가는 읽기 자료 (1920 × 1080, 제목 72px·본문 44px 로 재 본 값: 문단 셋에 360자, 문단 넷에 300자는 들어가고 문단 넷에 480자는 넘친다) */
export const PASSAGE_SLIDE = { paragraphs: 4, chars: 300 } as const;

// ───────────────────────────── 사실과 출처 ─────────────────────────────

export const Source = so({
  /** 기관·자료 이름. 예: 국립중앙박물관. 교과서와 교과서 회사 자료는 출처로 쓰지 않는다. */
  name: Text,
  /** 문서·소장품 제목 */
  title: Text.optional(),
  /** 누구나 열어 볼 수 있는 주소 */
  url: Url,
  /** 출처에서 근거가 되는 구절을 그대로 짧게. 검증자가 무엇을 보고 확인했는지 남긴다. 공개하려면 사실마다 하나는 있어야 한다. */
  quote: T(160).optional(),
  /** 주소를 열어 확인한 날 */
  accessed: DateStr,
});

/** 사실 확인 기록. `npm run sign` 이 적는다. */
export const FactCheck = so({
  /** 확인한 이. 사람은 공개해도 되는 이름(별명), AI 는 "ai:" 로 시작하는 이름. 실명·학교·이메일은 적지 않는다. */
  by: Text,
  date: DateStr,
  /** confirmed 출처와 맞다 · disputed 출처와 다르거나 확인할 수 없다 */
  verdict: z.enum(['confirmed', 'disputed']),
  /** 확인한 문장과 출처의 지문. 지금 내용과 다르면 없는 기록으로 친다. */
  seal: Seal.optional(),
  note: Text.optional(),
});

export const Fact = so({
  id: FactId,
  /** 우리 말로 쓴 한 문장. 교과서 문장을 옮기지 않는다. 수업 방법에 관한 말은 사실이 아니므로 여기에 넣지 않는다. */
  claim: Text,
  /** 공개 출처. 초안에서는 비워 둘 수 있고, 공개하려면 하나 이상 있어야 한다 (lib/content.ts 의 공개 조건이 본다). */
  sources: z.array(Source).default([]),
  /** 죽음·폭력·강제 동원처럼 사람이 겪은 피해를 담은 사실. 퀴즈·카드·웹 활동 같은 놀이 자료가 가리킬 수 없다. */
  painful: z.boolean().default(false),
  checks: z.array(FactCheck).default([]),
});
export type Fact = z.infer<typeof Fact>;

// ───────────────────────────── 그림·사진 ─────────────────────────────

export const Media = so({
  id: Slug,
  kind: z.enum(['photo', 'drawing', 'diagram', 'map']),
  /** 묶음 폴더 기준 경로. svg·png·jpg, 1MB 이하 */
  file: z.string().regex(/^media\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:svg|png|jpg)$/, 'media/ 아래 파일 이름을 영문 소문자·숫자·하이픈으로 씁니다 (svg·png·jpg). 예: media/dolmen-parts.svg'),
  /** 그림을 못 보는 사람에게 읽어 줄 설명. 수업에서 아직 알려 주지 않는 이름은 적지 않는다. */
  alt: Text,
  /** 그림 아래에 찍는 한 줄 */
  caption: T(40).optional(),
  /** 원본의 권리 정보. 잘라 썼거나 본떠 그렸어도 원본의 것을 적는다. 화면에 찍는 출처 표시는 creditShort()·creditFull() 이 여기에서 만든다. */
  credit: so({
    /** 원본을 만든 이·소장처. 직접 만든 것은 "몽당분필 날쌤" */
    holder: Text,
    /** 원본의 제목·소장품 이름 (남의 자료는 꼭 적는다) */
    title: Text.optional(),
    /** 원본이 실린 주소 (남의 자료는 꼭 적는다) */
    source_url: Url.optional(),
    licence: Licence,
    /** CC 자료의 이용 조건 주소. 판(4.0, 2.0 KR …)이 여기에서 정해지므로 판까지 적는다. CC 가 아닌 자료에는 적지 않는다 (CC0·PD 는 publicdomain 주소만 받는다). */
    licence_url: z.url({ protocol: /^https$/, hostname: /^creativecommons\.org$/, error: 'https://creativecommons.org/licenses/… 주소를 씁니다' }).optional(),
    /** 원본 페이지에서 이용 조건을 확인한 날 (남의 자료는 꼭 적는다) */
    checked: DateStr.optional(),
    /** 허락 범위(permission), 저작권이 없다고 본 까닭(PD), 초상 확인(person), 직접 찍은 사진은 누가 언제 어디에서 찍었는지 */
    note: Text.optional(),
  }),
  /** 원본에 한 일. none 그대로 · cropped 일부를 잘랐다 · traced 본떠 새로 그렸다 */
  change: z.enum(['none', 'cropped', 'traced']).default('none'),
  /** 생성형 이미지·영상 도구로 만든 것인가 (코드로 그린 SVG 도해는 해당하지 않는다) */
  ai_generated: z.boolean().default(false),
  /** 실제 있었던 것(유물·유적·지도·인물·사건)을 보여 주는가. 지어낸 장면·인물만 false */
  factual: z.boolean().default(true),
  /** 알아볼 수 있는 실제 사람이 나오는가 */
  person: z.boolean().default(false),
  /** 직접 그린 사실 그림이 근거로 삼은 사실 */
  facts: FactRefs,
}).superRefine((m, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const lic = m.credit.licence;
  if (m.factual && m.ai_generated) issue(['ai_generated'], '사실을 전달하는 그림에는 생성형 AI 를 쓰지 않습니다. 실물 사진이나 직접 그린 도해로 바꾸거나, 지어낸 장면이면 factual: false 를 적습니다');
  if (lic === 'original') {
    if (m.change !== 'none') issue(['credit', 'licence'], '남의 자료를 자르거나 본떴으면 credit 에 원본의 소장처·이용 조건을 적습니다 (original 이 아닙니다)');
    if (m.factual && m.kind !== 'photo' && m.facts.length === 0) issue(['facts'], '직접 그린 사실 그림은 근거로 삼은 사실 id 를 적습니다. 예: facts: [f2]');
    if (m.kind !== 'photo' && !m.ai_generated && !m.file.endsWith('.svg')) issue(['file'], '직접 그린 그림은 SVG 파일로 둡니다');
    // original 은 "원본 사진"이 아니라 "우리가 만든 것"이다. 남의 사진을 original 로 적으면 우리 이용 조건으로 내놓게 된다.
    if (m.kind === 'photo' && !m.ai_generated && !m.credit.note) issue(['credit', 'note'], '직접 찍은 사진은 누가 언제 어디에서 찍었는지 credit.note 에 적습니다. 남이 찍은 사진이면 licence 를 원본의 이용 조건으로 고칩니다');
  } else {
    for (const k of ['title', 'source_url', 'checked'] as const) if (!m.credit[k]) issue(['credit', k], `남의 자료는 credit.${k} 을 적습니다`);
  }
  if ((lic === 'PD' || m.person) && !m.credit.note) issue(['credit', 'note'], '저작권이 없다고 본 까닭(PD), 초상 확인(person)을 credit.note 에 적습니다');
  // CC BY-SA 는 고친 것도 CC BY-SA 로만 내놓을 수 있다. 이 사이트의 조건(CC BY-NC-SA)과 섞이지 않게 원본 그대로만 쓴다.
  if (lic === 'CC-BY-SA' && m.change !== 'none') issue(['change'], 'CC BY-SA 그림은 자르거나 본뜨지 않고 그대로 씁니다 (change: none). 고치지 않고 쓰거나 다른 그림을 찾습니다');
  if (m.change === 'traced' && m.kind === 'photo') issue(['kind'], '본떠 그린 것은 kind 를 drawing 으로 적습니다');
  // 이용 조건 주소. 출처 표시의 판("CC BY-SA 3.0")이 이 주소에서 나오므로 licence 와 어긋나면 틀린 조건이 찍힌다.
  const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return undefined; } };
  const at = m.credit.licence_url ? pathOf(m.credit.licence_url) : undefined;
  if (m.credit.licence_url && at === undefined) {
    // 주소 꼴이 아닌 값("CC BY-SA 3.0")은 칸의 검사가 이미 알렸다. 여기에서 new URL 이 던지면 한국어 문구 대신 TypeError 가 나간다.
  } else if (lic.startsWith('CC-BY')) {
    const want = lic.slice(3).toLowerCase();
    if (!at) issue(['credit', 'licence_url'], `CC 자료는 이용 조건 주소를 적습니다. 예: https://creativecommons.org/licenses/${want}/4.0/`);
    else if (!at.startsWith(`/licenses/${want}/`)) issue(['credit', 'licence_url'], `licence(${lic})와 licence_url 이 서로 다릅니다`);
    else if (!/^\/licenses\/[a-z-]+\/\d+\.\d+(?:\/|$)/.test(at)) issue(['credit', 'licence_url'], `이용 조건 주소에 판(4.0, 3.0, 2.0/kr …)까지 적습니다. 예: https://creativecommons.org/licenses/${want}/4.0/`);
  } else if (at) {
    // 다른 이용 조건에 CC 의 licenses 주소가 붙으면 출처 표시가 "공공누리 제1유형 4.0"처럼 어긋나게 나온다
    const only = lic === 'CC0' ? '/publicdomain/zero/' : lic === 'PD' ? '/publicdomain/mark/' : undefined;
    if (!only) issue(['credit', 'licence_url'], `licence_url 은 CC 자료에만 적습니다. 이 칸을 지우거나 licence(${lic})를 고칩니다`);
    else if (!at.startsWith(only)) issue(['credit', 'licence_url'], `licence(${lic})에는 https://creativecommons.org${only}1.0/ 주소만 적을 수 있습니다. 주소를 고치거나 지우고, 조건이 다르면 licence 를 고칩니다`);
  }
});
export type Media = z.infer<typeof Media>;

// ───────────────────────────── 읽기 자료 ─────────────────────────────
// 옛 기록을 쉬운 말로 푼 글. 수업 화면(passage 장)과 학습지(passage 블록)가 같은 글을 가리킨다.

export const Passage = so({
  id: Slug,
  title: T(30),
  /** 문단. 우리 말로 쉽게 푼 글. 교과서 문장을 옮기지 않는다. 수업 화면의 passage 장이 가리키는 글은 문단 4개, 모두 300자까지다 (PASSAGE_SLIDE). */
  text: z.array(T(120)).min(1).max(6),
  /** 글 아래에 그대로 찍는 한 줄. 예: "『삼국유사』에 전하는 이야기를 쉬운 말로 풀어 썼습니다." 교과서나 교과서 회사 자료를 줄였다고 적는 자리가 아니다 (검사가 막는다). */
  source: Text,
  facts: FactRefs,
});
export type Passage = z.infer<typeof Passage>;

// ───────────────────────────── 수업 흐름 ─────────────────────────────

/** 흐름에서 쓴다고 적을 수 있는 자료 */
export const AssetKind = z.enum(['slides', 'worksheet', 'quiz', 'papercraft', 'coloring', 'making_kit', 'escape', 'virtual3d', 'web_activity', 'cards']);
export type AssetKind = z.infer<typeof AssetKind>;

export const FlowStep = so({
  /** 몇 차시의 단계인가. 두 차시 묶음에서는 단계마다 적는다 (차시마다 시간표를 따로 그린다). 한 차시 묶음에서는 적지 않는다. */
  lesson: z.number().int().min(1).optional(),
  /** 차시 안에서 도입 → 전개 → 정리 순서 */
  phase: z.enum(['도입', '전개', '정리']),
  minutes: z.number().int().min(1).max(PERIOD_MINUTES),
  /** 이 단계에서 하는 일 한 줄 */
  title: T(40),
  /** 교사가 하는 일을 순서대로. 문장마다 한 가지 동작. */
  do: z.array(Text).min(1).max(6),
  /** 발문과, 아이들 말에서 귀 기울일 것. 예시 답을 '정답'처럼 적지 않는다. */
  ask: z.array(so({ q: Text, listen_for: Text.optional() })).default([]),
  /** 이 단계에서 쓰는 자료 */
  uses: z.array(AssetKind).default([]),
  /** 쓰는 수업 화면 [첫 장, 끝 장]. 단계들의 범위는 1번부터 빈틈없이 이어져야 한다. */
  slides: z.tuple([z.number().int().min(1), z.number().int().min(1)], { error: '[첫 장, 끝 장]처럼 숫자 두 개를 씁니다. 예: [4, 6] (한 장이면 [5, 5])' }).optional(),
  tip: Text.optional(),
  facts: FactRefs,
});
export type FlowStep = z.infer<typeof FlowStep>;

// ───────────────────────────── 수업 화면 ─────────────────────────────
// 화면 띄우기(웹)와 PPTX 가 같은 자료에서 나온다. 한 장에 한 가지만 담는다.
// 글자 수 제한은 PPTX 가 넘침을 스스로 잡지 못해서 둔다.

const slideBase = {
  /** 교사용 진행 메모. 화면에는 보이지 않는다. 비우면 이 장을 쓰는 흐름 단계의 title·do·ask 가 메모로 들어간다. */
  notes: Text.optional(),
  facts: FactRefs,
};

export const Slide = z.discriminatedUnion('layout', [
  /** 표지. 첫 장은 늘 표지다 (AI 사용 표시·초안 표시가 여기에 찍힌다). 두 차시 묶음은 둘째 차시 앞에 표지를 한 장 더 둘 수 있다. */
  so({ layout: z.literal('title'), title: T(30), subtitle: T(40).optional(), ...slideBase }),
  /** 큰 질문 하나 */
  so({ layout: z.literal('question'), kicker: T(12).optional(), title: T(40), hint: T(40).optional(), media: MediaRef.optional(), ...slideBase }),
  /** 그림 한 장을 크게 */
  so({ layout: z.literal('picture'), title: T(30), media: MediaRef, caption: T(40).optional(), ...slideBase }),
  /** 짧은 항목 2~4개 */
  so({ layout: z.literal('points'), title: T(30), points: z.array(T(40)).min(2).max(4), media: MediaRef.optional(), ...slideBase }),
  /**
   * 둘을 나란히 견주기. 그림은 둘 가운데 한 가지로 싣는다:
   * 두 쪽이 저마다 그림을 하나씩(left.media, right.media), 또는 두 쪽이 함께 보는 그림 한 장(media).
   * 함께 보는 그림이 있으면 제목 아래가 두 단이 된다 (왼쪽에 두 이름표 상자를 쌓고, 오른쪽에 그림).
   */
  so({
    layout: z.literal('compare'), title: T(30),
    left: so({ label: T(12), points: z.array(T(30)).min(1).max(4), media: MediaRef.optional() }),
    right: so({ label: T(12), points: z.array(T(30)).min(1).max(4), media: MediaRef.optional() }),
    media: MediaRef.optional(),
    ...slideBase,
  }),
  /** 차례가 있는 단계 2~5개 */
  so({ layout: z.literal('steps'), title: T(30), steps: z.array(so({ label: T(6), text: T(40), media: MediaRef.optional() })).min(2).max(5), ...slideBase }),
  /** 새 낱말 하나. 풀이는 terms.new 에서 가져온다 (여기에 다시 적지 않는다). */
  so({ layout: z.literal('term'), term: T(14), example: T(60).optional(), ...slideBase }),
  /** 읽기 자료 한 편. 한 장에 들어가는 글은 PASSAGE_SLIDE 까지다 (문단 4개, 모두 300자). 더 긴 글은 학습지에만 싣거나 둘로 나눈다. */
  so({ layout: z.literal('passage'), passage: Slug, ...slideBase }),
  /** 활동 안내 */
  so({ layout: z.literal('activity'), title: T(30), instructions: z.array(T(40)).min(1).max(5), minutes: z.number().int().min(1).max(PERIOD_MINUTES).optional(), materials: z.array(T(12)).max(6).default([]), ...slideBase }),
  /** 퀴즈 문항 하나 (quiz.items 의 순서 번호, 1부터) */
  so({ layout: z.literal('quiz'), item: z.number().int().min(1), ...slideBase }),
  /** 마무리 */
  so({ layout: z.literal('closing'), title: T(30), points: z.array(T(40)).max(3).default([]), ...slideBase }),
]);
export type Slide = z.infer<typeof Slide>;

// ───────────────────────────── 학습지 ─────────────────────────────

/** 문장 틀의 빈칸: 밑줄 세 개 이상(___). 전각 밑줄(＿＿)도 받는다. 찍을 때는 splitFrame() 으로 나눈다. */
export const BLANK = /_{3,}|＿{2,}/g;

/** 표의 칸. 빈 글("")은 아이가 채우는 칸이다. */
const Cell = z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim());

const leafBlocks = [
  /** 지시문·질문. number 가 true 면 번호가 붙는다. */
  so({ type: z.literal('prompt'), text: Text, number: z.boolean().default(true) }),
  /** 아이가 읽는 짧은 글: 낱말 풀이, 그림 아래 한 줄, 도움말. 사실을 담으면 facts 로 가리킨다. */
  so({ type: z.literal('note'), title: Text.optional(), text: z.array(Text).min(1).max(6), source: Text.optional(), facts: FactRefs }),
  /** 읽기 자료 한 편 (passages 의 id) */
  so({ type: z.literal('passage'), passage: Slug }),
  /** 줄 쓰기 칸 */
  so({ type: z.literal('lines'), label: Text.optional(), count: z.number().int().min(1).max(12) }),
  /** 빈 칸 (그림 그리기·자유롭게 쓰기) */
  so({ type: z.literal('box'), label: Text.optional(), height_mm: z.number().int().min(15).max(200) }),
  /** 그림·사진 */
  so({ type: z.literal('figure'), media: MediaRef, width: z.enum(['full', 'half', 'third']).default('full'), show_caption: z.boolean().default(true) }),
  /** 본 것 → 짐작한 것 → 까닭 세 칸 */
  so({
    type: z.literal('observe_infer'),
    target: Text,
    media: MediaRef.optional(),
    /** 칸마다 줄 수 */
    lines: z.number().int().min(2).max(6).default(3),
    observe_label: Text.default('눈으로 본 것'),
    infer_label: Text.default('짐작한 것'),
    reason_label: Text.default('그렇게 짐작한 까닭'),
  }),
  /** 표. 빈 글("")은 아이가 채우는 칸 */
  so({ type: z.literal('table'), columns: z.array(Text).min(2).max(5), rows: z.array(z.array(Cell)).min(1).max(8) })
    .refine((t) => t.rows.every((r) => r.length === t.columns.length), { message: '줄마다 칸 수가 columns 와 같아야 합니다. 비워 둘 칸은 "" 로 적습니다' }),
  /** 선 잇기. 맞는 짝끼리 적는다. 찍을 때 오른쪽만 섞는다. */
  so({ type: z.literal('match'), pairs: z.array(so({ left: T(20), right: T(30) })).min(2).max(6) }),
  /** 확인 퀴즈의 문항을 그대로 찍는다 (quiz.items 의 순서 번호, 1부터). 문항을 학습지에 다시 적지 않는다. */
  so({ type: z.literal('quiz'), items: z.array(z.number().int().min(1)).min(1).max(10) }),
  /** 문장 틀. 빈칸은 밑줄 세 개(___)로 적는다. */
  so({ type: z.literal('sentence_frame'), frame: Text.refine((s) => s.search(BLANK) >= 0, '빈칸을 밑줄 세 개(___)로 적습니다. 예: 나는 ___라고 짐작했다.') }),
  /**
   * 풀어 놓은 보기 하나. 아이가 할 일을 먼저 보여 주는 자리다 (지시가 아니므로 번호가 붙지 않는다).
   * 인쇄는 "예"라는 작은 표시가 붙은 조용한 상자이고, 굵은 작은 제목으로 찍지 않는다.
   * text(한 문장) 또는 parts(칸 2~4개) 가운데 하나만 적는다. parts 는 한 줄에 화살표로 이어 찍는다.
   * 예: parts: [{ label: 본 것, text: … }, { label: 아는 것, text: … }, { label: 짐작, text: … }]
   */
  so({
    type: z.literal('example'),
    text: Text.optional(),
    parts: z.array(so({ label: T(12), text: T(60) })).min(2, '칸은 2~4개 적습니다. 한 칸뿐이면 parts 대신 text 에 한 문장으로 적습니다').max(4, '칸은 4개까지 적습니다. 한 줄에 화살표로 이어 찍기 때문입니다').optional(),
  }).refine((b) => (b.text === undefined) !== (b.parts === undefined), {
    message: 'text 와 parts 가운데 하나만 적습니다. 한 문장이면 text, 본 것 → 아는 것 → 짐작처럼 이어지는 칸이면 parts 를 씁니다',
  }),
  /** 연표. when 은 늘 찍히고, blank 인 칸의 what 은 비워 두어 아이가 채운다. */
  so({ type: z.literal('timeline'), points: z.array(so({ when: T(14), what: T(30), blank: z.boolean().default(false), facts: FactRefs })).min(2).max(8) }),
] as const;

const LeafBlock = z.discriminatedUnion('type', [...leafBlocks]);
/** 나란히 놓기 (2~4단). 단 안에 다시 단을 넣을 수 없다. */
const ColumnsBlock = so({ type: z.literal('columns'), columns: z.array(z.array(LeafBlock).min(1)).min(2).max(4) });
export const Block = z.discriminatedUnion('type', [...leafBlocks, ColumnsBlock]);
export type Block = z.infer<typeof Block>;
export type LeafBlock = z.infer<typeof LeafBlock>;

export const Worksheet = so({
  title: T(30),
  subtitle: T(40).optional(),
  print: PrintSpec,
  /** 한 쪽에 한 묶음. 쪽수는 이 목록의 길이다. */
  pages: z.array(so({ heading: T(30).optional(), blocks: z.array(Block).min(1) })).min(1).max(4),
  /** 교사용 풀이: 정해진 답이 없는 칸에 '이런 답이 나오면 좋다'. 연표의 빈칸·선 잇기의 짝·퀴즈 블록의 정답은 적지 않는다 (저절로 나온다). */
  guide: z.array(so({ where: Text, text: Text })).default([]),
  /** 학습지의 표·지시문·풀이에 실린 사실 */
  facts: FactRefs,
});
export type Worksheet = z.infer<typeof Worksheet>;

// ───────────────────────────── 확인 퀴즈 ─────────────────────────────

const quizBase = {
  q: T(80),
  /** 답을 고른 뒤 아이에게 보여 주는 풀이 */
  explain: Text,
  facts: FactRefs1,
  /** 두 차시 묶음에서 이 문항을 푸는 차시. 적지 않으면 마지막 차시 */
  lesson: z.number().int().min(1).optional(),
};
export const QuizItem = z.discriminatedUnion('type', [
  so({ type: z.literal('ox'), answer: z.boolean(), ...quizBase }),
  // answer 의 범위는 보기 수에 달려 있어 한 곳(아래)에서만 알린다. 칸에 .max(4) 를 걸면 보기가 셋일 때 "4 이하"라는 틀린 문구가 하나 더 나온다.
  so({ type: z.literal('choice'), choices: z.array(T(30)).min(3).max(4), answer: z.number().int(), ...quizBase })
    .superRefine((i, ctx) => {
      const n = i.choices.length;
      if (i.answer < 1 || i.answer > n) ctx.addIssue({ code: 'custom', path: ['answer'], message: `보기가 ${n}개이므로 1~${n} 가운데 하나를 적습니다 (지금: ${i.answer})` });
    }),
  so({ type: z.literal('short'), answer: T(14), accept: z.array(T(14)).default([]), ...quizBase }),
]);
export type QuizItem = z.infer<typeof QuizItem>;

// ───────────────────────────── 차시마다 따져 보는 자료 7종 ─────────────────────────────
// 차시마다 일곱 가지를 하나씩 따진다. 만들지 않으면 까닭을 적는다.
//  state: skip    — 만들지 않는다 (reason 필수)
//         planned — 만들기로 했고 아직 만들지 않았다 (idea 필수). 사이트에는 보이지 않는다.
//         ready   — 만들었다. 사이트에 올라간다.
// reason 과 idea 는 제작 기록이다. 사이트에 보여 주지 않는다.

const skip = so({ state: z.literal('skip'), reason: Text });
const planned = so({ state: z.literal('planned'), idea: Text });
const opt = <S extends z.ZodRawShape>(shape: S) =>
  z.discriminatedUnion('state', [skip, planned, so({ state: z.literal('ready'), ...shape })]);
/** 생성기가 아직 없는 종류. skip·planned 까지만 적는다. 생성기를 만들 때 ready 꼴·주소·주인을 함께 더한다 (docs/ROADMAP.md). */
const later = (name: string) =>
  z.discriminatedUnion('state', [skip, planned], { error: `${name}은 아직 state 를 skip 이나 planned 로만 적습니다 (생성기가 없습니다)` });

export const Card = so({
  /** 앞면: 이름·낱말 */
  front: T(14),
  /** 뒷면: 한 줄 설명. 비우면 terms.new 에서 front 와 같은 낱말의 풀이를 쓴다 (그래서 길이가 낱말 풀이와 같다). */
  back: T(50).optional(),
  media: MediaRef.optional(),
  facts: FactRefs1,
});
export type Card = z.infer<typeof Card>;

/** 웹 활동 4종. 활동마다 facts 는 그 활동의 정답이 기대는 사실이다. */
export const WebActivity = z.discriminatedUnion('kind', [
  /** 분류하기 */
  so({
    kind: z.literal('sort'),
    bins: z.array(so({ id: Slug, label: T(10) })).min(2).max(4),
    items: z.array(so({ text: T(20), media: MediaRef.optional(), bin: Slug, why: Text.optional() })).min(4).max(12),
    facts: FactRefs,
  }),
  /** 짝 맞추기 */
  so({ kind: z.literal('match'), pairs: z.array(so({ left: T(20), right: T(30) })).min(3).max(8), facts: FactRefs }),
  /** 차례 맞추기. items 는 맞는 차례대로 적는다. */
  so({ kind: z.literal('order'), items: z.array(T(30)).min(3).max(12), facts: FactRefs }),
  /** 지도·그림 위에 이름표 놓기. x·y 는 그림의 왼쪽 위에서 잰 백분율(0~100) */
  so({
    kind: z.literal('place'),
    media: MediaRef,
    spots: z.array(so({ label: T(14), x: z.number().min(0).max(100), y: z.number().min(0).max(100), why: Text.optional() })).min(2).max(8),
    facts: FactRefs,
  }),
]);
export type WebActivity = z.infer<typeof WebActivity>;

export const Assets = so({
  /** 페이퍼크래프트: 모양이 배움이 되는 입체물이 있을 때 */
  papercraft: opt({
    title: T(30),
    /** generators/papercraft/modules/<module>.ts 의 전개도 모듈 이름 */
    module: Slug,
    /** 전개도 쪽 + 만드는 법 한 쪽. 모듈이 내놓는 쪽수와 다르면 검사가 실패한다. */
    pages: z.number().int().min(2).max(12),
    print: PrintSpec,
    /** 만드는 순서 */
    steps: z.array(Text).min(2).max(8),
    /** 도안 위에 찍는 문장 (예: 차례 카드). 쓰임과 순서는 모듈이 정한다. 모듈 안에 문장을 적지 않는다. */
    texts: z.array(Text).max(8).default([]),
    /** 만든 뒤 해 보기 */
    try_it: z.array(Text).default([]),
    /** 만들고 나서 생각해 볼 질문 */
    reflect: z.array(Text).default([]),
    facts: FactRefs,
  }),
  /** 컬러링 도안: 이름을 댈 수 있는 실물이 있을 때. 직접 그렸거나 본떠 그린 선 그림 한 쪽 */
  coloring: opt({
    title: T(30),
    media: MediaRef,
    print: PrintSpec.optional(),
    /** 찾아볼 것. 컬러링 쪽의 그림 아래에 짧은 할 일 목록으로 찍힌다. 그림과 함께 한 쪽에 들어가야 하므로 두세 줄로 적는다. */
    look_for: z.array(Text).default([]),
    facts: FactRefs,
  }),
  /** 만들기 세트: 해 보는 것이 보는 것보다 나을 때. 안내 페이지 안에 나온다. */
  making_kit: opt({
    title: T(30),
    /** in_class 40분 수업 안 · extended 수업 밖(창체·다른 교과 연계) */
    when: z.enum(['in_class', 'extended']),
    /** 걸리는 시간(분). 수업 안에서 하는 만들기에만 적는다. */
    minutes: z.number().int().min(5).max(PERIOD_MINUTES).optional(),
    materials: z.array(Text).min(1),
    steps: z.array(Text).min(2).max(8),
    safety: Text.optional(),
    facts: FactRefs,
  }),
  /** 방탈출 */
  escape: later('방탈출'),
  /** 3D·가상 체험 */
  virtual3d: later('3D·가상 체험'),
  /** 웹 활동: 설치 없이 여는 짧은 활동 */
  web_activity: opt({ title: T(30), instructions: T(60), activity: WebActivity }),
  /** 카드 */
  cards: opt({
    title: T(30),
    /** 이 묶음에서 새로 보태는 카드 */
    cards: z.array(Card).max(24).default([]),
    /** 단원 덱 (단원 정리 묶음에서만): 같은 단원 앞 묶음들의 카드를 모은다. label 은 카드 모서리에 글자로 찍힌다. */
    collect: z.array(so({ label: T(10), bundles: z.array(BundleId).min(1) })).default([]),
    /** 놀이 방법. 차시 안내 페이지의 카드 줄 아래에 보인다 (단원 덱의 놀이 방법은 단원 정리 묶음의 안내 페이지에). 카드 쪽에는 찍지 않는다. */
    games: z.array(so({ name: T(20), how: Text })).default([]),
    /** 적지 않으면 모둠마다 1부. 카드는 늘 A4 세로 양면이다. */
    print: PrintSpec.optional(),
  }),
});
export type Assets = z.infer<typeof Assets>;
export type OptionalAssetKind = keyof Assets;
/** 차시마다 따져 보는 자료 7종 (Assets 의 칸 이름 그대로) */
export const OPTIONAL_ASSET_KINDS = Object.keys(Assets.shape) as OptionalAssetKind[];
/** 아픈 역사가 중심인 차시(no_play)에 만들지 않는 자료 */
export const NO_PLAY_BANNED: readonly OptionalAssetKind[] = ['papercraft', 'coloring', 'making_kit', 'escape', 'virtual3d'];

// ───────────────────────────── 검수와 공개 ─────────────────────────────

/** draft 초안 · published 공개. 공개 조건(검수 기록과 지문)은 lib/content.ts 가 본다. published 는 날쌤만 적는다. */
export const Status = z.enum(['draft', 'published']);
export type Status = z.infer<typeof Status>;

/**
 * 검수 종류. 공개하려면 다섯 가지 모두 마지막 기록이 지금 내용의 pass 여야 한다.
 *  fact        — 아이·교사가 읽는 문장을, 가리킨 사실의 문장과 나란히 놓고 대조했다. 사실을 가리키지 않는 글에 사실을 말하는 문장이 숨어 있지 않은지도 보았다
 *                (`npm run factsheet` 의 표를 끝의 '가리킨 사실 없음'까지 읽었다)
 *  originality — 교과서와 문장·활동 짜임·직접 그린 그림이 겹치지 않고, 남의 그림은 원본 페이지에서 이용 조건을 확인했다
 *  voice       — 말투를 다듬었고 이름·연도·숫자·정답은 바뀌지 않았다
 *  print       — 화면과 인쇄물을 넘침·흑백·낱말까지 보았다
 *  owner       — 날쌤이 읽고 승인했다 (날쌤만 적는다)
 */
export const REVIEW_KINDS = ['fact', 'originality', 'voice', 'print', 'owner'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** 검수 기록. `npm run sign` 이 적는다. 적힌 차례가 시간 차례다. */
export const Review = so({
  kind: z.enum(REVIEW_KINDS),
  /** 검수한 이. 사람은 공개해도 되는 이름(별명), AI 는 "ai:" 로 시작하는 이름. 실명·학교·이메일은 적지 않는다. */
  by: Text,
  date: DateStr,
  result: z.enum(['pass', 'fix']),
  /** 검수한 명세의 지문. 지금 내용과 다르면 없는 기록으로 친다. */
  seal: Seal.optional(),
  /** 고칠 곳 등. 교과서 문장을 옮겨 적지 않는다 ("교과서 8쪽, 14자"처럼 쪽수와 길이로만). */
  note: Text.optional(),
});
export type Review = z.infer<typeof Review>;

// ───────────────────────────── 차시 명세 ─────────────────────────────

const LessonShape = so({
  schema_version: SchemaVersion,
  /** "5-2/1/01" — 파일이 놓인 폴더와 같아야 한다. 폴더를 복사해 새 차시를 만들 때 고치는 것을 잊지 않게 여기에도 적는다. */
  id: LessonId,
  /** 우리가 붙인 차시 이름 */
  title: T(30),
  /** 교사에게 건네는 한두 문장 소개 */
  tagline: T(120),
  status: Status,
  reviews: z.array(Review).default([]),
  /** 공개한 뒤에 고친 것. 안내 페이지에 날짜와 함께 보인다. */
  corrections: z.array(so({ date: DateStr, text: Text })).default([]),

  /** 이 시간에 닿을 곳 1~3개 */
  objectives: z.array(Text).min(1).max(3),
  /** 인쇄물과 그 준비물 말고 더 챙길 것. 인쇄물·가위·풀은 print 에서 모아 보여 주므로 여기에 적지 않는다. */
  prepare: z.array(so({ item: Text, qty: Text.optional() })).default([]),

  /**
   * 다루는 내용의 무게.
   *  none    — 제한 없음. 이때만 퀴즈·웹 활동이 점수를 보여 준다.
   *  care    — 전쟁·차별 등을 다룬다. 점수·순위·시간 재기·축하 효과를 쓰지 않는다.
   *  no_play — 피해와 고통이 중심인 차시. care 에 더해 페이퍼크래프트·컬러링·만들기·방탈출·3D 를 만들지 않고, 카드는 낱말만 담는다.
   */
  sensitivity: so({ level: z.enum(['none', 'care', 'no_play']), note: Text.optional() }).default({ level: 'none' }),

  terms: so({
    /** 이 차시에서 처음 가르치는 낱말과 아이 눈높이 풀이. 낱말 장(term)과 뒷면 없는 카드가 이 풀이를 쓴다. */
    new: z.array(so({ term: T(14), meaning: T(50), facts: FactRefs1 })).default([]),
  }).default({ new: [] }),

  /**
   * 이 차시의 사실. 단원 정리(review) 묶음만 비워 둘 수 있다 (앞 묶음의 사실을 "05/f3" 처럼 가리킨다).
   * 피해를 담은 사실(painful)이 있거나 앞 묶음의 그런 사실을 가리키면 sensitivity.level 은 care 나 no_play 여야 한다.
   */
  facts: z.array(Fact).default([]),
  media: z.array(Media).default([]),
  passages: z.array(Passage).default([]),

  flow: z.array(FlowStep).min(3),
  /** 한 차시에 24장까지 (SLIDES_PER_LESSON. 두 차시 묶음은 48장). 차시 수는 id 에서 나오므로 아래 검사에서 본다. */
  slides: z.array(Slide).min(3),
  worksheet: Worksheet,
  quiz: so({ items: z.array(QuizItem).min(3).max(10) }),
  assets: Assets,

  /** 예상되는 오개념과 받아 주는 말 */
  misconceptions: z.array(so({ belief: Text, response: Text })).default([]),
  /** 평가: 무엇을, 어디에서 볼 것인가 */
  assessment: so({ look_for: Text, where: Text }).optional(),
  /** 접어 두는 교사용 메모 */
  teacher_notes: z.array(so({ title: Text, body: z.array(Text).min(1) })).default([]),
});
type LessonData = z.infer<typeof LessonShape>;

// ───────────── 가리키는 곳 모으기 (이 파일의 검사와 lib/content.ts 의 묶음 사이 검사가 같이 쓴다) ─────────────

type Path = (string | number)[];
/** slide 는 곁그림(question·points 장), picture 는 보고 읽어 내는 그림(picture·compare·steps 장) */
export type MediaUse = 'slide' | 'picture' | 'figure' | 'observe_infer' | `asset:${OptionalAssetKind}`;
export type FactUse = 'terms' | 'media' | 'passages' | 'flow' | 'slides' | 'worksheet' | 'quiz' | `asset:${OptionalAssetKind}`;
export interface RefAt<U> { path: Path; ref: string; use: U }

/** 단을 풀어 낸 학습지 블록 전부 */
export function leafBlocksOf(w: Worksheet): { path: Path; block: LeafBlock }[] {
  const out: { path: Path; block: LeafBlock }[] = [];
  w.pages.forEach((pg, pi) => pg.blocks.forEach((b, bi) => {
    const at: Path = ['worksheet', 'pages', pi, 'blocks', bi];
    if (b.type === 'columns') b.columns.forEach((col, ci) => col.forEach((lb, li) => out.push({ path: [...at, 'columns', ci, li], block: lb })));
    else out.push({ path: at, block: b });
  }));
  return out;
}

/** 그림을 가리키는 곳 전부와, 어떤 자리에서 쓰는지 */
export function mediaUses(l: LessonData): RefAt<MediaUse>[] {
  const out: RefAt<MediaUse>[] = [];
  const add = (path: Path, ref: string | undefined, use: MediaUse) => { if (ref) out.push({ path, ref, use }); };
  l.slides.forEach((s, i) => {
    const at: Path = ['slides', i];
    if (s.layout === 'picture') add([...at, 'media'], s.media, 'picture');
    else if (s.layout === 'question' || s.layout === 'points') add([...at, 'media'], s.media, 'slide');
    // 견주기와 단계의 그림은 아이가 보고 견주거나 차례를 읽어 내는 자료다. 곁그림이 아니므로 그림 한 장과 같이 다룬다.
    else if (s.layout === 'compare') {
      add([...at, 'media'], s.media, 'picture');
      add([...at, 'left', 'media'], s.left.media, 'picture');
      add([...at, 'right', 'media'], s.right.media, 'picture');
    }
    else if (s.layout === 'steps') s.steps.forEach((st, si) => add([...at, 'steps', si, 'media'], st.media, 'picture'));
  });
  for (const { path, block } of leafBlocksOf(l.worksheet)) {
    if (block.type === 'figure') add([...path, 'media'], block.media, 'figure');
    else if (block.type === 'observe_infer') add([...path, 'media'], block.media, 'observe_infer');
  }
  const a = l.assets;
  if (a.coloring.state === 'ready') add(['assets', 'coloring', 'media'], a.coloring.media, 'asset:coloring');
  if (a.cards.state === 'ready') a.cards.cards.forEach((c, i) => add(['assets', 'cards', 'cards', i, 'media'], c.media, 'asset:cards'));
  if (a.web_activity.state === 'ready') {
    const act = a.web_activity.activity;
    const at: Path = ['assets', 'web_activity', 'activity'];
    if (act.kind === 'sort') act.items.forEach((it, i) => add([...at, 'items', i, 'media'], it.media, 'asset:web_activity'));
    if (act.kind === 'place') add([...at, 'media'], act.media, 'asset:web_activity');
  }
  return out;
}

/** 이 그림을 이 자리에 쓸 수 없는 까닭. 쓸 수 있으면 undefined */
export function mediaUseProblem(m: Media, use: MediaUse): string | undefined {
  if (!m.factual && use !== 'slide') return `지어낸 그림(${m.id})은 수업 화면의 곁그림으로만 씁니다 (question·points 장). 그림 한 장(picture)·견주기(compare)·단계(steps)·학습지·카드·컬러링·웹 활동에는 실물 사진이나 사실을 그린 도해를 씁니다`;
  if (m.person && use.startsWith('asset:')) return `실제 사람이 나오는 그림(${m.id})은 카드·컬러링·웹 활동에 쓰지 않습니다`;
  if (use === 'asset:coloring' && m.credit.licence !== 'original' && m.change !== 'traced') return `컬러링 도안은 직접 그렸거나(original) 본떠 그린(change: traced) 선 그림이어야 합니다 (${m.id})`;
  return undefined;
}

/** 사실을 가리키는 곳 전부와, 어떤 자리에서 가리키는지 */
export function factUses(l: LessonData): RefAt<FactUse>[] {
  const out: RefAt<FactUse>[] = [];
  const walk = (node: unknown, path: Path, use: FactUse) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, [...path, i], use)); return; }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'facts' && Array.isArray(v)) v.forEach((ref, i) => { if (typeof ref === 'string') out.push({ path: [...path, k, i], ref, use }); });
      else walk(v, [...path, k], use);
    }
  };
  walk(l.terms, ['terms'], 'terms');
  walk(l.media, ['media'], 'media');
  walk(l.passages, ['passages'], 'passages');
  walk(l.flow, ['flow'], 'flow');
  walk(l.slides, ['slides'], 'slides');
  walk(l.worksheet, ['worksheet'], 'worksheet');
  walk(l.quiz, ['quiz'], 'quiz');
  for (const k of OPTIONAL_ASSET_KINDS) walk(l.assets[k], ['assets', k], `asset:${k}`);
  return out;
}

/** 피해를 담은 사실을 이 자리에서 가리킬 수 없는 까닭. 가리킬 수 있으면 undefined */
export function painfulUseProblem(ref: string, use: FactUse): string | undefined {
  if (use === 'quiz' || use.startsWith('asset:')) return `피해를 담은 사실(${ref})은 퀴즈·카드·놀이 자료가 가리킬 수 없습니다. 학습지의 읽기와 생각 쓰기에서 다룹니다`;
  return undefined;
}

/**
 * 피해를 담은 사실을 그린 그림을 놀이 자료(카드·컬러링·웹 활동)에 쓸 수 없는 까닭.
 * 카드나 활동이 다른 사실을 가리키고 있어도 그림은 그대로 찍힌다. 그림의 facts 가 그런 사실을 가리키는지로 본다.
 */
export const drawsPainProblem = (ref: string) => `피해를 담은 사실을 그린 그림(${ref})은 카드·컬러링·웹 활동에 쓰지 않습니다. 수업 화면과 학습지에서만 씁니다`;

const isLocal = (ref: string) => !ref.includes('/');

// ───────────── 명세 하나 안에서 맞아야 하는 것 ─────────────

export const Lesson = LessonShape.superRefine((l, ctx) => {
  const issue = (path: Path, message: string) => ctx.addIssue({ code: 'custom', path, message });
  const lessons = lessonsOf(l.id);
  if (lessons.length === 0) return; // id 가 틀렸으면 위에서 이미 알렸다

  // 차시마다 도입 → 전개 → 정리, 차시마다 40분
  const order = ['도입', '전개', '정리'];
  const multi = lessons.length > 1;
  const lessonOf = (s: { lesson?: number }) => s.lesson ?? lessons[0];
  l.flow.forEach((s, i) => {
    if (multi && s.lesson === undefined) issue(['flow', i, 'lesson'], `두 차시 묶음에서는 단계마다 몇 차시인지 적습니다. 예: lesson: ${lessons[0]} (이 묶음은 ${lessons.join(', ')}차시)`);
    if (s.lesson !== undefined && !lessons.includes(s.lesson)) issue(['flow', i, 'lesson'], `이 묶음에 없는 차시입니다: ${s.lesson} (이 묶음은 ${lessons.join(', ')}차시)`);
    if (i === 0) return;
    const prev = l.flow[i - 1];
    if (lessonOf(s) < lessonOf(prev)) issue(['flow', i, 'lesson'], '단계를 차시 순서대로 적습니다');
    else if (lessonOf(s) === lessonOf(prev) && order.indexOf(s.phase) < order.indexOf(prev.phase)) issue(['flow', i, 'phase'], '차시 안에서 도입 → 전개 → 정리 순서로 적습니다');
  });
  for (const n of lessons) {
    const sum = l.flow.filter((s) => lessonOf(s) === n).reduce((a, s) => a + s.minutes, 0);
    if (sum !== PERIOD_MINUTES) issue(['flow'], `${n}차시 흐름의 시간 합이 ${sum}분입니다. ${PERIOD_MINUTES}분이 되게 minutes 를 고칩니다`);
  }
  l.quiz.items.forEach((q, i) => {
    if (q.lesson !== undefined && !lessons.includes(q.lesson)) issue(['quiz', 'items', i, 'lesson'], `이 묶음에 없는 차시입니다: ${q.lesson} (이 묶음은 ${lessons.join(', ')}차시)`);
  });

  // 수업 화면의 장수는 차시 수에 맞춘다. 두 차시 묶음이 한 차시 묶음과 같은 24장에 묶이지 않게 한다.
  const maxSlides = SLIDES_PER_LESSON * lessons.length;
  if (l.slides.length > maxSlides) issue(['slides'], `수업 화면은 한 차시에 ${SLIDES_PER_LESSON}장까지입니다 (이 묶음은 ${lessons.length}차시라 ${maxSlides}장까지, 지금 ${l.slides.length}장). 장을 줄이거나 합칩니다`);

  // id 가 겹치지 않는가
  const dups = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  for (const d of dups(l.facts.map((f) => f.id))) issue(['facts'], `사실 id 가 겹칩니다: ${d}`);
  for (const d of dups(l.media.map((m) => m.id))) issue(['media'], `그림 id 가 겹칩니다: ${d}`);
  for (const d of dups(l.passages.map((p) => p.id))) issue(['passages'], `읽기 자료 id 가 겹칩니다: ${d}`);
  for (const d of dups(l.terms.new.map((t) => t.term))) issue(['terms', 'new'], `낱말이 겹칩니다: ${d}`);

  // 가리키는 사실·그림·읽기 자료가 있는가. "05/f3" 처럼 다른 묶음을 가리키는 것은 lib/content.ts 가 확인한다.
  const facts = new Map(l.facts.map((f) => [f.id, f]));
  const media = new Map(l.media.map((m) => [m.id, m]));
  const passages = new Set(l.passages.map((p) => p.id));
  const fUses = factUses(l);
  const mUses = mediaUses(l);
  for (const u of fUses) if (isLocal(u.ref) && !facts.has(u.ref)) issue(u.path, `없는 사실 id 입니다: ${u.ref}. facts 에 적은 id 를 씁니다`);
  for (const u of mUses) if (isLocal(u.ref) && !media.has(u.ref)) issue(u.path, `없는 그림 id 입니다: ${u.ref}. media 에 적은 id 를 씁니다`);
  l.slides.forEach((s, i) => { if (s.layout === 'passage' && !passages.has(s.passage)) issue(['slides', i, 'passage'], `없는 읽기 자료 id 입니다: ${s.passage}. passages 에 적은 id 를 씁니다`); });
  for (const { path, block } of leafBlocksOf(l.worksheet)) {
    if (block.type === 'passage' && !passages.has(block.passage)) issue([...path, 'passage'], `없는 읽기 자료 id 입니다: ${block.passage}. passages 에 적은 id 를 씁니다`);
  }

  // 수업 화면 한 장(1920 × 1080, 본문 44px 이상)에 들어가는 읽기 자료의 길이. PPTX 는 넘침을 스스로 잡지 못한다.
  // 학습지에만 싣는 읽기 자료는 문단 6개 × 120자까지 그대로다.
  l.slides.forEach((s, i) => {
    if (s.layout !== 'passage') return;
    const p = l.passages.find((x) => x.id === s.passage);
    const total = p ? p.text.reduce((n, t) => n + t.length, 0) : 0;
    if (p && (p.text.length > PASSAGE_SLIDE.paragraphs || total > PASSAGE_SLIDE.chars)) issue(['slides', i, 'passage'], `수업 화면 한 장에는 문단 ${PASSAGE_SLIDE.paragraphs}개, 모두 ${PASSAGE_SLIDE.chars}자까지 들어갑니다 (지금 ${p.text.length}개, ${total}자). 글을 줄이거나 읽기 자료를 둘로 나누어 두 장에 싣습니다`);
  });

  // 수업 화면의 AI 사용 표시·초안 표시(footerNotice)는 1번 장에 찍힌다 (docs/CONTRACT.md 6절). 그 자리가 늘 있도록 첫 장은 표지로 묶어 둔다.
  if (l.slides[0] && l.slides[0].layout !== 'title') issue(['slides', 0, 'layout'], '첫 장은 표지(layout: title)로 씁니다. 수업 화면의 AI 사용 표시와 초안 표시가 표지에 찍힙니다');

  // 낱말 풀이는 terms.new 한 곳에만 적는다
  const terms = new Map(l.terms.new.map((t) => [t.term, t]));
  // 견주기 장의 그림은 함께 보는 한 장이거나 쪽마다 한 장이다. 둘을 섞으면 그림 셋이 한 장에 들어가 어느 그림이 어느 쪽인지 흐려진다.
  l.slides.forEach((s, i) => {
    if (s.layout !== 'compare' || !s.media) return;
    for (const side of ['left', 'right'] as const) {
      if (s[side].media) issue(['slides', i, side, 'media'], `견주기 장에 함께 보는 그림(media)이 있으면 ${side}.media 는 적지 않습니다. 두 쪽이 한 그림을 함께 보면 media 만 남기고, 쪽마다 그림이 따로 있으면 media 를 지웁니다`);
      // 함께 보는 그림이 있으면 두 상자가 왼쪽 단(장 폭의 58% 이하)에 위아래로 쌓인다. 항목이 셋 넘게 들면 36px 로도 장 밖으로 넘친다.
      if (s[side].points.length > 2) issue(['slides', i, side, 'points'], `견주기 장에 함께 보는 그림(media)이 있으면 ${side}.points 는 2개까지입니다 (지금 ${s[side].points.length}개). 두 상자가 그림 옆 한 단에 쌓이므로 더 들어가지 않습니다`);
    }
  });
  l.slides.forEach((s, i) => { if (s.layout === 'term' && !terms.has(s.term)) issue(['slides', i, 'term'], `terms.new 에 "${s.term}" 이 없습니다. 풀이를 terms.new 에 적습니다`); });

  // 퀴즈 문항을 가리키는 번호
  const nQuiz = l.quiz.items.length;
  l.slides.forEach((s, i) => { if (s.layout === 'quiz' && s.item > nQuiz) issue(['slides', i, 'item'], `퀴즈 문항 ${s.item}번이 없습니다 (문항은 ${nQuiz}개)`); });
  // 두 차시 묶음: 문항의 차시(lesson, 적지 않으면 마지막 차시)는 그 문항을 띄우는 장이 놓인 차시와 같아야 한다.
  // 다르면 안내 페이지(quizByLesson)와 수업 화면이 같은 문항을 서로 다른 차시의 것으로 보여 준다.
  if (multi) {
    // 문항마다 그것을 띄우는 장과 그 장이 놓인 차시
    const shown = new Map<number, { lesson: number; slide: number }[]>();
    l.slides.forEach((s, i) => {
      // 0 이나 음수, 없는 번호는 위에서(칸의 검사와 번호 검사가) 이미 알렸다. 여기에서 그 문항을 찾으면 한국어 문구 대신 TypeError 가 나간다.
      if (s.layout !== 'quiz' || !Number.isInteger(s.item) || s.item < 1 || s.item > nQuiz) return;
      const step = l.flow.find((f) => f.slides && f.slides[0] <= i + 1 && i + 1 <= f.slides[1]);
      // 없는 차시를 적은 단계도 위에서 이미 알렸다
      if (step && lessons.includes(lessonOf(step))) shown.set(s.item, [...(shown.get(s.item) ?? []), { lesson: lessonOf(step), slide: i + 1 }]);
    });
    for (const [item, at] of shown) {
      const q = l.quiz.items[item - 1];
      const where = [...new Set(at.map((x) => x.lesson))];
      // 같은 문항을 두 차시에서 띄우면 lesson 을 어느 쪽으로 적어도 맞지 않는다. "lesson 을 고치라"고 하면 두 문구 사이를 맴돈다.
      if (where.length > 1) issue(['quiz', 'items', item - 1], `${item}번 문항을 ${where.map((n) => `${n}차시`).join('와 ')}의 수업 화면에서 모두 띄웁니다. 한 문항은 한 차시에서만 띄웁니다. 다시 물을 문항은 quiz.items 에 따로 적습니다`);
      else if (where[0] !== (q.lesson ?? lessons[lessons.length - 1])) issue(['quiz', 'items', item - 1, 'lesson'], `${item}번 문항은 ${where[0]}차시의 수업 화면(${at[0].slide}번 장)에서 띄웁니다. 문항에 lesson: ${where[0]} 을 적습니다`);
    }
  }
  for (const { path, block } of leafBlocksOf(l.worksheet)) {
    if (block.type === 'quiz') block.items.forEach((n, i) => { if (n > nQuiz) issue([...path, 'items', i], `퀴즈 문항 ${n}번이 없습니다 (문항은 ${nQuiz}개)`); });
  }

  // 흐름의 수업 화면 범위는 1번부터 빈틈없이 이어지고 모든 장을 덮는다
  let next = 1;
  l.flow.forEach((s, i) => {
    if (!s.slides) return;
    const [a, b] = s.slides;
    if (a !== next || b < a || b > l.slides.length) issue(['flow', i, 'slides'], `수업 화면 범위 [${a}, ${b}] 가 맞지 않습니다. ${next}번 장부터 이어져야 하고 전체는 ${l.slides.length}장입니다`);
    next = Math.max(next, b + 1);
  });
  if (next <= l.slides.length) issue(['flow'], `수업 화면 ${next}번부터 ${l.slides.length}번 장을 쓰는 단계가 없습니다. 그 장을 쓰는 단계의 slides 에 넣습니다`);

  // 흐름에서 쓴다고 한 자료가 만들어져 있는가
  l.flow.forEach((s, i) => s.uses.forEach((u, ui) => {
    if (u in l.assets && l.assets[u as OptionalAssetKind].state !== 'ready') issue(['flow', i, 'uses', ui], `${u} 는 아직 만들지 않았습니다 (assets.${u}.state 가 ready 가 아닙니다). uses 에서 빼거나 자료를 먼저 만듭니다`);
  }));

  // 선택 자료
  const a = l.assets;
  if (a.web_activity.state === 'ready' && a.web_activity.activity.kind === 'sort') {
    const bins = new Set(a.web_activity.activity.bins.map((b) => b.id));
    a.web_activity.activity.items.forEach((it, i) => { if (!bins.has(it.bin)) issue(['assets', 'web_activity', 'activity', 'items', i, 'bin'], `없는 상자 id 입니다: ${it.bin}. bins 에 적은 id 를 씁니다`); });
  }
  if (a.making_kit.state === 'ready' && a.making_kit.when === 'in_class' && a.making_kit.minutes === undefined) issue(['assets', 'making_kit', 'minutes'], '수업 안에서 하는 만들기는 걸리는 시간(minutes)을 적습니다');
  if (a.coloring.state === 'ready' && a.coloring.print?.sides === 'duplex') issue(['assets', 'coloring', 'print', 'sides'], '컬러링 도안은 한 쪽입니다. sides 를 지웁니다');
  if (a.papercraft.state === 'ready') {
    // 전개도 모듈은 세로 한 쪽(190 × 249mm)에 그리고, 오려 쓰는 종이라 뒷면을 찍지 않는다
    if (a.papercraft.print.orientation === 'landscape') issue(['assets', 'papercraft', 'print', 'orientation'], '페이퍼크래프트는 늘 A4 세로로 찍습니다. orientation 을 지웁니다');
    if (a.papercraft.print.sides === 'duplex') issue(['assets', 'papercraft', 'print', 'sides'], '페이퍼크래프트는 늘 단면으로 찍습니다. sides 를 지웁니다');
  }
  if (a.cards.state === 'ready') {
    const c = a.cards;
    if (c.collect.length === 0 && c.cards.length < 4) issue(['assets', 'cards', 'cards'], '카드는 4장 이상 적습니다 (단원 덱은 collect 로 앞 묶음의 카드를 모읍니다)');
    c.cards.forEach((card, i) => {
      if (!card.back && !terms.has(card.front)) issue(['assets', 'cards', 'cards', i, 'back'], `뒷면(back)을 적거나, terms.new 에 "${card.front}" 을 넣어 그 풀이를 쓰게 합니다`);
    });
    for (const d of dups(c.cards.map((x) => x.front))) issue(['assets', 'cards', 'cards'], `앞면이 같은 카드가 있습니다: ${d}`);
    if (c.print?.sides === 'single') issue(['assets', 'cards', 'print', 'sides'], '카드는 늘 양면으로 찍습니다. sides 를 지우거나 duplex 로 적습니다');
    if (c.print?.orientation === 'landscape') issue(['assets', 'cards', 'print', 'orientation'], '카드는 늘 A4 세로로 찍습니다. orientation 을 지웁니다');
    const own = l.id.split('/')[2];
    const listed = c.collect.flatMap((g) => g.bundles);
    for (const d of dups(listed)) issue(['assets', 'cards', 'collect'], `같은 묶음을 두 번 모았습니다: ${d}`);
    if (listed.includes(own)) issue(['assets', 'cards', 'collect'], `이 묶음(${own})의 카드는 cards 에 적습니다. collect 에는 앞 묶음만 적습니다`);
  }

  // 지어낸 그림·사람이 나오는 그림을 쓸 수 없는 자리
  for (const u of mUses) {
    const m = media.get(u.ref);
    const problem = m && mediaUseProblem(m, u.use);
    if (problem) issue(u.path, problem);
  }

  // 아픈 역사를 놀이로 다루지 않는다
  const painful = l.facts.filter((f) => f.painful);
  if (painful.length > 0 && l.sensitivity.level === 'none') issue(['sensitivity', 'level'], `피해를 담은 사실(${painful.map((f) => f.id).join(', ')})이 있으면 sensitivity.level 을 care 나 no_play 로 적습니다`);
  for (const u of fUses) {
    const problem = facts.get(u.ref)?.painful ? painfulUseProblem(u.ref, u.use) : undefined;
    if (problem) issue(u.path, problem);
  }
  // 그런 사실을 그린 그림도 같다 (앞 묶음의 그림과 앞 묶음의 사실은 lib/content.ts 가 본다)
  for (const u of mUses) {
    const m = media.get(u.ref);
    if (m && u.use.startsWith('asset:') && m.facts.some((ref) => facts.get(ref)?.painful)) issue(u.path, drawsPainProblem(m.id));
  }
  if (a.cards.state === 'ready') a.cards.cards.forEach((card, i) => {
    const t = card.back ? undefined : terms.get(card.front);
    if (t?.facts.some((ref) => facts.get(ref)?.painful)) issue(['assets', 'cards', 'cards', i, 'front'], `"${card.front}" 의 풀이는 피해를 담은 사실에 기대고 있어 카드로 만들지 않습니다`);
  });
  if (l.sensitivity.level === 'no_play') {
    for (const k of NO_PLAY_BANNED) if (a[k].state !== 'skip') issue(['assets', k, 'state'], 'sensitivity 가 no_play 인 차시에는 만들지 않습니다. state: skip 과 까닭을 적습니다');
    if (a.cards.state === 'ready') {
      a.cards.cards.forEach((card, i) => {
        if (!terms.has(card.front)) issue(['assets', 'cards', 'cards', i, 'front'], 'no_play 차시의 카드는 terms.new 의 낱말만 담습니다');
        if (card.media) issue(['assets', 'cards', 'cards', i, 'media'], 'no_play 차시의 카드에는 그림을 넣지 않습니다');
      });
      if (a.cards.games.length) issue(['assets', 'cards', 'games'], 'no_play 차시의 카드에는 놀이 방법을 붙이지 않습니다');
    }
  }

  // 적힌 차례가 시간 차례다. 날짜가 거꾸로 가면(손으로 끼워 넣었거나 가지를 합치다 뒤섞였으면) '마지막 기록'을 믿을 수 없다.
  l.reviews.forEach((r, i) => { if (i > 0 && r.date < l.reviews[i - 1].date) issue(['reviews', i, 'date'], '검수 기록은 날짜가 이른 것부터 적습니다 (맨 아래가 가장 나중 기록입니다). 윗줄의 기록보다 날짜가 이릅니다'); });
  l.facts.forEach((f, fi) => f.checks.forEach((ch, i) => { if (i > 0 && ch.date < f.checks[i - 1].date) issue(['facts', fi, 'checks', i, 'date'], '확인 기록은 날짜가 이른 것부터 적습니다 (맨 아래가 가장 나중 기록입니다). 윗줄의 기록보다 날짜가 이릅니다'); }));

  // 공개 조건(출처, 검수 기록, 지문)은 여기에서 보지 않는다. lib/content.ts 가 본다.
  // 여기에서 막으면 공개된 차시에 사실을 보탠 뒤 지문과 남은 검수(sealsOf·reviewState·publishGaps)를 읽을 수 없다.
});
export type Lesson = z.infer<typeof Lesson>;
