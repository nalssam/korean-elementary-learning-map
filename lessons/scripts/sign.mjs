// npm run sign — 검수 기록과 사실 확인 기록을 명세에 적는다 (docs/CONTRACT.md 12절).
//
//   npm run sign -- 5-2/1/01 voice --by "ai:다듬기"                     검수 기록 (--result fix, --note "…")
//   npm run sign -- 5-2/1/01 check f3 --by "ai:검증자A"                 사실 확인 (--verdict disputed, --note "…")
//
// 지문은 손으로 적지 않는다. 이 도구가 sealsOf(id) 로 지금 내용의 지문을 얻어 함께 적는다.
// 명세의 주석과 적은 꼴이 남도록 parseDocument 로 고친다 (checks/lib.mjs 의 appendRecord).
//
// 적지 않는 것:
//  - 베끼기 검사(originality)의 pass. 비공개 자료로 검사한 도구만 적는다 (npm run check:originality -- <id> --record). fix 는 적을 수 있다.
//  - AI 이름("ai:…")으로 적는 날쌤 승인(owner). owner 기록은 사람만 적는다.
//  - status. published 는 날쌤이 직접 적는다.
import fs from 'node:fs';
import * as c from '#lib/content.ts';
import { REVIEW_LABEL } from '#lib/site.ts';
import { REVIEW_KINDS } from '#schema/lesson.ts';
import { UsageError, appendRecord, byProblem, parseArgs, rel, today } from '../checks/lib.mjs';

const USAGE = `쓰는 법:
  검수 기록  npm run sign -- <묶음 id> <종류> --by "<이름>" [--result fix] [--note "<메모>"]
             종류: ${REVIEW_KINDS.map((k) => `${k}(${REVIEW_LABEL[k]})`).join(', ')}
  사실 확인  npm run sign -- <묶음 id> check <사실 id> --by "<이름>" [--verdict disputed] [--note "<메모>"]
예: npm run sign -- 5-2/1/01 voice --by "ai:다듬기"
    npm run sign -- 5-2/1/01 check f3 --by "ai:검증자A"
이름은 공개해도 되는 별명으로 적습니다. AI 는 "ai:" 로 시작하는 이름을 씁니다. 실명·학교·이메일은 적지 않습니다.
메모에 교과서 문장을 옮겨 적지 않습니다. 겹친 곳은 "교과서 8쪽, 14자"처럼 쪽수와 길이로만 적습니다.`;

// 쓰는 법을 틀린 것(UsageError)에는 쓰는 법을 함께 찍고, 적을 수 없는 기록(Refusal)에는 까닭만 찍는다.
class Refusal extends Error {}
function refuse(message) { throw new Refusal(message); }
function usage(message) { throw new UsageError(message); }

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['--by', '--result', '--verdict', '--note'] });
  const [id, kind, factId, ...rest] = args._;
  if (!id || !kind) usage('묶음 id 와 종류를 적습니다');
  if (!c.hasLesson(id)) refuse(`${id} 묶음의 명세가 없습니다 (${rel(c.lessonFile(id))})`);
  const by = args.flags['--by'];
  const problem = byProblem(by);
  if (problem) refuse(problem);
  const note = args.flags['--note'];
  if (note !== undefined && !note.trim()) refuse('--note 가 비어 있습니다. 메모를 적거나 --note 를 뺍니다');

  // 지금 내용의 지문. 명세에 형식 오류가 있으면 무엇을 검수했는지 묶을 수 없으므로 적지 않는다.
  let seals;
  try { seals = c.sealsOf(id); } catch (e) {
    if (e instanceof c.SpecError) refuse(`명세에 고칠 곳이 있어 기록하지 않습니다. 먼저 고칩니다:\n${e.issues.map((i) => `  - ${i}`).join('\n')}`);
    throw e;
  }
  const file = c.lessonFile(id);
  const lesson = c.parseLessonText(fs.readFileSync(file, 'utf8'), file);
  const date = today();
  const check = (next) => c.parseLessonText(next, file);

  if (kind === 'check') {
    if (rest.length) usage(`모르는 인자입니다: ${rest.join(' ')}`);
    if (args.flags['--result']) refuse('사실 확인에는 --result 가 아니라 --verdict 를 씁니다 (confirmed 또는 disputed)');
    if (!factId) refuse('확인한 사실의 id 를 적습니다. 예: npm run sign -- 5-2/1/01 check f3 --by "ai:검증자A"');
    if (factId.includes('/')) refuse(`${factId} 는 앞 묶음의 사실입니다. 그 사실이 적힌 묶음에서 확인합니다 (npm run sign -- <그 묶음 id> check ${factId.split('/')[1]} …)`);
    const index = lesson.facts.findIndex((f) => f.id === factId);
    if (index < 0) refuse(`${id} 에 사실 ${factId} 가 없습니다 (있는 사실: ${lesson.facts.map((f) => f.id).join(', ') || '없음'})`);
    const verdict = args.flags['--verdict'] ?? 'confirmed';
    if (!['confirmed', 'disputed'].includes(verdict)) refuse('--verdict 는 confirmed 또는 disputed 입니다');
    const last = lesson.facts[index].checks.at(-1);
    if (last && last.date > date) refuse(`사실 ${factId} 의 마지막 확인 기록 날짜(${last.date})가 오늘(${date})보다 늦습니다. 그 기록의 날짜를 확인합니다`);
    const record = { by, date, verdict, seal: seals.facts[factId], ...(note ? { note } : {}) };
    appendRecord(file, ['facts', index, 'checks'], record, check);
    console.log(`기록했습니다: ${id} 사실 ${factId} ${verdict} (${by}, ${date}, 지문 ${record.seal})`);
  } else {
    if (factId || rest.length) usage(`모르는 인자입니다: ${[factId, ...rest].filter(Boolean).join(' ')}`);
    if (!REVIEW_KINDS.includes(kind)) usage(`모르는 종류입니다: ${kind}`);
    if (args.flags['--verdict']) refuse('검수 기록에는 --verdict 가 아니라 --result 를 씁니다 (pass 또는 fix)');
    const result = args.flags['--result'] ?? 'pass';
    if (!['pass', 'fix'].includes(result)) refuse('--result 는 pass 또는 fix 입니다');
    if (kind === 'originality' && result === 'pass') refuse('베끼기 검사의 통과 기록은 이 도구로 적지 않습니다. 비공개 자료가 있는 컴퓨터에서 npm run check:originality -- ' + id + ' --record 가 적습니다 (고칠 곳을 적는 --result fix 는 여기에서 적을 수 있습니다)');
    if (kind === 'owner' && /^ai:/i.test(by)) refuse('날쌤 승인(owner)은 사람만 적습니다. AI 이름으로 적지 않습니다');
    const last = lesson.reviews.at(-1);
    if (last && last.date > date) refuse(`마지막 검수 기록의 날짜(${last.date})가 오늘(${date})보다 늦습니다. 그 기록의 날짜를 확인합니다`);
    const record = { kind, by, date, result, seal: seals.lesson, ...(note ? { note } : {}) };
    appendRecord(file, ['reviews'], record, check, { after: 'status' });
    console.log(`기록했습니다: ${id} ${REVIEW_LABEL[kind]}(${kind}) ${result} (${by}, ${date}, 지문 ${record.seal})`);
  }

  // 공개까지 남은 것. 초안에서는 정보이고, 공개된 차시를 고치는 중이면 무엇을 다시 받아야 하는지 알려 준다.
  const gaps = c.publishGaps(id);
  console.log(gaps.length ? `공개까지 남은 것 ${gaps.length}가지:\n${gaps.map((g) => `  - ${g}`).join('\n')}` : '공개 조건을 모두 채웠습니다. 공개(status: published)는 날쌤이 적습니다.');
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof Refusal) console.error(`기록하지 않았습니다. ${e.message}`);
  else if (e instanceof UsageError) console.error(`${e.message}\n\n${USAGE}`);
  else throw e;
  process.exitCode = 2;
}
