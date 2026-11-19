// .githooks/pre-push 가 TEXTBOOK_STORE 가 있을 때(날쌤의 컴퓨터) 부르는 검사 (docs/CONTRACT.md 13절).
//
// git 이 표준 입력으로 주는 "<로컬 ref> <로컬 sha> <원격 ref> <원격 sha>" 줄에서 이번에 올리는 커밋을 찾고,
// 그 커밋들에서 바뀐 파일로 다시 검사할 것을 고른다:
//   - content/registry.yaml                         → 차시표 (--registry)
//   - content/<id>/lesson.yaml, content/<id>/media/*.svg → 그 묶음
//   - generators/papercraft/modules/<이름>.ts        → 그 모듈을 쓰는 묶음
// 기록이 이미 맞아 있어도 다시 돌린다. 주석은 지문에 들지 않으므로 기록은 주석을 지켜 주지 않는다.
// 마지막으로 npm run check -- --push 를 돌린다. 하나라도 실패하면 올리기를 멈춘다.
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

function run(args) {
  console.log(`\n$ node ${args.join(' ')}`);
  return spawnSync(process.execPath, args, { cwd: c.ROOT, stdio: 'inherit' }).status ?? 1;
}

function main() {
  const root = gitRoot();
  if (!root) { console.error('git 저장소가 아닙니다'); return 1; }
  const prefix = path.relative(root, c.ROOT).split(path.sep).join('/');
  const { ids, registry } = targetsOf(pushedFiles(fs.readFileSync(0, 'utf8')), prefix ? `${prefix}/` : '');
  let failed = false;
  console.log(`올리기 전 검사: 베끼기 검사 ${ids.length ? ids.join(', ') : '바뀐 명세 없음'}${registry ? ' · 차시표' : ''}`);
  if (ids.length && run(['checks/originality.mjs', ...ids])) failed = true;
  if (registry && run(['checks/originality.mjs', '--registry'])) failed = true;
  if (run(['checks/run.mjs', '--push'])) failed = true;
  if (failed) console.error('\n올리기를 멈췄습니다. 위의 고칠 것을 고친 뒤 다시 올립니다 (기록이 없으면 npm run check:originality -- <id> --record).');
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
