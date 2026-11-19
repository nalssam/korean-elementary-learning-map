// 차시 안내 페이지의 정리 규칙 (docs/CONTRACT.md 6절): 준비물과 인쇄물 줄이 겹치지 않고, 한 사실 아래 같은 출처가 두 번 서지 않고,
// 흐름 밖의 웹 활동이 두 번 나오지 않는다. 시험용 명세를 .cache/tests/ 아래에 복사해 고친 뒤 빌드해 본다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MARK, MARK_LABEL } from '#lib/site.ts';
import { prepareNote, uniqueSources } from '#src/components/site/data.ts';
import { quoteTitle } from '#src/components/site/format.ts';
import type { PrintRow } from '#src/components/site/data.ts';
import { buildSite, tempContent } from '../contract/helpers.ts';

const t = tempContent('site-kit');
const OUT = path.join(path.dirname(t.dir), 'dist');
let html = '';
before(() => {
  t.edit('5-2/1/01', (l) => {
    // 학습지 줄과 같은 것을 가리키는 준비물 둘(이름만, 이름 뒤에 괄호 글)과 상관없는 준비물 하나
    l.prepare = [
      { item: '학습지 (미리 반으로 접어 둔다)', qty: '한 사람에 1장' },
      { item: '시험용 준비물', qty: '모둠마다 1개' },
    ];
    // 같은 문서의 다른 구절을 출처 둘로 적었다
    const f1 = l.facts.find((f: { id: string }) => f.id === 'f1');
    f1.sources.push({ ...f1.sources[0], quote: '시험용 근거 구절 하나의 다른 대목', accessed: '2026-11-19' });
    // 제목에 이미 낫표가 든 출처 (사전의 뜻 번호)
    f1.sources.push({ ...f1.sources[0], title: '돌탑3 (돌塔) 「1」', url: 'https://example.org/fact/1-dict' });
    // 맞다(○)와 아니다(×) 문항이 하나씩 있게 한다
    l.quiz.items.push({ ...l.quiz.items.find((q: { type: string }) => q.type === 'ox'), q: '돌탑은 나무로 만든다.', answer: false });
    // 웹 활동을 흐름에서 뺀다 ('더 해 볼 자료'가 된다)
    for (const s of l.flow) s.uses = s.uses.filter((u: string) => u !== 'web_activity');
  });
  html = fs.readFileSync(path.join(buildSite(OUT, { CONTENT_DIR: t.dir, SHOW_DRAFTS: '1' }), '5-2', '1', '01', 'index.html'), 'utf8');
});
after(() => { delete process.env.CONTENT_DIR; t.cleanup(); });

test('준비물: 인쇄물 줄을 가리키는 prepare 항목은 그 줄에 합친다', () => {
  const prepare = html.slice(html.indexOf('id="prepare-title"'), html.indexOf('id="flow-title"'));
  assert.equal(prepare.match(/<span class="mat-kind">학습지<\/span>/g)?.length, 1);
  // 괄호 안의 덧붙임 말은 학습지 줄에 들어가고, 따로 서는 '학습지' 줄은 없다
  assert.ok(prepare.includes('<p class="mat-line">미리 반으로 접어 둔다 · 한 사람에 1장</p>'));
  assert.ok(!/<span class="mat-title">학습지/.test(prepare));
  assert.ok(prepare.includes('<span class="mat-title">시험용 준비물</span>'));
});

test('사실과 출처: 이름·제목·주소가 같은 출처는 한 번만, 확인한 날은 늦은 날', () => {
  const claim = html.indexOf('돌탑은 돌을 쌓아 만든다는 시험용 사실이다.');
  const box = html.slice(claim, html.indexOf('</li></ul>', claim));
  assert.equal(box.match(/href="https:\/\/example\.org\/fact\/1"/g)?.length, 1);
  assert.ok(box.includes('2026-11-19'));
});

test('출처 제목: 낫표를 겹치지 않는다', () => {
  assert.ok(html.includes('시험용 출처, 「시험용 문서」'));
  assert.ok(html.includes('시험용 출처, 돌탑3 (돌塔) 「1」</a>'));
  assert.ok(!/「[^」<]*「/.test(html), '「…「…」」 처럼 낫표가 겹쳤습니다');
  assert.equal(quoteTitle('유적8 (遺跡)'), '「유적8 (遺跡)」');
  assert.equal(quoteTitle('유물4 (遺物) 「1」'), '유물4 (遺物) 「1」');
  assert.equal(quoteTitle('『삼국유사』 권1'), '『삼국유사』 권1');
});

test('OX 문항의 정답: lib 의 ○·× 옆에 맞다·아니다를 글로 보여 준다 (C3-09)', () => {
  const answers = [...html.matchAll(/<p class="quiz-a"><strong>정답<\/strong> (.*?)<\/p>/g)].map((m) => m[1]);
  for (const [mark, label] of [[MARK.yes, MARK_LABEL.yes], [MARK.no, MARK_LABEL.no]]) {
    assert.ok(answers.includes(`<span class="quiz-mark" aria-hidden="true">${mark}</span> ${label}`), `${mark} 정답이 없습니다: ${answers.join(' | ')}`);
  }
  for (const a of answers) assert.ok(!/(^|[^A-Za-z])[OX]([^A-Za-z]|$)/.test(a.replace(/<[^>]+>/g, '')), `정답에 라틴 글자 O·X 가 있습니다: ${a}`);
});

test('흐름 밖의 웹 활동: QR 카드에 한 번, 제목 밖의 표시', () => {
  assert.equal(html.match(/<h3 class="qr-title">웹 활동<\/h3>/g)?.length, 1);
  assert.match(html, /<h3 class="qr-title">웹 활동<\/h3><p class="qr-tag"[^>]*><span class="chip chip-plain">더 해 볼 자료<\/span><\/p>/);
  assert.ok(!html.includes('QR 코드 보기'));
});

test('prepareNote: 이름이나 제목으로 시작하는 항목만 같은 것으로 본다', () => {
  const row = { job: { label: '페이퍼크래프트', print: { per: 'group' } }, title: '종이 고인돌 세우기' } as unknown as PrintRow;
  assert.equal(prepareNote({ item: '페이퍼크래프트 (수업 전에 오려 둔 조각)', qty: '모둠마다 1벌' }, row), '수업 전에 오려 둔 조각');
  assert.equal(prepareNote({ item: '페이퍼크래프트' }, row), '');
  assert.equal(prepareNote({ item: '종이 고인돌 세우기', qty: '교사용 1벌' }, row), '교사용 1벌');
  assert.equal(prepareNote({ item: '페이퍼크래프트용 풀' }, row), undefined);
  assert.equal(prepareNote({ item: '붙임쪽지' }, row), undefined);
});

test('uniqueSources: 차례는 처음 나온 차례', () => {
  const a = { name: 'A', url: 'https://a', accessed: '2026-01-01' };
  const b = { name: 'B', url: 'https://b', accessed: '2026-01-01' };
  assert.deepEqual(uniqueSources([a, b, { ...a, accessed: '2026-02-01' }]).map((s) => [s.name, s.accessed]), [['A', '2026-02-01'], ['B', '2026-01-01']]);
  // 제목이 다르면 다른 출처다
  assert.equal(uniqueSources([a, { ...a, title: '다른 문서' }]).length, 2);
});

test('사이트 화면의 소스에 OX 표시를 손으로 적지 않는다 (lib 의 MARK 를 쓴다)', () => {
  const dirs = ['src/components/site', 'src/pages', 'src/layouts'].map((d) => path.join(import.meta.dirname, '..', '..', d));
  const files = dirs.flatMap((d) => (fs.readdirSync(d, { recursive: true }) as string[]).map((f) => path.join(d, f))).filter((f) => /\.(astro|ts)$/.test(f));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.ok(!/[○×]/.test(src), `${f}: ○·× 를 손으로 적었습니다`);
    assert.ok(!/['"`>][OX]['"`<]/.test(src), `${f}: O·X 를 손으로 적었습니다`);
  }
});

test('양면 인쇄 줄은 넘기는 쪽을 말하고, 단면 줄은 그대로다 (3차 검수 T3-site-02)', () => {
  const lines = [...html.matchAll(/<p class="mat-line">([^<]*(?:단면|양면)[^<]*)<\/p>/g)].map((m) => m[1]);
  assert.ok(lines.length > 0, '인쇄 안내 줄이 없습니다');
  for (const line of lines) {
    if (line.includes('양면')) assert.match(line, /양면\((긴|짧은) 쪽으로 넘김\)/);
    else assert.ok(!line.includes('넘김'), line);
  }
  assert.ok(lines.some((l) => l.includes('A4 가로') && l.includes('양면(짧은 쪽으로 넘김)')) || lines.some((l) => l.includes('양면(긴 쪽으로 넘김)')));
});

test('카드 인쇄 페이지의 양면 맞추기는 안내 페이지와 같은 말(긴 쪽으로 넘김)을 굽은 따옴표로 쓴다 (4차 문장 검수)', () => {
  const cards = fs.readFileSync(path.join(OUT, '5-2', '1', '01', 'cards', 'index.html'), 'utf8');
  const m = cards.match(/<dt>양면 맞추기<\/dt><dd>([^<]*)<\/dd>/);
  assert.ok(m, '카드 인쇄 페이지에 양면 맞추기 안내가 없습니다');
  assert.equal(m[1], '인쇄 창의 양면 인쇄에서 ‘긴 쪽으로 넘김’을 고르면 앞면과 뒷면이 맞습니다.');
  assert.ok(html.includes('양면(긴 쪽으로 넘김)'), '안내 페이지의 카드 줄이 같은 말을 쓰지 않습니다');
});

test('확인 퀴즈 칸: 수업 화면의 QR 버튼을 알리는 문장이 있다 (3차 검수 T3-site-03)', () => {
  const sec = html.slice(html.indexOf('id="student-title"'), html.indexOf('class="qr-cards"'));
  assert.ok(sec.includes('수업 화면의 QR 버튼(q 키)을 눌러도 같은 QR 코드를 띄울 수 있습니다.'));
});
