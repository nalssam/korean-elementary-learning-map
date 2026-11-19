// 인쇄 페이지가 쓰는 셈: 학습지의 번호, 선 잇기의 섞는 순서, 문장 틀의 조각, 표의 칸 폭, 카드 쪽 나누기.
// 그리는 일(Astro 컴포넌트)과 떼어 두어 Chromium 없이 `node --test` 로 바로 시험한다 (tests/print/layout.test.ts).
// 여기에는 한 차시에만 맞는 값이 없다. 모두 명세의 꼴에서 나온다.
import { bundleOf, lessonsLabel, semesterLabel, splitFrame } from '#lib/content.ts';
import type { DeckCard } from '#lib/content.ts';
import { CARDS_PER_SIDE } from '#lib/site.ts';
import type { Block, LeafBlock, Lesson } from '#schema/lesson.ts';

// ───────────────────────────── 머리 ─────────────────────────────

/** 인쇄물 머리 맨 윗줄. 어느 학기·단원·차시의 종이인지 알려 준다. 예: "5학년 2학기 사회 · 1단원 1차시" */
export function sheetKicker(lesson: Lesson): string {
  const ref = bundleOf(lesson);
  return `${semesterLabel(ref.semester.id)} 사회 · ${ref.unit.no}단원 ${lessonsLabel(ref.lessons)}`;
}

// ───────────────────────────── 학습지의 번호 ─────────────────────────────

/** 번호를 매긴 블록 하나 */
export interface Placed {
  block: Block;
  /** 넘침 알림에 쓰는 이름. 예: "3번째 블록(줄 쓰기 칸)" */
  where: string;
  /** number: true 인 지시문의 번호 */
  no?: number;
  /** quiz 블록: 문항마다의 번호 (items 와 같은 차례) */
  quizNos?: number[];
  /** columns 블록: 단마다 그 안의 블록 */
  columns?: Placed[][];
  /** 이 블록이 쪽·단에서 몇째인지로 만든 값. 선 잇기의 섞는 순서가 여기에서 나온다. */
  key: string;
}

export interface PlacedPage { heading?: string; items: Placed[] }

/** 블록 종류의 우리말 이름 (넘침 알림과 화면 읽기 프로그램용) */
export const BLOCK_LABEL: Record<Block['type'], string> = {
  prompt: '지시문',
  note: '짧은 글',
  passage: '읽기 자료',
  lines: '줄 쓰기 칸',
  box: '빈 칸',
  figure: '그림',
  observe_infer: '본 것·짐작한 것·까닭',
  table: '표',
  match: '선 잇기',
  quiz: '확인 퀴즈 문항',
  sentence_frame: '문장 틀',
  timeline: '연표',
  columns: '나란히 놓기',
};

/**
 * 학습지의 쪽마다 블록에 번호를 매긴다.
 * 번호는 number: true 인 지시문과 quiz 블록의 문항에 붙고, 쪽이 바뀌어도 이어 센다 (docs/CONTRACT.md 7절).
 * 단(columns) 안의 블록은 왼쪽 단부터 위에서 아래로 센다.
 */
export function placeWorksheet(lesson: Lesson): PlacedPage[] {
  let next = 1;
  const leaf = (block: LeafBlock, key: string, where: string): Placed => {
    if (block.type === 'prompt' && block.number) return { block, key, where, no: next++ };
    if (block.type === 'quiz') return { block, key, where, quizNos: block.items.map(() => next++) };
    return { block, key, where };
  };
  return lesson.worksheet.pages.map((page, pi) => ({
    ...(page.heading ? { heading: page.heading } : {}),
    items: page.blocks.map((block, bi): Placed => {
      const key = `${pi + 1}-${bi + 1}`;
      const where = `${bi + 1}번째 블록(${BLOCK_LABEL[block.type]})`;
      if (block.type !== 'columns') return leaf(block, key, where);
      const columns = block.columns.map((col, ci) => col.map((b, li) => leaf(b, `${key}-${ci + 1}-${li + 1}`, `${bi + 1}번째 블록의 ${ci + 1}째 단(${BLOCK_LABEL[b.type]})`)));
      return { block, key, where, columns };
    }),
  }));
}

// ───────────────────────────── 선 잇기 ─────────────────────────────

// 글에서 32비트 씨앗을 얻는다 (FNV-1a). 빌드마다, 컴퓨터마다 같은 값이 나온다.
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(text)) { h ^= ch; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// 씨앗에서 0 이상 1 미만의 수를 차례로 내는 작은 난수 (mulberry32)
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 선 잇기의 오른쪽을 찍는 차례. order[자리] = 짝의 순서 번호(0부터).
 * 묶음 id 와 블록의 자리(key)로 정해져서 빌드마다 같다. 적힌 차례 그대로(왼쪽과 나란히)는 나오지 않는다.
 */
export function matchOrder(lessonId: string, key: string, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const rand = random(seedOf(`${lessonId}#${key}`));
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // 섞었는데 처음 차례 그대로이면 한 칸씩 민다 (모든 짝이 마주 보면 잇지 않아도 답이 보인다)
  if (count > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

// ───────────────────────────── 문장 틀 ─────────────────────────────

export type FramePart = { kind: 'text'; text: string } | { kind: 'blank' } | { kind: 'break' };

/**
 * 문장 틀을 글 조각·빈칸·줄바꿈으로 나눈다.
 * 한 문장이 끝나고 다음 문장이 이어지면 그 사이에서 줄을 바꾼다. 문장마다 제 줄을 써야 빈칸이 줄 끝까지 넓어진다.
 * "나는 ___라고 짐작했다. 왜냐하면 ___이 보이기 때문이다." → 나는 / 빈칸 / 라고 짐작했다. / 줄바꿈 / 왜냐하면 / 빈칸 / 이 보이기 때문이다.
 */
export function frameParts(frame: string): FramePart[] {
  const out: FramePart[] = [];
  splitFrame(frame).forEach((piece, i) => {
    if (i > 0) out.push({ kind: 'blank' });
    const sentences = piece.split(/(?<=[.?!。？！])\s+/).map((s) => s.trim());
    sentences.forEach((s, si) => {
      if (si > 0) out.push({ kind: 'break' });
      if (s) out.push({ kind: 'text', text: s });
    });
  });
  // 맨 앞과 맨 뒤의 줄바꿈은 뜻이 없다
  while (out[0]?.kind === 'break') out.shift();
  while (out.at(-1)?.kind === 'break') out.pop();
  return out;
}

// ───────────────────────────── 표 ─────────────────────────────

/**
 * 표의 칸 폭 비율. 아이가 채우는 칸("")이 있는 열을 넓게 준다.
 * 모든 줄에 글이 적힌 열(이름표 구실)은 1, 채우는 칸이 하나라도 있는 열은 1.6.
 */
export function tableWeights(columns: string[], rows: string[][]): number[] {
  const fill = columns.map((_, c) => rows.some((r) => r[c] === ''));
  return fill.some(Boolean) && !fill.every(Boolean) ? fill.map((f) => (f ? 1.6 : 1)) : columns.map(() => 1);
}

// ───────────────────────────── 고르기 문항의 보기 ─────────────────────────────

/** 보기를 한 줄에 몇 개씩 놓을지. 짧으면 한 줄에 모두, 길면 한 줄에 하나. */
export function choiceColumns(choices: string[]): 1 | 2 | 4 {
  const longest = Math.max(...choices.map((c) => c.length));
  if (longest <= 6) return 4;
  if (longest <= 14) return 2;
  return 1;
}

// ───────────────────────────── 카드 ─────────────────────────────

/** 카드 쪽 하나. cells 는 2열 × 4행을 왼쪽 위부터 가로로 읽은 여덟 자리이고, 빈 자리는 undefined 다. */
export interface CardSheet {
  side: 'front' | 'back';
  /** 앞면 쪽·뒷면 쪽 가운데 몇째 장인가 (1부터) */
  leaf: number;
  cells: (DeckCard | undefined)[];
}

/**
 * 카드를 쪽으로 나눈다. 앞면 쪽 다음에 그 뒷면 쪽이 온다 (docs/CONTRACT.md 7절).
 * 뒷면 쪽은 줄마다 좌우 열을 바꾼다. 긴 변으로 뒤집어 양면 인쇄하면 앞면의 왼쪽 카드가 뒷면에서는 오른쪽에 놓인다.
 */
export function cardSheets(cards: DeckCard[]): CardSheet[] {
  const out: CardSheet[] = [];
  for (let at = 0; at < cards.length; at += CARDS_PER_SIDE) {
    const front: (DeckCard | undefined)[] = Array.from({ length: CARDS_PER_SIDE }, (_, i) => cards[at + i]);
    const back = front.map((_, i) => front[i % 2 === 0 ? i + 1 : i - 1]);
    const leaf = at / CARDS_PER_SIDE + 1;
    out.push({ side: 'front', leaf, cells: front }, { side: 'back', leaf, cells: back });
  }
  return out;
}

/** 카드 앞면 글자의 크기 단계. 14자까지 한 줄에 들어가게 길수록 작게 찍는다. */
export function frontSize(front: string): 'xl' | 'lg' | 'md' | 'sm' {
  const n = [...front].length;
  if (n <= 5) return 'xl';
  if (n <= 8) return 'lg';
  if (n <= 11) return 'md';
  return 'sm';
}
