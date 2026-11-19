// 저장소 문서와 설정: 기여 문서가 지금 있는 것을 정확히 말하는가, 워크플로·CODEOWNERS 가 계약(0·12·13절)대로인가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import * as c from '#lib/content.ts';
import { runNode, scratch } from './helpers.ts';
import { summary } from '../../checks/deploy-summary.mjs';
import { specFiles } from '../../scripts/migrate/lib.mjs';

const GIT_ROOT = path.dirname(c.ROOT);
const read = (...p: string[]) => fs.readFileSync(path.join(c.ROOT, ...p), 'utf8');
const readGit = (...p: string[]) => fs.readFileSync(path.join(GIT_ROOT, ...p), 'utf8');
const DOCS = ['README.md', 'CONTRIBUTING.md', 'LICENSE-CONTENT.md'];

test('기여 문서에 적은 명령은 package.json 에 있고, 적은 파일·폴더는 저장소에 있다', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const doc of DOCS) {
    const text = read(doc);
    for (const m of text.matchAll(/npm run ([\w:-]+)/g)) assert.ok(scripts[m[1]], `${doc}: npm run ${m[1]} 이 package.json 에 없습니다`);
    for (const m of text.matchAll(/`((?:content|schema|lib|src|generators|scripts|checks|docs|tests)\/[^`*<\s]*|[A-Z-]+\.md|LICENSE)`/g)) {
      const p = m[1].replace(/\/$/, '');
      // 예로 든 묶음 폴더(5-2/1/03-04)와 앞으로 넣을 그림 이름은 없어도 된다
      if (/03-04|pottery-amsa\.jpg|<|modules\/?$/.test(p)) continue;
      // 다른 담당이 만드는 폴더(생성기)는 합치기 전의 가지에는 아직 없을 수 있다
      if (/^generators(\/|$)/.test(p) && !fs.existsSync(path.join(c.ROOT, 'generators'))) continue;
      assert.ok(fs.existsSync(path.join(c.ROOT, p)), `${doc}: ${p} 가 없습니다`);
    }
  }
});

test('README 는 이 프로젝트가 학습 지도 저장소의 lessons/ 에 있다는 것과, 어느 폴더가 어느 조건인지 밝힌다', () => {
  const text = read('README.md');
  assert.match(text, /korean-elementary-learning-map/);
  assert.match(text, /`lessons\/` 의 코드 \| MIT/);
  assert.match(text, /CC BY-NC-SA 4\.0/);
  assert.match(text, /저장소 뿌리의 `LICENSE`, `NOTICE\.md`/);
  assert.match(read('LICENSE'), /^MIT License\n\nCopyright \(c\) 2026 nalssam\n/);
  // 다른 회사 서비스 이름과 금지 표현을 쓰지 않는다 (15절)
  for (const doc of [...DOCS, 'docs/CHANGELOG.md', 'scripts/migrate/README.md']) assert.doesNotMatch(read(doc), /다양한|효과적|쉽고 재미있|[을를] 통해/, doc);
});

test('CONTRIBUTING 은 계약 17절의 일곱 가지를 차례대로 다룬다', () => {
  const heads = [...read('CONTRIBUTING.md').matchAll(/^## (\d)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(heads.map(([n]) => n), [1, 2, 3, 4, 5, 6, 7]);
  const text = read('CONTRIBUTING.md');
  for (const must of ['docs/template/lesson.yaml', '콜론+빈칸', '따옴표로 시작하는 글', '값 뒤의 ` #`', '탭', 'O·X', '이용 조건', '출처 주소', '확인한 날', '1MB', '파일 이름', 'CC BY-NC-SA 4.0', 'MIT', '실명', '베끼기 검사를 건너뜁니다', 'draft', 'corrections']) assert.ok(text.includes(must), must);
});

test('CODEOWNERS 는 lessons/ 전체와 .github/ 전체에 날쌤을 적는다 (검사가 돌지 말지를 정하는 파일까지)', () => {
  const lines = readGit('.github', 'CODEOWNERS').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const owned = lines.map((l) => { const [p, who] = l.trim().split(/\s+/); assert.equal(who, '@nalssam', l); return p; });
  assert.deepEqual(owned.sort(), ['/.github/', '/lessons/']);
});

const workflow = (name: string) => YAML.parse(readGit('.github', 'workflows', name));
const steps = (wf: any) => Object.values(wf.jobs).flatMap((j: any) => j.steps ?? []);

test('워크플로: lessons/ 가 바뀔 때만 돌고, lessons/ 에서 명령을 돌리고, GitHub 이 만든 액션만 쓴다', () => {
  for (const name of ['lessons-ci.yml', 'lessons-deploy.yml']) {
    const wf = workflow(name);
    for (const ev of ['push', 'pull_request']) if (wf.on[ev]) assert.ok(wf.on[ev].paths.includes('lessons/**'), `${name} ${ev}`);
    assert.equal(wf.defaults.run['working-directory'], 'lessons', name);
    for (const s of steps(wf)) if (s.uses) assert.match(s.uses, /^actions\/[a-z-]+@v\d+$/, `${name}: ${s.uses}`);
  }
  // 이미 있는 학습 지도 워크플로는 그대로 둔다
  assert.ok(fs.existsSync(path.join(GIT_ROOT, '.github', 'workflows', 'ontology-release.yml')));
});

test('CI: PR·기본 가지 push·손으로 돌릴 때만 돈다 (PR 가지에서 두 번 돌지 않는다)', () => {
  const wf = workflow('lessons-ci.yml');
  assert.deepEqual(Object.keys(wf.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(wf.on.push.branches, ['main']);
  assert.equal(wf.on.pull_request.branches, undefined);
});

test('CI: 검사·시험·형식 검사, Chromium·Python·LibreOffice 를 깐 미리 보기 빌드, 미리 보기 올리기. 기본 가지에서만 --push', () => {
  const wf = workflow('lessons-ci.yml');
  const run = steps(wf).map((s: any) => s.run ?? '').join('\n');
  for (const cmd of ['npm ci', 'npm test', 'npm run typecheck', 'npm run build', 'npx playwright install --with-deps chromium', 'python -m pip install -r generators/pptx/requirements.txt', 'libreoffice-impress', 'poppler-utils']) assert.ok(run.includes(cmd), cmd);
  assert.match(run, /npm run check -- --base "origin\/\$BASE_REF"/);
  assert.match(run, /if \[ "\$EVENT" = "pull_request" \]; then\n\s+npm run check -- --base/);
  assert.match(run, /refs\/heads\/\$DEFAULT_BRANCH[\s\S]*npm run check -- --push/);
  // 강제로 올려 앞의 커밋이 없으면 --base 없이 견준다
  assert.match(run, /git cat-file -e "\$BEFORE\^\{commit\}"[^\n]*; then\n\s+npm run check -- --push --base "\$BEFORE"/);
  // 건너뛴 시험이 하나라도 있으면 실패한다 (16절)
  const t = steps(wf).find((s: any) => s.name === '시험');
  assert.match(t.run, /--test-reporter=tap --test-reporter-destination="\$RUNNER_TEMP\/test-results\.tap"/);
  assert.match(t.run, /grep -qx '# skipped 0' "\$RUNNER_TEMP\/test-results\.tap"[\s\S]*exit 1/);
  const build = steps(wf).find((s: any) => s.run === 'npm run build');
  assert.equal(build.env.SHOW_DRAFTS, '1');
  const up = steps(wf).find((s: any) => s.uses?.startsWith('actions/upload-artifact'));
  assert.equal(up.with.path, 'lessons/dist');
  // 사용자가 정하는 값(가지 이름 등)은 run 에 바로 넣지 않고 env 로 넘긴다
  assert.doesNotMatch(run, /\$\{\{/);
});

test('워크플로: 산출물 캐시(.cache/files, .cache/media, .cache/lessons.json)를 빌드 전에 받아 온다', () => {
  for (const name of ['lessons-ci.yml', 'lessons-deploy.yml']) {
    const all = steps(workflow(name));
    const i = all.findIndex((s: any) => s.uses?.startsWith('actions/cache@'));
    assert.ok(i >= 0, name);
    assert.deepEqual(all[i].with.path.trim().split('\n').map((l: string) => l.trim()), ['lessons/.cache/files', 'lessons/.cache/media', 'lessons/.cache/lessons.json']);
    assert.match(all[i].with['restore-keys'], /lessons-out-/);
    assert.ok(i < all.findIndex((s: any) => /npm run build/.test(s.run ?? '')), name);
  }
});

test('배포: 기본 가지에서만, SITE_URL 이 없으면 실패하지 않고 건너뛴다. --push 검사 뒤 공개 빌드, 배포 요약, production 환경으로 Pages 에 올린다', () => {
  const wf = workflow('lessons-deploy.yml');
  assert.deepEqual(wf.on.push.branches, ['main']);
  const build = wf.jobs.build;
  assert.match(build.if, /default_branch/);
  assert.match(build.if, /vars\.SITE_URL != ''/);
  assert.match(wf.jobs.skipped.if, /vars\.SITE_URL == ''/);
  assert.match(wf.jobs.skipped.steps[0].run, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(JSON.stringify(wf.jobs.skipped), /exit 1/);
  assert.equal(build.env.SITE_URL, '${{ vars.SITE_URL }}');
  assert.equal(build.env.SHOW_DRAFTS, undefined);
  // 하위 경로(SITE_BASE)는 빌드 전에 configure-pages 의 base_path 에서 받는다
  assert.equal(build.env.SITE_BASE, undefined);
  const runs = build.steps.map((s: any) => s.run ?? s.uses);
  const pages = build.steps.findIndex((s: any) => s.uses === 'actions/configure-pages@v5');
  const base = build.steps.findIndex((s: any) => s.env?.PAGES_BASE === '${{ steps.pages.outputs.base_path }}');
  assert.equal(build.steps[pages].id, 'pages');
  assert.match(build.steps[base].run, /echo "SITE_BASE=\$PAGES_BASE" >> "\$GITHUB_ENV"/);
  assert.ok(pages < base && base < runs.indexOf('npm run build'));
  const order = ['npm run check -- --push', 'npm run build', 'node checks/deploy-summary.mjs >> "$GITHUB_STEP_SUMMARY"', 'actions/upload-pages-artifact@v3'];
  assert.deepEqual(order.map((x) => runs.indexOf(x)).sort((a: number, b: number) => a - b), order.map((x) => runs.indexOf(x)));
  assert.ok(order.every((x) => runs.includes(x)));
  assert.equal(wf.jobs.deploy.environment.name, 'production');
  assert.deepEqual(wf.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.equal(wf.jobs.deploy.steps[0].uses, 'actions/deploy-pages@v4');
});

test('배포 요약: 새로 공개되는 묶음과 사이트에서 빠지는 묶음', () => {
  process.env.CONTENT_DIR = path.join(c.ROOT, 'tests', 'contract', 'fixtures', 'content');
  try {
    const md = summary(['5-2/1/01', '5-2/1/04'], ['5-2/1/01', '5-2/1/02-03']);
    assert.match(md, /### 사이트에서 빠지는 묶음 1개\n\n종이에 박힌 QR 주소가 열리지 않게 됩니다[^\n]*\n\n- `5-2\/1\/04` 5학년 2학기 1단원 4차시\n/);
    assert.match(md, /### 새로 공개되는 묶음 1개\n\n- `5-2\/1\/02-03` 5학년 2학기 1단원 2~3차시\n/);
    assert.match(md, /공개된 묶음은 모두 2개입니다 \(그대로인 것 1개\)/);
    assert.match(summary(undefined, []), /첫 배포로 봅니다[\s\S]*### 새로 공개되는 묶음 0개\n\n없음/);
    assert.doesNotMatch(summary([], ['5-2/1/01']), /빠지는/);
    // 지금 사이트의 파일을 주어 돌린다
    const dir = scratch('summary');
    fs.writeFileSync(path.join(dir, 'published.json'), JSON.stringify(['5-2/1/01']));
    fs.writeFileSync(path.join(dir, 'old.json'), '[]');
    const r = runNode('checks/deploy-summary.mjs', ['--out', dir, '--current', path.join(dir, 'old.json')], { CONTENT_DIR: process.env.CONTENT_DIR });
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^## 배포 요약\n\n### 새로 공개되는 묶음 1개\n\n- `5-2\/1\/01`/);
    // 지금 사이트에 닿지 못해도 배포를 막지 않는다: 견주지 못했다고 적고 0 으로 끝난다
    const down = runNode('checks/deploy-summary.mjs', ['--out', dir, '--current', 'http://127.0.0.1:4759/published.json'], { CONTENT_DIR: process.env.CONTENT_DIR });
    assert.equal(down.code, 0, down.all);
    assert.match(down.out, /^## 배포 요약\n\n지금 사이트의 `\/published\.json` 을 읽지 못해 견주지 못했습니다 \(접속하지 못했습니다: [A-Z]+\)/);
    assert.match(down.out, /### 이번 빌드에 실린 공개 묶음 1개\n\n- `5-2\/1\/01`/);
    assert.match(down.err, /배포 요약에서 견주기를 건너뜁니다/);
    fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    delete process.env.CONTENT_DIR;
  }
});

test('형식 옮기기 도우미는 content/ 와 시험용 명세를 빠짐없이 찾는다', () => {
  const files = specFiles().map((f: string) => path.relative(c.ROOT, f).split(path.sep).join('/'));
  assert.ok(files.includes('content/registry.yaml'));
  assert.ok(files.includes('content/5-2/1/01/lesson.yaml'));
  assert.ok(files.includes('tests/contract/fixtures/content/5-2/1/05/lesson.yaml'));
  assert.ok(!files.some((f: string) => f.startsWith('node_modules') || f.startsWith('docs/')));
  assert.equal(read('docs', 'CHANGELOG.md').includes('| 1 |'), true);
});
