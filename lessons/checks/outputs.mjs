// 빌드 5단계: 만들어진 사이트(dist)를 검사한다 (docs/CONTRACT.md 11절 '산출물').
//
//   node checks/outputs.mjs [--out <폴더>] [--only <묶음 id>]
//
// dist 의 자리는 distDir() 로만 얻는다 (--out 이나 DIST_DIR). 실패하면 어느 파일의 무엇인지 적고 1 로 끝난다.
// 보는 것:
//   - 공개 빌드에 초안이 섞이지 않았는가 (data-draft, dist/<id>/·media/<id>/·files/<id>/ 의 묶음이 visibleLessons() 에 있는가)
//   - 파일마다 printJobs() 의 쪽수와 A4 쪽 크기, 파일 크기
//   - 산출물(html, PDF 의 글, PPTX)에 localhost·127.0.0.1 이 없는가 (공개 빌드)
//   - html 이 사이트 밖 주소를 부르지 않는가 (script·link·img·iframe·글꼴)
//   - 초안의 PDF 에 SITE.draftNotice 가 있고 SITE.aiNotice 가 없는가, 공개된 차시의 PDF 에 안내 페이지 주소가 있는가
//   - /media/ 그림이 object-fit: contain 으로 그려지는가 (Chromium 으로 연다)
//   - PPTX 안의 그림이 늘어나거나 잘리지 않았는가 (8절)
//   - 차시표의 focus 가 html 에 실리지 않았는가
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { SITE } from '#lib/site.ts';
import { UsageError, parseArgs, rel } from './lib.mjs';
import { fileImageSize, readPdf, readPptx, squash } from './files.mjs';

const MB = 1024 * 1024;
/**
 * 파일 크기의 한도. GitHub Pages 는 사이트 전체가 1GB 를 넘지 않게 권한다. 3~6학년 여덟 학기의 묶음이 250개쯤이므로
 * 묶음 하나가 4MB 남짓을 쓸 수 있다. 학습지 PDF 는 몇백 KB, 사진이 든 PPTX 는 몇 MB 가 보통이다.
 */
export const LIMIT = { pdf: 5 * MB, pptx: 20 * MB, site: 1000 * MB };
const ID_DIR = /^[3-6]-[12]\/\d{1,2}\/\d{2}(?:-\d{2})?$/;

class Report {
  constructor() { this.fails = []; this.notes = []; }
  fail(where, text) { this.fails.push(`${where}: ${text}`); }
  note(where, text) { this.notes.push(`${where}: ${text}`); }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** dist 안에서 묶음 id 꼴의 폴더 (학기/단원/묶음) */
function bundleDirs(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const s of fs.readdirSync(root)) for (const u of safeDirs(path.join(root, s))) for (const b of safeDirs(path.join(root, s, u))) {
    const id = `${s}/${u}/${b}`;
    if (ID_DIR.test(id)) out.push(id);
  }
  return out;
}
const safeDirs = (d) => (fs.existsSync(d) && fs.statSync(d).isDirectory() ? fs.readdirSync(d).filter((x) => fs.statSync(path.join(d, x)).isDirectory()) : []);

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const EXTERNAL = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const LOCAL_HOST = /localhost|127\.0\.0\.1/;

/** html 한 쪽이 사이트 밖에서 불러오는 것 (링크 <a> 는 부르는 것이 아니라서 뺀다) */
export function externalLoads(html) {
  const out = [];
  const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined);
  for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio|embed|object|track|input)\b[^>]*>/gi)) {
    const tag = m[0], name = m[1].toLowerCase();
    const urls = [];
    if (name === 'link') {
      const relv = (attr(tag, 'rel') ?? '').toLowerCase();
      // canonical·alternate 는 주소를 알릴 뿐 불러오지 않는다
      if (/stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest/.test(relv)) urls.push(attr(tag, 'href'));
    } else if (name === 'object') urls.push(attr(tag, 'data'));
    else {
      urls.push(attr(tag, 'src'), attr(tag, 'poster'));
      const srcset = attr(tag, 'srcset');
      if (srcset) urls.push(...srcset.split(',').map((x) => x.trim().split(/\s+/)[0]));
    }
    for (const u of urls) if (u && EXTERNAL.test(decode(u))) out.push(`<${name}> ${decode(u)}`);
  }
  out.push(...cssLoads(html).map((u) => `CSS ${u}`));
  return out;
}

/** CSS 의 url(…)·@import 가운데 사이트 밖 주소 */
export function cssLoads(css) {
  const out = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) if (EXTERNAL.test(m[2])) out.push(m[2]);
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi)) if (EXTERNAL.test(m[1])) out.push(m[1]);
  // @import url(…) 은 위의 두 식에 모두 걸린다
  return [...new Set(out)];
}

// ───────────── 묶음마다 ─────────────

async function checkLesson(dist, lesson, report, publicBuild) {
  const id = lesson.id;
  const draft = !c.isPublic(lesson);
  for (const job of c.printJobs(lesson)) {
    const file = path.join(dist, job.file);
    const where = rel(file);
    if (!fs.existsSync(file)) { report.fail(where, `${job.label} PDF 가 없습니다 (빌드 3단계 scripts/render-pdf.mjs 가 만듭니다)`); continue; }
    const buf = fs.readFileSync(file);
    if (buf.length > LIMIT.pdf) report.fail(where, `파일이 ${(buf.length / MB).toFixed(1)}MB 입니다 (${LIMIT.pdf / MB}MB 까지). 그림을 줄입니다`);
    let pdf;
    try { pdf = await readPdf(buf); } catch (e) { report.fail(where, `PDF 를 읽을 수 없습니다 (${e.message})`); continue; }
    if (pdf.pages.length !== job.pages) report.fail(where, `${pdf.pages.length}쪽입니다. ${job.pages}쪽이어야 합니다 (printJobs)`);
    const [W, H] = job.print.orientation === 'landscape' ? [297, 210] : [210, 297];
    pdf.pages.forEach((p, i) => {
      if (Math.abs(p.w - W) > 1 || Math.abs(p.h - H) > 1) report.fail(where, `${i + 1}쪽의 크기가 ${p.w.toFixed(0)} × ${p.h.toFixed(0)}mm 입니다. A4 ${job.print.orientation === 'landscape' ? '가로' : '세로'}(${W} × ${H}mm)여야 합니다`);
    });
    const text = squash(pdf.text);
    if (draft) {
      if (!text.includes(squash(SITE.draftNotice))) report.fail(where, `초안의 PDF 에 "${SITE.draftNotice}" 가 없습니다 (바닥글은 sheetFooter() 로 찍습니다)`);
      if (text.includes(squash(SITE.aiNotice))) report.fail(where, `초안의 PDF 에 "${SITE.aiNotice}" 가 있습니다. 검수 전 자료에는 쓰지 않습니다`);
    } else {
      let url;
      try { url = c.absoluteUrl(c.lessonRoute(id)); } catch (e) { report.fail(where, e.message); continue; }
      if (!text.includes(squash(url))) report.fail(where, `PDF 에 안내 페이지 주소(${url})가 없습니다 (바닥글은 sheetFooter() 로 찍습니다)`);
    }
    if (publicBuild && LOCAL_HOST.test(pdf.text)) report.fail(where, 'PDF 의 글에 localhost·127.0.0.1 주소가 있습니다. 주소는 absoluteUrl() 로 만듭니다');
  }

  const pptx = path.join(dist, c.pptxFile(lesson).file);
  const where = rel(pptx);
  if (!fs.existsSync(pptx)) { report.fail(where, 'PPTX 가 없습니다 (빌드 4단계 generators/pptx/build.mjs 가 만듭니다)'); return; }
  const buf = fs.readFileSync(pptx);
  if (buf.length > LIMIT.pptx) report.fail(where, `파일이 ${(buf.length / MB).toFixed(1)}MB 입니다 (${LIMIT.pptx / MB}MB 까지). 그림을 줄입니다`);
  let deck;
  try { deck = readPptx(buf); } catch (e) { report.fail(where, `PPTX 를 읽을 수 없습니다 (${e.message})`); return; }
  if (deck.slides !== lesson.slides.length) report.fail(where, `${deck.slides}장입니다. 명세의 수업 화면은 ${lesson.slides.length}장입니다 (8절: 명세의 한 장이 PPTX 한 장)`);
  if (publicBuild && LOCAL_HOST.test(deck.xml)) report.fail(where, 'PPTX 에 localhost·127.0.0.1 주소가 있습니다. 주소는 absoluteUrl() 로 만듭니다');
  const text = squash(deck.text);
  if (draft && text.includes(squash(SITE.aiNotice))) report.fail(where, `초안의 PPTX 에 "${SITE.aiNotice}" 가 있습니다. 표지에는 footerNotice(lesson) 을 찍습니다`);
  // 그림은 늘이거나 자르지 않는다 (6·8절). 원본의 가로세로 비율을 지켜 틀 안에 맞춘다.
  const originals = c.shownMedia(lesson, 'slides').map((m) => path.join(c.lessonDir(m.lessonId), m.file));
  const originalBytes = new Map(originals.filter((f) => fs.existsSync(f)).map((f) => [fs.readFileSync(f).toString('base64'), f]));
  for (const p of deck.pictures) {
    const at = `${where} ${p.slide}번 장 그림${p.name ? ` "${p.name}"` : ''}`;
    if (Object.values(p.crop).some((v) => v !== 0)) report.fail(at, '그림을 잘라 넣었습니다 (crop 값이 0 이 아닙니다). 자르지 않고 비율을 지켜 틀 안에 맞춥니다');
    if (!p.size || !p.cx || !p.cy) { report.note(at, '그림의 크기를 읽지 못해 비율을 보지 못했습니다'); continue; }
    const shown = p.cx / p.cy, natural = p.size.w / p.size.h;
    if (Math.abs(shown / natural - 1) > 0.01) report.fail(at, `가로세로 비율이 원본과 다릅니다 (원본 ${natural.toFixed(3)}, PPTX ${shown.toFixed(3)}). add_picture() 에 폭이나 높이 하나만 주거나 비율을 계산해 줍니다`);
    // 원본 파일을 그대로 넣었으면 원본의 크기와도 견준다 (SVG 는 PNG 로 바꿔 넣으므로 바이트로는 짝을 찾지 못한다)
    const orig = p.bytes && originalBytes.get(p.bytes.toString('base64'));
    if (orig) {
      const o = fileImageSize(orig);
      if (o && Math.abs(shown / (o.w / o.h) - 1) > 0.01) report.fail(at, `가로세로 비율이 원본 파일(${rel(orig)})과 다릅니다`);
    }
  }
}

// ───────────── html ─────────────

function checkHtml(dist, report, publicBuild) {
  const files = walk(dist);
  const html = files.filter((f) => f.endsWith('.html'));
  const focus = c.allBundles().map((b) => ({ id: b.id, text: b.bundle.focus.trim() })).filter((f) => f.text.length >= 4);
  for (const f of html) {
    const s = fs.readFileSync(f, 'utf8');
    const where = rel(f);
    if (publicBuild && /\sdata-draft\b/.test(s)) report.fail(where, '공개 빌드에 초안의 페이지가 들어 있습니다 (data-draft). 주소 목록은 lessonPaths() 로 만듭니다');
    if (publicBuild && LOCAL_HOST.test(s)) report.fail(where, 'localhost·127.0.0.1 주소가 있습니다. 페이지 안 주소는 href(), 종이에 박는 주소는 absoluteUrl() 로 만듭니다');
    for (const u of externalLoads(s)) report.fail(where, `사이트 밖 주소를 불러옵니다: ${u}. 학교망에서 막힐 수 있으니 사이트 안에 둡니다`);
    const plain = decode(s).replace(/\s+/g, ' ');
    for (const x of focus) if (plain.includes(x.text)) report.fail(where, `차시표의 focus(${x.id})가 실렸습니다. focus 는 사실 대조를 거치지 않은 계획 글이라 사이트에 찍지 않습니다`);
  }
  for (const f of files.filter((x) => x.endsWith('.css'))) for (const u of cssLoads(fs.readFileSync(f, 'utf8'))) report.fail(rel(f), `사이트 밖 주소를 불러옵니다: ${u}`);
  return html;
}

// ───────────── 그림의 object-fit (Chromium) ─────────────

/** 빌드한 사이트를 127.0.0.1 에서 내준다. astro 는 SITE_BASE 가 있어도 dist/5-2/… 에 쓰므로 하위 경로를 떼고 대응시킨다 (10절). */
function serve(dist, base) {
  const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', woff: 'font/woff' };
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (base && url.startsWith(base + '/')) url = url.slice(base.length);
    let file = path.join(dist, url);
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

async function checkObjectFit(dist, pages, report) {
  const withMedia = pages.filter((f) => /\/media\//.test(fs.readFileSync(f, 'utf8')));
  if (!withMedia.length) return;
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  } catch (e) {
    report.fail('그림의 object-fit', `Chromium 을 띄울 수 없어 보지 못했습니다 (${String(e.message).split('\n')[0]}). npx playwright install chromium 으로 깔거나 CHROMIUM_PATH 로 가리킵니다`);
    return;
  }
  const base = '/' + (process.env.SITE_BASE ?? '').replace(/^\/+|\/+$/g, '');
  const site = await serve(dist, base === '/' ? '' : base);
  try {
    const page = await browser.newPage();
    // 사이트 밖으로는 아무것도 보내지 않는다 (검사하는 동안에도)
    await page.route('**/*', (route) => (route.request().url().startsWith(site.origin) ? route.continue() : route.abort()));
    for (const f of withMedia) {
      const route = '/' + path.relative(dist, f).split(path.sep).join('/').replace(/index\.html$/, '');
      await page.goto(site.origin + (base === '/' ? '' : base) + route, { waitUntil: 'load' });
      const bad = await page.evaluate(() => [...document.querySelectorAll('img')]
        .filter((img) => /\/media\//.test(img.getAttribute('src') ?? ''))
        .filter((img) => !['contain', 'scale-down'].includes(getComputedStyle(img).objectFit))
        .map((img) => `${img.getAttribute('src')} (${getComputedStyle(img).objectFit})`));
      for (const b of bad) report.fail(rel(f), `그림이 object-fit: contain 으로 그려지지 않습니다: ${b}. 그림은 Media.astro 로 넣고 자르지 않습니다`);
    }
  } finally {
    site.close();
    await browser.close();
  }
}

// ───────────── 돌리기 ─────────────

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2), { flags: ['--out', '--only'] }); } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n쓰는 법: node checks/outputs.mjs [--out <폴더>] [--only <묶음 id>]`); return 2; }
    throw e;
  }
  const dist = c.distDir();
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`빌드한 사이트가 없습니다 (${rel(dist)}). npm run build 로 만듭니다`); return 1; }
  const publicBuild = !c.showDrafts();
  const only = args.flags['--only'];
  const report = new Report();
  const visible = c.visibleLessons();
  const ids = new Set(visible.map((l) => l.id));
  if (only && !ids.has(only)) { console.error(`--only ${only}: 이번 빌드에 실리는 묶음이 아닙니다`); return 2; }

  // 실리면 안 되는 묶음 (공개 빌드의 초안, 차시표에 없는 묶음)
  for (const [root, what] of [[dist, '페이지'], [path.join(dist, 'media'), '그림'], [path.join(dist, 'files'), '파일']]) {
    for (const id of bundleDirs(root)) if (!ids.has(id)) report.fail(rel(path.join(root, id)), `이번 빌드에 실리지 않는 묶음의 ${what}입니다 (${publicBuild ? '공개 빌드에 초안이 섞였거나 ' : ''}visibleLessons() 에 없습니다)`);
  }
  for (const lesson of visible) if (!only || lesson.id === only) await checkLesson(dist, lesson, report, publicBuild);
  const pages = checkHtml(dist, report, publicBuild);
  await checkObjectFit(dist, pages, report);
  const total = walk(dist).reduce((n, f) => n + fs.statSync(f).size, 0);
  if (total > LIMIT.site) report.fail(rel(dist), `사이트 전체가 ${(total / MB).toFixed(0)}MB 입니다 (${LIMIT.site / MB}MB 까지). 큰 파일을 줄입니다`);

  const lines = [`산출물 검사 · ${rel(dist)} · ${publicBuild ? '공개 빌드' : '미리 보기 빌드(SHOW_DRAFTS=1)'} · 묶음 ${only ? 1 : visible.length}개 · html ${pages.length}쪽 · ${(total / MB).toFixed(1)}MB`];
  for (const f of report.fails) lines.push(`  고칠 것  ${f}`);
  for (const n of report.notes) lines.push(`  알림     ${n}`);
  lines.push(report.fails.length ? `고칠 것 ${report.fails.length}건. 위의 파일을 만든 담당의 코드를 고친 뒤 다시 빌드합니다.` : '통과했습니다.');
  console.log(lines.join('\n'));
  return report.fails.length ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
