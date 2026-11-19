// npm run check:originality — 우리 글을 비공개 교과서 자료와 견주는 베끼기 검사 (docs/CONTRACT.md 13절).
//
//   npm run check:originality -- <id> [<id> …] [--record]   차시 명세(lesson.yaml 전체, 주석 포함)와 그 묶음의 SVG 그림, 전개도 모듈
//   npm run check:originality -- --registry [--record]       차시표(registry.yaml 전체: 학기 소개, focus, 주석)
//
// 비공개 자료는 저장소 밖 폴더에 두고 TEXTBOOK_STORE 로 가리킨다: <학기>/<종류>/<쪽 세 자리>.txt (종류: textbook, guide, sheet, ppt).
// 띄어쓰기와 문장부호를 뺀 뒤 한글이 12자 이상 이어서 같으면 실패, 8~11자는 알림이다. 단원명과 checks/originality-allow.txt 의 말은 뺀다.
//
// 이 도구는 겹친 글을 찍지 않는다. "교과서 8쪽과 한글 14자"처럼 쪽수와 길이, 그리고 우리 파일의 줄 번호만 찍는다.
// 검사 결과도 공개 저장소·CI 기록·PR 에 남기 때문이다 (교과서 문장을 옮겨 적지 않는다).
//
// --record 는 통과했을 때만 기록을 적는다. by 는 "copy-guard@<자료 묶음 지문 8자>" 이다. 손으로 적거나 npm run sign 으로 적은 pass 는 치지 않는다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

const KIND_LABEL = { textbook: '교과서', guide: '지도서', sheet: '활동지', ppt: 'PPT' };
const STORE_FILE = /^([3-6]-[12])\/(textbook|guide|sheet|ppt)\/(\d{3})\.txt$/;
const HANGUL = /[가-힣]/;
const WORDLIKE = /[\p{L}\p{N}]/u;

// ───────────── 글을 견줄 꼴로 ─────────────

/** 띄어쓰기와 문장부호·기호를 뺀 글자들과, 그 글자가 원래 글의 몇째 글자였는지 */
export function normalize(text) {
  const chars = [];
  const at = [];
  let i = 0;
  for (const ch of text.normalize('NFC')) {
    if (WORDLIKE.test(ch)) { chars.push(ch.toLowerCase()); at.push(i); }
    i += ch.length;
  }
  return { chars, at };
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

/** 비공개 자료 폴더를 읽는다. 저장소 안에 있으면 멈춘다 (커밋하는 순간 공개된다). */
export function openStore(dir = process.env.TEXTBOOK_STORE) {
  if (!dir) throw new UsageError('TEXTBOOK_STORE 가 없습니다. 비공개 자료 폴더(저장소 밖)를 가리킵니다. 예: TEXTBOOK_STORE=~/교과서자료 npm run check:originality -- 5-2/1/01');
  const store = path.resolve(dir);
  if (!fs.existsSync(store) || !fs.statSync(store).isDirectory()) throw new UsageError(`TEXTBOOK_STORE 폴더가 없습니다: ${store}`);
  const real = fs.realpathSync(store);
  // 예외는 시험이 쓰는 .cache/tests/ 하나다. git 이 무시하는 폴더라 올라가지 않고, 시험은 제 폴더 밖에 쓰지 않는다 (16절).
  const sandbox = path.join(fs.realpathSync(c.ROOT), '.cache', 'tests') + path.sep;
  for (const repo of real.startsWith(sandbox) ? [] : [c.ROOT, gitRoot()].filter(Boolean)) {
    const r = fs.realpathSync(repo);
    if (real === r || real.startsWith(r + path.sep)) throw new UsageError(`TEXTBOOK_STORE 가 저장소 안에 있습니다 (${store}). 커밋하면 공개되므로 저장소 밖으로 옮깁니다`);
  }
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
export function compareFile(text, pages, allow) {
  const { chars, at } = normalize(text);
  const blocked = blockedAt(chars, allow);
  const lineOf = (offset) => text.slice(0, offset).split('\n').length;
  const out = [];
  for (const p of pages) {
    for (const r of sharedRuns(chars, p.norm, blocked)) {
      out.push({
        line: lineOf(at[r.start]), lineEnd: lineOf(at[r.end - 1]),
        page: `${KIND_LABEL[p.kind]} ${p.page}쪽`, hangul: r.hangul,
        level: r.hangul >= FAIL_AT ? 'fail' : 'warn',
      });
    }
  }
  return out.sort((a, b) => a.line - b.line || b.hangul - a.hangul);
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
    if (t.pages.length === 0) {
      lines.push(`  비공개 자료에 이 학기의 쪽이 없습니다. 견줄 것이 없어 기록하지 않습니다`);
      failed = true;
      continue;
    }
    const found = t.files.flatMap((f) => compareFile(fs.readFileSync(f, 'utf8'), t.pages, allow).map((r) => ({ ...r, file: f })));
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
