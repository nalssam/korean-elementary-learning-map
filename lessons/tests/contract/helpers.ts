// 계약 시험이 같이 쓰는 도우미. (*.test.ts 가 아니라서 시험으로 돌지 않는다.)
//
// 시험용 가짜 명세는 tests/contract/fixtures/content 에 있다. content/ 밖이라 실제 차시로 읽히지 않는다.
// 로더는 환경 변수 CONTENT_DIR 이 가리키는 폴더를 읽는다. 명세를 고쳐 보는 시험은 .cache/tests/ 아래에 복사본을 만들어 쓴다.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, SpecError } from '#lib/content.ts';
import { REVIEW_KINDS } from '#schema/lesson.ts';

export const FIXTURES = path.join(ROOT, 'tests', 'contract', 'fixtures', 'content');

type Raw = Record<string, any>;

/** 시험용 명세의 복사본을 만들고 로더가 그것을 읽게 한다. 돌려주는 값으로 명세를 고치고, 끝나면 지운다. */
export function tempContent(name: string) {
  const dir = path.join(ROOT, '.cache', 'tests', `${name}-${process.pid}`, 'content');
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  fs.cpSync(FIXTURES, dir, { recursive: true });
  process.env.CONTENT_DIR = dir;
  const file = (id: string) => path.join(dir, ...id.split('/'), 'lesson.yaml');
  // 같은 시각에 두 번 고쳐도 로더가 알아차리도록 고친 시각을 조금씩 앞으로 민다
  let tick = Date.now() / 1000;
  const touch = (f: string) => { tick += 2; fs.utimesSync(f, tick, tick); };
  return {
    dir,
    file,
    /** 명세를 읽은 그대로의 값 */
    read: (id: string): Raw => YAML.parse(fs.readFileSync(file(id), 'utf8')),
    /** 명세를 고쳐 쓴다 */
    edit(id: string, change: (raw: Raw) => void) {
      const raw = YAML.parse(fs.readFileSync(file(id), 'utf8'));
      change(raw);
      fs.writeFileSync(file(id), YAML.stringify(raw));
      touch(file(id));
    },
    /** 차시표를 고쳐 쓴다 */
    editRegistry(change: (raw: Raw) => void) {
      const f = path.join(dir, 'registry.yaml');
      const raw = YAML.parse(fs.readFileSync(f, 'utf8'));
      change(raw);
      fs.writeFileSync(f, YAML.stringify(raw));
      touch(f);
    },
    /** 글자 그대로 고쳐 쓴다 (YAML 문법 오류를 만들 때) */
    editText(id: string, change: (text: string) => string) {
      fs.writeFileSync(file(id), change(fs.readFileSync(file(id), 'utf8')));
      touch(file(id));
    },
    touch: (f: string) => touch(f),
    /** 처음 상태로 되돌린다 */
    reset() {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.cpSync(FIXTURES, dir, { recursive: true });
      for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isFile()) touch(p);
      }
    },
    cleanup() {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    },
  };
}

/** 베끼기 검사 도구(checks/originality.mjs)가 통과 기록에 적는 이름. 시험에서는 지어낸 값을 쓴다. */
export const GUARD = 'copy-guard@1a2b3c4d';

/** 지금 내용의 지문으로 적은 검수 통과 기록 다섯 줄 (`npm run sign` 과 `npm run check:originality` 가 적는 꼴) */
export const passRows = (seal: string, owner = '날쌤') =>
  REVIEW_KINDS.map((kind) => ({ kind, by: kind === 'owner' ? owner : kind === 'originality' ? GUARD : `ai:${kind}`, date: '2026-11-20', result: 'pass', seal }));

/** fn 이 SpecError 를 던지고, 그 문구에 fragments 가 모두 들어 있는지 본다. 문구를 돌려준다. */
export function failsWith(fn: () => unknown, ...fragments: string[]): string {
  let message = '';
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof SpecError, `SpecError 가 아닌 오류: ${(e as Error).stack}`);
    message = e.message;
  }
  assert.notEqual(message, '', '오류가 나야 하는데 통과했습니다');
  for (const f of fragments) assert.ok(message.includes(f), `오류 문구에 "${f}" 가 없습니다:\n${message}`);
  return message;
}

/** 시험용 명세 하나를 읽은 그대로의 값으로 (고쳐도 원본은 그대로다) */
export function fixtureRaw(id: string): Raw {
  return YAML.parse(fs.readFileSync(path.join(FIXTURES, ...id.split('/'), 'lesson.yaml'), 'utf8'));
}
export function fixtureText(id: string): string {
  return fs.readFileSync(path.join(FIXTURES, ...id.split('/'), 'lesson.yaml'), 'utf8');
}
export const toYaml = (raw: unknown) => YAML.stringify(raw);

// ───────────── 사이트를 빌드해 보는 시험 (다른 담당의 시험도 가져다 쓸 수 있다) ─────────────

/**
 * astro build 로 사이트를 out 에 만든다. out 은 .cache/tests/<이름>-<pid>/ 아래에 잡는다 (dist/ 와 public/ 에 쓰지 않는다. docs/CONTRACT.md 16절).
 * root 를 주지 않으면 저장소의 사이트(src/pages)를 빌드한다. 환경 변수는 env 에 준 것만 넘어간다 (시험을 돌린 쪽의 SHOW_DRAFTS·SITE_URL 이 섞이지 않게).
 * 그림은 들어 있지 않다. 그림까지 보려면 같은 env 로 `node scripts/sync-media.mjs --out <out>` 을 이어서 돌린다 (10절).
 */
export function buildSite(out: string, env: Record<string, string>, { root = ROOT, extra = [] as string[] } = {}): string {
  const clean = { ...process.env };
  for (const k of ['SHOW_DRAFTS', 'SITE_URL', 'SITE_BASE', 'CONTENT_DIR', 'DIST_DIR', 'NODE_TEST_CONTEXT']) delete clean[k];
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build', '--root', root, '--outDir', out, '--silent', ...extra],
      { cwd: ROOT, env: { ...clean, ...env }, stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    assert.fail(`astro build 가 실패했습니다:\n${err.stdout}\n${err.stderr}`);
  }
  return out;
}

// Chromium 이나 python-pptx 가 필요한 시험은 그것을 쓸 수 없는 컴퓨터에서 실패하지 않고 까닭을 적어 건너뛴다 (docs/CONTRACT.md 16절).
// 내용만 고치는 사람은 둘 다 없이 `npm test` 를 돌린다. CI 는 둘 다 깔고 돌린다.
//   const skip = await noChromium();
//   test('인쇄 페이지를 찍어 본다', { skip }, async () => { … });

/** Chromium 을 띄울 수 없으면 건너뛰는 까닭을, 띄울 수 있으면 false 를 준다. 환경 변수 CHROMIUM_PATH 가 있으면 그 파일을 쓴다. */
export async function noChromium(): Promise<string | false> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    await browser.close();
    return false;
  } catch (e) {
    return `Chromium 을 띄울 수 없어 건너뜁니다 (npx playwright install chromium 으로 깔거나 CHROMIUM_PATH 로 가리킵니다): ${String((e as Error).message).split('\n')[0]}`;
  }
}

/** python-pptx 를 쓸 수 없으면 건너뛰는 까닭을, 쓸 수 있으면 false 를 준다. Python 은 환경 변수 PYTHON, 없으면 python3 이다 (생성기와 같다). */
export function noPython(): string | false {
  const python = process.env.PYTHON || 'python3';
  const r = spawnSync(python, ['-c', 'import pptx'], { stdio: 'ignore' });
  if (r.error) return `Python 을 실행할 수 없어 건너뜁니다 (${python}). PYTHON 으로 python-pptx 가 깔린 Python 을 가리킵니다`;
  if (r.status !== 0) return `python-pptx 가 없어 건너뜁니다 (${python} -m pip install -r generators/pptx/requirements.txt 로 깔거나, PYTHON 으로 python-pptx 가 깔린 Python 을 가리킵니다)`;
  return false;
}
