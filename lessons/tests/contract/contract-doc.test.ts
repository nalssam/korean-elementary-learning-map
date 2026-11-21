// 계약서(docs/CONTRACT.md)와 계약 파일이 어긋나지 않는지 본다.
// 담당 여섯이 계약서만 읽고 만든다. 계약서에 적힌 이름이 코드에 없거나, 코드에 있는 도우미가 계약서에 없으면 저마다 다르게 짐작한다.
// 문장을 통째로 견주지 않고, 담당 사이에 걸리는 이름(함수, 인자, 환경 변수, 조건의 번호)만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as checks from '#lib/checks.ts';
import * as c from '#lib/content.ts';
import * as seal from '#lib/seal.ts';
import * as site from '#lib/site.ts';
import * as url from '#src/lib/url.ts';
import { STORAGE_KEY } from '#src/components/site/collect.ts';

const read = (file: string) => fs.readFileSync(path.join(c.ROOT, file), 'utf8');
const doc = read('docs/CONTRACT.md');
/** "## 7. 인쇄물" 처럼 번호로 시작하는 절 하나 */
const section = (no: number) => {
  const start = doc.indexOf(`\n## ${no}. `);
  assert.ok(start >= 0, `${no}절이 없습니다`);
  const end = doc.indexOf('\n## ', start + 1);
  return doc.slice(start, end < 0 ? undefined : end);
};
/** 표에서 첫 칸이 name 인 줄 */
const row = (text: string, name: string) => {
  const line = text.split('\n').find((l) => l.startsWith(`| ${name} |`));
  assert.ok(line, `표에 "${name}" 줄이 없습니다`);
  return line;
};
const named = (name: string) => new RegExp('`[^`\\n]*\\b' + name + '\\b[^`\\n]*`').test(doc);

test('4절의 표에 적힌 도우미는 모두 있고, 내보내는 도우미는 모두 계약서에 적혀 있다', () => {
  const exported = { ...url, ...seal, ...site, ...checks, ...c } as Record<string, unknown>;
  // 표에 `이름(` 꼴로 적힌 것
  const table = section(4).split('\n').filter((l) => l.startsWith('| '));
  const inTable = [...table.join('\n').matchAll(/`([A-Za-z]\w*)\(/g)].map((m) => m[1]);
  assert.ok(inTable.length > 60, `표에서 찾은 이름이 ${inTable.length}개뿐입니다`);
  for (const name of inTable) assert.equal(typeof exported[name], 'function', `4절의 표에 적힌 ${name}() 가 lib 에 없습니다`);
  // 거꾸로: 계약서 어디에도 이름이 없는 것. 아래 목록(다른 도우미가 안에서 쓰는 것)과 같아야 한다.
  // 새 도우미를 더하면 계약서에 적거나, 담당이 쓸 일이 없는 것이면 까닭과 함께 여기에 적는다.
  const internal = [
    'MEDIA_KIND_LABEL', // creditShort()·creditFull() 이 쓴다. 출처 표시는 그 둘로만 만든다
    'factSeal', 'fileSeal', 'lessonSeal', // sealsOf() 가 쓴다. 지문은 sealsOf()·registrySeal() 로만 얻는다
    'licenceName', // creditShort()·creditFull() 이 쓴다
    'numbersIn', // factIssues() 가 쓴다
    'parseSpecText', // loadLesson()·loadRegistry()·parseLessonText() 가 쓴다
  ];
  assert.deepEqual(Object.keys(exported).filter((name) => !named(name)).sort(), internal);
  // 이번에 표에 더한 것들
  for (const name of ['loadRegistry', 'lessonFile', 'lessonDir', 'contentDir', 'distDir', 'cacheDir', 'factBoxes']) assert.ok(inTable.includes(name), `4절의 표에 ${name}() 가 없습니다`);
});

test('package.json 의 스크립트는 모두 10절에 적혀 있다', () => {
  const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
  const build = section(10) + section(13);
  for (const name of scripts) {
    if (name === 'prepare') { assert.ok(section(13).includes('`prepare`'), 'prepare'); continue; }
    assert.ok(build.includes(name === 'test' ? 'npm test' : `npm run ${name}`), `10절에 npm run ${name} 이 없습니다`);
  }
});

test('빌드의 차례와 자리: 그림은 astro build 뒤에 dist 로, 자리는 --out 과 DIST_DIR, public/ 은 쓰지 않는다', () => {
  const build = section(10);
  const steps = [...build.matchAll(/^  (\d)\. (.+)$/gm)].map((m) => m[2].split(/\s{2,}/)[0]);
  assert.deepEqual(steps, ['astro build', 'node scripts/sync-media.mjs', 'node scripts/render-pdf.mjs', 'node generators/pptx/build.mjs', 'node checks/outputs.mjs', 'pagefind --site dist']);
  assert.match(build, /dist\/media\/ 를 비운 뒤 visibleLessons\(\) 의 media 에 적힌 파일만 → dist\/media\/<id>\//);
  for (const token of ['`distDir()`', '`cacheDir()`', '`--out <폴더>`', '`DIST_DIR`']) assert.ok(build.includes(token), `10절에 ${token} 이 없습니다`);
  // 옛 자리(public/media/)가 계약 파일에 남아 있지 않다
  for (const file of ['docs/CONTRACT.md', 'astro.config.mjs', '.gitignore', 'lib/content.ts']) assert.ok(!read(file).includes('public/media'), `${file} 에 public/media 가 남아 있습니다`);
  // 시험도 같은 인자를 쓴다
  const tests = section(16);
  for (const token of ['`--out <폴더>`', '`buildSite(out, env)`', '`noChromium()`', '`noPython()`']) assert.ok(tests.includes(token), `16절에 ${token} 이 없습니다`);
});

test('인쇄 넘침 검사는 인쇄 모양으로 재는 일곱 조건이다', () => {
  const print = section(7);
  const start = print.indexOf('### 쪽수와 넘침 검사');
  const body = print.slice(start, print.indexOf('\n### ', start + 1));
  assert.ok(body.includes("`page.emulateMedia({ media: 'print' })`"));
  assert.deepEqual([...body.matchAll(/^(\d)\. /gm)].map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(body.includes('`getBoundingClientRect()`') && body.includes('`complete && naturalWidth > 0`'));
  assert.ok(body.includes('`tests/contract/print.test.ts`'));
  // PDF 의 글을 읽는 규칙은 찍는 쪽(7절)과 다시 보는 쪽(11절)이 같다
  assert.match(body, /`str` 을 사이에 아무것도 넣지 않고 이어 붙인 뒤 빈칸과 줄바꿈을 모두 빼고/);
  assert.match(section(11), /PDF 의 글은 7절의 규칙으로 읽고 견준다/);
  // 컬러링 쪽과 카드의 놀이 방법이 어디에 찍히는지
  assert.ok(print.includes('\n### 컬러링\n') && print.includes('`look_for`'));
  assert.match(section(6), /놀이 방법\(`assets\.cards\.games` 의 `name`·`how`\)을 카드 줄 아래에 보여 줍니다/);
});

test('검사의 표가 코드와 같은 말을 한다', () => {
  const check = section(11);
  // 낱말 검사는 이 판에서 알림이다
  assert.match(row(check, '낱말'), /나오면 \*\*알림\*\* \(이 판에서는 실패가 아니다\)/);
  // 사실: 날짜까지 본다 (numbersIn)
  assert.ok(row(check, '사실').includes('"8월 15일" 같은 날짜'));
  assert.deepEqual(checks.numbersIn('8월 15일'), ['8월15일']);
  // 출처: 제목에서는 회사 이름만 찾는다 (제목에 "교과서"가 든 공공 기관 자료는 쓸 수 있다). 쓰지 않는 그림도 여기에서 걸린다
  const source = row(check, '출처');
  assert.ok(source.includes('제목에 "교과서"라는 낱말이 든 공공 기관 자료는 쓸 수 있다'));
  assert.ok(!checks.DENIED_PUBLISHER.test('초등 사회 5-2 교과서 8쪽') && checks.DENIED_NAME.test('초등 사회 5-2 교과서 8쪽'));
  assert.ok(source.includes('어디에서도 쓰지 않는 그림이 없다'));
  // 형식: 이름을 잘못 적은 명세 파일
  assert.ok(row(check, '형식').includes('`lesson.yml`·`Lesson.yaml`·`lesson.yaml.txt`'));
  // --push 를 붙이는 곳
  assert.match(row(check, '검수 기록'), /`--push` 는 두 곳에서만 붙인다: 기본 가지의 CI\(배포 워크플로 포함\)와, `TEXTBOOK_STORE` 가 있는 컴퓨터의 `\.githooks\/pre-push`/);
  // pptx 안의 그림
  assert.ok(check.includes('pptx 안의 그림이 원본 파일과 가로세로 비율이 같고(±1%) 자르기 값이 0 인가'));
  assert.ok(section(8).includes('`crop_left`'));
});

test('올리기 전 검사는 비공개 자료가 없는 기여자를 막지 않는다 (13절)', () => {
  const guard = section(13);
  assert.match(guard, /`TEXTBOOK_STORE` 가 없으면: .+ 한 줄을 찍고 0 으로 끝납니다/);
  assert.match(guard, /`TEXTBOOK_STORE` 가 있으면\(날쌤의 컴퓨터\): .+`npm run check -- --push` 로 막습니다/);
  assert.match(guard, /\*\*기본 가지의 CI\*\* 가 `npm run check -- --push` 를 돌립니다/);
  assert.ok(guard.includes('**CODEOWNERS 승인.**'));
  assert.match(guard, /PR 의 CI 는 `--push` 없이 `npm run check` 를 돌립니다/);
  // 베끼기 검사가 보는 범위는 통과 기록의 지문이 덮는 범위와 같다
  assert.match(guard, /`media` 의 SVG 파일, 전개도 모듈 `papercraftModuleFile\(lesson\)`\)의 글자 전체를 봅니다/);
});

test('고정 문구와 주소의 꼴', () => {
  assert.ok(section(12).includes(`\`SITE.previewNotice\`("${site.SITE.previewNotice}")`));
  assert.ok(section(3).includes('`["5-2/1/01","5-2/1/02-03"]`') && section(3).includes('`visibleLessons().filter(isPublic).map((l) => l.id)`'));
});

test('플랫폼으로 넓히며 정한 것(R40~R58)이 결정 기록과 계약서에 함께 있다', () => {
  const decisions = read('docs/decisions.md');
  assert.ok(decisions.includes('## 플랫폼으로 넓히며 정한 것 (2026-11-21)'));
  for (let n = 40; n <= 58; n++) assert.match(decisions, new RegExp(`^\\| R${n} `, 'm'), `decisions.md 에 R${n} 줄이 없습니다`);
  // 새 주소 (3절)
  for (const u of ['`/types/`', '`/updates/`', '`/status/`', '`/my/`', '`/files/<id>/thumbs/<kind>.jpg`']) assert.ok(section(3).includes(u), `3절에 ${u} 가 없습니다`);
  // 플랫폼 도우미 (4절의 표)
  const table = section(4);
  for (const name of ['catalog', 'readyKinds', 'formatLine', 'semesterProgress', 'unitProgress', 'lessonNeighbours', 'courseLine', 'stageFooter', 'slidePhase', 'thumbRoute', 'thumbFile', 'loadUpdates', 'visibleUpdates', 'updatesFile']) {
    assert.ok(table.includes('`' + name + '('), `4절의 표에 ${name}() 가 없습니다`);
  }
  // 함께 쓰는 화면 부품과 내 자료함의 열쇠 (6절), 수업 화면의 바닥글과 단계 머리말 (8절), 미리보기 그림과 새 묶음 (10절), 산출물 검사 (11절)
  for (const part of ['Kicker.astro', 'Band.astro', 'StatusChip.astro', 'TypeIcon.astro', 'ResourceCard.astro']) assert.ok(section(6).includes('`' + part + '`'), part);
  assert.ok(section(6).includes('`' + STORAGE_KEY + '`'), '6절의 열쇠가 collect.ts 와 다릅니다');
  assert.ok(section(8).includes('`stageFooter(lesson)`') && section(8).includes('`slidePhase(lesson, no).kicker`'));
  assert.ok(section(10).includes('**미리보기 그림 (R52).**') && section(10).includes('`npm run new -- <id>`'));
  assert.ok(section(11).includes('`thumbFile(id, kind)`'));
  // 이름은 한 곳에서만: 계약서와 문서에 옛 임시 이름이 남지 않는다 (결정 기록의 옛 이름 이야기는 빼고)
  for (const file of ['docs/CONTRACT.md', 'docs/ROADMAP.md', 'README.md', 'CONTRIBUTING.md', 'lib/site.ts']) assert.ok(!read(file).includes('날쌤 초등사회'), file);
  assert.equal(site.SITE.name, 'nalssam의 초등사회콘텐츠 클라우드');
});
