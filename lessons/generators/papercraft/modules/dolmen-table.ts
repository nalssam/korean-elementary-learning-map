// 탁자식 고인돌 전개도 (docs/CONTRACT.md 7절의 전개도 모듈)
//
// 조각: 덮개돌(아래가 열린 납작한 상자) 1 · 굄돌(사각기둥) 2 · 막음돌(넓적한 사각기둥) 1 — 1쪽
//       받침판 1 · 통나무 굴림대 3 · 흙 경사로 2 · 차례 카드(명세의 texts 개수) — 2쪽
// 만드는 법 쪽(3쪽)은 페이지가 명세의 steps·try_it·reflect 로 만든다.
//
// 크기는 예전 도안(한 번 검토를 거쳐 조립되지 않던 곳을 고친 것)의 값을 그대로 쓴다.
// 고친 점 두 가지도 지킨다: 탭의 경첩은 접는 선이다(net.ts 가 면으로 그려 보장한다), 세 굄돌의 높이가 같다(덮개돌이 기울지 않는다).
// 이번에 더한 것: 굄돌·막음돌 윗면에 탭을 달아 뒷면 안쪽에 붙인다(윗면이 들뜨지 않는다),
//                흙 경사로의 높이를 굄돌 높이와 같게 했다(굄돌 꼭대기까지 흙을 쌓는 차례와 맞는다).
// 맞닿는 변의 길이와 조각의 자리는 tests/papercraft/dolmen-table.test.ts 가 잰다.
//
// 이 파일에 적는 글은 조각 이름과 조립 표시뿐이다. 아이가 읽는 문장(차례 카드)은 명세의 texts 에서 받는다.
import {
  BODY_W, INK, INK_DIM, LEGEND_H, RULE,
  fit, grain, mark, rect, render, spot, tab, text,
  type Join, type Piece, type Plan, type Pt, type Seg,
} from '../net.ts';

// ── 크기 (mm) ──
/** 덮개돌: 윗면 CL × CW, 옆면 높이 CH */
export const CL = 112, CW = 72, CH = 12;
/** 굄돌: 폭 UW, 두께 UD, 높이 UH */
export const UW = 22, UD = 18, UH = 42;
/** 막음돌: 폭 EW, 두께 ED, 높이 EH (= UH. 세 돌의 높이가 같아야 덮개돌이 기울지 않는다) */
export const EW = 52, ED = 16, EH = UH;
/** 기둥 옆 탭의 폭, 윗면 탭의 깊이 */
export const TAB = 6, TOP_TAB = 6;
/** 통나무: 지름 LOG_D, 길이 LOG_L. 종이 폭은 둘레다. */
export const LOG_D = 16, LOG_L = 46, LOG_C = Math.PI * LOG_D, LOG_TAB = 5.5;
/** 흙 경사로: 밑변 RW, 높이 RH (= UH), 세우는 발 RF */
export const RW = 62, RH = UH, RF = 9;
/** 받침판 */
export const BPW = 170, BPH = 88;

/** 받침판 위의 자리. 받침판 왼쪽 위에서 잰 값이다. 덮개돌 자리 안에 세 돌이 들어간다. */
export const FOOT = {
  cap: { x: (BPW - CL) / 2, y: 9, w: CL, h: CW },
  end: { x: (BPW - EW) / 2, y: 9 + 8, w: EW, h: ED },
  left: { x: BPW / 2 - 38 - UW / 2, y: 9 + 44, w: UW, h: UD },
  right: { x: BPW / 2 + 38 - UW / 2, y: 9 + 44, w: UW, h: UD },
};

const GAP = 4;
const seg = (a: Pt, b: Pt): Seg => [a, b];

// ── 덮개돌: 윗면을 가운데 두고 네 옆면을 접어 내린다. 좌·우 옆면 끝의 탭 넷을 앞·뒤 옆면 안쪽에 붙인다. ──
function capstone(ox: number, oy: number, marks: string[]): Piece {
  const x0 = ox + CH, y0 = oy + CH, x1 = x0 + CL, y1 = y0 + CW;
  const faces = [
    { pts: rect(x0, y0, CL, CW) },          // 윗면
    { pts: rect(x0, oy, CL, CH) },          // 뒤 옆면
    { pts: rect(x0, y1, CL, CH) },          // 앞 옆면
    { pts: rect(ox, y0, CH, CW) },          // 왼 옆면
    { pts: rect(x1, y0, CH, CW) },          // 오른 옆면
    tab([ox, y0], [x0, y0], CH),            // 왼 옆면 → 뒤 옆면
    tab([x0, y1], [ox, y1], CH),            // 왼 옆면 → 앞 옆면
    tab([x1, y0], [x1 + CH, y0], CH),       // 오른 옆면 → 뒤 옆면
    tab([x1 + CH, y1], [x1, y1], CH),       // 오른 옆면 → 앞 옆면
  ];
  // 탭을 붙이는 자리: 앞·뒤 옆면의 양 끝 (안쪽 면). 탭의 깊이 CH 는 옆면 길이 CL 안에 들어간다.
  const joins: Join[] = [
    { what: '덮개돌 왼 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([ox, y0], [x0, y0]), b: seg([x0, oy], [x0, y0]), depth: CH, room: CL },
    { what: '덮개돌 왼 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([ox, y1], [x0, y1]), b: seg([x0, y1], [x0, y1 + CH]), depth: CH, room: CL },
    { what: '덮개돌 오른 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([x1, y0], [x1 + CH, y0]), b: seg([x1, oy], [x1, y0]), depth: CH, room: CL },
    { what: '덮개돌 오른 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([x1, y1], [x1 + CH, y1]), b: seg([x1, y1], [x1, y1 + CH]), depth: CH, room: CL },
  ];
  const art: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const yy = y0 + (CW * i) / 6;
    art.push(grain(`M${x0 + 10},${yy} q${CL * 0.22},${i % 2 ? -2.6 : 2.6} ${CL * 0.44},0 t${CL * 0.36},0`));
  }
  art.push(text(x0 + CL / 2, y0 + CW / 2 - 3, '덮개돌', { size: 6, weight: 700, halo: true }));
  art.push(text(x0 + CL / 2, y0 + CW / 2 + 4.5, '윗면', { size: 3.6, weight: 500, fill: INK_DIM, halo: true }));
  for (const [x, y] of [[x0 + CL / 2, oy + CH / 2], [x0 + CL / 2, y1 + CH / 2]] as const) art.push(text(x, y, '옆면', { size: 3.2, weight: 500, fill: INK_DIM }));
  // 탭과 붙일 자리에 같은 글자
  const m = (x: number, y: number, i: number) => art.push(mark(x, y, marks[i]));
  m(ox + CH / 2, oy + CH / 2 + 1, 0); m(x0 + 4, oy + CH / 2, 0);
  m(ox + CH / 2, y1 + CH / 2 - 1, 1); m(x0 + 4, y1 + CH / 2, 1);
  m(x1 + CH / 2, oy + CH / 2 + 1, 2); m(x1 - 4, oy + CH / 2, 2);
  m(x1 + CH / 2, y1 + CH / 2 - 1, 3); m(x1 - 4, y1 + CH / 2, 3);
  return { name: '덮개돌', faces, art, joins };
}

// ── 굄돌·막음돌: 네 면을 둘러 기둥을 만든다. 밑면은 열어 둔다. ──
// 위에서부터: 윗면 탭(TOP_TAB) · 윗면(w × d, 첫 면 위) · 네 면의 띠(w, d, w, d, 높이 h) · 오른쪽 끝 탭(TAB)
function pillar(ox: number, oy: number, name: string, w: number, d: number, h: number, marks: [string, string], nameSize: number): Piece {
  const yT = oy + TOP_TAB, yB = yT + d;
  const xs = [ox, ox + w, ox + w + d, ox + 2 * w + d, ox + 2 * w + 2 * d];
  const xe = xs[4];
  const faces = [
    ...[0, 1, 2, 3].map((i) => ({ pts: rect(xs[i], yB, xs[i + 1] - xs[i], h) })),
    { pts: rect(ox, yT, w, d) },                // 윗면
    tab([ox, yT], [ox + w, yT], TOP_TAB),       // 윗면 → 뒷면(셋째 면) 안쪽
    tab([xe, yB], [xe, yB + h], TAB),           // 넷째 면 → 첫째 면 안쪽
  ];
  const joins: Join[] = [
    { what: `${name} 옆 탭 → 첫째 면`, kind: 'glue', a: seg([xe, yB], [xe, yB + h]), b: seg([ox, yB], [ox, yB + h]), depth: TAB, room: w },
    { what: `${name} 윗면 탭 → 셋째 면 윗변`, kind: 'glue', a: seg([ox, yT], [ox + w, yT]), b: seg([xs[2], yB], [xs[3], yB]), depth: TOP_TAB, room: h },
    { what: `${name} 윗면 오른변 = 둘째 면 윗변`, kind: 'meet', a: seg([ox + w, yT], [ox + w, yB]), b: seg([xs[1], yB], [xs[2], yB]) },
    { what: `${name} 윗면 왼변 = 넷째 면 윗변`, kind: 'meet', a: seg([ox, yT], [ox, yB]), b: seg([xs[3], yB], [xs[4], yB]) },
  ];
  const art: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const yy = yB + (h * i) / 5;
    art.push(grain(`M${ox + 3},${yy} q${(xe - ox) * 0.25},${i % 2 ? -2 : 2} ${(xe - ox) * 0.5},0 t${(xe - ox) * 0.5 - 6},0`));
  }
  art.push(text(ox + w / 2, yB + h / 2 - 2, name, { size: nameSize, weight: 700, halo: true }));
  art.push(text(ox + w / 2, yT + d / 2, '윗면', { size: 3.2, weight: 500, fill: INK_DIM }));
  art.push(mark(xe + TAB / 2, yB + h / 2, marks[0]), mark(ox + 3.6, yB + h - 5, marks[0]));
  art.push(mark(ox + w / 2, oy + TOP_TAB / 2 + 0.4, marks[1]), mark((xs[2] + xs[3]) / 2, yB + 4, marks[1]));
  return { name, faces, art, joins };
}

// ── 받침판: 접지 않는다. 덮개돌 자리 안에 세 돌을 세울 자리를 점으로 찍는다. ──
function baseplate(ox: number, oy: number): Piece {
  const art: string[] = [];
  const at = (f: { x: number; y: number; w: number; h: number }) => [ox + f.x, oy + f.y, f.w, f.h] as const;
  art.push(text(ox + 4, oy + 4.6, '받침판', { size: 4.2, weight: 700, anchor: 'start' }));
  const [cx, cy, cw, chh] = at(FOOT.cap);
  art.push(spot(cx, cy, cw, chh));
  art.push(text(cx + cw / 2, cy + chh - 4, '덮개돌 자리', { size: 3.4, weight: 500, fill: INK_DIM }));
  for (const [f, label] of [[FOOT.end, '막음돌'], [FOOT.left, '왼쪽 굄돌'], [FOOT.right, '오른쪽 굄돌']] as const) {
    const [x, y, w, h] = at(f);
    art.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="none"/>`, spot(x, y, w, h));
    art.push(text(x + w / 2, y + h / 2, label, { size: label.length > 3 ? 2.9 : 3.4, weight: 600 }));
  }
  // 앞쪽: 굄돌 둘이 서는 쪽. 완성 모습 그림과 같은 방향이다.
  art.push(text(ox + BPW / 2, oy + BPH - 3.4, '앞', { size: 3.4, weight: 700 }));
  return { name: '받침판', faces: [{ pts: rect(ox, oy, BPW, BPH) }], art, joins: [] };
}

// ── 통나무: 둥글게 말아 오른쪽 탭을 왼쪽 끝 안쪽에 붙인다. ──
function log(ox: number, oy: number, n: number, m: string): Piece {
  const art: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = ox + (LOG_C * i) / 4;
    art.push(grain(`M${x},${oy + 4} L${x},${oy + LOG_L - 4}`));
  }
  art.push(text(ox + LOG_C / 2, oy + LOG_L / 2, `통나무 ${n}`, { size: 3.6, weight: 700, halo: true }));
  art.push(mark(ox + LOG_C + LOG_TAB / 2, oy + LOG_L / 2, m), mark(ox + 3.6, oy + 6, m));
  return {
    name: `통나무 ${n}`,
    faces: [{ pts: rect(ox, oy, LOG_C, LOG_L) }, tab([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L], LOG_TAB)],
    art,
    joins: [{ what: `통나무 ${n} 탭 → 왼쪽 끝`, kind: 'glue', a: seg([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L]), b: seg([ox, oy], [ox, oy + LOG_L]), depth: LOG_TAB, room: LOG_C }],
  };
}

// ── 흙 경사로: 세워 두는 직각삼각형. 밑의 발을 뒤로 접어 세운다 (풀칠하지 않는다). 높은 쪽이 고인돌 쪽이다. ──
function ramp(ox: number, oy: number, highOnRight: boolean): Piece {
  const yb = oy + RH;
  const hi = highOnRight ? ox + RW : ox, lo = highOnRight ? ox : ox + RW;
  const tri = { pts: highOnRight ? [[hi, oy], [hi, yb], [lo, yb]] as Pt[] : [[hi, oy], [lo, yb], [hi, yb]] as Pt[] };
  const foot = { ...tab([ox + RW, yb], [ox, yb], RF), glue: false };
  const art: string[] = [];
  for (const k of [0.62, 0.86]) {
    const yy = oy + RH * k;
    const w = RW * k;
    art.push(grain(`M${hi + (highOnRight ? -2 : 2)},${yy} L${highOnRight ? hi - w + 3 : hi + w - 3},${yy}`));
  }
  const side = highOnRight ? -1 : 1;
  art.push(text(hi + side * RW * 0.3, oy + RH * 0.74, '흙 경사로', { size: 3.6, weight: 700, halo: true }));
  art.push(text(hi + side * 2, oy + RH * 0.42, '고인돌 쪽', { size: 2.9, weight: 500, fill: INK_DIM, anchor: highOnRight ? 'end' : 'start', halo: true }));
  art.push(text(ox + RW / 2, yb + RF / 2, '발', { size: 3.2, weight: 500, fill: INK_DIM }));
  return { name: '흙 경사로', faces: [tri, foot], art, joins: [] };
}

// ── 차례 카드: 명세의 texts. 섞어 놓고 차례를 맞히는 카드라 순서대로 찍지 않는다. ──
/** 카드를 찍는 차례: 홀수째 다음 짝수째 (넷이면 2·4·1·3번째 글). 제자리에 남는 카드가 없게 하고, 빌드마다 같다. */
export function cardOrder(n: number): number[] {
  const idx = [...Array(n).keys()];
  const order = [...idx.filter((i) => i % 2 === 1), ...idx.filter((i) => i % 2 === 0)];
  // 글이 홀수 개이면 마지막 글이 제자리에 남는다. 바로 앞 것과 자리를 바꾼다.
  if (n >= 3 && order[n - 1] === n - 1) [order[n - 2], order[n - 1]] = [order[n - 1], order[n - 2]];
  return order;
}
export const CARD_TEXT_SIZES = [4.2, 3.9, 3.6, 3.3, 3.0];
/**
 * 카드 한 장. 높이가 넉넉하면(한 줄에 넷까지) 위에 '차례' 칸, 아래에 글을 둔다.
 * 카드가 다섯 장 이상이라 두 줄로 놓아 낮아지면 '차례' 칸을 왼쪽에 두고 글을 오른쪽에 둔다.
 */
/** 카드 글이 들어갈 칸 [x, y, 폭, 높이] */
function cardTextBox(ox: number, oy: number, w: number, h: number): [number, number, number, number] {
  const pad = 2.6, box = 6.5;
  return h >= 28 ? [ox + pad, oy + pad + box + 1.5, w - 2 * pad, h - 2 * pad - box - 1.5] : [ox + pad + box + 2, oy + 1.6, w - 2 * pad - box - 2, h - 3.2];
}
function card(ox: number, oy: number, w: number, h: number, s: string, no: number, sizes: number[]): Piece {
  const pad = 2.6;
  const box = 6.5;
  const art: string[] = [];
  if (h >= 28) {
    art.push(text(ox + pad, oy + pad + box / 2, '차례', { size: 3, weight: 500, fill: INK_DIM, anchor: 'start' }));
    art.push(`<rect x="${ox + pad + 7.6}" y="${oy + pad}" width="${box}" height="${box}" fill="none" stroke="${RULE}" stroke-width="0.35"/>`);
  } else {
    art.push(`<rect x="${ox + pad}" y="${oy + (h - box) / 2}" width="${box}" height="${box}" fill="none" stroke="${RULE}" stroke-width="0.35"/>`);
  }
  const [tx, ty, tw, th] = cardTextBox(ox, oy, w, h);
  const f = fit(s, tw, th, sizes);
  const top = ty + (th - f.lines.length * f.lineHeight) / 2;
  f.lines.forEach((line, i) => art.push(`<g data-card-line="${no}">${text(tx + tw / 2, top + f.lineHeight * (i + 0.5), line, { size: f.size, weight: 600 })}</g>`));
  return { name: `차례 카드 ${no}`, faces: [{ pts: rect(ox, oy, w, h) }], art, joins: [] };
}

// ── 쪽 배치 ──
const MARKS_1 = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'];
const MARKS_2 = ['가', '나', '다'];

function sheet1(): Plan {
  const capW = CL + 2 * CH, capH = CW + 2 * CH;
  const capY = LEGEND_H + 3;
  const pW = 2 * UW + 2 * UD + TAB;
  const upY = capY + capH + GAP;
  const endY = upY + TOP_TAB + UD + UH + GAP;
  const endW = 2 * EW + 2 * ED + TAB;
  const pieces = [
    capstone((BODY_W - capW) / 2, capY, MARKS_1.slice(0, 4)),
    pillar((BODY_W - 2 * pW - 10) / 2, upY, '왼쪽 굄돌', UW, UD, UH, [MARKS_1[4], MARKS_1[5]], 3.4),
    pillar((BODY_W + 10) / 2, upY, '오른쪽 굄돌', UW, UD, UH, [MARKS_1[6], MARKS_1[7]], 3.4),
    pillar((BODY_W - endW) / 2, endY, '막음돌', EW, ED, EH, [MARKS_1[8], MARKS_1[9]], 4.6),
  ];
  return { title: '탁자식 고인돌 · 돌 조각', sub: '덮개돌 1 · 굄돌 2 · 막음돌 1', pieces, art: [], joins: [] };
}

function sheet2(texts: string[]): Plan {
  const pieces: Piece[] = [];
  const bpY = LEGEND_H + 3;
  pieces.push(baseplate((BODY_W - BPW) / 2, bpY));
  const logY = bpY + BPH + GAP + 1;
  const logW = LOG_C + LOG_TAB;
  const logGap = 8;
  const logX = (BODY_W - 3 * logW - 2 * logGap) / 2;
  [0, 1, 2].forEach((i) => pieces.push(log(logX + i * (logW + logGap), logY, i + 1, MARKS_2[i])));
  const rampY = logY + LOG_L + GAP + 1;
  const left = ramp(8, rampY, true), right = ramp(BODY_W - 8 - RW, rampY, false);
  pieces.push(left, right);
  // 차례 카드: 남은 높이 안에 한 줄(넷까지) 또는 두 줄로
  const cardY = rampY + RH + RF + GAP + 1;
  const n = texts.length;
  const order = cardOrder(n);
  const perRow = n <= 4 ? Math.max(n, 1) : 4;
  const rows = Math.ceil(n / perRow) || 1;
  const cg = 3;
  const cw = Math.min(46, (BODY_W - 4 - (perRow - 1) * cg) / perRow);
  const ch = Math.min(38, (249 - 0.5 - cardY - (rows - 1) * cg) / rows);
  const cx0 = (BODY_W - perRow * cw - (perRow - 1) * cg) / 2;
  // 모든 카드를 같은 글자 크기로 찍는다: 가장 긴 글이 들어가는 크기에 맞춘다
  const [, , tw, th] = cardTextBox(0, 0, cw, ch);
  const size = Math.min(...texts.map((s) => fit(s, tw, th, CARD_TEXT_SIZES).size), CARD_TEXT_SIZES[0]);
  const sizes = CARD_TEXT_SIZES.filter((s) => s <= size);
  order.forEach((ti, k) => {
    const r = Math.floor(k / perRow), c = k % perRow;
    pieces.push(card(cx0 + c * (cw + cg), cardY + r * (ch + cg), cw, ch, texts[ti], k + 1, sizes));
  });
  // 흙 경사로의 높은 변: 굄돌 꼭대기까지 흙을 쌓는다 (plans() 가 굄돌의 변과 짝지어 시험에 넘긴다)
  const joins: Join[] = [
    { what: '왼쪽 흙 경사로 높이 = 굄돌 높이', kind: 'meet', a: seg([8 + RW, rampY], [8 + RW, rampY + RH]), b: seg([0, 0], [0, 0]) },
    { what: '오른쪽 흙 경사로 높이 = 굄돌 높이', kind: 'meet', a: seg([BODY_W - 8 - RW, rampY], [BODY_W - 8 - RW, rampY + RH]), b: seg([0, 0], [0, 0]) },
  ];
  const sub = n > 0 ? `받침판 1 · 통나무 3 · 흙 경사로 2 · 차례 카드 ${n}` : '받침판 1 · 통나무 3 · 흙 경사로 2';
  return { title: '탁자식 고인돌 · 받침판과 굴림대', sub, pieces, art: [], joins };
}

/** 쪽마다의 설계. 시험이 조각의 변과 자리를 잰다. */
export function plans(texts: string[]): Plan[] {
  const one = sheet1(), two = sheet2(texts);
  // 경사로의 높은 변과 짝지을 굄돌의 세로 변 (1쪽 왼쪽 굄돌 첫째 면의 왼변)
  const pillarEdge = one.pieces[1].joins[0].b;
  two.joins = two.joins.map((j) => ({ ...j, b: pillarEdge }));
  return [one, two];
}

/** 모듈의 기본 내보내기 (docs/CONTRACT.md 7절) */
export function sheets(texts: string[]): { title: string; sub: string; svg: string }[] {
  return plans(texts).map((p, i) => ({ title: p.title, sub: p.sub, svg: render(p, i + 1) }));
}

/**
 * 완성 모습 (빗각 투영). 만드는 법 쪽에 싣는다. 계약에 없는 선택 내보내기다 (없으면 페이지가 그림 없이 만든다).
 * 모델 좌표: X 좌우(0~CL), Y 깊이(0 = 뒤 … CW = 앞), Z 높이.
 */
export function preview(): string {
  const P = (X: number, Y: number, Z: number): Pt => [10 + X + 0.45 * (CW - Y), 74 - Z - 0.3 * (CW - Y)];
  const pts = (ps: Pt[]) => ps.map((p) => `${Math.round(p[0] * 100) / 100},${Math.round(p[1] * 100) / 100}`).join(' ');
  const box = (X0: number, X1: number, Y0: number, Y1: number, Z0: number, Z1: number, strong = false) => {
    const sw = strong ? 0.6 : 0.45;
    const face = (ps: Pt[], fill: string) => `<polygon points="${pts(ps)}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    return [
      face([P(X1, Y0, Z0), P(X1, Y1, Z0), P(X1, Y1, Z1), P(X1, Y0, Z1)], RULE),
      face([P(X0, Y0, Z1), P(X1, Y0, Z1), P(X1, Y1, Z1), P(X0, Y1, Z1)], '#ffffff'),
      face([P(X0, Y1, Z0), P(X1, Y1, Z0), P(X1, Y1, Z1), P(X0, Y1, Z1)], '#e6e6e6'),
    ].join('');
  };
  const f = FOOT;
  const X = (x: number) => x - f.cap.x, Y = (y: number) => y - f.cap.y;
  const g: string[] = [];
  const [gx, gy] = P(CL / 2, CW / 2, 0);
  g.push(`<ellipse cx="${gx}" cy="${gy + 2}" rx="84" ry="10" fill="none" stroke="${RULE}" stroke-width="0.4"/>`);
  g.push(box(X(f.end.x), X(f.end.x) + EW, Y(f.end.y), Y(f.end.y) + ED, 0, EH));
  g.push(box(X(f.right.x), X(f.right.x) + UW, Y(f.right.y), Y(f.right.y) + UD, 0, UH));
  g.push(box(X(f.left.x), X(f.left.x) + UW, Y(f.left.y), Y(f.left.y) + UD, 0, UH));
  g.push(box(0, CL, 0, CW, UH, UH + CH, true));
  const lead = (from: Pt, to: Pt, label: string, anchor: 'start' | 'end') => {
    g.push(`<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" stroke="${INK_DIM}" stroke-width="0.3"/><circle cx="${from[0]}" cy="${from[1]}" r="0.8" fill="${INK}"/>`);
    g.push(text(to[0] + (anchor === 'start' ? 1.2 : -1.2), to[1], label, { size: 4, weight: 600, anchor, halo: true }));
  };
  const top = P(CL * 0.75, CW * 0.3, UH + CH);
  lead(top, [top[0] + 14, top[1] - 4], '덮개돌', 'start');
  const lu = P(X(f.left.x) + UW / 2, Y(f.left.y) + UD, UH * 0.45);
  lead(lu, [lu[0] - 16, lu[1] + 4], '왼쪽 굄돌', 'end');
  const ru = P(X(f.right.x) + UW / 2, Y(f.right.y) + UD, UH * 0.45);
  lead(ru, [ru[0] + 14, ru[1] + 6], '오른쪽 굄돌', 'start');
  const ee = P(X(f.end.x) + EW * 0.55, Y(f.end.y) + ED, UH * 0.3);
  lead(ee, [ee[0] + 4, ee[1] + 16], '막음돌', 'start');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -2 202 90" role="img" aria-label="완성한 탁자식 고인돌: 굄돌 둘과 막음돌 위에 덮개돌을 얹은 모습" style="display:block;width:100%;height:100%"><g font-family="'Pretendard Variable', Pretendard, sans-serif">${g.join('')}</g></svg>`;
}

export default { sheets, preview };
