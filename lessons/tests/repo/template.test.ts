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
import { BANNED, SERVICES } from '../../checks/rules.mjs';

const FILE = path.join(c.ROOT, 'docs', 'template', 'lesson.yaml');
const TEXT = fs.readFileSync(FILE, 'utf8');

test('본보기는 형식에 맞고, 사실 대조와 금지 표현 검사도 통과한다', () => {
  const lesson = c.parseLessonText(TEXT, FILE);
  assert.deepEqual(factIssues(lesson), []);
  for (const s of [...c.childStrings(lesson), ...c.teacherStrings(lesson)]) {
    for (const b of BANNED) assert.ok(!b.re.test(s.text), `${s.path}: ${s.text}`);
    assert.ok(!SERVICES.test(s.text), s.path);
  }
  // 새 차시는 초안으로 시작하고, 기록 칸은 비어 있다 (손으로 적지 않는다)
  assert.equal(lesson.status, 'draft');
  assert.deepEqual(lesson.reviews, []);
  for (const f of lesson.facts) assert.deepEqual(f.checks, []);
});

test('본보기에는 수업 화면의 장 꼴과 학습지 블록, 퀴즈 꼴, 자료 일곱 가지가 모두 나온다', () => {
  const lesson = c.parseLessonText(TEXT, FILE);
  assert.deepEqual(new Set(lesson.slides.map((s) => s.layout)), new Set(['title', 'question', 'picture', 'points', 'compare', 'steps', 'term', 'passage', 'activity', 'quiz', 'closing']));
  const blocks = new Set(lesson.worksheet.pages.flatMap((p) => p.blocks.flatMap((b) => (b.type === 'columns' ? ['columns', ...b.columns.flat().map((x) => x.type)] : [b.type]))));
  assert.deepEqual(blocks, new Set(['prompt', 'note', 'passage', 'lines', 'box', 'figure', 'observe_infer', 'table', 'match', 'quiz', 'sentence_frame', 'timeline', 'columns']));
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
