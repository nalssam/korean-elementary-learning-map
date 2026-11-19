// 슬라이드 시험이 같이 쓰는 도우미 (*.test.ts 가 아니라서 시험으로 돌지 않는다).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { lessonDir, visibleLessons } from '#lib/content.ts';
import { PASSAGE_SLIDE } from '#schema/lesson.ts';

/**
 * 빌드한 폴더에 그림을 복사한다. 실제 빌드에서는 사이트 담당의 scripts/sync-media.mjs 가 하는 일인데,
 * 슬라이드 시험이 그 스크립트에 기대지 않도록 같은 자리(<out>/media/<id>/<파일>)에 직접 놓는다.
 */
export function copyMedia(out: string): void {
  for (const lesson of visibleLessons()) {
    for (const m of lesson.media) {
      const to = path.join(out, 'media', lesson.id, path.basename(m.file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(lessonDir(lesson.id), m.file), to);
    }
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

/** 빌드한 폴더를 127.0.0.1 의 빈 포트로 내준다 (글꼴이 file:// 로는 실리지 않는다). dev 서버가 아니라 파일만 내주는 서버다. */
export async function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => server.close(() => ok())) };
}

/**
 * 지금 보이는 장에서 어긋난 곳을 찾아 글로 돌려준다 (브라우저 안에서 돈다. page.evaluate(slideProblems)).
 *  - 장 안의 모든 요소가 장의 사각형 안에 있다 (넘친 글, 밀려난 그림)
 *  - 글 상자가 넘치지 않는다 (scrollHeight·scrollWidth)
 *  - 글끼리 겹치지 않는다 (줄 상자를 서로 견준다)
 *  - 아이가 읽는 글은 무대 1920px 기준 44px 이상(장에 맞게 줄어드는 글은 data-fit 의 가장 작은 크기 이상), 제목은 72px 이상이다
 *  - 그 밖의 글도 28px 이상이다. 그림 출처와 장 번호만 뺀다 (docs/CONTRACT.md 8절)
 *  - SVG 그림 안의 글(<text>)도 그려진 크기로 셈해 28px 이상이다
 *  - 그림이 실렸고 object-fit 이 contain 이며, 그림 틀의 짧은 변이 200px 이상이다
 *  - 출처 표시가 그려진 사진에서 24px 안에 있다
 * 이 함수는 브라우저로 넘어가므로 바깥의 값을 쓰지 않는다 (숫자는 copy.ts 의 STAGE_TYPE.min, STAGE_PICTURE.shortSide 와 같다).
 */
export async function slideProblems(): Promise<string[]> {
  const MIN = 28;
  const SHORT_SIDE = 200;
  const out: string[] = [];
  const slide = document.querySelector<HTMLElement>('.slide:not([hidden])')!;
  const inner = slide.querySelector<HTMLElement>('.slide-in')!;
  const sr = slide.getBoundingClientRect();
  const u = sr.width / 1920;
  const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
  for (const el of inner.querySelectorAll<HTMLElement>('*')) {
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.left < sr.left - 1 || r.top < sr.top - 1 || r.right > sr.right + 1 || r.bottom > sr.bottom + 1) out.push(`장 밖으로 나감: ${name(el)} "${el.textContent?.slice(0, 20)}"`);
    if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') out.push(`넘침: ${name(el)}`);
  }
  // 글자의 줄 상자를 모아 서로 겹치는지 본다
  const lines: { r: DOMRect; text: string; el: Element }[] = [];
  const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent ?? '';
    if (!t.trim()) continue;
    const el = n.parentElement!;
    if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1) lines.push({ r, text: t.trim().slice(0, 16), el });
    // 글자 크기
    const fs = Number.parseFloat(getComputedStyle(el).fontSize) / u;
    const label = t.trim().slice(0, 16);
    if (el.closest('.sl-counter, .media figcaption, .sl-shared-credit')) continue;
    const meta = el.closest('.sl-notice, .sl-cover-meta, .sl-source, .sl-correct, .sl-num, .sl-draft, .sl-missing');
    const fitted = el.closest('.sl-fit') ? el.closest<HTMLElement>('[data-fit]') : null;
    const floor = meta ? MIN : fitted ? Math.min(...fitted.dataset.fit!.split(' ').map(Number)) : 44;
    if (fs < floor - 0.5) out.push(`글자가 작음 (${fs.toFixed(1)}px): "${label}"`);
    if (el.closest('h2') && !el.closest('.sl-term-word') && fs < 71.5) out.push(`제목 글자가 작음 (${fs.toFixed(1)}px): "${label}"`);
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i].r, b = lines[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > Math.min(a.height, b.height) * 0.3) out.push(`글이 겹침: "${lines[i].text}" / "${lines[j].text}"`);
    }
  }
  // 그림 틀(figure): 출처 표시를 뺀 자리의 짧은 변
  for (const f of inner.querySelectorAll<HTMLElement>('.media')) {
    const r = f.getBoundingClientRect();
    const cap = f.querySelector('figcaption');
    const capH = cap && cap.getClientRects().length ? cap.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(cap).marginTop) : 0;
    const side = Math.min(r.width, r.height - capH) / u;
    if (side < SHORT_SIDE - 0.5) out.push(`그림 틀이 작음 (짧은 변 ${side.toFixed(0)}px): ${f.querySelector('img')?.getAttribute('src') ?? name(f)}`);
  }
  for (const img of inner.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (!img.complete || img.naturalWidth === 0) { out.push(`그림이 실리지 않음: ${src}`); continue; }
    if (getComputedStyle(img).objectFit !== 'contain') out.push(`그림이 contain 이 아님: ${src}`);
    // 출처 표시는 그려진 그림 바로 아래에 붙는다 (사진·PNG. SVG 는 아래에서 따로 본다)
    const cap = img.closest('.media')?.querySelector('figcaption');
    if (cap && cap.getClientRects().length && !/\.svg(?:[?#]|$)/i.test(src)) {
      const r = img.getBoundingClientRect();
      const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const drawnBottom = r.top + (r.height + img.naturalHeight * k) / 2;
      const gap = (cap.getBoundingClientRect().top - drawnBottom) / u;
      if (gap > 24.5) out.push(`출처 표시가 그림에서 멀리 떨어짐 (${gap.toFixed(0)}px): ${src}`);
    }
    if (!/\.svg(?:[?#]|$)/i.test(src)) continue;
    // SVG 안의 글: 따로 띄운 문서에서 글자 크기와 변환을 읽고, 장에 그려진 배율을 곱한다
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:4000px;height:4000px;border:0;visibility:hidden';
    document.body.append(frame);
    try {
      const doc = frame.contentDocument!;
      doc.open();
      doc.write(`<!doctype html><body style="margin:0">${await (await fetch(img.src)).text()}</body>`);
      doc.close();
      const svg = doc.querySelector('svg');
      const vb = svg?.viewBox.baseVal;
      if (!svg || !vb || !vb.width) { out.push(`SVG 의 viewBox 를 읽지 못함: ${src}`); continue; }
      svg.setAttribute('width', String(vb.width));
      svg.setAttribute('height', String(vb.height));
      const r = img.getBoundingClientRect();
      const drawn = Math.min(r.width / vb.width, r.height / vb.height) / u;
      for (const t of svg.querySelectorAll<SVGGraphicsElement>('text, tspan')) {
        const own = [...t.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
        if (!own) continue;
        const m = t.getCTM();
        const k = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1;
        const px = Number.parseFloat(frame.contentWindow!.getComputedStyle(t).fontSize) * k * drawn;
        if (px < MIN - 0.5) out.push(`그림 안의 글자가 작음 (${px.toFixed(1)}px): "${own.slice(0, 16)}" ${src}`);
      }
    } finally { frame.remove(); }
  }
  return out;
}

/** 형식이 허락하는 가장 긴 글. 실제 글처럼 두세 음절 낱말을 띄어 쓴다 (띄어쓰기가 없는 글은 받아 주지 않는 낱말이 아니므로 따로 본다). */
export function longText(n: number, seed = 0): string {
  const words = ['고인돌', '사람들', '무덤을', '만들고', '큰', '돌을', '옮겨', '올렸습니다', '마을의', '힘을', '모아', '함께', '일했을까요'];
  let s = '';
  for (let i = seed; s.length < n; i++) s += (s ? ' ' : '') + words[i % words.length];
  s = s.slice(0, n).trimEnd();
  while (s.length < n) s += '다';
  return s;
}

/** 수업 화면 한 장에 들어가는 가장 긴 읽기 자료 (문단 4개, 모두 300자) */
export function longPassage(): string[] {
  const per = PASSAGE_SLIDE.chars / PASSAGE_SLIDE.paragraphs;
  return Array.from({ length: PASSAGE_SLIDE.paragraphs }, (_, i) => longText(per, i * 3));
}
