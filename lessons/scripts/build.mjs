// npm run build — 사이트와 PDF·PPTX 를 차례로 만들고 검사한다 (docs/CONTRACT.md 10절).
//
//   npm run build [-- --out <폴더>] [-- --only <묶음 id>]
//
//   1. astro build                                  → dist/
//   2. node scripts/sync-media.mjs      (사이트)   dist/media/<id>/
//   3. node scripts/render-pdf.mjs      (인쇄물)   dist/files/<id>/<kind>.pdf
//   4. node generators/pptx/build.mjs   (슬라이드) dist/files/<id>/slides.pptx
//   5. node checks/outputs.mjs          (저장소)   산출물 검사
//   6. pagefind --site dist             (저장소)   검색 색인
//
// 하나라도 실패하면 거기에서 멈추고 0 이 아닌 값으로 끝난다. 다음 단계가 앞 단계의 결과를 믿고 돌기 때문이다.
// --out 을 주면 1단계(astro build --outDir)부터 6단계(pagefind --site)까지 같은 폴더를 쓴다. 2~5단계의 스크립트는 같은 --out 을 받는다.
// --only 는 3·4·5단계에 넘긴다 (한 묶음의 PDF·PPTX 만 다시 만든다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { UsageError, parseArgs, rel } from '../checks/lib.mjs';

const USAGE = '쓰는 법: npm run build [-- --out <폴더>] [-- --only <묶음 id>]';

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { flags: ['--out', '--only'] });
    if (args._.length) throw new UsageError(`모르는 인자입니다: ${args._.join(' ')}`);
  } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n${USAGE}`); return 2; }
    throw e;
  }
  const dist = c.distDir();
  const out = args.flags['--out'] ? ['--out', dist] : [];
  const only = args.flags['--only'] ? ['--only', args.flags['--only']] : [];
  const at = (...p) => path.join(c.ROOT, ...p);

  // 담당이 따로 만드는 스크립트는 계약의 경로(10절)로만 부른다. 없으면 누가 만드는 것인지 알려 주고 멈춘다.
  const steps = [
    { no: 1, name: 'astro build', file: at('node_modules', 'astro', 'bin', 'astro.mjs'), args: ['build', ...(out.length ? ['--outDir', dist] : [])], owner: 'npm ci 로 깝니다' },
    { no: 2, name: '그림 복사', file: at('scripts', 'sync-media.mjs'), args: out, owner: '사이트 담당이 만듭니다' },
    { no: 3, name: 'PDF 만들기', file: at('scripts', 'render-pdf.mjs'), args: [...out, ...only], owner: '인쇄물 담당이 만듭니다' },
    { no: 4, name: 'PPTX 만들기', file: at('generators', 'pptx', 'build.mjs'), args: [...out, ...only], owner: '슬라이드 담당이 만듭니다' },
    { no: 5, name: '산출물 검사', file: at('checks', 'outputs.mjs'), args: [...out, ...only], owner: '저장소 담당이 만듭니다' },
    { no: 6, name: '검색 색인', file: at('node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs'), args: ['--site', dist], owner: 'npm ci 로 깝니다' },
  ];
  const missing = steps.filter((s) => !fs.existsSync(s.file));
  if (missing.length) {
    console.error(missing.map((s) => `${s.no}단계(${s.name})에 쓸 ${rel(s.file)} 이(가) 없습니다 (${s.owner}).`).join('\n') + '\n빌드를 시작하지 않습니다.');
    return 1;
  }

  console.log(`빌드: ${rel(dist)} · ${c.showDrafts() ? '미리 보기(SHOW_DRAFTS=1, 초안 포함)' : '공개 빌드'}${only.length ? ` · ${only[1]} 만` : ''}`);
  for (const s of steps) {
    const started = Date.now();
    console.log(`\n── ${s.no}/6 ${s.name}  (node ${rel(s.file)} ${s.args.map((a) => (path.isAbsolute(a) ? rel(a) : a)).join(' ')})`);
    // 환경 변수(SITE_URL, SITE_BASE, SHOW_DRAFTS, CONTENT_DIR, DIST_DIR, PYTHON, CHROMIUM_PATH)는 그대로 넘긴다
    const r = spawnSync(process.execPath, [s.file, ...s.args], { cwd: c.ROOT, stdio: 'inherit', env: process.env });
    if (r.error || r.status !== 0) {
      console.error(`\n${s.no}단계(${s.name})에서 멈췄습니다${r.signal ? ` (${r.signal})` : r.status !== null ? ` (끝난 값 ${r.status})` : ''}. 위의 글을 읽고 고친 뒤 다시 npm run build 를 돌립니다.`);
      return r.status || 1;
    }
    console.log(`── ${s.no}/6 ${s.name} 끝 (${((Date.now() - started) / 1000).toFixed(1)}초)`);
  }
  console.log(`\n빌드를 마쳤습니다: ${rel(dist)}`);
  return 0;
}

process.exitCode = main();
