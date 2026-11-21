// 명세를 읽고 검증하는 단 하나의 통로.
// 사이트(Astro 페이지), 생성기, 검사 스크립트가 모두 이 파일을 거친다. YAML 을 직접 읽지 않는다.
//
// 이 파일은 Astro 없이 `node` 로 바로 돌고(지울 수 있는 TypeScript 문법만 쓴다), astro build 안에서도 돈다.
//
// 차례
//   1. 뿌리와 오류            ROOT · contentDir · distDir · cacheDir · SpecError · parseSpecText
//   2. 차시표                 loadRegistry · allBundles · findBundle · bundleOf · findByPage · unitPages
//   3. 차시 명세              loadLesson · lessonIds · orphanLessons · visibleLessons · lessonPaths
//   4. 주소와 이름            lessonRoute · fileRoute · absoluteUrl · downloadName · 표시용 이름표
//   5. 가리키는 것 풀기       getMedia · mediaRoute · mediaFile · shownMedia · getFact · termMeaning · creditShort · creditFull · creditList
//   6. 흐름·퀴즈·인쇄물       flowByLesson · quizByLesson · answerText · slideNotes · worksheetKey · printJobs · pptxFile · deckCards · scored · splitFrame · xmlText
//   7. 검수와 공개            sealsOf · reviewState · publishGaps · registryOriginality · reviewedOn · footerNotice · sheetFooter
//   8. 성취기준               standardSummary · standardsOf
//   9. 글 뽑기 (검사용)       childStrings · teacherStrings · recordStrings
//  10. 플랫폼 페이지          catalog · readyKinds · formatLine · semesterProgress · unitProgress · lessonNeighbours · courseLine · stageFooter
//                            slidePhase · thumbRoute · thumbFile · loadUpdates · visibleUpdates
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineCounter, parseDocument, visit } from 'yaml';
import { lessonsOf } from '../schema/common.ts';
import type { PrintSpec } from '../schema/common.ts';
import {
  BLANK, Lesson, OPTIONAL_ASSET_KINDS, REVIEW_KINDS, drawsPainProblem, factUses, leafBlocksOf, mediaUseProblem, mediaUses, painfulUseProblem,
} from '../schema/lesson.ts';
import type { AssetKind, Fact, FlowStep, Media, OptionalAssetKind, QuizItem, ReviewKind } from '../schema/lesson.ts';
import { Registry } from '../schema/registry.ts';
import type { RegistryBundle, RegistrySemester, RegistryUnit } from '../schema/registry.ts';
import { Updates } from '../schema/updates.ts';
import type { UpdateEntry } from '../schema/updates.ts';
import { factSeal, fileSeal, lessonSeal, registrySeal as sealOfRegistry } from './seal.ts';
import {
  ACTIVITY_LABEL, ASSET_LABEL, ASSET_ROUTE, CARDS_PER_SIDE, KIND_ORDER, LICENCE_LABEL, MARK, MEDIA_KIND_LABEL, ORIENTATION_LABEL, PRINT_DEFAULT,
  REVIEW_LABEL, SITE,
} from './site.ts';
import type { PagedAssetKind, PrintInfo, PrintKind, RoutedKind } from './site.ts';

// ═════════════════════════════ 1. 뿌리와 오류 ═════════════════════════════

// astro build 는 이 파일을 dist/.prerender/chunks/ 로 묶어 옮긴다. 그래서 import.meta.url 만으로는 저장소 뿌리를 알 수 없다.
function findRoot(): string {
  for (const start of [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]) {
    for (let dir = start; ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'content', 'registry.yaml')) && fs.existsSync(path.join(dir, 'package.json'))) return dir;
      if (path.dirname(dir) === dir) break;
    }
  }
  throw new Error('저장소 뿌리(content/registry.yaml 이 있는 폴더)를 찾을 수 없습니다. 저장소 안에서 실행합니다');
}
/** 저장소 뿌리 */
export const ROOT = findRoot();

/**
 * 명세가 놓인 폴더. 보통은 <뿌리>/content 이다.
 * 시험은 환경 변수 CONTENT_DIR 로 tests/<담당>/fixtures/content 같은 가짜 차시표를 가리킬 수 있다.
 */
export function contentDir(): string {
  return process.env.CONTENT_DIR ? path.resolve(ROOT, process.env.CONTENT_DIR) : path.join(ROOT, 'content');
}

/**
 * 빌드한 사이트가 놓인 폴더. 보통은 <뿌리>/dist 이다.
 * 빌드 2~5단계의 스크립트(sync-media, render-pdf, generators/pptx/build.mjs, checks/outputs.mjs)는 dist 의 자리를 이 함수로만 얻는다.
 * `--out <폴더>` 인자나 환경 변수 DIST_DIR 로 바꾼다 (둘 다 있으면 인자. 저장소 뿌리 기준). astro build 에는 같은 폴더를 `--outDir` 로 준다.
 * 시험은 .cache/tests/<이름>-<pid>/ 아래를 가리킨다. dist/ 와 public/ 에 쓰지 않는다.
 */
export function distDir(argv: readonly string[] = process.argv.slice(2)): string {
  const i = argv.indexOf('--out');
  const flag = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
  if (i >= 0 && (!flag || flag.startsWith('--'))) throw new Error('--out 뒤에 폴더를 적습니다. 예: --out .cache/tests/print');
  const dir = flag || process.env.DIST_DIR;
  return dir ? path.resolve(ROOT, dir) : path.join(ROOT, 'dist');
}

/**
 * 다시 만들지 않으려고 남겨 두는 것의 자리: PDF 캐시(files/), PPTX 로 내보낸 명세(lessons.json), PNG 로 바꾼 그림(media/). 보통은 <뿌리>/.cache 이다.
 * distDir() 이 dist 가 아닌 곳을 가리키면 그 폴더 옆의 "<폴더>.cache" 다.
 * 같이 도는 시험끼리, 그리고 시험과 실제 빌드가 캐시를 섞어 쓰지 않게 하려는 것이다 (시험용 명세의 묶음 id 는 실제 차시의 것과 같다).
 */
export function cacheDir(argv?: readonly string[]): string {
  const dist = distDir(argv);
  return dist === path.join(ROOT, 'dist') ? path.join(ROOT, '.cache') : `${dist}.cache`;
}

/**
 * 명세에 고칠 곳이 있을 때 던진다. issues 는 교사가 읽는 한 줄씩이다.
 * category 는 검사가 이 줄들을 어느 갈래로 보여 줄지다: 형식(명세의 꼴과 가리키는 것) 또는 검수 기록(공개 조건이 모자람).
 */
export class SpecError extends Error {
  file: string;
  issues: string[];
  category: '형식' | '검수 기록';
  constructor(file: string, issues: string[], category: '형식' | '검수 기록' = '형식') {
    super(`${path.relative(ROOT, file) || file}\n` + issues.map((i) => `  - ${i}`).join('\n'));
    this.name = 'SpecError';
    this.file = file;
    this.issues = issues;
    this.category = category;
  }
}

// ── 오류를 교사가 읽는 말로, 몇째 줄인지와 함께 ──

interface Issue { code: string; path: (string | number)[]; message: string; [k: string]: unknown }

// 값의 꼴마다 "무엇을 적는 칸인가". 조사(을/를)를 변수 뒤에 붙이지 않으려고 문장째 둔다.
const KO_TYPE: Record<string, string> = {
  string: '글을 적는 칸입니다', number: '숫자를 적는 칸입니다', int: '소수점 없는 숫자를 적는 칸입니다', boolean: 'true 또는 false 를 적는 칸입니다',
  array: '목록(- 로 시작하는 줄)을 적는 칸입니다', object: '묶음(칸 이름: 값)을 적는 칸입니다', tuple: '[시작, 끝] 꼴의 목록을 적는 칸입니다',
};
const show = (v: unknown) => { const s = JSON.stringify(v) ?? String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; };
const valueAt = (raw: unknown, p: (string | number)[]) => p.reduce<unknown>((n, k) => (n == null ? n : (n as Record<string | number, unknown>)[k]), raw);

function explain(i: Issue, raw: unknown): string {
  const at = valueAt(raw, i.path);
  // 형식 파일이 직접 적어 둔 한국어 문구가 있으면 그것을 쓴다
  const custom = i.message && !/^(Invalid|Too small|Too big|Unrecognized)/.test(i.message) ? i.message : undefined;
  const list = (xs: unknown) => (Array.isArray(xs) ? xs.join(', ') : '');
  switch (i.code) {
    case 'invalid_type':
      if (at === undefined) return custom ? `꼭 있어야 하는 칸이 빠졌습니다. ${custom}` : '꼭 있어야 하는 칸이 빠졌습니다';
      if (at === null) return '칸 이름만 있고 값이 없습니다. 값을 적거나 칸을 지웁니다';
      if (custom) return custom;
      if (i.expected === 'boolean') return `true 또는 false 를 씁니다 (지금: ${show(at)})`;
      return `${KO_TYPE[String(i.expected)] ?? `${String(i.expected)} 꼴을 적는 칸입니다`} (지금: ${show(at)})`;
    case 'invalid_value':
      if (custom) return custom;
      return wrongValue(at) + `쓸 수 있는 값: ${list(i.values)}`;
    case 'invalid_union':
      if (custom) return custom;
      if (!Array.isArray(i.options)) return '쓸 수 없는 값입니다';
      return wrongValue(at) + `쓸 수 있는 값: ${list(i.options)}`;
    case 'unrecognized_keys':
      return `모르는 칸 이름입니다: ${list(i.keys)} (오타이거나, 이 자리에 쓸 수 없는 칸입니다)`;
    case 'too_small':
      if (custom) return custom;
      if (i.origin === 'array') return `${i.minimum}개 이상 적습니다 (지금 ${Array.isArray(at) ? at.length : 0}개)`;
      if (i.origin === 'string') return '빈 글은 쓸 수 없습니다';
      return `${i.minimum} 이상이어야 합니다 (지금: ${show(at)})`;
    case 'too_big':
      if (custom) return custom;
      if (i.origin === 'array') return `${i.maximum}개까지만 적습니다 (지금 ${Array.isArray(at) ? at.length : '?'}개)`;
      if (i.origin === 'string') return `${i.maximum}자까지만 씁니다`;
      return `${i.maximum} 이하여야 합니다 (지금: ${show(at)})`;
    default:
      return custom ?? '형식이 맞지 않습니다';
  }
}
// 선택값 자리: 칸이 없는 것, 칸 이름만 적은 것("status:"), 없는 값을 적은 것을 가려 말한다
const wrongValue = (at: unknown) =>
  (at === undefined ? '꼭 있어야 하는 칸이 빠졌습니다. ' : at === null ? '칸 이름만 있고 값이 없습니다. ' : `쓸 수 없는 값입니다 (지금: ${show(at)}). `);
// 사람이 세는 대로 1부터 센다 (flow.slides 와 퀴즈 문항 번호도 1부터다)
const where = (p: (string | number)[]) => p.map((k) => (typeof k === 'number' ? `${k + 1}번째` : k)).join(' · ') || '(맨 위)';

const YAML_HINT: Record<string, string> = {
  DUPLICATE_KEY: '같은 칸 이름이 두 번 나옵니다. 하나를 지웁니다',
  TAB_AS_INDENT: '들여쓰기에 탭을 쓰지 않습니다. 빈칸으로 바꿉니다',
};
const YAML_HINT_DEFAULT = '글 안에 "콜론+빈칸"이 있거나 글이 따옴표·대괄호로 시작하면 글 전체를 큰따옴표로 감쌉니다. 들여쓰기는 빈칸 두 개씩이고 탭을 쓰지 않습니다';

interface Schema<T> { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } } }

/**
 * YAML 글을 읽어 형식에 맞는지 본다. 맞지 않으면 SpecError 를 던진다.
 * 파일 하나만 보고 알 수 있는 것까지만 본다. 차시표·다른 묶음·파일·지문 검사는 loadLesson 이 한다.
 */
export function parseSpecText<T>(schema: Schema<T>, text: string, file = '(글)'): { data: T; raw: unknown; lineOf: (path: (string | number)[]) => number } {
  // 메모장의 옛 저장 방식(ANSI·CP949)이나 UTF-16 으로 저장한 파일은 한글이 모두 깨진 채 읽힌다 (깨진 자리에 U+FFFD 가 들어온다).
  // 그대로 두면 형식 오류가 수십 줄 나온다. 무엇을 할지 한 줄로 알려 준다.
  if (text.includes('\uFFFD')) throw new SpecError(file, ['파일이 UTF-8 로 저장되어 있지 않아 한글이 깨졌습니다. 편집기에서 인코딩을 UTF-8 로 골라 다시 저장합니다']);
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  if (doc.errors.length) {
    const e = doc.errors[0];
    const line = e.linePos?.[0].line ?? '?';
    throw new SpecError(file, [`${line}번째 줄: YAML 을 읽을 수 없습니다. ${YAML_HINT[e.code] ?? YAML_HINT_DEFAULT} (${e.code})`]);
  }
  // 값 뒤에 붙은 ' #…' 는 YAML 이 주석으로 버린다. 글이 소리 없이 잘리므로 막는다.
  const cut: string[] = [];
  visit(doc, {
    Scalar(_key, node) {
      // 여러 줄 글(| 와 >)은 끝이 다음 줄의 첫머리다. 그다음 줄에 따로 쓴 주석을 잘린 글로 잘못 보지 않게 건너뛴다. 블록 안의 # 은 글자 그대로다.
      if (!node.range || node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') return;
      // Windows 에서 저장한 파일은 줄 끝이 CRLF 다. \r 이 남으면 아래 식이 맞지 않아 잘린 글을 놓친다.
      const rest = text.slice(node.range[1]).split(/\r?\n/, 1)[0];
      const m = /^[ \t]+#(.*)$/.exec(rest);
      if (m) cut.push(`${lc.linePos(node.range[0]).line}번째 줄: 값 뒤의 " #" 부터는 주석으로 버려집니다 (버려진 글: ${m[1].trim() || '없음'}). 글에 # 이 들어가면 글 전체를 큰따옴표로 감싸고, 주석이면 윗줄로 옮깁니다`);
    },
  });
  if (cut.length) throw new SpecError(file, cut);
  const raw: unknown = doc.toJS();
  // 빈 파일이나 주석만 있는 파일. ("(맨 위): 칸 이름만 있고 값이 없습니다"는 무엇을 하라는 말인지 알 수 없다.)
  if (raw == null) throw new SpecError(file, ['파일이 비어 있습니다. 내용을 적습니다 (차시 명세는 docs/template/lesson.yaml 을 복사해 시작합니다)']);
  // 문제가 난 칸이 파일에 없으면(빠진 칸) 가장 가까운 윗칸의 줄을 알려 준다
  const lineOf = (at: (string | number)[]): number => {
    const p = [...at];
    let node: { range?: [number, number, number] | null } | undefined;
    for (; ; p.pop()) {
      node = doc.getIn(p, true) as typeof node;
      if (node?.range || p.length === 0) break;
    }
    return node?.range ? lc.linePos(node.range[0]).line : 1;
  };
  const r = schema.safeParse(raw);
  if (!r.success) {
    // 꼴이 틀린 칸(목록 자리에 글 한 줄 등)에는 그 한 줄만 보여 준다. 같은 칸에 따라 나오는 길이·개수 문구("6자까지만 씁니다")는 엉뚱한 말이다.
    const all = r.error.issues as Issue[];
    const wrongType = new Set(all.filter((i) => i.code === 'invalid_type').map((i) => i.path.join('\u0000')));
    const issues = all.filter((i) => !((i.code === 'too_big' || i.code === 'too_small') && wrongType.has(i.path.join('\u0000'))));
    throw new SpecError(file, issues.map((i) => `${lineOf(i.path)}번째 줄 · ${where(i.path)}: ${explain(i, raw)}`));
  }
  return { data: r.data, raw, lineOf };
}

/** 차시 명세 글을 읽는다 (형식 검사까지만). 시험과 도구가 쓴다. */
export function parseLessonText(text: string, file?: string): Lesson {
  return parseSpecText<Lesson>(Lesson, text, file).data;
}

// 고친 파일은 다시 읽는다 (astro dev 에서 YAML 을 고치면 바로 보이게). stamp 는 파일들의 고친 시각이다.
const cache = new Map<string, { stamp: string; value: unknown }>();
const mtime = (file: string) => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };

// ═════════════════════════════ 2. 차시표 ═════════════════════════════

const registryFile = () => path.join(contentDir(), 'registry.yaml');

export function loadRegistry(): Registry {
  const file = registryFile();
  const stamp = `${mtime(file)}|${mtime(STANDARDS_FILE)}`;
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.value as Registry;
  if (!fs.existsSync(file)) throw new SpecError(file, ['차시표 파일이 없습니다']);
  const registry = parseSpecText<Registry>(Registry, fs.readFileSync(file, 'utf8'), file).data;
  const known = new Set(loadStandards().map((s) => s.code));
  const issues: string[] = [];
  for (const s of registry.semesters) for (const u of s.units) for (const c of u.standards) {
    if (!known.has(c)) issues.push(`${s.id} · ${u.no}단원 · standards: 성취기준 자료(data/standards/social-2022.json)에 없는 코드입니다: ${c}`);
  }
  if (issues.length) throw new SpecError(file, issues);
  cache.set(file, { stamp, value: registry });
  return registry;
}

/** 차시표의 묶음 하나. 명세가 없는 묶음도 이 값은 있다. */
export interface BundleRef {
  /** "5-2/1/03-04" */
  id: string;
  semester: RegistrySemester;
  unit: RegistryUnit;
  bundle: RegistryBundle;
  /** 차시 번호. 묶음 id 에서 나온다. 예: [3, 4] */
  lessons: number[];
  /** 교과서 쪽수 [시작, 끝] */
  pages: [number, number];
  role: RegistryBundle['role'];
  /** 보여 줄 성취기준 코드. 묶음에 적은 것이 있으면 그것, 없으면 단원의 것 */
  standards: string[];
  /** 차시표 전체에서 몇 번째 묶음인가 (0부터). 앞뒤를 견줄 때 쓴다. */
  index: number;
}

/** 차시표에 오른 모든 묶음 (명세가 없는 것도 포함), 차시표 순서 */
export function allBundles(): BundleRef[] {
  const out: BundleRef[] = [];
  for (const semester of loadRegistry().semesters)
    for (const unit of semester.units)
      for (const bundle of unit.bundles) {
        out.push({
          id: `${semester.id}/${unit.no}/${bundle.id}`, semester, unit, bundle,
          lessons: lessonsOf(bundle.id), pages: bundle.pages, role: bundle.role,
          standards: bundle.standards.length ? bundle.standards : unit.standards,
          index: out.length,
        });
      }
  return out;
}

export function findBundle(id: string): BundleRef | undefined {
  return allBundles().find((b) => b.id === id);
}

/** 차시표의 값(차시 번호·쪽수·단원명·성취기준). 명세에는 이 값들이 없으므로 여기에서 얻는다. */
export function bundleOf(lesson: Lesson | string): BundleRef {
  const id = typeof lesson === 'string' ? lesson : lesson.id;
  const ref = findBundle(id);
  if (!ref) throw new Error(`차시표(content/registry.yaml)에 ${id} 가 없습니다`);
  return ref;
}

/** 교과서 쪽수로 묶음 찾기. 두 묶음이 한 쪽을 나눠 쓰면 둘 다 나온다. */
export function findByPage(semesterId: string, page: number): BundleRef[] {
  return allBundles().filter((b) => b.semester.id === semesterId && b.pages[0] <= page && page <= b.pages[1]);
}

/** 단원의 쪽수 [시작, 끝]. 묶음들의 쪽수에서 나온다. */
export function unitPages(unit: RegistryUnit): [number, number] {
  return [Math.min(...unit.bundles.map((b) => b.pages[0])), Math.max(...unit.bundles.map((b) => b.pages[1]))];
}

// ═════════════════════════════ 3. 차시 명세 ═════════════════════════════

export function lessonDir(id: string): string {
  return path.join(contentDir(), ...id.split('/'));
}
export function lessonFile(id: string): string {
  return path.join(lessonDir(id), 'lesson.yaml');
}
export function hasLesson(id: string): boolean {
  return fs.existsSync(lessonFile(id));
}

interface Entry {
  lesson: Lesson;
  /** 명세에 적은 칸만, 형식이 읽은 값으로 (지문을 낼 때 쓴다. 기본값으로 채운 칸은 들어 있지 않다) */
  raw: unknown;
  /** 이 파일들이 바뀌면 다시 읽는다: 그림, 전개도 모듈, 가리키는 앞 묶음의 명세와 그 묶음이 기대는 파일 */
  deps: string[];
  /** 가리키는 같은 단원 앞 묶음의 id */
  refs: string[];
  /** 앞 묶음에서 빌려 온 것 (지문에 들어간다): 사실의 지문, 그림의 권리 정보와 파일 내용, 단원 덱에 모은 카드 */
  borrowed: unknown[];
  /** 명세 밖에 있지만 지문에 들어가는 파일 (전개도 모듈) */
  sealed: string[];
  /** 아래 둘은 처음 물을 때 채운다. 읽은 값이 그대로인 동안에는 그림 파일을 다시 읽지 않는다. */
  seal?: string;
  gaps?: string[];
  /** gaps 가운데 "서로 다른 두 확인자의 confirmed 가 모자란 사실" 줄과 그 사실 id. 로더가 한 줄로 묶어 알린다. */
  unconfirmed?: { line: string; id: string }[];
}

const isLocal = (ref: string) => !ref.includes('/');

// 지문을 낼 값: 명세에 적은 칸만 남기고(기본값을 채우기 전의 짜임), 칸의 값은 형식이 읽은 값으로 바꾼다.
// 형식은 1392 와 "1392", 한 줄 글과 여러 줄 글(|), 따옴표 없는 묶음 id 01 과 "01" 을 같은 값으로 읽는다. 적는 꼴만 바꾼 것으로 검수 기록이 낡지 않게 한다.
// 적지 않은 칸의 기본값은 넣지 않는다. 형식에 기본값이 새로 생겨도 지문이 바뀌지 않는다.
function written(raw: unknown, data: unknown): unknown {
  if (Array.isArray(raw)) return Array.isArray(data) ? raw.map((v, i) => written(v, data[i])) : raw;
  if (raw && typeof raw === 'object') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return raw;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, written(v, (data as Record<string, unknown>)[k])]));
  }
  return data === undefined || (data !== null && typeof data === 'object') ? raw : data;
}

/** 전개도 모듈 파일의 자리 (페이퍼크래프트가 ready 일 때). 그 차시에만 맞는 도안이라 명세와 함께 검수하고 지문에 넣는다. */
export function papercraftModuleFile(lesson: Lesson): string | undefined {
  const a = lesson.assets.papercraft;
  return a.state === 'ready' ? path.join(ROOT, 'generators', 'papercraft', 'modules', `${a.module}.ts`) : undefined;
}

// 명세를 읽고 차시표·파일·같은 단원의 앞 묶음과 맞는지까지 본다. 공개 조건(검수 기록과 지문)은 보지 않는다.
// 지문과 검수 상태를 묻는 함수(sealsOf·reviewState·publishGaps)는 이것을 쓴다. 공개된 차시를 고친 뒤에도 무엇이 남았는지 읽을 수 있어야 해서다.
function readEntry(id: string): Entry {
  const file = lessonFile(id);
  const ref = findBundle(id);
  if (!ref) throw new SpecError(file, [`차시표(content/registry.yaml)에 ${id} 가 없습니다. 폴더 이름이 차시표의 묶음 id 와 같은지 봅니다`]);
  if (!fs.existsSync(file)) throw new SpecError(file, [`${id} 묶음의 명세(lesson.yaml)가 아직 없습니다`]);
  const stampOf = (deps: string[]) => [registryFile(), file, ...deps].map(mtime).join('|');
  const hit = cache.get(file);
  if (hit && hit.stamp === stampOf((hit.value as Entry).deps)) return hit.value as Entry;

  const { data: lesson, raw: read, lineOf } = parseSpecText<Lesson>(Lesson, fs.readFileSync(file, 'utf8'), file);
  const raw = written(read, lesson);
  const at = (p: (string | number)[]) => `${lineOf(p)}번째 줄 · ${where(p)}`;
  const issues: string[] = [];
  const deps = new Set<string>();
  if (lesson.id !== id) issues.push(`id: 파일이 놓인 폴더(${id})와 다릅니다 (지금: ${lesson.id}). id 를 ${id} 로 고칩니다`);
  for (const m of lesson.media) {
    const mediaPath = path.join(lessonDir(id), m.file);
    deps.add(mediaPath); // 그림 파일만 바꿔 끼워도 다시 읽는다
    if (!fs.existsSync(mediaPath)) issues.push(`media · ${m.id}: 파일이 없습니다 (${m.file})`);
    // 바로 가기(심볼릭 링크)를 그대로 복사하면 묶음 밖의 파일이 사이트에 실린다 (명세는 낯선 사람의 PR 로도 들어온다).
    // 이름의 대소문자만 다른 파일은 macOS·Windows 에서는 읽히다가 배포하는 리눅스에서 '파일이 없습니다'가 된다.
    else if (fs.realpathSync.native(mediaPath) !== path.join(fs.realpathSync.native(lessonDir(id)), m.file)) issues.push(`media · ${m.id}: 그림 파일을 이 묶음의 media/ 폴더에 그대로 넣습니다. 바로 가기(심볼릭 링크)이거나 파일 이름의 대소문자가 다릅니다 (${m.file})`);
  }
  // 전개도 모듈도 이 차시의 내용이다 (도안의 그림과 조각 이름). 고치면 다시 읽고, 지문에 넣는다.
  const moduleFile = papercraftModuleFile(lesson);
  if (moduleFile) deps.add(moduleFile);

  // 차시표를 봐야 알 수 있는 것
  if (lesson.facts.length === 0 && ref.role !== 'review') issues.push('facts: 이 차시의 사실을 하나 이상 적습니다 (단원 정리 묶음만 비워 둘 수 있습니다)');
  const cards = lesson.assets.cards.state === 'ready' ? lesson.assets.cards : undefined;
  if (cards && cards.collect.length > 0 && ref.role !== 'review') issues.push('assets · cards · collect: 단원 덱은 단원 정리(차시표의 role: review) 묶음에서만 만듭니다');

  // 같은 단원의 앞 묶음을 가리키는 것 ("05/f3", "05/rain-gauge", collect)
  const unitPrefix = `${ref.semester.id}/${ref.unit.no}/`;
  const others = new Map<string, Entry | undefined>();
  const other = (bundleId: string, what: string): Entry | undefined => {
    if (others.has(bundleId)) return others.get(bundleId);
    let found: Entry | undefined;
    const target = findBundle(unitPrefix + bundleId);
    if (!target || target.index >= ref.index) issues.push(`${what}: 같은 단원에서 이 묶음보다 앞에 있는 묶음만 가리킬 수 있습니다 (${bundleId})`);
    else if (!hasLesson(target.id)) issues.push(`${what}: ${target.id} 묶음의 명세가 아직 없습니다`);
    else {
      deps.add(lessonFile(target.id));
      try {
        found = readEntry(target.id);
        for (const d of found.deps) deps.add(d); // 앞 묶음의 그림 파일이 바뀌어도 다시 읽는다 (빌려 온 것의 지문이 달라진다)
      } catch (e) {
        if (!(e instanceof SpecError)) throw e;
        issues.push(`${what}: ${target.id} 묶음의 명세에 고칠 곳이 있어 읽지 못했습니다`);
      }
    }
    others.set(bundleId, found);
    return found;
  };
  // 빌려 온 것은 이 묶음의 지문에 들어간다. 앞 묶음에서 그것을 고치면 이 묶음의 검수 기록도 없는 것이 된다.
  // 그림은 읽은 그대로의 값(기본값을 채우기 전)과 파일 내용을 넣는다. 형식에 기본값이 새로 생겨도 지문이 바뀌지 않는다.
  const borrowed = new Map<string, unknown>();
  const mediaSeal = (from: Entry, m: Media) => [
    ((from.raw as { media?: { id?: unknown }[] }).media ?? []).find((x) => x?.id === m.id) ?? m.id,
    fileSeal(path.join(lessonDir(from.lesson.id), m.file)),
  ];
  const painfulRefs = new Set<string>();
  for (const u of factUses(lesson)) {
    if (isLocal(u.ref)) continue;
    const [bundleId, factId] = u.ref.split('/');
    const from = other(bundleId, at(u.path));
    if (!from) continue;
    const fact = from.lesson.facts.find((f) => f.id === factId);
    if (!fact) { issues.push(`${at(u.path)}: 없는 사실 id 입니다: ${u.ref}`); continue; }
    borrowed.set(`fact ${u.ref}`, [factSeal(fact), fact.painful]);
    if (fact.painful) {
      painfulRefs.add(u.ref);
      const p = painfulUseProblem(u.ref, u.use);
      if (p) issues.push(`${at(u.path)}: ${p}`);
    }
  }
  if (painfulRefs.size > 0 && lesson.sensitivity.level === 'none') {
    // sensitivity 를 아예 적지 않은 명세에는 가리킬 줄이 없다
    const here = (raw as { sensitivity?: unknown }).sensitivity ? at(['sensitivity', 'level']) : where(['sensitivity', 'level']);
    issues.push(`${here}: 앞 묶음의 피해를 담은 사실(${[...painfulRefs].join(', ')})을 가리키면 sensitivity.level 을 care 나 no_play 로 적습니다`);
  }
  // 뒷면을 적지 않은 카드에는 낱말 풀이가 찍힌다. 그 풀이가 앞 묶음의 피해를 담은 사실에 기대면 카드로 만들지 않는다
  // (이 묶음 안의 사실에 기댄 것은 형식이 막는다. 같은 규칙이다).
  if (cards && painfulRefs.size > 0) cards.cards.forEach((card, i) => {
    const term = card.back ? undefined : lesson.terms.new.find((x) => x.term === card.front);
    if (term?.facts.some((r) => painfulRefs.has(r))) issues.push(`${at(['assets', 'cards', 'cards', i, 'front'])}: "${card.front}" 의 풀이는 피해를 담은 사실에 기대고 있어 카드로 만들지 않습니다`);
  });
  // 피해를 담은 사실을 그린 그림은 놀이 자료(카드·컬러링·웹 활동)에 쓰지 않는다. 이 묶음의 그림이 이 묶음의 사실을 그린 것은 형식이 막는다.
  // 여기에서는 묶음을 건너는 둘을 본다: 이 묶음의 그림이 앞 묶음의 그런 사실을 그린 것, 그리고 앞 묶음의 그림.
  for (const u of mediaUses(lesson)) {
    if (isLocal(u.ref)) {
      const own = lesson.media.find((x) => x.id === u.ref);
      if (own && u.use.startsWith('asset:') && own.facts.some((r) => painfulRefs.has(r))) issues.push(`${at(u.path)}: ${drawsPainProblem(own.id)}`);
      continue;
    }
    const [bundleId, mediaId] = u.ref.split('/');
    const from = other(bundleId, at(u.path));
    if (!from) continue;
    const m = from.lesson.media.find((x) => x.id === mediaId);
    if (!m) { issues.push(`${at(u.path)}: 없는 그림 id 입니다: ${u.ref}`); continue; }
    borrowed.set(`media ${u.ref}`, mediaSeal(from, m));
    const p = mediaUseProblem(m, u.use);
    if (p) issues.push(`${at(u.path)}: ${p}`);
    // 그 그림이 가리키는 사실은 그 그림이 적힌 묶음에서 푼다 (그 묶음의 사실이거나 더 앞 묶음의 사실)
    if (u.use.startsWith('asset:') && m.facts.some((r) => getFact(from.lesson, r).painful)) issues.push(`${at(u.path)}: ${drawsPainProblem(u.ref)}`);
  }
  if (cards) {
    const fronts = new Map<string, string>(cards.cards.map((c) => [c.front, id]));
    for (const g of cards.collect) for (const bundleId of g.bundles) {
      const entry = other(bundleId, 'assets · cards · collect');
      if (!entry) continue;
      const from = entry.lesson;
      if (from.sensitivity.level === 'no_play') { issues.push(`assets · cards · collect: ${from.id} 는 no_play 차시라 단원 덱에 모으지 않습니다. bundles 에서 뺍니다`); continue; }
      if (from.assets.cards.state !== 'ready' || from.assets.cards.cards.length === 0) { issues.push(`assets · cards · collect: ${from.id} 묶음에는 모을 카드가 없습니다 (assets.cards 가 ready 가 아닙니다)`); continue; }
      from.assets.cards.cards.forEach((c, ci) => {
        const seen = fronts.get(c.front);
        if (seen) issues.push(`assets · cards · collect: 앞면이 같은 카드가 두 묶음에 있습니다: "${c.front}" (${seen}, ${from.id})`);
        else fronts.set(c.front, from.id);
        // 단원 덱에 찍히는 것: 앞면, 뒷면(적지 않았으면 낱말 풀이), 가리킨 사실, 그림. 차례도 지문에 든다.
        // 카드의 그림은 그 묶음의 것이 아니라 더 앞 묶음의 것("01/stone")일 수도 있다. 그 그림이 적힌 묶음까지 가서 넣는다.
        let picture: unknown = null;
        if (c.media) {
          const [home, mediaId] = isLocal(c.media) ? [bundleId, c.media] : c.media.split('/');
          const owner = home === bundleId ? entry : other(home, 'assets · cards · collect');
          const m = owner?.lesson.media.find((x) => x.id === mediaId);
          if (owner && m) picture = mediaSeal(owner, m);
        }
        borrowed.set(`card ${bundleId} ${String(ci).padStart(2, '0')}`, [
          c.front, c.back ?? from.terms.new.find((t) => t.term === c.front)?.meaning ?? '', c.facts, picture,
        ]);
      });
    }
  }
  if (issues.length) throw new SpecError(file, issues);

  const entry: Entry = {
    lesson, raw,
    deps: [...deps],
    refs: [...others.entries()].filter(([, l]) => l).map(([b]) => unitPrefix + b),
    borrowed: [...borrowed.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    sealed: moduleFile ? [moduleFile] : [],
  };
  cache.set(file, { stamp: stampOf(entry.deps), value: entry });
  return entry;
}

/** 공개된 차시를 고쳐서 검수 기록이 낡았을 때 맨 끝에 붙이는 안내 */
const REOPEN_HINT = 'status: 공개된 차시를 고칠 때는 같은 커밋에서 status 를 draft 로 되돌립니다. 다시 검수를 마치면 날쌤이 published 로 적습니다';
/** 공개된 차시가 가리키는 앞 묶음이 공개되어 있지 않을 때(초안이거나, 고쳐서 공개 조건을 잃었을 때) 맨 끝에 붙이는 안내 */
const WAIT_HINT = 'status: 가리키는 묶음이 공개되어 있지 않은 동안에는 이 묶음도 status 를 draft 로 둡니다 (가리키는 묶음을 고치는 중이면 같은 커밋에서 draft 로 되돌립니다). 가리키는 묶음을 공개한 뒤에 날쌤이 published 로 적습니다. 빌려 온 사실·그림·카드가 그대로이면 이 묶음의 검수 기록은 그대로 맞습니다';

// 읽고, 공개된 차시이면 공개 조건(검수 기록과 지문)까지 본다. 페이지와 빌드가 쓰는 길이다.
function loadEntry(id: string): Entry {
  const entry = readEntry(id);
  if (entry.lesson.status === 'published') {
    const gaps = gapsOf(id, entry);
    if (gaps.length) {
      const edited = Object.values(reviewStateOf(id, entry)).includes('stale');
      // 이 묶음은 그대로인데 가리키는 앞 묶음이 다시 검수에 들어간 것이면, 할 일은 "이 묶음도 draft 로"이다. 문구만으로는 알 수 없어서 덧붙인다.
      const waiting = entry.refs.some((ref) => { const from = readEntry(ref); return from.lesson.status !== 'published' || gapsOf(ref, from).length > 0; });
      // 사실마다 같은 문구가 열아홉 줄 나오지 않게, 확인이 모자란 사실은 한 줄로 묶는다 (publishGaps() 는 사실마다 한 줄을 그대로 준다)
      const short = new Set((entry.unconfirmed ?? []).map((u) => u.line));
      const ids = (entry.unconfirmed ?? []).map((u) => u.id);
      const lines = gaps.filter((g) => !short.has(g)).map((g) => `status: 공개(published)할 수 없습니다. ${g}`);
      if (ids.length) lines.push(`status: 공개하려면 사실마다 서로 다른 두 확인자의 기록이 있어야 합니다. 아직 모자란 사실: ${ids.join(', ')} (npm run sign -- ${id} check <사실 id>)`);
      throw new SpecError(lessonFile(id), [...lines, ...(edited ? [REOPEN_HINT] : waiting ? [WAIT_HINT] : [])], '검수 기록');
    }
  }
  return entry;
}

/** 차시 명세를 읽는다. 고칠 곳이 있으면 SpecError 를 던진다. id 는 "5-2/1/01" */
export function loadLesson(id: string): Lesson {
  return loadEntry(id).lesson;
}

/** 명세 파일이 있는 묶음 id 목록 (차시표 순서). 이번 빌드에 실을 차시는 visibleLessons() 로 얻는다. */
export function lessonIds(): string[] {
  return allBundles().map((b) => b.id).filter(hasLesson);
}

/**
 * 읽히지 않고 조용히 빠지는 명세. 검사가 실패시킨다.
 *  - 차시표에 없는 폴더에 놓인 lesson.yaml (폴더 이름을 잘못 적은 것) → "5-2/1/2"
 *  - 이름을 잘못 적은 명세 파일 (lesson.yml, Lesson.yaml, lesson.yaml.txt) → "5-2/1/02/lesson.yml"
 *    파일 이름은 소문자 lesson.yaml 이어야 한다. Lesson.yaml 은 대소문자를 가리지 않는 컴퓨터(macOS, Windows)에서는 읽히다가 배포하는 리눅스에서 빠진다.
 */
export function orphanLessons(): string[] {
  const known = new Set(allBundles().map((b) => b.id));
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name === 'lesson.yaml') {
        const id = path.relative(contentDir(), dir).split(path.sep).join('/');
        if (!known.has(id)) out.push(id);
      } else if (/^lesson\.ya?ml(\..*)?$/i.test(e.name)) {
        out.push(path.relative(contentDir(), path.join(dir, e.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(contentDir());
  return out.sort();
}

/** 초안도 싣는 미리 보기 빌드인가. SHOW_DRAFTS=1 일 때만이다 (astro dev 는 astro.config.mjs 가 켠다). */
export function showDrafts(): boolean {
  return process.env.SHOW_DRAFTS === '1';
}
export function isPublic(lesson: Lesson): boolean {
  return lesson.status === 'published';
}
/**
 * 이번 빌드에 실리는 차시. 페이지, 검색 색인, /media/, /files/, PPTX 에 들어가는 차시는 모두 여기에서 얻는다.
 * 공개 빌드에서는 공개된 차시만 나온다.
 */
export function visibleLessons(): Lesson[] {
  if (!devServer()) return lessonIds().map(loadLesson).filter((l) => isPublic(l) || showDrafts());
  // astro dev 에서는 고칠 곳이 있는 묶음 하나 때문에 모든 페이지가 500 이 되지 않게, 그 묶음만 빼고 터미널에 알린다.
  // 빌드와 npm run check 는 그대로 멈춘다 (여기를 지나지 않는다).
  const out: Lesson[] = [];
  for (const id of lessonIds()) {
    try {
      const l = loadLesson(id);
      if (isPublic(l) || showDrafts()) out.push(l);
    } catch (e) {
      if (!(e instanceof SpecError)) throw e;
      if (!devWarned.has(e.message)) { devWarned.add(e.message); console.error(`[명세] ${id} 묶음을 빼고 보여 줍니다. 고칠 곳:\n${e.message}`); }
    }
  }
  return out;
}
// 같은 알림을 페이지마다 되풀이하지 않는다
const devWarned = new Set<string>();
/** astro dev 로 돌고 있는가. astro.config.mjs 가 초안을 켜는 조건과 같다 (명령이 dev 일 때만). */
function devServer(): boolean {
  return process.argv[2] === 'dev';
}

/** "5-2/1/03-04" → { semester: "5-2", unit: "1", bundle: "03-04" }. 주소 조각이라 모두 글이다. */
export function splitId(id: string): { semester: string; unit: string; bundle: string } {
  const [semester, unit, bundle] = id.split('/');
  return { semester, unit, bundle };
}

/**
 * getStaticPaths 가 그대로 돌려줄 값. kind 를 주면 그 선택 자료가 ready 인 차시만 나온다.
 * props 로는 id 만 넘긴다. lesson 을 넘기면 astro dev 가 처음 읽은 값을 붙들고 있어서 명세를 고쳐도 화면이 바뀌지 않는다.
 * 페이지 본문에서 loadLesson(Astro.props.id) 로 읽는다.
 */
export function lessonPaths(kind?: PagedAssetKind): { params: { semester: string; unit: string; bundle: string }; props: { id: string } }[] {
  return visibleLessons()
    .filter((l) => !kind || l.assets[kind].state === 'ready')
    .map((l) => ({ params: splitId(l.id), props: { id: l.id } }));
}

/** 이 차시에서 만든(ready) 선택 자료 종류 */
export function readyAssets(lesson: Lesson): OptionalAssetKind[] {
  return OPTIONAL_ASSET_KINDS.filter((k) => lesson.assets[k].state === 'ready');
}

// ═════════════════════════════ 4. 주소와 이름 ═════════════════════════════

/** [1] → "1차시", [3, 4] → "3~4차시" */
export function lessonsLabel(lessons: number[]): string {
  return lessons.length === 1 ? `${lessons[0]}차시` : `${lessons[0]}~${lessons[lessons.length - 1]}차시`;
}
/** [6, 9] → "6~9쪽" */
export function pagesLabel(pages: readonly [number, number]): string {
  return pages[0] === pages[1] ? `${pages[0]}쪽` : `${pages[0]}~${pages[1]}쪽`;
}
/** "5-2" → "5학년 2학기" */
export function semesterLabel(id: string): string {
  const [g, s] = id.split('-');
  return `${g}학년 ${s}학기`;
}

/**
 * 사이트 안 경로 (base 없음). lessonRoute(id) 는 안내 페이지, lessonRoute(id, ASSET_ROUTE.quiz) 는 확인 퀴즈.
 * 페이지 안 링크에는 src/lib/url.ts 의 href() 를 씌우고, 종이에 박히는 주소(QR)에는 absoluteUrl() 을 씌운다.
 */
export function lessonRoute(id: string, sub = ''): string {
  return `/${id}/${sub ? sub.replace(/^\/|\/$/g, '') + '/' : ''}`;
}
/** 만들어진 파일(PDF·PPTX)의 경로 (base 없음) */
export function fileRoute(id: string, name: string): string {
  return `/files/${id}/${name}`;
}
/** 내려받을 때 쓰는 한글 파일 이름. 예: "5-2_1단원_1차시_학습지.pdf" */
export function downloadName(id: string, label: string, ext: string): string {
  const ref = bundleOf(id);
  return `${ref.semester.id}_${ref.unit.no}단원_${lessonsLabel(ref.lessons)}_${label}.${ext}`;
}

/**
 * QR·PPTX·인쇄물 바닥글처럼 종이에 박히는 온전한 주소. 브라우저의 location 으로 만들지 않는다 (PDF 는 127.0.0.1 에서 찍힌다).
 * SITE_URL 과 SITE_BASE 로 만든다. 공개 빌드에서 SITE_URL 이 없으면 멈춘다 (localhost 가 종이에 박히지 않게).
 * SITE_URL 은 하위 경로가 없는 주소다 (https://nalssam.github.io). 하위 경로는 SITE_BASE 로만 준다. SITE_URL 에 들어 있으면 멈춘다.
 */
export function absoluteUrl(route: string): string {
  // 빈 글(값을 넣지 않은 CI 변수)은 주지 않은 것으로 본다
  const site = process.env.SITE_URL || undefined;
  if (!site && !showDrafts()) throw new Error('SITE_URL 이 없습니다. 공개 빌드에서는 배포 주소를 SITE_URL 로 줍니다 (예: SITE_URL=https://nalssam.github.io)');
  const NOT_WEB = `SITE_URL 이 웹 주소가 아닙니다 (지금: ${site}). https:// 로 시작하는 배포 주소를 줍니다 (예: SITE_URL=https://nalssam.github.io)`;
  let origin: URL;
  try { origin = new URL(site ?? 'http://localhost:4321'); } catch { throw new Error(NOT_WEB); }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') throw new Error(NOT_WEB);
  // new URL('/5-2/', 'https://example.org/social') 은 '/social' 을 버린다. 하위 경로가 종이의 QR 에서 소리 없이 빠지지 않게 막는다.
  if (origin.pathname !== '/') throw new Error(`SITE_URL 에는 하위 경로를 넣지 않습니다 (지금: ${site}). 하위 경로는 SITE_BASE 로 줍니다 (예: SITE_URL=${origin.origin} SITE_BASE=${origin.pathname.replace(/\/+$/, '')})`);
  const base = '/' + (process.env.SITE_BASE ?? '').replace(/^\/+|\/+$/g, '');
  return new URL((base === '/' ? '' : base) + (route.startsWith('/') ? route : `/${route}`), origin).href;
}

// ═════════════════════════════ 5. 가리키는 것 풀기 ═════════════════════════════

// "05/f3" → 같은 단원 05 묶음의 명세와 "f3". 묶음 사이 검사는 loadLesson 이 이미 마쳤다.
// 앞 묶음이 공개되어 있는지는 이 차시를 읽을 때 본다 (공개 조건 4). 여기에서는 다시 보지 않는다.
function resolveRef(lesson: Lesson, ref: string): { owner: Lesson; id: string } {
  if (isLocal(ref)) return { owner: lesson, id: ref };
  const [bundleId, id] = ref.split('/');
  const { semester, unit } = splitId(lesson.id);
  return { owner: readEntry(`${semester}/${unit}/${bundleId}`).lesson, id };
}

/** 그림과, 그 그림이 적힌 차시의 id */
export type ResolvedMedia = Media & { lessonId: string };

/** 그림 하나. ref 는 "dolmen-parts" 또는 같은 단원 앞 묶음의 "05/rain-gauge" */
export function getMedia(lesson: Lesson, ref: string): ResolvedMedia {
  const { owner, id } = resolveRef(lesson, ref);
  const m = owner.media.find((x) => x.id === id);
  if (!m) throw new Error(`${lesson.id}: 없는 그림 id ${ref}`);
  return { ...m, lessonId: owner.id };
}
/** 그림의 사이트 안 주소 (base 없음). 파일은 빌드 때 /media/<id>/ 아래로 복사된다. */
export function mediaRoute(lesson: Lesson, ref: string): string {
  const m = getMedia(lesson, ref);
  return `/media/${m.lessonId}/${path.basename(m.file)}`;
}
/** 그림 파일이 저장소에 놓인 자리 (절대 경로) */
export function mediaFile(lesson: Lesson, ref: string): string {
  const m = getMedia(lesson, ref);
  return path.join(lessonDir(m.lessonId), m.file);
}

/**
 * 이 묶음의 화면·인쇄물에 실리는 그림 전부 (겹치지 않게, 처음 나오는 차례로):
 * 수업 화면·학습지·선택 자료가 가리키는 그림과 단원 덱에 모은 카드의 그림. 앞 묶음에서 빌려 온 그림도 들어 있다.
 * 차시 안내 페이지의 '출처'는 이 목록의 creditFull() 이다. where 에 'slides' 를 주면 수업 화면에 실리는 그림만 나온다 (PPTX 마지막 장의 출처 목록).
 * lesson.media 를 그대로 늘어놓지 않는다. 단원 정리 묶음은 lesson.media 가 비어 있다.
 */
export function shownMedia(lesson: Lesson, where?: 'slides'): ResolvedMedia[] {
  const out = new Map<string, ResolvedMedia>();
  const add = (m: ResolvedMedia) => { const key = `${m.lessonId}#${m.id}`; if (!out.has(key)) out.set(key, m); };
  for (const u of mediaUses(lesson)) if (!where || u.use === 'slide' || u.use === 'picture') add(getMedia(lesson, u.ref));
  if (!where) for (const card of deckCards(lesson)) if (card.media) add(getMedia(card.lesson, card.media));
  return [...out.values()];
}

/** 사실 하나. ref 는 "f3" 또는 같은 단원 앞 묶음의 "05/f3" */
export function getFact(lesson: Lesson, ref: string): Fact & { lessonId: string } {
  const { owner, id } = resolveRef(lesson, ref);
  const f = owner.facts.find((x) => x.id === id);
  if (!f) throw new Error(`${lesson.id}: 없는 사실 id ${ref}`);
  return { ...f, lessonId: owner.id };
}

/** 읽기 자료 하나 */
export function getPassage(lesson: Lesson, id: string): Lesson['passages'][number] {
  const p = lesson.passages.find((x) => x.id === id);
  if (!p) throw new Error(`${lesson.id}: 없는 읽기 자료 id ${id}`);
  return p;
}

/** 낱말의 아이 눈높이 풀이. 낱말 장(term)과 뒷면 없는 카드가 쓴다. */
export function termMeaning(lesson: Lesson, term: string): string {
  const t = lesson.terms.new.find((x) => x.term === term);
  if (!t) throw new Error(`${lesson.id}: terms.new 에 없는 낱말 ${term}`);
  return t.meaning;
}

/** 이용 조건의 이름. CC 는 주소에서 판을 읽어 붙인다. 예: "CC BY-SA 3.0", "공공누리 제1유형" */
export function licenceName(credit: Media['credit']): string {
  const label = LICENCE_LABEL[credit.licence];
  // 판 뒤의 조각은 나라 이름(2.0/kr)일 때만 붙인다. CC 누리집과 위키미디어 공용이 거는 주소는 deed.ko·legalcode 로 끝난다.
  const m = credit.licence_url ? /^\/licenses\/[a-z-]+\/(\d+\.\d+)(?:\/(?!deed|legalcode)([a-z]+))?(?:\/|$)/.exec(new URL(credit.licence_url).pathname) : null;
  return m ? `${label} ${m[1]}${m[2] ? ' ' + m[2].toUpperCase() : ''}` : label;
}

// 출처 표시의 첫 낱말. AI 로 만든 것은 kind 를 photo 로 적었어도 '사진'이라고 부르지 않는다.
const mediaKindLabel = (m: Media) => (m.ai_generated ? '그림' : MEDIA_KIND_LABEL[m.kind]);

/**
 * 그림 옆에 찍는 짧은 출처 표시. 화면·인쇄물·PPTX 가 이 글만 쓴다.
 * 제목은 일부러 뺀다 (수업에서 아직 이름을 알려 주지 않는 유물이 있다). 제목과 주소는 creditFull() 에 있다.
 */
export function creditShort(m: Media): string {
  const kind = mediaKindLabel(m);
  // AI 로 만든 그림은 우리가 만든 것이든 남이 만든 것이든 그렇게 밝힌다. 본떠 그린 것은 우리가 그린 그림이라 붙이지 않는다.
  const ai = m.ai_generated ? ' · AI로 만든 그림' : '';
  if (m.credit.licence === 'original') return `${kind}: ${m.credit.holder}${ai}`;
  if (m.change === 'traced') return `그림: ${SITE.author} · ${m.credit.holder} 자료를 본떠 그림 (${licenceName(m.credit)})`;
  return `${kind}: ${m.credit.holder} · ${licenceName(m.credit)}${m.change === 'cropped' ? ' · 일부를 잘라 씀' : ''}${ai}`;
}

// 공공누리 제1유형의 안내 페이지. 공공누리 그림은 licence_url 을 적지 않으므로(CC 주소만 받는다) 출처 목록이 걸 주소를 여기에 둔다.
const KOGL1_URL = 'https://www.kogl.or.kr/info/licenseType1.do';

// 출처 표시의 조각. creditFull() 과 creditList() 가 같은 말을 쓰도록 한 곳에서 만든다.
function creditParts(m: Media): { kind: string; title?: string; body: string; sourceUrl?: string; licenceUrl?: string } {
  const kind = mediaKindLabel(m);
  if (m.credit.licence === 'original') {
    return { kind, body: `${m.credit.holder}, ${licenceName(m.credit)}${m.ai_generated ? ', AI로 만든 그림' : ''}`, licenceUrl: SITE.licence.url };
  }
  const change = (m.change === 'traced' ? `, ${SITE.author}이 본떠 그림` : m.change === 'cropped' ? ', 일부를 잘라 씀' : '')
    + (m.ai_generated && m.change !== 'traced' ? ', AI로 만든 그림' : '');
  return {
    kind: m.change === 'traced' ? '원본' : kind,
    title: m.credit.title,
    body: `${m.credit.holder}, ${licenceName(m.credit)}${change}`,
    sourceUrl: m.credit.source_url,
    licenceUrl: m.credit.licence_url ?? (m.credit.licence === 'KOGL-1' ? KOGL1_URL : undefined),
  };
}

/** 제목을 「」로 묶는다. 제목에 이미 「」『』가 있으면 겹치지 않게 그대로 둔다 (사이트의 quoteTitle() 과 같은 규칙). */
function quoteTitle(title: string): string {
  return /[「」『』]/.test(title) ? title : `「${title}」`;
}

/** 제목·소장처·이용 조건·주소가 모두 든 출처 표시. 차시 안내 페이지의 '출처'에 넣는다 (PPTX 마지막 장은 제목을 뺀 creditList()). */
export function creditFull(m: Media): { text: string; sourceUrl?: string; licenceUrl?: string } {
  const { kind, title, body, sourceUrl, licenceUrl } = creditParts(m);
  return {
    text: `${kind}: ${m.credit.licence === 'original' ? '' : `${quoteTitle(title ?? '')}, `}${body}`,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenceUrl ? { licenceUrl } : {}),
  };
}

/** creditList() 의 한 줄 */
export interface CreditLine { text: string; sourceUrl?: string; licenceUrl?: string; count: number }

/**
 * 수업 중에 띄우는 출처 목록. PPTX 마지막 장에 넣는다 (`creditList(shownMedia(lesson, 'slides'))`).
 * creditFull() 에서 「제목」을 뺀 것이다. creditShort() 처럼, 수업에서 아직 이름을 알려 주지 않는 유물이 있어서다 (제목은 안내 페이지의 '출처'에 있다).
 * 글·출처 주소·이용 조건 주소가 모두 같은 그림은 한 줄로 묶고 첫 낱말 뒤에 장수를 붙인다. 예: "그림 5장: 몽당분필 날쌤, CC BY-NC-SA 4.0"
 * 차례는 처음 나온 차례다.
 */
export function creditList(media: readonly Media[]): CreditLine[] {
  const lines = new Map<string, { kind: string; body: string; sourceUrl?: string; licenceUrl?: string; count: number }>();
  for (const m of media) {
    const { kind, body, sourceUrl, licenceUrl } = creditParts(m);
    const key = JSON.stringify([kind, body, sourceUrl ?? '', licenceUrl ?? '']);
    const hit = lines.get(key);
    if (hit) hit.count += 1;
    else lines.set(key, { kind, body, sourceUrl, licenceUrl, count: 1 });
  }
  return [...lines.values()].map(({ kind, body, sourceUrl, licenceUrl, count }) => ({
    text: `${kind}${count > 1 ? ` ${count}장` : ''}: ${body}`,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenceUrl ? { licenceUrl } : {}),
    count,
  }));
}

// ═════════════════════════════ 6. 흐름·퀴즈·인쇄물 ═════════════════════════════

/** 한 차시의 흐름 */
export interface LessonFlow {
  /** 차시 번호 */
  lesson: number;
  steps: FlowStep[];
  /** 이 차시가 쓰는 첫 수업 화면 번호 (1부터). 수업 화면을 쓰지 않는 차시면 없다. `/<id>/slides/#<번호>` 로 연다. */
  firstSlide?: number;
}

/** 흐름을 차시별로 나눈다. 한 차시 묶음이면 한 덩어리가 나온다. 안내 페이지는 덩어리마다 시간표를 따로 그린다. */
export function flowByLesson(lesson: Lesson): LessonFlow[] {
  const lessons = lessonsOf(lesson.id);
  return lessons.map((n) => {
    const steps = lesson.flow.filter((s) => (s.lesson ?? lessons[0]) === n);
    return { lesson: n, steps, firstSlide: steps.find((s) => s.slides)?.slides?.[0] };
  });
}

/** 퀴즈 문항을 차시별로 나눈다. no 는 quiz.items 의 순서 번호(1부터)다. lesson 을 적지 않은 문항은 마지막 차시의 것이다. */
export function quizByLesson(lesson: Lesson): { lesson: number; items: { no: number; item: QuizItem }[] }[] {
  const lessons = lessonsOf(lesson.id);
  const last = lessons[lessons.length - 1];
  const numbered = lesson.quiz.items.map((item, i) => ({ no: i + 1, item }));
  return lessons.map((n) => ({ lesson: n, items: numbered.filter((x) => (x.item.lesson ?? last) === n) }));
}

/** 문항의 정답을 보여 주는 글. OX 는 MARK 의 ○·×, 고르기는 "2번 보기 글", 단답은 답 그대로. 수업 화면·PPTX 메모·교사용 풀이가 같은 글을 쓴다. */
export function answerText(item: QuizItem): string {
  if (item.type === 'ox') return item.answer ? MARK.yes : MARK.no;
  if (item.type === 'choice') return `${item.answer}번 ${item.choices[item.answer - 1]}`;
  return item.answer;
}

/**
 * 학습지의 교사용 풀이. 저절로 나오는 답(연표의 빈칸, 선 잇기의 짝, 퀴즈 블록의 정답)을 쪽 순서로 모으고, 그 뒤에 명세의 guide 를 붙인다.
 * 풀이는 화면에만 보여 주고 인쇄물과 PDF 에는 넣지 않는다.
 */
export function worksheetKey(lesson: Lesson): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const { path: at, block } of leafBlocksOf(lesson.worksheet)) {
    const page = `${Number(at[2]) + 1}쪽`;
    if (block.type === 'timeline') {
      const blanks = block.points.filter((p) => p.blank);
      if (blanks.length) out.push({ where: `${page} 연표`, text: blanks.map((p) => `${p.when} — ${p.what}`).join(' / ') });
    } else if (block.type === 'match') {
      out.push({ where: `${page} 선 잇기`, text: block.pairs.map((p) => `${p.left} — ${p.right}`).join(' / ') });
    } else if (block.type === 'quiz') {
      out.push({ where: `${page} 확인 퀴즈`, text: block.items.map((n) => answerText(lesson.quiz.items[n - 1])).join(' / ') });
    }
  }
  return [...out, ...lesson.worksheet.guide];
}

/**
 * 수업 화면 한 장의 교사 메모 (no 는 1부터). 발표 화면의 메모와 PPTX 메모란이 같이 쓴다.
 * notes 를 적은 장은 그것을, 적지 않은 장은 그 장을 쓰는 흐름 단계의 title·do·ask 를 돌려준다.
 */
export function slideNotes(lesson: Lesson, no: number): string[] {
  const slide = lesson.slides[no - 1];
  if (!slide) throw new Error(`${lesson.id}: 수업 화면 ${no}번 장이 없습니다`);
  if (slide.notes) return [slide.notes];
  const step = lesson.flow.find((s) => s.slides && s.slides[0] <= no && no <= s.slides[1]);
  return step ? [step.title, ...step.do, ...step.ask.map((a) => a.q)] : [];
}

/** PDF 로 만드는 인쇄물 하나 */
export interface PrintJob {
  kind: PrintKind;
  /** 우리말 이름. 예: "학습지" */
  label: string;
  /** 인쇄 페이지 경로 (base 없음). 예: /5-2/1/01/worksheet/ */
  route: string;
  /** 만들어질 파일 경로 (base 없음). 예: /files/5-2/1/01/worksheet.pdf */
  file: string;
  /** 내려받을 때의 한글 파일 이름 */
  download: string;
  /** 빈 칸을 기본값으로 채운 인쇄 안내 */
  print: PrintInfo;
  /** PDF 가 가져야 할 쪽수. 인쇄 페이지의 .sheet 개수와도 같아야 한다. */
  pages: number;
}

function fillPrint(kind: PrintKind, spec: PrintSpec | undefined): PrintInfo {
  const d = PRINT_DEFAULT[kind];
  if (!spec) return { ...d, materials: [...d.materials] };
  return {
    per: spec.per,
    // 카드는 늘 A4 세로 양면이다
    sides: kind === 'cards' ? 'duplex' : spec.sides ?? d.sides,
    orientation: kind === 'cards' ? 'portrait' : spec.orientation ?? d.orientation,
    bw_ok: spec.bw_ok ?? d.bw_ok,
    paper: spec.paper ?? d.paper,
    materials: spec.materials.length ? spec.materials : [...d.materials],
    ...(spec.note ? { note: spec.note } : {}),
  };
}

/**
 * 이 차시에서 PDF 로 만들 인쇄물 전부. 인쇄 페이지, render-pdf, 안내 페이지, 산출물 검사가 모두 이 목록을 쓴다.
 * 쪽수: 학습지는 pages 의 수, 페이퍼크래프트는 명세의 pages, 컬러링은 1, 카드는 2 × ceil(장수 ÷ 8).
 */
export function printJobs(lesson: Lesson): PrintJob[] {
  const job = (kind: PrintKind, spec: PrintSpec | undefined, pages: number): PrintJob => ({
    kind, pages,
    label: ASSET_LABEL[kind],
    route: lessonRoute(lesson.id, ASSET_ROUTE[kind]),
    file: fileRoute(lesson.id, `${kind}.pdf`),
    download: downloadName(lesson.id, ASSET_LABEL[kind], 'pdf'),
    print: fillPrint(kind, spec),
  });
  const a = lesson.assets;
  const out = [job('worksheet', lesson.worksheet.print, lesson.worksheet.pages.length)];
  if (a.papercraft.state === 'ready') out.push(job('papercraft', a.papercraft.print, a.papercraft.pages));
  if (a.coloring.state === 'ready') out.push(job('coloring', a.coloring.print, 1));
  if (a.cards.state === 'ready') out.push(job('cards', a.cards.print, 2 * Math.ceil(deckCards(lesson).length / CARDS_PER_SIDE)));
  return out;
}

/** 수업 화면 PPTX 파일의 경로(base 없음)와 내려받을 이름 */
export function pptxFile(lesson: Lesson): { file: string; download: string } {
  return { file: fileRoute(lesson.id, 'slides.pptx'), download: downloadName(lesson.id, ASSET_LABEL.slides, 'pptx') };
}

/** 인쇄할 카드 한 장 */
export interface DeckCard {
  /** 단원 덱에서 카드 모서리에 찍는 글자 (collect 의 label). 이 묶음의 카드에는 없다. */
  label?: string;
  /** 카드가 적힌 차시. 그림은 getMedia(lesson, media) 로 얻는다. */
  lesson: Lesson;
  front: string;
  /** 뒷면. 명세에 적지 않은 카드는 terms.new 의 풀이로 채워져 있다. */
  back: string;
  media?: string;
  facts: string[];
}

/** 인쇄할 카드 전부: 모은 묶음들의 카드(collect 에 적은 차례) 다음에 이 묶음의 카드. 카드가 ready 가 아니면 빈 목록. */
export function deckCards(lesson: Lesson): DeckCard[] {
  const cards = lesson.assets.cards;
  if (cards.state !== 'ready') return [];
  const own = (from: Lesson, label?: string): DeckCard[] =>
    from.assets.cards.state !== 'ready' ? [] : from.assets.cards.cards.map((c) => ({
      ...(label ? { label } : {}),
      lesson: from, front: c.front, back: c.back ?? termMeaning(from, c.front), facts: c.facts,
      ...(c.media ? { media: c.media } : {}),
    }));
  const { semester, unit } = splitId(lesson.id);
  const collected = cards.collect.flatMap((g) => g.bundles.flatMap((b) => own(readEntry(`${semester}/${unit}/${b}`).lesson, g.label)));
  return [...collected, ...own(lesson)];
}

/**
 * 퀴즈·웹 활동이 점수를 보여 줘도 되는가. sensitivity.level 이 none 일 때만이다.
 * false 면 맞았는지와 풀이(explain, why)만 보여 준다. 점수·별·순위·시간 재기·축하 효과가 없다.
 */
export function scored(lesson: Lesson): boolean {
  return lesson.sensitivity.level === 'none';
}

/** 문장 틀을 빈칸에서 나눈다. 조각 사이사이가 빈칸이다. "나는 ___라고 짐작했다." → ["나는 ", "라고 짐작했다."] */
export function splitFrame(frame: string): string[] {
  return frame.split(BLANK);
}

/**
 * 글을 SVG·HTML 문자열 안에 넣을 때 쓰는 이스케이프. 전개도 모듈이 명세의 texts 를 SVG 에 넣을 때 꼭 거친다
 * (모듈이 만든 SVG 는 페이지에 그대로 끼워 넣어지는 단 하나의 길이다).
 */
export function xmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═════════════════════════════ 7. 검수와 공개 ═════════════════════════════

// 명세의 지문: 명세의 값, 그림 파일, 앞 묶음에서 빌려 온 것, 전개도 모듈 파일
function sealOf(id: string, entry: Entry): string {
  return (entry.seal ??= lessonSeal(entry.raw, lessonDir(id), { borrowed: entry.borrowed, files: entry.sealed }));
}

/**
 * 지금 내용의 지문. `npm run sign` 과 `npm run check:originality` 가 검수 기록에 적는다.
 * 공개된 차시를 고친 뒤(공개 조건을 잃은 뒤)에도 읽힌다.
 */
export function sealsOf(id: string): { lesson: string; facts: Record<string, string> } {
  const entry = readEntry(id);
  return { lesson: sealOf(id, entry), facts: Object.fromEntries(entry.lesson.facts.map((f) => [f.id, factSeal(f)])) };
}

/** pass 지금 내용으로 통과 · fix 마지막 기록이 고치라는 것 · stale 통과한 뒤에 내용이 바뀜 · none 기록 없음 */
export type ReviewState = 'pass' | 'fix' | 'stale' | 'none';

/** 베끼기 검사의 pass 기록에 적히는 이름: copy-guard@<비공개 자료 묶음의 지문 8자>. `npm run check:originality` 만 적는다. */
export const COPY_GUARD = /^copy-guard@[0-9a-f]{8}$/;

function reviewStateOf(id: string, entry: Entry): Record<ReviewKind, ReviewState> {
  const seal = sealOf(id, entry);
  const state = (kind: ReviewKind): ReviewState => {
    const last = entry.lesson.reviews.filter((r) => r.kind === kind).at(-1);
    if (!last) return 'none';
    if (last.result === 'fix') return 'fix';
    // 베끼기 검사의 통과는 검사 도구가 적은 것만 친다 (비공개 자료 없이 손으로 적은 pass 는 기록이 없는 것과 같다)
    if (kind === 'originality' && !COPY_GUARD.test(last.by)) return 'none';
    return last.seal === seal ? 'pass' : 'stale';
  };
  return Object.fromEntries(REVIEW_KINDS.map((k) => [k, state(k)])) as Record<ReviewKind, ReviewState>;
}

/** 검수 종류마다 지금 어디까지 왔는가. 적힌 차례가 시간 차례이고 마지막 기록만 친다. 공개된 차시를 고친 뒤에도 읽힌다. */
export function reviewState(id: string): Record<ReviewKind, ReviewState> {
  return reviewStateOf(id, readEntry(id));
}

function gapsOf(id: string, entry: Entry): string[] {
  if (entry.gaps) return entry.gaps;
  const { lesson } = entry;
  const out: string[] = [];
  const unconfirmed: { line: string; id: string }[] = [];
  const state = reviewStateOf(id, entry);
  for (const k of REVIEW_KINDS) {
    const name = `${REVIEW_LABEL[k]}(${k})`;
    const last = lesson.reviews.filter((r) => r.kind === k).at(-1);
    if (state[k] === 'none' && last) out.push(`${name}의 통과 기록은 npm run check:originality -- ${id} --record 가 적습니다 (by 가 "copy-guard@…" 인 기록만 칩니다)`);
    else if (state[k] === 'none') out.push(`${name} 기록이 없습니다`);
    else if (state[k] === 'fix') out.push(`${name}의 마지막 기록이 fix 입니다. 고친 뒤 다시 검수합니다`);
    else if (state[k] === 'stale' && k === 'originality') out.push(`${name}를 통과한 뒤에 내용이 바뀌었습니다. 다시 검사하고 npm run check:originality -- ${id} --record 로 적습니다`);
    else if (state[k] === 'stale') out.push(`${name}를 통과한 뒤에 내용이 바뀌었습니다. 다시 검수하고 npm run sign 으로 적습니다`);
  }
  const owner = lesson.reviews.filter((r) => r.kind === 'owner').at(-1);
  if (owner && /^ai:/i.test(owner.by)) out.push('날쌤 승인(owner)은 사람이 적습니다');
  // 가리키는 앞 묶음도 공개되어 있어야 한다 (앞 묶음은 늘 차시표에서 앞에 있으므로 돌고 돌지 않는다)
  for (const ref of entry.refs) {
    const from = readEntry(ref);
    if (from.lesson.status !== 'published') out.push(`가리키는 ${ref} 묶음이 아직 초안입니다. 공개된 차시는 공개된 묶음만 가리킬 수 있습니다`);
    // 그 묶음이 고쳐졌을 수도 있고, 그 묶음이 가리키는 더 앞 묶음이 초안으로 돌아갔을 수도 있다. 무엇이 남았는지는 그 묶음에 묻게 한다.
    else if (gapsOf(ref, from).length) out.push(`가리키는 ${ref} 묶음이 공개 조건을 잃었습니다. 그 묶음부터 바로잡습니다 (남은 것은 publishGaps("${ref}") 가 알려 줍니다)`);
  }
  for (const f of lesson.facts) {
    const now = factSeal(f);
    // 이름은 reviewerKey() 로 견준다. "ai:검증자A" 와 "AI:검증자a", 사이에 보이지 않는 글자를 넣은 이름을 두 사람으로 세지 않는다.
    const who = new Set(f.checks.filter((c) => c.verdict === 'confirmed' && c.seal === now).map((c) => reviewerKey(c.by)));
    const last = f.checks.at(-1);
    if (f.sources.length === 0) out.push(`사실 ${f.id}: 공개 출처가 없습니다`);
    else if (!f.sources.some((s) => s.quote)) out.push(`사실 ${f.id}: 출처의 근거 구절(quote)이 없습니다`);
    if (who.size < 2) {
      const line = `사실 ${f.id}: 지금 문장을 확인한 이가 ${who.size}명입니다. 서로 다른 둘의 confirmed 확인이 필요합니다`;
      out.push(line);
      unconfirmed.push({ line, id: f.id });
    }
    else if (!(last && last.verdict === 'confirmed' && last.seal === now)) out.push(`사실 ${f.id}: 마지막 확인 기록이 지금 문장의 confirmed 가 아닙니다 (이의가 남아 있습니다)`);
  }
  entry.unconfirmed = unconfirmed;
  return (entry.gaps = out);
}

/**
 * 확인자 이름을 견줄 때 쓰는 열쇠. "서로 다른 두 사람"을 셀 때와 scripts/sign.mjs 가 같은 사람의 기록인지 볼 때 쓴다.
 * 유니코드 정규화(NFKC)를 거쳐 소문자로 바꾸고, 빈칸과 보이지 않는 글자(폭 없는 빈칸·이음 글자·BOM·여린 하이픈)를 뺀다.
 */
export function reviewerKey(by: string): string {
  return by.normalize('NFKC').toLowerCase().replace(/[\s\u00AD\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/g, '');
}

/**
 * 공개(published)하려면 더 채워야 할 것. 빈 목록이면 공개할 수 있다.
 * 초안에도, 공개된 뒤 고쳐서 공개 조건을 잃은 차시에도 쓸 수 있다.
 */
export function publishGaps(id: string): string[] {
  return [...gapsOf(id, readEntry(id))];
}

/** 차시표의 글(학기 소개 blurb, 묶음의 focus)의 지문. `npm run check:originality -- --registry --record` 가 차시표의 originality 에 적는다. */
export function registrySeal(): string {
  return sealOfRegistry(loadRegistry());
}

/**
 * 차시표의 베끼기 검사 기록이 지금 차시표의 글과 맞는가.
 * pass 지금 글로 통과 · stale 통과한 뒤에 blurb 나 focus 가 바뀜 · none 기록 없음. `npm run check -- --push` 는 pass 가 아니면 실패한다.
 */
export function registryOriginality(): ReviewState {
  const record = loadRegistry().originality;
  if (!record) return 'none';
  return record.seal === registrySeal() ? 'pass' : 'stale';
}

/** 날쌤이 승인한 날 ("2026-11-20"). 공개된 차시에만 있다. 안내 페이지의 검수 날짜 배지에 쓴다. */
export function reviewedOn(lesson: Lesson): string | undefined {
  if (!isPublic(lesson)) return undefined;
  return lesson.reviews.filter((r) => r.kind === 'owner' && r.result === 'pass').at(-1)?.date;
}

/**
 * 화면 맨 아래 문구. 공개되지 않은 차시에는 "교사가 검수한"이라고 쓰지 않는다.
 * 차시가 없는 페이지(첫 화면, 학기, 단원, 소개)는 인자 없이 부른다. 그런 페이지는 그 자체가 검수한 자료가 아니므로 "교사가 검수한 자료"라고 쓰지 않는다.
 * 공개 빌드에서는 SITE.siteNotice(검수한 것만 공개한다)를, 초안을 늘어놓고 링크하는 미리 보기(SHOW_DRAFTS=1, astro dev)에서는 SITE.previewNotice 를 준다.
 */
export function footerNotice(lesson?: Lesson): string {
  if (!lesson) return showDrafts() ? SITE.previewNotice : SITE.siteNotice;
  return isPublic(lesson) ? SITE.aiNotice : SITE.draftNotice;
}

/**
 * 인쇄물 바닥글과 PPTX 마지막 장에 넣는 한 줄.
 * 공개된 차시: 만든 이 · 이용 조건 · AI 사용 표시 · 안내 페이지의 온전한 주소 (종이에서 출처와 고친 내용으로 돌아올 수 있게).
 * 공개되지 않은 차시: 초안 표시만.
 */
export function sheetFooter(lesson: Lesson): string {
  return isPublic(lesson) ? `${SITE.printFooter} · ${absoluteUrl(lessonRoute(lesson.id))}` : SITE.draftNotice;
}

// ═════════════════════════════ 8. 성취기준 ═════════════════════════════

/** 성취기준 하나. summary 는 공식 문구가 아니라 자료를 만든 쪽이 쓴 비공식 요약이다 (NOTICE.md). */
export interface Standard { code: string; grade_band: string; unit: string; summary: string }

const STANDARDS_FILE = path.join(ROOT, 'data', 'standards', 'social-2022.json');

function loadStandards(): Standard[] {
  const stamp = String(mtime(STANDARDS_FILE));
  const hit = cache.get(STANDARDS_FILE);
  if (hit && hit.stamp === stamp) return hit.value as Standard[];
  const value = (JSON.parse(fs.readFileSync(STANDARDS_FILE, 'utf8')) as { standards: Standard[] }).standards;
  cache.set(STANDARDS_FILE, { stamp, value });
  return value;
}

/** 성취기준 코드의 한 줄 요약 (비공식 요약). 예: standardSummary("6사04-01") */
export function standardSummary(code: string): string {
  const s = loadStandards().find((x) => x.code === code);
  if (!s) throw new Error(`성취기준 자료(data/standards/social-2022.json)에 없는 코드입니다: ${code}`);
  return s.summary;
}

/** 묶음에 보여 줄 성취기준 (코드와 비공식 요약). 묶음에 적은 것이 없으면 단원의 것이다. */
export function standardsOf(id: string): { code: string; summary: string }[] {
  return bundleOf(id).standards.map((code) => ({ code, summary: standardSummary(code) }));
}

// ═════════════════════════════ 9. 글 뽑기 (검사용) ═════════════════════════════
// 명세의 글은 셋 가운데 하나 이상에 들어간다: 아이가 읽는 글, 교사가 읽는 글, 제작 기록.
// 낱말 검사·금지 표현 검사·숫자 대조가 이 목록을 쓴다. 베끼기 검사는 이 목록이 아니라 파일 글자 전체를 본다.

export interface Str { path: string; text: string }

function collect(node: unknown, base: string, skipKeys: ReadonlySet<string>, out: Str[]): void {
  if (typeof node === 'string') { if (node.trim() && !NOT_PROSE_AT.has(base.replace(/\[\d+\]/g, ''))) out.push({ path: base, text: node }); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => collect(v, `${base}[${i}]`, skipKeys, out)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (skipKeys.has(k)) continue;
      collect(v, base ? `${base}.${k}` : k, skipKeys, out);
    }
  }
}

/** 글이 아닌 값이 들어 있는 칸 (가리키는 id, 선택값, 주소, 날짜) */
export const NOT_PROSE: ReadonlySet<string> = new Set([
  'schema_version', 'id', 'status', 'layout', 'type', 'kind', 'state', 'phase', 'level', 'uses', 'width',
  'media', 'facts', 'passage', 'module', 'bin', 'bundles', 'file', 'url', 'source_url', 'licence', 'licence_url',
  'change', 'accessed', 'checked', 'date', 'seal', 'result', 'verdict', 'per', 'sides', 'orientation',
]);

/**
 * 칸 이름만으로는 가릴 수 없는 자리 (목록의 번호를 뺀 경로). 같은 이름의 다른 칸은 글이다:
 * 연표의 when("1392년")은 아이가 읽는 글이고, 만들기 세트의 when(in_class·extended)은 선택값이다.
 */
export const NOT_PROSE_AT: ReadonlySet<string> = new Set(['assets.making_kit.when']);

/** 아이가 읽는 글 전부: 수업 화면, 읽기 자료, 낱말 풀이, 학습지(연표의 when 포함), 퀴즈(풀이 포함), 카드·웹 활동·만들기, 그림 설명 */
export function childStrings(lesson: Lesson): Str[] {
  const out: Str[] = [{ path: 'title', text: lesson.title }];
  const skip = new Set([...NOT_PROSE, 'notes', 'guide', 'print', 'reason', 'idea']);
  collect(lesson.terms.new, 'terms.new', skip, out);
  for (const m of lesson.media) {
    out.push({ path: `media.${m.id}.alt`, text: m.alt });
    if (m.caption) out.push({ path: `media.${m.id}.caption`, text: m.caption });
  }
  collect(lesson.passages, 'passages', skip, out);
  collect(lesson.slides, 'slides', skip, out);
  collect(lesson.worksheet, 'worksheet', skip, out);
  collect(lesson.quiz, 'quiz', skip, out);
  collect(lesson.assets, 'assets', skip, out);
  return out;
}

/** 교사가 읽는 글 전부: 소개, 목표, 흐름, 진행 메모, 풀이, 인쇄 안내, 사실 문장과 출처 이름, 그림의 소장처·제목 */
export function teacherStrings(lesson: Lesson): Str[] {
  const out: Str[] = [{ path: 'title', text: lesson.title }, { path: 'tagline', text: lesson.tagline }];
  const skip = NOT_PROSE;
  collect(lesson.corrections, 'corrections', skip, out);
  collect(lesson.objectives, 'objectives', skip, out);
  collect(lesson.prepare, 'prepare', skip, out);
  if (lesson.sensitivity.note) out.push({ path: 'sensitivity.note', text: lesson.sensitivity.note });
  lesson.facts.forEach((f, i) => {
    out.push({ path: `facts[${i}].claim`, text: f.claim });
    f.sources.forEach((s, si) => {
      out.push({ path: `facts[${i}].sources[${si}].name`, text: s.name });
      if (s.title) out.push({ path: `facts[${i}].sources[${si}].title`, text: s.title });
    });
  });
  for (const m of lesson.media) {
    out.push({ path: `media.${m.id}.credit.holder`, text: m.credit.holder });
    if (m.credit.title) out.push({ path: `media.${m.id}.credit.title`, text: m.credit.title });
  }
  collect(lesson.flow, 'flow', skip, out);
  lesson.slides.forEach((s, i) => { if (s.notes) out.push({ path: `slides[${i}].notes`, text: s.notes }); });
  collect(lesson.worksheet.guide, 'worksheet.guide', skip, out);
  collect(lesson.worksheet.print, 'worksheet.print', skip, out);
  for (const k of OPTIONAL_ASSET_KINDS) {
    const a = lesson.assets[k];
    if ('print' in a && a.print) collect(a.print, `assets.${k}.print`, skip, out);
  }
  collect(lesson.misconceptions, 'misconceptions', skip, out);
  collect(lesson.assessment, 'assessment', skip, out);
  collect(lesson.teacher_notes, 'teacher_notes', skip, out);
  return out;
}

/** 제작 기록: 사이트에 보여 주지 않지만 공개 저장소에는 실리는 글 (만들지 않는 까닭, 계획, 검수·확인 기록, 근거 구절, 권리 메모) */
export function recordStrings(lesson: Lesson): Str[] {
  const out: Str[] = [];
  for (const k of OPTIONAL_ASSET_KINDS) {
    const a = lesson.assets[k];
    if (a.state === 'skip') out.push({ path: `assets.${k}.reason`, text: a.reason });
    if (a.state === 'planned') out.push({ path: `assets.${k}.idea`, text: a.idea });
  }
  lesson.reviews.forEach((r, i) => {
    out.push({ path: `reviews[${i}].by`, text: r.by });
    if (r.note) out.push({ path: `reviews[${i}].note`, text: r.note });
  });
  lesson.facts.forEach((f, i) => {
    f.sources.forEach((s, si) => { if (s.quote) out.push({ path: `facts[${i}].sources[${si}].quote`, text: s.quote }); });
    f.checks.forEach((c, ci) => {
      out.push({ path: `facts[${i}].checks[${ci}].by`, text: c.by });
      if (c.note) out.push({ path: `facts[${i}].checks[${ci}].note`, text: c.note });
    });
  });
  for (const m of lesson.media) if (m.credit.note) out.push({ path: `media.${m.id}.credit.note`, text: m.credit.note });
  return out;
}

// ═════════════════════════════ 10. 플랫폼 페이지 ═════════════════════════════
// 교과서 목차·자료 유형별·제작 현황·업데이트·내 자료함(R41~R51)이 같이 쓰는 셈. 모두 차시표와 visibleLessons() 에서 나온다.
// 명세에 없는 것을 만들어 내지 않는다: 자료는 ready 인 것만, 차시의 이름은 명세의 title 만 쓴다 (차시표의 focus 는 쓰지 않는다).

/** 이 차시에서 준비된 자료 종류 전부, KIND_ORDER 차례. 수업 화면·학습지·확인 퀴즈는 모든 차시에 있다. */
export function readyKinds(lesson: Lesson): AssetKind[] {
  const ready = new Set<AssetKind>(['slides', 'worksheet', 'quiz', ...readyAssets(lesson)]);
  return KIND_ORDER.filter((k) => ready.has(k));
}

/** 미리보기 그림(썸네일)의 사이트 안 경로 (base 없음). 예: /files/5-2/1/01/thumbs/worksheet.jpg. 페이지가 있는 자료(RoutedKind)에만 있다 (R52). */
export function thumbRoute(id: string, kind: RoutedKind): string {
  return fileRoute(id, `thumbs/${kind}.jpg`);
}
/** 미리보기 그림이 빌드한 사이트(distDir())에 놓이는 자리. 빌드 3단계(render-pdf)가 쓰고 산출물 검사가 본다. */
export function thumbFile(id: string, kind: RoutedKind, argv?: readonly string[]): string {
  return path.join(distDir(argv), 'files', ...id.split('/'), 'thumbs', `${kind}.jpg`);
}

/** "5학년 2학기 1단원 1차시". sep 을 주면 그것으로 잇는다 (차시 자료실의 머리: "5학년 2학기 · 1단원 · 1차시"). */
export function courseLine(id: string, sep = ' '): string {
  const ref = bundleOf(id);
  return [semesterLabel(ref.semester.id), `${ref.unit.no}단원`, lessonsLabel(ref.lessons)].join(sep);
}

/**
 * 수업 화면과 PPTX 의 바닥글 줄 (R55). 사이트 이름 | 학기·단원·차시 | AI 사용 표시나 초안 표시.
 * 예: "nalssam의 초등사회콘텐츠 클라우드  |  5학년 2학기 1단원 1차시  |  검수 전 초안입니다. 수업에 쓰지 마세요."
 */
export function stageFooter(lesson: Lesson): string {
  return [SITE.name, courseLine(lesson.id), footerNotice(lesson)].join('  |  ');
}

/**
 * no 번 장(1부터)을 쓰는 흐름 단계. 수업 화면에서 제 머리말(kicker)이 없는 장에 "01 도입" 꼴로 찍는다 (R55).
 * index 는 그 단계가 제 차시의 흐름에서 몇 번째인가(1부터)다. 두 차시 묶음은 차시마다 1부터 다시 센다 (장 번호와 같다).
 * 어느 단계의 slides 범위에도 들지 않는 장이면 undefined.
 */
export function slidePhase(lesson: Lesson, no: number): { index: number; label: FlowStep['phase']; title: string; kicker: string } | undefined {
  for (const part of flowByLesson(lesson)) {
    const i = part.steps.findIndex((s) => s.slides && s.slides[0] <= no && no <= s.slides[1]);
    if (i < 0) continue;
    const step = part.steps[i];
    return { index: i + 1, label: step.phase, title: step.title, kicker: `${String(i + 1).padStart(2, '0')} ${step.phase}` };
  }
  return undefined;
}

/**
 * 자료 카드의 한 줄 설명 (R47). 예: "화면 22장 · PPTX", "PDF · A4 2쪽", "PDF · A4 가로 2쪽", "휴대폰·태블릿 · 5문항", "휴대폰·태블릿 · 분류하기".
 * 그 자료가 이 차시에서 준비되어 있지 않으면 undefined.
 */
export function formatLine(lesson: Lesson, kind: AssetKind): string | undefined {
  if (!readyKinds(lesson).includes(kind)) return undefined;
  const job = printJobs(lesson).find((j) => j.kind === kind);
  if (job) return `PDF · A4 ${job.print.orientation === 'landscape' ? `${ORIENTATION_LABEL.landscape} ` : ''}${job.pages}쪽`;
  const a = lesson.assets;
  switch (kind) {
    // 수업 화면의 장 수. PPTX 에는 그림 출처 장이 하나 더 붙을 수 있어 파일의 장 수와 다를 수 있다. 여는 단추는 웹 화면이고 PPTX 는 내려받기다.
    case 'slides': return `화면 ${lesson.slides.length}장 · PPTX`;
    case 'quiz': return `휴대폰·태블릿 · ${lesson.quiz.items.length}문항`;
    case 'web_activity': return a.web_activity.state === 'ready' ? `휴대폰·태블릿 · ${ACTIVITY_LABEL[a.web_activity.activity.kind]}` : undefined;
    case 'making_kit': {
      const kit = a.making_kit;
      if (kit.state !== 'ready') return undefined;
      return `${kit.when === 'in_class' && kit.minutes ? `수업 안 ${kit.minutes}분` : '수업 밖 활동'} · 재료 ${kit.materials.length}가지`;
    }
    default: return undefined;
  }
}

/** catalog() 의 한 줄: 이번 빌드에 실리는 자료 하나 */
export interface CatalogItem {
  /** "5-2/1/01#worksheet". 내 자료함(localStorage)에 이 글로 담는다 (R51). */
  key: string;
  lessonId: string;
  kind: AssetKind;
  /** 자료 종류의 이름 (ASSET_LABEL). 예: "학습지" */
  label: string;
  /** 자료의 이름: 명세에 적은 그 자료의 title, 따로 없으면(수업 화면, 확인 퀴즈) 차시의 title */
  title: string;
  lessonTitle: string;
  /** "5-2" */
  semester: string;
  unit: number;
  /** "1차시", "2~3차시" */
  lessonsLabel: string;
  /** "6~9쪽" */
  pagesLabel: string;
  /** "5학년 2학기 1단원 1차시" (courseLine) */
  course: string;
  /** 여는 곳 (base 없음). 자료 페이지, 만들기 세트는 차시 자료실 안의 자리(#making-kit) */
  route: string;
  /** 내려받는 파일이 있으면 그 경로(base 없음)와 한글 이름. 수업 화면은 PPTX, 인쇄물은 PDF */
  file?: { route: string; name: string };
  /** 한 줄 설명 (formatLine) */
  format: string;
  /** 미리보기 그림의 경로 (base 없음). 페이지가 있는 자료에만 있다. 파일은 빌드 3단계에서 생기므로 astro dev 에는 없다. */
  thumb?: string;
  /** 검수 전 초안의 자료 (미리 보기 빌드에서만 나온다) */
  draft: boolean;
}

// 명세에 적은 그 자료의 이름. 수업 화면과 확인 퀴즈에는 따로 없다.
function assetTitle(lesson: Lesson, kind: AssetKind): string | undefined {
  if (kind === 'worksheet') return lesson.worksheet.title;
  if (kind === 'slides' || kind === 'quiz') return undefined;
  const a = lesson.assets[kind];
  return a.state === 'ready' && 'title' in a ? a.title : undefined;
}

/** 이번 빌드에 실리는 자료 전부: visibleLessons() 의 차시마다 readyKinds() 의 자료. 차시표 차례, 그 안에서 KIND_ORDER 차례. */
export function catalog(): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const lesson of visibleLessons()) {
    const ref = bundleOf(lesson);
    const jobs = new Map(printJobs(lesson).map((j) => [j.kind as AssetKind, j]));
    for (const kind of readyKinds(lesson)) {
      const own = assetTitle(lesson, kind);
      const job = jobs.get(kind);
      const file = kind === 'slides' ? { route: pptxFile(lesson).file, name: pptxFile(lesson).download } : job ? { route: job.file, name: job.download } : undefined;
      const routed = kind in ASSET_ROUTE ? (kind as RoutedKind) : undefined;
      out.push({
        key: `${lesson.id}#${kind}`,
        lessonId: lesson.id, kind, label: ASSET_LABEL[kind], title: own ?? lesson.title, lessonTitle: lesson.title,
        semester: ref.semester.id, unit: ref.unit.no, lessonsLabel: lessonsLabel(ref.lessons), pagesLabel: pagesLabel(ref.pages), course: courseLine(lesson.id),
        route: routed ? lessonRoute(lesson.id, ASSET_ROUTE[routed]) : `${lessonRoute(lesson.id)}#making-kit`,
        ...(file ? { file } : {}),
        format: formatLine(lesson, kind) ?? '',
        ...(routed ? { thumb: thumbRoute(lesson.id, routed) } : {}),
        draft: !isPublic(lesson),
      });
    }
  }
  return out;
}

/** 차시 수로 센 진행 (두 차시 묶음은 2). 첫 화면의 학기 타일, 교과서 목차, 제작 현황이 쓴다. */
export interface Progress {
  /** 차시표에 오른 차시 수 */
  total: number;
  /** 공개된 차시 수 */
  published: number;
  /** 이번 빌드에 실린 초안의 차시 수. 공개 빌드에서는 늘 0 이다. */
  draft: number;
  /** 아직 이번 빌드에 없는 차시 수 (명세가 없거나, 공개 빌드에서 초안인 것): total - published - draft */
  planned: number;
}

function progressOf(bundles: BundleRef[]): Progress {
  const visible = new Map(visibleLessons().map((l) => [l.id, l]));
  const count = (list: BundleRef[]) => list.reduce((n, b) => n + b.lessons.length, 0);
  const total = count(bundles);
  const published = count(bundles.filter((b) => { const l = visible.get(b.id); return l !== undefined && isPublic(l); }));
  const draft = count(bundles.filter((b) => { const l = visible.get(b.id); return l !== undefined && !isPublic(l); }));
  return { total, published, draft, planned: total - published - draft };
}

/** 학기의 진행. 차시표가 아직 없는 학기는 모두 0 이다 ("교과서 차시표 준비 중"). */
export function semesterProgress(semesterId: string): Progress {
  return progressOf(allBundles().filter((b) => b.semester.id === semesterId));
}
/** 단원의 진행 */
export function unitProgress(semesterId: string, unitNo: number): Progress {
  return progressOf(allBundles().filter((b) => b.semester.id === semesterId && b.unit.no === unitNo));
}

/** lessonNeighbours() 의 한쪽 */
export interface Neighbour {
  id: string;
  unit: number;
  lessonsLabel: string;
  pagesLabel: string;
  /** 이번 빌드에 실리는 차시인가. 아니면 링크 없이 차시 번호와 '준비 중'만 보여 준다. */
  ready: boolean;
  /** 실리는 차시의 이름 (명세의 title) */
  title?: string;
}

/** 차시표 차례로 이 묶음의 바로 앞과 뒤 묶음 (같은 학기 안에서, 단원을 건너서도). 학기의 처음과 끝에서는 그쪽이 없다. */
export function lessonNeighbours(id: string): { prev?: Neighbour; next?: Neighbour } {
  const all = allBundles();
  const i = all.findIndex((b) => b.id === id);
  if (i < 0) throw new Error(`차시표(content/registry.yaml)에 ${id} 가 없습니다`);
  const visible = new Map(visibleLessons().map((l) => [l.id, l]));
  const side = (b: BundleRef | undefined): Neighbour | undefined => {
    if (!b || b.semester.id !== all[i].semester.id) return undefined;
    const l = visible.get(b.id);
    return { id: b.id, unit: b.unit.no, lessonsLabel: lessonsLabel(b.lessons), pagesLabel: pagesLabel(b.pages), ready: l !== undefined, ...(l ? { title: l.title } : {}) };
  };
  const prev = side(all[i - 1]);
  const next = side(all[i + 1]);
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}

// ── 업데이트 소식 (content/updates.yaml, R49) ──

/** 업데이트 소식 파일의 자리. 명세처럼 CONTENT_DIR 을 따른다. */
export function updatesFile(): string {
  return path.join(contentDir(), 'updates.yaml');
}

/**
 * 업데이트 소식 전부, 날짜가 늦은 것부터 (같은 날은 파일에 적은 차례). 파일이 없으면 빈 목록.
 * 형식에 맞지 않거나 차시표에 없는 차시를 가리키면 SpecError 를 던진다 (빌드와 npm run check 가 멈춘다).
 */
export function loadUpdates(): UpdateEntry[] {
  const file = updatesFile();
  if (!fs.existsSync(file)) return [];
  const stamp = `${mtime(file)}|${mtime(registryFile())}`;
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.value as UpdateEntry[];
  const { data, lineOf } = parseSpecText<UpdateEntry[]>(Updates, fs.readFileSync(file, 'utf8'), file);
  const known = new Set(allBundles().map((b) => b.id));
  const issues: string[] = [];
  data.forEach((u, i) => u.lessons?.forEach((id, j) => {
    if (!known.has(id)) issues.push(`${lineOf([i, 'lessons', j])}번째 줄 · ${i + 1}번째 · lessons: 차시표(registry.yaml)에 없는 묶음 id 입니다: ${id}`);
  }));
  if (issues.length) throw new SpecError(file, issues);
  const value = data.map((u, i) => ({ u, i })).sort((a, b) => (a.u.date < b.u.date ? 1 : a.u.date > b.u.date ? -1 : a.i - b.i)).map(({ u }) => u);
  cache.set(file, { stamp, value });
  return value;
}

/** visibleUpdates() 의 한 줄: 소식과, 그 소식이 가리키는 차시 (이번 빌드에 실리는 것) */
export interface VisibleUpdate extends UpdateEntry {
  /** 가리킨 차시의 이름과 차시 자료실 경로 (base 없음). 적힌 차례. */
  links: { id: string; title: string; route: string; draft: boolean }[];
  /** 가리킨 차시 가운데 초안이 있다 (미리 보기 빌드에서만). 화면에 '초안' 표를 붙인다. */
  draft: boolean;
}

/**
 * 이번 빌드에 보여 줄 소식, 날짜가 늦은 것부터. 차시를 가리키지 않는 소식은 늘 보이고,
 * 차시를 가리키는 소식은 가리킨 차시가 모두 visibleLessons() 에 있을 때만 보인다 (공개 빌드에는 초안의 소식이 없다).
 */
export function visibleUpdates(): VisibleUpdate[] {
  const visible = new Map(visibleLessons().map((l) => [l.id, l]));
  const out: VisibleUpdate[] = [];
  for (const u of loadUpdates()) {
    const lessons = (u.lessons ?? []).map((id) => visible.get(id));
    if (lessons.some((l) => !l)) continue;
    const links = (lessons as Lesson[]).map((l) => ({ id: l.id, title: l.title, route: lessonRoute(l.id), draft: !isPublic(l) }));
    out.push({ ...u, links, draft: links.some((l) => l.draft) });
  }
  return out;
}
