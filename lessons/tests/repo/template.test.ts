// 명세 본보기(docs/template/lesson.yaml): 형식에 맞고, 칸마다 한국어 주석이 달려 있고, 복사해 쓰면 검사도 통과하는가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isMap, isPair, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node } from 'yaml';
import * as c from '#lib/content.ts';
import { factIssues } from '#lib/checks.ts';
import { OPTIONAL_ASSET_KINDS } from '#schema/lesson.ts';
import { BANNED, SERVICES, straightQuotes } from '../../checks/rules.mjs';
import { tempContent } from '../contract/helpers.ts';
import { runNode } from './helpers.ts';

const FILE = path.join(c.ROOT, 'docs', 'template', 'lesson.yaml');
const TEXT = fs.readFileSync(FILE, 'utf8');

test('본보기는 형식에 맞고, 사실 대조와 금지 표현 검사도 통과한다', () => {
  const lesson = c.parseLessonText(TEXT, FILE);
  assert.deepEqual(factIssues(lesson), []);
  for (const s of [...c.childStrings(lesson), ...c.teacherStrings(lesson)]) {
    for (const b of BANNED) assert.ok(!b.re.test(s.text), `${s.path}: ${s.text}`);
    assert.ok(!SERVICES.test(s.text), s.path);
    // 본보기를 베껴 쓰는 글이 곧은 따옴표 알림을 물려받지 않게 한다 (15절)
    assert.equal(straightQuotes(s.text), undefined, `${s.path}: ${s.text}`);
  }
  // 맞고 틀림의 표시는 사이트가 ○·× 로 찍는다. 아이가 읽는 글에 라틴 글자 O·X 를 적어 두면 그대로 베껴 쓴다 (15절)
  for (const s of c.childStrings(lesson)) assert.doesNotMatch(s.text, /(^|[^A-Za-z])[OX]([^A-Za-z]|$)|[○×]/, `${s.path}: ${s.text}`);
  // 새 차시는 초안으로 시작하고, 기록 칸은 비어 있다 (손으로 적지 않는다)
  assert.equal(lesson.status, 'draft');
  assert.deepEqual(lesson.reviews, []);
  for (const f of lesson.facts) assert.deepEqual(f.checks, []);
});

test('본보기에는 수업 화면의 장 꼴과 학습지 블록, 퀴즈 꼴, 자료 일곱 가지가 모두 나온다', () => {
  const lesson = c.parseLessonText(TEXT, FILE);
  assert.deepEqual(new Set(lesson.slides.map((s) => s.layout)), new Set(['title', 'question', 'picture', 'points', 'compare', 'steps', 'term', 'passage', 'activity', 'quiz', 'closing']));
  const blocks = new Set(lesson.worksheet.pages.flatMap((p) => p.blocks.flatMap((b) => (b.type === 'columns' ? ['columns', ...b.columns.flat().map((x) => x.type)] : [b.type]))));
  assert.deepEqual(blocks, new Set(['prompt', 'note', 'passage', 'lines', 'box', 'figure', 'observe_infer', 'table', 'match', 'quiz', 'sentence_frame', 'timeline', 'columns', 'example']));
  assert.deepEqual(new Set(lesson.quiz.items.map((q) => q.type)), new Set(['ox', 'choice', 'short']));
  assert.deepEqual(Object.keys(lesson.assets).sort(), [...OPTIONAL_ASSET_KINDS].sort());
  for (const state of ['skip', 'planned', 'ready']) assert.ok(OPTIONAL_ASSET_KINDS.some((k) => lesson.assets[k].state === state), state);
});

test('칸마다 처음 나오는 자리의 윗줄에 한국어 주석이 있다', () => {
  const doc = parseDocument(TEXT);
  const lines = TEXT.split('\n');
  const lineAt = (offset: number) => TEXT.slice(0, offset).split('\n').length; // 1부터
  const seen = new Set<string>();
  const missing: string[] = [];
  const walk = (node: Node | null | undefined, at: string) => {
    if (isSeq(node)) for (const item of node.items) walk(item as Node, `${at}[]`);
    else if (isMap(node)) for (const pair of node.items) {
      if (!isPair(pair) || !isScalar(pair.key)) continue;
      const key = `${at}.${String(pair.key.value)}`;
      if (!seen.has(key)) {
        seen.add(key);
        // 칸 이름이 놓인 줄의 바로 윗줄이 주석이거나, 같은 묶음 위쪽의 주석이 그 칸 이름을 들어 풀이한다
        // (예: "# 표지: title 30자, subtitle 40자" 한 줄이 그 아래 title·subtitle 을 함께 풀이한다)
        const line = lineAt(pair.key.range![0]);
        const indent = (l: string) => l.length - l.trimStart().length;
        const own = indent(lines[line - 1].replace(/^(\s*)- /, '$1  '));
        let ok = lines[line - 2]?.trim().startsWith('#');
        for (let i = line - 2; !ok && i >= 0; i--) {
          const l = lines[i];
          if (l.trim().startsWith('#')) { if (new RegExp(`(^|[^a-z_])${String(pair.key.value)}([^a-z_]|$)`).test(l)) ok = true; continue; }
          if (l.trim() && indent(l.replace(/^(\s*)- /, '$1  ')) < own - 4) {
            // 두 대 위의 칸까지 올라가면 그 칸 바로 위의 주석 묶음까지만 보고 그만 본다
            for (let k = i - 1; k >= 0 && lines[k].trim().startsWith('#'); k--) if (new RegExp(`(^|[^a-z_])${String(pair.key.value)}([^a-z_]|$)`).test(lines[k])) ok = true;
            break;
          }
        }
        if (!ok) missing.push(`${line}번째 줄 ${key}`);
      }
      walk(pair.value as Node, key);
    }
  };
  walk(doc.contents as Node, '');
  assert.deepEqual(missing, []);
  // 주석은 한국어로 쓴다
  const comments = lines.filter((l) => l.trim().startsWith('#'));
  assert.ok(comments.length > 100);
  for (const l of comments) assert.match(l, /[가-힣]/, l);
});

test('본보기를 그림 폴더와 함께 복사하고 id 만 고치면 검사를 통과한다 (CONTRIBUTING 1절)', () => {
  const t = tempContent('repo-template');
  try {
    // 시험용 차시표에서 명세가 아직 없는 묶음 (5-2 둘째 단원 1차시)
    const dir = path.join(t.dir, '5-2', '2', '01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'lesson.yaml'), TEXT.replace(/^id: .*$/m, 'id: 5-2/2/01'));
    fs.cpSync(path.join(c.ROOT, 'docs', 'template', 'media'), path.join(dir, 'media'), { recursive: true });
    const r = runNode('checks/run.mjs', [], { CONTENT_DIR: t.dir });
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /5-2\/2\/01  .*\(초안\)\n/);
    assert.doesNotMatch(r.out, /5-2\/2\/01  .*\n(?:  알림 .*\n)*  고칠 것/);
  } finally {
    t.cleanup();
  }
});

test('본보기의 그림 폴더에는 명세가 가리키는 그림이 모두 있고, 1MB 를 넘지 않는다', () => {
  const lesson = c.parseLessonText(TEXT, FILE);
  for (const m of lesson.media) {
    const file = path.join(c.ROOT, 'docs', 'template', m.file);
    assert.ok(fs.existsSync(file), m.file);
    assert.ok(fs.statSync(file).size < 1024 * 1024, m.file);
  }
});
