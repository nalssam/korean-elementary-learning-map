// 종이 고인돌 전개도 (docs/CONTRACT.md 7절의 전개도 모듈)
//
// 짜임: 덮개돌 하나를 받침돌 둘이 받친다. 사진과 수업 화면의 도해가 그렇고, 아이가 읽는 글도 덮개돌·받침돌만 쓴다 (15절).
// 조각: 덮개돌(아래가 열린 납작한 상자) 1 · 받침돌(넓적한 판돌) 2 — 1쪽
//       바닥판 1 · 통나무 3 · 흙 비탈 벽 2 · 차례 카드(명세의 texts 개수) — 2쪽
// 만드는 법 쪽(3쪽)은 페이지가 명세의 steps·try_it·reflect 로 만들고, 완성 모습은 이 파일의 preview() 가 그린다.
//
// 받침돌을 판돌(두께 SW, 너비 SD)로 만든 까닭: 기둥 둘만으로는 덮개돌이 앞뒤로 기운다. 너비 40mm 판돌 둘이면 덮개돌이 혼자 선다.
// 그래서 예전 도안의 셋째 돌(뒤를 막는 돌)은 뺐다.
//
// 흙 비탈과 통나무는 보여 주는 조각이다. 종이 비탈로 덮개돌을 정말 끌어 올릴 수는 없다.
// 세모 벽 둘을 마주 세워 비탈을 만들고 통나무를 두 벽의 빗변 위에 걸쳐 놓는다. 비탈의 높은 끝은 덮개돌 아래로 들어가
// 왼쪽 받침돌 옆에 닿는다 (받침돌 꼭대기까지 흙을 쌓았다는 짐작과 같은 모습). 이 과정은 여러 짐작 가운데 하나다 (15절).
// 맞닿는 변의 길이, 조각과 자리의 크기, 완성 모습의 높이는 tests/papercraft/dolmen-table.test.ts 가 잰다.
//
// 이 파일에 적는 글은 조각 이름과 조립 표시뿐이다. 아이가 읽는 문장(차례 카드)은 명세의 texts 에서 받는다.
import {
  BODY_W, FONT_FAMILY, INK, INK_DIM, LEGEND_H, RULE, SPOT_DASH,
  fit, grain, mark, rect, render, spot, tab, text, textWidth,
  type Join, type Piece, type Plan, type Pt, type Seg,
} from '../net.ts';

// ── 크기 (mm) ──
/** 덮개돌: 윗면 CL × CW, 옆면 높이 CH */
export const CL = 112, CW = 72, CH = 12;
/** 받침돌: 두께 SW (좌우), 너비 SD (앞뒤), 높이 SH */
export const SW = 14, SD = 40, SH = 42;
/** 기둥 옆 탭의 폭, 윗면 탭의 깊이 */
export const TAB = 6, TOP_TAB = 6;
/** 통나무: 지름 LOG_D, 길이 LOG_L. 종이 폭은 둘레다. */
export const LOG_D = 16, LOG_L = 46, LOG_C = Math.PI * LOG_D, LOG_TAB = 5.5;
/** 흙 비탈 벽: 밑변 RW, 높이 RH (= SH, 받침돌 높이까지 쌓는다), 바닥판에 붙이는 발 RF. 두 벽 사이 RS (통나무 길이보다 짧다). */
export const RW = 62, RH = SH, RF = 9, RS = 36;
/** 바닥판 */
export const BPW = 170, BPH = 88;

type Box = { x: number; y: number; w: number; h: number };
const cap: Box = { x: BPW - CL - 6, y: 9, w: CL, h: CW };
/** 덮개돌 왼쪽 끝에서 왼쪽 받침돌까지. 비탈이 덮개돌 옆면 밑으로 들어가도 옆면에 걸리지 않을 만큼 띄운다. */
export const SUPPORT_IN = 22;
const rampX1 = cap.x + SUPPORT_IN - 1;
/**
 * 바닥판 위의 자리. 바닥판 왼쪽 위(뒤)에서 잰 값이다.
 * 받침돌 둘은 덮개돌 자리 안에, 흙 비탈의 두 발은 왼쪽 받침돌 바로 왼쪽에 놓인다. 발은 벽 밖으로 접힌다.
 */
export const FOOT = {
  cap,
  left: { x: cap.x + SUPPORT_IN, y: cap.y + (CW - SD) / 2, w: SW, h: SD },
  right: { x: cap.x + CL - SUPPORT_IN - SW, y: cap.y + (CW - SD) / 2, w: SW, h: SD },
  rampBack: { x: rampX1 - RW, y: cap.y + CW / 2 - RS / 2 - RF, w: RW, h: RF },
  rampFront: { x: rampX1 - RW, y: cap.y + CW / 2 + RS / 2, w: RW, h: RF },
};

const GAP = 4;
const seg = (a: Pt, b: Pt): Seg => [a, b];

// 조립 표시 글자. 두 쪽에 걸쳐 이어 쓴다: 한 글자는 한 곳의 붙임만 뜻한다.
const MARKS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카'];

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
    { what: '덮개돌 왼 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([ox, y0], [x0, y0]), b: seg([x0, oy], [x0, y0]), depth: CH, room: CL, mark: marks[0] },
    { what: '덮개돌 왼 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([ox, y1], [x0, y1]), b: seg([x0, y1], [x0, y1 + CH]), depth: CH, room: CL, mark: marks[1] },
    { what: '덮개돌 오른 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([x1, y0], [x1 + CH, y0]), b: seg([x1, oy], [x1, y0]), depth: CH, room: CL, mark: marks[2] },
    { what: '덮개돌 오른 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([x1, y1], [x1 + CH, y1]), b: seg([x1, y1], [x1, y1 + CH]), depth: CH, room: CL, mark: marks[3] },
  ];
  const art: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const yy = y0 + (CW * i) / 6;
    art.push(grain(`M${x0 + 10},${yy} q${CL * 0.22},${i % 2 ? -2.6 : 2.6} ${CL * 0.44},0 t${CL * 0.36},0`));
  }
  art.push(text(x0 + CL / 2, y0 + CW / 2 - 3, '덮개돌', { size: 6, weight: 700, halo: true }));
  art.push(text(x0 + CL / 2, y0 + CW / 2 + 4.5, '윗면', { size: 3.6, weight: 500, fill: INK_DIM, halo: true }));
  for (const [x, y] of [[x0 + CL / 2, oy + CH / 2], [x0 + CL / 2, y1 + CH / 2]] as const) art.push(text(x, y, '옆면', { size: 3.2, weight: 500, fill: INK_DIM }));
  // 탭에는 진한 글자, 붙일 자리(완성하면 겉으로 보이는 면)에는 작고 옅은 글자
  const m = (tx: number, ty: number, gx: number, gy: number, i: number) => art.push(mark(tx, ty, marks[i]), mark(gx, gy, marks[i], 'target'));
  m(ox + CH / 2, oy + CH / 2 + 1, x0 + 3.5, oy + CH / 2, 0);
  m(ox + CH / 2, y1 + CH / 2 - 1, x0 + 3.5, y1 + CH / 2, 1);
  m(x1 + CH / 2, oy + CH / 2 + 1, x1 - 3.5, oy + CH / 2, 2);
  m(x1 + CH / 2, y1 + CH / 2 - 1, x1 - 3.5, y1 + CH / 2, 3);
  return { name: '덮개돌', faces, art, joins };
}

// ── 받침돌: 네 면을 둘러 판돌을 만든다. 밑면은 열어 둔다. ──
// 위에서부터: 윗면 탭(TOP_TAB) · 윗면(d × w, 둘째 면 위) · 네 면의 띠(w, d, w, d, 높이 h) · 오른쪽 끝 탭(TAB)
// 윗면을 넓은 면(둘째 면)에 달면 조각이 낮아져 한 쪽에 받침돌 둘이 위아래로 들어간다.
function support(ox: number, oy: number, no: number, marks: [string, string]): Piece {
  const w = SW, d = SD, h = SH;
  const yT = oy + TOP_TAB, yB = yT + w;
  const xs = [ox, ox + w, ox + w + d, ox + 2 * w + d, ox + 2 * w + 2 * d];
  const xe = xs[4];
  const faces = [
    ...[0, 1, 2, 3].map((i) => ({ pts: rect(xs[i], yB, xs[i + 1] - xs[i], h) })),
    { pts: rect(xs[1], yT, d, w) },             // 윗면
    tab([xs[1], yT], [xs[2], yT], TOP_TAB),     // 윗면 → 넷째 면 안쪽
    tab([xe, yB], [xe, yB + h], TAB),           // 넷째 면 → 첫째 면 안쪽
  ];
  const name = `받침돌 ${no}`;
  const joins: Join[] = [
    { what: `${name} 옆 탭 → 첫째 면`, kind: 'glue', a: seg([xe, yB], [xe, yB + h]), b: seg([ox, yB], [ox, yB + h]), depth: TAB, room: w, mark: marks[0] },
    { what: `${name} 윗면 탭 → 넷째 면 윗변`, kind: 'glue', a: seg([xs[1], yT], [xs[2], yT]), b: seg([xs[3], yB], [xs[4], yB]), depth: TOP_TAB, room: h, mark: marks[1] },
    { what: `${name} 윗면 왼변 = 첫째 면 윗변`, kind: 'meet', a: seg([xs[1], yT], [xs[1], yB]), b: seg([xs[0], yB], [xs[1], yB]) },
    { what: `${name} 윗면 오른변 = 셋째 면 윗변`, kind: 'meet', a: seg([xs[2], yT], [xs[2], yB]), b: seg([xs[2], yB], [xs[3], yB]) },
  ];
  const art: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const yy = yB + (h * i) / 5;
    art.push(grain(`M${ox + 3},${yy} q${(xe - ox) * 0.25},${i % 2 ? -2 : 2} ${(xe - ox) * 0.5},0 t${(xe - ox) * 0.5 - 6},0`));
  }
  art.push(text(xs[1] + d / 2, yB + h / 2, '받침돌', { size: 4.6, weight: 700, halo: true }));
  art.push(text(xs[1] + d / 2, yT + w / 2, '윗면', { size: 3.2, weight: 500, fill: INK_DIM }));
  art.push(mark(xe + TAB / 2, yB + h / 2, marks[0]), mark(ox + 3.2, yB + h - 5, marks[0], 'target'));
  art.push(mark((xs[1] + xs[2]) / 2, oy + TOP_TAB / 2 + 0.4, marks[1]), mark((xs[3] + xs[4]) / 2, yB + 3.5, marks[1], 'target'));
  return { name, faces, art, joins };
}

// ── 바닥판: 접지 않는다. 덮개돌 자리의 네 귀와 받침돌·흙 비탈 발의 자리를 점으로 찍는다. ──
function baseplate(ox: number, oy: number): Piece {
  const art: string[] = [];
  const at = (f: Box) => [ox + f.x, oy + f.y, f.w, f.h] as const;
  art.push(text(ox + 4, oy + 4.6, '바닥판', { size: 4.2, weight: 700, anchor: 'start' }));
  // 덮개돌 자리는 네 귀만 찍는다. 흙 비탈의 높은 끝이 덮개돌 밑으로 들어가므로 테두리를 다 그리면 비탈 발 자리와 겹친다.
  const [cx, cy, cw, chh] = at(FOOT.cap);
  const k = 7;
  const dots = (d: string) => `<path d="${d}" fill="none" stroke="${INK_DIM}" stroke-width="0.45" stroke-linecap="round" stroke-dasharray="${SPOT_DASH}"/>`;
  art.push(dots(`M${cx},${cy + k} V${cy} H${cx + k} M${cx + cw - k},${cy} H${cx + cw} V${cy + k} M${cx + cw},${cy + chh - k} V${cy + chh} H${cx + cw - k} M${cx + k},${cy + chh} H${cx} V${cy + chh - k}`));
  art.push(text(cx + cw / 2, cy + chh - 3.6, '덮개돌 자리', { size: 3.4, weight: 500, fill: INK_DIM }));
  for (const f of [FOOT.left, FOOT.right]) {
    const [x, y, w, h] = at(f);
    art.push(spot(x, y, w, h));
    art.push(text(x + w / 2, y + h / 2, '받침돌', { size: 3.2, weight: 600, rotate: -90 }));
  }
  for (const f of [FOOT.rampBack, FOOT.rampFront]) {
    const [x, y, w, h] = at(f);
    art.push(spot(x, y, w, h));
    art.push(text(x + w / 2, y + h / 2, '발', { size: 3, weight: 500, fill: INK_DIM }));
  }
  const rb = at(FOOT.rampBack), rf = at(FOOT.rampFront);
  art.push(text(rb[0] + RW / 2, (rb[1] + rb[3] + rf[1]) / 2, '흙 비탈 자리', { size: 3.4, weight: 600 }));
  // 앞쪽: 완성 모습 그림에서 보는 쪽
  art.push(text(ox + BPW / 2 - 20, oy + BPH - 3.4, '앞', { size: 3.4, weight: 700 }));
  return { name: '바닥판', faces: [{ pts: rect(ox, oy, BPW, BPH) }], art, joins: [] };
}

// ── 통나무: 둥글게 말아 오른쪽 탭을 왼쪽 끝 안쪽에 붙인다. ──
function log(ox: number, oy: number, n: number, m: string): Piece {
  const art: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = ox + (LOG_C * i) / 4;
    art.push(grain(`M${x},${oy + 4} L${x},${oy + LOG_L - 4}`));
  }
  art.push(text(ox + LOG_C / 2, oy + LOG_L / 2, '통나무', { size: 3.6, weight: 700, halo: true }));
  art.push(mark(ox + LOG_C + LOG_TAB / 2, oy + LOG_L / 2, m), mark(ox + 3.2, oy + 6, m, 'target'));
  return {
    name: `통나무 ${n}`,
    faces: [{ pts: rect(ox, oy, LOG_C, LOG_L) }, tab([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L], LOG_TAB)],
    art,
    joins: [{ what: `통나무 ${n} 탭 → 왼쪽 끝`, kind: 'glue', a: seg([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L]), b: seg([ox, oy], [ox, oy + LOG_L]), depth: LOG_TAB, room: LOG_C, mark: m }],
  };
}

// ── 흙 비탈 벽: 세워 두는 직각삼각형. 밑의 발을 벽 밖으로 접어 바닥판의 발 자리에 붙인다. ──
// 두 벽은 서로 거울 모양이다: 글이 찍힌 면을 안쪽으로 마주 세우면 둘 다 높은 끝이 받침돌 쪽을 향한다.
function rampWall(ox: number, oy: number, no: number, highOnRight: boolean): Piece {
  const yb = oy + RH;
  const hi = highOnRight ? ox + RW : ox, lo = highOnRight ? ox : ox + RW;
  const tri = { pts: highOnRight ? [[hi, oy], [hi, yb], [lo, yb]] as Pt[] : [[hi, oy], [lo, yb], [hi, yb]] as Pt[] };
  const foot = tab([ox + RW, yb], [ox, yb], RF);
  const art: string[] = [];
  for (const k of [0.62, 0.86]) {
    const yy = oy + RH * k;
    const w = RW * k;
    art.push(grain(`M${hi + (highOnRight ? -2 : 2)},${yy} L${highOnRight ? hi - w + 3 : hi + w - 3},${yy}`));
  }
  const side = highOnRight ? -1 : 1;
  art.push(text(hi + side * RW * 0.3, oy + RH * 0.74, '흙 비탈', { size: 3.6, weight: 700, halo: true }));
  art.push(text(hi + side * 2, oy + RH * 0.42, '받침돌 쪽', { size: 2.9, weight: 500, fill: INK_DIM, anchor: highOnRight ? 'end' : 'start', halo: true }));
  art.push(text(ox + RW / 2, yb + RF / 2, '발', { size: 3.2, weight: 600, halo: true }));
  // 발은 바닥판의 발 자리에 붙인다 (자리는 바닥판에 점으로 찍혀 있다)
  const to = no === 1 ? FOOT.rampBack : FOOT.rampFront;
  return {
    name: `흙 비탈 ${no}`,
    faces: [tri, foot],
    art,
    joins: [{ what: `흙 비탈 ${no} 발 → 바닥판 발 자리`, kind: 'seat', a: seg([ox + RW, yb], [ox, yb]), b: seg([to.x, to.y], [to.x + to.w, to.y]), depth: RF, room: to.h }],
  };
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
function sheet1(): Plan {
  const capW = CL + 2 * CH, capH = CW + 2 * CH;
  const capY = LEGEND_H + 3;
  const sW = 2 * SW + 2 * SD + TAB, sH = TOP_TAB + SW + SH;
  const s1Y = capY + capH + GAP + 2;
  const sx = (BODY_W - sW) / 2;
  const pieces = [
    capstone((BODY_W - capW) / 2, capY, MARKS.slice(0, 4)),
    support(sx, s1Y, 1, [MARKS[4], MARKS[5]]),
    support(sx, s1Y + sH + GAP + 2, 2, [MARKS[6], MARKS[7]]),
  ];
  return { title: '종이 고인돌 · 돌 조각', sub: '덮개돌 1 · 받침돌 2', pieces, art: [], joins: [] };
}

function sheet2(texts: string[]): Plan {
  const pieces: Piece[] = [];
  const bpX = (BODY_W - BPW) / 2, bpY = LEGEND_H + 3;
  pieces.push(baseplate(bpX, bpY));
  const logY = bpY + BPH + GAP + 1;
  const logW = LOG_C + LOG_TAB;
  const logGap = 8;
  const logX = (BODY_W - 3 * logW - 2 * logGap) / 2;
  [0, 1, 2].forEach((i) => pieces.push(log(logX + i * (logW + logGap), logY, i + 1, MARKS[8 + i])));
  const rampY = logY + LOG_L + GAP + 1;
  const back = rampWall(8, rampY, 1, true), front = rampWall(BODY_W - 8 - RW, rampY, 2, false);
  // 발 자리는 바닥판 위의 자리다: 바닥판이 놓인 곳만큼 옮긴다
  for (const p of [back, front]) p.joins = p.joins.map((j) => ({ ...j, b: [[j.b[0][0] + bpX, j.b[0][1] + bpY], [j.b[1][0] + bpX, j.b[1][1] + bpY]] as Seg }));
  pieces.push(back, front);
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
  // 흙 비탈 벽의 높은 변: 받침돌 꼭대기까지 쌓는다 (plans() 가 받침돌의 변과 짝지어 시험에 넘긴다)
  const joins: Join[] = [
    { what: '흙 비탈 1 높이 = 받침돌 높이', kind: 'meet', a: seg([8 + RW, rampY], [8 + RW, rampY + RH]), b: seg([0, 0], [0, 0]) },
    { what: '흙 비탈 2 높이 = 받침돌 높이', kind: 'meet', a: seg([BODY_W - 8 - RW, rampY], [BODY_W - 8 - RW, rampY + RH]), b: seg([0, 0], [0, 0]) },
  ];
  const sub = n > 0 ? `바닥판 1 · 통나무 3 · 흙 비탈 2 · 차례 카드 ${n}` : '바닥판 1 · 통나무 3 · 흙 비탈 2';
  return { title: '종이 고인돌 · 바닥판과 통나무', sub, pieces, art: [], joins };
}

/** 쪽마다의 설계. 시험이 조각의 변과 자리를 잰다. */
export function plans(texts: string[]): Plan[] {
  const one = sheet1(), two = sheet2(texts);
  // 비탈의 높은 변과 짝지을 받침돌의 세로 변 (1쪽 받침돌 1 첫째 면의 왼변)
  const supportEdge = one.pieces[1].joins[0].b;
  two.joins = two.joins.map((j) => ({ ...j, b: supportEdge }));
  return [one, two];
}

/** 모듈의 기본 내보내기 (docs/CONTRACT.md 7절) */
export function sheets(texts: string[]): { title: string; sub: string; svg: string }[] {
  return plans(texts).map((p, i) => ({ title: p.title, sub: p.sub, svg: render(p, i + 1) }));
}

// ───────────────────────────── 완성 모습 ─────────────────────────────

/** 완성 모습에서 통나무가 놓인 곳: 비탈 빗변 위의 비율. 덮개돌 옆면(X = 덮개돌 왼끝, 높이 SH - CH 위)에 닿지 않는 데까지만 올린다. */
export const LOG_ON_SLOPE = [0.15, 0.37, 0.59];

export interface PreviewLabel { text: string; x: number; y: number; size: number; anchor: 'start' | 'middle' | 'end'; weight: number; dim?: boolean; box: [number, number, number, number] }
export interface PreviewLayout {
  viewBox: [number, number, number, number];
  /** 바닥판의 윤곽(땅). 이름표가 이 선에 걸리면 안 된다. */
  ground: Pt[];
  /** 그린 상자 (바닥판 좌표, mm). z0~z1 이 높이다. */
  boxes: { name: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[];
  /** 통나무 중심 (바닥판 좌표의 X, 높이 Z) */
  logs: { x: number; z: number }[];
  labels: PreviewLabel[];
  leaders: [Pt, Pt][];
}

/**
 * 완성 모습의 배치 (빗각 투영). 모델 좌표는 바닥판의 것이다: X 좌우(0~BPW), Y 깊이(0 = 뒤 … BPH = 앞), Z 높이.
 * 덮개돌은 받침돌 위에 '얹힌' 상자라 옆면이 받침돌 꼭대기에서 CH 만큼 내려와 받침돌을 덮는다 (전개도와 같다).
 */
export function previewLayout(): PreviewLayout {
  const OX = 6, OY = 82;
  const P = (X: number, Y: number, Z: number): Pt => [OX + X + 0.45 * (BPH - Y), OY - Z - 0.3 * (BPH - Y)];
  const f = FOOT;
  const boxes = [
    { name: '받침돌', x0: f.left.x, x1: f.left.x + SW, y0: f.left.y, y1: f.left.y + SD, z0: 0, z1: SH },
    { name: '받침돌', x0: f.right.x, x1: f.right.x + SW, y0: f.right.y, y1: f.right.y + SD, z0: 0, z1: SH },
    { name: '덮개돌', x0: f.cap.x, x1: f.cap.x + CL, y0: f.cap.y, y1: f.cap.y + CW, z0: SH - CH, z1: SH },
  ];
  const hyp = Math.hypot(RW, RH);
  const r = LOG_D / 2;
  const logs = LOG_ON_SLOPE.map((k) => ({ x: f.rampBack.x + RW * k - (RH / hyp) * r, z: RH * k + (RW / hyp) * r }));
  const ground = [P(0, BPH, 0), P(BPW, BPH, 0), P(BPW, 0, 0), P(0, 0, 0)];

  const labels: PreviewLabel[] = [];
  const leaders: [Pt, Pt][] = [];
  const label = (s: string, x: number, y: number, o: { size?: number; anchor?: PreviewLabel['anchor']; weight?: number; dim?: boolean } = {}) => {
    const size = o.size ?? 5, anchor = o.anchor ?? 'start', w = textWidth(s, size);
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    const l: PreviewLabel = { text: s, x, y, size, anchor, weight: o.weight ?? 700, dim: o.dim, box: [x0, y - size * 0.6, x0 + w, y + size * 0.6] };
    labels.push(l);
    return l;
  };
  const lead = (from: Pt, to: Pt) => leaders.push([from, to]);

  // 덮개돌: 윗면에서 위로
  const capTop = P(f.cap.x + CL * 0.7, f.cap.y + CW * 0.45, SH);
  const lc = label('덮개돌', capTop[0] + 16, OY - SH - 0.3 * BPH - 7);
  lead(capTop, [lc.box[0] - 1, lc.y]);
  // 받침돌: 바닥판 아래 한가운데에서 두 받침돌의 앞면으로
  const sl = P(f.left.x + SW / 2, f.left.y + SD, (SH - CH) * 0.45), sr = P(f.right.x + SW / 2, f.right.y + SD, (SH - CH) * 0.45);
  const ls = label('받침돌', (sl[0] + sr[0]) / 2, OY + 8, { anchor: 'middle' });
  lead(sl, [ls.box[0] - 1, ls.y - 1]);
  lead(sr, [ls.box[2] + 1, ls.y - 1]);
  // 바닥판: 오른쪽 아래
  const bp = P(BPW - 14, BPH - 10, 0);
  const lb = label('바닥판', P(BPW, BPH, 0)[0] + 10, OY + 3);
  lead(bp, [lb.box[0] - 1, lb.y]);
  // 흙 비탈과 통나무: 왼쪽 아래. 이것은 여러 짐작 가운데 하나라고 바로 밑에 적는다 (15절).
  const lr = label('흙 비탈과 통나무', OX + 2, OY + 8);
  label('여러 짐작 가운데 하나', OX + 2, lr.y + 6.4, { size: 4.4, weight: 600, dim: true });
  const wallPt = P(f.rampFront.x + RW * 0.55, f.rampFront.y, RH * 0.55 * 0.3);
  lead(wallPt, [lr.box[2] - 3, lr.box[1] - 0.6]);
  const low = logs[0];
  const logPt = P(low.x, f.rampFront.y + RF, low.z - r * 0.55);
  lead(logPt, [lr.box[0] + 6, lr.box[1] - 0.6]);

  const xs = [...ground, ...labels.flatMap((l) => [[l.box[0], l.box[1]], [l.box[2], l.box[3]]] as Pt[])];
  const minX = Math.min(...xs.map((p) => p[0])) - 2, maxX = Math.max(...xs.map((p) => p[0])) + 2;
  const minY = Math.min(...xs.map((p) => p[1]), P(f.cap.x, f.cap.y, SH)[1]) - 2, maxY = Math.max(...xs.map((p) => p[1])) + 2;
  return { viewBox: [minX, minY, maxX - minX, maxY - minY], ground, boxes, logs, labels, leaders };
}

/** 완성 모습 SVG. 만드는 법 쪽에 싣는다 (7절의 선택 내보내기 preview). */
export function preview(): string {
  const L = previewLayout();
  const OX = 6, OY = 82;
  const P = (X: number, Y: number, Z: number): Pt => [OX + X + 0.45 * (BPH - Y), OY - Z - 0.3 * (BPH - Y)];
  const n2 = (v: number) => Math.round(v * 100) / 100;
  const pts = (ps: readonly Pt[]) => ps.map((p) => `${n2(p[0])},${n2(p[1])}`).join(' ');
  const face = (ps: Pt[], fill: string, sw = 0.45) => `<polygon points="${pts(ps)}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const box = (b: PreviewLayout['boxes'][number], strong = false) => {
    const sw = strong ? 0.6 : 0.45;
    const { x0, x1, y0, y1, z0, z1 } = b;
    return [
      face([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], RULE, sw),
      face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], '#ffffff', sw),
      face([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], '#e6e6e6', sw),
    ].join('');
  };
  const f = FOOT;
  const g: string[] = [];
  // 바닥판: 윗면과 앞쪽 두께
  const T = 1.4;
  g.push(face([P(0, BPH, 0), P(BPW, BPH, 0), P(BPW, BPH, -T), P(0, BPH, -T)], '#e6e6e6', 0.4));
  g.push(face([P(BPW, BPH, 0), P(BPW, 0, 0), P(BPW, 0, -T), P(BPW, BPH, -T)], RULE, 0.4));
  g.push(face(L.ground as Pt[], '#ffffff', 0.4));
  // 흙 비탈 벽 둘 (뒤 벽부터)
  for (const y of [f.rampBack.y + RF, f.rampFront.y]) {
    const x0 = f.rampBack.x, x1 = x0 + RW;
    g.push(face([P(x0, y, 0), P(x1, y, 0), P(x1, y, RH)], '#e6e6e6'));
  }
  // 통나무: 두 벽에 걸친 원기둥. 앞 끝은 정원으로 보인다 (빗각 투영은 앞면을 그대로 그린다).
  const r = LOG_D / 2, y0 = f.cap.y + CW / 2 - LOG_L / 2, y1 = y0 + LOG_L;
  for (const c of L.logs) {
    const b = P(c.x, y0, c.z), fr = P(c.x, y1, c.z);
    const v = [b[0] - fr[0], b[1] - fr[1]], len = Math.hypot(v[0], v[1]);
    const nn = [-v[1] / len * r, v[0] / len * r];
    g.push(`<circle cx="${n2(b[0])}" cy="${n2(b[1])}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="0.4"/>`);
    g.push(`<polygon points="${pts([[b[0] + nn[0], b[1] + nn[1]], [fr[0] + nn[0], fr[1] + nn[1]], [fr[0] - nn[0], fr[1] - nn[1]], [b[0] - nn[0], b[1] - nn[1]]])}" fill="#ffffff" stroke="none"/>`);
    g.push(`<line x1="${n2(b[0] + nn[0])}" y1="${n2(b[1] + nn[1])}" x2="${n2(fr[0] + nn[0])}" y2="${n2(fr[1] + nn[1])}" stroke="${INK}" stroke-width="0.4"/>`);
    g.push(`<line x1="${n2(b[0] - nn[0])}" y1="${n2(b[1] - nn[1])}" x2="${n2(fr[0] - nn[0])}" y2="${n2(fr[1] - nn[1])}" stroke="${INK}" stroke-width="0.4"/>`);
    g.push(`<circle cx="${n2(fr[0])}" cy="${n2(fr[1])}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="0.45"/><circle cx="${n2(fr[0])}" cy="${n2(fr[1])}" r="${r * 0.45}" fill="none" stroke="${RULE}" stroke-width="0.3"/>`);
  }
  // 받침돌 둘, 그 위에 덮개돌 (덮개돌의 옆면이 받침돌 윗부분을 덮는다)
  for (const b of L.boxes) g.push(box(b, b.name === '덮개돌'));
  for (const [a, b] of L.leaders) g.push(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" stroke="${INK_DIM}" stroke-width="0.3"/><circle cx="${n2(a[0])}" cy="${n2(a[1])}" r="0.8" fill="${INK}"/>`);
  for (const l of L.labels) g.push(text(l.x, l.y, l.text, { size: l.size, weight: l.weight, anchor: l.anchor, fill: l.dim ? INK_DIM : INK, halo: true }));
  const vb = L.viewBox.map(n2).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="완성한 종이 고인돌: 받침돌 두 개 위에 덮개돌을 얹은 모습. 왼쪽에는 통나무를 얹은 흙 비탈이 있다." style="display:block;width:100%;height:100%"><g font-family="${FONT_FAMILY}">${g.join('')}</g></svg>`;
}

/** 시험이 쓰는 값: 비탈 벽이 놓이는 X 범위 */
export const RAMP_X: [number, number] = [FOOT.rampBack.x, FOOT.rampBack.x + RW];

export default { sheets, preview };
