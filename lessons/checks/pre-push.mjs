// .githooks/pre-push 가 TEXTBOOK_STORE 가 있을 때(날쌤의 컴퓨터) 부르는 검사 (docs/CONTRACT.md 13절).
//
// git 이 표준 입력으로 주는 "<로컬 ref> <로컬 sha> <원격 ref> <원격 sha>" 줄에서 이번에 올리는 커밋을 찾고,
// 그 커밋들에서 바뀐 파일로 다시 검사할 것을 고른다:
//   - content/registry.yaml                         → 차시표 (--registry)
//   - content/<id>/lesson.yaml, content/<id>/media/*.svg → 그 묶음
//   - generators/papercraft/modules/<이름>.ts        → 그 모듈을 쓰는 묶음
// 기록이 이미 맞아 있어도 다시 돌린다. 주석은 지문에 들지 않으므로 기록은 주석을 지켜 주지 않는다.
// 마지막으로 npm run check -- --push 를 돌린다. 하나라도 실패하면 올리기를 멈춘다.
//
// 검사는 작업 폴더의 파일을 읽는다. 그래서 작업 폴더가 올리는 커밋과 같을 때만 검사한다:
//   - 올리는 커밋이 지금 HEAD 가 아니면(다른 가지를 올리는 git push origin 다른가지) 멈춘다.
//   - 명세·그림·차시표(content/)나 전개도 모듈에 커밋하지 않은 고침이 있으면 멈춘다. 고친 글을 검사하고 고치기 전의 글을 올리게 된다.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { gitRoot } from './lib.mjs';

const ZERO = /^0+$/;
const git = (...args) => execFileSync('git', args, { cwd: c.ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString();

/** 이번에 올리는 커밋들에서 바뀐 파일 (git 뿌리 기준 경로) */
export function pushedFiles(stdin) {
  const files = new Set();
  for (const line of stdin.split('\n')) {
    const [, local, , remote] = line.trim().split(/\s+/);
    if (!local || ZERO.test(local)) continue; // 가지를 지우는 올리기
    // 원격에 이미 있는 커밋은 뺀다. 새 가지면 어느 원격 가지에도 없는 커밋 전부다.
    const commits = git('rev-list', local, ...(remote && !ZERO.test(remote) ? [`^${remote}`] : ['--not', '--remotes'])).split('\n').filter(Boolean);
    for (const sha of commits) for (const f of git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha).split('\n')) if (f) files.add(f);
  }
  return [...files];
}

/** 바뀐 파일에서 다시 검사할 묶음 id 와 차시표 여부 */
export function targetsOf(files, prefix) {
  const ids = new Set();
  let registry = false;
  const modules = new Set();
  const content = path.relative(c.ROOT, c.contentDir()).split(path.sep).join('/');
  for (const f of files) {
    if (!f.startsWith(prefix)) continue;
    const p = f.slice(prefix.length);
    let m;
    if (p === `${content}/registry.yaml`) registry = true;
    else if ((m = new RegExp(`^${content}/([3-6]-[12]/\\d{1,2}/\\d{2}(?:-\\d{2})?)/(?:lesson\\.yaml|media/[^/]+\\.svg)$`, 'i').exec(p))) ids.add(m[1]);
    else if ((m = /^generators\/papercraft\/modules\/([a-z0-9-]+)\.ts$/.exec(p))) modules.add(m[1]);
  }
  if (modules.size) for (const id of c.lessonIds()) {
    try {
      const l = c.parseLessonText(fs.readFileSync(c.lessonFile(id), 'utf8'), c.lessonFile(id));
      if (l.assets.papercraft.state === 'ready' && modules.has(l.assets.papercraft.module)) ids.add(id);
    } catch { /* 형식 오류는 npm run check 가 알린다 */ }
  }
  return { ids: [...ids].filter((id) => c.hasLesson(id)).sort(), registry };
}

/** 작업 폴더가 올리는 커밋과 다른 까닭. 같으면 빈 목록 */
export function workTreeProblems(stdin) {
  const repo = c.contentDir();
  const at = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString();
  const out = [];
  const head = at(repo, 'rev-parse', 'HEAD').trim();
  for (const line of stdin.split('\n')) {
    const [ref, local] = line.trim().split(/\s+/);
    if (!local || ZERO.test(local)) continue; // 가지를 지우는 올리기
    if (local !== head) out.push(`올리는 가지(${ref})가 지금 꺼낸 커밋(HEAD)이 아닙니다. 그 가지로 옮겨(git switch) 다시 올립니다. 검사는 꺼내 둔 파일을 읽습니다`);
  }
  const dirty = [
    ...at(repo, 'status', '--porcelain', '--', '.').split('\n'),
    ...at(c.ROOT, 'status', '--porcelain', '--', 'generators/papercraft/modules').split('\n'),
  ].filter(Boolean).map((l) => l.slice(3));
  if (dirty.length) out.push(`커밋하지 않은 고침이 있습니다 (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ` 외 ${dirty.length - 5}개` : ''}). 커밋하거나 git stash 로 치운 뒤 다시 올립니다. 고친 글을 검사하고 고치기 전의 글을 올리게 됩니다`);
  return out;
}

function run(args) {
  console.log(`\n$ node ${args.join(' ')}`);
  return spawnSync(process.execPath, args, { cwd: c.ROOT, stdio: 'inherit' }).status ?? 1;
}

function main() {
  const root = gitRoot();
  if (!root) { console.error('git 저장소가 아닙니다'); return 1; }
  const prefix = path.relative(root, c.ROOT).split(path.sep).join('/');
  const stdin = fs.readFileSync(0, 'utf8');
  const problems = workTreeProblems(stdin);
  if (problems.length) {
    console.error(`올리기를 멈췄습니다. 작업 폴더가 올리는 커밋과 달라 베끼기 검사를 믿을 수 없습니다.\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    return 1;
  }
  const { ids, registry } = targetsOf(pushedFiles(stdin), prefix ? `${prefix}/` : '');
  let failed = false;
  console.log(`올리기 전 검사: 베끼기 검사 ${ids.length ? ids.join(', ') : '바뀐 명세 없음'}${registry ? ' · 차시표' : ''}`);
  if (ids.length && run(['checks/originality.mjs', ...ids])) failed = true;
  if (registry && run(['checks/originality.mjs', '--registry'])) failed = true;
  if (run(['checks/run.mjs', '--push'])) failed = true;
  if (failed) console.error('\n올리기를 멈췄습니다. 위의 고칠 것을 고친 뒤 다시 올립니다 (기록이 없으면 npm run check:originality -- <id> --record).');
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
