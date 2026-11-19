// 저장소 설정: 함께 쓰는 패키지를 형식과 함께 쓸 수 있는지, 줄 끝과 올리기 전 검사가 어느 컴퓨터에서나 같게 잡혀 있는지 본다.
// 이 파일이 가져오는 패키지에 형식 선언이 빠지면 `npm run typecheck` 가 실패한다 (담당이 제 폴더에 `declare module` 을 적어 넣지 않게).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import * as c from '#lib/content.ts';
import { ASSET_ROUTE } from '#lib/site.ts';
import { noChromium, noPython } from './helpers.ts';

test('QR 코드: qrcode 패키지로 종이에 박을 주소를 그림으로 만든다', async () => {
  const saved = { ...process.env };
  try {
    process.env.SITE_URL = 'https://example.org'; process.env.SITE_BASE = '/social';
    const url = c.absoluteUrl(c.lessonRoute('5-2/1/01', ASSET_ROUTE.quiz));
    assert.equal(url, 'https://example.org/social/5-2/1/01/quiz/');
    // <img> 로 실을 수 있는 꼴 (SVG 를 본문에 끼워 넣지 않는다)
    const png: string = await QRCode.toDataURL(url, { margin: 0, errorCorrectionLevel: 'M' });
    assert.match(png, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  } finally {
    for (const k of ['SITE_URL', 'SITE_BASE']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

test('올리기 전 검사(.githooks)는 npm ci 가 켠다', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(c.ROOT, 'package.json'), 'utf8'));
  // git 저장소가 아닌 곳(내려받은 압축 파일)에서도 npm ci 가 멈추지 않아야 한다. `|| exit 0` 은 sh 와 Windows 의 cmd 에서 모두 된다.
  // 학습 지도 저장소 전체의 설정이라, 누가 이미 정해 둔 core.hooksPath 는 덮어쓰지 않는다 (있으면 첫 명령이 그 값을 찍고 성공한다).
  // 출력을 /dev/null 로 버리지 않는 것은 Windows 의 cmd 에 그 자리가 없어서다 (버리려다 실패하면 덮어쓴다).
  assert.equal(pkg.scripts.prepare, 'git config core.hooksPath || git config core.hooksPath lessons/.githooks || exit 0');
  const sh = (dir: string, cmd: string) => execSync(cmd, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'));
  try {
    sh(dir, 'git init -q');
    sh(dir, pkg.scripts.prepare);
    assert.equal(sh(dir, 'git config core.hooksPath').trim(), 'lessons/.githooks');
    sh(dir, 'git config core.hooksPath .husky');
    sh(dir, pkg.scripts.prepare);
    assert.equal(sh(dir, 'git config core.hooksPath').trim(), '.husky');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(pkg.devDependencies['@types/qrcode']);
});

test('줄 끝은 어느 컴퓨터에서나 LF (.gitattributes)', () => {
  const lines = fs.readFileSync(path.join(c.ROOT, '.gitattributes'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes('* text=auto eol=lf'));
  for (const ext of ['png', 'jpg', 'pdf', 'pptx']) assert.ok(lines.includes(`*.${ext} binary`), ext);
});

test('Chromium 이나 python-pptx 가 없으면 그것이 필요한 시험은 까닭을 적어 건너뛴다', async () => {
  const saved = { PYTHON: process.env.PYTHON, CHROMIUM_PATH: process.env.CHROMIUM_PATH };
  try {
    // 없는 Python
    process.env.PYTHON = path.join(c.ROOT, '.cache', 'no-such-python');
    assert.match(String(noPython()), /^Python 을 실행할 수 없어 건너뜁니다 \(.+no-such-python\)\. PYTHON 으로 python-pptx 가 깔린 Python 을 가리킵니다$/);
    // 실행은 되지만 python-pptx 를 가져오지 못하는 것 (여기서는 node 를 대신 세운다. `node -c "import pptx"` 는 0 이 아닌 값으로 끝난다)
    process.env.PYTHON = process.execPath;
    assert.match(String(noPython()), /^python-pptx 가 없어 건너뜁니다 \(.+ -m pip install -r generators\/pptx\/requirements\.txt 로 깔거나/);
    // 없는 Chromium
    process.env.CHROMIUM_PATH = path.join(c.ROOT, '.cache', 'no-such-chromium');
    assert.match(String(await noChromium()), /^Chromium 을 띄울 수 없어 건너뜁니다 \(npx playwright install chromium 으로 깔거나 CHROMIUM_PATH 로 가리킵니다\)/);
    // 건너뛰는 까닭은 node:test 의 skip 에 그대로 넣는 글이거나 false 다
    delete process.env.CHROMIUM_PATH;
    const real = await noChromium();
    assert.ok(real === false || typeof real === 'string');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('만들어진 것은 저장소에 넣지 않는다 (.gitignore)', () => {
  const lines = fs.readFileSync(path.join(c.ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
  for (const dir of ['dist/', '.astro/', '.cache/', 'node_modules/']) assert.ok(lines.includes(dir), dir);
  // 그림은 빌드 뒤에 dist/media/ 로 바로 복사한다. public/ 은 쓰지 않으므로 가릴 것도 없다 (docs/CONTRACT.md 10절)
  assert.ok(!lines.some((l) => l.startsWith('public')));
  assert.ok(!fs.existsSync(path.join(c.ROOT, 'public', 'media')), 'public/media/ 가 남아 있습니다. 지웁니다 (그림은 dist/media/ 로 복사합니다)');
});
