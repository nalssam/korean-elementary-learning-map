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
 * 지금 보이는 장에서 어긋난 곳을 찾아 글로 돌려준다 (브라우저 안에서 돈다).
 *  - 장 안의 모든 요소가 장의 사각형 안에 있다 (넘친 글, 밀려난 그림)
 *  - 글 상자가 넘치지 않는다 (scrollHeight·scrollWidth)
 *  - 글끼리 겹치지 않는다 (줄 상자를 서로 견준다)
 *  - 아이가 읽는 글은 무대 1920px 기준 44px 이상, 제목은 72px 이상이다
 *  - 그림이 실렸고 object-fit 이 contain 이다
 */
export function slideProblems(): string[] {
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
    const meta = el.closest('.sl-counter, .media figcaption, .sl-notice, .sl-cover-meta, .sl-source, .sl-correct, .sl-num');
    if (!meta && fs < 43.5) out.push(`글자가 작음 (${fs.toFixed(1)}px): "${t.trim().slice(0, 16)}"`);
    if (el.closest('h2') && !el.closest('.sl-term-word') && fs < 71.5) out.push(`제목 글자가 작음 (${fs.toFixed(1)}px): "${t.trim().slice(0, 16)}"`);
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i].r, b = lines[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > Math.min(a.height, b.height) * 0.3) out.push(`글이 겹침: "${lines[i].text}" / "${lines[j].text}"`);
    }
  }
  for (const img of inner.querySelectorAll('img')) {
    if (!img.complete || img.naturalWidth === 0) out.push(`그림이 실리지 않음: ${img.getAttribute('src')}`);
    if (getComputedStyle(img).objectFit !== 'contain') out.push(`그림이 contain 이 아님: ${img.getAttribute('src')}`);
    const r = img.getBoundingClientRect();
    if (r.height < 60 * u) out.push(`그림이 너무 작음 (${(r.height / u).toFixed(0)}px): ${img.getAttribute('src')}`);
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
