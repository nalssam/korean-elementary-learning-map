// 기록 도구: npm run sign (scripts/sign.mjs) 과 사실 대조표 npm run factsheet (scripts/factsheet.mjs), 올리기 전 검사(.githooks/pre-push).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { tempContent } from '../contract/helpers.ts';
import { runNode } from './helpers.ts';
import { targetsOf } from '../../checks/pre-push.mjs';

const t = tempContent('repo-records');
after(() => t.cleanup());
const ONE = '5-2/1/01', TWO = '5-2/1/02-03', REVIEW = '5-2/1/05';
const sign = (...args: string[]) => runNode('scripts/sign.mjs', args, { CONTENT_DIR: t.dir });

test('sign: 검수 기록을 지금 지문과 함께 status 아래에 적고, 주석과 적은 꼴을 그대로 둔다', () => {
  t.reset();
  const before = fs.readFileSync(t.file(ONE), 'utf8');
  let r = sign(ONE, 'voice', '--by', 'ai:다듬기');
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^기록했습니다: 5-2\/1\/01 문장 다듬기\(voice\) pass \(ai:다듬기, \d{4}-\d{2}-\d{2}, 지문 [0-9a-f]{12}\)\n공개까지 남은 것 \d+가지:/);
  r = sign(ONE, 'fact', '--by', '검수자', '--result', 'fix', '--note', '교과서 8쪽, 14자');
  assert.equal(r.code, 0, r.all);
  const after = fs.readFileSync(t.file(ONE), 'utf8');
  // 기록 두 줄이 더해진 것 말고는 한 글자도 바뀌지 않았다
  const added = after.split('\n').filter((l) => !before.split('\n').includes(l));
  assert.deepEqual(added.filter((l) => !/^(reviews:|  - kind: |    (by|date|result|seal|note): )/.test(l)), []);
  assert.deepEqual(c.reviewState(ONE), { fact: 'fix', originality: 'none', voice: 'pass', print: 'none', owner: 'none' });
});

test('sign check: 사실 확인 기록을 그 사실의 checks 에 적고, 둘이 확인하면 공개 조건의 그 줄이 사라진다', () => {
  t.reset();
  for (const by of ['ai:검증자A', 'ai:검증자B']) assert.equal(sign(ONE, 'check', 'f1', '--by', by).code, 0);
  assert.ok(!c.publishGaps(ONE).some((g) => g.startsWith('사실 f1:')));
  assert.ok(c.publishGaps(ONE).some((g) => g.startsWith('사실 f2:')));
  const r = sign(ONE, 'check', 'f2', '--by', 'ai:검증자A', '--verdict', 'disputed', '--note', '출처의 해가 다릅니다');
  assert.equal(r.code, 0, r.all);
  assert.match(fs.readFileSync(t.file(ONE), 'utf8'), /verdict: disputed\n {8}seal: [0-9a-f]{12}\n {8}note: 출처의 해가 다릅니다/);
});

test('sign: 적을 수 없는 기록은 까닭을 말하고 파일을 그대로 둔다', () => {
  t.reset();
  const before = fs.readFileSync(t.file(ONE), 'utf8');
  const refused: [string[], RegExp][] = [
    [[ONE, 'originality', '--by', '날쌤'], /베끼기 검사의 통과 기록은 이 도구로 적지 않습니다\. 비공개 자료가 있는 컴퓨터에서 npm run check:originality -- 5-2\/1\/01 --record 가 적습니다/],
    [[ONE, 'owner', '--by', 'ai:승인'], /날쌤 승인\(owner\)은 사람만 적습니다/],
    [[ONE, 'voice', '--by', 'teacher@school.kr'], /이메일 주소를 적지 않습니다/],
    [[ONE, 'voice', '--by', 'copy-guard@1a2b3c4d'], /베끼기 검사 도구만 쓰는 이름/],
    [[ONE, 'voice', '--by', '한빛초등학교 김교사'], /학교·기관 이름을 적지 않습니다/],
    [[ONE, 'voice'], /--by 에 기록하는 이의 이름/],
    [[ONE, 'check', 'f9', '--by', 'x'], /5-2\/1\/01 에 사실 f9 가 없습니다 \(있는 사실: f1, f2\)/],
    [[REVIEW, 'check', '01/f1', '--by', 'x'], /01\/f1 는 앞 묶음의 사실입니다/],
    [[ONE, 'voice', '--by', 'x', '--result', 'ok'], /--result 는 pass 또는 fix 입니다/],
    [['5-2/1/09', 'voice', '--by', 'x'], /5-2\/1\/09 묶음의 명세가 없습니다/],
  ];
  for (const [args, message] of refused) {
    const r = sign(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message, args.join(' '));
  }
  assert.equal(fs.readFileSync(t.file(ONE), 'utf8'), before);
  // 철자가 틀린 선택은 말없이 버리지 않는다 (--reslt fix 가 pass 로 적히면 안 된다)
  const r = sign(ONE, 'voice', '--by', 'x', '--reslt', 'fix');
  assert.match(r.err, /^모르는 선택입니다: --reslt\n\n쓰는 법 · 검수 기록\n/);
  assert.equal(fs.readFileSync(t.file(ONE), 'utf8'), before);
});

test('sign check: 사실 여럿이나 --all 을 한 번에 적는다', () => {
  t.reset();
  let r = sign(ONE, 'check', 'f1', 'f2', '--by', 'ai:검증자A');
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^기록했습니다: 5-2\/1\/01 사실 f1 confirmed .*\n기록했습니다: 5-2\/1\/01 사실 f2 confirmed /);
  const lesson = c.parseLessonText(fs.readFileSync(t.file(ONE), 'utf8'));
  assert.deepEqual(lesson.facts.map((f) => f.checks.map((x) => x.by)), [['ai:검증자A'], ['ai:검증자A']]);
  r = sign(ONE, 'check', '--all', '--by', 'ai:검증자B');
  assert.equal(r.code, 0, r.all);
  assert.ok(!c.publishGaps(ONE).some((g) => /확인한 이가/.test(g)), '두 사람이 모든 사실을 확인했습니다');
  // 하나라도 틀린 id 가 있으면 아무것도 적지 않는다
  const before = fs.readFileSync(t.file(ONE), 'utf8');
  r = sign(ONE, 'check', 'f1', 'f9', '--by', 'ai:검증자C');
  assert.equal(r.code, 2);
  assert.match(r.err, /사실 f9 가 없습니다/);
  assert.equal(fs.readFileSync(t.file(ONE), 'utf8'), before);
});

test('sign: 이미 적힌 이름과 같은 사람으로 세는 다른 철자는 받지 않는다', () => {
  t.reset();
  assert.equal(sign(ONE, 'check', 'f1', '--by', 'ai:검증자A').code, 0);
  const before = fs.readFileSync(t.file(ONE), 'utf8');
  for (const by of ['AI:검증자a', 'ai: 검증자A', 'ai:검증자\u200bA']) {
    const r = sign(ONE, 'check', 'f2', '--by', by);
    assert.equal(r.code, 2, by);
    assert.match(r.err, /같은 사람으로 세는 이름이 다른 철자로 적혀 있습니다: "ai:검증자A"/);
  }
  assert.equal(fs.readFileSync(t.file(ONE), 'utf8'), before);
  // 똑같은 철자는 받는다
  assert.equal(sign(ONE, 'check', 'f2', '--by', 'ai:검증자A').code, 0);
});

test('sign: 쓰는 법은 틀린 갈래의 것만 보여 준다', () => {
  t.reset();
  let r = sign(ONE, 'check', '--by', 'x');
  assert.equal(r.code, 2);
  assert.match(r.err, /^확인한 사실의 id 를 적습니다[^\n]*\n\n쓰는 법 · 사실 확인\n/);
  assert.doesNotMatch(r.err, /쓰는 법 · 검수 기록/);
  r = sign(ONE, 'voice', 'f1', '--by', 'x');
  assert.match(r.err, /^모르는 인자입니다: f1\n\n쓰는 법 · 검수 기록\n/);
  assert.doesNotMatch(r.err, /쓰는 법 · 사실 확인/);
  r = sign(ONE, 'vioce', '--by', 'x');
  assert.match(r.err, /쓰는 법 · 검수 기록[\s\S]*쓰는 법 · 사실 확인/);
  r = sign(ONE, 'check', 'f1', '--all', '--by', 'x');
  assert.match(r.err, /^사실 id 와 --all 을 함께 쓰지 않습니다/);
});

test('sign: 명세에 형식 오류가 있으면 무엇을 고칠지 보여 주고 적지 않는다', () => {
  t.reset();
  t.editText(TWO, (s) => s.replace('status: draft', 'status: 초안'));
  const r = sign(TWO, 'voice', '--by', 'x');
  assert.equal(r.code, 2);
  assert.match(r.err, /명세에 고칠 곳이 있어 기록하지 않습니다. 먼저 고칩니다:\n  - \d+번째 줄 · status: 쓸 수 없는 값입니다/);
});

test('factsheet: 아이와 교사가 읽는 글이 표에 빠짐없이 오르고, 정답과 가리킨 사실 없음이 찍힌다', () => {
  t.reset();
  for (const id of [ONE, TWO, REVIEW]) {
    const r = runNode('scripts/factsheet.mjs', [id], { CONTENT_DIR: t.dir });
    assert.equal(r.code, 0, r.all);
    const lesson = c.loadLesson(id);
    const flat = r.out.replace(/\s*\n\s*/g, ' ');
    for (const s of [...c.childStrings(lesson), ...c.teacherStrings(lesson)]) {
      if (/\.credit\.|^facts\[\d+\]\.sources/.test(s.path)) continue; // 대조의 기준은 사실 칸에 따로 찍는다
      assert.ok(flat.includes(s.text.replace(/\s*\n\s*/g, ' ')), `${id} ${s.path} 가 표에 없습니다`);
    }
    assert.match(r.out, /## 가리킨 사실 없음 \(\d+곳\)/);
    for (const q of lesson.quiz.items) assert.ok(r.out.includes(`정답: ${c.answerText(q)}`));
  }
  const r = runNode('scripts/factsheet.mjs', [REVIEW], { CONTENT_DIR: t.dir });
  assert.match(r.out, /### 01\/f1 \(5-2\/1\/01 의 사실\)/);
});

test('pre-push: TEXTBOOK_STORE 가 없으면 한 줄을 찍고 0 으로 끝난다 (다른 것은 돌리지 않는다)', () => {
  const hook = path.join(c.ROOT, '.githooks', 'pre-push');
  assert.ok((fs.statSync(hook).mode & 0o111) !== 0, '실행할 수 있어야 합니다');
  const env = { ...process.env };
  delete env.TEXTBOOK_STORE;
  const r = spawnSync('sh', [hook, 'origin', 'https://example.org/x.git'], { cwd: path.dirname(c.ROOT), env, input: 'refs/heads/a 1111 refs/heads/a 2222\n', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '베끼기 검사를 건너뜁니다 (비공개 자료가 없습니다). 기록은 날쌤이 PR 에서 적습니다\n');
});

test('pre-push: 작업 폴더가 올리는 커밋과 다르면(커밋하지 않은 고침, 다른 가지) 멈춘다', () => {
  t.reset();
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=시험', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args], { cwd: t.dir, stdio: 'pipe' }).toString().trim();
  const store = path.join(path.dirname(t.dir), 'store');
  fs.mkdirSync(store, { recursive: true });
  try {
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', '처음');
    const head = git('rev-parse', 'HEAD');
    const push = (local: string) => runNode('checks/pre-push.mjs', [], { CONTENT_DIR: t.dir, TEXTBOOK_STORE: store }, { input: `refs/heads/main ${local} refs/heads/main ${'0'.repeat(40)}\n` });
    // 커밋하지 않은 고침
    t.editText(ONE, (s) => s.replace('title: 시험용 한 차시', 'title: 고쳤지만 커밋하지 않은 차시'));
    let r = push(head);
    assert.equal(r.code, 1, r.all);
    assert.match(r.err, /^올리기를 멈췄습니다\. 작업 폴더가 올리는 커밋과 달라 베끼기 검사를 믿을 수 없습니다\.\n  - 커밋하지 않은 고침이 있습니다 \(5-2\/1\/01\/lesson\.yaml\)/);
    // 다른 커밋을 올린다
    git('add', '-A'); git('commit', '-q', '-m', '고침');
    r = push(head);
    assert.equal(r.code, 1, r.all);
    assert.match(r.err, /올리는 가지\(refs\/heads\/main\)가 지금 꺼낸 커밋\(HEAD\)이 아닙니다/);
  } finally {
    fs.rmSync(path.join(t.dir, '.git'), { recursive: true, force: true });
    fs.rmSync(store, { recursive: true, force: true });
  }
});

test('pre-push: 바뀐 파일에서 다시 검사할 묶음과 차시표를 고른다', () => {
  t.reset();
  const content = path.relative(c.ROOT, t.dir).split(path.sep).join('/');
  const p = 'lessons/';
  const files = [
    `${p}${content}/5-2/1/01/lesson.yaml`, `${p}${content}/5-2/1/02-03/media/map.svg`, `${p}${content}/5-2/1/02-03/media/sample.png`,
    `${p}${content}/registry.yaml`, `${p}${content}/5-2/1/09/lesson.yaml`, 'ontology/x.json', `${p}README.md`,
  ];
  assert.deepEqual(targetsOf(files, p), { ids: [ONE, TWO], registry: true });
  assert.deepEqual(targetsOf([`${p}${content}/5-2/1/02-03/media/sample.png`], p), { ids: [], registry: false });
});
