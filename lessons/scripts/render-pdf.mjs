#!/usr/bin/env node
// 인쇄 페이지를 PDF 로 찍는다 (빌드 3단계. docs/CONTRACT.md 7절 '쪽수와 넘침 검사', 10절).
//
//   node scripts/render-pdf.mjs                    visibleLessons() 의 printJobs() 전부 → dist/files/<id>/<kind>.pdf
//   node scripts/render-pdf.mjs --only 5-2/1/01    한 묶음만
//   node scripts/render-pdf.mjs --kind worksheet   한 종류만 (worksheet · cards · coloring · papercraft)
//   node scripts/render-pdf.mjs --force            캐시를 쓰지 않고 모두 다시 찍는다
//   node scripts/render-pdf.mjs --out <폴더>        dist 가 아닌 곳에 빌드한 사이트 (캐시는 <폴더>.cache/)
//
// 먼저 astro build(1단계)와 scripts/sync-media.mjs(2단계)를 돌려 둔다. 같은 환경 변수(SITE_BASE, SITE_URL, SHOW_DRAFTS, CONTENT_DIR)로 돌린다.
//
// 하는 일
//  1. 빌드한 사이트를 127.0.0.1 에서 내준다 (file:// 로 열면 글꼴이 실리지 않는다). SITE_BASE 는 떼고 dist 에 대응시킨다.
//  2. 인쇄 페이지마다 인쇄 모양(emulateMedia print)으로 열어 일곱 조건과 바닥글 앞의 틈(R29)을 잰다. 하나라도 어긋나면 어느 차시의 어느 인쇄물 몇 쪽인지 적고
//     0 이 아닌 값으로 끝난다 (PDF 를 남기지 않는다).
//  3. 입력이 그대로인 인쇄물은 찍지 않고 캐시에서 복사한다.
//     입력은 찍는 HTML, 그 HTML 이 부르는 사이트 안 파일(CSS·글꼴·스크립트·그림), 이 스크립트, package-lock.json 이다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT, cacheDir, distDir, isPublic, printJobs, visibleLessons } from '#lib/content.ts';

const A4 = { portrait: [210, 297], landscape: [297, 210] };
const ORIENTATION = { portrait: '세로', landscape: '가로' };
const KINDS = ['worksheet', 'papercraft', 'coloring', 'cards'];
/** 본문의 마지막 블록과 바닥글 글자 사이의 가장 작은 틈(mm). docs/CONTRACT.md 7절 (R29). src/components/print/layout.ts 의 FOOT_GAP_MM 과 같은 값이다. */
const FOOT_GAP_MM = 6;
// 바닥글 앞의 틈을 어기면 멈추는 인쇄물. 페이퍼크래프트는 전개도 쪽이 아직 틈을 남기지 않아 알리기만 한다 (담당이 맞추면 여기에 더한다).
const GAP_STOPS = new Set(['worksheet', 'cards', 'coloring']);

// ───────────────────────────── 인자 ─────────────────────────────

/** 스크립트를 멈추는 오류. 글을 그대로 보여 준다 (스택을 찍지 않는다). */
class Stop extends Error {}

function readArgs(argv) {
  const value = (flag, example) => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) throw new Stop(`${flag} 뒤에 값을 적습니다. 예: ${flag} ${example}`);
    return v;
  };
  const kind = value('--kind', 'worksheet');
  if (kind && !KINDS.includes(kind)) throw new Stop(`--kind 에는 ${KINDS.join(' · ')} 가운데 하나를 적습니다 (지금: ${kind})`);
  return { only: value('--only', '5-2/1/01'), kind, force: argv.includes('--force') };
}

// ───────────────────────────── 사이트 안 파일 ─────────────────────────────

// 주소의 하위 경로. astro 는 SITE_BASE 가 있어도 dist/5-2/… 에 쓰므로 주소에서 이것을 떼면 dist 안의 자리가 된다.
const BASE = '/' + (process.env.SITE_BASE ?? '').replace(/^\/+|\/+$/g, '');
const stripBase = (pathname) => {
  if (BASE === '/') return pathname;
  return pathname === BASE || pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) || '/' : undefined;
};

/** 사이트 안 주소(경로)가 가리키는 dist 의 파일. 사이트 밖이거나 없는 파일이면 undefined */
function fileOf(dist, pathname) {
  let rel;
  try { rel = stripBase(decodeURIComponent(pathname)); } catch { return undefined; }
  if (rel === undefined) return undefined;
  const file = path.join(dist, rel.endsWith('/') ? `${rel}index.html` : rel);
  if (file !== dist && !file.startsWith(dist + path.sep)) return undefined;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : undefined;
}

const TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', pdf: 'application/pdf',
};

/** 빌드한 사이트를 127.0.0.1 의 빈 포트에서 내준다 */
async function serve(dist) {
  const server = http.createServer((req, res) => {
    const file = fileOf(dist, (req.url ?? '/').split('?')[0]);
    if (!file) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

// ───────────────────────────── 캐시의 입력 ─────────────────────────────

const sha = (data) => createHash('sha256').update(data).digest('hex');
const fileHashes = new Map();
const hashFile = (file) => { if (!fileHashes.has(file)) fileHashes.set(file, sha(fs.readFileSync(file))); return fileHashes.get(file); };

// HTML 에서 페이지가 불러오는 주소를 뽑는다. <a href> 는 불러오지 않으므로 뺀다 (차시 안내 페이지가 바뀌었다고 PDF 를 다시 찍지 않는다).
const LOADING_TAG = /<(?:link|script|img|source|image|use|object|embed|iframe|video|audio|input)\b[^>]*>/gi;
const URL_ATTR = /\s(?:src|href|data|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const SRCSET_ATTR = /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const firstGroup = (m) => m.slice(1).find((g) => g !== undefined) ?? '';

function htmlRefs(html) {
  const out = [];
  for (const [tag] of html.matchAll(LOADING_TAG)) {
    for (const m of tag.matchAll(URL_ATTR)) out.push(unescapeHtml(firstGroup(m)));
    for (const m of tag.matchAll(SRCSET_ATTR)) for (const part of firstGroup(m).split(',')) out.push(unescapeHtml(part.trim().split(/\s+/)[0]));
  }
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out.push(...cssRefs(css));
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) out.push(...cssRefs(unescapeHtml(m[1])));
  return out;
}
function cssRefs(css) {
  return [...css.matchAll(CSS_URL)].map(firstGroup);
}

/**
 * 이 인쇄 페이지를 찍는 데 들어가는 사이트 안 파일 (dist 기준 경로, 가나다순).
 * HTML 과, 그것이 부르는 파일, 그 파일(CSS)이 다시 부르는 파일까지 따라간다.
 * extra 는 지난번에 찍을 때 브라우저가 실제로 불렀던 파일이다 (스크립트가 나중에 부르는 파일처럼 글자로는 찾지 못하는 것).
 */
function siteInputs(dist, route, extra = []) {
  const seen = new Set();
  const visit = (pathname) => {
    const file = fileOf(dist, pathname);
    if (!file || seen.has(file)) return;
    seen.add(file);
    const ext = path.extname(file);
    if (ext !== '.html' && ext !== '.css') return;
    const text = fs.readFileSync(file, 'utf8');
    for (const ref of ext === '.html' ? htmlRefs(text) : cssRefs(text)) {
      if (!ref || ref.startsWith('#') || ref.startsWith('data:')) continue;
      let url;
      try { url = new URL(ref, `http://site.invalid${pathname}`); } catch { continue; }
      if (url.host === 'site.invalid') visit(url.pathname);
    }
  };
  visit((BASE === '/' ? '' : BASE) + route);
  for (const rel of extra) { const file = path.join(dist, rel); if (fs.existsSync(file) && fs.statSync(file).isFile()) seen.add(file); }
  return [...seen].map((f) => path.relative(dist, f).split(path.sep).join('/')).sort();
}

const TOOL_FILES = ['scripts/render-pdf.mjs', 'package-lock.json'];
/** 초안 PDF 의 제목 앞에 붙이는 말 */
const DRAFT_TITLE = '[검수 전 초안] ';

/** 캐시 파일(<kind>.pdf.sha256)에 적는 글: 첫 줄은 전체의 sha256, 그 아래는 입력마다 한 줄 */
function manifest(dist, job, inputs) {
  const lines = [
    `# ${job.kind} · ${job.pages}쪽 · ${job.print.orientation}`,
    ...TOOL_FILES.map((f) => `${hashFile(path.join(ROOT, f))}  repo:${f}`),
    ...inputs.map((rel) => `${hashFile(path.join(dist, rel))}  ${rel}`),
  ];
  return `${sha(lines.join('\n'))}\n${lines.join('\n')}\n`;
}
/** 지난번 캐시 글에서 입력 경로를 읽는다 (도구 파일 빼고) */
const manifestInputs = (text) => text.split('\n').slice(2).map((l) => l.split('  ')[1]).filter((p) => p && !p.startsWith('repo:'));

// ───────────────────────────── 페이지 안에서 재기 (조건 1·2·4·6·7, 바닥글 앞의 틈) ─────────────────────────────

/**
 * 브라우저 안에서 돈다. 인쇄 모양을 건 뒤에 부른다. 어긋난 곳을 { page, text } 로 돌려준다 (page 0 은 쪽을 짚을 수 없는 것).
 * tests/contract/print.test.ts 의 sheetProblems() 와 같은 것을 같은 값으로 잰다. 알림 글에는 얼마나, 어디부터 넘쳤는지를 더한다.
 */
async function measureSheets({ pages, footGap }) {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  const mm = (px) => `${Math.max(0.1, Math.round((px * 254) / 96) / 10)}mm`;
  const out = [];
  const NAME = { '.sheet': '쪽 전체', '.sheet-head': '머리', '.sheet-body': '본문', '.sheet-foot': '바닥글' };
  const SUBJECT = { '.sheet': '쪽 전체가', '.sheet-head': '머리가', '.sheet-body': '본문이', '.sheet-foot': '바닥글이' };
  const HINT = {
    '.sheet': '',
    '.sheet-head': ' 제목이나 부제를 줄입니다.',
    '.sheet-body': ' 내용을 줄이거나 다음 쪽으로 옮깁니다.',
    '.sheet-foot': ' 바닥글은 두 줄까지 들어갑니다.',
  };
  // 넘친 자리를 사람이 알아볼 이름으로: 학습지 블록은 data-part("3번째 블록(줄 쓰기 칸)"), 그 밖은 태그와 글머리
  const nameOf = (el) => {
    const part = el.closest('[data-part]');
    if (part) return part.getAttribute('data-part');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    return `<${el.tagName.toLowerCase()}${cls}>${text ? ` "${text.length > 16 ? `${text.slice(0, 16)}…` : text}"` : ''}`;
  };
  const drawn = (box) => [...box.querySelectorAll('*')].filter((el) => el.getClientRects().length > 0);

  const sheets = [...document.querySelectorAll('.sheet')];
  // 조건 1
  if (sheets.length !== pages) out.push({ page: 0, text: `인쇄 페이지에 종이(.sheet)가 ${sheets.length}쪽 있습니다. printJobs() 의 쪽수는 ${pages}쪽입니다.` });

  sheets.forEach((sheet, i) => {
    const page = i + 1;
    let partOver = false;
    for (const sel of ['.sheet-head', '.sheet-body', '.sheet-foot', '.sheet']) {
      const box = sel === '.sheet' ? sheet : sheet.querySelector(sel);
      if (!box) { out.push({ page, text: `${NAME[sel]} 상자(${sel})가 없습니다.` }); continue; }
      const r = box.getBoundingClientRect();
      // 조건 2: 크기가 고정된 상자의 아래·오른쪽 넘침
      const down = box.scrollHeight > box.clientHeight + 1;
      const right = box.scrollWidth > box.clientWidth + 1;
      // 쪽 전체는 머리·본문·바닥글이 멀쩡할 때만 알린다 (같은 넘침을 두 번 적지 않는다)
      if ((down || right) && !(sel === '.sheet' && partOver)) {
        if (sel !== '.sheet') partOver = true;
        const size = [down && `아래로 ${mm(box.scrollHeight - box.clientHeight)}`, right && `오른쪽으로 ${mm(box.scrollWidth - box.clientWidth)}`].filter(Boolean).join(', ');
        const first = drawn(box).find((el) => { const q = el.getBoundingClientRect(); return (down && q.bottom > r.bottom + 1) || (right && q.right > r.right + 1); });
        out.push({ page, text: `${SUBJECT[sel]} ${size} 넘칩니다 (자리 ${mm(box.clientWidth)} × ${mm(box.clientHeight)}).${first ? ` ${nameOf(first)}부터 자리가 모자랍니다.` : ''}${HINT[sel]}` });
      }
      if (sel === '.sheet') continue;
      // 조건 6: 상자 안의 요소가 상자의 사각형 밖으로 나갔는가 (위·왼쪽으로 나간 것, 잘려서 찍히지 않는 것). 조건 2 가 이미 알린 쪽은 뺀다.
      for (const el of drawn(box)) {
        const q = el.getBoundingClientRect();
        const sides = [
          q.top < r.top - 1 && `위로 ${mm(r.top - q.top)}`,
          q.left < r.left - 1 && `왼쪽으로 ${mm(r.left - q.left)}`,
          !down && q.bottom > r.bottom + 1 && `아래로 ${mm(q.bottom - r.bottom)}`,
          !right && q.right > r.right + 1 && `오른쪽으로 ${mm(q.right - r.right)}`,
        ].filter(Boolean);
        if (sides.length === 0) continue;
        out.push({ page, text: `${NAME[sel]} 밖으로 나간 것이 있습니다: ${nameOf(el)} (${sides.join(', ')}). 다른 칸과 겹치거나 잘려서 찍힙니다.` });
        break;
      }
    }
    // 바닥글 앞의 틈 (R29): 본문에 그려진 것 가운데 가장 아래의 것과 바닥글의 첫 글줄 사이가 footGap(mm) 이상이다.
    // 넘친 쪽은 위에서 이미 알렸으므로 다시 알리지 않는다.
    const body = sheet.querySelector('.sheet-body');
    const foot = sheet.querySelector('.sheet-foot');
    if (!partOver && body && foot && foot.textContent.trim()) {
      const range = document.createRange();
      range.selectNodeContents(foot);
      const lines = [...range.getClientRects()].filter((q) => q.height > 0);
      const footTop = Math.min(...lines.map((q) => q.top));
      // 테두리도 바탕도 없는 상자(블록을 담는 .ws 같은 것)의 아래 여백은 종이에 찍히지 않으므로 빼고 잰다
      const inkBottom = (el, q) => {
        const st = getComputedStyle(el);
        const painted = parseFloat(st.borderBottomWidth) > 0 || st.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor);
        return painted ? q.bottom : q.bottom - parseFloat(st.paddingBottom);
      };
      let last;
      for (const el of drawn(body)) {
        // 인쇄 페이지에 바로 놓인 <svg>(전개도)는 상자가 그림 칸 전체다. 잉크는 그 안의 선과 글이므로 뿌리 상자는 재지 않는다.
        if (el instanceof SVGSVGElement && !(el.parentElement && el.parentElement.closest('svg'))) continue;
        const q = el.getBoundingClientRect();
        if (q.height <= 0 || q.width <= 0) continue;
        const bottom = inkBottom(el, q);
        if (!last || bottom > last.bottom) last = { el, bottom };
      }
      const gapMm = last ? ((footTop - last.bottom) * 25.4) / 96 : Infinity;
      if (gapMm < footGap - 0.05) {
        out.push({ page, gap: true, text: `바닥글 앞의 틈이 ${footTop > last.bottom ? mm(footTop - last.bottom) : '0mm'}뿐입니다 (${nameOf(last.el)} 아래). ${footGap}mm 이상 띄웁니다. 내용을 줄이거나 다음 쪽으로 옮깁니다.` });
      }
    }
  });

  // 조건 4: 글꼴
  const fonts = [...document.fonts];
  const failed = [...new Set(fonts.filter((f) => f.status === 'error').map((f) => f.family))];
  if (failed.length) out.push({ page: 0, text: `글꼴을 싣지 못했습니다 (${failed.join(', ')}).` });
  if (!fonts.some((f) => f.status === 'loaded')) out.push({ page: 0, text: '실린 글꼴이 없습니다. dist 의 _astro/ 에 글꼴 파일이 있는지, SITE_BASE 가 빌드할 때와 같은지 봅니다.' });

  // 조건 7: 그림
  for (const img of document.images) {
    if (img.complete && img.naturalWidth > 0) continue;
    const at = sheets.indexOf(img.closest('.sheet'));
    out.push({ page: at + 1, text: `그림을 싣지 못했습니다 (${img.getAttribute('src')}). 그림을 dist 의 media/ 로 복사했는지 봅니다 (scripts/sync-media.mjs).` });
  }
  return out;
}

// ───────────────────────────── PDF 읽기 (조건 3·5) ─────────────────────────────

async function pdfProblems(data, job) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(data), verbosity: 0 });
  const out = [];
  try {
    const doc = await task.promise;
    // 조건 3
    if (doc.numPages !== job.pages) out.push({ page: 0, text: `PDF 가 ${doc.numPages}쪽으로 찍혔습니다. printJobs() 의 쪽수는 ${job.pages}쪽입니다.` });
    // 조건 5
    const [w, h] = A4[job.print.orientation];
    for (let no = 1; no <= doc.numPages; no++) {
      const [x0, y0, x1, y1] = (await doc.getPage(no)).view;
      const [pw, ph] = [x1 - x0, y1 - y0].map((pt) => (pt / 72) * 25.4);
      if (Math.abs(pw - w) > 1 || Math.abs(ph - h) > 1) {
        out.push({ page: no, text: `PDF 의 쪽 크기가 ${pw.toFixed(1)} × ${ph.toFixed(1)}mm 입니다. A4 ${ORIENTATION[job.print.orientation]}(${w} × ${h}mm)여야 합니다.` });
      }
    }
  } finally {
    await task.destroy();
  }
  return out;
}

// ───────────────────────────── 한 장 찍기 ─────────────────────────────

/** 인쇄 페이지 하나를 열어 재고 찍는다. { pdf, problems, warnings, loaded } — problems 가 있으면 pdf 는 쓰지 않는다. warnings 는 알리기만 한다. */
async function render(browser, site, dist, lesson, job) {
  const page = await browser.newPage();
  const problems = [];
  const warnings = [];
  const loaded = new Set();
  try {
    // 인쇄 페이지는 사이트 밖으로 아무것도 부르지 않는다 (학교망에서 막힌다). 부르면 막고 알린다.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(`${site.origin}/`) || /^(?:data|blob|about):/.test(url)) return route.continue();
      problems.push({ page: 0, text: `사이트 밖 주소를 부릅니다 (${url}). 인쇄 페이지는 밖의 글꼴·그림·스크립트를 쓰지 않습니다.` });
      return route.abort();
    });
    page.on('response', (res) => {
      const url = new URL(res.url());
      if (url.origin !== site.origin) return;
      const file = fileOf(dist, url.pathname);
      if (file) loaded.add(path.relative(dist, file).split(path.sep).join('/'));
      // 싣지 못한 그림은 조건 7 이 쪽 번호와 함께 알린다
      else if (res.status() >= 400 && res.request().resourceType() !== 'image') problems.push({ page: 0, text: `사이트 안 파일을 찾지 못했습니다 (${url.pathname}). SITE_BASE 가 빌드할 때와 같은지 봅니다.` });
    });
    // 재기 전에 인쇄 모양을 건다. .no-print 와 @media print 로 달라지는 모양이 재는 값에 섞이지 않는다.
    await page.emulateMedia({ media: 'print' });
    await page.goto(site.origin + (BASE === '/' ? '' : BASE) + job.route, { waitUntil: 'load' });
    for (const p of await page.evaluate(measureSheets, { pages: job.pages, footGap: FOOT_GAP_MM })) {
      if (p.gap && !GAP_STOPS.has(job.kind)) warnings.push(p);
      else problems.push(p);
    }
    if (problems.length) return { problems, warnings, loaded: [...loaded] };
    // PDF 의 제목(Title)은 페이지의 <title> 이다. 초안은 파일만 따로 돌아다녀도 초안인 줄 알게 제목 앞에 적는다.
    if (!isPublic(lesson)) await page.evaluate((mark) => { if (!document.title.startsWith(mark)) document.title = mark + document.title; }, DRAFT_TITLE);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    problems.push(...await pdfProblems(pdf, job));
    return { pdf, problems, warnings, loaded: [...loaded] };
  } finally {
    await page.close();
  }
}

// ───────────────────────────── 차례대로 ─────────────────────────────

async function main() {
  const args = readArgs(process.argv.slice(2));
  let dist;
  try { dist = distDir(); } catch (e) { throw new Stop(e.message); }
  const cache = path.join(cacheDir(), 'files');
  const shown = (file) => path.relative(ROOT, file) || '.';

  let lessons = visibleLessons();
  if (args.only) {
    lessons = lessons.filter((l) => l.id === args.only);
    if (lessons.length === 0) throw new Stop(`--only ${args.only}: 이번 빌드에 실리는 차시가 아닙니다. 묶음 id 를 "5-2/1/01"처럼 적었는지, 초안이면 SHOW_DRAFTS=1 을 주었는지 봅니다.`);
  }
  const jobs = lessons.flatMap((lesson) => printJobs(lesson).filter((j) => !args.kind || j.kind === args.kind).map((job) => ({ lesson, job })));
  if (jobs.length === 0) { console.log('찍을 인쇄물이 없습니다.'); return; }
  if (!fs.existsSync(dist)) throw new Stop(`빌드한 사이트가 없습니다 (${shown(dist)}). astro build 를 먼저 돌립니다 (npm run build 는 차례대로 돌립니다).`);
  console.log(`인쇄물 ${jobs.length}개를 PDF 로 만듭니다 → ${shown(path.join(dist, 'files'))}`);

  let site;
  let browser;
  const failures = [];
  let made = 0;
  let copied = 0;
  try {
    for (const { lesson, job } of jobs) {
      const name = `${lesson.id} ${job.label}`;
      const target = path.join(dist, job.file);
      const cached = path.join(cache, lesson.id, `${job.kind}.pdf`);
      const record = `${cached}.sha256`;
      const fail = (problems) => {
        failures.push({ lesson, job, problems });
        // 고칠 곳이 있는 인쇄물은 지난번 것도 남기지 않는다
        for (const f of [target, cached, record]) fs.rmSync(f, { force: true });
        console.log(`  ✗ ${name} — 고칠 곳 ${problems.length}군데`);
      };
      if (!fileOf(dist, (BASE === '/' ? '' : BASE) + job.route)) {
        fail([{ page: 0, text: `인쇄 페이지가 없습니다 (${shown(path.join(dist, job.route, 'index.html'))}). astro build 를 같은 환경 변수로 다시 돌립니다.` }]);
        continue;
      }
      // 입력이 지난번과 같으면 찍지 않고 복사한다
      const before = fs.existsSync(record) && fs.existsSync(cached) ? fs.readFileSync(record, 'utf8') : '';
      if (!args.force && before && before === manifest(dist, job, siteInputs(dist, job.route, manifestInputs(before)))) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(cached, target);
        copied++;
        console.log(`  = ${name} ${job.pages}쪽 (그대로)`);
        continue;
      }
      site ??= await serve(dist);
      if (!browser) {
        const { chromium } = await import('playwright');
        try {
          browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        } catch (e) {
          throw new Stop(`Chromium 을 띄울 수 없습니다. npx playwright install chromium 으로 깔거나 CHROMIUM_PATH 로 가리킵니다.\n  ${String(e.message).split('\n')[0]}`);
        }
      }
      const { pdf, problems, warnings, loaded } = await render(browser, site, dist, lesson, job);
      for (const w of warnings) console.log(`  ! ${name} ${w.page}쪽: ${w.text}`);
      if (problems.length || !pdf) { fail(problems); continue; }
      for (const f of [target, cached]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, pdf); }
      fs.writeFileSync(record, manifest(dist, job, siteInputs(dist, job.route, loaded)));
      made++;
      console.log(`  ✓ ${name} ${job.pages}쪽`);
    }
  } finally {
    await browser?.close();
    await site?.close();
  }

  if (failures.length) {
    const lines = ['', '인쇄물에 고칠 곳이 있어 멈춥니다.'];
    for (const { lesson, job, problems } of failures) {
      lines.push('', `${lesson.id} 「${lesson.title}」 ${job.label} (${job.route})`);
      for (const p of problems) lines.push(`  - ${p.page ? `${p.page}쪽: ` : ''}${p.text}`);
    }
    console.error(lines.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`모두 ${jobs.length}개: 새로 찍은 것 ${made}개, 그대로 쓴 것 ${copied}개.`);
}

try {
  await main();
} catch (e) {
  // 명세를 읽다 난 오류(SpecError)와 이 스크립트가 멈춘 까닭은 글만, 그 밖의 오류는 어디에서 났는지도 보여 준다
  console.error(e instanceof Stop || e?.name === 'SpecError' ? e.message : e);
  process.exitCode = 1;
}
