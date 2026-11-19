// npm run check — 차시표와 모든 차시 명세를 검사한다 (docs/CONTRACT.md 11절).
//
//   npm run check                       PR 의 CI 와 기여자의 컴퓨터. 베끼기 검사 기록이 없는 것은 알림이다.
//   npm run check -- --push             기본 가지의 CI(배포 포함)와 TEXTBOOK_STORE 가 있는 컴퓨터의 pre-push. 베끼기 검사 기록이 없으면 실패한다.
//   npm run check -- --base origin/main 기준 가지에서 공개되어 있던 차시의 사실이 바뀌었는데 corrections 가 늘지 않았으면 실패한다.
//
// Python 과 Chromium 을 부르지 않는다. 내용만 고치는 사람이 npm ci 다음에 바로 돌릴 수 있어야 한다.
// 결과를 읽는 사람은 교사다. 줄마다 "몇째 줄의 어느 칸을 어떻게 고치는지"를 적는다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as c from '#lib/content.ts';
import { factIssues, sourceIssues } from '#lib/checks.ts';
import { factSeal } from '#lib/seal.ts';
import { Lesson } from '#schema/lesson.ts';
import { UsageError, gitRoot, parseArgs, rel } from './lib.mjs';
import { fileImageSize } from './files.mjs';
import { REVIEW_LABEL } from '#lib/site.ts';
import { REVIEW_KINDS } from '#schema/lesson.ts';
import { BANNED, CLASSROOM, EMOJI, PAIN_WORDS, SERVICES, fileNameTitle, isPlayPath, parseAllow, straightQuotes, svgProblems } from './rules.mjs';

const USAGE = `쓰는 법: npm run check [-- --push] [-- --base <기준 가지>]
  --push   베끼기 검사 기록이 없거나 낡았으면 실패로 칩니다 (기본 가지의 CI 와 날쌤의 컴퓨터에서만 붙입니다)
  --base   그 가지에서 공개되어 있던 차시의 사실이 바뀌었는지 봅니다. 예: --base origin/main`;

const MB = 1024 * 1024;

/** 한 덩어리(차시표 또는 차시 하나)의 결과 */
class Section {
  constructor(key, title) { this.key = key; this.title = title; this.fails = []; this.notes = []; }
  fail(cat, text) { this.fails.push([cat, text]); }
  note(cat, text) { this.notes.push([cat, text]); }
}

// ───────────── 명세의 자리를 "몇째 줄 · 어느 칸"으로 ─────────────

/**
 * 검사 문구 앞의 자리("slides[3]", "media.stone", "사실 f1")를 교사가 찾을 수 있는 꼴로 바꾼다:
 * "52번째 줄 · slides · 4번째". 번호는 사람이 세는 대로 1부터 센다 (형식 오류 문구와 같다).
 */
function locator(id) {
  const file = c.lessonFile(id);
  let parsed;
  try { parsed = c.parseSpecText(Lesson, fs.readFileSync(file, 'utf8'), file); } catch { return (s) => s; }
  const { data, lineOf } = parsed;
  const toPath = (where) => {
    const fact = /^사실 (f\d+)$/.exec(where);
    if (fact) { const i = data.facts.findIndex((f) => f.id === fact[1]); return i < 0 ? undefined : ['facts', i]; }
    const parts = [];
    for (const m of where.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) parts.push(m[2] !== undefined ? Number(m[2]) : m[1]);
    // media.<id>, passages.<id> 는 목록 안의 차례로 바꾼다
    for (const [list, key] of [['media', 'id'], ['passages', 'id']]) {
      if (parts[0] === list && typeof parts[1] === 'string') {
        const i = data[list].findIndex((x) => x[key] === parts[1]);
        if (i < 0) return undefined;
        parts[1] = i;
      }
    }
    return parts;
  };
  const human = (p) => p.map((k) => (typeof k === 'number' ? `${k + 1}번째` : k)).join(' · ');
  return (message) => {
    const m = /^(사실 f\d+|[A-Za-z_][\w-]*(?:\[\d+\]|\.[\w-]+)*):\s*(.*)$/s.exec(message);
    if (!m) return message;
    const p = toPath(m[1]);
    if (!p) return message;
    return `${lineOf(p)}번째 줄 · ${human(p)}: ${m[2]}`;
  };
}

/** 글의 경로("slides[3].title")를 같은 꼴로 */
const at = (loc, p, text) => loc(`${p}: ${text}`);

/** 긴 글은 고칠 자리 둘레만 보여 준다 (한 줄 알림이 터미널 한 줄을 넘지 않게) */
function excerpt(text, i, width = 36) {
  if (text.length <= width) return text;
  const from = Math.max(0, Math.min(i - 8, text.length - width));
  return `${from > 0 ? '…' : ''}${text.slice(from, from + width)}${from + width < text.length ? '…' : ''}`;
}

/** 남의 자료 이름을 밝히는 출처 칸인가: 사실의 출처, 그림의 credit, 읽기 자료와 짧은 글의 source */
const isSourcePath = (p) => /^facts\[\d+\]\.sources\[|\.credit\.|(^|\.)source$/.test(p);

// ───────────── 검사 ─────────────

function readAllow(file) {
  try { return parseAllow(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

/** 차시표와 명세가 읽히는가 */
function loadAll(out) {
  const reg = new Section('registry', `차시표 (${rel(path.join(c.contentDir(), 'registry.yaml'))})`);
  out.push(reg);
  try {
    c.loadRegistry();
  } catch (e) {
    if (!(e instanceof c.SpecError)) throw e;
    for (const i of e.issues) reg.fail('형식', i);
    return { reg, lessons: [] };
  }
  for (const o of c.orphanLessons()) {
    if (/\/[^/]*lesson[^/]*$/i.test(o)) reg.fail('형식', `${o}: 명세 파일 이름이 틀려 읽히지 않습니다. 이름을 소문자 lesson.yaml 로 고칩니다`);
    else reg.fail('형식', `${o}/lesson.yaml: 차시표에 없는 폴더라 읽히지 않습니다. 폴더 이름을 차시표(content/registry.yaml)의 묶음 id 와 같게 고칩니다 (예: 5-2/1/02)`);
  }
  const lessons = [];
  for (const id of c.lessonIds()) {
    const sec = new Section(id, id);
    out.push(sec);
    try {
      const lesson = c.loadLesson(id);
      sec.title = `${id}  ${lesson.title}  (${c.isPublic(lesson) ? '공개' : '초안'})`;
      lessons.push({ lesson, sec, loc: locator(id) });
    } catch (e) {
      if (!(e instanceof c.SpecError)) { sec.fail('형식', `읽다가 멈췄습니다: ${e.message}`); continue; }
      sec.title = `${id}  (${rel(e.file)})`;
      // 형식 오류는 '형식', 공개된 차시가 공개 조건을 잃은 것은 '검수 기록' 갈래로 보인다 (SpecError.category)
      for (const i of e.issues) sec.fail(e.category ?? '형식', i);
    }
  }
  return { reg, lessons };
}

function checkFacts({ lesson, sec, loc }) {
  for (const i of factIssues(lesson)) sec.fail('사실', loc(i));
  for (const i of sourceIssues(lesson)) sec.fail('출처', loc(i));
}

function checkWords({ lesson, sec, loc }) {
  const seen = new Set();
  const strings = [...c.childStrings(lesson), ...c.teacherStrings(lesson)].filter((s) => !seen.has(s.path) && seen.add(s.path));
  for (const s of strings) {
    for (const b of BANNED) if (b.re.test(s.text)) sec.fail('표현', at(loc, s.path, b.say));
    // 출처 칸(사실의 출처, 그림의 credit, 읽기 자료·짧은 글의 source)은 남의 자료 이름을 밝히는 자리라 서비스 이름 검사에서 뺀다.
    // 교과서 회사 이름은 출처 검사(sourceIssues)가 거기에서 따로 본다. 여기에서도 보면 한 이름이 두 번 찍힌다.
    const svc = !isSourcePath(s.path) && SERVICES.exec(s.text);
    if (svc) sec.fail('표현', at(loc, s.path, `다른 회사의 서비스 이름("${svc[0]}")을 쓰지 않습니다. 무엇을 하는지로 바꿔 씁니다`));
    if (EMOJI.test(s.text)) sec.note('표현', at(loc, s.path, '이모지를 쓰지 않습니다 (14절)'));
    // 곧은 따옴표는 알림이다. 출처 칸은 남의 자료 제목을 그대로 옮겨 적는 자리라 뺀다 (근거 구절 quote 는 글 뽑기에 들지 않는다).
    const q = !isSourcePath(s.path) && straightQuotes(s.text);
    if (q) {
      const curly = q.marks.map((m) => (m === '"' ? '“ ”' : '‘ ’')).join(', ');
      sec.note('표현', at(loc, s.path, `곧은 따옴표(${q.marks.join(' ')})를 ${curly} 로 바꿉니다: ${excerpt(q.fixed, q.at)}`));
    }
  }
  // 교실에서 해 본 듯한 말은 교사가 읽는 글에서만 본다. 사실의 문장과 출처는 출처가 뒷받침하므로 뺀다.
  for (const s of c.teacherStrings(lesson)) {
    if (/^facts\[/.test(s.path) || /\.credit\./.test(s.path)) continue;
    for (const r of CLASSROOM) if (r.re.test(s.text)) sec.note('표현', at(loc, s.path, r.say));
  }
  if (!c.scored(lesson)) {
    for (const s of c.childStrings(lesson)) {
      const w = isPlayPath(s.path) && PAIN_WORDS.exec(s.text);
      if (w) sec.note('표현', at(loc, s.path, `무게가 있는 차시의 놀이 자료에 피해 낱말("${w[0]}")이 나옵니다. 학습지의 읽기와 생각 쓰기로 옮길 수 있는지 봅니다`));
    }
  }
}

/** 단계 장의 그림 상자는 가로로 넓다 (R22, 2 × 2 칸에 폭 전체). 이 비율보다 좁은 우리 그림은 상자 안에서 작게 놓인다. */
const STEPS_MIN_RATIO = 2;

/** 알림: 단계 장에서 쓰는 우리 그림(사진이 아닌 것)이 상자에 비해 좁은가 */
function checkStepPictures({ lesson, sec, loc }) {
  const byId = new Map(lesson.media.map((m) => [m.id, m]));
  const seen = new Set();
  lesson.slides.forEach((s, si) => {
    if (s.layout !== 'steps') return;
    s.steps.forEach((st, i) => {
      const m = st.media && byId.get(st.media);
      if (!m || m.kind === 'photo' || m.kind === 'map' || seen.has(m.id)) return;
      const file = path.join(c.lessonDir(lesson.id), m.file);
      const dim = fs.existsSync(file) ? fileImageSize(file) : undefined;
      if (!dim || !dim.w || !dim.h || dim.w / dim.h >= STEPS_MIN_RATIO) return;
      seen.add(m.id);
      sec.note('그림', at(loc, `slides[${si}].steps[${i}].media`, `단계 그림 "${m.id}"(${m.file})은 가로 ${dim.w} × 세로 ${dim.h}(${(dim.w / dim.h).toFixed(1)}:1)입니다. 수업 화면의 단계 그림 상자는 가로로 넓은 꼴(2.6:1 남짓)이라 이 그림은 작게 놓입니다. viewBox 를 780 × 300 쯤으로 넓게 다시 그립니다`));
    });
  });
}

function checkMedia({ lesson, sec, loc }) {
  lesson.media.forEach((m) => {
    const file = path.join(c.lessonDir(lesson.id), m.file);
    if (!fs.existsSync(file)) return; // 로더가 이미 알렸다
    const size = fs.statSync(file).size;
    if (size > MB) sec.fail('그림', at(loc, `media.${m.id}`, `파일이 1MB 를 넘습니다 (${(size / MB).toFixed(1)}MB, ${m.file}). 크기를 줄여 다시 저장합니다`));
    // 출처 표시의 제목은 사람이 읽는 이름이다. 파일 이름(위키미디어 공용의 "GMJ 0154.jpg" 따위)은 화면과 인쇄물의 출처 줄에 그대로 찍힌다.
    const named = fileNameTitle(m.credit.title);
    const titleAt = `media.${m.id}.credit.title`;
    if (named === 'name') sec.fail('그림', at(loc, titleAt, `출처의 제목이 파일 이름입니다 ("${m.credit.title}"). 원본 페이지에 적힌 작품·소장품 이름을 우리말로 씁니다. 예: 강화 부근리 고인돌`));
    else if (named === 'part') sec.note('그림', at(loc, titleAt, `출처의 제목에 파일 이름이 섞여 있습니다 ("${m.credit.title}"). 파일 이름을 빼고 작품·소장품 이름만 씁니다`));
    if (m.file.endsWith('.svg')) {
      for (const [line, why] of svgProblems(fs.readFileSync(file, 'utf8'))) sec.fail("그림", `${m.file} ${line}번째 줄: ${why}`);
    }
  });
}

/** 전개도 모듈 (11절 '전개도') */
async function checkPapercraft({ lesson, sec, loc }) {
  const a = lesson.assets.papercraft;
  if (a.state !== 'ready') return;
  const file = c.papercraftModuleFile(lesson);
  const where = (text) => at(loc, 'assets.papercraft.module', text);
  if (!file || !fs.existsSync(file)) { sec.fail('전개도', where(`전개도 모듈 파일이 없습니다 (${file ? rel(file) : a.module}). 모듈 이름을 고치거나 파일을 만듭니다`)); return; }
  let sheets;
  try {
    const mod = await import(pathToFileURL(file).href);
    sheets = mod.default?.sheets;
    if (typeof sheets !== 'function') throw new Error('기본 내보내기에 sheets(texts) 가 없습니다');
  } catch (e) { sec.fail('전개도', `${rel(file)}: 모듈을 불러오지 못했습니다 (${e.message})`); return; }
  let probe;
  try { probe = sheets(a.texts.map(() => '<i>&')); } catch (e) { sec.fail('전개도', `${rel(file)}: sheets() 가 멈췄습니다 (${e.message})`); return; }
  if (!Array.isArray(probe)) { sec.fail('전개도', `${rel(file)}: sheets() 는 쪽의 목록을 돌려줍니다`); return; }
  if (probe.length + 1 !== a.pages) sec.fail('전개도', at(loc, 'assets.papercraft.pages', `전개도 ${probe.length}쪽과 만드는 법 1쪽을 더하면 ${probe.length + 1}쪽입니다. pages 를 ${probe.length + 1} 로 고칩니다 (지금 ${a.pages})`));
  probe.forEach((s, i) => {
    const svg = String(s?.svg ?? '');
    if (a.texts.length > 0 && svg.includes('<i>')) sec.fail('전개도', `${rel(file)}: ${i + 1}쪽 SVG 에 명세의 글이 xmlText() 를 거치지 않고 들어갑니다. texts 를 넣는 자리를 xmlText() 로 감쌉니다`);
    const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
    const attr = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(root)?.[1];
    const ok = attr('xmlns') === 'http://www.w3.org/2000/svg' && attr('viewBox') === '0 0 190 249' && attr('width') === '190mm' && attr('height') === '249mm'
      && /(^|;)\s*display\s*:\s*block\s*(;|$)/.test(attr('style') ?? '');
    if (!ok) sec.fail('전개도', `${rel(file)}: ${i + 1}쪽 SVG 의 뿌리를 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 249" width="190mm" height="249mm" style="display:block"> 로 씁니다 (7절)`);
    for (const k of ['title', 'sub']) if (typeof s?.[k] !== 'string') sec.fail('전개도', `${rel(file)}: ${i + 1}쪽에 ${k}(글)가 없습니다`);
  });
}

/** 낱말 (알림): 차시표 순서로 뒤에 오는 차시에서 처음 배우는 낱말이 이 차시의 아이 글에 나오는가 */
function checkTerms(lessons) {
  const allow = readAllow(path.join(c.ROOT, 'checks', 'terms-allow.txt'));
  const order = c.lessonIds();
  for (const { lesson, sec, loc } of lessons) {
    const mine = new Set(lesson.terms.new.map((t) => t.term));
    const later = lessons
      .filter((x) => order.indexOf(x.lesson.id) > order.indexOf(lesson.id))
      .flatMap((x) => x.lesson.terms.new.map((t) => ({ term: t.term, from: x.lesson.id })))
      .filter((t) => !mine.has(t.term));
    if (!later.length) continue;
    const hits = new Map();
    for (const s of c.childStrings(lesson)) {
      let text = s.text;
      for (const a of allow) text = text.split(a).join(' ');
      for (const t of later) if (text.includes(t.term)) {
        const key = `${t.term}\u0000${t.from}`;
        if (!hits.has(key)) hits.set(key, { ...t, first: s.path, count: 0 });
        hits.get(key).count++;
      }
    }
    for (const h of hits.values()) {
      const more = h.count > 1 ? ` 이 자리 말고도 ${h.count - 1}곳에 더 나옵니다.` : '';
      sec.note('낱말', at(loc, h.first, `뒤 차시(${h.from})에서 처음 배우는 낱말("${h.term}")이 나옵니다.${more} 쉬운 말로 바꾸거나, 글자만 같은 다른 말이면 checks/terms-allow.txt 에 적습니다`));
    }
  }
}

/** 검수 기록: 베끼기 검사 (12·13절) */
function checkOriginality(lessons, reg, push) {
  const say = push ? 'fail' : 'note';
  for (const { lesson, sec } of lessons) {
    const s = c.reviewState(lesson.id).originality;
    if (s === 'pass') continue;
    const cmd = `npm run check:originality -- ${lesson.id} --record`;
    if (s === 'none') sec[say]('검수 기록', `베끼기 검사 기록이 없습니다 (${cmd})`);
    else if (s === 'stale') sec[say]('검수 기록', `베끼기 검사를 받은 뒤에 내용이 바뀌었습니다. 다시 검사해 기록합니다 (${cmd})`);
    else sec[say]('검수 기록', `베끼기 검사의 마지막 기록이 fix 입니다. 고친 뒤 다시 검사해 기록합니다 (${cmd})`);
  }
  const r = c.registryOriginality();
  const cmd = 'npm run check:originality -- --registry --record';
  if (r === 'none') reg[say]('검수 기록', `차시표의 베끼기 검사 기록이 없습니다 (${cmd})`);
  else if (r === 'stale') reg[say]('검수 기록', `차시표의 학기 소개(blurb)나 초점(focus)이 검사 뒤에 바뀌었습니다. 다시 검사해 기록합니다 (${cmd})`);
}

/** "f1, f2, f3, f5" → "f1~f3, f5" (사실 id 를 번호 차례로 줄여 적는다) */
function idRanges(ids) {
  const num = (id) => Number(/^f(\d+)$/.exec(id)?.[1] ?? NaN);
  const plain = ids.filter((id) => Number.isNaN(num(id)));
  const sorted = ids.filter((id) => !Number.isNaN(num(id))).sort((a, b) => num(a) - num(b));
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && num(sorted[j + 1]) === num(sorted[j]) + 1) j++;
    out.push(j - i >= 2 ? `${sorted[i]}~${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return [...out, ...plain].join(', ');
}

/**
 * 초안마다 공개까지 남은 것을 한 줄로 (알림). publishGaps(id) 를 검수·사실 확인·앞 묶음으로 묶어 센다.
 * 검수가 어디까지 왔는지 보려고 기록 도구를 돌릴 필요가 없게 한다. 하나하나의 까닭은 npm run sign 이 기록을 적은 뒤에 찍는다.
 */
export function gapSummary(gaps) {
  if (!gaps.length) return '공개 조건을 모두 채웠습니다. 공개(status: published)는 날쌤이 적습니다';
  const isKind = (g, k) => g.startsWith(`${REVIEW_LABEL[k]}(${k})`);
  const kinds = REVIEW_KINDS.filter((k) => gaps.some((g) => isKind(g, k)));
  const facts = [...new Set(gaps.map((g) => /^사실 ([^:]+):/.exec(g)?.[1]).filter(Boolean))];
  const refs = [...new Set(gaps.map((g) => /^가리키는 (\S+) 묶음/.exec(g)?.[1]).filter(Boolean))];
  const rest = gaps.filter((g) => !/^사실 [^:]+:|^가리키는 \S+ 묶음/.test(g) && !REVIEW_KINDS.some((k) => isKind(g, k)));
  const parts = [];
  if (kinds.length) parts.push(`검수 ${kinds.length}가지(${kinds.map((k) => REVIEW_LABEL[k]).join(', ')})`);
  if (facts.length) parts.push(`사실 확인 ${facts.length}개(${idRanges(facts)})`);
  if (refs.length) parts.push(`먼저 공개할 앞 묶음(${refs.join(', ')})`);
  parts.push(...rest);
  return `공개까지 남은 것: ${parts.join(' · ')}`;
}

function checkProgress(lessons) {
  for (const { lesson, sec } of lessons) {
    if (lesson.status === 'published') continue; // 공개된 차시가 조건을 잃으면 로더가 이미 '검수 기록' 으로 막았다
    let gaps;
    try { gaps = c.publishGaps(lesson.id); } catch { continue; } // 가리키는 묶음이 읽히지 않으면 그쪽에서 알렸다
    sec.note('검수 기록', gapSummary(gaps));
  }
}

/**
 * 기준 가지와 견준다 (11절 '검수 기록'). 기준 가지에서 공개되어 있던 묶음마다:
 *  - 명세가 없어졌거나 draft 로 내려갔으면 실패. 그대로 합치면 종이에 박힌 주소가 사이트에서 사라진다 (12절: 고치기부터 다시 공개까지 한 PR 에서).
 *  - 사실이 바뀌었는데 corrections 가 늘지 않았으면 실패.
 */
function checkCorrections(base, out) {
  // 명세가 든 저장소에 묻는다 (CONTENT_DIR 로 시험용 명세를 가리키면 그 폴더의 저장소다)
  const repo = c.contentDir();
  const sec = out.find((s) => s.key === 'registry');
  const root = gitRoot(repo);
  if (!root) { sec.fail('검수 기록', `--base ${base}: git 저장소가 아니라 기준 가지와 견줄 수 없습니다`); return; }
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: repo, stdio: 'ignore' });
  } catch {
    sec.fail('검수 기록', `--base ${base}: 기준 가지를 찾을 수 없습니다. git fetch 로 받아 오거나 이름을 고칩니다`);
    return;
  }
  // 기준 가지에 있던 명세 전부 (지금 차시표에서 빠진 묶음도 본다)
  const where = path.relative(root, fs.realpathSync(repo)).split(path.sep).join('/');
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', where || '.'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * MB }).toString();
  const prefix = where ? `${where}/` : '';
  const ids = listed.split('\n')
    .map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : undefined))
    .map((f) => f && /^([3-6]-[12]\/\d{1,2}\/\d{2}(?:-\d{2})?)\/lesson\.yaml$/.exec(f)?.[1])
    .filter(Boolean);
  for (const id of ids) {
    let old;
    try {
      const before = execFileSync('git', ['show', `${base}:${prefix}${id}/lesson.yaml`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * MB }).toString();
      old = c.parseLessonText(before, `${base}:${id}`);
    } catch { continue; } // 기준 가지의 명세를 지금 형식으로 읽을 수 없으면 견주지 않는다
    if (old.status !== 'published') continue;
    const file = c.lessonFile(id);
    const target = out.find((s) => s.key === id) ?? sec;
    if (!fs.existsSync(file)) {
      sec.fail('검수 기록', `${id}: 공개되어 있던 묶음의 명세가 없어졌습니다. 이대로 합치면 종이에 박힌 이 묶음의 주소가 사이트에서 사라집니다. 명세를 되살립니다 (고치는 중이면 지우지 않고 draft 로 내렸다가 같은 PR 에서 다시 공개합니다)`);
      continue;
    }
    let now;
    try { now = c.parseLessonText(fs.readFileSync(file, 'utf8'), file); } catch { continue; } // 형식 오류는 위에서 알렸다
    if (now.status !== 'published') {
      target.fail('검수 기록', '공개되어 있던 묶음이 draft 로 바뀌었습니다. 이대로 합치면 종이에 박힌 주소가 사이트에서 사라집니다. 다시 검수를 마치고 날쌤이 published 로 적은 뒤에 합칩니다 (CONTRIBUTING.md 7절)');
    }
    const seals = (l) => new Map(l.facts.map((f) => [f.id, factSeal(f)]));
    const a = seals(old), b = seals(now);
    const changed = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
    if (changed.length && now.corrections.length <= old.corrections.length) {
      target.fail('검수 기록', `공개되어 있던 차시의 사실(${changed.join(', ')})이 바뀌었습니다. corrections 에 날짜와 고친 내용을 한 줄 더 적습니다 (안내 페이지에 보입니다)`);
    }
  }
}

// ───────────── 찍기 ─────────────

// 한글은 터미널에서 두 칸을 차지한다. 칸을 맞출 때 글자 수가 아니라 차지하는 칸으로 센다.
const width = (s) => [...s].reduce((n, ch) => n + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

function print(out, push) {
  const lines = [];
  let fails = 0, notes = 0;
  lines.push(`차시 명세 검사${push ? ' (--push: 베끼기 검사 기록이 없으면 실패)' : ''}`);
  for (const s of out) {
    if (s.key === 'registry' && !s.fails.length && !s.notes.length) continue;
    fails += s.fails.length; notes += s.notes.length;
    lines.push('', s.title);
    if (!s.fails.length && !s.notes.length) { lines.push('  통과'); continue; }
    for (const [cat, text] of s.fails) lines.push(`  ${pad('고칠 것', 8)} ${pad(cat, 10)} ${text}`);
    for (const [cat, text] of s.notes) lines.push(`  ${pad('알림', 8)} ${pad(cat, 10)} ${text}`);
  }
  const count = out.filter((s) => s.key !== 'registry').length;
  lines.push('', `명세 ${count}개 · 고칠 것 ${fails}건 · 알림 ${notes}건`);
  if (fails) lines.push('고칠 것이 있어 통과하지 못했습니다. 위의 줄을 고친 뒤 다시 npm run check 를 돌립니다.');
  else if (notes) lines.push('통과했습니다. 알림은 고치지 않아도 되지만 한 번 읽어 봅니다.');
  else lines.push('통과했습니다.');
  // 베끼기 검사 기록은 비공개 자료가 있는 날쌤만 적을 수 있다. 기여자가 이 알림을 고칠 것으로 읽지 않게 한 번만 풀어 쓴다.
  if (!push && out.some((s) => s.notes.some(([cat]) => cat === '검수 기록'))) {
    lines.push('베끼기 검사 기록은 날쌤이 PR 에서 비공개 자료로 검사해 적습니다. 기록이 없다는 알림은 정상이고, 고칠 것이 아닙니다.');
  }
  console.log(lines.join('\n'));
  return fails;
}

// ───────────── 돌리기 ─────────────

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2), { flags: ['--base'], bools: ['--push'] }); } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\n${USAGE}`); return 2; }
    throw e;
  }
  if (args._.length) { console.error(`모르는 인자입니다: ${args._.join(' ')}\n\n${USAGE}`); return 2; }
  const push = args.bools.has('--push');
  const out = [];
  const { reg, lessons } = loadAll(out);
  for (const l of lessons) {
    checkFacts(l);
    checkWords(l);
    checkMedia(l);
    checkStepPictures(l);
    await checkPapercraft(l);
  }
  checkTerms(lessons);
  if (!reg.fails.length) checkOriginality(lessons, reg, push);
  checkProgress(lessons);
  if (args.flags['--base']) checkCorrections(args.flags['--base'], out);
  return print(out, push) ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
