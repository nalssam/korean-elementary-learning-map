// npm run check:originality — 우리 글을 비공개 교과서 자료와 견주는 베끼기 검사 (docs/CONTRACT.md 13절).
//
//   npm run check:originality -- <id> [<id> …] [--record]   차시 명세(lesson.yaml 전체, 주석 포함)와 그 묶음의 SVG 그림, 전개도 모듈
//   npm run check:originality -- --registry [--record]       차시표(registry.yaml 전체: 학기 소개, focus, 주석)
//
// 비공개 자료는 저장소 밖 폴더에 두고 TEXTBOOK_STORE 로 가리킨다: <학기>/<종류>/<쪽 세 자리>.txt (종류: textbook, guide, sheet, ppt).
// 띄어쓰기와 문장부호를 뺀 뒤 한글이 12자 이상 이어서 같으면 실패, 8~11자는 알림이다. 단원명과 checks/originality-allow.txt 의 말은 뺀다.
// 파일의 글자 그대로와 함께, 읽히는 글로 푼 것도 견준다: YAML 은 읽은 값(\uAC00 같은 이스케이프, 접힌 줄), SVG 는 태그를 걷어 낸 글
// (<tspan> 으로 나눈 글, &#xAC00; 같은 문자 참조), 전개도 모듈은 문자열의 \uAC00 이스케이프. 꼴만 바꿔 감춘 글이 빠져나가지 않게 한다.
// 묶음을 검사하려면 자료에 그 묶음의 교과서 쪽(차시표의 pages)과 지도서 쪽이 하나 이상 있어야 한다. 없으면 견줄 것이 모자라 기록하지 않는다.
//
// 이 도구는 겹친 글을 찍지 않는다. "교과서 8쪽과 한글 14자"처럼 쪽수와 길이, 그리고 우리 파일의 줄 번호만 찍는다.
// 검사 결과도 공개 저장소·CI 기록·PR 에 남기 때문이다 (교과서 문장을 옮겨 적지 않는다).
//
// --record 는 통과했을 때만 기록을 적는다. by 는 "copy-guard@<자료 묶음 지문 8자>" 이다. 손으로 적거나 npm run sign 으로 적은 pass 는 치지 않는다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isScalar, parseDocument, visit } from 'yaml';
import * as c from '#lib/content.ts';
import { Registry } from '#schema/registry.ts';
import { UsageError, appendRecord, gitRoot, parseArgs, rel, setRecord, today } from './lib.mjs';
import { parseAllow } from './rules.mjs';

const USAGE = `쓰는 법:
  npm run check:originality -- <묶음 id> [<묶음 id> …] [--record]   예: npm run check:originality -- 5-2/1/01
  npm run check:originality -- --registry [--record]
비공개 자료 폴더를 TEXTBOOK_STORE 로 가리킵니다 (저장소 밖. <학기>/<종류>/<쪽 세 자리>.txt).`;

/** 실패와 알림의 경계 (13절) */
export const FAIL_AT = 12;
export const WARN_AT = 8;
const SEED = WARN_AT; // 같은 글을 찾는 씨앗의 길이. 알림이 되는 가장 짧은 길이와 같다.

export const KIND_LABEL = { textbook: '교과서', guide: '지도서', sheet: '활동지', ppt: 'PPT' };
/** 자료 파일의 이름 꼴: <학기>/<종류>/<쪽 세 자리>.txt (scripts/store-add.mjs 도 이 꼴로 쓴다) */
export const STORE_KINDS = Object.keys(KIND_LABEL);
const STORE_FILE = /^([3-6]-[12])\/(textbook|guide|sheet|ppt)\/(\d{3})\.txt$/;
const HANGUL = /[가-힣]/;
const WORDLIKE = /[\p{L}\p{N}]/u;

// ───────────── 글을 견줄 꼴로 ─────────────

/** 띄어쓰기와 문장부호·기호를 뺀 글자들과, 그 글자가 원래 글의 몇째 글자였는지 */
export function normalize(text, offsets) {
  const chars = [];
  const at = [];
  let i = 0;
  for (const ch of text.normalize('NFC')) {
    if (WORDLIKE.test(ch)) { chars.push(ch.toLowerCase()); at.push(offsets ? offsets[i] : i); }
    i += ch.length;
  }
  return { chars, at };
}

// ───────────── 읽히는 글로 풀기 ─────────────
// 돌려주는 값은 { text, offsets }: 푼 글과, 그 글의 글자(UTF-16 칸)마다 원래 파일의 몇째 칸에서 왔는지.
// 미리 NFC 로 맞춰 둔다 (normalize() 가 다시 NFC 로 바꿀 때 칸 수가 달라지지 않게).

function builder() {
  let text = '';
  const offsets = [];
  return {
    push(str, from) { const s = str.normalize('NFC'); for (let k = 0; k < s.length; k++) offsets.push(from); text += s; },
    done: () => ({ text, offsets }),
  };
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** &#xAC00; &#44032; &amp; 를 글자로 */
function entity(body) {
  if (body[0] === '#') {
    const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : undefined;
  }
  return NAMED[body];
}

/** SVG·XML: 태그와 주석을 걷어 내고(<tspan> 으로 나눈 글은 이어 붙는다) 문자 참조를 글자로 푼다 */
export function svgText(text) {
  const b = builder();
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[^>]*>|&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    for (let k = last; k < m.index; k++) b.push(text[k], k);
    if (m[1] !== undefined) for (let k = 0; k < m[1].length; k++) b.push(m[1][k], m.index + 9 + k);
    else if (m[2] !== undefined) { const ch = entity(m[2]); if (ch !== undefined) b.push(ch, m.index); }
    last = m.index + m[0].length;
  }
  for (let k = last; k < text.length; k++) b.push(text[k], k);
  return b.done();
}

/** 코드(전개도 모듈): 문자열 안의 \uAC00, \u{AC00}, \xAC 같은 이스케이프를 글자로 푼다 */
export function codeText(text) {
  const b = builder();
  let last = 0;
  for (const m of text.matchAll(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi)) {
    for (let k = last; k < m.index; k++) b.push(text[k], k);
    const n = parseInt(m[1] ?? m[2] ?? m[3], 16);
    if (n <= 0x10ffff) b.push(String.fromCodePoint(n), m.index);
    last = m.index + m[0].length;
  }
  for (let k = last; k < text.length; k++) b.push(text[k], k);
  return b.done();
}

/**
 * YAML: 읽은 값(글)을 파일의 차례대로 이어 붙인다. "\uAC00" 이스케이프와 여러 줄 글(| >)이 풀린 값이다.
 * 값의 글자마다 원래 자리는 그 값이 시작한 칸에, 값 안에서 지난 줄 수만큼을 더한 줄로 어림한다 (줄 번호를 찍는 데만 쓴다).
 */
export function yamlText(text) {
  const b = builder();
  let doc;
  try { doc = parseDocument(text); } catch { return b.done(); }
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (offset) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
  visit(doc, {
    Scalar(key, node) {
      // 칸 이름(key)은 빼고 값만 잇는다. 칸 이름은 영문이라 글자 그대로의 검사에서 이미 보았다.
      if (key === 'key' || !isScalar(node) || typeof node.value !== 'string' || !node.range) return;
      const start = node.range[0];
      const first = lineOf(start);
      let line = first;
      for (const ch of node.value) {
        b.push(ch, line === first ? start : lineStarts[line]);
        if (ch === '\n') line = Math.min(line + 1, lineStarts.length - 1);
      }
      b.push('\n', node.range[1]);
    },
  });
  return b.done();
}

/** 파일 하나를 견줄 꼴들: 글자 그대로, 그리고 확장자에 맞게 푼 글 */
function views(text, file = '') {
  const out = [{ text, offsets: undefined }];
  if (/\.ya?ml$/i.test(file)) out.push(yamlText(text));
  else if (/\.svg$/i.test(file)) out.push(svgText(text));
  else if (/\.(?:[cm]?[jt]s)$/i.test(file)) out.push(codeText(text));
  return out;
}

/**
 * 우리 글(ours)과 자료 하나(theirs)에서 이어서 같은 곳을 모두 찾는다. 한글 WARN_AT 자 이상인 것만 돌려준다.
 * blocked 는 우리 글에서 빼는 자리(단원명·고유 명사)다. 같은 곳이 그 자리를 넘어 이어지지 않는다.
 * 돌려주는 값: { start, end (우리 글의 normalize 자리), hangul (한글 글자 수) }
 */
export function sharedRuns(ours, theirs, blocked = new Set()) {
  const index = new Map();
  for (let p = 0; p + SEED <= theirs.length; p++) {
    const key = theirs.slice(p, p + SEED).join('');
    const list = index.get(key);
    if (list) list.push(p); else index.set(key, [p]);
  }
  const out = [];
  for (let i = 0; i + SEED <= ours.length; i++) {
    let free = true;
    for (let k = i; k < i + SEED; k++) if (blocked.has(k)) { free = false; break; }
    if (!free) continue;
    const hits = index.get(ours.slice(i, i + SEED).join(''));
    if (!hits) continue;
    for (const p of hits) {
      // 바로 앞 글자도 같으면 더 앞에서 시작하는 같은 곳의 일부다
      if (i > 0 && p > 0 && !blocked.has(i - 1) && ours[i - 1] === theirs[p - 1]) continue;
      let n = SEED;
      while (i + n < ours.length && p + n < theirs.length && !blocked.has(i + n) && ours[i + n] === theirs[p + n]) n++;
      const hangul = ours.slice(i, i + n).filter((ch) => HANGUL.test(ch)).length;
      if (hangul >= WARN_AT) out.push({ start: i, end: i + n, hangul });
    }
  }
  // 같은 자리를 덮는 것은 가장 긴 것 하나만 남긴다
  out.sort((a, b) => a.start - b.start || b.hangul - a.hangul);
  return out.filter((r, k) => !out.slice(0, k).some((q) => q.start <= r.start && r.end <= q.end));
}

/** 빼는 말(단원명·고유 명사)이 우리 글에서 놓인 자리 */
export function blockedAt(chars, allow) {
  const blocked = new Set();
  const joined = chars.join('');
  for (const word of allow) {
    const w = normalize(word).chars.join('');
    if (w.length < 2) continue;
    // chars 의 한 칸이 한 글자라서 글 안의 자리가 곧 칸의 자리다 (대리 쌍 글자는 한글 자료에 나오지 않는다)
    for (let i = joined.indexOf(w); i >= 0; i = joined.indexOf(w, i + 1)) for (let k = 0; k < w.length; k++) blocked.add(i + k);
  }
  return blocked;
}

// ───────────── 비공개 자료 ─────────────

/**
 * 그 폴더가 저장소(lessons/ 또는 git 뿌리) 안에 있는가. 아직 없는 폴더는 가장 가까운 있는 윗폴더의 실제 자리로 본다
 * (scripts/store-add.mjs 가 새 자료 폴더를 만들기 전에 묻는다. 바로 가기를 거쳐 저장소 안으로 들어가는 길도 잡는다).
 * 예외는 시험이 쓰는 .cache/tests/ 하나다. git 이 무시하는 폴더라 올라가지 않고, 시험은 제 폴더 밖에 쓰지 않는다 (16절).
 */
export function storeInRepo(dir) {
  let at = path.resolve(dir);
  const rest = [];
  while (!fs.existsSync(at)) { rest.unshift(path.basename(at)); at = path.dirname(at); }
  const real = path.join(fs.realpathSync(at), ...rest);
  const sandbox = path.join(fs.realpathSync(c.ROOT), '.cache', 'tests') + path.sep;
  if (real.startsWith(sandbox)) return false;
  return [c.ROOT, gitRoot()].filter(Boolean).some((repo) => {
    const r = fs.realpathSync(repo);
    return real === r || real.startsWith(r + path.sep);
  });
}

/** 비공개 자료 폴더를 읽는다. 저장소 안에 있으면 멈춘다 (커밋하는 순간 공개된다). */
export function openStore(dir = process.env.TEXTBOOK_STORE) {
  if (!dir) throw new UsageError('TEXTBOOK_STORE 가 없습니다. 비공개 자료 폴더(저장소 밖)를 가리킵니다. 예: TEXTBOOK_STORE=~/교과서자료 npm run check:originality -- 5-2/1/01');
  const store = path.resolve(dir);
  if (!fs.existsSync(store) || !fs.statSync(store).isDirectory()) throw new UsageError(`TEXTBOOK_STORE 폴더가 없습니다: ${store}`);
  const real = fs.realpathSync(store);
  if (storeInRepo(real)) throw new UsageError(`TEXTBOOK_STORE 가 저장소 안에 있습니다 (${store}). 커밋하면 공개되므로 저장소 밖으로 옮깁니다`);
  const pages = [];
  let skipped = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const name = path.relative(real, full).split(path.sep).join('/');
      const m = STORE_FILE.exec(name);
      if (!m) { skipped++; continue; }
      const text = fs.readFileSync(full, 'utf8');
      pages.push({ name, semester: m[1], kind: m[2], page: Number(m[3]), text, norm: normalize(text).chars });
    }
  };
  walk(real);
  // 자료 묶음의 지문: 파일 이름과 내용. 자료를 더하거나 고치면 기록의 by 가 달라져서 어느 자료로 검사했는지 남는다.
  const h = createHash('sha256');
  for (const p of pages) h.update(`${p.name}\n${createHash('sha256').update(p.text).digest('hex')}\n`);
  return { dir: real, pages, skipped, guard: `copy-guard@${h.digest('hex').slice(0, 8)}` };
}

// ───────────── 견주기 ─────────────

/** 파일 하나를 자료와 견준다. 돌려주는 값: { line, lineEnd, page, hangul, level } (글은 담지 않는다) */
export function compareFile(text, pages, allow, file) {
  const lineOf = (offset) => text.slice(0, offset).split('\n').length;
  const found = new Map();
  for (const v of views(text, file)) {
    const { chars, at } = normalize(v.text, v.offsets);
    const blocked = blockedAt(chars, allow);
    for (const p of pages) {
      for (const r of sharedRuns(chars, p.norm, blocked)) {
        const hit = {
          line: lineOf(at[r.start]), lineEnd: lineOf(at[r.end - 1]),
          page: `${KIND_LABEL[p.kind]} ${p.page}쪽`, hangul: r.hangul,
          level: r.hangul >= FAIL_AT ? 'fail' : 'warn',
        };
        // 글자 그대로와 푼 글이 같은 곳을 찾으면 한 번만, 더 길게 찾은 쪽으로 적는다
        const key = `${hit.page}\u0000${hit.line}`;
        const had = found.get(key);
        if (!had || had.hangul < hit.hangul) found.set(key, hit);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line || b.hangul - a.hangul);
}

/**
 * 묶음 하나를 견주기에 자료가 모자라지 않은가: 차시표에 적힌 그 묶음의 교과서 쪽이 하나 이상, 그 학기의 지도서 쪽이 하나 이상.
 * (학기의 아무 쪽이나 있으면 통과하던 것을 막는다. 다른 단원의 쪽만 있는 자료로는 이 묶음이 베꼈는지 알 수 없다.)
 * 돌려주는 값: { problems: 기록하지 못하는 까닭, missing: 범위 안에서 자료에 없는 교과서 쪽 }
 */
export function storeCoverage(pages, semester, range) {
  const mine = pages.filter((p) => p.semester === semester);
  const [from, to] = range;
  const textbook = new Set(mine.filter((p) => p.kind === 'textbook').map((p) => p.page));
  const problems = [];
  const missing = [];
  for (let n = from; n <= to; n++) if (!textbook.has(n)) missing.push(n);
  if (missing.length === to - from + 1) problems.push(`비공개 자료에 교과서 ${from === to ? from : `${from}~${to}`}쪽이 없습니다. 견줄 것이 모자라 기록하지 않습니다`);
  if (!mine.some((p) => p.kind === 'guide')) problems.push('비공개 자료에 이 학기의 지도서 쪽이 없습니다. 견줄 것이 모자라 기록하지 않습니다');
  return { problems, missing: problems.length ? [] : missing };
}

/** 단원명 (교과서에서 가져오는 것이라 겹쳐도 된다) 과 고유 명사 목록 */
function allowList() {
  let words = [];
  try { words = parseAllow(fs.readFileSync(path.join(c.ROOT, 'checks', 'originality-allow.txt'), 'utf8')); } catch { /* 목록이 없으면 단원명만 뺀다 */ }
  const units = c.loadRegistry().semesters.flatMap((s) => s.units.map((u) => u.title));
  return [...units, ...words];
}

/** 차시 하나의 검사 대상 파일: lesson.yaml, 그 묶음의 SVG 그림 전부, 전개도 모듈 (지문에 드는 글 파일과 같은 범위) */
function lessonFiles(id) {
  const files = [c.lessonFile(id)];
  const media = path.join(c.lessonDir(id), 'media');
  if (fs.existsSync(media)) for (const f of fs.readdirSync(media).sort()) if (f.toLowerCase().endsWith('.svg')) files.push(path.join(media, f));
  try {
    const lesson = c.parseLessonText(fs.readFileSync(c.lessonFile(id), 'utf8'), c.lessonFile(id));
    const mod = c.papercraftModuleFile(lesson);
    if (mod && fs.existsSync(mod)) files.push(mod);
  } catch { /* 형식 오류가 있으면 모듈 이름을 알 수 없다. lesson.yaml 과 그림은 그대로 본다 */ }
  return files;
}

// ───────────── 돌리기 ─────────────

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { bools: ['--record', '--registry'] });
    if (!args.bools.has('--registry') && args._.length === 0) throw new UsageError('검사할 묶음 id 를 적습니다');
    if (args.bools.has('--registry') && args._.length) throw new UsageError('--registry 는 묶음 id 와 함께 쓰지 않습니다. 따로 돌립니다');
    for (const id of args._) if (!c.hasLesson(id)) throw new UsageError(`${id} 묶음의 명세가 없습니다 (${rel(c.lessonFile(id))})`);
  } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\n${USAGE}`); return 2; }
    throw e;
  }
  let store;
  try { store = openStore(); } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); return 2; }
    throw e;
  }
  const record = args.bools.has('--record');
  const allow = allowList();
  const lines = [`베끼기 검사 · 비공개 자료 ${store.pages.length}쪽 (${store.guard})${store.skipped ? ` · 이름이 형식에 맞지 않아 뺀 파일 ${store.skipped}개` : ''}`];
  let failed = false;

  const targets = args.bools.has('--registry')
    ? [{ key: 'registry', files: [path.join(c.contentDir(), 'registry.yaml')], pages: store.pages }]
    : args._.map((id) => ({ key: id, files: lessonFiles(id), pages: store.pages.filter((p) => p.semester === id.split('/')[0]) }));

  for (const t of targets) {
    lines.push('', t.key === 'registry' ? `차시표 (${rel(t.files[0])})` : t.key);
    if (t.key === 'registry') {
      if (!t.pages.some((p) => p.kind === 'textbook')) {
        lines.push('  비공개 자료에 교과서 쪽이 하나도 없습니다. 견줄 것이 모자라 기록하지 않습니다');
        failed = true;
        continue;
      }
    } else {
      const b = c.findBundle(t.key);
      const { problems, missing } = storeCoverage(store.pages, b.semester.id, b.pages);
      if (problems.length) {
        for (const p of problems) lines.push(`  ${p}`);
        failed = true;
        continue;
      }
      if (missing.length) lines.push(`  알림     교과서 ${missing.join('·')}쪽은 자료에 없어 견주지 않았습니다. 그림만 있는 쪽이면 그대로 둡니다`);
    }
    const found = t.files.flatMap((f) => compareFile(fs.readFileSync(f, 'utf8'), t.pages, allow, f).map((r) => ({ ...r, file: f })));
    const fails = found.filter((r) => r.level === 'fail');
    for (const r of found) {
      const where = `${t.key === 'registry' ? rel(r.file) : path.relative(c.lessonDir(t.key), r.file).split(path.sep).join('/')} ${r.line === r.lineEnd ? r.line : `${r.line}~${r.lineEnd}`}번째 줄`;
      const head = r.level === 'fail' ? '고칠 것' : '알림   ';
      lines.push(`  ${head}  ${where}: ${r.page}과 한글 ${r.hangul}자가 이어서 같습니다`);
    }
    if (fails.length) {
      failed = true;
      lines.push(`  통과하지 못했습니다. 그 줄의 글을 자료를 보지 않고 우리 말로 새로 씁니다 (한글 ${FAIL_AT}자 이상 같으면 실패, ${WARN_AT}~${FAIL_AT - 1}자는 알림)`);
      continue;
    }
    lines.push(found.length ? '  통과 (알림은 그 줄을 다시 읽어 보고 자료의 말투를 닮았으면 고칩니다)' : '  통과');
    if (!record) continue;
    // 통과했을 때만 적는다. 기록을 적는 일은 지문을 바꾸지 않는다 (reviews 와 차시표의 originality 는 지문에 들지 않는다).
    const date = today();
    if (t.key === 'registry') {
      const file = t.files[0];
      setRecord(file, ['originality'], { by: store.guard, date, seal: c.registrySeal() }, (next) => c.parseSpecText(Registry, next, file));
      lines.push(`  기록했습니다: 차시표의 originality (${store.guard}, ${date})`);
    } else {
      const id = t.key;
      const file = c.lessonFile(id);
      const last = c.parseLessonText(fs.readFileSync(file, 'utf8'), file).reviews.at(-1);
      if (last && last.date > date) {
        lines.push(`  기록하지 못했습니다: 마지막 검수 기록의 날짜(${last.date})가 오늘(${date})보다 늦습니다. 그 기록의 날짜를 확인합니다`);
        failed = true;
        continue;
      }
      appendRecord(file, ['reviews'], { kind: 'originality', by: store.guard, date, result: 'pass', seal: c.sealsOf(id).lesson }, (next) => c.parseLessonText(next, file), { after: 'status' });
      lines.push(`  기록했습니다: reviews 에 originality pass (${store.guard}, ${date})`);
    }
  }
  console.log(lines.join('\n'));
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
