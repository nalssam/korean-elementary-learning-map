// 종이 고인돌 전개도(generators/papercraft/modules/dolmen-table.ts)가 실제 크기 A4 에서 조립되는지 도면의 값으로 잰다.
// 브라우저 없이 돈다. 화면에 찍어 보는 시험은 page.test.ts 에 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xmlText } from '#lib/content.ts';
import mod, * as dolmen from '../../generators/papercraft/modules/dolmen-table.ts';
import { analyse, bbox, len, BODY_H, BODY_W, LEGEND_H, RULE, SVG_OPEN, textWidth, type Plan, type Pt, type Seg } from '../../generators/papercraft/net.ts';

const TEXTS = ['받침돌을 세웁니다.', '받침돌 높이까지 흙을 쌓아 비탈을 만듭니다.', '통나무를 깔고 덮개돌을 끌어 올립니다.', '흙을 걷어 내면 고인돌이 드러납니다.'];
const EPS = 0.01;
const key = (p: readonly [number, number]) => `${Math.round(p[0] * 100) / 100},${Math.round(p[1] * 100) / 100}`;
const segKey = (s: Seg) => [key(s[0]), key(s[1])].sort().join('|');

/** 여러 쪽에서 쓰는 글의 경우: 없음, 하나, 넷(명세), 여덟(형식의 끝), 아주 긴 글 */
const CASES: Record<string, string[]> = {
  '글 없음': [],
  '글 하나': ['돌을 세웁니다.'],
  '세 장': TEXTS.slice(0, 3),
  '다섯 장': [...TEXTS, TEXTS[0]],
  '명세의 네 장': TEXTS,
  '여덟 장': [...TEXTS, ...TEXTS],
  '긴 글 네 장': TEXTS.map((t) => `${t} 모둠 친구들과 함께 차례를 소리 내어 읽고 까닭을 말해 봅시다.`),
};

test('모듈의 꼴: 기본 내보내기 sheets() 가 계약(7절)의 SVG 뿌리로 두 쪽을 내놓는다', () => {
  const out = mod.sheets(TEXTS);
  assert.equal(out.length, 2, '명세의 pages 는 전개도 2쪽 + 만드는 법 1쪽 = 3 이다');
  for (const s of out) {
    assert.ok(s.svg.startsWith(SVG_OPEN), 'SVG 뿌리가 계약의 꼴과 다릅니다');
    assert.ok(s.svg.endsWith('</svg>'));
    assert.ok(s.title.length > 0 && s.title.length <= 24, `머리 제목이 깁니다: ${s.title}`);
    assert.ok(s.sub.length <= 40, `머리 부제가 깁니다: ${s.sub}`);
    assert.doesNotMatch(s.svg, /<script|foreignObject|\son[a-z]+=|https?:\/\/(?!www\.w3\.org)/, '그림 검사(11절)에 걸리는 것이 있습니다');
  }
  assert.equal(typeof mod.preview, 'function');
  assert.match(mod.preview(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/);
});

test('명세의 글은 xmlText() 를 거쳐 SVG 에 들어간다 (11절 전개도 검사와 같은 부름)', () => {
  const svg = mod.sheets(TEXTS.map(() => '<i>&')).map((s) => s.svg).join('');
  assert.ok(!svg.includes('<i>'), '명세의 글이 그대로 들어갔습니다');
  assert.ok(svg.includes(xmlText('<i>&')));
  // 모듈의 이름표도 같은 길로 들어간다: 글자 사이에 날것의 <, & 가 없다
  for (const s of mod.sheets(TEXTS)) for (const m of s.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) assert.doesNotMatch(m[1], /&(?!amp;|lt;|gt;|quot;)/);
});

test('선의 규칙: 자르는 선 0.5 실선, 접는 선 0.3 점선, 풀칠은 빗금', () => {
  for (const [i, s] of mod.sheets(TEXTS).entries()) {
    const cuts = [...s.svg.matchAll(/<path d="[^"]+" fill="none" stroke="#1a1a1a" stroke-width="0.5"/g)].length;
    const plan = dolmen.plans(TEXTS)[i];
    assert.equal(cuts, plan.pieces.length, `${i + 1}쪽: 조각마다 자르는 선이 한 줄로 이어져야 합니다`);
    for (const m of s.svg.matchAll(/<line [^>]*stroke-width="0.3" stroke-dasharray="([^"]+)"/g)) assert.equal(m[1], '2 1.4');
    assert.match(s.svg, new RegExp(`<pattern id="pc-glue-${i + 1}"`), '풀칠 빗금 무늬는 쪽마다 id 가 다르다 (한 페이지에 SVG 가 여럿이다)');
  }
});

test('조각마다: 탭의 경첩은 접는 선 하나뿐이고, 한 변을 세 면이 함께 쓰지 않는다', () => {
  for (const [label, texts] of Object.entries(CASES)) {
    for (const plan of dolmen.plans(texts)) for (const piece of plan.pieces) {
      assert.deepEqual(analyse(piece).problems, [], `${label} · ${piece.name}`);
    }
  }
});

/** 모든 쪽의 자르는 선·접는 선 (변 → 어느 조각의 무엇인지) */
function edgeIndex(plans: Plan[]) {
  const map = new Map<string, { piece: string; kind: 'cut' | 'fold' }>();
  for (const plan of plans) for (const piece of plan.pieces) {
    const a = analyse(piece);
    for (const s of a.cut) map.set(segKey(s), { piece: piece.name, kind: 'cut' });
    for (const s of a.fold) map.set(segKey(s), { piece: piece.name, kind: 'fold' });
  }
  return map;
}

test('풀로 붙거나 맞닿는 변은 길이가 같고, 둘 다 도안에 정말 있는 변이다', () => {
  const plans = dolmen.plans(TEXTS);
  const edges = edgeIndex(plans);
  const joins = plans.flatMap((p) => [...p.joins, ...p.pieces.flatMap((pc) => pc.joins)]);
  assert.ok(joins.length >= 16, `맞닿는 변의 짝이 ${joins.length}개뿐입니다`);
  for (const j of joins) {
    for (const s of j.kind === 'seat' ? [j.a] : [j.a, j.b]) assert.ok(edges.has(segKey(s)), `${j.what}: ${segKey(s)} 는 도안에 없는 변입니다`);
    assert.ok(Math.abs(len(j.a) - len(j.b)) < EPS, `${j.what}: ${len(j.a).toFixed(2)}mm 와 ${len(j.b).toFixed(2)}mm`);
    if (j.kind === 'glue' || j.kind === 'seat') {
      assert.equal(edges.get(segKey(j.a))!.kind, 'fold', `${j.what}: 탭의 경첩이 접는 선이 아닙니다`);
      assert.ok(j.depth! > 0 && (j.kind === 'seat' ? j.depth! <= j.room! : j.depth! < j.room!), `${j.what}: 탭 깊이 ${j.depth}mm 가 붙일 면(${j.room}mm)을 넘습니다`);
    }
  }
  // 탭마다 붙일 곳이 정해져 있다
  for (const plan of plans) for (const piece of plan.pieces) {
    for (const f of piece.faces.filter((f) => f.glue)) {
      const hinge = f.pts.slice(0, 2) as unknown as Seg;
      assert.ok(joins.some((j) => (j.kind === 'glue' || j.kind === 'seat') && segKey(j.a) === segKey(hinge)), `${piece.name}: 붙일 곳을 적지 않은 탭이 있습니다 (${segKey(hinge)})`);
    }
  }
});

type Box = { x: number; y: number; w: number; h: number };
const inside = (a: Box, b: Box, gap: number) => a.x >= b.x + gap && a.y >= b.y + gap && a.x + a.w <= b.x + b.w - gap && a.y + a.h <= b.y + b.h - gap;
const apart = (a: Box, b: Box, gap: number) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;

test('짜임: 덮개돌 하나를 받침돌 둘이 받치고, 바닥판의 자리가 조각의 크기와 같으며 덮개돌 안에 든다', () => {
  const d = dolmen;
  const board = { x: 0, y: 0, w: d.BPW, h: d.BPH };
  assert.deepEqual(Object.keys(d.FOOT).sort(), ['cap', 'left', 'rampBack', 'rampFront', 'right'], '바닥판의 자리는 덮개돌·받침돌 둘·흙 비탈 발 둘뿐입니다');
  assert.equal(d.RH, d.SH, '흙 비탈은 받침돌 꼭대기까지 닿습니다');
  for (const f of [d.FOOT.left, d.FOOT.right]) assert.deepEqual([f.w, f.h], [d.SW, d.SD]);
  assert.deepEqual([d.FOOT.cap.w, d.FOOT.cap.h], [d.CL, d.CW]);
  assert.equal(d.FOOT.left.y, d.FOOT.right.y, '두 받침돌은 나란히 섭니다');
  // 덮개돌의 옆면이 아래로 CH 만큼 내려오므로 받침돌은 덮개돌 자리 안쪽에 떨어져 서야 옆면에 걸리지 않는다
  for (const f of [d.FOOT.left, d.FOOT.right]) assert.ok(inside(f, d.FOOT.cap, 2), `덮개돌 자리 밖으로 나간 받침돌이 있습니다 (${JSON.stringify(f)})`);
  assert.ok(inside(d.FOOT.cap, board, 2));
  // 덮개돌이 혼자 선다: 무게중심(덮개돌 가운데)이 두 받침돌이 받치는 너비 안에 든다
  const mid = d.FOOT.cap.y + d.CW / 2;
  assert.ok(d.FOOT.left.y + 5 <= mid && mid <= d.FOOT.left.y + d.SD - 5, '덮개돌이 앞뒤로 기웁니다');
  // 덮개돌의 옆면은 받침돌보다 낮아야 덮개돌이 받침돌 위에 얹힌다
  assert.ok(d.CH < d.SH);
  assert.ok(apart(d.FOOT.left, d.FOOT.right, 10));
  // 통나무: 종이 폭이 지름 16mm 원기둥의 둘레다
  assert.ok(Math.abs(d.LOG_C - Math.PI * d.LOG_D) < EPS);
});

test('흙 비탈: 두 벽의 발이 바닥판 앞면에 찍힌 자리에 들어가고, 통나무가 두 벽에 걸치며, 높은 끝이 덮개돌 옆면에 걸리지 않는다', () => {
  const d = dolmen;
  const board = { x: 0, y: 0, w: d.BPW, h: d.BPH };
  const [back, front] = [d.FOOT.rampBack, d.FOOT.rampFront];
  for (const f of [back, front]) {
    assert.deepEqual([f.w, f.h], [d.RW, d.RF], '발 자리는 발의 크기와 같습니다');
    assert.ok(inside(f, board, 2), `발 자리가 바닥판 밖으로 나갑니다 (${JSON.stringify(f)})`);
    for (const s of [d.FOOT.left, d.FOOT.right]) assert.ok(apart(f, s, 0.5), '발 자리가 받침돌 자리와 겹칩니다');
  }
  // 두 벽 사이(발은 밖으로 접힌다)는 통나무보다 짧고, 통나무가 양쪽으로 걸칠 만큼 남는다
  const between = front.y - (back.y + back.h);
  assert.equal(between, d.RS);
  assert.ok(d.LOG_L - between >= 6, `통나무(${d.LOG_L}mm)가 두 벽(${between}mm)에 걸치지 못합니다`);
  // 두 벽은 덮개돌 너비 안에 든다 (높은 끝이 덮개돌 밑으로 들어간다)
  assert.ok(back.y + back.h > d.FOOT.cap.y + 2 && front.y < d.FOOT.cap.y + d.CW - 2);
  // 높은 끝은 왼쪽 받침돌 바로 옆에 닿는다
  const x1 = back.x + d.RW;
  assert.ok(x1 <= d.FOOT.left.x && d.FOOT.left.x - x1 <= 2);
  // 덮개돌 옆면(X = 덮개돌 왼끝)이 내려온 높이 SH - CH 에서 비탈은 그보다 낮다
  const atSkirt = d.RH * (d.FOOT.cap.x - back.x) / d.RW;
  assert.ok(atSkirt <= d.SH - d.CH - 2, `덮개돌 옆면 자리에서 비탈 높이 ${atSkirt.toFixed(1)}mm 가 옆면 아래끝 ${d.SH - d.CH}mm 에 걸립니다`);
  // 발의 경첩과 발 자리의 변은 길이가 같고, 2쪽의 바닥판 위 자리를 가리킨다
  const plan = dolmen.plans(TEXTS)[1];
  const bp = bbox(plan.pieces.find((p) => p.name === '바닥판')!);
  const seats = plan.pieces.flatMap((p) => p.joins).filter((j) => j.kind === 'seat');
  assert.equal(seats.length, 2);
  for (const [j, f] of seats.map((j, i) => [j, [back, front][i]] as const)) {
    assert.deepEqual(j.b.map((p) => p.map((v) => Math.round(v * 100) / 100)), [[bp[0] + f.x, bp[1] + f.y], [bp[0] + f.x + f.w, bp[1] + f.y]].map((p) => p.map((v) => Math.round(v * 100) / 100)), j.what);
  }
});

test('아이가 읽는 글: 도안과 완성 모습에 덮개돌·받침돌 말고 다른 돌 이름이 없다 (R1, 15절)', () => {
  const words = /굄돌|고임돌|막음돌|받침판|탁자식|굴림대|경사로/;
  const shown = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ');
  for (const [label, texts] of Object.entries(CASES)) {
    for (const s of mod.sheets(texts)) {
      assert.doesNotMatch(s.title + s.sub, words, label);
      assert.doesNotMatch(shown(s.svg), words, `${label} · ${s.title}`);
    }
  }
  assert.deepEqual(mod.sheets(TEXTS).map((s) => s.title), ['종이 고인돌 · 돌 조각', '종이 고인돌 · 바닥판과 통나무']);
  const pv = mod.preview();
  assert.doesNotMatch(shown(pv) + pv.match(/aria-label="([^"]*)"/)![1], words);
  assert.match(pv, /aria-label="완성한 종이 고인돌: 받침돌 두 개 위에 덮개돌을 얹은 모습/);
  assert.match(shown(pv), /여러 짐작 가운데 하나/, '흙 비탈과 통나무는 여러 짐작 가운데 하나라고 적습니다 (R2)');
  // 조각 이름: 1쪽 덮개돌 1 · 받침돌 2, 2쪽 바닥판 · 통나무 3 · 흙 비탈 2
  const names = dolmen.plans(TEXTS).map((p) => p.pieces.map((pc) => pc.name.replace(/ \d+$/, '')).filter((n) => n !== '차례 카드'));
  assert.deepEqual(names, [['덮개돌', '받침돌', '받침돌'], ['바닥판', '통나무', '통나무', '통나무', '흙 비탈', '흙 비탈']]);
});

test('조립 표시: 한 글자는 두 쪽을 통틀어 한 곳의 붙임만 뜻하고, 탭에 진하게 한 번, 붙일 자리에 옅게 한 번 찍힌다', () => {
  const plans = dolmen.plans(TEXTS);
  const glues = plans.flatMap((p) => p.pieces.flatMap((pc) => pc.joins)).filter((j) => j.kind === 'glue');
  const marks = glues.map((j) => j.mark);
  assert.ok(marks.every((m) => typeof m === 'string' && m.length === 1), '글자가 없는 풀칠 탭이 있습니다');
  assert.equal(new Set(marks).size, marks.length, `같은 글자를 두 붙임에 썼습니다: ${marks.join('')}`);
  const svg = mod.sheets(TEXTS).map((s) => s.svg);
  for (const m of marks) {
    const on = svg.map((s) => [...s.matchAll(new RegExp(`<g data-mark="${m}" data-mark-role="(tab|target)">(.*?)</g>`, 'g'))]);
    const all = on.flat();
    assert.deepEqual(all.map((x) => x[1]).sort(), ['tab', 'target'], `${m}: 탭 하나와 자리 하나에 찍혀야 합니다`);
    assert.equal(on.filter((x) => x.length).length, 1, `${m}: 두 쪽에 나뉘어 찍혔습니다`);
    const target = all.find((x) => x[1] === 'target')![2], tabMark = all.find((x) => x[1] === 'tab')![2];
    const size = (g: string) => Number(g.match(/font-size="([\d.]+)"/)![1]);
    assert.ok(target.includes(`fill="${RULE}"`) && size(target) < size(tabMark), `${m}: 붙일 자리의 글자는 작고 옅게 찍습니다`);
  }
  // 그림에 찍힌 글자도 짝이 있는 것뿐이다
  const printed = svg.flatMap((s) => [...s.matchAll(/data-mark="([^"]+)"/g)].map((x) => x[1]));
  assert.deepEqual([...new Set(printed)].sort(), [...marks].sort());
});

test('완성 모습: 덮개돌이 받침돌 위에 얹혀 옆면이 받침돌을 덮고, 보이는 받침돌 높이가 전개도와 같다', () => {
  const d = dolmen;
  const L = d.previewLayout();
  const cap = L.boxes.find((b) => b.name === '덮개돌')!;
  const sup = L.boxes.filter((b) => b.name === '받침돌');
  assert.equal(sup.length, 2, '받침돌은 둘입니다');
  assert.equal(L.boxes.length, 3);
  // 전개도의 값: 받침돌 옆면의 높이, 덮개돌 옆면의 높이
  const [one] = d.plans(TEXTS);
  const faceH = (pts: readonly Pt[]) => Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  const supportH = faceH(one.pieces.find((p) => p.name === '받침돌 1')!.faces[0].pts);
  const capSkirt = faceH(one.pieces.find((p) => p.name === '덮개돌')!.faces[1].pts);
  for (const s of sup) assert.equal(s.z1 - s.z0, supportH);
  assert.equal(cap.z1, supportH, '덮개돌 윗면은 받침돌 꼭대기에 얹힙니다');
  assert.equal(cap.z1 - cap.z0, capSkirt);
  assert.equal(cap.z0, supportH - capSkirt, `보이는 받침돌 높이는 ${supportH - capSkirt}mm 입니다`);
  // 받침돌과 덮개돌의 자리가 바닥판의 자리와 같다
  for (const [s, f] of [[sup[0], d.FOOT.left], [sup[1], d.FOOT.right]] as const) assert.deepEqual([s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0], [f.x, f.y, f.w, f.h]);
  // 통나무는 비탈 위에 있고 덮개돌에 박히지 않는다
  for (const g of L.logs) {
    const r = d.LOG_D / 2;
    assert.ok(g.x + r <= cap.x0 || g.z - r >= cap.z1, `통나무(${g.x.toFixed(1)}, ${g.z.toFixed(1)})가 덮개돌에 겹칩니다`);
    const slope = d.RH * (g.x - d.FOOT.rampBack.x) / d.RW;
    assert.ok(g.z > slope, '통나무가 비탈 아래로 들어갔습니다');
  }
});

/** 선분 ab 가 사각형과 만나는가 */
function hits(a: Pt, b: Pt, [x0, y0, x1, y1]: [number, number, number, number]): boolean {
  for (let i = 0; i <= 200; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 200, y = a[1] + ((b[1] - a[1]) * i) / 200;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}

test('완성 모습의 이름표: 땅(바닥판 윤곽)에도 서로에게도 걸리지 않고 그림 안에 든다', () => {
  const L = dolmen.previewLayout();
  const [vx, vy, vw, vh] = L.viewBox;
  for (const l of L.labels) {
    const [x0, y0, x1, y1] = l.box;
    assert.ok(x0 >= vx && y0 >= vy && x1 <= vx + vw && y1 <= vy + vh, `"${l.text}" 가 그림 밖으로 나갑니다`);
    L.ground.forEach((p, i) => assert.ok(!hits(p, L.ground[(i + 1) % L.ground.length], [x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5]), `땅의 선이 "${l.text}" 를 지나갑니다`));
    for (const [a, b] of L.leaders) {
      // 이름표에서 나가는 끝(to)은 이름표 가장자리에 닿는다. 그 밖의 지시선이 글을 지나가면 안 된다.
      const inner: [number, number, number, number] = [x0 + 0.8, y0 + 0.8, x1 - 0.8, y1 - 0.8];
      assert.ok(!hits(a, b, inner), `지시선이 "${l.text}" 를 지나갑니다`);
    }
  }
  for (let i = 0; i < L.labels.length; i++) for (let j = i + 1; j < L.labels.length; j++) {
    const p = L.labels[i].box, q = L.labels[j].box;
    assert.ok(p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1], `"${L.labels[i].text}" 와 "${L.labels[j].text}" 가 겹칩니다`);
  }
});

test('선 안내: 놓는 자리가 있는 쪽(2쪽)에만 점선 사각형 \'놓는 자리\' 가 더해져 네 가지가 된다', () => {
  const [one, two] = mod.sheets(TEXTS).map((s) => s.svg);
  const items = ['자르는 선', '접는 선', '풀칠', '놓는 자리'];
  const legend = (svg: string) => items.filter((t) => svg.includes(`>${t}</text>`));
  assert.deepEqual(legend(two), items);
  assert.deepEqual(legend(one), items.slice(0, 3));
  assert.match(two, /<rect x="90" y="[\d.]+" width="4.4" height="4.4" fill="none" stroke="#555555" stroke-width="0.45" stroke-linecap="round" stroke-dasharray="0.01 1.1"\/>/);
});

test('글꼴: 도안과 완성 모습의 글은 고정 굵기 Pretendard 로 찍는다 (가변 글꼴을 적지 않는다)', () => {
  for (const svg of [...mod.sheets(TEXTS).map((s) => s.svg), mod.preview()]) {
    const fams = [...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(fams.length > 0);
    for (const f of fams) {
      assert.match(f, /^Pretendard\b/);
      assert.doesNotMatch(f, /Variable/);
    }
  }
});

test('조각은 모두 190 × 249mm 안에, 선 안내 아래에 있고, 가위가 지나갈 틈(2mm 이상)을 두고 떨어져 있다', () => {
  for (const [label, texts] of Object.entries(CASES)) {
    for (const [i, plan] of dolmen.plans(texts).entries()) {
      const boxes = plan.pieces.map((p) => ({ name: p.name, b: bbox(p) }));
      for (const { name, b } of boxes) {
        assert.ok(b[0] >= 0.5 && b[1] >= LEGEND_H + 1 && b[2] <= BODY_W - 0.5 && b[3] <= BODY_H - 0.5, `${label} · ${i + 1}쪽 ${name}: [${b.map((v) => v.toFixed(1))}] 가 본문 밖으로 나갑니다`);
      }
      for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) {
        const p = boxes[a].b, q = boxes[c].b;
        const apart = p[2] + 2 <= q[0] || q[2] + 2 <= p[0] || p[3] + 2 <= q[1] || q[3] + 2 <= p[1];
        assert.ok(apart, `${label} · ${i + 1}쪽: ${boxes[a].name} 와 ${boxes[c].name} 가 너무 붙어 있습니다`);
      }
    }
  }
});

test('차례 카드: 명세의 글을 한 장에 하나씩, 차례를 섞어 찍고 카드 안에 들어가게 줄을 나눈다', () => {
  for (const [label, texts] of Object.entries(CASES)) {
    const plan = dolmen.plans(texts)[1];
    const cards = plan.pieces.filter((p) => p.name.startsWith('차례 카드'));
    assert.equal(cards.length, texts.length, label);
    const order = dolmen.cardOrder(texts.length);
    assert.deepEqual([...order].sort((a, b) => a - b), [...texts.keys()], `${label}: 글이 빠지거나 겹쳤습니다`);
    if (texts.length >= 3) assert.ok(order.every((t, k) => t !== k), `${label}: 제자리에 찍힌 카드가 있습니다 ${order}`);
    for (const card of cards) {
      const [x0, , x1] = bbox(card);
      for (const m of card.art.join('').matchAll(/<g data-card-line="\d+"><text [^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text><\/g>/g)) {
        const size = Number(m[1]);
        assert.ok(dolmen.CARD_TEXT_SIZES.includes(size));
        assert.ok(textWidth(m[2], size) <= x1 - x0 - 5.2 + EPS, `${label} · ${card.name}: "${m[2]}" 줄이 카드보다 깁니다`);
      }
    }
  }
  // 낱말 가운데를 끊지 않는다: 줄을 이으면 원래 글이다
  const plan = dolmen.plans(TEXTS)[1];
  const lines = (n: number) => [...plan.pieces.find((p) => p.name === `차례 카드 ${n}`)!.art.join('').matchAll(/data-card-line="\d+"><text [^>]*>([^<]*)</g)].map((m) => m[1]);
  dolmen.cardOrder(4).forEach((t, k) => assert.equal(lines(k + 1).join(' '), TEXTS[t]));
  // 한 줄에 한 글자만 남는 줄이 없다
  for (let k = 1; k <= 4; k++) for (const l of lines(k)) assert.ok([...l.replace(/[.\s]/g, '')].length >= 2, `"${l}"`);
});
