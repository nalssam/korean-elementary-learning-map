// 전개도 모듈이 같이 쓰는 도구. 조각을 '면'의 모음으로 적으면 자르는 선과 접는 선이 저절로 정해진다.
//
// 왜 면으로 적는가: 예전 도안(손으로 선을 하나씩 그린 것)에서 풀칠 탭의 경첩이 자르는 선으로 찍혀,
// 그대로 오리면 탭이 떨어져 나가 조립할 수 없는 일이 있었다. 면으로 적으면
//   - 두 면이 함께 쓰는 변은 접는 선 (경첩)
//   - 한 면에만 있는 변은 자르는 선 (바깥 윤곽)
// 이 되므로 그런 실수가 생길 수 없다. 세 면 이상이 함께 쓰는 변, 경첩이 하나가 아닌 탭은 analyse() 가 잡는다.
//
// SVG 1단위 = 1mm (docs/CONTRACT.md 7절). 선의 굵기도 SVG 단위로 적는다.
// 이 파일은 차시의 지문에 들지 않는다 (7절). 그래서 여기에는 어느 입체물에나 맞는 것만 두고,
// 그 차시에만 맞는 그림과 글은 모듈 파일(modules/<module>.ts) 안에 둔다.
import { xmlText } from '#lib/content.ts';

export type Pt = readonly [number, number];
export type Seg = readonly [Pt, Pt];

/** 본문(.sheet-body)의 크기. 세로 A4 에서 여백·머리·바닥글을 뺀 자리다. */
export const BODY_W = 190;
export const BODY_H = 249;

// 인쇄물 색. src/styles/tokens.css 의 인쇄물 기준값(--ink, --ink-dim, --rule, --rule-soft)과 같은 값이다.
// SVG 를 따로 떼어 열어도 같은 모양이 나오도록 CSS 변수 대신 값을 적는다.
export const INK = '#1a1a1a';
export const INK_DIM = '#555555';
export const RULE = '#9a9a9a';
export const RULE_SOFT = '#c9c9c9';

/**
 * 도안 글의 글꼴. 고정 굵기 Pretendard 를 먼저 적는다 (7절). 인쇄 페이지는 고정 굵기 Pretendard 를 싣는데,
 * 가변 글꼴(Pretendard Variable)을 적으면 전개도의 글만 PDF 에 Type 3 글꼴로 들어간다.
 */
export const FONT_FAMILY = 'Pretendard, sans-serif';

/** 계약이 정한 선: 자르는 선 0.5 실선, 접는 선 0.3 점선 */
export const CUT_W = 0.5;
export const FOLD_W = 0.3;
export const FOLD_DASH = '2 1.4';
/** 탭 양 끝을 깎는 길이. 접었을 때 이웃 면에 걸리지 않게 한다. */
export const TAB_INSET = 1.4;

/** 면 하나. glue 이면 풀칠 탭이다 (빗금으로 칠한다). */
export interface Face {
  pts: Pt[];
  glue?: boolean;
}

/**
 * 맞닿거나 풀로 붙는 두 변. 시험이 두 변의 길이가 같은지, 두 변이 정말 도안에 있는 변인지 본다.
 * glue: a 는 탭의 경첩, b 는 탭을 붙이는 면의 변 · meet: 조립하면 맞닿는 두 변
 * seat: a 는 발(탭)의 경첩, b 는 그 발을 붙이는 '놓는 자리'(점선 사각형)의 한 변. 자리는 조각의 변이 아니라 그림이다.
 */
export interface Join {
  what: string;
  kind: 'glue' | 'meet' | 'seat';
  a: Seg;
  b: Seg;
  /** glue 일 때 탭의 깊이와, 탭을 붙이는 면이 그 변에서 안쪽으로 가진 길이. 탭이 면 밖으로 삐져나오지 않는지 본다. */
  depth?: number;
  room?: number;
  /** glue 일 때 탭과 붙일 자리에 함께 찍는 글자. 한 글자는 도안 전체에서 한 곳의 붙임만 뜻한다. */
  mark?: string;
}

/** 조각 하나 */
export interface Piece {
  name: string;
  faces: Face[];
  /** 면 위에 얹는 그림과 글 (조각 이름, 조립 표시, 돌결 같은 꾸밈). 선의 규칙과 상관없다. */
  art: string[];
  joins: Join[];
}

/** 한 쪽의 설계. render() 가 SVG 로 바꾼다. */
export interface Plan {
  title: string;
  sub: string;
  pieces: Piece[];
  /** 조각 밖에 그리는 것 (줄 이름 같은 것) */
  art: string[];
  /** 조각 사이에 걸친 맞닿음 (예: 경사로의 높이 = 굄돌의 높이) */
  joins: Join[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(r2(n));
const key = (p: Pt) => `${r2(p[0])},${r2(p[1])}`;
const segKey = (a: Pt, b: Pt) => [key(a), key(b)].sort().join('|');

export const len = (s: Seg) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);

/** 왼쪽 위 (x, y), 폭 w, 높이 h 의 사각형 면 (시계 방향) */
export function rect(x: number, y: number, w: number, h: number): Pt[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/**
 * 변 a→b 에 붙는 풀칠 탭 (사다리꼴). 탭은 a→b 로 걸어갈 때 왼쪽(화면 기준)으로 깊이 depth 만큼 나간다.
 * 양 끝을 inset 만큼 깎아, 접었을 때 이웃 면과 부딪치지 않게 한다.
 */
export function tab(a: Pt, b: Pt, depth: number, inset = TAB_INSET): Face {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Pt = [t[1], -t[0]];
  const out = (p: Pt, along: number): Pt => [p[0] + n[0] * depth + t[0] * along, p[1] + n[1] * depth + t[1] * along];
  return { pts: [a, b, out(b, -inset), out(a, inset)], glue: true };
}

/** 면의 변들 */
function faceEdges(f: Face): Seg[] {
  return f.pts.map((p, i) => [p, f.pts[(i + 1) % f.pts.length]] as Seg);
}

export interface Analysis {
  cut: Seg[];
  fold: Seg[];
  problems: string[];
}

/** 자르는 선(한 면에만 있는 변)과 접는 선(두 면이 함께 쓰는 변)을 가르고, 규칙에 어긋난 곳을 적는다. */
export function analyse(piece: Piece): Analysis {
  const seen = new Map<string, { seg: Seg; faces: number[] }>();
  piece.faces.forEach((f, i) => {
    for (const [a, b] of faceEdges(f)) {
      if (len([a, b]) < 0.01) continue;
      const k = segKey(a, b);
      const e = seen.get(k);
      if (e) e.faces.push(i);
      else seen.set(k, { seg: [a, b], faces: [i] });
    }
  });
  const cut: Seg[] = [], fold: Seg[] = [], problems: string[] = [];
  for (const { seg, faces } of seen.values()) {
    if (faces.length === 1) cut.push(seg);
    else if (faces.length === 2) fold.push(seg);
    else problems.push(`${piece.name}: 세 면 이상이 한 변을 함께 씁니다 (${segKey(...seg)})`);
  }
  piece.faces.forEach((f, i) => {
    if (!f.glue) return;
    const hinges = faceEdges(f).filter(([a, b]) => (seen.get(segKey(a, b))?.faces.length ?? 0) === 2);
    if (hinges.length !== 1) problems.push(`${piece.name}: ${i + 1}번째 면(탭)의 경첩이 ${hinges.length}개입니다 (하나여야 합니다)`);
    const other = hinges.length === 1 ? piece.faces[seen.get(segKey(...hinges[0]))!.faces.find((j) => j !== i)!] : undefined;
    if (other?.glue) problems.push(`${piece.name}: 탭이 탭에 붙어 있습니다`);
  });
  return { cut, fold, problems };
}

/** 조각이 차지하는 사각형 [x0, y0, x1, y1] */
export function bbox(piece: Piece): [number, number, number, number] {
  const xs = piece.faces.flatMap((f) => f.pts.map((p) => p[0]));
  const ys = piece.faces.flatMap((f) => f.pts.map((p) => p[1]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** 자르는 변을 이어 닫힌 윤곽으로 만든다. 가위가 따라갈 선이 한 줄로 이어져 모서리가 깔끔하게 찍힌다. */
function outline(cut: Seg[]): string {
  const left = new Set(cut.map((_, i) => i));
  const at = new Map<string, number[]>();
  cut.forEach(([a, b], i) => {
    for (const p of [a, b]) at.set(key(p), [...(at.get(key(p)) ?? []), i]);
  });
  const loops: string[] = [];
  while (left.size) {
    const first = left.values().next().value!;
    left.delete(first);
    const start = cut[first][0];
    const pts: Pt[] = [start];
    let cur = cut[first][1];
    for (;;) {
      if (key(cur) === key(start)) break;
      pts.push(cur);
      const next = (at.get(key(cur)) ?? []).find((j) => left.has(j));
      if (next === undefined) break;
      left.delete(next);
      cur = key(cut[next][0]) === key(cur) ? cut[next][1] : cut[next][0];
    }
    loops.push(`M${pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' L')} Z`);
  }
  return loops.join(' ');
}

const poly = (pts: Pt[]) => pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ');

// ───────────────────────────── 글 ─────────────────────────────

/**
 * 글의 폭을 어림한다 (Pretendard 기준, 글자 크기에 대한 비). 한글은 거의 정사각형이고 빈칸과 문장부호는 좁다.
 * 도안에서는 글이 칸을 넘지 않는 것이 중요하므로 조금 넉넉하게 잡는다. tests/papercraft 가 브라우저에서 잰 값과 견준다.
 */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    if (/\s/.test(ch)) w += 0.3;
    else if (/[ㄱ-ㆎ가-힣]/.test(ch)) w += 0.96;
    else if (/[.,·:;!?'"()\[\]]/.test(ch)) w += 0.36;
    else if (/[0-9]/.test(ch)) w += 0.62;
    else w += 0.66;
  }
  return w * size;
}

function greedy(words: string[], width: number, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, size) > width) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 낱말 단위로 줄을 나눈다. 낱말 가운데를 끊지 않는다.
 * 줄 수가 같은 한에서 폭을 줄여 가며 줄 길이를 고르게 맞춘다 (마지막 줄에 한두 글자만 남지 않게).
 */
export function wrap(text: string, width: number, size: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines = greedy(words, width, size);
  if (lines.length < 2) return lines;
  let lo = Math.max(...words.map((w) => textWidth(w, size))), hi = width;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (greedy(words, mid, size).length > lines.length) lo = mid; else hi = mid;
  }
  return greedy(words, hi, size);
}

export interface Fitted { size: number; lines: string[]; lineHeight: number }

/** 폭 width, 높이 height 의 칸에 들어가는 가장 큰 글자 크기를 sizes 에서 고른다. 어느 것도 안 되면 가장 작은 것. */
export function fit(text: string, width: number, height: number, sizes: number[], leading = 1.32): Fitted {
  for (const size of sizes) {
    const lines = wrap(text, width, size);
    const ok = lines.every((l) => textWidth(l, size) <= width) && lines.length * size * leading <= height;
    if (ok) return { size, lines, lineHeight: size * leading };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(text, width, size), lineHeight: size * leading };
}

export interface TextOpts {
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
  fill?: string;
  /**
   * 빗금·돌결·지시선 위에서도 읽히게 글 뒤에 흰 바탕을 깐다.
   * 글자에 흰 stroke 를 두르면 Chromium 이 그 글을 PDF 에 Type 3 글꼴로 넣으므로 바탕 사각형으로 한다.
   */
  halo?: boolean;
  rotate?: number;
}

/** 글 한 줄. 글은 모두 xmlText() 를 거친다 (명세의 글도, 모듈의 이름표도). y 는 글자 높이의 가운데다. */
export function text(x: number, y: number, s: string, o: TextOpts = {}): string {
  const size = o.size ?? 3.6;
  const attrs = [
    `x="${fmt(x)}"`, `y="${fmt(y + size * 0.36)}"`, `font-size="${fmt(size)}"`,
    `text-anchor="${o.anchor ?? 'middle'}"`, `font-weight="${o.weight ?? 600}"`, `fill="${o.fill ?? INK}"`,
  ];
  const turn = o.rotate ? ` transform="rotate(${o.rotate} ${fmt(x)} ${fmt(y)})"` : '';
  if (o.rotate) attrs.push(turn.trim());
  const t = `<text ${attrs.join(' ')}>${xmlText(s)}</text>`;
  if (!o.halo) return t;
  const w = textWidth(s, size) + 1.2, h = size * 1.2;
  const anchor = o.anchor ?? 'middle';
  const x0 = anchor === 'start' ? x - 0.6 : anchor === 'end' ? x - w + 0.6 : x - w / 2;
  return `<rect x="${fmt(x0)}" y="${fmt(y - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(size * 0.25)}" fill="#ffffff"${turn}/>` + t;
}

/** 도안에 찍는 글의 가장 작은 크기 (mm). 8pt 다. 이보다 작은 글은 A4 에서 아이가 읽기 어렵다. */
export const MIN_TEXT = 2.83;
/** 조립 표시의 글자 크기와 동그라미 반지름 (mm). 붙일 자리의 글자도 MIN_TEXT 를 넘는다. */
export const MARK_SIZE = { tab: 3.2, target: 2.9 } as const;
export const MARK_R = { tab: 2.5, target: 2.2 } as const;

/**
 * 조립 표시: 동그라미 안의 글자. 탭과, 그 탭을 붙이는 자리에 같은 글자를 찍는다.
 * 탭은 붙이면 안쪽으로 숨으므로 진하게 찍는다. 붙일 자리('target')는 완성하면 겉으로 보이는 면이라 작고 옅게 찍는다.
 */
export function mark(x: number, y: number, s: string, role: 'tab' | 'target' = 'tab'): string {
  const target = role === 'target';
  const color = target ? RULE : INK;
  return `<g data-mark="${xmlText(s)}" data-mark-role="${role}"><circle cx="${fmt(x)}" cy="${fmt(y)}" r="${target ? MARK_R.target : MARK_R.tab}" fill="#ffffff" stroke="${color}" stroke-width="${target ? 0.25 : 0.3}"/>`
    + text(x, y, s, { size: target ? MARK_SIZE.target : MARK_SIZE.tab, weight: 700, fill: color }) + '</g>';
}

/** 놓는 자리를 찍는 점선 (점만 찍히게 길이 0 의 둥근 끝을 쓴다) */
export const SPOT_DASH = '0.01 1.1';

/** 놓는 자리 (바닥판 위의 자리 같은 것). 접는 선과 헷갈리지 않게 점으로 찍는다. */
export function spot(x: number, y: number, w: number, h: number): string {
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="${INK_DIM}" stroke-width="0.45" stroke-linecap="round" stroke-dasharray="${SPOT_DASH}"/>`;
}

/** 꾸밈 선 (돌결, 나뭇결). 자르는 선·접는 선과 헷갈리지 않게 옅고 가늘게 그린다. */
export function grain(d: string): string {
  return `<path d="${d}" fill="none" stroke="${RULE_SOFT}" stroke-width="0.3" stroke-linecap="round"/>`;
}

// ───────────────────────────── 쪽 ─────────────────────────────

/** 쪽마다 맨 위에 두는 선 안내와 5cm 자. 쪽을 따로 나눠 줘도 선을 읽을 수 있고, 실제 크기로 찍혔는지 자로 잴 수 있다. */
export const LEGEND_H = 8;
function legend(glueId: string, withSpot: boolean): string {
  const y = 3.6;
  const g: string[] = [];
  g.push(`<line x1="0.5" y1="${y}" x2="10.5" y2="${y}" stroke="${INK}" stroke-width="${CUT_W}"/>`, text(12.5, y, '자르는 선', { size: 3.2, anchor: 'start', weight: 500 }));
  g.push(`<line x1="34" y1="${y}" x2="44" y2="${y}" stroke="${INK}" stroke-width="${FOLD_W}" stroke-dasharray="${FOLD_DASH}"/>`, text(46, y, '접는 선', { size: 3.2, anchor: 'start', weight: 500 }));
  g.push(`<rect x="63" y="${y - 2.2}" width="10" height="4.4" fill="url(#${glueId})" stroke="${INK}" stroke-width="0.3"/>`, text(75, y, '풀칠', { size: 3.2, anchor: 'start', weight: 500 }));
  // 놓는 자리는 그 점선이 있는 쪽에만 안내한다
  if (withSpot) g.push(spot(90, y - 2.2, 4.4, 4.4), text(96.4, y, '놓는 자리', { size: 3.2, anchor: 'start', weight: 500 }));
  // 5cm 자: 실제 크기(100%)로 찍혔는지 자를 대어 본다
  const x0 = 139.5;
  g.push(`<path d="M${x0},${y + 1.6} L${x0 + 50},${y + 1.6}" stroke="${INK}" stroke-width="0.3" fill="none"/>`);
  for (let i = 0; i <= 5; i++) g.push(`<line x1="${x0 + i * 10}" y1="${y + 1.6}" x2="${x0 + i * 10}" y2="${y + (i % 5 === 0 ? -1.6 : 0)}" stroke="${INK}" stroke-width="0.3"/>`);
  g.push(text(x0 - 2, y, '5cm', { size: 3.2, anchor: 'end', weight: 500 }));
  return g.join('');
}

/** SVG 뿌리 (docs/CONTRACT.md 7절의 꼴 그대로) */
export const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 249" width="190mm" height="249mm" style="display:block">';

/** 한 쪽의 설계를 SVG 로 그린다. no 는 쪽 번호 (한 페이지에 SVG 가 여럿 들어가므로 무늬 id 를 쪽마다 다르게 한다). */
export function render(plan: Plan, no: number): string {
  const glueId = `pc-glue-${no}`;
  const out: string[] = [SVG_OPEN];
  out.push(`<defs><pattern id="${glueId}" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)"><rect width="1.6" height="1.6" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="1.6" stroke="${RULE}" stroke-width="0.35"/></pattern></defs>`);
  out.push(`<g font-family="${FONT_FAMILY}">`);
  const withSpot = [...plan.art, ...plan.pieces.flatMap((p) => p.art)].some((a) => a.includes(`stroke-dasharray="${SPOT_DASH}"`));
  out.push(legend(glueId, withSpot));
  for (const piece of plan.pieces) {
    const { cut, fold } = analyse(piece);
    out.push('<g>');
    for (const f of piece.faces) if (f.glue) out.push(`<polygon points="${poly(f.pts)}" fill="url(#${glueId})"/>`);
    out.push(...piece.art);
    for (const [a, b] of fold) out.push(`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="${INK}" stroke-width="${FOLD_W}" stroke-dasharray="${FOLD_DASH}"/>`);
    out.push(`<path d="${outline(cut)}" fill="none" stroke="${INK}" stroke-width="${CUT_W}" stroke-linejoin="round"/>`);
    out.push('</g>');
  }
  out.push(...plan.art);
  out.push('</g></svg>');
  return out.join('');
}
