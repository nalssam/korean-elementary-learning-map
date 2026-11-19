// PPTX 생성기(generators/pptx/build.mjs → build_pptx.py)를 시험용 명세로 돌려 본다.
//  - 장 수·크기·교사 메모(slideNotes)·퀴즈 정답·표지의 초안 표시·마지막 장의 출처와 바닥글
//  - 그림을 자르거나 늘이지 않았다 · 색은 tokens.css 의 것만 · Pretendard 를 심었다 · 다시 돌리면 캐시에서 복사한다
//  - 가장 긴 글로 채운 장도 넘치지 않는다 (LibreOffice 로 PDF 를 찍어 글줄이 글상자 안에 있는지 본다. soffice 가 없으면 그 부분만 건너뛴다)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, answerText, creditList, footerNotice, isPublic, loadLesson, sheetFooter, shownMedia, slideNotes, visibleLessons } from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { slideCounter } from '#src/components/slides/counter.ts';
import { FIXTURES, noChromium, noPython } from '../contract/helpers.ts';
import { NOTE_COPY } from '#src/components/slides/copy.ts';
import { STRESS_ID, makeStress } from './stress.ts';

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
  slides: { texts: string[]; boxes: number[][]; notes: string; pictures: { ratio_shape: number; ratio_image: number; crop: number[]; inside: boolean; alt: string }[] }[];
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
      assert.ok(p.slides[i].texts.includes(slideCounter(lesson, i + 1).text), `${lesson.id} ${i + 1}번 장 번호`);
      if ('title' in slide) assert.ok(p.slides[i].texts.includes(slide.title), `${lesson.id} ${i + 1}번 장 제목`);
    });
    // 표지의 초안 표시, 마지막 장의 출처와 바닥글
    assert.ok(p.slides[0].texts.includes(footerNotice(lesson)));
    const tail = p.slides.slice(n).flatMap((s) => s.texts);
    for (const c of creditList(shownMedia(lesson, 'slides'))) {
      assert.ok(tail.includes(c.text), `${lesson.id} 출처: ${c.text}`);
      for (const u of [c.sourceUrl, c.licenceUrl]) if (u) assert.ok(tail.includes(u), u);
    }
    // 수업 중에 띄우는 장이라 그림 제목(「…」)을 넣지 않는다
    assert.ok(!tail.some((t) => t.includes('「')), `${lesson.id}: 출처 장에 그림 제목이 있습니다`);
    assert.ok(tail.includes(sheetFooter(lesson)));
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
    // 색은 tokens.css 의 것만, 글꼴은 Pretendard 하나를 심어 둔다
    for (const c of p.colors) assert.ok(colors.has(c), `${lesson.id}: tokens.css 에 없는 색 ${c}`);
    assert.deepEqual(p.faces, ['Pretendard']);
    assert.deepEqual(p.embedded, ['Pretendard']);
    assert.equal(p.fontdata.length, 2);
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
/** 가장 긴 글로 채운 묶음의 PPTX 를 한 번 만든다 */
function stressPptx(): string {
  if (stressFile) return stressFile;
  const content = path.join(OUT, 'stress-content');
  fs.cpSync(FIXTURES, content, { recursive: true });
  const file = path.join(content, ...STRESS_ID.split('/'), 'lesson.yaml');
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  makeStress(content, raw);
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
      const inside = p.slides[i].boxes.some(([a, b, c, d]) => x0 >= a - 3 && x1 <= c + 3 && y0 >= b - 6 && y1 <= d + 6);
      if (!inside) bad.push(`${i + 1}번 장: "${words.slice(0, 30)}" (${x0.toFixed(0)}, ${y0.toFixed(0)})–(${x1.toFixed(0)}, ${y1.toFixed(0)})`);
    }
  });
  assert.deepEqual(bad, []);
});
