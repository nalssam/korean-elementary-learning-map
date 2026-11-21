// PPTX 생성기(generators/pptx/build.mjs → build_pptx.py)를 시험용 명세로 돌려 본다.
//  - 장 수·크기·교사 메모(slideNotes)·퀴즈 정답·마지막 장의 출처와 바닥글
//  - 장의 둘레 (R55): 모든 장의 바닥글 줄(stageFooter), 표지가 아닌 장의 두 자리 장 번호(Pretendard Medium), 단계 머리말
//  - 그림을 자르거나 늘이지 않았다 · 색은 tokens.css 의 것만 · Pretendard 를 심었다 · 다시 돌리면 캐시에서 복사한다
//  - 가장 긴 글로 채운 장도 넘치지 않는다 (LibreOffice 로 PDF 를 찍어 글줄이 글상자 안에 있는지 본다. soffice 가 없으면 그 부분만 건너뛴다)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, answerText, creditList, isPublic, loadLesson, sheetFooter, shownMedia, slideNotes, stageFooter, visibleLessons } from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { slideCounter, slideFrame } from '#src/components/slides/counter.ts';
import { FIXTURES, noChromium, noPython } from '../contract/helpers.ts';
import { CREDIT_COPY, NOTE_COPY, STAGE_PHASE, STAGE_TYPE } from '#src/components/slides/copy.ts';
import { DOLMEN_STEPS, EVEN_ITEMS, STRESS_ID, makeStress } from './stress.ts';

const OUT = path.join(ROOT, '.cache', 'tests', `slides-pptx-${process.pid}`);
const PYTHON = process.env.PYTHON || 'python3';
const skip = noPython() || (await noChromium());
const noOffice = spawnSync('soffice', ['--version'], { stdio: 'ignore' }).status === 0 && spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error === undefined
  ? false : 'LibreOffice(soffice) 나 pdftotext 가 없어 PDF 로 찍어 보는 넘침 검사를 건너뜁니다';
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

function run(content: string, dist: string, extra: string[] = []): string {
  const env: NodeJS.ProcessEnv = { ...process.env, CONTENT_DIR: content, SHOW_DRAFTS: '1' };
  delete env.SITE_URL; delete env.DIST_DIR;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'generators', 'pptx', 'build.mjs'), '--out', dist, ...extra], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `build.mjs 가 실패했습니다:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

interface Inspected {
  width: number; height: number; embedded: string[]; fontdata: string[]; colors: string[]; faces: string[];
  core: { title: string; author: string; last_modified_by: string; comments: string; keywords: string; revision: number };
  raw: { core: string; app: string; sldSz: string };
  slides: { texts: string[]; boxes: number[][]; fonts: ([string, number | null, boolean] | null)[]; notes: string; pictures: { ratio_shape: number; ratio_image: number; crop: number[]; inside: boolean; alt: string; box: number[]; line: [number, string] | null }[] }[];
  lang: { runs: number; ends: number; missing: string[]; runs_total: number; paras_total: number };
}
const inspect = (file: string): Inspected =>
  JSON.parse(execFileSync(PYTHON, [path.join(ROOT, 'tests', 'slides', 'inspect_pptx.py'), file], { encoding: 'utf8', maxBuffer: 64 << 20 }));

const tokenColors = () => [...fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8').matchAll(/--[a-z-]+:\s*#([0-9a-fA-F]{6})/g)].map((m) => m[1].toUpperCase());

test('시험용 명세 넷의 PPTX', { skip }, () => {
  const dist = path.join(OUT, 'fixtures');
  const first = run(FIXTURES, dist);
  assert.match(first, /새로 만듦 4, 캐시에서 복사 0/);
  process.env.CONTENT_DIR = FIXTURES;
  process.env.SHOW_DRAFTS = '1';
  // .cache/lessons.json 은 --out 옆의 캐시 폴더에 생긴다 (10절)
  const json = JSON.parse(fs.readFileSync(`${dist}.cache/lessons.json`, 'utf8'));
  assert.deepEqual(json.lessons.map((l: { id: string }) => l.id), visibleLessons().map((l) => l.id));
  const colors = new Set(tokenColors());
  for (const lesson of visibleLessons()) {
    const file = path.join(dist, 'files', lesson.id, 'slides.pptx');
    assert.ok(fs.existsSync(file), file);
    const p = inspect(file);
    assert.equal(p.width, 12192000); // 13.333in
    assert.equal(p.height, 6858000); // 7.5in
    // 명세의 장 하나 = PPTX 한 장, 그 뒤에 출처 장
    const n = lesson.slides.length;
    assert.ok(p.slides.length >= n + 1, `${lesson.id} 장 수`);
    lesson.slides.forEach((slide, i) => {
      const want = [...slideNotes(lesson, i + 1)];
      if (slide.layout === 'quiz') {
        const q = lesson.quiz.items[slide.item - 1];
        want.push(`${NOTE_COPY.answer}: ${answerText(q)}`, `${NOTE_COPY.explain}: ${q.explain}`);
      }
      assert.equal(p.slides[i].notes, want.join('\n'), `${lesson.id} ${i + 1}번 장 메모`);
      if ('title' in slide) assert.ok(p.slides[i].texts.includes(slide.title), `${lesson.id} ${i + 1}번 장 제목`);
      // 장의 둘레 (R55): 바닥글 줄은 모든 장, 장 번호는 표지가 아닌 장에 두 자리로 (Pretendard Medium), 단계 머리말은 제 머리말이 없는 장
      const at = `${lesson.id} ${i + 1}번 장(${slide.layout})`;
      const frame = slideFrame(lesson, i + 1);
      const sl = p.slides[i];
      const foot = sl.texts.indexOf(stageFooter(lesson));
      assert.ok(foot >= 0, `${at}: 바닥글 줄`);
      assert.deepEqual(sl.fonts[foot], ['Pretendard', STAGE_TYPE.footer / 2, false], `${at}: 바닥글 줄의 글꼴`);
      const counters = sl.texts.filter((t) => /^(\d+차시 )?\d+ \/ \d+$/.test(t));
      if (slide.layout === 'title') assert.deepEqual(counters, [], `${at}: 표지에 장 번호가 있습니다`);
      else {
        assert.deepEqual(counters, [slideCounter(lesson, i + 1).text], `${at}: 장 번호`);
        assert.deepEqual(sl.fonts[sl.texts.indexOf(counters[0])], ['Pretendard Medium', STAGE_TYPE.counter / 2, false], `${at}: 장 번호의 글꼴`);
        // 장 번호와 바닥글 줄은 같은 줄에 선다 (아래 끝이 같다)
        assert.ok(Math.abs(sl.boxes[sl.texts.indexOf(counters[0])][3] - sl.boxes[foot][3]) < 0.1);
      }
      if (frame.phase) {
        const k = sl.texts.indexOf(frame.phase);
        assert.ok(k >= 0, `${at}: 단계 머리말 ${frame.phase}`);
        assert.deepEqual(sl.fonts[k], ['Pretendard', STAGE_TYPE.phase / 2, true], `${at}: 단계 머리말의 글꼴`);
        // 머리말은 위 여백 안에 있고, 제목은 머리말이 없는 장과 같은 자리(무대 80 = 40pt)에서 시작한다
        assert.ok(Math.abs(sl.boxes[k][1] - STAGE_PHASE.top / 2) < 0.1);
        const t = 'title' in slide ? sl.texts.indexOf(slide.title) : -1;
        if (t >= 0) { assert.ok(sl.boxes[k][3] <= sl.boxes[t][1] + 0.1, `${at}: 머리말과 제목이 겹칩니다`); assert.ok(Math.abs(sl.boxes[t][1] - 40) < 0.1, `${at}: 제목 자리 ${sl.boxes[t][1]}pt`); }
      } else assert.ok(!sl.texts.some((t) => /^\d{2} (도입|전개|정리)$/.test(t)), `${at}: 단계 머리말이 있으면 안 됩니다`);
    });
    // 마지막 장(그림 출처)의 출처와 바닥글, 바닥글 줄과 메모. 출처 장에는 장 번호가 없다
    const tail = p.slides.slice(n).flatMap((s) => s.texts);
    for (const sl of p.slides.slice(n)) {
      assert.ok(sl.texts.includes(stageFooter(lesson)), `${lesson.id} 출처 장의 바닥글 줄`);
      assert.ok(!sl.texts.some((t) => /^(\d+차시 )?\d+ \/ \d+$/.test(t)), `${lesson.id} 출처 장에 장 번호가 있습니다`);
      assert.equal(sl.notes, shownMedia(lesson, 'slides').length ? CREDIT_COPY.notes : CREDIT_COPY.notesEmpty);
    }
    for (const c of creditList(shownMedia(lesson, 'slides'))) {
      assert.ok(tail.includes(c.text), `${lesson.id} 출처: ${c.text}`);
      for (const u of [c.sourceUrl, c.licenceUrl]) if (u) assert.ok(tail.includes(u), u);
    }
    // 수업 중에 띄우는 장이라 그림 제목(「…」)을 넣지 않는다
    assert.ok(!tail.some((t) => t.includes('「')), `${lesson.id}: 출처 장에 그림 제목이 있습니다`);
    // sheetFooter: 공개된 차시는 따로 한 줄 (만든 이·이용 조건·주소). 초안은 초안 표시뿐이라 바닥글 줄의 끝에 이미 있다 (두 번 찍지 않는다)
    if (isPublic(lesson)) assert.ok(tail.includes(sheetFooter(lesson)));
    else {
      assert.ok(stageFooter(lesson).endsWith(sheetFooter(lesson)));
      assert.ok(!tail.includes(sheetFooter(lesson)), `${lesson.id}: 출처 장에 초안 표시가 두 번 있습니다`);
    }
    // 초안은 장마다 초안 표시가 있다
    if (!isPublic(lesson)) p.slides.forEach((sl, i) => assert.ok(sl.texts.some((t) => t.includes('초안')), `${lesson.id} ${i + 1}번 장 초안 표시`));
    // 파일 정보: python-pptx 틀의 이름·날짜·4:3 이 남지 않는다
    assert.equal(p.core.title, `${isPublic(lesson) ? '' : '[검수 전 초안] '}${lesson.title} 수업 화면`);
    assert.equal(p.core.author, SITE.author);
    assert.equal(p.core.last_modified_by, SITE.author);
    assert.equal(p.core.comments, '');
    assert.equal(p.core.keywords, SITE.licence.name);
    assert.equal(p.core.revision, 1);
    for (const bad of ['Steve Canny', 'python-pptx', '2013']) assert.ok(!p.raw.core.includes(bad), `core.xml: ${bad}`);
    for (const bad of ['Macintosh', '4:3', 'Microsoft']) assert.ok(!p.raw.app.includes(bad), `app.xml: ${bad}`);
    assert.ok(!p.raw.sldSz.includes('screen4x3') && !p.raw.sldSz.includes('type='), p.raw.sldSz);
    // 그림: 자르지 않고, 늘이지 않고, 대체 글이 있다
    for (const s of p.slides) for (const pic of s.pictures) {
      assert.deepEqual(pic.crop, [0, 0, 0, 0]);
      assert.ok(Math.abs(pic.ratio_shape / pic.ratio_image - 1) < 0.01, `${lesson.id} 그림 비율 ${pic.ratio_shape} / ${pic.ratio_image}`);
      assert.ok(pic.inside && pic.alt);
    }
    // 색은 tokens.css 의 것만. 글꼴은 Pretendard(보통·굵게)와 장 번호의 Pretendard Medium 을 통째로 심어 둔다
    for (const c of p.colors) assert.ok(colors.has(c), `${lesson.id}: tokens.css 에 없는 색 ${c}`);
    assert.deepEqual(p.faces, ['Pretendard', 'Pretendard Medium']);
    assert.deepEqual(p.embedded, ['Pretendard', 'Pretendard Medium']);
    assert.equal(p.fontdata.length, 3);
    // 글 조각과 문단 끝마다 언어가 ko-KR(altLang en-US)이다 (장과 메모란 모두. PowerPoint 가 영어 맞춤법 검사로 한글에 밑줄을 긋지 않게)
    assert.deepEqual(p.lang.missing, [], `${lesson.id}: 언어가 없는 글 조각`);
    assert.ok(p.lang.runs > 0 && p.lang.runs === p.lang.runs_total, `${lesson.id}: 글 조각 ${p.lang.runs_total} 가운데 ${p.lang.runs} 만 언어를 셌습니다`);
    assert.equal(p.lang.ends, p.lang.paras_total, `${lesson.id}: 문단 ${p.lang.paras_total} 가운데 문단 끝 ${p.lang.ends}`);
  }
  // 퀴즈 장의 정답은 화면에 없고 메모에만 있다
  const one = loadLesson('5-2/1/01');
  const quizAt = one.slides.findIndex((s) => s.layout === 'quiz');
  const p1 = inspect(path.join(dist, 'files', '5-2/1/01', 'slides.pptx'));
  assert.ok(!p1.slides[quizAt].texts.some((t) => t.includes('정답')));
  // 같은 출처는 한 줄로 묶는다: 출처 장은 한 장이고, 출처 줄 수는 creditList 의 줄 수와 같다
  const credits = creditList(shownMedia(one, 'slides'));
  assert.equal(p1.slides.length - one.slides.length, 1);
  assert.equal(p1.slides.at(-1)!.texts.filter((t) => credits.some((c) => c.text === t)).length, credits.length);
  // 다시 돌리면 캐시에서 복사만 한다. 하나만(--only) 돌릴 수도 있다.
  assert.match(run(FIXTURES, dist), /새로 만듦 0, 캐시에서 복사 4/);
  assert.match(run(FIXTURES, dist, ['--only', '5-2/1/04']), /PPTX 1개 \(새로 만듦 0, 캐시에서 복사 1\)/);
});

let stressFile: string | undefined;
let stressSlides: { layout: string; media?: string; steps?: { media?: string }[] }[] = [];
/** 가장 긴 글로 채운 묶음의 PPTX 를 한 번 만든다 */
function stressPptx(): string {
  if (stressFile) return stressFile;
  const content = path.join(OUT, 'stress-content');
  fs.cpSync(FIXTURES, content, { recursive: true });
  const file = path.join(content, ...STRESS_ID.split('/'), 'lesson.yaml');
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  makeStress(content, raw);
  stressSlides = raw.slides;
  fs.writeFileSync(file, YAML.stringify(raw));
  const dist = path.join(OUT, 'stress');
  // 넘칠 장이 있으면 build_pptx.py 가 어느 장인지 적고 멈춘다 (build.mjs 가 0 이 아닌 값으로 끝난다)
  run(content, dist, ['--only', STRESS_ID]);
  return (stressFile = path.join(dist, 'files', STRESS_ID, 'slides.pptx'));
}

test('가장 긴 글로 채운 PPTX 를 만들 수 있다 (모든 layout, 그림 있음·없음)', { skip }, () => {
  const p = inspect(stressPptx());
  for (const s of p.slides) for (const pic of s.pictures) assert.ok(Math.abs(pic.ratio_shape / pic.ratio_image - 1) < 0.01);
});

test('PPTX: 글 곁에 그림 하나를 둔 장은 두 칸 짜임이고, 그림 넷의 단계 장은 2 × 2 다 (R12, R22)', { skip }, () => {
  const p = inspect(stressPptx());
  // 치수는 pt (장 폭 960pt = 무대 1920px). 본문 자리는 위 40pt, 아래 540 - 44pt
  const W = 960, TOP = 40, BOTTOM = 540 - 44;
  let sided = 0;
  stressSlides.forEach((sl, i) => {
    if (!((sl.layout === 'points' || sl.layout === 'question') && sl.media === 'labelled')) return;
    sided++;
    const s = p.slides[i];
    assert.equal(s.pictures.length, 1, `${i + 1}번 장 그림`);
    const [px0, py0, px1, py1] = s.pictures[0].box;
    // 그림은 오른쪽 칸에: 오른쪽 끝이 본문 오른쪽 끝(60pt 안쪽)에 닿고, 폭이 장의 42% 이상이거나 본문 높이를 다 쓴다
    assert.ok(Math.abs(px1 - (W - 60)) < 1, `${i + 1}번 장: 그림이 오른쪽 끝에 붙지 않았습니다 (${px1})`);
    assert.ok((px1 - px0) / W >= 0.42 - 0.001 || py1 - py0 >= (BOTTOM - TOP) * 0.85, `${i + 1}번 장: 그림 폭 ${((px1 - px0) / W * 100).toFixed(1)}%`);
    // 글 덩어리: 그림 왼쪽에 있는 글상자 (제목은 장 폭 전체라 빠진다, 장 번호·초안 표시는 아래 여백에 있어 빠진다)
    const text = s.boxes.filter(([x0, y0, x1]) => x1 <= px0 + 0.5 && y0 < BOTTOM);
    assert.ok(text.length > 0, `${i + 1}번 장: 그림 왼쪽에 글이 없습니다`);
    const ty0 = Math.min(...text.map((b) => b[1])), ty1 = Math.max(...text.map((b) => b[3]));
    const mid = Math.abs((ty0 + ty1) / 2 - (py0 + py1) / 2);
    const top = Math.abs(ty0 - py0);
    assert.ok(mid <= 20 || (ty1 - ty0 > py1 - py0 && top <= 4), `${i + 1}번 장: 글과 그림의 세로 가운데 ${mid.toFixed(0)}pt, 위 끝 ${top.toFixed(0)}pt`);
  });
  assert.ok(sided >= 4);
  // 그림 넷이고 글이 짧은 단계 장: 2 × 2 로 놓인다 (R22)
  const at = stressSlides.findIndex((sl) => sl.layout === 'steps' && sl.steps!.length === 4 && sl.steps!.every((st) => st.media === 'labelled'));
  const pics = p.slides[at].pictures.map((x) => x.box);
  assert.equal(pics.length, 4);
  assert.equal(new Set(pics.map((b) => Math.round(b[1]))).size, 2, '2 × 2 가 아닙니다');
});

test('PPTX: 단계 장 2 × 2 는 머리 한 줄 아래에 칸 폭의 그림 상자, 견주기 장의 두 그림은 같은 높이, 함께 보는 그림은 두 칸 (R22, R23)', { skip }, () => {
  const p = inspect(stressPptx());
  const raw = stressSlides as unknown as Record<string, any>[];
  // R22: 실제 차시의 단계 글 넷 + 가로로 넓은 단계 그림. 글은 한 줄(40px 이상 = 20pt 이상, 한 줄 높이 27~30pt), 그림은 폭 500px(250pt) 이상
  const at = raw.findIndex((sl) => sl.layout === 'steps' && sl.steps.map((st: { text: string }) => st.text).join() === DOLMEN_STEPS.join() && sl.steps[0].media === 'step1');
  const s = p.slides[at];
  const pics = s.pictures.map((x) => x.box);
  assert.equal(pics.length, 4);
  assert.equal(new Set(pics.map((b) => Math.round(b[1]))).size, 2, '2 × 2 가 아닙니다');
  for (const b of pics) assert.ok(b[2] - b[0] >= 250, `단계 그림 폭 ${((b[2] - b[0]) * 2).toFixed(0)}px`);
  for (const t of DOLMEN_STEPS) {
    const box = s.boxes[s.texts.indexOf(t)];
    assert.ok(box, `단계 글이 없습니다: ${t}`);
    const h = box[3] - box[1];
    assert.ok(h >= 40 * 1.35 / 2 - 0.5 && h <= 44 * 1.35 / 2 + 0.5, `${t}: 글상자 높이 ${h.toFixed(1)}pt (한 줄이 아닙니다)`);
    // 머리(글)는 그 칸의 그림보다 위에 있다
    const left = box[0] < 480;
    const pic = pics.filter((b) => ((b[0] + b[2]) / 2 < 480) === left && b[1] > box[1]).sort((a, b) => a[1] - b[1])[0];
    assert.ok(pic && pic[1] >= box[3], `${t}: 그림이 머리 아래에 있지 않습니다`);
  }
  // R23b: 쪽마다 그림 하나 (항목 수가 다른 두 쪽). 두 출처 표시와 두 첫 항목의 위 끝이 같다
  const pair = raw.findIndex((sl) => sl.layout === 'compare' && sl.left.media === 'square' && sl.right.media === 'sample');
  const c = p.slides[pair];
  const top = (t: string) => c.boxes[c.texts.indexOf(t)][1];
  const credits = c.texts.map((t, i) => [t, c.boxes[i][1]] as const).filter(([t]) => /^(그림|사진):/.test(t));
  assert.equal(credits.length, 2);
  assert.ok(Math.abs(credits[0][1] - credits[1][1]) < 0.5, `출처 표시 높이 ${credits[0][1]} / ${credits[1][1]}`);
  assert.ok(Math.abs(top(raw[pair].left.points[0]) - top(raw[pair].right.points[0])) < 0.5, '첫 항목의 높이가 다릅니다');
  // R23a: 함께 보는 그림 하나. 그림은 오른쪽 칸, 이름표 상자 둘은 그림 왼쪽에 위아래로
  const shared = raw.findIndex((sl) => sl.layout === 'compare' && sl.media);
  const d = p.slides[shared];
  assert.equal(d.pictures.length, 1);
  const [px0] = d.pictures[0].box;
  assert.ok(Math.abs(d.pictures[0].box[2] - (960 - 60)) < 1, '그림이 오른쪽 끝에 붙지 않았습니다');
  assert.ok((d.pictures[0].box[2] - px0) / 960 >= 0.42 - 0.001, '그림 칸이 42% 보다 좁습니다');
  const labels = [raw[shared].left.label, raw[shared].right.label].map((t: string) => d.boxes[d.texts.indexOf(t)]);
  assert.ok(labels.every((b) => b[2] <= px0), '이름표 상자가 그림 왼쪽에 있지 않습니다');
  assert.ok(labels[1][1] > labels[0][3], '이름표 상자 둘이 위아래로 쌓이지 않았습니다');
});

test('PPTX: 한 줄짜리 항목은 한 줄 상자를 받아 항목 사이가 고르다 (글꼴의 글자 폭으로 잰다)', { skip }, () => {
  const p = inspect(stressPptx());
  const at = stressSlides.findIndex((sl) => (sl as { instructions?: string[] }).instructions?.[0] === EVEN_ITEMS[0]);
  const s = p.slides[at];
  const boxes = EVEN_ITEMS.map((t) => s.boxes[s.texts.indexOf(t)]);
  const heights = boxes.map((b) => b[3] - b[1]);
  assert.ok(heights.every((h) => Math.abs(h - heights[0]) < 0.5), `항목 상자 높이가 다릅니다: ${heights.map((h) => h.toFixed(1))}`);
  const gaps = [boxes[1][1] - boxes[0][1], boxes[2][1] - boxes[1][1]];
  assert.ok(Math.abs(gaps[0] - gaps[1]) < 0.5, `항목 사이가 고르지 않습니다: ${gaps.map((g) => g.toFixed(1))}pt`);
});

test('PPTX: 사진에는 --line 색의 가는 테두리를 두르고, 도해에는 두르지 않는다 (R26)', { skip }, () => {
  const p = inspect(stressPptx());
  const line = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8').match(/--line:\s*#([0-9a-fA-F]{6})/)![1].toUpperCase();
  let photos = 0, others = 0;
  stressSlides.forEach((sl, i) => {
    const refs = [sl.media, ...(sl.steps ?? []).map((st) => st.media), (sl as any).left?.media, (sl as any).right?.media].filter(Boolean);
    const pics = p.slides[i].pictures;
    if (refs.length !== pics.length) return;
    // 그림은 장에 놓인 차례대로 (단계는 칸 차례, 견주기는 왼쪽·오른쪽)
    const order = (sl.layout === 'compare' && !sl.media ? [(sl as any).left?.media, (sl as any).right?.media] : sl.layout === 'steps' ? (sl.steps ?? []).map((st) => st.media) : [sl.media]).filter(Boolean);
    order.forEach((ref, k) => {
      if (ref === 'sample') { photos++; assert.deepEqual(pics[k].line, [0.5, line], `${i + 1}번 장의 사진에 테두리가 없습니다`); }
      else { others++; assert.equal(pics[k].line, null, `${i + 1}번 장의 도해(${ref})에 테두리가 있습니다`); }
    });
  });
  assert.ok(photos >= 2 && others >= 4, `사진 ${photos}, 도해 ${others}`);
});

test('그림 출처 장: 앞 장을 채운 뒤 새 장을 열고, 앞 장에 들어갈 한 줄만 따로 남기지 않는다', { skip: noPython() }, () => {
  // build_pptx.py 의 credit_pages() 를 출처 줄 수를 바꿔 가며 돌려, 장마다 다음 장의 첫 줄이 정말 들어가지 않았는지 본다
  const out = JSON.parse(execFileSync(PYTHON, [path.join(ROOT, 'tests', 'slides', 'credit_pages.py')], { encoding: 'utf8', cwd: ROOT }));
  assert.ok(out.cases.some((c: { pages: number[] }) => c.pages.length >= 3), '세 장 넘게 나뉘는 경우도 본다');
  for (const c of out.cases as { n: number; pages: number[]; lone_fits: boolean; overfull: boolean; next_fits: boolean }[]) {
    assert.equal(c.pages.reduce((a, b) => a + b, 0), c.n);
    assert.equal(c.overfull, false, `${c.n}줄: 자리보다 많이 넣은 장이 있습니다`);
    assert.equal(c.next_fits, false, `${c.n}줄: 다음 장의 첫 줄이 앞 장에 들어갈 수 있었습니다 ${c.pages}`);
    assert.equal(c.lone_fits, false, `${c.n}줄: 앞 장에 들어갈 한 줄만 따로 남은 장이 있습니다 ${c.pages}`);
  }
});

test('가장 긴 글로 채운 PPTX 를 LibreOffice 로 찍어도 글줄이 글상자 안에 있다', { skip: skip || noOffice }, () => {
  const pptx = stressPptx();
  const p = inspect(pptx);
  // 넘친 줄은 상자 밖 아래로 나간다. 모든 낱말이 그 장의 어느 글상자 안에 있는지 본다.
  const pdfDir = path.join(OUT, 'stress-pdf');
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', pdfDir, pptx], { stdio: 'ignore', timeout: 120000 });
  const bbox = execFileSync('pdftotext', ['-bbox-layout', path.join(pdfDir, 'slides.pdf'), '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const pages = bbox.split('<page ').slice(1);
  assert.equal(pages.length, p.slides.length);
  const bad: string[] = [];
  pages.forEach((pg, i) => {
    // 낱말 단위로 본다. 단계 장처럼 칸이 나란하면 pdftotext 가 옆 칸의 글을 한 줄로 이어 붙이기 때문이다.
    for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      const [x0, y0, x1, y1] = m.slice(1, 5).map(Number);
      const words = m[5];
      // 줄 끝의 문장 부호(? . ! ,)는 LibreOffice 가 글상자 오른쪽 밖으로 내밀어 찍는다 (동아시아 글의 문장 부호 내밀기). 글자 하나 폭까지는 넘친 것이 아니다.
      const hang = /^[?.!,]+$/.test(words) ? (x1 - x0) + 30 : 3;
      const inside = p.slides[i].boxes.some(([a, b, c, d]) => x0 >= a - 3 && x1 <= c + hang && y0 >= b - 6 && y1 <= d + 6);
      if (!inside) bad.push(`${i + 1}번 장: "${words.slice(0, 30)}" (${x0.toFixed(0)}, ${y0.toFixed(0)})–(${x1.toFixed(0)}, ${y1.toFixed(0)})`);
    }
  });
  assert.deepEqual(bad, []);
});
