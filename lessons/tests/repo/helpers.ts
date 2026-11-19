// 저장소 담당 시험이 같이 쓰는 도우미. (*.test.ts 가 아니라서 시험으로 돌지 않는다.)
// 검사·기록 도구는 교사가 터미널에서 돌리는 것이라, 시험도 스크립트를 따로 띄워 찍힌 글과 종료 코드를 본다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from '#lib/content.ts';

export interface Run { code: number; out: string; err: string; all: string }

/** 저장소의 스크립트를 node 로 돌린다. env 에 준 것만 덧붙고, 시험을 돌린 쪽의 CONTENT_DIR·SHOW_DRAFTS 따위는 지운다. */
export function runNode(script: string, args: string[] = [], env: Record<string, string | undefined> = {}, opts: { cwd?: string; input?: string } = {}): Run {
  const clean: Record<string, string | undefined> = { ...process.env };
  for (const k of ['CONTENT_DIR', 'SHOW_DRAFTS', 'SITE_URL', 'SITE_BASE', 'DIST_DIR', 'TEXTBOOK_STORE', 'NODE_TEST_CONTEXT']) delete clean[k];
  const r = spawnSync(process.execPath, [path.isAbsolute(script) ? script : path.join(ROOT, script), ...args], {
    cwd: opts.cwd ?? ROOT, env: { ...clean, ...env }, input: opts.input ?? '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const out = r.stdout ?? '', err = r.stderr ?? '';
  return { code: r.status ?? 1, out, err, all: out + err };
}

/** 이 시험만 쓰는 폴더 (.cache/tests/repo-<이름>-<pid>/). 시작할 때 비운다. */
export function scratch(name: string): string {
  const dir = path.join(ROOT, '.cache', 'tests', `repo-${name}-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 아주 작은 zip 쓰기 (PPTX 를 손으로 만들어 검사 도구를 시험할 때). 압축하지 않고(stored) 담는다. */
export function writeZip(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 10);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/** 가로세로 크기만 맞는 PNG 머리 (그림 크기를 읽는 시험용. 그림으로 열리지는 않는다) */
export function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

/** 그림 하나가 든 PPTX 한 장 (python-pptx 가 쓰는 꼴을 줄인 것) */
export function pptxWith(pictures: { cx: number; cy: number; image: Buffer; crop?: string }[], text = '표지', slides = 1, credits = 0): Buffer {
  const pics = pictures.map((p, i) => `<p:pic><p:nvPicPr><p:cNvPr id="${i + 2}" name="그림 ${i + 1}"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${i + 2}"/>${p.crop ?? ''}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${p.cx}" cy="${p.cy}"/></a:xfrm></p:spPr></p:pic>`).join('');
  const rels = pictures.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.png"/>`).join('');
  const files: Record<string, string | Buffer> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'ppt/slides/slide1.xml': `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>${pics}</p:spTree></p:cSld></p:sld>`,
    'ppt/slides/_rels/slide1.xml.rels': `<?xml version="1.0"?><Relationships>${rels}</Relationships>`,
  };
  pictures.forEach((p, i) => { files[`ppt/media/image${i + 1}.png`] = p.image; });
  for (let n = 2; n <= slides; n++) files[`ppt/slides/slide${n}.xml`] = `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${n}번 장</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  // 명세의 장 뒤에 붙는 그림 출처 장 (8절의 마지막 장)
  for (let n = 1; n <= credits; n++) files[`ppt/slides/slide${slides + n}.xml`] = `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>그림 출처</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  return writeZip(files);
}
