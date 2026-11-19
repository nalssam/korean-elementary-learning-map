// 탁자식 고인돌 전개도(generators/papercraft/modules/dolmen-table.ts)가 실제 크기 A4 에서 조립되는지 도면의 값으로 잰다.
// 브라우저 없이 돈다. 화면에 찍어 보는 시험은 page.test.ts 에 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xmlText } from '#lib/content.ts';
import mod, * as dolmen from '../../generators/papercraft/modules/dolmen-table.ts';
import { analyse, bbox, len, BODY_H, BODY_W, LEGEND_H, SVG_OPEN, textWidth, type Plan, type Seg } from '../../generators/papercraft/net.ts';

const TEXTS = ['땅을 파고 굄돌을 세웁니다.', '굄돌이 묻히도록 흙을 쌓아 언덕을 만듭니다.', '통나무를 깔고 덮개돌을 끌어 올립니다.', '흙을 걷어 내면 고인돌이 드러납니다.'];
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
    for (const s of [j.a, j.b]) assert.ok(edges.has(segKey(s)), `${j.what}: ${segKey(s)} 는 도안에 없는 변입니다`);
    assert.ok(Math.abs(len(j.a) - len(j.b)) < EPS, `${j.what}: ${len(j.a).toFixed(2)}mm 와 ${len(j.b).toFixed(2)}mm`);
    if (j.kind === 'glue') {
      assert.equal(edges.get(segKey(j.a))!.kind, 'fold', `${j.what}: 탭의 경첩이 접는 선이 아닙니다`);
      assert.ok(j.depth! > 0 && j.depth! < j.room!, `${j.what}: 탭 깊이 ${j.depth}mm 가 붙일 면(${j.room}mm)을 넘습니다`);
    }
  }
  // 탭마다 붙일 곳이 정해져 있다
  for (const plan of plans) for (const piece of plan.pieces) {
    for (const f of piece.faces.filter((f) => f.glue)) {
      const hinge = f.pts.slice(0, 2) as unknown as Seg;
      assert.ok(joins.some((j) => j.kind === 'glue' && segKey(j.a) === segKey(hinge)), `${piece.name}: 붙일 곳을 적지 않은 탭이 있습니다 (${segKey(hinge)})`);
    }
  }
});

test('세 돌의 높이가 같고, 받침판의 자리가 조각의 크기와 같으며 덮개돌 안에 든다', () => {
  const d = dolmen;
  assert.equal(d.UH, d.EH, '굄돌과 막음돌의 높이가 다르면 덮개돌이 기웁니다');
  assert.equal(d.RH, d.UH, '흙 경사로는 굄돌 꼭대기까지 닿습니다');
  assert.deepEqual([d.FOOT.left.w, d.FOOT.left.h], [d.UW, d.UD]);
  assert.deepEqual([d.FOOT.right.w, d.FOOT.right.h], [d.UW, d.UD]);
  assert.deepEqual([d.FOOT.end.w, d.FOOT.end.h], [d.EW, d.ED]);
  assert.deepEqual([d.FOOT.cap.w, d.FOOT.cap.h], [d.CL, d.CW]);
  const inside = (a: { x: number; y: number; w: number; h: number }, b: typeof a, gap: number) =>
    a.x >= b.x + gap && a.y >= b.y + gap && a.x + a.w <= b.x + b.w - gap && a.y + a.h <= b.y + b.h - gap;
  // 덮개돌의 옆면이 아래로 CH 만큼 내려오므로 세 돌은 덮개돌 자리 안쪽에 떨어져 서야 옆면에 걸리지 않는다
  for (const f of [d.FOOT.left, d.FOOT.right, d.FOOT.end]) assert.ok(inside(f, d.FOOT.cap, 2), `덮개돌 자리 밖으로 나간 돌이 있습니다 (${JSON.stringify(f)})`);
  assert.ok(inside(d.FOOT.cap, { x: 0, y: 0, w: d.BPW, h: d.BPH }, 2));
  // 덮개돌의 옆면은 굄돌보다 낮아야 덮개돌이 굄돌 위에 얹힌다
  assert.ok(d.CH < d.UH);
  // 세 돌이 서로 겹치지 않는다
  const [l, r, e] = [d.FOOT.left, d.FOOT.right, d.FOOT.end];
  assert.ok(l.x + l.w < r.x && e.y + e.h < l.y);
  // 통나무: 종이 폭이 지름 16mm 원기둥의 둘레다
  assert.ok(Math.abs(d.LOG_C - Math.PI * d.LOG_D) < EPS);
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
