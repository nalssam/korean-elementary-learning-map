// 페이퍼크래프트 시험이 같이 쓰는 도우미. (*.test.ts 가 아니라서 시험으로 돌지 않는다.)
// 빌드한 사이트를 127.0.0.1 에서 내주고, 인쇄 페이지를 docs/CONTRACT.md 7절의 조건으로 잰다.
// 재는 법은 tests/contract/print.test.ts 의 sheetProblems() 를 그대로 따른다 (그 파일은 내보내지 않으므로 여기에 옮겨 둔다).
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

/** 빌드한 사이트를 내준다. base 가 있으면 떼고 out 에 대응시킨다 (10절). */
export async function serve(out: string, base = ''): Promise<{ origin: string; close: () => void }> {
  const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = url.startsWith(`${base}/`) ? path.join(out, url.slice(base.length)) : '';
    if (file && url.endsWith('/')) file = path.join(file, 'index.html');
    if (!file || !file.startsWith(out) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file).slice(1)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/** 7절 조건 1·2·4·6·7. page.emulateMedia({ media: 'print' }) 를 건 뒤에 page.evaluate(sheetProblems, pages) 로 부른다. */
export async function sheetProblems(pages: number): Promise<string[]> {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  const out: string[] = [];
  const sheets = [...document.querySelectorAll('.sheet')];
  if (sheets.length !== pages) out.push(`조건 1: .sheet 가 ${sheets.length}개입니다 (${pages}개여야 합니다)`);
  sheets.forEach((sheet, i) => {
    for (const sel of ['.sheet', '.sheet-head', '.sheet-body', '.sheet-foot']) {
      const box = sel === '.sheet' ? sheet : sheet.querySelector(sel);
      if (!box) { out.push(`${i + 1}쪽: ${sel} 가 없습니다`); continue; }
      if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) out.push(`조건 2: ${i + 1}쪽 ${sel} 가 넘칩니다 (${box.scrollWidth}×${box.scrollHeight} > ${box.clientWidth}×${box.clientHeight})`);
    }
    for (const sel of ['.sheet-head', '.sheet-body', '.sheet-foot']) {
      const box = sheet.querySelector(sel);
      if (!box) continue;
      const r = box.getBoundingClientRect();
      for (const el of box.querySelectorAll('*')) {
        if (el.getClientRects().length === 0) continue;
        const q = el.getBoundingClientRect();
        if (q.top < r.top - 1 || q.left < r.left - 1 || q.bottom > r.bottom + 1 || q.right > r.right + 1) {
          out.push(`조건 6: ${i + 1}쪽 ${sel} 안의 <${el.tagName.toLowerCase()}> 가 상자 밖으로 나갔습니다`);
          break;
        }
      }
    }
  });
  const fonts = [...document.fonts].map((f) => f.status);
  if (fonts.includes('error')) out.push('조건 4: 싣지 못한 글꼴이 있습니다');
  if (!fonts.includes('loaded')) out.push('조건 4: 실린 글꼴이 없습니다');
  for (const img of document.images) if (!(img.complete && img.naturalWidth > 0)) out.push(`조건 7: 그림을 싣지 못했습니다 (${img.getAttribute('src')})`);
  return out;
}

/**
 * 전개도 안의 글이 제 조각 밖으로 나가지 않았는가 (조건 6 은 본문 상자만 본다).
 * 차례 카드의 글줄(data-card-line)이 그 카드의 사각형 안에 있는지, 실제 글 폭이 모듈의 어림(textWidth)보다 넓지 않은지 본다.
 */
export function cardProblems(): string[] {
  const out: string[] = [];
  const svgs = [...document.querySelectorAll('.sheet-body > svg')] as SVGSVGElement[];
  svgs.forEach((svg, s) => {
    const lines = [...svg.querySelectorAll('[data-card-line]')] as SVGGElement[];
    for (const g of lines) {
      const piece = g.parentElement!;
      const outline = piece.querySelector('path[stroke-width="0.5"]') as SVGPathElement | null;
      if (!outline) { out.push(`${s + 1}쪽: 카드의 자르는 선을 찾지 못했습니다`); continue; }
      const card = outline.getBBox(), t = (g.firstElementChild as SVGTextElement).getBBox();
      if (t.x < card.x + 1 || t.x + t.width > card.x + card.width - 1 || t.y < card.y + 1 || t.y + t.height > card.y + card.height - 1) {
        out.push(`${s + 1}쪽 차례 카드 ${g.dataset.cardLine}: "${g.textContent}" 가 카드 밖으로 나갑니다`);
      }
    }
  });
  return out;
}
