// 수업 화면 PPTX 의 납품 전 점검 (nalssam-pptx 스킬의 qa.py 를 이 저장소에 맞춘 tests/pptx/qa_pptx.py).
//  - 실제 차시(content/)와 시험용 명세 넷으로 PPTX 를 만들어 python-pptx 로 읽는다
//  - 글꼴은 Pretendard 집안뿐이고 모두 심겨 있다 · 장 밖으로 나간 도형이 없다 · 모든 장에 메모가 있다 · 장 번호의 분모와 차례가 맞다
//  - 일부러 망가뜨린 사본(tamper.py)은 점검이 잡는다: 메모가 빈 장, Pretendard 가 아닌 글꼴, 테마 글꼴로 떨어진 글, 장 밖의 도형, 틀린 분모, 두 자리가 아닌 번호
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '#lib/content.ts';
import { FIXTURES, noChromium, noPython } from '../contract/helpers.ts';

const OUT = path.join(ROOT, '.cache', 'tests', `pptx-qa-${process.pid}`);
const PYTHON = process.env.PYTHON || 'python3';
const HERE = path.join(ROOT, 'tests', 'pptx');
const skip = noPython() || (await noChromium());
after(() => fs.rmSync(OUT, { recursive: true, force: true }));

/** content 폴더의 PPTX 를 모두 만들고 그 파일들을 돌려준다 (초안까지: SHOW_DRAFTS=1) */
function build(content: string, name: string): string[] {
  const dist = path.join(OUT, name);
  const env: NodeJS.ProcessEnv = { ...process.env, CONTENT_DIR: content, SHOW_DRAFTS: '1' };
  delete env.SITE_URL; delete env.DIST_DIR;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'generators', 'pptx', 'build.mjs'), '--out', dist], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `build.mjs 가 실패했습니다:\n${r.stdout}\n${r.stderr}`);
  return (fs.readdirSync(path.join(dist, 'files'), { recursive: true }) as string[])
    .filter((f) => f.endsWith('slides.pptx')).map((f) => path.join(dist, 'files', f)).sort();
}

type Report = Record<string, { slides: number; errors: string[] }>;
const qa = (files: string[]): Report =>
  JSON.parse(execFileSync(PYTHON, [path.join(HERE, 'qa_pptx.py'), ...files], { encoding: 'utf8', maxBuffer: 16 << 20 }));

let real: string[] = [];
let fixtures: string[] = [];
before(() => {
  if (skip) return;
  real = build(path.join(ROOT, 'content'), 'real');
  fixtures = build(FIXTURES, 'fixtures');
});

test('실제 차시와 시험용 명세 넷의 PPTX 가 점검을 통과한다', { skip }, () => {
  assert.ok(real.length >= 1, '실제 차시의 PPTX 가 없습니다');
  assert.equal(fixtures.length, 4);
  const report = qa([...real, ...fixtures]);
  for (const [file, r] of Object.entries(report)) {
    assert.ok(r.slides > 1, file);
    assert.deepEqual(r.errors, [], `${path.relative(OUT, file)}`);
  }
});

test('망가뜨린 PPTX 는 점검이 잡는다 (메모, 글꼴, 장 밖, 장 번호)', { skip }, () => {
  const src = real.find((f) => f.includes(path.join('5-2', '1', '01')))!;
  const cases: [string, RegExp][] = [
    ['notes', /^2장: 메모란이 비어 있음$/],
    ['font', /^2장: Pretendard 가 아닌 글꼴 "Malgun Gothic"\(latin\)/],
    ['theme', /^2장: 글꼴 이름이 없는 글 조각/],
    ['outside', /^3장: 도형이 장 밖으로 나감/],
    ['counter', /분모가 제각각/],
    ['pad', /^3장: 장 번호 "3 \/ \d+" 를 두 자리로 채우지 않음$/],
  ];
  const files = cases.map(([what]) => {
    const dst = path.join(OUT, `tampered-${what}.pptx`);
    execFileSync(PYTHON, [path.join(HERE, 'tamper.py'), src, dst, what]);
    return dst;
  });
  const report = qa(files);
  cases.forEach(([what, want], i) => {
    const errors = report[files[i]].errors;
    assert.ok(errors.some((e) => want.test(e)), `${what}: 점검이 잡지 못했습니다 (${errors.join(' / ') || '오류 없음'})`);
  });
});
