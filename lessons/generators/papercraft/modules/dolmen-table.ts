// 종이 고인돌 전개도 (docs/CONTRACT.md 7절의 전개도 모듈)
//
// 몸으로 해 보는 모형이다 (R11). 모둠이 차례 카드 네 장을 놓은 차례대로 조각을 움직인다:
// 받침돌을 세우고, 흙 비탈을 받침돌에 대고, 통나무를 깔아 덮개돌을 끌어 올리고, 흙 비탈을 치운다.
// 그래서 어느 조각도 바닥판에 붙이지 않는다. 바닥판에는 받침돌 둘과 흙 비탈이 놓일 자리만 찍는다.
//
// 조각: 덮개돌(닫힌 납작한 상자) 1 · 받침돌(밑이 열린 판돌) 2 · 통나무(말아 붙인 종이) 3 — 1쪽
//       바닥판 1 · 흙 비탈(한 조각으로 서는 쐐기) 1 · 차례 카드(명세의 texts 개수) — 2쪽
// 만드는 법 쪽(3쪽)은 페이지가 명세의 steps·try_it·reflect 로 만들고, 그림 둘은 이 파일의 preview() 가 그린다.
//
// 맞춘 크기 (아래 값으로 접은 크기를 tests/papercraft/dolmen-table.test.ts 가 잰다):
// - 흙 비탈의 높은 쪽 높이 = 받침돌 높이. 덮개돌이 비탈 꼭대기에서 받침돌 위로 그대로 미끄러져 넘어간다.
// - 흙 비탈의 윗면 너비(RW) ≥ 덮개돌 너비(CW). 덮개돌이 비탈 위에서 옆으로 걸치지 않는다.
// - 덮개돌은 밑면까지 닫힌 상자다. 밑면이 평평해야 비탈과 통나무 위에서도, 받침돌 위에서도 같은 면으로 얹힌다.
// - 바닥판에서 흙 비탈 자리의 높은 끝은 왼쪽 받침돌 자리에 맞닿는다.
// 흙 비탈로 끌어 올렸다는 것은 여러 짐작 가운데 하나다 (15절). 그림에 그렇게 적는다.
//
// 이 파일에 적는 글은 조각 이름, 조립 표시, 그림의 이름표뿐이다. 아이가 읽는 문장(차례 카드)은 명세의 texts 에서 받는다.
import {
  BODY_H, BODY_W, FONT_FAMILY, INK, INK_DIM, LEGEND_H, RULE, SPOT_DASH,
  fit, grain, mark, rect, render, spot, tab, text, textWidth,
  type Join, type Piece, type Plan, type Pt, type Seg,
} from '../net.ts';

// ── 크기 (mm) ──
/** 덮개돌: 윗면 CL × CW, 옆면 높이 CH. 밑면도 CL × CW 로 닫는다. 맨 위 닫는 탭의 깊이 CTAB */
export const CL = 96, CW = 60, CH = 10, CTAB = 6;
/** 받침돌: 두께 SW (좌우), 너비 SD (앞뒤), 높이 SH */
export const SW = 12, SD = 30, SH = 36;
/** 받침돌 옆 탭의 폭, 윗면 탭의 깊이 */
export const TAB = 6, TOP_TAB = 6;
/** 통나무: 지름 LOG_D, 길이 LOG_L. 종이 폭은 둘레다. */
export const LOG_D = 14, LOG_L = 50, LOG_C = Math.PI * LOG_D, LOG_TAB = 5.5;
/** 흙 비탈(쐐기): 바닥 길이 RL, 너비 RW, 높은 쪽 높이 RH (= SH). 빗면의 길이 RS, 옆면 세모의 높이(빗면에서 잰) RT */
export const RL = 78, RW = 62, RH = SH;
export const RS = Math.hypot(RL, RH);
export const RT = (RL * RH) / RS;
/** 바닥판 둘레의 여백과, 다 세웠을 때 덮개돌이 받침돌 밖으로 나오는 길이 */
const M = 5, OVER = 12;
/** 바닥판: 흙 비탈 자리 + 덮개돌이 놓이는 자리 */
export const BPW = M + RL + CL - OVER + M, BPH = RW + 2 * M;

type Box = { x: number; y: number; w: number; h: number };
/** 다 세운 덮개돌이 놓이는 곳 (바닥판 위에는 찍지 않는다. 그림과 시험이 쓴다) */
export const CAP: Box = { x: M + RL - OVER, y: (BPH - CW) / 2, w: CL, h: CW };
/**
 * 바닥판 위의 자리. 바닥판 왼쪽 위(뒤)에서 잰 값이다.
 * 흙 비탈은 왼쪽에, 높은 끝이 왼쪽 받침돌에 닿게 놓인다. 받침돌 둘은 덮개돌 양 끝에서 OVER 만큼 들어와 선다.
 */
export const FOOT = {
  ramp: { x: M, y: M, w: RL, h: RW },
  left: { x: M + RL, y: (BPH - SD) / 2, w: SW, h: SD },
  right: { x: CAP.x + CL - OVER - SW, y: (BPH - SD) / 2, w: SW, h: SD },
};

const GAP = 4;
const seg = (a: Pt, b: Pt): Seg => [a, b];

// 조립 표시 글자. 두 쪽에 걸쳐 이어 쓴다: 한 글자는 한 곳의 붙임만 뜻한다.
const MARKS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

// ── 덮개돌: 닫힌 납작한 상자 ──
// 위에서부터: 닫는 탭 · 뒤 옆면 · 윗면(양옆에 왼·오른 옆면) · 앞 옆면 · 밑면.
// 왼·오른 옆면 끝의 탭 넷을 앞·뒤 옆면 안쪽에 붙여 상자를 만들고, 마지막에 닫는 탭을 밑면 안쪽에 붙인다.
function capstone(ox: number, oy: number, marks: string[]): Piece {
  const x0 = ox + CH, x1 = x0 + CL;
  const yb = oy + CTAB, y0 = yb + CH, y1 = y0 + CW, yf = y1 + CH, ye = yf + CW;
  const faces = [
    { pts: rect(x0, y0, CL, CW) },          // 윗면
    { pts: rect(x0, yb, CL, CH) },          // 뒤 옆면
    { pts: rect(x0, y1, CL, CH) },          // 앞 옆면
    { pts: rect(x0, yf, CL, CW) },          // 밑면
    { pts: rect(ox, y0, CH, CW) },          // 왼 옆면
    { pts: rect(x1, y0, CH, CW) },          // 오른 옆면
    tab([ox, y0], [x0, y0], CH),            // 왼 옆면 → 뒤 옆면
    tab([x0, y1], [ox, y1], CH),            // 왼 옆면 → 앞 옆면
    tab([x1, y0], [x1 + CH, y0], CH),       // 오른 옆면 → 뒤 옆면
    tab([x1 + CH, y1], [x1, y1], CH),       // 오른 옆면 → 앞 옆면
    tab([x0, yb], [x1, yb], CTAB),          // 뒤 옆면 → 밑면 (닫는 탭)
  ];
  const joins: Join[] = [
    { what: '덮개돌 왼 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([ox, y0], [x0, y0]), b: seg([x0, yb], [x0, y0]), depth: CH, room: CL, mark: marks[0] },
    { what: '덮개돌 왼 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([ox, y1], [x0, y1]), b: seg([x0, y1], [x0, yf]), depth: CH, room: CL, mark: marks[1] },
    { what: '덮개돌 오른 옆면 탭 → 뒤 옆면 끝', kind: 'glue', a: seg([x1, y0], [x1 + CH, y0]), b: seg([x1, yb], [x1, y0]), depth: CH, room: CL, mark: marks[2] },
    { what: '덮개돌 오른 옆면 탭 → 앞 옆면 끝', kind: 'glue', a: seg([x1, y1], [x1 + CH, y1]), b: seg([x1, y1], [x1, yf]), depth: CH, room: CL, mark: marks[3] },
    { what: '덮개돌 닫는 탭 → 밑면 끝', kind: 'glue', a: seg([x0, yb], [x1, yb]), b: seg([x0, ye], [x1, ye]), depth: CTAB, room: CW, mark: marks[4] },
    // 접으면 맞닿는 변: 밑면의 옆 변 = 왼·오른 옆면의 아래 변
    { what: '덮개돌 밑면 왼변 = 왼 옆면 바깥 변', kind: 'meet', a: seg([x0, yf], [x0, ye]), b: seg([ox, y0], [ox, y1]) },
  ];
  const art: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const yy = y0 + (CW * i) / 5;
    art.push(grain(`M${x0 + 8},${yy} q${CL * 0.22},${i % 2 ? -2.4 : 2.4} ${CL * 0.42},0 t${CL * 0.4},0`));
  }
  art.push(text(x0 + CL / 2, y0 + CW / 2 - 3, '덮개돌', { size: 6, weight: 700, halo: true }));
  art.push(text(x0 + CL / 2, y0 + CW / 2 + 4.5, '윗면', { size: 3.4, weight: 500, fill: INK_DIM, halo: true }));
  art.push(text(x0 + CL / 2, yf + CW / 2, '밑면', { size: 3.4, weight: 500, fill: INK_DIM }));
  for (const [x, y] of [[x0 + CL / 2, yb + CH / 2], [x0 + CL / 2, y1 + CH / 2]] as const) art.push(text(x, y, '옆면', { size: 3.2, weight: 500, fill: INK_DIM }));
  // 탭에는 진한 글자, 붙일 자리(완성하면 겉으로 보이는 면)에는 옅은 글자
  const m = (tx: number, ty: number, gx: number, gy: number, i: number) => art.push(mark(tx, ty, marks[i]), mark(gx, gy, marks[i], 'target'));
  m(ox + CH / 2, yb + CH / 2 + 1, x0 + 3.6, yb + CH / 2, 0);
  m(ox + CH / 2, y1 + CH / 2 - 1, x0 + 3.6, y1 + CH / 2, 1);
  m(x1 + CH / 2, yb + CH / 2 + 1, x1 - 3.6, yb + CH / 2, 2);
  m(x1 + CH / 2, y1 + CH / 2 - 1, x1 - 3.6, y1 + CH / 2, 3);
  m(x0 + CL / 2, oy + CTAB / 2 + 0.3, x0 + CL / 2, ye - 3.6, 4);
  return { name: '덮개돌', faces, art, joins };
}

// ── 받침돌: 네 면을 둘러 판돌을 만든다. 밑면은 열어 둔다. ──
// 위에서부터: 윗면 탭(TOP_TAB) · 윗면(d × w, 둘째 면 위) · 네 면의 띠(w, d, w, d, 높이 h) · 오른쪽 끝 탭(TAB)
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
  art.push(mark(xe + TAB / 2, yB + h / 2, marks[0]), mark(ox + 3.6, yB + h - 5, marks[0], 'target'));
  art.push(mark((xs[1] + xs[2]) / 2, oy + TOP_TAB / 2 + 0.3, marks[1]), mark((xs[3] + xs[4]) / 2, yB + 3.8, marks[1], 'target'));
  return { name, faces, art, joins };
}

// ── 통나무: 둥글게 말아 오른쪽 탭을 왼쪽 끝 안쪽에 붙인다. ──
function log(ox: number, oy: number, n: number, m: string): Piece {
  const art: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = ox + (LOG_C * i) / 4;
    art.push(grain(`M${x},${oy + 4} L${x},${oy + LOG_L - 4}`));
  }
  art.push(text(ox + LOG_C / 2, oy + LOG_L / 2, '통나무', { size: 3.6, weight: 700, halo: true }));
  art.push(mark(ox + LOG_C + LOG_TAB / 2, oy + LOG_L / 2, m), mark(ox + 3.6, oy + 6, m, 'target'));
  return {
    name: `통나무 ${n}`,
    faces: [{ pts: rect(ox, oy, LOG_C, LOG_L) }, tab([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L], LOG_TAB)],
    art,
    joins: [{ what: `통나무 ${n} 탭 → 왼쪽 끝`, kind: 'glue', a: seg([ox + LOG_C, oy], [ox + LOG_C, oy + LOG_L]), b: seg([ox, oy], [ox, oy + LOG_L]), depth: LOG_TAB, room: LOG_C, mark: m }],
  };
}

// ── 흙 비탈: 혼자 서는 쐐기 (밑은 열려 있다) ──
// 가운데 빗면(RW × RS)의 위 끝에 높은 쪽 면(RW × RH)이 달리고, 빗면 양옆에 직각삼각형 옆면이 달린다.
// 높은 쪽 면 양 끝의 탭을 옆면 안쪽에 붙인다. 옆면 세모의 꼭짓점(직각)은 빗면 위 끝에서 RH²/RS 만큼 내려온 곳에 있다.
/** 흙 비탈 전개도의 크기 [폭, 높이] */
export const RAMP_NET = [RW + 2 * RT, RH + RS] as const;
function ramp(ox: number, oy: number, marks: [string, string]): Piece {
  const sx0 = ox + RT, sx1 = sx0 + RW, ys = oy + RH, ye = ys + RS;
  const apexY = ys + (RH * RH) / RS;
  const faces = [
    { pts: rect(sx0, ys, RW, RS) },                                      // 빗면 (윗면)
    { pts: rect(sx0, oy, RW, RH) },                                      // 높은 쪽 면
    { pts: [[sx0, ys], [sx0, ye], [ox, apexY]] as Pt[] },                // 왼 옆면
    { pts: [[sx1, ys], [sx1 + RT, apexY], [sx1, ye]] as Pt[] },          // 오른 옆면
    tab([sx0, ys], [sx0, oy], TAB),                                      // 높은 쪽 면 → 왼 옆면
    tab([sx1, oy], [sx1, ys], TAB),                                      // 높은 쪽 면 → 오른 옆면
  ];
  const joins: Join[] = [
    { what: '흙 비탈 왼 탭 → 왼 옆면의 세운 변', kind: 'glue', a: seg([sx0, ys], [sx0, oy]), b: seg([sx0, ys], [ox, apexY]), depth: TAB, room: RL, mark: marks[0] },
    { what: '흙 비탈 오른 탭 → 오른 옆면의 세운 변', kind: 'glue', a: seg([sx1, oy], [sx1, ys]), b: seg([sx1, ys], [sx1 + RT, apexY]), depth: TAB, room: RL, mark: marks[1] },
  ];
  const art: string[] = [];
  // 흙의 결: 빗면을 가로지르는 옅은 물결
  for (let i = 1; i <= 5; i++) {
    const yy = ys + (RS * i) / 6;
    art.push(grain(`M${sx0 + 5},${yy} q${RW * 0.22},${i % 2 ? -1.8 : 1.8} ${RW * 0.44},0 t${RW * 0.44},0`));
  }
  art.push(text(sx0 + RW / 2, ys + RS / 2, '흙 비탈', { size: 6, weight: 700, halo: true }));
  art.push(text(sx0 + RW / 2, oy + RH / 2, '높은 쪽', { size: 3.6, weight: 600, fill: INK_DIM }));
  // 옆면 이름은 세모의 무게중심에
  const cy = (ys + ye + apexY) / 3;
  art.push(text((sx0 + sx0 + ox) / 3 + 1, cy, '옆면', { size: 3.2, weight: 500, fill: INK_DIM }));
  art.push(text((sx1 + sx1 + sx1 + RT) / 3 - 1, cy, '옆면', { size: 3.2, weight: 500, fill: INK_DIM }));
  // 탭 글자와, 옆면의 세운 변 곁(겉면)에 붙일 자리 글자
  const along = (k: number, a: Pt, b: Pt, off: number): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return [a[0] + dx * k + (dy / l) * off, a[1] + dy * k - (dx / l) * off];
  };
  const lt = along(0.5, [sx0, ys], [ox, apexY], 4.2), rt = along(0.5, [sx1, ys], [sx1 + RT, apexY], -4.2);
  art.push(mark(sx0 - TAB / 2, oy + RH / 2, marks[0]), mark(lt[0], lt[1], marks[0], 'target'));
  art.push(mark(sx1 + TAB / 2, oy + RH / 2, marks[1]), mark(rt[0], rt[1], marks[1], 'target'));
  return { name: '흙 비탈', faces, art, joins };
}

// ── 바닥판: 접지도 붙이지도 않는다. 받침돌 둘과 흙 비탈이 놓일 자리만 점으로 찍는다. ──
function baseplate(ox: number, oy: number): Piece {
  const art: string[] = [];
  const at = (f: Box) => [ox + f.x, oy + f.y, f.w, f.h] as const;
  const [rx, ry, rw, rh] = at(FOOT.ramp);
  art.push(spot(rx, ry, rw, rh));
  art.push(text(rx + rw / 2, ry + rh / 2, '흙 비탈 자리', { size: 3.8, weight: 600 }));
  // 흙 비탈의 높은 쪽 면(전개도에 '높은 쪽'이라 찍힌 면)이 받침돌 쪽에 온다
  art.push(text(rx + rw - 2.5, ry + rh / 2, '높은 쪽', { size: 3.2, weight: 500, fill: INK_DIM, anchor: 'end' }));
  for (const f of [FOOT.left, FOOT.right]) {
    const [x, y, w, h] = at(f);
    art.push(spot(x, y, w, h));
    art.push(text(x + w / 2, y + h / 2 - 2.4, '받침돌', { size: 3, weight: 600 }));
    art.push(text(x + w / 2, y + h / 2 + 2.4, '자리', { size: 3, weight: 500, fill: INK_DIM }));
  }
  art.push(text(ox + BPW - 4, oy + BPH - 5, '바닥판', { size: 4.2, weight: 700, anchor: 'end' }));
  return { name: '바닥판', faces: [{ pts: rect(ox, oy, BPW, BPH) }], art, joins: [] };
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
/** 카드 글이 들어갈 칸 [x, y, 폭, 높이]. 높이가 넉넉하면 위에 '차례' 칸, 낮으면 왼쪽에 둔다. */
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
/** 1쪽: 덮개돌 · 통나무 셋(오른쪽 단) · 받침돌 둘(아래 줄) */
function sheet1(): Plan {
  const capW = CL + 2 * CH, capH = CTAB + 2 * CH + 2 * CW;
  const logW = LOG_C + LOG_TAB, colGap = 8;
  const top = LEGEND_H + 3;
  const cx = (BODY_W - capW - colGap - logW) / 2;
  const pieces: Piece[] = [capstone(cx, top, MARKS.slice(0, 5))];
  [0, 1, 2].forEach((i) => pieces.push(log(cx + capW + colGap, top + i * (LOG_L + GAP), i + 1, MARKS[5 + i])));
  const sW = 2 * SW + 2 * SD + TAB, sGap = 6;
  const sy = Math.max(top + capH, top + 3 * LOG_L + 2 * GAP) + GAP + 1;
  const sx = (BODY_W - 2 * sW - sGap) / 2;
  pieces.push(support(sx, sy, 1, [MARKS[8], MARKS[9]]), support(sx + sW + sGap, sy, 2, [MARKS[10], MARKS[11]]));
  return { title: '종이 고인돌 · 돌과 통나무', sub: '덮개돌 1 · 받침돌 2 · 통나무 3', pieces, art: [], joins: [] };
}

/** 2쪽: 바닥판 · 흙 비탈 · 차례 카드 (넷까지는 아래 줄, 그보다 많으면 흙 비탈 오른쪽 단에도) */
function sheet2(texts: string[]): Plan {
  const pieces: Piece[] = [];
  const bpX = (BODY_W - BPW) / 2, bpY = LEGEND_H + 3;
  pieces.push(baseplate(bpX, bpY));
  const n = texts.length;
  const [rw, rh] = RAMP_NET;
  const rY = bpY + BPH + GAP + 1;
  const rX = n > 4 ? 2 : (BODY_W - rw) / 2;
  pieces.push(ramp(rX, rY, [MARKS[12], MARKS[13]]));

  // 카드 칸: 아래 줄(넷까지)과, 다섯째부터 흙 비탈 오른쪽 단
  const cg = 3;
  const rowY = rY + rh + GAP + 1;
  const row = Math.min(n, 4);
  const rowW = row ? Math.min(46, (BODY_W - 4 - (row - 1) * cg) / row) : 0;
  const rowH = Math.min(38, BODY_H - 0.5 - rowY);
  const slots: [number, number, number, number][] = [];
  const rx0 = (BODY_W - row * rowW - (row - 1) * cg) / 2;
  for (let k = 0; k < row; k++) slots.push([rx0 + k * (rowW + cg), rowY, rowW, rowH]);
  const col = n - row;
  if (col > 0) {
    const colX = rX + rw + GAP + 1, colW = BODY_W - 0.5 - colX;
    const colH = Math.min(38, (rh - (col - 1) * cg) / col);
    for (let k = 0; k < col; k++) slots.push([colX, rY + k * (colH + cg), colW, colH]);
  }
  // 모든 카드를 같은 글자 크기로 찍는다: 가장 긴 글이 제 칸에 들어가는 크기에 맞춘다
  const order = cardOrder(n);
  const size = Math.min(CARD_TEXT_SIZES[0], ...order.map((ti, k) => {
    const [, , tw, th] = cardTextBox(0, 0, slots[k][2], slots[k][3]);
    return fit(texts[ti], tw, th, CARD_TEXT_SIZES).size;
  }));
  const sizes = CARD_TEXT_SIZES.filter((s) => s <= size);
  order.forEach((ti, k) => pieces.push(card(...slots[k], texts[ti], k + 1, sizes)));
  const sub = n > 0 ? `바닥판 1 · 흙 비탈 1 · 차례 카드 ${n}` : '바닥판 1 · 흙 비탈 1';
  return { title: '종이 고인돌 · 바닥판과 흙 비탈', sub, pieces, art: [], joins: [] };
}

/** 쪽마다의 설계. 시험이 조각의 변과 자리를 잰다. */
export function plans(texts: string[]): Plan[] {
  return [sheet1(), sheet2(texts)];
}

/** 모듈의 기본 내보내기 (docs/CONTRACT.md 7절) */
export function sheets(texts: string[]): { title: string; sub: string; svg: string }[] {
  return plans(texts).map((p, i) => ({ title: p.title, sub: p.sub, svg: render(p, i + 1) }));
}

// ───────────────────────────── 만드는 법 쪽의 그림 둘 ─────────────────────────────
// 왼쪽: 흙 비탈 위에 통나무 셋을 깔고 덮개돌을 끌어 올리는 모습 (여러 짐작 가운데 하나). 받침돌 둘은 이미 서 있다.
// 오른쪽: 흙 비탈을 치운 모습. 덮개돌이 받침돌 위에 얹혀 있고, 바닥판에는 흙 비탈 자리가 비어 있다.
// 모델 좌표는 바닥판의 것이다: X 좌우(0~BPW), Y 깊이(0 = 뒤 … BPH = 앞), Z 높이. 빗각 투영으로 그린다.

/** 비탈의 기울기 */
const TH = Math.atan2(RH, RL);
/** 끌어 올리는 그림에서 덮개돌 앞 끝이 빗면을 따라 올라간 거리, 통나무 셋이 놓인 곳 (빗면 아래 끝에서 잰 거리) */
export const PULL = { lead: 72, logs: [14, 38, 62] } as const;
/** 빗면 좌표(u: 빗면을 따라, n: 빗면에서 수직으로 뜬 높이)를 바닥판의 X, Z 로 */
export function onSlope(u: number, n: number): [number, number] {
  return [FOOT.ramp.x + u * Math.cos(TH) - n * Math.sin(TH), u * Math.sin(TH) + n * Math.cos(TH)];
}

/** 그림 글의 크기 (SVG 단위). 페이지가 이 크기와 viewBox 로 그림 칸의 높이를 정해 9pt 아래로 줄지 않게 한다. */
export const FIG_TEXT = 8;

export interface FigLabel { text: string; x: number; y: number; size: number; anchor: 'start' | 'middle' | 'end'; weight: number; dim?: boolean; box: [number, number, number, number] }
export interface FigPanel {
  /** 그린 면 (투영한 다각형). 그리는 차례대로. fill 은 색이고, dash 이면 점선 자리다. */
  faces: { pts: Pt[]; fill: string; sw: number; dash?: boolean }[];
  /** 통나무 (몸통과 앞뒤 원). 이름표 시험이 쓰도록 원은 다각형으로도 준다. */
  logs: { back: Pt; front: Pt; r: number }[];
  labels: FigLabel[];
  leaders: [Pt, Pt][];
}
export interface FigLayout {
  viewBox: [number, number, number, number];
  panels: FigPanel[];
  /** 그림에 그린 상자 (바닥판 좌표, mm). 시험이 전개도의 크기와 견준다. */
  solids: { panel: number; name: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[];
}

const DX = 0.45, DY = 0.3;

/** 두 그림의 배치. preview() 가 그리고, 시험이 이름표와 선이 겹치지 않는지 잰다. */
export function figureLayout(): FigLayout {
  const panelW = BPW + DX * BPH;
  const PANEL_GAP = 18;
  const top = 74, labelRow = 8;
  const panels: FigPanel[] = [];
  const solids: FigLayout['solids'] = [];

  for (const k of [0, 1]) {
    const OX = k * (panelW + PANEL_GAP), OY = top + 2 * labelRow;
    const P = (X: number, Y: number, Z: number): Pt => [OX + X + DX * (BPH - Y), OY - Z - DY * (BPH - Y)];
    const faces: FigPanel['faces'] = [];
    const logs: FigPanel['logs'] = [];
    const labels: FigLabel[] = [];
    const leaders: [Pt, Pt][] = [];
    const face = (pts: Pt[], fill: string, sw = 0.5, dash = false) => faces.push({ pts, fill, sw, dash });
    const box = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, sw = 0.5) => {
      solids.push({ panel: k, name, x0, x1, y0, y1, z0, z1 });
      face([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], RULE, sw);
      face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], '#ffffff', sw);
      face([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], '#e6e6e6', sw);
    };
    const label = (s: string, x: number, y: number, o: { anchor?: FigLabel['anchor']; weight?: number; dim?: boolean } = {}) => {
      const size = FIG_TEXT, anchor = o.anchor ?? 'middle', w = textWidth(s, size);
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      const l: FigLabel = { text: s, x, y, size, anchor, weight: o.weight ?? 700, dim: o.dim, box: [x0, y - size * 0.6, x0 + w, y + size * 0.6] };
      labels.push(l);
      return l;
    };
    /** 지시선: 그림의 점에서 이름표의 가장 가까운 변 가운데로 */
    const lead = (from: Pt, l: FigLabel, dx = 0) => {
      const [x0, y0, x1, y1] = l.box;
      const above = from[1] < y0;
      leaders.push([from, [Math.min(Math.max(from[0], x0 + 2), x1 - 2) + dx, above ? y0 - 0.8 : y1 + 0.8]]);
    };

    // 바닥판: 앞쪽 두께, 오른쪽 두께, 윗면
    const T = 1.4;
    face([P(0, BPH, 0), P(BPW, BPH, 0), P(BPW, BPH, -T), P(0, BPH, -T)], '#e6e6e6', 0.4);
    face([P(BPW, BPH, 0), P(BPW, 0, 0), P(BPW, 0, -T), P(BPW, BPH, -T)], RULE, 0.4);
    face([P(0, BPH, 0), P(BPW, BPH, 0), P(BPW, 0, 0), P(0, 0, 0)], '#ffffff', 0.4);
    const r = FOOT.ramp;
    const capY0 = CAP.y, capY1 = CAP.y + CW;
    const bottomRow = OY + T + labelRow + 1, topRow = OY - top - labelRow + 4;

    if (k === 0) {
      // 흙 비탈: 높은 쪽 면, 빗면, 앞 옆면
      const xh = r.x + RL;
      solids.push({ panel: k, name: '흙 비탈', x0: r.x, x1: xh, y0: r.y, y1: r.y + RW, z0: 0, z1: RH });
      face([P(xh, r.y, 0), P(xh, r.y + RW, 0), P(xh, r.y + RW, RH), P(xh, r.y, RH)], RULE);
      face([P(r.x, r.y, 0), P(xh, r.y, RH), P(xh, r.y + RW, RH), P(r.x, r.y + RW, 0)], '#ffffff');
      face([P(r.x, r.y + RW, 0), P(xh, r.y + RW, 0), P(xh, r.y + RW, RH)], '#e6e6e6');
      // 통나무 셋: 빗면에 닿아 누운 원기둥
      const ly0 = (BPH - LOG_L) / 2, ly1 = ly0 + LOG_L;
      for (const u of PULL.logs) {
        const [X, Z] = onSlope(u, LOG_D / 2);
        logs.push({ back: P(X, ly0, Z), front: P(X, ly1, Z), r: LOG_D / 2 });
      }
      // 덮개돌: 통나무 위에 빗면과 나란히 얹힌 상자. 보이는 면은 앞 끝(위쪽), 윗면, 앞면
      const u0 = PULL.lead - CL, u1 = PULL.lead, n0 = LOG_D, n1 = LOG_D + CH;
      const Q = (u: number, n: number, Y: number) => { const [X, Z] = onSlope(u, n); return P(X, Y, Z); };
      face([Q(u1, n0, capY0), Q(u1, n0, capY1), Q(u1, n1, capY1), Q(u1, n1, capY0)], RULE, 0.6);
      face([Q(u0, n1, capY0), Q(u1, n1, capY0), Q(u1, n1, capY1), Q(u0, n1, capY1)], '#ffffff', 0.6);
      face([Q(u0, n0, capY1), Q(u1, n0, capY1), Q(u1, n1, capY1), Q(u0, n1, capY1)], '#ffffff', 0.6);
      // 받침돌 둘 (덮개돌보다 앞에 보인다)
      box('받침돌', FOOT.left.x, FOOT.left.x + SW, FOOT.left.y, FOOT.left.y + SD, 0, SH);
      box('받침돌', FOOT.right.x, FOOT.right.x + SW, FOOT.right.y, FOOT.right.y + SD, 0, SH);

      // 이름표: 위 줄에 덮개돌·받침돌, 아래 줄에 통나무·흙 비탈·바닥판
      const capFront = Q(PULL.lead - CL * 0.55, (n0 + n1) / 2, capY1);
      lead(capFront, label('덮개돌', capFront[0] + 14, topRow));
      const st = [P(FOOT.left.x + SW / 2, FOOT.left.y + SD / 2, SH), P(FOOT.right.x + SW / 2, FOOT.right.y + SD / 2, SH)];
      const ls = label('받침돌', (st[0][0] + st[1][0]) / 2, topRow);
      leaders.push([st[0], [ls.box[0] - 0.8, ls.y]], [st[1], [ls.box[2] + 0.8, ls.y]]);
      const lg = logs[0];
      lead([lg.front[0], lg.front[1] + lg.r * 0.4], label('통나무', OX + 16, bottomRow));
      const tri = P(r.x + RL * 0.68, r.y + RW, RH * 0.24);
      lead(tri, label('흙 비탈', tri[0] + 6, bottomRow));
    } else {
      // 흙 비탈을 치운 자리 (바닥판의 점선 사각형)
      face([P(r.x, r.y + RW, 0), P(r.x + RL, r.y + RW, 0), P(r.x + RL, r.y, 0), P(r.x, r.y, 0)], 'none', 0.45, true);
      box('받침돌', FOOT.left.x, FOOT.left.x + SW, FOOT.left.y, FOOT.left.y + SD, 0, SH);
      box('받침돌', FOOT.right.x, FOOT.right.x + SW, FOOT.right.y, FOOT.right.y + SD, 0, SH);
      box('덮개돌', CAP.x, CAP.x + CL, capY0, capY1, SH, SH + CH, 0.6);

      const capTop = P(CAP.x + CL * 0.35, capY0 + CW * 0.5, SH + CH);
      lead(capTop, label('덮개돌', capTop[0] - 8, topRow));
      const sf = [P(FOOT.left.x + SW / 2, FOOT.left.y + SD, SH * 0.45), P(FOOT.right.x + SW / 2, FOOT.right.y + SD, SH * 0.45)];
      const ls = label('받침돌', (sf[0][0] + sf[1][0]) / 2, bottomRow);
      leaders.push([sf[0], [ls.box[0] - 0.8, ls.y - 1]], [sf[1], [ls.box[2] + 0.8, ls.y - 1]]);
      const spotPt = P(r.x + RL * 0.3, r.y + RW * 0.7, 0);
      lead(spotPt, label('흙 비탈 자리', OX + 24, bottomRow));
    }
    // 바닥판: 오른쪽 아래
    const bp = P(BPW - 10, BPH - 6, 0);
    lead(bp, label('바닥판', bp[0] + 8, bottomRow));
    // 그림 이름: 아래 줄 밑에. 왼쪽 그림은 여러 짐작 가운데 하나임을 바로 밑에 적는다 (R2, 15절).
    const cx = OX + panelW / 2, capRow = bottomRow + FIG_TEXT * 1.9;
    if (k === 0) {
      label('덮개돌을 끌어 올리는 모습', cx, capRow);
      label('여러 짐작 가운데 하나', cx, capRow + FIG_TEXT * 1.35, { weight: 500, dim: true });
    } else {
      label('흙 비탈을 치운 모습', cx, capRow);
    }
    panels.push({ faces, logs, labels, leaders });
  }

  const pts: Pt[] = panels.flatMap((p) => [
    ...p.faces.flatMap((f) => f.pts),
    ...p.logs.flatMap((l) => [[l.back[0] - l.r, l.back[1] - l.r], [l.front[0] + l.r, l.front[1] + l.r]] as Pt[]),
    ...p.labels.flatMap((l) => [[l.box[0], l.box[1]], [l.box[2], l.box[3]]] as Pt[]),
  ]);
  const minX = Math.min(...pts.map((p) => p[0])) - 1.5, maxX = Math.max(...pts.map((p) => p[0])) + 1.5;
  const minY = Math.min(...pts.map((p) => p[1])) - 1.5, maxY = Math.max(...pts.map((p) => p[1])) + 1.5;
  return { viewBox: [minX, minY, maxX - minX, maxY - minY], panels, solids };
}

/** 만드는 법 쪽의 그림 SVG (7절의 선택 내보내기 preview). 그림 둘과 그 이름을 한 장에 담는다. */
export function preview(): string {
  const L = figureLayout();
  const n2 = (v: number) => Math.round(v * 100) / 100;
  const pts = (ps: readonly Pt[]) => ps.map((p) => `${n2(p[0])},${n2(p[1])}`).join(' ');
  const g: string[] = [];
  for (const p of L.panels) {
    // 통나무는 흙 비탈 다음, 덮개돌 앞에 그린다 (얼굴 목록에서 흙 비탈의 마지막 면 다음)
    const logAt = p.logs.length ? 6 : -1;
    p.faces.forEach((f, i) => {
      if (i === logAt) g.push(...p.logs.map(logSvg));
      g.push(f.dash
        ? `<polygon points="${pts(f.pts)}" fill="none" stroke="${INK_DIM}" stroke-width="${f.sw}" stroke-linecap="round" stroke-dasharray="${SPOT_DASH}"/>`
        : `<polygon points="${pts(f.pts)}" fill="${f.fill}" stroke="${INK}" stroke-width="${f.sw}" stroke-linejoin="round"/>`);
    });
    for (const [a, b] of p.leaders) g.push(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" stroke="${INK_DIM}" stroke-width="0.35"/><circle cx="${n2(a[0])}" cy="${n2(a[1])}" r="0.9" fill="${INK}"/>`);
    for (const l of p.labels) g.push(text(l.x, l.y, l.text, { size: l.size, weight: l.weight, anchor: l.anchor, fill: l.dim ? INK_DIM : INK }));
  }
  const vb = L.viewBox.map(n2).join(' ');
  const aria = '왼쪽 그림: 받침돌 두 개가 서 있고, 그 옆에 놓은 흙 비탈 위에 통나무 셋을 깔고 덮개돌을 끌어 올리는 모습. 여러 짐작 가운데 하나다. 오른쪽 그림: 흙 비탈을 치우고 받침돌 두 개 위에 덮개돌이 얹힌 모습.';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${aria}" style="display:block;width:100%;height:100%"><g font-family="${FONT_FAMILY}">${g.join('')}</g></svg>`;

  function logSvg(c: FigPanel['logs'][number]): string {
    const { back: b, front: fr, r } = c;
    const v = [b[0] - fr[0], b[1] - fr[1]], len = Math.hypot(v[0], v[1]);
    const nn = [-v[1] / len * r, v[0] / len * r];
    return `<circle cx="${n2(b[0])}" cy="${n2(b[1])}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="0.45"/>`
      + `<polygon points="${pts([[b[0] + nn[0], b[1] + nn[1]], [fr[0] + nn[0], fr[1] + nn[1]], [fr[0] - nn[0], fr[1] - nn[1]], [b[0] - nn[0], b[1] - nn[1]]])}" fill="#ffffff" stroke="none"/>`
      + `<line x1="${n2(b[0] + nn[0])}" y1="${n2(b[1] + nn[1])}" x2="${n2(fr[0] + nn[0])}" y2="${n2(fr[1] + nn[1])}" stroke="${INK}" stroke-width="0.45"/>`
      + `<line x1="${n2(b[0] - nn[0])}" y1="${n2(b[1] - nn[1])}" x2="${n2(fr[0] - nn[0])}" y2="${n2(fr[1] - nn[1])}" stroke="${INK}" stroke-width="0.45"/>`
      + `<circle cx="${n2(fr[0])}" cy="${n2(fr[1])}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="0.5"/><circle cx="${n2(fr[0])}" cy="${n2(fr[1])}" r="${r * 0.45}" fill="none" stroke="${RULE}" stroke-width="0.35"/>`;
  }
}

export default { sheets, preview };
