// npm run check (checks/run.mjs): 교사가 터미널에서 읽고 고칠 수 있는 글로 실패와 알림을 찍는가.
// 시험용 명세(tests/contract/fixtures/content)의 복사본을 일부러 틀리게 고쳐 돌려 본다.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { passRows, tempContent } from '../contract/helpers.ts';
import { runNode } from './helpers.ts';
import { BANNED, CLASSROOM, SERVICES, fileNameTitle, straightQuotes, svgProblems } from '../../checks/rules.mjs';
import { gapSummary } from '../../checks/run.mjs';

const t = tempContent('repo-check');
after(() => t.cleanup());
const ONE = '5-2/1/01', TWO = '5-2/1/02-03', NOPLAY = '5-2/1/04';
const check = (...args: string[]) => runNode('checks/run.mjs', args, { CONTENT_DIR: t.dir });

test('시험용 명세 넷은 통과하고, 베끼기 검사 기록이 없다는 것은 알림으로만 보인다', () => {
  t.reset();
  const r = check();
  assert.equal(r.code, 0, r.all);
  // 베끼기 검사 기록 알림 다섯(차시표와 명세 넷)과, 초안마다 공개까지 남은 것 한 줄씩
  assert.match(r.out, /명세 4개 · 고칠 것 0건 · 알림 9건/);
  assert.match(r.out, /알림 +검수 기록 +베끼기 검사 기록이 없습니다 \(npm run check:originality -- 5-2\/1\/01 --record\)/);
  // 기여자가 이 알림을 고칠 것으로 읽지 않게 한 번 풀어 쓴다
  assert.match(r.out, /기록이 없다는 알림은 정상이고, 고칠 것이 아닙니다/);
});

test('--push 에서는 베끼기 검사 기록이 없으면 실패한다', () => {
  t.reset();
  const r = check('--push');
  assert.equal(r.code, 1);
  assert.match(r.out, /고칠 것 +검수 기록 +베끼기 검사 기록이 없습니다/);
  assert.doesNotMatch(r.out, /알림은 정상/);
});

test('형식 오류는 줄 번호와 함께, 다른 차시의 검사는 이어서 한다', () => {
  t.reset();
  t.editText(TWO, (s) => s.replace('title: 시험용 두 차시', 'title: "시험용: 두 차시'));
  const r = check();
  assert.equal(r.code, 1);
  assert.match(r.out, /5-2\/1\/02-03 .*\n  고칠 것 +형식 +\d+번째 줄: YAML 을 읽을 수 없습니다/);
  // 이 묶음을 가리키는 단원 정리 묶음은 무엇 때문에 읽히지 않는지 알려 준다
  assert.match(r.out, /5-2\/1\/02-03 묶음의 명세에 고칠 곳이 있어 읽지 못했습니다/);
  assert.match(r.out, /5-2\/1\/01  시험용 한 차시  \(초안\)/);
});

test('사실 대조와 금지 표현은 몇째 줄의 어느 칸인지 사람이 세는 번호로 알려 준다', () => {
  t.reset();
  t.editText(ONE, (s) => s
    .replace('    title: 오늘 본 것을 말해 봅시다', '    title: 1500년에 본 것을 말해 봅시다')
    .replace('tagline: 한 차시 묶음의 본보기입니다. 시험에서만 씁니다.', 'tagline: 다양한 활동을 통해 쉽고 재미있게 배웁니다.')
    .replace('  title: 시험용 학습지', '  title: 패들렛에 올려 봅시다'));
  const lines = fs.readFileSync(t.file(ONE), 'utf8').split('\n');
  const lineOf = (needle: string) => lines.findIndex((l) => l.includes(needle)) + 1;
  const r = check();
  assert.equal(r.code, 1);
  // 1500 은 다섯째 장(마무리)의 제목. 0 부터 세는 slides[4] 가 아니라 "5번째" 로 찍는다
  assert.ok(r.out.includes(`${lineOf('- layout: closing')}번째 줄 · slides · 5번째: 숫자 "1500"`), r.out);
  assert.ok(r.out.includes(`${lineOf('tagline:')}번째 줄 · tagline: "다양한" 대신`), r.out);
  assert.ok(r.out.includes(`${lineOf('tagline:')}번째 줄 · tagline: "~를 통해" 대신`), r.out);
  assert.ok(r.out.includes(`${lineOf('tagline:')}번째 줄 · tagline: "쉽고 재미있게"`), r.out);
  assert.ok(r.out.includes(`${lineOf('패들렛')}번째 줄 · worksheet · title: 다른 회사의 서비스 이름("패들렛")`), r.out);
});

test('그림 파일: 스크립트·on… 속성·바깥 주소, 1MB 넘는 파일', () => {
  t.reset();
  const svg = path.join(t.dir, ONE, 'media', 'stone.svg');
  fs.writeFileSync(svg, fs.readFileSync(svg, 'utf8').replace('<svg ', '<svg onload="x()" ').replace('</svg>', '<image href="https://example.org/a.png"/>\n<script>1</script></svg>'));
  const big = path.join(t.dir, TWO, 'media', 'sample.png');
  fs.writeFileSync(big, Buffer.concat([fs.readFileSync(big), Buffer.alloc(1024 * 1024 + 10)]));
  t.touch(t.file(ONE)); t.touch(t.file(TWO));
  const r = check();
  assert.equal(r.code, 1);
  assert.match(r.out, /그림 +media\/stone\.svg 1번째 줄: on… 속성/);
  assert.match(r.out, /그림 +media\/stone\.svg \d+번째 줄: 바깥 주소를 부르는 그림·링크가 있습니다/);
  assert.match(r.out, /그림 +media\/stone\.svg \d+번째 줄: <script> 가 있습니다/);
  assert.match(r.out, /그림 +\d+번째 줄 · media · \d번째: 파일이 1MB 를 넘습니다 \(1\.0MB, media\/sample\.png\)/);
});

test('svgProblems: 이름일 뿐인 주소(xmlns, rdf)는 걸지 않는다', () => {
  const ok = '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><metadata><rdf:RDF><cc:License rdf:about="http://creativecommons.org/licenses/by-nc-sa/4.0/"/></rdf:RDF></metadata><use xlink:href="#a"/><image href="data:image/png;base64,AA"/></svg>';
  assert.deepEqual(svgProblems(ok), []);
  assert.deepEqual(svgProblems('<svg>\n<style>@import url(//x.org/a.css)</style>\n<rect style="fill:url(https://x.org/#p)"/></svg>').map(([l]) => l), [2, 2, 3]);
});

test('금지 표현 규칙: 걸릴 것과 걸리지 않을 것', () => {
  const hit = (s: string) => BANNED.some((b) => b.re.test(s)) || SERVICES.test(s);
  for (const s of ['다양한 생각', '효과적으로', '그림을 통해', '자료를 통하여', '쉽고 재미있게', '유튜브 영상', '카훗으로 퀴즈', 'ChatGPT 에게']) assert.ok(hit(s), s);
  // "아이스크림"은 낱말이다. 회사 이름은 서비스 꼴로만 찾는다
  for (const s of ['아이스크림을 나누어 먹었다', '통나무를 깔았다', '다양하다', '구들장']) assert.ok(!hit(s), s);
  assert.ok(CLASSROOM.some((r) => r.re.test('10분 안에 끝납니다')));
});

test('낱말: 뒤 차시에서 처음 배우는 낱말이 나오면 알림 (실패가 아니다)', () => {
  t.reset();
  // 02-03 이 처음 가르치는 낱말을 01 의 아이 글에 넣는다
  const later = c.parseLessonText(fs.readFileSync(t.file(TWO), 'utf8')).terms.new[0].term;
  t.editText(ONE, (s) => s.replace('    title: 오늘 본 것을 말해 봅시다', `    title: ${later}을 본 것을 말해 봅시다`));
  const r = check();
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, new RegExp(`알림 +낱말 +\\d+번째 줄 · slides · 5번째 · title: 뒤 차시\\(5-2/1/02-03\\)에서 처음 배우는 낱말\\("${later}"\\)이 나옵니다\\.`));
});

test('무게가 있는 차시의 놀이 자료에 피해 낱말이 나오면 알림', () => {
  t.reset();
  const raw = t.read(NOPLAY);
  const items = raw.quiz.items as { explain: string }[];
  t.edit(NOPLAY, (l) => { l.quiz.items[0].explain = `${items[0].explain} 많은 사람이 희생되었습니다.`; });
  const r = check();
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /알림 +표현 +\d+번째 줄 · quiz · items · 1번째 · explain: 무게가 있는 차시의 놀이 자료에 피해 낱말\("희생"\)이 나옵니다/);
});

test('읽히지 않고 빠지는 명세 파일과 폴더', () => {
  t.reset();
  fs.mkdirSync(path.join(t.dir, '5-2', '1', '6'), { recursive: true });
  fs.copyFileSync(t.file(NOPLAY), path.join(t.dir, '5-2', '1', '6', 'lesson.yaml'));
  fs.copyFileSync(t.file(NOPLAY), path.join(t.dir, '5-2', '1', '04', 'lesson.yml'));
  const r = check();
  assert.equal(r.code, 1);
  assert.match(r.out, /5-2\/1\/04\/lesson\.yml: 명세 파일 이름이 틀려 읽히지 않습니다/);
  assert.match(r.out, /5-2\/1\/6\/lesson\.yaml: 차시표에 없는 폴더라 읽히지 않습니다/);
});

test('--base: 공개되어 있던 차시의 사실이 바뀌었는데 corrections 가 늘지 않았으면 실패', () => {
  t.reset();
  // 시험용 명세 폴더를 따로 git 저장소로 만들고, 공개해 둔 상태를 기준 커밋으로 둔다
  const seals = c.sealsOf(ONE);
  t.edit(ONE, (l) => {
    for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
    l.reviews = passRows(seals.lesson);
    l.status = 'published';
  });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=시험', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args], { cwd: t.dir, stdio: 'pipe' });
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', '기준');
  // 공개된 차시를 고칠 때는 draft 로 되돌린다 (12절). 사실의 문장을 바꾸고 corrections 는 적지 않는다
  t.edit(ONE, (l) => { l.status = 'draft'; l.facts[0].claim = '돌탑은 돌을 쌓아 만든다는 고친 시험용 사실이다.'; });
  let r = check('--base', 'HEAD');
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /고칠 것 +검수 기록 +공개되어 있던 차시의 사실\(f1\)이 바뀌었습니다. corrections 에 날짜와 고친 내용을 한 줄 더 적습니다/);
  t.edit(ONE, (l) => { l.corrections = [{ date: '2026-11-20', text: '돌탑 설명을 바로잡았습니다.' }]; });
  r = check('--base', 'HEAD');
  assert.doesNotMatch(r.out, /공개되어 있던 차시의 사실/);
  // 없는 기준 가지
  r = check('--base', 'origin/없는가지');
  assert.match(r.out, /--base origin\/없는가지: 기준 가지를 찾을 수 없습니다/);
  fs.rmSync(path.join(t.dir, '.git'), { recursive: true, force: true });
});

/** 시험용 명세 폴더를 따로 git 저장소로 만들고, 01 을 공개해 둔 상태를 기준 커밋으로 둔다 */
function publishOneAtBase() {
  const seals = c.sealsOf(ONE);
  t.edit(ONE, (l) => {
    for (const f of l.facts) f.checks = ['ai:검증자A', 'ai:검증자B'].map((by) => ({ by, date: '2026-11-19', verdict: 'confirmed', seal: seals.facts[f.id] }));
    l.reviews = passRows(seals.lesson);
    l.status = 'published';
  });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=시험', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args], { cwd: t.dir, stdio: 'pipe' });
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', '기준');
}

test('--base: 공개되어 있던 묶음을 draft 로 내렸거나 지웠으면 실패 (종이에 박힌 주소가 사라진다)', () => {
  t.reset();
  publishOneAtBase();
  try {
    // 그대로면 통과
    let r = check('--base', 'HEAD');
    assert.equal(r.code, 0, r.all);
    // draft 로만 내리고 사실은 그대로
    t.edit(ONE, (l) => { l.status = 'draft'; });
    r = check('--base', 'HEAD');
    assert.equal(r.code, 1, r.all);
    assert.match(r.out, /5-2\/1\/01  시험용 한 차시  \(초안\)\n(?:.*\n)*?  고칠 것 +검수 기록 +공개되어 있던 묶음이 draft 로 바뀌었습니다\. 이대로 합치면 종이에 박힌 주소가 사이트에서 사라집니다/);
    assert.doesNotMatch(r.out, /사실\(f\d\)이 바뀌었습니다/);
    // 명세를 지웠다
    fs.rmSync(path.join(t.dir, '5-2', '1', '01'), { recursive: true, force: true });
    r = check('--base', 'HEAD');
    assert.equal(r.code, 1, r.all);
    assert.match(r.out, /고칠 것 +검수 기록 +5-2\/1\/01: 공개되어 있던 묶음의 명세가 없어졌습니다/);
  } finally {
    fs.rmSync(path.join(t.dir, '.git'), { recursive: true, force: true });
  }
});

test('공개된 명세가 공개 조건을 잃으면 형식이 아니라 검수 기록 갈래로 보인다 (SpecError.category)', () => {
  t.reset();
  t.edit(ONE, (l) => { l.status = 'published'; });
  const r = check();
  assert.equal(r.code, 1);
  assert.match(r.out, /5-2\/1\/01  \(.*lesson\.yaml\)\n  고칠 것 +검수 기록 +/);
  assert.doesNotMatch(r.out, /5-2\/1\/01  \(.*lesson\.yaml\)\n  고칠 것 +형식 +/);
});

test('초안마다 공개까지 남은 것을 한 줄로 묶어 알린다', () => {
  t.reset();
  const r = check();
  assert.match(r.out, /5-2\/1\/01  시험용 한 차시  \(초안\)\n(?:.*\n)*?  알림 +검수 기록 +공개까지 남은 것: 검수 5가지\(사실 대조, 베끼기 검사, 문장 다듬기, 화면·인쇄 점검, 날쌤 승인\) · 사실 확인 2개\(f1, f2\)\n/);
  assert.match(r.out, /공개까지 남은 것: 검수 5가지\([^)]*\) · 먼저 공개할 앞 묶음\(5-2\/1\/01, 5-2\/1\/02-03\)/);
  // 사실 id 는 번호 차례로 이어진 것을 줄여 적는다
  const gaps = ['f3', 'f1', 'f2', 'f10', 'f5'].map((f) => `사실 ${f}: 지금 문장을 확인한 이가 0명입니다`);
  assert.equal(gapSummary(gaps), '공개까지 남은 것: 사실 확인 5개(f1~f3, f5, f10)');
  assert.equal(gapSummary([]), '공개 조건을 모두 채웠습니다. 공개(status: published)는 날쌤이 적습니다');
});

test('svgProblems: 빈칸 없는 on… 속성, javascript: 주소, href 를 바꿔 쓰는 <set>, 그림이 아닌 data: 주소', () => {
  const cases: [string, RegExp][] = [
    ['<svg/onload=alert(1)>', /on… 속성/],
    ['<svg><a href="javascript:alert(1)"><text>x</text></a></svg>', /javascript: 주소/],
    ['<svg><a><set attributeName="href" to="#x"/></a></svg>', /<set>·<animate> 가 링크 주소/],
    ['<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>', /사진이 아닌 data: 주소/],
    ['<svg><rect style="fill:url(data:text/html,x)"/></svg>', /사진이 아닌 data: 주소/],
  ];
  for (const [svg, why] of cases) assert.ok(svgProblems(svg).some(([, w]) => why.test(w)), svg);
  // 그림 안에 심은 사진은 받는다
  assert.deepEqual(svgProblems('<svg><image href="data:image/jpeg;base64,AA"/><image xlink:href="data:image/webp;base64,AA"/></svg>'), []);
});

test('그림 출처의 제목이 파일 이름이면 실패, 파일 이름이 섞여 있으면 알림', () => {
  assert.equal(fileNameTitle('GMJ 0154.jpg'), 'name');
  assert.equal(fileNameTitle('Dolmen.JPEG '), 'name');
  assert.equal(fileNameTitle('GMJ 0154.jpg (부근리 지석묘)'), 'part');
  assert.equal(fileNameTitle('강화 부근리 고인돌'), undefined);
  assert.equal(fileNameTitle(undefined), undefined);
  t.reset();
  t.editText(TWO, (s) => s.replace('title: 시험용 큰 돌', 'title: GMJ 0154.jpg').replace('title: 시험용 사진', 'title: 시험용 사진 (sample.png 원본)'));
  const r = check();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /고칠 것 +그림 +\d+번째 줄 · media · 2번째 · credit · title: 출처의 제목이 파일 이름입니다 \("GMJ 0154\.jpg"\)/);
  assert.match(r.out, /알림 +그림 +\d+번째 줄 · media · 3번째 · credit · title: 출처의 제목에 파일 이름이 섞여 있습니다/);
});

test('출처 칸의 회사 이름은 출처 검사가 한 번만 알린다 (서비스 이름 검사가 같은 이름을 또 찍지 않는다)', () => {
  t.reset();
  t.editText(TWO, (s) => s.replace('      - name: 시험용 출처\n        url: https://example.org/fact/3', '      - name: 비상교육 자료실\n        url: https://example.org/fact/3'));
  const r = check();
  assert.equal(r.code, 1, r.all);
  const lines = r.out.split('\n').filter((l) => l.includes('비상교육'));
  assert.equal(lines.length, 1, r.out);
  assert.match(lines[0], /출처 +.*교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다/);
  // 화면에 찍히는 글에서는 그대로 잡는다
  t.reset();
  t.editText(TWO, (s) => s.replace('  title: 시험용 두 차시 학습지', '  title: 비상교육 학습지'));
  assert.match(check().out, /표현 +.*다른 회사의 서비스 이름\("비상교육"\)/);
});

test('곧은 따옴표: 교사 메모의 한 글에 알림 한 줄, 몇째 줄인지와 고친 꼴을 함께 찍는다', () => {
  t.reset();
  // 한 글에 따옴표가 넷이어도 알림은 그 글에 한 줄이다. 출처 칸과 영문 값은 보지 않는다.
  t.editText(ONE, (s) => s
    .replace('      - 시험용 메모 한 줄', `      - 아이가 "왜요?"라고 물으면 '본 것'부터 다시 봅니다.`)
    .replace('url: https://example.org/fact/1', `url: "https://example.org/fact/1?q='a'"`));
  const lines = fs.readFileSync(t.file(ONE), 'utf8').split('\n');
  const line = lines.findIndex((l) => l.includes('라고 물으면')) + 1;
  const r = check();
  assert.equal(r.code, 0, r.all);
  const notes = r.out.split('\n').filter((l) => l.includes('따옴표'));
  assert.deepEqual(notes, [`  알림     표현       ${line}번째 줄 · teacher_notes · 1번째 · body · 1번째: 곧은 따옴표(" ')를 “ ”, ‘ ’ 로 바꿉니다: 아이가 “왜요?”라고 물으면 ‘본 것’부터 다시 봅니다.`]);
  // 고치면 알림이 사라진다
  t.editText(ONE, (s) => s.replace(`"왜요?"라고 물으면 '본 것'`, '“왜요?”라고 물으면 ‘본 것’'));
  assert.doesNotMatch(check().out, /따옴표/);
});

test('straightQuotes: 한국어 글의 곧은 따옴표만 잡고, 주소·코드·영어 줄임표·숫자 표시·영문 값은 뺀다', () => {
  assert.equal(straightQuotes('id-with-no-hangul "x"'), undefined);
  assert.equal(straightQuotes("주소는 https://example.org/?a='b' 입니다"), undefined);
  assert.equal(straightQuotes('칸 이름 `answer: "true"` 는 그대로 둡니다'), undefined);
  assert.equal(straightQuotes("영어로는 don't 라고 합니다"), undefined);
  assert.equal(straightQuotes(`높이는 5' 3" 입니다`), undefined);
  assert.equal(straightQuotes('‘이미 굽은 따옴표’는 그대로입니다'), undefined);
  assert.equal(straightQuotes("'본 것'과 '짐작한 것'")?.fixed, '‘본 것’과 ‘짐작한 것’');
  assert.equal(straightQuotes('(“앞”) 그리고 ("뒤")')?.fixed, '(“앞”) 그리고 (“뒤”)');
  assert.deepEqual(straightQuotes('그가 "네"라고 했다')?.marks, ['"']);
});

test('쓰는 법을 틀리면 쓰는 법을 찍고 2 로 끝난다', () => {
  const r = check('--psh');
  assert.equal(r.code, 2);
  assert.match(r.err, /모르는 선택입니다: --psh\n\n쓰는 법: npm run check/);
});

test('단계 장의 우리 그림이 상자보다 좁으면 알림 한 줄, 넓은 그림과 사진은 알리지 않는다 (R22)', () => {
  const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="#132c3d"/></svg>`;
  // 수업 화면 6번에 단계 장을 더하고, 마지막 단계(flow)가 그 장까지 쓰게 한다
  const addSteps = (raw: Record<string, unknown>) => {
    (raw.slides as unknown[]).push({ layout: 'steps', title: '차례대로 봅시다', steps: [{ label: '처음', text: '돌을 세웁니다.', media: 'stone' }, { label: '다음', text: '돌을 올립니다.' }] });
    const flow = raw.flow as { slides?: number[] }[];
    flow[flow.length - 1].slides = [4, 6];
  };
  const withSteps = (w: number, h: number) => {
    t.reset();
    fs.writeFileSync(path.join(t.dir, '5-2', '1', '01', 'media', 'stone.svg'), svg(w, h));
    t.edit(ONE, (raw) => {
      addSteps(raw);
    });
    return check();
  };
  const notes = (out: string) => out.split('\n').filter((l) => l.includes('단계 그림'));
  const r = withSteps(300, 200);
  assert.equal(r.code, 0, r.all);
  assert.equal(notes(r.out).length, 1, r.out);
  assert.match(notes(r.out)[0], /알림 +그림 +\d+번째 줄 · slides · \d+번째 · steps · 1번째 · media: 단계 그림 "stone"\(media\/stone\.svg\)은 가로 300 × 세로 200\(1\.5:1\)입니다\. .*가로로 넓은 꼴\(2\.6:1 남짓\).*780 × 300/);
  // 780 × 300 으로 그린 그림은 알리지 않는다
  assert.equal(notes(withSteps(780, 300).out).length, 0);
  // 사진은 모양이 정해져 있으므로 보지 않는다
  t.reset();
  t.edit(ONE, (raw) => {
    (raw.media as { id: string; kind: string }[])[0].kind = 'photo';
    addSteps(raw);
  });
  assert.equal(notes(check().out).length, 0);
});
