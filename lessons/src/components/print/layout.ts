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
  /** table 블록: 바로 앞 지시문이 ○·× 같은 표시를 하라고 하면 true. 빈 칸은 글이 아니라 표시를 받는다. */
  marks?: boolean;
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
  // 표 앞에서 가장 가까운 번호 붙은 지시문 (쪽이 바뀌면 지운다). 번호 없는 작은 제목은 건너뛴다.
  let ask = '';
  const leaf = (block: LeafBlock, key: string, where: string): Placed => {
    if (block.type === 'prompt') {
      if (!block.number) return { block, key, where };
      ask = block.text;
      return { block, key, where, no: next++ };
    }
    if (block.type === 'quiz') return { block, key, where, quizNos: block.items.map(() => next++) };
    if (block.type === 'table') return { block, key, where, marks: asksForMarks(ask) };
    return { block, key, where };
  };
  return lesson.worksheet.pages.map((page, pi) => {
    ask = '';
    return {
      ...(page.heading ? { heading: page.heading } : {}),
      items: page.blocks.map((block, bi): Placed => {
        const key = `${pi + 1}-${bi + 1}`;
        const where = `${bi + 1}번째 블록(${BLOCK_LABEL[block.type]})`;
        if (block.type !== 'columns') return leaf(block, key, where);
        const columns = block.columns.map((col, ci) => col.map((b, li) => leaf(b, `${key}-${ci + 1}-${li + 1}`, `${bi + 1}번째 블록의 ${ci + 1}째 단(${BLOCK_LABEL[b.type]})`)));
        return { block, key, where, columns };
      }),
    };
  });
}

/** 지시문이 글 대신 ○·×·✓ 같은 표시를 하라고 하는가. 예: "… ○표 해 봅시다." */
export function asksForMarks(prompt: string): boolean {
  return /[○◯×✕✓✔]/.test(prompt);
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

// 12pt 글자의 대강의 폭(mm). 한글·한자는 글자 크기만큼, 영문·숫자는 그 반 남짓, 빈칸과 문장 부호는 더 좁다.
const PT12 = 12 * 25.4 / 72;
function textWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) em += 0.28;
    else if (/[.,:;!?'"()~·\-]/.test(ch)) em += 0.38;
    else if (/[\x21-\x7e]/.test(ch)) em += 0.58;
    else em += 1;
  }
  return em * PT12;
}
/** 칸의 안쪽 여백(좌우 3mm)과 테두리 */
const CELL_PAD = 6.8;
/** 표시(○·×)만 받는 칸의 폭 */
const MARK_COL = 40;

/**
 * 글을 줄을 바꿔도 되는 곳과 안 되는 곳으로 나눈다. keep 인 조각 안에서는 줄을 바꾸지 않는다.
 * 괄호로 묶은 말과 "~"가 붙은 낱말이 한 덩어리다 (docs/CONTRACT.md 7절 학습지).
 * "어떻게 이어지나요? (~하니까)" → "어떻게 이어지나요? " / "(~하니까)"(keep)
 */
export function keepParts(text: string): { text: string; keep: boolean }[] {
  const out: { text: string; keep: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\([^()]*\)|~\S+/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), keep: false });
    out.push({ text: m[0], keep: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), keep: false });
  return out;
}

/** 머리 칸 글에서 줄을 바꾸지 않는 가장 긴 덩어리의 폭(mm). 낱말 가운데에서는 줄을 바꾸지 않는다(keep-all). */
function headMin(text: string): number {
  const units = keepParts(text).flatMap((p) => (p.keep ? [p.text] : p.text.split(/\s+/)));
  return Math.max(0, ...units.map((u) => textWidth(u) * 1.04)) + CELL_PAD;
}

/**
 * 표의 칸 폭(mm). 합이 width 다.
 * 몸 칸이 모두 빈("") 열은 아이가 채우는 열이고, 글이 있는 열은 이름표 구실을 한다.
 *  - marks: 채우는 칸이 ○·× 표시만 받는다. 채우는 열은 40mm 남짓으로 좁히고, 나머지를 글 열에 주어 문장이 한 줄에 들게 한다.
 *  - 그 밖: 아이가 글을 쓴다. 글 열은 가장 긴 글이 들어갈 만큼만(표 폭의 40%까지) 주고, 나머지를 채우는 열이 똑같이 나눈다.
 * 채우는 열이 없거나 모두 채우는 열이면 똑같이 나눈다.
 */
export function tableWidths(columns: string[], rows: string[][], { width = 190, marks = false } = {}): number[] {
  const fill = columns.map((_, c) => rows.every((r) => (r[c] ?? '') === ''));
  const equal = columns.map(() => width / columns.length);
  if (!fill.some(Boolean) || fill.every(Boolean)) return equal;
  const head = columns.map(headMin);
  const need = columns.map((col, c) => Math.max(head[c], ...rows.map((r) => textWidth(r[c] ?? '') + CELL_PAD)));
  const nFill = fill.filter(Boolean).length;
  const textCols = columns.map((_, c) => c).filter((c) => !fill[c]);
  const share = (total: number, cols: number[], want: number[]) => {
    // 원하는 만큼 줄 수 있으면 주고 남는 것은 똑같이 더한다. 모자라면 원하는 폭에 비례해 나눈다.
    const sum = cols.reduce((a, c) => a + want[c], 0);
    return cols.map((c) => (sum <= total ? want[c] + (total - sum) / cols.length : (want[c] / sum) * total));
  };
  const out = columns.map(() => 0);
  if (marks) {
    const markW = Math.min(Math.max(MARK_COL, ...columns.map((_, c) => (fill[c] ? head[c] : 0))), (width * 0.6) / nFill);
    const rest = width - markW * nFill;
    share(rest, textCols, need).forEach((w, i) => { out[textCols[i]] = w; });
    columns.forEach((_, c) => { if (fill[c]) out[c] = markW; });
    return out;
  }
  const textW = textCols.map((c) => Math.min(need[c], (width * 0.4) / textCols.length));
  textCols.forEach((c, i) => { out[c] = textW[i]; });
  const rest = width - textW.reduce((a, b) => a + b, 0);
  const fillCols = columns.map((_, c) => c).filter((c) => fill[c]);
  share(rest, fillCols, columns.map((_, c) => head[c])).forEach((w, i) => { out[fillCols[i]] = w; });
  return out;
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
