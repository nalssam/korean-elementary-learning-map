// 자료 카드의 미리보기 그림을 찍는다 (빌드 3단계의 미리보기 단계. docs/CONTRACT.md 10절, R52). 저장소 담당.
//
// scripts/render-pdf.mjs 가 PDF 를 찍은 뒤에 같은 로컬 서버와 Chromium 으로 부른다. PDF 를 찍는 코드와 섞지 않으려고 파일을 나눴다.
// 이 파일만 따로 돌리지 않는다 (node scripts/render-pdf.mjs 가 차례를 맡는다. --kind slides 처럼 주면 그 미리보기만 찍는다).
//
// visibleLessons() 의 차시마다, 페이지가 있는 자료(ASSET_ROUTE 의 일곱) 가운데 준비된 것 하나에 한 장 → thumbFile(id, kind)
//   인쇄물(학습지·카드·컬러링 도안·페이퍼크래프트)  첫 쪽(.sheet)의 윗부분을 쪽 폭 그대로 4:3 으로     480 × 360 (가로 쪽은 쪽 전체 480 × 339)
//   수업 화면                                     1번 장 전체를 1920 × 1080 무대에서                 480 × 270
//   확인 퀴즈·웹 활동                              폭 360px 휴대폰 화면의 위쪽 480px                  270 × 360
// JPEG, 폭 480px·60KB 이하. 찍기 전에 남의 그림(img[data-licence])을 가린다: 줄인 그림에서는 곁의 출처 표시를 읽을 수 없고,
// 쪽의 윗부분만 찍으면 사진이 잘릴 수 있다 (5·6절). 자리는 비어 남는다.
// 캐시는 PDF 와 같다: 찍는 HTML 과 그것이 부르는 파일, 이 스크립트, package-lock.json 의 sha256 이 같으면 <캐시>/files/<id>/thumbs/<kind>.jpg 를 복사만 한다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, lessonRoute, printJobs, readyKinds, thumbFile } from '#lib/content.ts';
import { ASSET_LABEL, ASSET_ROUTE } from '#lib/site.ts';

/** 미리보기 그림이 있는 자료 (페이지가 있는 자료, KIND 차례는 ASSET_ROUTE 의 차례) */
export const THUMB_KINDS = Object.keys(ASSET_ROUTE);
const PRINT = new Set(['worksheet', 'cards', 'coloring', 'papercraft']);
/** 폭과 무게의 한도 (R52). checks/outputs.mjs 가 같은 값으로 본다. */
export const THUMB_MAX = { width: 480, bytes: 60 * 1024 };
// JPEG 의 질. 60KB 를 넘으면 한 단계씩 낮춰 다시 찍는다. 글자가 많은 쪽도 대개 첫 단계에서 30KB 남짓이다.
const QUALITY = [82, 72, 62, 52, 42];

// 종이의 폭 (CSS px). 210mm·297mm 를 96dpi 로.
const MM = 96 / 25.4;
const SHEET_WIDTH = { portrait: 210 * MM, landscape: 297 * MM };

/**
 * 자료마다 찍는 법. viewport 는 찍을 화면의 크기, scale 은 기기의 화소 배율(deviceScaleFactor)이다.
 * 결과의 크기는 찍는 자리(CSS px) × scale 이다. 배율을 1 보다 작게 주면 Chromium 이 그 크기로 바로 그려서(글자를 그 크기로 다시 그린다)
 * 큰 그림을 줄인 것보다 글자가 또렷하다.
 */
function shotOf(kind, orientation) {
  if (PRINT.has(kind)) {
    // 쪽 폭이 그대로 480px 이 되게 (찍는 자리는 shoot() 이 쪽의 윗부분 4:3 으로 정한다)
    const width = SHEET_WIDTH[orientation ?? 'portrait'];
    return { what: 'sheet', viewport: { width: Math.ceil(width) + 200, height: Math.ceil(width) + 200 }, scale: THUMB_MAX.width / width, size: [480, 360] };
  }
  if (kind === 'slides') return { what: 'screen', viewport: { width: 1920, height: 1080 }, scale: 0.25, size: [480, 270] };
  // 확인 퀴즈·웹 활동: 아이가 휴대폰으로 연 첫 화면
  return { what: 'screen', viewport: { width: 360, height: 480 }, scale: 0.75, size: [270, 360], mobile: true };
}

/** 찍을 미리보기 그림의 목록. kind 를 주면 그 종류만 (render-pdf 의 --kind) */
export function thumbJobs(lessons, kind) {
  const out = [];
  for (const lesson of lessons) {
    const ready = new Set(readyKinds(lesson));
    for (const k of THUMB_KINDS) {
      if (!ready.has(k) || (kind && k !== kind)) continue;
      // 방향은 빈 칸을 기본값으로 채운 printJobs() 의 것 (명세의 print 를 직접 읽지 않는다. 5절)
      const job = printJobs(lesson).find((j) => j.kind === k);
      out.push({ lesson, kind: k, label: ASSET_LABEL[k], route: lessonRoute(lesson.id, ASSET_ROUTE[k]), shot: shotOf(k, job?.print.orientation) });
    }
  }
  return out;
}

const sha = (data) => createHash('sha256').update(data).digest('hex');
const TOOL_FILES = ['scripts/thumbs.mjs', 'package-lock.json'];

/** 캐시 파일(<kind>.jpg.sha256)에 적는 글: 첫 줄은 전체의 sha256, 그 아래는 입력마다 한 줄 (render-pdf 의 PDF 캐시와 같은 꼴) */
function manifest(dist, job, inputs, hashFile) {
  const lines = [
    `# thumb ${job.kind} · ${job.shot.size.join('x')}`,
    ...TOOL_FILES.map((f) => `${hashFile(path.join(ROOT, f))}  repo:${f}`),
    ...inputs.map((rel) => `${hashFile(path.join(dist, rel))}  ${rel}`),
  ];
  return `${sha(lines.join('\n'))}\n${lines.join('\n')}\n`;
}
const manifestInputs = (text) => text.split('\n').slice(2).map((l) => l.split('  ')[1]).filter((p) => p && !p.startsWith('repo:'));

// 찍기 전에 얹는 모양. 남의 그림은 자리만 남기고 가리고, 화면에만 보이는 안내(인쇄 안내 띠)와 수업 화면의 단추 줄은 숨긴다.
const HIDE_CSS = `img[data-licence] { visibility: hidden !important; }
.no-print, .hud { display: none !important; }
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`;

/** 브라우저 안에서 돈다: 글꼴과 그림을 기다리고, 그림 상자를 다시 잰 뒤 두 번 그려지게 둔다 */
async function settle() {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode()).catch(() => undefined)));
  window.dispatchEvent(new Event('media-layout'));
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
}

/** 한 장 찍기. { jpg, problems, loaded } */
async function shoot(browser, url, job, origin, fileOf) {
  const { shot } = job;
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: shot.scale, isMobile: Boolean(shot.mobile), hasTouch: Boolean(shot.mobile) });
  const page = await context.newPage();
  const problems = [];
  const loaded = new Set();
  try {
    // 사이트 밖으로는 아무것도 부르지 않는다
    await page.route('**/*', (route) => (route.request().url().startsWith(`${origin}/`) || /^(?:data|blob|about):/.test(route.request().url()) ? route.continue() : route.abort()));
    page.on('response', (res) => {
      const u = new URL(res.url());
      if (u.origin !== origin) return;
      const file = fileOf(u.pathname);
      if (file) loaded.add(file);
    });
    const res = await page.goto(url, { waitUntil: 'load' });
    if (!res || !res.ok()) return { problems: [`페이지를 열지 못했습니다 (${res ? res.status() : '응답 없음'})`], loaded: [] };
    await page.addStyleTag({ content: HIDE_CSS });
    await page.evaluate(settle);
    let clip;
    if (shot.what === 'sheet') {
      const box = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet');
        if (!sheet) return undefined;
        window.scrollTo(0, 0);
        const r = sheet.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
      if (!box) return { problems: ['종이(.sheet)가 없습니다'], loaded: [] };
      // 결과가 480 × 360 화소가 되는 자리. 소수점 셈이 480.0001 로 올라가 481 화소가 되지 않게 0.01 화소를 덜어 낸다.
      // 가로 쪽은 쪽 전체가 4:3 보다 납작하다 (297 × 210mm). 쪽 밖의 바탕까지 찍지 않게 쪽 전체에서 멈춘다 (480 × 339).
      const [w, h] = shot.size.map((n) => (n - 0.01) / shot.scale);
      clip = { x: box.x, y: box.y, width: Math.min(box.width, w), height: Math.min(box.height, h) };
    }
    for (const quality of QUALITY) {
      const jpg = await page.screenshot({ type: 'jpeg', quality, clip, fullPage: false, animations: 'disabled', caret: 'hide' });
      if (jpg.length <= THUMB_MAX.bytes) return { jpg, problems, loaded: [...loaded] };
    }
    return { problems: [`질을 ${QUALITY.at(-1)} 까지 낮춰도 ${THUMB_MAX.bytes / 1024}KB 를 넘습니다`], loaded: [] };
  } finally {
    await context.close();
  }
}

/** JPEG 의 가로세로 (SOF 표지에서 읽는다) */
export function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let p = 2;
  while (p + 9 < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { p += marker === 0xff ? 1 : 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5) };
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return undefined;
}

/**
 * 미리보기 그림을 찍거나 캐시에서 복사한다. 고칠 곳이 있는 그림은 { lesson, label, problems } 로 돌려준다.
 * ctx: dist(빌드한 사이트), cache(<캐시>/files), force, prune(목록에 없는 미리보기를 dist 에서 지운다. --kind·--only 없이 돌 때만),
 *      open() → { origin, browser } (서버와 Chromium 을 처음 쓸 때 띄운다), url(route), fileOf(pathname) → dist 기준 경로,
 *      siteInputs(route, extra), hashFile(file)
 */
export async function renderThumbs(jobs, ctx) {
  const failures = [];
  let made = 0;
  let copied = 0;
  const shown = (file) => path.relative(ROOT, file) || '.';
  if (jobs.length) console.log(`미리보기 그림 ${jobs.length}장 → ${shown(path.join(ctx.dist, 'files'))}/<묶음>/thumbs/`);
  for (const job of jobs) {
    const { lesson } = job;
    const name = `${lesson.id} ${job.label} 미리보기`;
    const target = thumbFile(lesson.id, job.kind, ['--out', ctx.dist]);
    const cached = path.join(ctx.cache, lesson.id, 'thumbs', `${job.kind}.jpg`);
    const record = `${cached}.sha256`;
    const fail = (problems) => {
      failures.push({ lesson, label: `${job.label} 미리보기`, route: job.route, problems });
      for (const f of [target, cached, record]) fs.rmSync(f, { force: true });
      console.log(`  ✗ ${name} — ${problems.join(' ')}`);
    };
    const before = fs.existsSync(record) && fs.existsSync(cached) ? fs.readFileSync(record, 'utf8') : '';
    if (!ctx.force && before && before === manifest(ctx.dist, job, ctx.siteInputs(job.route, manifestInputs(before)), ctx.hashFile)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(cached, target);
      copied++;
      console.log(`  = ${name} (그대로)`);
      continue;
    }
    const { origin, browser } = await ctx.open();
    const { jpg, problems, loaded } = await shoot(browser, ctx.url(job.route), job, origin, ctx.fileOf);
    if (!jpg || problems.length) { fail(problems.length ? problems : ['찍지 못했습니다']); continue; }
    const size = jpegSize(jpg);
    if (!size || size.w > THUMB_MAX.width) { fail([`폭이 ${size?.w ?? '?'}px 입니다 (${THUMB_MAX.width}px 까지)`]); continue; }
    for (const f of [target, cached]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, jpg); }
    fs.writeFileSync(record, manifest(ctx.dist, job, ctx.siteInputs(job.route, loaded), ctx.hashFile));
    made++;
    console.log(`  ✓ ${name} ${size.w}×${size.h} · ${Math.round(jpg.length / 1024)}KB`);
  }
  // 준비된 자료가 줄었으면 지난 빌드의 미리보기가 dist 에 남지 않게 지운다 (산출물 검사가 남은 것을 실패로 본다)
  if (ctx.prune) {
    const keep = new Set(jobs.map((j) => thumbFile(j.lesson.id, j.kind, ['--out', ctx.dist])));
    for (const id of new Set(jobs.map((j) => j.lesson.id).concat(ctx.lessonIds ?? []))) {
      const dir = path.dirname(thumbFile(id, 'slides', ['--out', ctx.dist]));
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (!keep.has(path.join(dir, f))) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    }
  }
  if (jobs.length) console.log(`미리보기 그림 ${jobs.length}장: 새로 찍은 것 ${made}장, 그대로 쓴 것 ${copied}장${failures.length ? `, 고칠 것 ${failures.length}장` : ''}.`);
  return failures;
}
