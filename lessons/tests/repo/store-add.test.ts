// 비공개 자료 폴더에 쪽 더하기 (scripts/store-add.mjs, docs/CONTRACT.md 13절).
// 진짜 교과서 PDF 는 쓰지 않는다. 시험 안에서 한글이 든 두 쪽짜리 PDF 를 지어 만든다 (내려받는 것이 없다).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { tempContent } from '../contract/helpers.ts';
import { runNode, scratch } from './helpers.ts';

const DIR = scratch('store-add');
const STORE = path.join(DIR, 'store');
const t = tempContent('repo-store-add');
after(() => { t.cleanup(); fs.rmSync(DIR, { recursive: true, force: true }); });
const ONE = '5-2/1/01'; // 시험용 차시표에서 교과서 6~9쪽

// 지어낸 글. 첫 쪽의 열세 자를 시험용 명세에 넣어 베끼기 검사가 "교과서 8쪽"으로 찾는지 본다.
const PAGE1 = '바람개비가빙글빙글돌아가요 첫째 쪽';
const PAGE2 = '구름 사이로 해가 나왔어요 둘째 쪽';
const OVERLAP = '바람개비가빙글빙글돌아가요';

/**
 * 쪽마다 글 한 줄이 든 PDF. 글꼴을 심지 않고, 글자 번호(CID)를 유니코드 값과 같게 두고 ToUnicode 표로 글자를 밝힌다.
 * pdftotext 는 그림을 그리지 않고 이 표로 글을 꺼내므로 한글이 그대로 나온다.
 */
function makePdf(pages: string[]): Buffer {
  const chars = [...new Set(pages.join(''))].filter((ch) => ch !== ' ');
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  const cmap = [
    '/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def', '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
    '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange',
    `${chars.length} beginbfchar`, ...chars.map((ch) => `<${hex(ch.codePointAt(0)!)}> <${hex(ch.codePointAt(0)!)}>`), 'endbfchar',
    'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end',
  ].join('\n');
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  // 3: 글꼴 (Type0, Identity-H), 그 뒤 쪽마다 [쪽, 내용], 끝에 CID 글꼴·글꼴 설명·ToUnicode
  const base = 4 + pages.length * 2;
  objs[3] = `<< /Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /DescendantFonts [${base} 0 R] /ToUnicode ${base + 2} 0 R >>`;
  pages.forEach((text, i) => {
    const words = text.split(' ').map((w) => `<${[...w].map((ch) => hex(ch.codePointAt(0)!)).join('')}>`);
    // 낱말 사이는 글자를 띄워 옮긴다 (빈칸 글자를 쓰지 않는다)
    const stream = `BT /F1 12 Tf 72 720 Td ${words.map((w, k) => `${k ? '[-600] TJ ' : ''}${w} Tj`).join(' ')} ET`;
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  objs[base] = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Test /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${base + 1} 0 R /DW 1000 >>`;
  objs[base + 1] = '<< /Type /FontDescriptor /FontName /Test /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>';
  objs[base + 2] = `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = Buffer.byteLength(out);
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const noPdftotext = spawnSync('pdftotext', ['-v']).error ? 'pdftotext 가 없습니다 (poppler-utils)' : false;
const add = (args: string[], env: Record<string, string> = {}) => runNode('scripts/store-add.mjs', args, env);
const pdf = path.join(DIR, 'book.pdf');
fs.writeFileSync(pdf, makePdf([PAGE1, PAGE2]));

test('PDF 두 쪽을 <학기>/<종류>/<쪽 세 자리>.txt 두 파일로 쓰고, 쪽의 글은 찍지 않는다', { skip: noPdftotext }, () => {
  fs.rmSync(STORE, { recursive: true, force: true });
  const r = add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', STORE]);
  assert.equal(r.code, 0, r.all);
  const files = fs.readdirSync(path.join(STORE, '5-2', 'textbook')).sort();
  assert.deepEqual(files, ['008.txt', '009.txt']);
  const norm = (s: string) => s.replace(/\s+/g, '');
  assert.ok(norm(fs.readFileSync(path.join(STORE, '5-2', 'textbook', '008.txt'), 'utf8')).includes(norm(PAGE1)));
  assert.ok(norm(fs.readFileSync(path.join(STORE, '5-2', 'textbook', '009.txt'), 'utf8')).includes(norm(PAGE2)));
  assert.match(r.out, /5-2 교과서 8~9쪽 \(2쪽\)/);
  assert.match(r.out, /썼습니다 2쪽: 5-2\/textbook\/008\.txt … 5-2\/textbook\/009\.txt/);
  for (const piece of ['바람개비', '구름', '첫째', '둘째']) assert.ok(!r.all.includes(piece), '쪽의 글이 찍혔습니다');
  // 같은 글을 다시 넣으면 건너뛰고, 다른 글로 덮으려 하면 --replace 없이는 멈춘다
  assert.match(add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', STORE]).out, /같은 글이라 건너뛴 쪽 2쪽/);
  const shifted = add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '9', '--store', STORE]);
  assert.equal(shifted.code, 2);
  assert.match(shifted.err, /이미 있는 쪽 파일의 글이 다릅니다: 5-2\/textbook\/009\.txt\. 쪽 번호\(--first-page\)를 확인하고/);
  assert.equal(fs.existsSync(path.join(STORE, '5-2', 'textbook', '010.txt')), false, '막힌 실행은 아무 쪽도 쓰지 않는다');
});

test('만든 자료 폴더를 베끼기 검사가 그대로 열고, 겹친 곳을 "교과서 8쪽"으로 찾는다', { skip: noPdftotext }, () => {
  fs.rmSync(STORE, { recursive: true, force: true });
  assert.equal(add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', STORE]).code, 0);
  // 지도서는 쪽 글 폴더로 넣는다: 이름 차례(2.txt 가 10.txt 보다 앞), 빈 쪽은 쓰지 않고 알린다, .txt 가 아닌 파일은 뺀다
  const pagesDir = path.join(DIR, 'guide-pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(path.join(pagesDir, '10.txt'), '셋째 파일');
  fs.writeFileSync(path.join(pagesDir, '2.txt'), '  \n');
  fs.writeFileSync(path.join(pagesDir, '1.txt'), '지어낸 지도서 쪽');
  fs.writeFileSync(path.join(pagesDir, '메모.md'), '자료가 아닌 파일');
  const g = add([pagesDir, '--semester', '5-2', '--kind', 'guide', '--first-page', '1'], { TEXTBOOK_STORE: STORE });
  assert.equal(g.code, 0, g.all);
  assert.deepEqual(fs.readdirSync(path.join(STORE, '5-2', 'guide')).sort(), ['001.txt', '003.txt']);
  assert.match(g.out, /글이 없어 쓰지 않은 쪽: 2쪽/);
  assert.match(g.out, /\.txt 가 아니라 뺀 파일 1개/);
  // 베끼기 검사: 자료 4쪽을 읽고, 시험용 명세에 넣은 열세 자를 교과서 8쪽에서 찾는다
  t.reset();
  t.editText(ONE, (s) => s.replace('# 시험용 가짜 명세입니다.', `# 시험용 가짜 명세입니다. ${OVERLAP}`));
  const r = runNode('checks/originality.mjs', [ONE], { CONTENT_DIR: t.dir, TEXTBOOK_STORE: STORE });
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /^베끼기 검사 · 비공개 자료 4쪽 \(copy-guard@[0-9a-f]{8}\)\n/);
  assert.match(r.out, /고칠 것  lesson\.yaml 1번째 줄: 교과서 8쪽과 한글 13자가 이어서 같습니다/);
});

test('자료 폴더가 저장소 안이면 아무것도 쓰지 않고 멈춘다 (lessons/ 와 git 뿌리, 아직 없는 폴더도)', () => {
  for (const inside of [path.join(c.ROOT, 'private-store'), path.join(c.ROOT, '..', 'textbook-store'), path.join(c.ROOT, 'content', 'store')]) {
    const r = add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', inside]);
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, /^자료 폴더가 저장소 안에 있습니다 .*커밋하면 공개되므로 저장소 밖의 폴더를 가리킵니다/);
    assert.equal(fs.existsSync(inside), false, inside);
  }
  // TEXTBOOK_STORE 로 가리켜도 같다
  const r = add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8'], { TEXTBOOK_STORE: path.join(c.ROOT, 'private-store') });
  assert.equal(r.code, 2);
  assert.match(r.err, /저장소 안에 있습니다/);
});

test('pdftotext 가 없으면 그렇다고 말하고, 까는 법과 글 폴더로 넣는 길을 알려 준다', () => {
  const r = add([pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', STORE], { PDFTOTEXT: path.join(DIR, 'no-such-pdftotext') });
  assert.equal(r.code, 2);
  assert.match(r.err, /^pdftotext 가 없습니다\. poppler 를 깝니다 .*쪽마다 글을 \.txt 로 꺼낸 폴더를 줍니다/);
});

test('쓰는 법을 틀리면 무엇이 틀렸는지와 쓰는 법을 찍고 2 로 끝난다', () => {
  const cases: [string[], RegExp][] = [
    [[], /넣을 PDF 파일이나 쪽 글 폴더를 적습니다/],
    [[pdf, '--semester', '7-1', '--kind', 'textbook', '--first-page', '8', '--store', STORE], /--semester 에 학기를 3-1 ~ 6-2 꼴로/],
    [[pdf, '--semester', '5-2', '--kind', 'book', '--first-page', '8', '--store', STORE], /--kind 는 textbook\(교과서\) · guide\(지도서\) · sheet\(활동지\) · ppt\(PPT\)/],
    [[pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '0', '--store', STORE], /--first-page 에 첫 쪽이/],
    [[pdf, '--semester', '5-2', '--kind', 'textbook', '--first-page', '8'], /자료 폴더를 --store 나 TEXTBOOK_STORE 로/],
    [[path.join(DIR, 'note.txt'), '--semester', '5-2', '--kind', 'textbook', '--first-page', '8', '--store', STORE], /자료가 없습니다/],
  ];
  for (const [args, re] of cases) {
    const r = add(args);
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, re);
    assert.match(r.err, /\n\n쓰는 법: node scripts\/store-add\.mjs/);
  }
});
