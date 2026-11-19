// 웹 활동 카드에 싣는 그림의 가로세로 비율을 빌드할 때 읽는다 (PlayPage.astro 가 쓴다. 브라우저에는 실리지 않는다).
// 카드의 그림은 짧은 변이 일정한 길이 이상이 되게 그린다 (docs/CONTRACT.md 9절). 그러려면 그림마다 비율을 알아야 한다.
// 명세가 받는 그림은 svg·png·jpg 뿐이라 세 가지만 읽는다. 읽지 못하면 정사각형(1)으로 본다.
import fs from 'node:fs';

/** 가로 ÷ 세로. 읽지 못하면 1 */
export function pictureRatio(file: string): number {
  const size = readSize(file);
  return size && size.w > 0 && size.h > 0 ? size.w / size.h : 1;
}

function readSize(file: string): { w: number; h: number } | null {
  const buf = fs.readFileSync(file);
  // PNG: IHDR 의 너비·높이
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  // JPEG: SOF 표지(C0~CF 가운데 C4·C8·CC 를 뺀 것)의 높이·너비
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  // SVG: width·height 가 숫자면 그것을, 아니면 viewBox 를 본다
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  const tag = /<svg\b[^>]*>/.exec(head)?.[0];
  if (!tag) return null;
  const num = (name: string) => { const m = new RegExp(`\\s${name}="([\\d.]+)(?:px)?"`).exec(tag); return m ? Number(m[1]) : NaN; };
  const w = num('width'), h = num('height');
  if (w > 0 && h > 0) return { w, h };
  const vb = /\sviewBox="([^"]+)"/.exec(tag)?.[1].trim().split(/[\s,]+/).map(Number);
  return vb && vb.length === 4 ? { w: vb[2], h: vb[3] } : null;
}
