// npm run new -- <id> (scripts/new.mjs, docs/CONTRACT.md 10절 '새 묶음', R56).
// 시험용 명세의 복사본(.cache/tests/)에 새 묶음을 만들어 본다. 실제 content/ 에는 쓰지 않는다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { tempContent } from '../contract/helpers.ts';
import { runNode } from './helpers.ts';

const t = tempContent('repo-new');
after(() => t.cleanup());
const make = (...args: string[]) => runNode('scripts/new.mjs', args, { CONTENT_DIR: t.dir });
/** content 폴더 아래 파일 전부 (아무것도 쓰지 않았는지 볼 때) */
const files = () => (fs.readdirSync(t.dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(t.dir, f)).isFile()).sort();
const TEMPLATE = fs.readFileSync(path.join(c.ROOT, 'docs', 'template', 'lesson.yaml'), 'utf8');

test('차시표에 있는 묶음이면 본보기를 그림과 함께 복사하고 id·status 와 맨 위 주석만 바꾼다', () => {
  const r = make('5-2/2/01');
  assert.equal(r.code, 0, r.all);
  const file = t.file('5-2/2/01');
  const text = fs.readFileSync(file, 'utf8');
  // 맨 위 한 줄은 차시표의 값이고, 그 아래는 본보기 그대로다 (id 와 status 줄만 다르다)
  const [first, ...rest] = text.split('\n');
  assert.equal(first, '# 5학년 2학기 2단원 「시험용 둘째 단원」 · 1차시 · 교과서 24~27쪽. 차시표에서 옮겨 적은 주석이고 명세의 칸이 아닙니다.');
  const changed = rest.map((l, i) => [l, TEMPLATE.split('\n')[i]]).filter(([a, b]) => a !== b).map(([a]) => a);
  assert.deepEqual(changed, ['id: 5-2/2/01']);
  assert.match(text, /^status: draft$/m);
  for (const f of fs.readdirSync(path.join(c.ROOT, 'docs', 'template', 'media'))) assert.ok(fs.existsSync(path.join(path.dirname(file), 'media', f)), f);

  // 형식에 맞고, 검사에는 초안의 알림만 나온다
  process.env.CONTENT_DIR = t.dir;
  const lesson = c.loadLesson('5-2/2/01');
  assert.equal(lesson.id, '5-2/2/01');
  assert.equal(lesson.status, 'draft');
  const check = runNode('checks/run.mjs', [], { CONTENT_DIR: t.dir });
  assert.equal(check.code, 0, check.all);
  const block = check.out.slice(check.out.indexOf('5-2/2/01  '));
  const own = block.slice(0, block.indexOf('\n\n'));
  assert.match(own, /^5-2\/2\/01  .*\(초안\)$/m);
  assert.doesNotMatch(own, /고칠 것/);
  for (const line of own.split('\n').slice(1)) assert.match(line, /^  알림     검수 기록 /, line);

  // 찍는 할 일: 사실 대조표, 검수 넷, 두 확인자, 업데이트 소식, 날쌤 승인
  assert.match(r.out, /^만들었습니다: .*5-2\/2\/01\/lesson\.yaml$/m);
  for (const s of ['npm run check', 'npm run factsheet -- 5-2/2/01', '(fact)', '(originality)', '(voice)', '(print)', '서로 다른 두 확인자', 'content/updates.yaml', 'lessons: ["5-2/2/01"]', '날쌤']) {
    assert.ok(r.out.includes(s), `할 일에 "${s}" 가 없습니다:\n${r.out}`);
  }
});

test('이미 있는 묶음, 차시표에 없는 id, 폴더 밖을 가리키는 id 는 아무것도 쓰지 않고 멈춘다', () => {
  t.reset();
  const before = files();
  const cases: [string[], RegExp][] = [
    [['5-2/1/01'], /이미 있습니다/],
    [['5-2/1/09'], /차시표\(.*\)에 5-2\/1\/09 가 없습니다\. 이 단원의 묶음: 5-2\/1\/01, 5-2\/1\/02-03, 5-2\/1\/04, 5-2\/1\/05\./],
    [['3-1/1/01'], /3학년 1학기는 아직 차시표가 없습니다/],
    [['../../escape'], /묶음 id 꼴이 아닙니다/],
    [['5-2/1/../../../x'], /묶음 id 꼴이 아닙니다/],
  ];
  for (const [args, re] of cases) {
    const r = make(...args);
    assert.equal(r.code, 1, `${args}: ${r.all}`);
    assert.match(r.err, re, args.join(' '));
    assert.deepEqual(files(), before, `${args}: 무엇인가 썼습니다`);
  }
  // 쓰는 법을 틀리면 2
  for (const args of [[], ['5-2/2/01', '5-2/1/04'], ['--force', '5-2/2/01']]) {
    const r = make(...args);
    assert.equal(r.code, 2, `${args}: ${r.all}`);
    assert.match(r.err, /쓰는 법: npm run new -- <묶음 id>/);
  }
  assert.deepEqual(files(), before);
});

test('이름을 잘못 적은 명세나 본보기와 이름이 같은 다른 그림이 있으면 덮어쓰지 않고 멈춘다', () => {
  t.reset();
  const dir = path.join(t.dir, '5-2', '2', '01');
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lesson.yml'), 'id: 5-2/2/01\n');
  let r = make('5-2/2/01');
  assert.equal(r.code, 1, r.all);
  assert.match(r.err, /명세로 보이는 파일이 있습니다 \(lesson\.yml\)/);
  assert.ok(!fs.existsSync(path.join(dir, 'lesson.yaml')));

  fs.rmSync(path.join(dir, 'lesson.yml'));
  fs.writeFileSync(path.join(dir, 'media', 'example-photo.jpg'), 'my own photo');
  r = make('5-2/2/01');
  assert.equal(r.code, 1, r.all);
  assert.match(r.err, /본보기 그림과 이름이 같은 다른 파일이 있습니다 \(example-photo\.jpg\)/);
  assert.equal(fs.readFileSync(path.join(dir, 'media', 'example-photo.jpg'), 'utf8'), 'my own photo');
  assert.ok(!fs.existsSync(path.join(dir, 'lesson.yaml')));
  assert.ok(!fs.existsSync(path.join(dir, 'media', 'example-diagram.svg')));
});

test('package.json 의 new 는 이 스크립트를 부른다', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(c.ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.new, 'node scripts/new.mjs');
});
