// 수업 화면 PPTX 만들기 (빌드 4단계). 저장소 뿌리에서 `node generators/pptx/build.mjs [--out <폴더>] [--only <id>]`.
//
// 1. 검증을 마친 명세(visibleLessons())를 .cache/lessons.json 으로 내보낸다. 모양은 README.md 에 있다.
//    화면에 찍히는 글(차시표 값, 낱말 풀이, 교사 메모, 출처 표시, 바닥글, 이름표)과 tokens.css 의 색, 글꼴 파일 경로를 모두 싣는다.
// 2. SVG 그림은 Chromium 으로 폭 1600px PNG 로 바꿔 .cache/media/<id>/ 에 둔다 (python-pptx 는 SVG 를 넣지 못한다).
// 3. Python(build_pptx.py)이 lessons.json 만 읽고 PPTX 를 만든다. 결과는 dist/files/<id>/slides.pptx.
// 다시 만들지 않아도 되는 묶음은 .cache/files/<id>/slides.pptx 를 복사만 한다
// (그 묶음의 lessons.json 항목, 거기 적힌 그림 파일, generators/pptx/ 폴더, package-lock.json 의 sha256 이 같을 때).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ROOT, answerText, cacheDir, creditList, creditShort, distDir, footerNotice, getMedia, getPassage, isPublic, mediaFile, pptxFile,
  reviewedOn, sheetFooter, shownMedia, slideNotes, termMeaning, visibleLessons,
} from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { coverText } from '#src/components/slides/cover.ts';
import { slideCounter } from '#src/components/slides/counter.ts';
import {
  CREDIT_COPY, NOTE_COPY, SLIDE_COPY, STAGE_FIT, STAGE_PICTURE, STAGE_SIDE, STAGE_STEPS, STAGE_TYPE, sideCandidates,
} from '#src/components/slides/copy.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? argv[onlyAt + 1] : undefined;
if (onlyAt >= 0 && (!only || only.startsWith('--'))) fail('--only 뒤에 묶음 id 를 적습니다. 예: --only 5-2/1/01');

const DIST = distDir();
const CACHE = cacheDir();
const PNG_WIDTH = 1600;
/** 초안 PPTX 의 만든 날·고친 날. 빌드할 때마다 파일이 달라지지 않게 고정한다. */
const DRAFT_DATE = '2026-01-01';
const FONT_DIR = path.join(ROOT, 'node_modules', 'pretendard', 'dist', 'public', 'static', 'alternative');

function fail(msg) {
  console.error(`PPTX 만들기를 멈춥니다: ${msg}`);
  process.exit(1);
}
const sha = (...parts) => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

/** tokens.css 의 색 (#rrggbb → RRGGBB). Python 쪽에 색을 다시 적지 않으려고 여기에서 읽어 보낸다. */
function tokenColors() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/--([a-z-]+):\s*#([0-9a-fA-F]{6})\b/g)) out[m[1]] ??= m[2].toUpperCase();
  for (const k of ['bg', 'card', 'paper', 'line', 'navy', 'gray', 'teal', 'teal-soft', 'coral']) {
    if (!out[k]) fail(`src/styles/tokens.css 에 --${k} 색이 없습니다`);
  }
  return out;
}

// ───────── SVG → PNG ─────────

let browser;
async function svgToPng(svgFile, lessonId) {
  const svg = fs.readFileSync(svgFile);
  const out = path.join(CACHE, 'media', lessonId, path.basename(svgFile, '.svg') + '.png');
  const stamp = out + '.sha256';
  const key = sha(svg, String(PNG_WIDTH));
  if (fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) return out;
  const text = svg.toString('utf8');
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  const wh = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)(?:px)?["'][^>]*\sheight\s*=\s*["']([\d.]+)(?:px)?["']/.exec(text);
  const [w, h] = (vb ?? wh ?? []).slice(1, 3).map(Number);
  if (!w || !h) fail(`${svgFile}: SVG 의 가로세로를 알 수 없습니다 (viewBox 를 적습니다)`);
  const height = Math.round((PNG_WIDTH * h) / w);
  if (!browser) {
    const { chromium } = await import('playwright');
    try {
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    } catch (e) {
      fail(`SVG 그림을 PNG 로 바꿀 Chromium 을 띄울 수 없습니다 (npx playwright install chromium, 또는 CHROMIUM_PATH): ${String(e.message).split('\n')[0]}`);
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  // 아주 긴 그림을 찍을 때 Chromium 이 가끔 한 번 실패한다. 새 탭으로 두 번까지 다시 찍는다.
  for (let tries = 1; ; tries++) {
    const page = await browser.newPage({ viewport: { width: PNG_WIDTH, height }, deviceScaleFactor: 1 });
    try {
      await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${PNG_WIDTH}px;height:${height}px}</style><img src="${src}">`);
      await page.evaluate(() => document.querySelector('img').decode());
      await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: PNG_WIDTH, height } });
      break;
    } catch (e) {
      if (tries >= 3) fail(`${svgFile} 를 PNG 로 바꾸지 못했습니다: ${String(e.message).split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }
  fs.writeFileSync(stamp, key);
  return out;
}

// ───────── lessons.json ─────────

async function mediaEntry(lesson, ref) {
  const m = getMedia(lesson, ref);
  const file = mediaFile(lesson, ref);
  return {
    id: `${m.lessonId}/${m.id}`,
    file: file.endsWith('.svg') ? await svgToPng(file, m.lessonId) : file,
    alt: m.alt,
    credit: creditShort(m),
    // 사진에는 PPTX 에서도 가는 테두리를 두른다 (R26)
    kind: m.kind,
  };
}

async function slideEntry(lesson, slide, no) {
  const notes = [...slideNotes(lesson, no)];
  const base = { no, layout: slide.layout, notes, counter: slideCounter(lesson, no).text };
  const media = async (ref) => (ref ? await mediaEntry(lesson, ref) : undefined);
  switch (slide.layout) {
    case 'title': {
      const c = coverText(lesson);
      return { ...base, title: slide.title, subtitle: slide.subtitle, kicker: c.kicker, first: no === 1 };
    }
    case 'question': return { ...base, kicker: slide.kicker, title: slide.title, hint: slide.hint, media: await media(slide.media) };
    case 'picture': return { ...base, title: slide.title, caption: slide.caption, media: await media(slide.media) };
    case 'points': return { ...base, title: slide.title, points: slide.points, media: await media(slide.media) };
    case 'compare': {
      const side = async (s) => ({ label: s.label, points: s.points, media: await media(s.media) });
      // media 는 두 쪽이 함께 보는 그림 하나 (R23a). left·right 의 그림과 함께 오지 않는다 (형식이 막는다)
      return { ...base, title: slide.title, media: await media(slide.media), left: await side(slide.left), right: await side(slide.right) };
    }
    case 'steps': {
      const steps = [];
      for (const s of slide.steps) steps.push({ label: s.label, text: s.text, media: await media(s.media) });
      return { ...base, title: slide.title, steps };
    }
    case 'term': return { ...base, term: slide.term, meaning: termMeaning(lesson, slide.term), example: slide.example };
    case 'passage': {
      const p = getPassage(lesson, slide.passage);
      return { ...base, passage: { title: p.title, text: p.text, source: p.source } };
    }
    case 'activity': return { ...base, title: slide.title, instructions: slide.instructions, minutes: slide.minutes, materials: slide.materials };
    case 'quiz': {
      const q = lesson.quiz.items[slide.item - 1];
      // 퀴즈 장의 답은 PPTX 에서 메모란에 적는다 (docs/CONTRACT.md 8절)
      notes.push(`${NOTE_COPY.answer}: ${answerText(q)}`, `${NOTE_COPY.explain}: ${q.explain}`);
      return { ...base, quiz: { type: q.type, q: q.q, ...(q.type === 'choice' ? { choices: q.choices } : {}) } };
    }
    case 'closing': return { ...base, title: slide.title, points: slide.points };
  }
  fail(`${lesson.id} ${no}번 장: 모르는 layout ${slide.layout}`);
}

async function lessonEntry(lesson) {
  const slides = [];
  for (let i = 0; i < lesson.slides.length; i++) slides.push(await slideEntry(lesson, lesson.slides[i], i + 1));
  const c = coverText(lesson);
  const draft = !isPublic(lesson);
  return {
    id: lesson.id,
    title: lesson.title,
    pptx: path.join(CACHE, 'files', lesson.id, 'slides.pptx'),
    cover: { meta: c.meta, notice: c.notice },
    // 공개하지 않은 차시는 2번 장부터 장마다 왼쪽 아래에 초안 표시를 찍는다 (1번 장은 표지 아래에 있다)
    draft: draft ? footerNotice(lesson) : null,
    // 파일 정보(core.xml). 날짜는 빌드할 때마다 바뀌지 않게 정해 둔다: 공개된 차시는 승인한 날, 초안은 고정된 날.
    doc: {
      title: `${draft ? '[검수 전 초안] ' : ''}${lesson.title} 수업 화면`,
      author: SITE.author,
      keywords: SITE.licence.name,
      date: `${reviewedOn(lesson) ?? DRAFT_DATE}T00:00:00Z`,
    },
    slides,
    credits: {
      heading: CREDIT_COPY.heading,
      empty: CREDIT_COPY.empty,
      more: CREDIT_COPY.more,
      // 수업 중에 띄우는 장이라 그림 제목을 빼고, 같은 출처는 한 줄로 묶는다 (docs/CONTRACT.md 8절)
      items: creditList(shownMedia(lesson, 'slides')).map(({ text, sourceUrl, licenceUrl }) => ({ text, sourceUrl, licenceUrl })),
      footer: sheetFooter(lesson),
    },
  };
}

function folderHash(dir) {
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => !String(f).includes('__pycache__')).map(String).sort();
  return sha(...files.flatMap((f) => {
    const p = path.join(dir, f);
    return fs.statSync(p).isFile() ? [f, fs.readFileSync(p)] : [];
  }));
}

async function main() {
  const lessons = visibleLessons().filter((l) => !only || l.id === only);
  if (only && lessons.length === 0) fail(`${only} 는 이번 빌드에 실리는 묶음이 아닙니다`);
  const fonts = { name: 'Pretendard', regular: path.join(FONT_DIR, 'Pretendard-Regular.ttf'), bold: path.join(FONT_DIR, 'Pretendard-Bold.ttf') };
  for (const f of [fonts.regular, fonts.bold]) if (!fs.existsSync(f)) fail(`글꼴 파일이 없습니다: ${f} (npm ci 로 pretendard 패키지를 깝니다)`);
  const entries = [];
  try {
    for (const l of lessons) entries.push(await lessonEntry(l));
  } finally {
    await browser?.close();
  }
  const data = {
    version: 1,
    colors: tokenColors(),
    fonts,
    type: STAGE_TYPE,
    fit: STAGE_FIT,
    picture: STAGE_PICTURE,
    // 글 곁에 그림 하나를 두는 장 (R12): 해 볼 [그림 칸 폭, 글 크기] 차례는 웹 무대와 같은 sideCandidates() 로 만든다
    side: {
      gap: STAGE_SIDE.gap,
      maxLines: STAGE_SIDE.maxLines,
      candidates: {
        points: sideCandidates(STAGE_FIT.pointsMedia),
        question: sideCandidates(STAGE_FIT.questionMedia),
        compare: sideCandidates(STAGE_FIT.compareShared),
      },
    },
    steps: STAGE_STEPS,
    copy: { slide: SLIDE_COPY },
    lessons: entries,
  };
  fs.mkdirSync(CACHE, { recursive: true });
  const json = path.join(CACHE, 'lessons.json');
  fs.writeFileSync(json, JSON.stringify(data, null, 2));

  const common = sha(JSON.stringify({ ...data, lessons: [] }), folderHash(HERE), fs.readFileSync(path.join(ROOT, 'package-lock.json')));
  const todo = [];
  const stamps = new Map();
  for (const e of entries) {
    const files = e.slides.flatMap((s) => [s.media, s.left?.media, s.right?.media, ...(s.steps ?? []).map((x) => x.media)]).filter(Boolean).map((m) => m.file);
    const key = sha(common, JSON.stringify(e), ...files.map((f) => fs.readFileSync(f)));
    stamps.set(e.id, key);
    const stamp = e.pptx + '.sha256';
    if (fs.existsSync(e.pptx) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) continue;
    todo.push(e.id);
  }
  if (todo.length) {
    const python = process.env.PYTHON || 'python3';
    const r = spawnSync(python, [path.join(HERE, 'build_pptx.py'), json, ...todo], { stdio: 'inherit', cwd: ROOT });
    if (r.error) fail(`Python 을 실행할 수 없습니다 (${python}). PYTHON 으로 python-pptx 가 깔린 Python 을 가리킵니다`);
    if (r.status !== 0) fail('Python 이 PPTX 를 만들지 못했습니다 (위의 글을 봅니다)');
    for (const id of todo) fs.writeFileSync(entries.find((e) => e.id === id).pptx + '.sha256', stamps.get(id));
  }
  for (const l of lessons) {
    const e = entries.find((x) => x.id === l.id);
    const to = path.join(DIST, pptxFile(l).file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(e.pptx, to);
  }
  console.log(`PPTX ${lessons.length}개 (새로 만듦 ${todo.length}, 캐시에서 복사 ${lessons.length - todo.length}) → ${path.relative(ROOT, DIST)}/files/`);
}

await main();
