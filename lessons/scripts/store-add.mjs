// node scripts/store-add.mjs — 베끼기 검사에 쓰는 비공개 자료 폴더에 쪽을 더한다 (docs/CONTRACT.md 13절).
//
//   node scripts/store-add.mjs <PDF 파일 | 쪽 글 폴더> --semester 5-2 --kind textbook --first-page 8 [--store <자료 폴더>] [--replace]
//
// 자료 폴더의 꼴은 <학기>/<종류>/<쪽 세 자리>.txt 이다 (checks/originality.mjs 가 이 꼴만 읽는다).
// PDF 는 pdftotext(poppler)로 쪽마다 글을 꺼낸다. 글 폴더는 이름 차례(1.txt, 2.txt, … 10.txt)로 한 파일을 한 쪽으로 본다.
// --first-page 는 PDF 의 첫 쪽(또는 폴더의 첫 파일)이 책의 몇 쪽인지다. 그 뒤로 한 쪽씩 늘려 적는다.
//
// 지키는 것
// - 자료 폴더가 저장소 안에 있으면 아무것도 쓰지 않고 멈춘다 (커밋하는 순간 공개된다. openStore 와 같은 규칙).
// - 쪽의 글을 터미널에 찍지 않는다. 쪽 번호와 파일 이름, 글자 수만 찍는다 (CI 기록이나 화면 공유에 남지 않게).
// - 이미 있는 쪽 파일을 말없이 덮어쓰지 않는다. 같은 글이면 건너뛰고, 다르면 --replace 를 붙여야 바꾼다.
// - 글이 없는 쪽(그림만 있는 쪽, 스캔한 쪽)은 쓰지 않고 쪽 번호만 알린다. 베끼기 검사는 그 쪽을 '자료에 없는 쪽'으로 알린다.
//
// 자료는 날쌤이 가진 것만 넣는다. 이 도구는 자료를 내려받거나 보내지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { KIND_LABEL, STORE_KINDS, storeInRepo } from '../checks/originality.mjs';
import { UsageError, parseArgs } from '../checks/lib.mjs';

const USAGE = `쓰는 법: node scripts/store-add.mjs <PDF 파일 또는 쪽 글 폴더> --semester <학기> --kind <종류> --first-page <쪽> [--store <자료 폴더>] [--replace]
  <PDF 파일>     pdftotext 로 쪽마다 글을 꺼냅니다
  <쪽 글 폴더>   .txt 파일 하나가 한 쪽입니다. 이름 차례(1.txt, 2.txt, … 10.txt)대로 쪽을 셉니다
  --semester     학기. 예: 5-2
  --kind         종류: textbook(교과서) · guide(지도서) · sheet(활동지) · ppt(PPT)
  --first-page   첫 쪽이 책의 몇 쪽인지. 예: 8
  --store        자료 폴더 (저장소 밖). 적지 않으면 TEXTBOOK_STORE 를 씁니다
  --replace      이미 있는 쪽 파일의 글이 다르면 바꿔 씁니다 (적지 않으면 바꾸지 않고 멈춥니다)
예: node scripts/store-add.mjs ~/내려받기/사회5-2.pdf --semester 5-2 --kind textbook --first-page 8`;

/** 쪽 하나의 글이 비었는가 (빈칸·줄바꿈·쪽 나눔뿐) */
const blank = (text) => !/\S/.test(text);

/** PDF 에서 쪽마다 글을 꺼낸다. pdftotext 는 쪽 끝마다 \f 를 넣는다. 돌려주는 값: 쪽 글 목록 */
export function pdfPages(file, { bin = process.env.PDFTOTEXT || 'pdftotext' } = {}) {
  const r = spawnSync(bin, ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT') {
    throw new UsageError('pdftotext 가 없습니다. poppler 를 깝니다 (우분투: sudo apt install poppler-utils · macOS: brew install poppler · 윈도: poppler 를 내려받아 PATH 에 더함). 깔 수 없으면 쪽마다 글을 .txt 로 꺼낸 폴더를 줍니다');
  }
  if (r.error) throw r.error;
  // 오류 글에는 쪽의 글이 들지 않는다 (pdftotext 의 오류는 파일과 쪽 번호만 말한다)
  if (r.status !== 0) throw new UsageError(`pdftotext 가 이 PDF 를 읽지 못했습니다 (${path.basename(file)}): ${(r.stderr || '').trim().split('\n')[0] || `종료 코드 ${r.status}`}`);
  const pages = r.stdout.split('\f');
  // 마지막 \f 뒤의 빈 조각은 쪽이 아니다
  if (pages.length > 1 && blank(pages.at(-1))) pages.pop();
  return pages;
}

/** 폴더의 .txt 파일을 이름 차례로 (2.txt 가 10.txt 보다 앞) 읽는다. 돌려주는 값: { pages, skipped: .txt 가 아닌 파일 수 } */
export function folderPages(dir) {
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  const txt = names.filter((n) => n.toLowerCase().endsWith('.txt')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { pages: txt.map((n) => fs.readFileSync(path.join(dir, n), 'utf8')), skipped: names.length - txt.length };
}

/**
 * 쪽 글을 자료 폴더에 쓴다. 쓰기 전에 모든 쪽을 따져 보고, 하나라도 막히면 아무것도 쓰지 않는다.
 * 돌려주는 값: { written: 쓴 파일, same: 같은 글이라 건너뛴 파일, empty: 글이 없어 쓰지 않은 책 쪽 번호 }
 */
export function addPages(store, { semester, kind, firstPage, pages, replace = false }) {
  const plan = [];
  const empty = [];
  const conflicts = [];
  pages.forEach((text, i) => {
    const page = firstPage + i;
    if (blank(text)) { empty.push(page); return; }
    const name = `${semester}/${kind}/${String(page).padStart(3, '0')}.txt`;
    const file = path.join(store, ...name.split('/'));
    const body = text.replace(/\r\n?/g, '\n').trimEnd() + '\n';
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file, 'utf8') === body) { plan.push({ name, file, body, same: true }); return; }
      if (!replace) conflicts.push(name);
    }
    plan.push({ name, file, body, same: false });
  });
  if (conflicts.length) throw new UsageError(`이미 있는 쪽 파일의 글이 다릅니다: ${conflicts.join(', ')}. 쪽 번호(--first-page)를 확인하고, 바꿔 쓰려면 --replace 를 붙입니다`);
  for (const p of plan) {
    if (p.same) continue;
    fs.mkdirSync(path.dirname(p.file), { recursive: true });
    fs.writeFileSync(p.file, p.body);
  }
  return { written: plan.filter((p) => !p.same).map((p) => p.name), same: plan.filter((p) => p.same).map((p) => p.name), empty };
}

/** 인자를 읽고 따진다. 틀리면 UsageError */
function readArgs(argv) {
  const args = parseArgs(argv, { flags: ['--semester', '--kind', '--first-page', '--store'], bools: ['--replace'] });
  if (args._.length !== 1) throw new UsageError(args._.length ? `넣을 자료는 하나씩 줍니다: ${args._.join(' ')}` : '넣을 PDF 파일이나 쪽 글 폴더를 적습니다');
  const input = path.resolve(args._[0]);
  if (!fs.existsSync(input)) throw new UsageError(`자료가 없습니다: ${input}`);
  const isDir = fs.statSync(input).isDirectory();
  if (!isDir && !input.toLowerCase().endsWith('.pdf')) throw new UsageError('PDF 파일이나, 쪽마다 .txt 파일이 든 폴더를 줍니다');
  const semester = args.flags['--semester'];
  if (!semester || !/^[3-6]-[12]$/.test(semester)) throw new UsageError('--semester 에 학기를 3-1 ~ 6-2 꼴로 적습니다. 예: --semester 5-2');
  const kind = args.flags['--kind'];
  if (!STORE_KINDS.includes(kind)) throw new UsageError(`--kind 는 ${STORE_KINDS.map((k) => `${k}(${KIND_LABEL[k]})`).join(' · ')} 가운데 하나입니다`);
  const fp = args.flags['--first-page'];
  const firstPage = Number(fp);
  if (!fp || !Number.isInteger(firstPage) || firstPage < 1 || firstPage > 999) throw new UsageError('--first-page 에 첫 쪽이 책의 몇 쪽인지 1~999 로 적습니다. 예: --first-page 8');
  const dir = args.flags['--store'] ?? process.env.TEXTBOOK_STORE;
  if (!dir) throw new UsageError('자료 폴더를 --store 나 TEXTBOOK_STORE 로 가리킵니다 (저장소 밖). 예: --store ~/교과서자료');
  const store = path.resolve(dir);
  if (fs.existsSync(store) && !fs.statSync(store).isDirectory()) throw new UsageError(`자료 폴더 자리에 파일이 있습니다: ${store}`);
  if (storeInRepo(store)) throw new UsageError(`자료 폴더가 저장소 안에 있습니다 (${store}). 커밋하면 공개되므로 저장소 밖의 폴더를 가리킵니다`);
  return { input, isDir, semester, kind, firstPage, store, replace: args.bools.has('--replace') };
}

function main() {
  let a;
  try { a = readArgs(process.argv.slice(2)); } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\n${USAGE}`); return 2; }
    throw e;
  }
  let pages, skipped = 0;
  try {
    if (a.isDir) ({ pages, skipped } = folderPages(a.input));
    else pages = pdfPages(a.input);
    if (!pages.length) throw new UsageError(a.isDir ? '폴더에 .txt 파일이 없습니다' : 'PDF 에 쪽이 없습니다');
    const last = a.firstPage + pages.length - 1;
    if (last > 999) throw new UsageError(`마지막 쪽이 ${last}쪽이 됩니다. 쪽 번호는 999 까지입니다. --first-page 를 확인합니다`);
    if (pages.every(blank)) throw new UsageError('꺼낸 글이 하나도 없습니다. 스캔한 PDF 이면 글자 인식(OCR)을 거친 PDF 를 쓰거나, 쪽마다 글을 .txt 로 꺼낸 폴더를 줍니다');
    const r = addPages(a.store, { semester: a.semester, kind: a.kind, firstPage: a.firstPage, pages, replace: a.replace });
    const label = KIND_LABEL[a.kind];
    const lines = [`${a.semester} ${label} ${a.firstPage}~${last}쪽 (${pages.length}쪽) → ${a.store}`];
    if (r.written.length) lines.push(`  썼습니다 ${r.written.length}쪽: ${r.written[0]}${r.written.length > 1 ? ` … ${r.written.at(-1)}` : ''}`);
    if (r.same.length) lines.push(`  같은 글이라 건너뛴 쪽 ${r.same.length}쪽`);
    if (r.empty.length) lines.push(`  알림  글이 없어 쓰지 않은 쪽: ${r.empty.join('·')}쪽 (그림만 있는 쪽이면 그대로 둡니다. 글이 있는 쪽이면 스캔한 쪽인지 봅니다)`);
    if (skipped) lines.push(`  알림  .txt 가 아니라 뺀 파일 ${skipped}개`);
    lines.push(`검사: TEXTBOOK_STORE=${a.store} npm run check:originality -- <묶음 id>`);
    console.log(lines.join('\n'));
    return 0;
  } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); return 2; }
    throw e;
  }
}

if (import.meta.main) process.exitCode = main();
