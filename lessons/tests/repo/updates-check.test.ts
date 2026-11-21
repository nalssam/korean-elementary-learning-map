// npm run check 가 업데이트 소식(content/updates.yaml)을 본다 (docs/CONTRACT.md 11절 '형식'·'표현', R49).
// 시험용 명세의 복사본(.cache/tests/)에서 소식을 일부러 틀리게 적어 본다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempContent } from '../contract/helpers.ts';
import { runNode } from './helpers.ts';

const t = tempContent('repo-updates-check');
after(() => t.cleanup());
const file = path.join(t.dir, 'updates.yaml');
const check = () => runNode('checks/run.mjs', [], { CONTENT_DIR: t.dir });
const append = (yaml: string) => fs.appendFileSync(file, `\n${yaml}`);

test('멀쩡한 소식은 검사 결과에 나오지 않는다', () => {
  const r = check();
  assert.equal(r.code, 0, r.all);
  assert.doesNotMatch(r.out, /업데이트 소식/);
  // 명세의 수에 소식 파일을 세지 않는다
  assert.match(r.out, /명세 4개 · /);
});

test('달력에 없는 날짜, 모르는 갈래, 차시표에 없는 묶음은 형식에서 걸린다', () => {
  t.reset();
  append('- date: "2026-02-30"\n  kind: new\n  title: 날짜가 틀린 소식\n');
  let r = check();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /업데이트 소식 \(.*updates\.yaml\)\n  고칠 것  형식 +\d+번째 줄 · \d+번째 · date: 달력에 없는 날짜입니다/);

  t.reset();
  append('- date: "2026-11-05"\n  kind: news\n  title: 갈래가 틀린 소식\n');
  r = check();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /고칠 것  형식 +\d+번째 줄 · \d+번째 · kind: kind 에는 new\(새 자료\), fix\(고침\), notice\(알림\) 가운데 하나를 씁니다/);

  t.reset();
  append('- date: "2026-11-05"\n  kind: new\n  title: 없는 묶음의 소식\n  lessons: ["5-2/9/01"]\n');
  r = check();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /lessons: 차시표\(registry\.yaml\)에 없는 묶음 id 입니다: 5-2\/9\/01/);
});

test('소식의 제목과 덧붙이는 말도 표현 검사를 받는다 (금지 표현은 실패, 곧은 따옴표는 알림)', () => {
  t.reset();
  append('- date: "2026-11-05"\n  kind: notice\n  title: 다양한 자료를 "새로" 올렸습니다\n  body: 수업 화면을 유튜브로도 볼 수 있습니다.\n');
  const r = check();
  assert.equal(r.code, 1, r.all);
  const lines = r.out.split('\n');
  const has = (re: RegExp) => assert.ok(lines.some((l) => re.test(l)), `${re} 가 없습니다:\n${r.out}`);
  has(/^  고칠 것  표현 +\d+번째 줄 · \d+번째 소식\(2026-11-05\) · title: "다양한" 대신 무엇이 있는지 몇 가지를 직접 씁니다$/);
  has(/^  고칠 것  표현 +\d+번째 줄 · \d+번째 소식\(2026-11-05\) · body: 다른 회사의 서비스 이름\("유튜브"\)을 쓰지 않습니다/);
  has(/^  알림 +표현 +\d+번째 줄 · \d+번째 소식\(2026-11-05\) · title: 곧은 따옴표\("\)를 “ ” 로 바꿉니다: 다양한 자료를 “새로” 올렸습니다$/);
});
