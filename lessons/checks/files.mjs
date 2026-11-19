// 만들어진 파일(PDF·PPTX·그림)을 읽는 작은 도우미. checks/outputs.mjs 가 쓴다.
// 의존성을 더하지 않으려고 PPTX(zip)와 그림 크기는 직접 읽는다. PDF 는 pdfjs-dist 로 읽는다 (docs/CONTRACT.md 7절).
import fs from 'node:fs';
import zlib from 'node:zlib';

// ───────────── zip (PPTX) ─────────────

/** zip 파일의 항목들. { name → () => Buffer }. python-pptx 가 만드는 꼴(zip64 없음, stored·deflate)만 읽는다. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip 파일이 아닙니다');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 목록이 깨졌습니다');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`zip 압축 방식 ${method} 은 읽지 못합니다 (${name})`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ───────────── 그림 크기 ─────────────

/** PNG·JPEG·SVG 의 가로세로 크기. 읽지 못하면 undefined */
export function imageSize(buf, name = '') {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) { p++; continue; }
      const marker = buf[p + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { p += marker === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(p + 2);
      // SOF0~SOF15 (DHT·JPG·DAC 를 뺀 것)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5) };
      p += 2 + len;
    }
    return undefined;
  }
  if (/\.svg$/i.test(name) || /^\s*(<\?xml|<svg|<!--)/.test(buf.toString('utf8', 0, 200))) {
    const root = /<svg\b[^>]*>/i.exec(buf.toString('utf8'))?.[0] ?? '';
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(root);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
    const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(root), h = /\sheight\s*=\s*["']([\d.]+)/i.exec(root);
    if (w && h) return { w: Number(w[1]), h: Number(h[1]) };
  }
  return undefined;
}

/** 파일의 가로세로 크기 */
export const fileImageSize = (file) => imageSize(fs.readFileSync(file), file);

// ───────────── PPTX ─────────────

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/**
 * PPTX 를 읽어 검사에 필요한 것만 꺼낸다.
 *  - text: 모든 장과 메모의 글 (조각을 그대로 이은 것)
 *  - xml: 모든 XML 의 글자 (localhost 같은 주소를 찾을 때)
 *  - pictures: 장마다 그림의 표시 크기(cx·cy), 자르기 값, 들어 있는 그림 파일의 크기
 *  - slides: 장 수
 */
export function readPptx(buf) {
  const zip = readZip(buf);
  const text = [];
  const xml = [];
  const pictures = [];
  const slideNames = [...zip.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/\d+/.exec(a.slice(11))[0]) - Number(/\d+/.exec(b.slice(11))[0]));
  for (const [name, get] of zip) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const s = get().toString('utf8');
    xml.push(s);
    if (/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(name)) for (const m of s.matchAll(/<a:t>([^<]*)<\/a:t>/g)) text.push(unxml(m[1]));
  }
  const slideTexts = [];
  slideNames.forEach((name, i) => {
    const s = zip.get(name)().toString('utf8');
    slideTexts.push([...s.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unxml(m[1])).join(''));
    const relsName = name.replace('slides/', 'slides/_rels/') + '.rels';
    const rels = new Map();
    if (zip.has(relsName)) for (const m of zip.get(relsName)().toString('utf8').matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\sId="([^"]+)"/.exec(m[0])?.[1], target = /\sTarget="([^"]+)"/.exec(m[0])?.[1];
      if (id && target) rels.set(id, target);
    }
    for (const m of s.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      const pic = m[1];
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(pic)?.[1];
      const ext = /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/.exec(pic);
      const src = /<a:srcRect\b([^>]*)\/?>/.exec(pic)?.[1] ?? '';
      const crop = Object.fromEntries([...src.matchAll(/\s([ltrb])="(-?\d+)"/g)].map((x) => [x[1], Number(x[2])]));
      const target = embed ? rels.get(embed) : undefined;
      const mediaName = target ? new URL(target, `file:///${name}`).pathname.slice(1) : undefined;
      const data = mediaName && zip.has(mediaName) ? zip.get(mediaName)() : undefined;
      pictures.push({
        slide: i + 1, name: /<p:cNvPr\b[^>]*\sname="([^"]*)"/.exec(pic)?.[1] ?? '', media: mediaName,
        cx: ext ? Number(ext[1]) : undefined, cy: ext ? Number(ext[2]) : undefined, crop,
        size: data ? imageSize(data, mediaName) : undefined, bytes: data,
      });
    }
  });
  return { text: text.join(''), xml: xml.join('\n'), pictures, slides: slideNames.length, slideTexts };
}

// ───────────── PDF ─────────────

/** PDF 의 쪽수, 쪽마다 크기(mm), 글 (7절의 규칙: 조각을 사이에 아무것도 넣지 않고 이은 것) */
export async function readPdf(buf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false });
  try {
    const doc = await task.promise;
    const pages = [];
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [x0, y0, x1, y1] = page.view;
      const mm = (v) => (v / 72) * 25.4;
      // 돌려 놓은 쪽(/Rotate 90)은 가로세로가 바뀌어 보인다
      const turned = page.rotate % 180 !== 0;
      const w = mm(x1 - x0), h = mm(y1 - y0);
      pages.push(turned ? { w: h, h: w } : { w, h });
      text += (await page.getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join('');
    }
    return { pages, text };
  } finally {
    await task.destroy();
  }
}

/** 빈칸과 줄바꿈을 모두 뺀다. PDF 의 글과 찾는 글을 이 꼴로 견준다 (7절). */
export const squash = (s) => s.replace(/[\s\u2060]+/g, ''); // keepParticle() 의 U+2060 도 뺀다 (15절)
