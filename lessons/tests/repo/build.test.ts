// npm run build (scripts/build.mjs): 여섯 단계를 계약의 경로(10절)로 차례로 부르고, 하나라도 실패하면 멈춘다.
// 다른 담당의 스크립트는 흉내 낸 것(stub)으로 바꿔 둔 가짜 저장소 뿌리를 .cache/tests/ 아래에 만들어 돌린다.
// (lib/content.ts 는 실행한 폴더에서 위로 올라가며 content/registry.yaml 과 package.json 이 있는 곳을 뿌리로 삼는다.)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '#lib/content.ts';
import { FIXTURES } from '../contract/helpers.ts';
import { runNode, scratch } from './helpers.ts';

const FAKE = path.join(scratch('build'), 'root');
after(() => fs.rmSync(path.dirname(FAKE), { recursive: true, force: true }));
const LOG = path.join(FAKE, 'steps.log');
const STEPS = [
  ['node_modules/astro/bin/astro.mjs', 'astro'],
  ['scripts/sync-media.mjs', 'sync-media'],
  ['scripts/render-pdf.mjs', 'render-pdf'],
  ['generators/pptx/build.mjs', 'pptx'],
  ['checks/outputs.mjs', 'outputs'],
  ['node_modules/pagefind/lib/runner/bin.cjs', 'pagefind'],
];

function setup() {
  fs.rmSync(FAKE, { recursive: true, force: true });
  fs.mkdirSync(FAKE, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(FAKE, 'package.json'));
  fs.cpSync(FIXTURES, path.join(FAKE, 'content'), { recursive: true });
  for (const [file, name] of STEPS) {
    fs.mkdirSync(path.dirname(path.join(FAKE, file)), { recursive: true });
    // 부른 인자와 넘어온 환경 변수를 적고, STUB_FAIL 에 제 이름이 있으면 실패한다
    fs.writeFileSync(path.join(FAKE, file), `const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(LOG)}, ${JSON.stringify(name)} + ' ' + process.argv.slice(2).join(' ') + ' | ' + (process.env.SITE_URL || '-') + ' ' + process.cwd() + '\\n');
if (process.env.STUB_FAIL === ${JSON.stringify(name)}) { console.error('흉내 낸 실패'); process.exit(3); }
`.replace(/^const fs = require\('node:fs'\);/, file.endsWith('.cjs') ? "const fs = require('node:fs');" : "import fs from 'node:fs';"));
  }
}
const build = (args: string[] = [], env: Record<string, string> = {}) => runNode('scripts/build.mjs', args, env, { cwd: FAKE });
const log = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n') : []);

test('여섯 단계를 차례로 부르고, --out 은 1단계(--outDir)부터 6단계(--site)까지, --only 는 3·4·5단계에 넘긴다', () => {
  setup();
  const r = build(['--out', '.cache/x', '--only', '5-2/1/01'], { SITE_URL: 'https://example.org' });
  assert.equal(r.code, 0, r.all);
  const out = path.join(FAKE, '.cache', 'x');
  assert.deepEqual(log(), [
    `astro build --outDir ${out} | https://example.org ${FAKE}`,
    `sync-media --out ${out} | https://example.org ${FAKE}`,
    `render-pdf --out ${out} --only 5-2/1/01 | https://example.org ${FAKE}`,
    `pptx --out ${out} --only 5-2/1/01 | https://example.org ${FAKE}`,
    `outputs --out ${out} --only 5-2/1/01 | https://example.org ${FAKE}`,
    `pagefind --site ${out} | https://example.org ${FAKE}`,
  ]);
  assert.match(r.out, /^빌드: \.cache\/x · 공개 빌드 · 5-2\/1\/01 만/);
  assert.match(r.out, /── 6\/6 검색 색인 끝/);
  assert.match(r.out, /빌드를 마쳤습니다: \.cache\/x/);
});

test('--out 이 없으면 dist/ 에 만든다 (astro 의 기본 자리라 --outDir 를 주지 않는다)', () => {
  setup();
  assert.equal(build().code, 0);
  assert.deepEqual(log().map((l) => l.split(' | ')[0].trim()), ['astro build', 'sync-media', 'render-pdf', 'pptx', 'outputs', `pagefind --site ${path.join(FAKE, 'dist')}`]);
});

test('한 단계가 실패하면 거기에서 멈추고 그 값으로 끝난다', () => {
  setup();
  const r = build([], { STUB_FAIL: 'render-pdf' });
  assert.equal(r.code, 3);
  assert.deepEqual(log().map((l) => l.split(' ')[0]), ['astro', 'sync-media', 'render-pdf']);
  assert.match(r.err, /3단계\(PDF 만들기\)에서 멈췄습니다 \(끝난 값 3\)\. 위의 글을 읽고 고친 뒤 다시 npm run build 를 돌립니다/);
});

test('다른 담당의 스크립트가 없으면 누가 만드는 것인지 알려 주고 시작하지 않는다', () => {
  setup();
  fs.rmSync(path.join(FAKE, 'scripts', 'render-pdf.mjs'));
  fs.rmSync(path.join(FAKE, 'generators'), { recursive: true });
  const r = build();
  assert.equal(r.code, 1);
  assert.equal(r.err, '3단계(PDF 만들기)에 쓸 scripts/render-pdf.mjs 이(가) 없습니다 (인쇄물 담당이 만듭니다).\n4단계(PPTX 만들기)에 쓸 generators/pptx/build.mjs 이(가) 없습니다 (슬라이드 담당이 만듭니다).\n빌드를 시작하지 않습니다.\n');
  assert.deepEqual(log(), []);
});

test('모르는 인자는 쓰는 법을 찍고 2 로 끝난다', () => {
  setup();
  const r = build(['--onlly', 'x']);
  assert.equal(r.code, 2);
  assert.match(r.err, /모르는 선택입니다: --onlly\n쓰는 법: npm run build/);
});
