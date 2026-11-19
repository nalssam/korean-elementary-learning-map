// 베끼기 검사 (checks/originality.mjs, docs/CONTRACT.md 13절).
// 비공개 자료 대신 지어낸 자료 폴더를 .cache/tests/ 아래에 만들어 쓴다. 진짜 교과서 글은 시험에도 넣지 않는다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { tempContent } from '../contract/helpers.ts';
import { runNode, scratch } from './helpers.ts';
import { blockedAt, compareFile, normalize, sharedRuns } from '../../checks/originality.mjs';

const t = tempContent('repo-originality');
const STORE = path.join(scratch('store'), 'store');
after(() => { t.cleanup(); fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); });
const ONE = '5-2/1/01';

// 지어낸 자료. 열두 자, 아홉 자가 우리 글과 겹치게 만든다.
const TWELVE = '바람개비가빙글빙글돌아가요'; // 한글 13자
const NINE = '구름사이로해가나왔어요'; // 한글 11자 가운데 9자를 쓴다
function writeStore(extra: Record<string, string> = {}) {
  fs.rmSync(STORE, { recursive: true, force: true });
  const files: Record<string, string> = {
    '5-2/textbook/008.txt': `앞의 글. ${TWELVE.split('').join(' ')}! 뒤의 글.`,
    '5-2/ppt/012.txt': `다른 쪽 ${NINE}`,
    '6-1/textbook/010.txt': '다른 학기의 글 시험용한차시묶음의본보기입니다',
    'README.txt': '형식에 맞지 않는 파일',
    ...extra,
  };
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(STORE, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(STORE, name), text);
  }
}
const guard = (...args: string[]) => runNode('checks/originality.mjs', args, { CONTENT_DIR: t.dir, TEXTBOOK_STORE: STORE });

test('글자 맞추기: 띄어쓰기와 문장부호를 빼고, 한글 글자 수로 센다', () => {
  const ours = normalize('가나, 다라 마바사 아자차 1392 카타').chars;
  const theirs = normalize('(가나다라마바사아자차1392카타)').chars;
  const runs = sharedRuns(ours, theirs);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].hangul, 12); // 숫자는 세지 않는다
  // 빼는 말(단원명·고유 명사)은 같은 곳이 그 자리를 넘어 이어지지 않는다
  const blocked = blockedAt(ours, ['마바사']);
  assert.deepEqual(sharedRuns(ours, theirs, blocked), []);
  assert.deepEqual(sharedRuns(normalize('가나다라마바사').chars, theirs), []); // 7자는 알림도 아니다
});

test('compareFile: 줄 번호와 쪽, 길이만 돌려주고 글은 담지 않는다', () => {
  const text = `첫 줄\n둘째 줄 ${TWELVE.slice(0, 6)}\n${TWELVE.slice(6)} 셋째 줄\n`;
  const found = compareFile(text, [{ kind: 'textbook', page: 8, norm: normalize(TWELVE).chars }], []);
  assert.deepEqual(found, [{ line: 2, lineEnd: 3, page: '교과서 8쪽', hangul: 13, level: 'fail' }]);
});

test('겹친 글은 찍지 않고 "교과서 8쪽과 한글 13자" 처럼 쪽과 길이, 우리 파일의 줄만 찍는다', () => {
  t.reset();
  writeStore();
  t.editText(ONE, (s) => s.replace('# 시험용 가짜 명세입니다.', `# 시험용 가짜 명세입니다. ${TWELVE}`).replace('    title: 오늘 본 것을 말해 봅시다', `    title: ${NINE.slice(0, 9)} 말해 봅시다`));
  const r = guard(ONE);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /^베끼기 검사 · 비공개 자료 3쪽 \(copy-guard@[0-9a-f]{8}\) · 이름이 형식에 맞지 않아 뺀 파일 1개/);
  assert.match(r.out, /고칠 것  lesson\.yaml 1번째 줄: 교과서 8쪽과 한글 13자가 이어서 같습니다/);
  assert.match(r.out, /알림     lesson\.yaml \d+번째 줄: PPT 12쪽과 한글 9자가 이어서 같습니다/);
  // 다른 학기의 자료와는 견주지 않는다
  assert.doesNotMatch(r.out, /10쪽/);
  for (const piece of [TWELVE, NINE, TWELVE.slice(0, 8), NINE.slice(0, 8)]) assert.ok(!r.all.includes(piece), '겹친 글이 찍혔습니다');
  // 실패하면 기록하지 않는다
  assert.equal(guard(ONE, '--record').code, 1);
  assert.equal(c.reviewState(ONE).originality, 'none');
});

test('SVG 그림 안의 글도 본다 (명세의 글 뽑기에는 나오지 않는다)', () => {
  t.reset();
  writeStore();
  const svg = path.join(t.dir, ONE, 'media', 'stone.svg');
  fs.writeFileSync(svg, fs.readFileSync(svg, 'utf8').replace('</svg>', `<text>${TWELVE}</text></svg>`));
  const r = guard(ONE);
  assert.equal(r.code, 1);
  assert.match(r.out, /고칠 것  media\/stone\.svg \d+번째 줄: 교과서 8쪽과 한글 13자/);
});

test('--record: 통과하면 copy-guard@<자료 지문> 으로 기록하고, 그 기록은 지금 내용의 pass 로 읽힌다', () => {
  t.reset();
  writeStore();
  const before = fs.readFileSync(t.file(ONE), 'utf8');
  const r = guard(ONE, '--record');
  assert.equal(r.code, 0, r.all);
  const by = /\((copy-guard@[0-9a-f]{8})\)/.exec(r.out)![1];
  assert.match(r.out, /기록했습니다: reviews 에 originality pass/);
  const after = fs.readFileSync(t.file(ONE), 'utf8');
  // 주석이 남고, 기록은 status 바로 아래에 붙는다
  assert.ok(after.startsWith(before.split('\n').slice(0, 2).join('\n')));
  assert.match(after, new RegExp(`status: draft\\nreviews:\\n  - kind: originality\\n    by: ${by}\\n    date: \\d{4}-\\d{2}-\\d{2}\\n    result: pass\\n    seal: ${c.sealsOf(ONE).lesson}\\n`));
  assert.ok(after.includes('facts: [f1]'), '한 줄 목록의 꼴이 그대로입니다');
  assert.equal(c.reviewState(ONE).originality, 'pass');
  // 자료가 바뀌면 by 의 지문도 바뀐다
  writeStore({ '5-2/guide/001.txt': '더한 자료' });
  assert.notEqual(/\((copy-guard@[0-9a-f]{8})\)/.exec(guard(ONE).out)![1], by);
});

test('--registry --record: 차시표의 originality 에 기록하고 registryOriginality() 가 pass', () => {
  t.reset();
  writeStore();
  const r = guard('--registry', '--record');
  assert.equal(r.code, 0, r.all);
  assert.equal(c.registryOriginality(), 'pass');
  assert.ok(fs.readFileSync(path.join(t.dir, 'registry.yaml'), 'utf8').startsWith('# 시험용 가짜 차시표입니다.'));
});

test('단원명은 겹쳐도 된다 (교과서에서 가져오는 것)', () => {
  t.reset();
  writeStore({ '5-2/textbook/030.txt': '시험용 첫 단원 시험용 첫 단원 시험용 첫 단원' });
  t.editText(ONE, (s) => s.replace('# 시험용 가짜 명세입니다.', '# 시험용 첫 단원 시험용 첫 단원'));
  const r = guard(ONE);
  assert.equal(r.code, 0, r.all);
  assert.doesNotMatch(r.out, /30쪽/);
});

test('TEXTBOOK_STORE 가 없거나 저장소 안에 있으면 멈춘다', () => {
  let r = runNode('checks/originality.mjs', [ONE], { CONTENT_DIR: t.dir });
  assert.equal(r.code, 2);
  assert.match(r.err, /^TEXTBOOK_STORE 가 없습니다/);
  r = runNode('checks/originality.mjs', [ONE], { CONTENT_DIR: t.dir, TEXTBOOK_STORE: path.join(c.ROOT, 'content') });
  assert.equal(r.code, 2);
  assert.match(r.err, /TEXTBOOK_STORE 가 저장소 안에 있습니다/);
  r = guard();
  assert.equal(r.code, 2);
  assert.match(r.err, /검사할 묶음 id 를 적습니다\n\n쓰는 법:/);
});
