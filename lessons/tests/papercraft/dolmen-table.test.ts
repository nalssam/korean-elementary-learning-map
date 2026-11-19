// 종이 고인돌 전개도(generators/papercraft/modules/dolmen-table.ts)가 실제 크기 A4 에서 조립되는지 도면의 값으로 잰다.
// 브라우저 없이 돈다. 화면에 찍어 보는 시험은 page.test.ts 에 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xmlText } from '#lib/content.ts';
import mod, * as dolmen from '../../generators/papercraft/modules/dolmen-table.ts';
import { analyse, bbox, len, BODY_H, BODY_W, LEGEND_H, MIN_TEXT, RULE, SVG_OPEN, textWidth, type Piece, type Plan, type Pt, type Seg } from '../../generators/papercraft/net.ts';

const TEXTS = ['받침돌을 세웁니다.', '흙과 돌을 쌓아 비탈을 만듭니다.', '통나무를 깔고 덮개돌을 끌어 올립니다.', '흙을 걷어 냅니다.'];
/** 검수 담당이 정한 만드는 법 (R11). 인쇄된 조각은 모두 이 단계 어딘가에서 이름으로 불린다. */
const STEPS = [
  '자르는 선을 따라 조각과 차례 카드를 오립니다.',
  '자를 대고 볼펜으로 접는 선을 꾹 눌러 금을 긋습니다.',
  '그림이 찍힌 쪽이 바깥으로 오게 접는 선을 접습니다.',
  '빗금 친 풀칠 칸에 풀을 바르고 같은 글자끼리 붙여 덮개돌, 받침돌 두 개, 흙 비탈을 만듭니다.',
  '통나무 세 개는 둥글게 말아 같은 글자끼리 붙입니다.',
  '조각은 바닥판에 붙이지 않습니다. 수업 때 바닥판에 찍힌 자리에 올려놓습니다.',
];
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
const piece = (name: string, texts = TEXTS): Piece => dolmen.plans(texts).flatMap((p) => p.pieces).find((p) => p.name === name)!;
/** 사각형 면의 [폭, 높이] */
const size = (pts: readonly Pt[]) => [Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))];
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

test('조각 목록 (R11): 덮개돌 1 · 받침돌 2 · 바닥판 1 · 흙 비탈 1 · 통나무 3 · 차례 카드 4, 쪽 머리의 부제가 그 목록과 같다', () => {
  const plans = dolmen.plans(TEXTS);
  const names = plans.map((p) => p.pieces.map((pc) => pc.name.replace(/ \d+$/, '')));
  const count = (list: string[]) => [...new Set(list)].map((n) => `${n} ${list.filter((x) => x === n).length}`);
  assert.deepEqual(names.flat().sort(), ['덮개돌', '바닥판', '받침돌', '받침돌', '차례 카드', '차례 카드', '차례 카드', '차례 카드', '통나무', '통나무', '통나무', '흙 비탈'].sort());
  const sheets = mod.sheets(TEXTS);
  plans.forEach((p, i) => assert.deepEqual(sheets[i].sub.split(' · ').sort(), count(names[i]).sort(), `${i + 1}쪽 부제`));
  assert.deepEqual(sheets.map((s) => s.sub), ['덮개돌 1 · 받침돌 2 · 통나무 3', '바닥판 1 · 흙 비탈 1 · 차례 카드 4']);
  // 인쇄된 조각은 모두 만드는 법의 단계에서 이름으로 불린다 (7절)
  const steps = STEPS.join(' ');
  for (const n of new Set(names.flat())) assert.ok(steps.includes(n), `만드는 법에 "${n}" 가 나오지 않습니다`);
});

test('바닥판에는 놓는 자리만 찍는다: 풀칠 탭도, 붙일 자리 글자도, 맞닿는 변도 없다 (R11)', () => {
  const bp = piece('바닥판');
  assert.equal(bp.faces.length, 1);
  assert.ok(bp.faces.every((f) => !f.glue));
  assert.deepEqual(bp.joins, []);
  const art = bp.art.join('');
  assert.doesNotMatch(art, /data-mark|>발<|풀/);
  // 어떤 조각의 탭도 바닥판을 가리키지 않는다
  for (const p of dolmen.plans(TEXTS)) for (const pc of p.pieces) for (const j of pc.joins) assert.notEqual(j.kind, 'seat', `${j.what}: 바닥판에 붙이는 조각이 있습니다`);
  assert.deepEqual(Object.keys(dolmen.FOOT).sort(), ['left', 'ramp', 'right'], '바닥판의 자리는 받침돌 둘과 흙 비탈뿐입니다');
  const shown = [...art.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(shown.filter((t) => t === '받침돌').length, 2);
  assert.ok(shown.includes('흙 비탈 자리'));
  assert.ok(!shown.includes('앞'), "무엇의 앞인지 알 수 없는 '앞' 은 찍지 않습니다");
});

test('접은 크기: 받침돌·흙 비탈·덮개돌·통나무를 전개도에서 재어 맞물리는지 본다', () => {
  const d = dolmen;
  const cap = piece('덮개돌'), sup = piece('받침돌 1'), ramp = piece('흙 비탈'), lg = piece('통나무 1');
  // 받침돌: 띠의 네 면 (두께, 너비, 두께, 너비) × 높이
  const [s0, s1] = [size(sup.faces[0].pts), size(sup.faces[1].pts)];
  const supportH = s0[1], supportW = s0[0], supportD = s1[0];
  assert.deepEqual([supportW, supportD, supportH], [d.SW, d.SD, d.SH]);
  // 덮개돌: 윗면과 밑면이 같고, 옆면 높이가 CH
  const [top, , , bottom] = cap.faces.map((f) => size(f.pts));
  assert.deepEqual(top, bottom, '덮개돌의 밑면이 윗면과 같아야 상자가 닫힙니다');
  const capL = top[0], capW = top[1];
  // 흙 비탈: 빗면(너비 × 빗변), 높은 쪽 면(너비 × 높이), 옆면 세모 둘
  const [slope, high] = [size(ramp.faces[0].pts), size(ramp.faces[1].pts)];
  const tri = ramp.faces[2].pts;
  const sides = [len([tri[0], tri[1]]), len([tri[1], tri[2]]), len([tri[2], tri[0]])];
  const [hyp, a, b] = [sides[0], sides[2], sides[1]]; // 빗변(경첩) · 세운 변(높은 쪽 면에 붙는다) · 밑변(바닥에 닿는다)
  assert.ok(near(hyp, slope[1]), '옆면 세모의 빗변은 빗면의 길이와 같습니다');
  assert.ok(near(a * a + b * b, hyp * hyp), '옆면은 직각삼각형이어야 쐐기가 바닥에 반듯이 섭니다');
  assert.ok(near(a, high[1]), '옆면의 세운 변은 높은 쪽 면의 높이와 같습니다');
  // R11: 높은 쪽의 높이 = 받침돌 높이, 윗면 너비 ≥ 덮개돌 너비
  assert.ok(near(high[1], supportH), `흙 비탈 높은 쪽 ${high[1]}mm 와 받침돌 높이 ${supportH}mm 가 다릅니다`);
  assert.ok(slope[0] >= capW, `흙 비탈 윗면 너비 ${slope[0]}mm 가 덮개돌 너비 ${capW}mm 보다 좁습니다`);
  // 바닥판의 흙 비탈 자리는 접은 쐐기의 밑과 같고, 높은 끝이 왼쪽 받침돌 자리에 맞닿는다
  assert.ok(near(d.FOOT.ramp.w, b) && near(d.FOOT.ramp.h, slope[0]), '흙 비탈 자리가 쐐기의 밑과 다릅니다');
  assert.ok(near(d.FOOT.ramp.x + d.FOOT.ramp.w, d.FOOT.left.x), '흙 비탈의 높은 끝이 왼쪽 받침돌에 닿지 않습니다');
  // 받침돌 자리 = 받침돌의 밑, 흙 비탈 자리의 너비 안에 든다 (덮개돌이 비탈에서 받침돌 위로 곧장 넘어간다)
  for (const f of [d.FOOT.left, d.FOOT.right]) assert.deepEqual([f.w, f.h], [supportW, supportD]);
  assert.ok(d.FOOT.left.y >= d.FOOT.ramp.y && d.FOOT.left.y + d.FOOT.left.h <= d.FOOT.ramp.y + d.FOOT.ramp.h);
  const board = { x: 0, y: 0, w: d.BPW, h: d.BPH };
  for (const f of Object.values(d.FOOT)) assert.ok(inside(f, board, 2), `자리가 바닥판 밖으로 나갑니다 (${JSON.stringify(f)})`);
  assert.ok(apart(d.FOOT.left, d.FOOT.right, 20), '두 받침돌이 너무 붙어 있습니다');
  assert.equal(d.FOOT.left.y, d.FOOT.right.y, '두 받침돌은 나란히 섭니다');
  // 다 세웠을 때: 덮개돌이 두 받침돌을 다 덮고, 양 끝이 받침돌 밖으로 나온다. 무게중심이 받침돌 너비 안에 든다.
  assert.ok(near(d.CAP.w, capL) && near(d.CAP.h, capW));
  for (const f of [d.FOOT.left, d.FOOT.right]) assert.ok(inside(f, d.CAP, 2), '덮개돌이 받침돌을 다 덮지 않습니다');
  const mid = d.CAP.y + capW / 2;
  assert.ok(d.FOOT.left.y + 5 <= mid && mid <= d.FOOT.left.y + supportD - 5, '덮개돌이 앞뒤로 기웁니다');
  // 통나무: 종이 폭이 둘레이고, 빗면 위에 눕고 덮개돌 밑에 든다
  const [logC, logL] = size(lg.faces[0].pts);
  assert.ok(near(logC, Math.PI * d.LOG_D));
  assert.ok(logL <= slope[0] && logL <= capW, `통나무(${logL}mm)가 빗면이나 덮개돌보다 깁니다`);
});

test('조립 표시: 한 글자는 두 쪽을 통틀어 한 곳의 붙임만 뜻하고, 탭에 진하게 한 번, 붙일 자리에 옅게 한 번 찍힌다', () => {
  for (const texts of Object.values(CASES)) {
    const plans = dolmen.plans(texts);
    const glues = plans.flatMap((p) => p.pieces.flatMap((pc) => pc.joins)).filter((j) => j.kind === 'glue');
    const marks = glues.map((j) => j.mark);
    assert.ok(marks.every((m) => typeof m === 'string' && m.length === 1), '글자가 없는 풀칠 탭이 있습니다');
    assert.equal(new Set(marks).size, marks.length, `같은 글자를 두 붙임에 썼습니다: ${marks.join('')}`);
    const svg = mod.sheets(texts).map((s) => s.svg);
    for (const m of marks) {
      const on = svg.map((s) => [...s.matchAll(new RegExp(`<g data-mark="${m}" data-mark-role="(tab|target)">(.*?)</g>`, 'g'))]);
      const all = on.flat();
      assert.deepEqual(all.map((x) => x[1]).sort(), ['tab', 'target'], `${m}: 탭 하나와 자리 하나에 찍혀야 합니다`);
      assert.equal(on.filter((x) => x.length).length, 1, `${m}: 두 쪽에 나뉘어 찍혔습니다`);
      const target = all.find((x) => x[1] === 'target')![2], tabMark = all.find((x) => x[1] === 'tab')![2];
      const fs = (g: string) => Number(g.match(/font-size="([\d.]+)"/)![1]);
      assert.ok(target.includes(`fill="${RULE}"`) && fs(target) < fs(tabMark), `${m}: 붙일 자리의 글자는 --rule 회색으로, 탭보다 작게 찍습니다`);
    }
    const printed = svg.flatMap((s) => [...s.matchAll(/data-mark="([^"]+)"/g)].map((x) => x[1]));
    assert.deepEqual([...new Set(printed)].sort(), [...marks].sort());
  }
});

test('도안의 글: 모두 8pt(2.83mm) 이상이고 바로 서 있다 (돌려 찍은 글이 없다)', () => {
  for (const [label, texts] of Object.entries(CASES)) {
    for (const [i, s] of mod.sheets(texts).entries()) {
      const sizes = [...s.svg.matchAll(/<text [^>]*font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
      assert.ok(sizes.length > 10);
      assert.ok(Math.min(...sizes) >= MIN_TEXT, `${label} · ${i + 1}쪽: ${Math.min(...sizes)}mm 글이 있습니다 (8pt = ${MIN_TEXT}mm)`);
      assert.doesNotMatch(s.svg, /<text[^>]*transform=/, `${label} · ${i + 1}쪽: 돌려 찍은 글이 있습니다`);
    }
  }
});

test('아이가 읽는 글: 도안과 그림에 덮개돌·받침돌 말고 다른 돌 이름이 없다 (R1, 15절)', () => {
  const words = /굄돌|고임돌|막음돌|받침판|탁자식|굴림대|경사로/;
  const shown = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ');
  for (const [label, texts] of Object.entries(CASES)) {
    for (const s of mod.sheets(texts)) {
      assert.doesNotMatch(s.title + s.sub, words, label);
      assert.doesNotMatch(shown(s.svg), words, `${label} · ${s.title}`);
    }
  }
  assert.deepEqual(mod.sheets(TEXTS).map((s) => s.title), ['종이 고인돌 · 돌과 통나무', '종이 고인돌 · 바닥판과 흙 비탈']);
  const pv = mod.preview();
  assert.doesNotMatch(shown(pv) + pv.match(/aria-label="([^"]*)"/)![1], words);
  // 그림의 이름표는 R1 의 낱말과 그림 이름뿐이다
  const L = dolmen.figureLayout();
  const allowed = new Set(['덮개돌', '받침돌', '바닥판', '흙 비탈', '통나무', '흙 비탈 자리', '덮개돌을 끌어 올리는 모습', '여러 짐작 가운데 하나', '흙 비탈을 치운 모습']);
  for (const p of L.panels) for (const l of p.labels) assert.ok(allowed.has(l.text), `그림에 "${l.text}" 가 있습니다`);
  // 끌어 올리는 그림 바로 밑에 '여러 짐작 가운데 하나' 를 적는다 (R2)
  const first = L.panels[0].labels.map((l) => l.text);
  assert.ok(first.indexOf('여러 짐작 가운데 하나') === first.indexOf('덮개돌을 끌어 올리는 모습') + 1);
});

test('그림 둘: 그린 조각이 전개도와 같은 크기이고, 끌어 올리는 그림의 덮개돌이 통나무 위에, 통나무가 빗면 위에 있다', () => {
  const d = dolmen;
  const L = d.figureLayout();
  assert.equal(L.panels.length, 2);
  const sol = (panel: number, name: string) => L.solids.filter((s) => s.panel === panel && s.name === name);
  for (const k of [0, 1]) {
    const sup = sol(k, '받침돌');
    assert.equal(sup.length, 2, '받침돌은 둘입니다');
    for (const [s, f] of [[sup[0], d.FOOT.left], [sup[1], d.FOOT.right]] as const) {
      assert.deepEqual([s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0], [f.x, f.y, d.SW, d.SD, d.SH]);
    }
  }
  // 왼쪽: 흙 비탈은 제 자리에 높은 쪽이 받침돌 높이로, 덮개돌은 아직 받침돌 위에 없다
  const [ramp] = sol(0, '흙 비탈');
  assert.deepEqual([ramp.x0, ramp.y0, ramp.x1 - ramp.x0, ramp.y1 - ramp.y0, ramp.z1], [d.FOOT.ramp.x, d.FOOT.ramp.y, d.RL, d.RW, d.SH]);
  assert.equal(sol(0, '덮개돌').length, 0);
  assert.equal(L.panels[0].logs.length, 3, '통나무는 셋입니다');
  // 통나무 중심은 빗면에서 반지름만큼 떠 있고, 덮개돌의 밑면은 빗면에서 지름만큼 떠 있다 (onSlope 의 n)
  for (const u of d.PULL.logs) assert.ok(u - d.LOG_D / 2 >= 0 && u + d.LOG_D / 2 <= d.RS, '통나무가 빗면 밖에 있습니다');
  for (const u of d.PULL.logs) assert.ok(u >= d.PULL.lead - d.CL && u <= d.PULL.lead, '통나무가 덮개돌 밑에 있지 않습니다');
  assert.ok(d.PULL.lead < d.RS, '덮개돌이 아직 비탈 위에 있어야 합니다 (끌어 올리는 중)');
  const [tailX, tailZ] = d.onSlope(d.PULL.lead - d.CL, d.LOG_D);
  assert.ok(tailZ > 0, `덮개돌 뒤끝(${tailX.toFixed(1)}, ${tailZ.toFixed(1)})이 땅에 박힙니다`);
  const [headX] = d.onSlope(d.PULL.lead, d.LOG_D + d.CH);
  assert.ok(headX < d.FOOT.left.x, '덮개돌 앞끝이 받침돌에 박힙니다');
  // 오른쪽: 흙 비탈은 없고, 덮개돌이 받침돌 꼭대기에 얹혀 있다
  assert.equal(sol(1, '흙 비탈').length, 0);
  assert.equal(L.panels[1].logs.length, 0);
  const [cap] = sol(1, '덮개돌');
  assert.deepEqual([cap.x0, cap.y0, cap.x1 - cap.x0, cap.y1 - cap.y0, cap.z0, cap.z1 - cap.z0], [d.CAP.x, d.CAP.y, d.CL, d.CW, d.SH, d.CH]);
});

/** 선분 ab 가 사각형과 만나는가 */
function hits(a: Pt, b: Pt, [x0, y0, x1, y1]: [number, number, number, number]): boolean {
  for (let i = 0; i <= 400; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 400, y = a[1] + ((b[1] - a[1]) * i) / 400;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}

test('그림의 이름표: 어떤 선도 이름표를 지나가지 않고, 이름표끼리 겹치지 않으며 그림 안에 든다', () => {
  const L = dolmen.figureLayout();
  const [vx, vy, vw, vh] = L.viewBox;
  for (const p of L.panels) {
    const segs: [Pt, Pt][] = [
      ...p.faces.flatMap((f) => f.pts.map((q, i) => [q, f.pts[(i + 1) % f.pts.length]] as [Pt, Pt])),
      ...p.logs.flatMap((g) => [g.back, g.front].flatMap((c) => Array.from({ length: 24 }, (_, i) => {
        const t = (i / 24) * 2 * Math.PI, u = ((i + 1) / 24) * 2 * Math.PI;
        return [[c[0] + g.r * Math.cos(t), c[1] + g.r * Math.sin(t)], [c[0] + g.r * Math.cos(u), c[1] + g.r * Math.sin(u)]] as [Pt, Pt];
      }))),
      ...p.leaders,
    ];
    for (const l of p.labels) {
      const [x0, y0, x1, y1] = l.box;
      assert.ok(x0 >= vx && y0 >= vy && x1 <= vx + vw && y1 <= vy + vh, `"${l.text}" 가 그림 밖으로 나갑니다`);
      // 지시선의 끝은 이름표 가장자리에서 0.8 떨어져 멈춘다. 이름표 상자 안으로는 어떤 선도 들어오지 않는다.
      const box: [number, number, number, number] = [x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2];
      for (const [a, b] of segs) assert.ok(!hits(a, b, box), `선이 "${l.text}" 를 지나갑니다`);
    }
    for (let i = 0; i < p.labels.length; i++) for (let j = i + 1; j < p.labels.length; j++) {
      const a = p.labels[i].box, b = p.labels[j].box;
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `"${p.labels[i].text}" 와 "${p.labels[j].text}" 가 겹칩니다`);
    }
  }
  // 그림의 글은 모두 FIG_TEXT 로 찍는다 (페이지가 이 크기로 그림 칸의 높이를 정한다)
  const sizes = [...mod.preview().matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual([...new Set(sizes)], [dolmen.FIG_TEXT]);
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
