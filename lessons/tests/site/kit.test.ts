// 차시 안내 페이지의 정리 규칙 (docs/CONTRACT.md 6절): 준비물과 인쇄물 줄이 겹치지 않고, 한 사실 아래 같은 출처가 두 번 서지 않고,
// 흐름 밖의 웹 활동이 두 번 나오지 않는다. 시험용 명세를 .cache/tests/ 아래에 복사해 고친 뒤 빌드해 본다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepareNote, uniqueSources } from '#src/components/site/data.ts';
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
