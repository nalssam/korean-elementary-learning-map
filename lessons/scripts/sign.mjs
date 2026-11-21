// npm run sign — 검수 기록과 사실 확인 기록을 명세에 적는다 (docs/CONTRACT.md 12절).
//
//   npm run sign -- 5-2/1/01 voice --by "ai:다듬기"                     검수 기록 (--result fix, --note "…")
//   npm run sign -- 5-2/1/01 check f1 f3 --by "ai:검증자A"              사실 확인 (--verdict disputed, --note "…"). 사실 id 를 여럿 적거나 --all
//
// 지문은 손으로 적지 않는다. 이 도구가 sealsOf(id) 로 지금 내용의 지문을 얻어 함께 적는다.
// 명세의 주석과 적은 꼴이 남도록 parseDocument 로 고친다 (checks/lib.mjs 의 appendRecord).
//
// 적지 않는 것:
//  - 베끼기 검사(originality)의 pass. 비공개 자료로 검사한 도구만 적는다 (npm run check:originality -- <id> --record). fix 는 적을 수 있다.
//  - AI 이름("ai:…")으로 적는 날쌤 승인(owner). owner 기록은 사람만 적는다.
//  - status. published 는 날쌤이 직접 적는다.
//  - 이 명세에 이미 적힌 이름과 같은 사람으로 세는(reviewerKey 가 같은) 다른 철자의 이름. "ai:검증자A" 와 "AI:검증자a" 는 한 사람이다 (12절).
import fs from 'node:fs';
import * as c from '#lib/content.ts';
import { REVIEW_LABEL } from '#lib/site.ts';
import { REVIEW_KINDS } from '#schema/lesson.ts';
import { UsageError, appendRecord, byProblem, parseArgs, rel, today } from '../checks/lib.mjs';

// 쓰는 법은 두 갈래다. 틀린 쪽의 것만 보여 준다 (종류를 알 수 없으면 둘 다).
const USAGE_REVIEW = `쓰는 법 · 검수 기록
  npm run sign -- <묶음 id> <종류> --by "<이름>" [--result fix] [--note "<메모>"]
  종류: ${REVIEW_KINDS.map((k) => `${k}(${REVIEW_LABEL[k]})`).join(', ')}
  예: npm run sign -- 5-2/1/01 voice --by "ai:다듬기"`;
const USAGE_CHECK = `쓰는 법 · 사실 확인
  npm run sign -- <묶음 id> check <사실 id> [<사실 id> …] --by "<이름>" [--verdict disputed] [--note "<메모>"]
  npm run sign -- <묶음 id> check --all --by "<이름>"    그 묶음의 사실 전부
  예: npm run sign -- 5-2/1/01 check f1 f2 f3 --by "ai:검증자A"`;
const USAGE_NAMES = `이름은 공개해도 되는 별명으로 적습니다. AI 는 "ai:" 로 시작하는 이름을 씁니다. 실명·학교·이메일은 적지 않습니다.
메모에 교과서 문장을 옮겨 적지 않습니다. 겹친 곳은 "교과서 8쪽, 14자"처럼 쪽수와 길이로만 적습니다.`;
const usageFor = (kind) => [kind === 'check' ? USAGE_CHECK : REVIEW_KINDS.includes(kind) ? USAGE_REVIEW : `${USAGE_REVIEW}\n${USAGE_CHECK}`, USAGE_NAMES].join('\n');

// 쓰는 법을 틀린 것(UsageError)에는 쓰는 법을 함께 찍고, 적을 수 없는 기록(Refusal)에는 까닭만 찍는다.
class Refusal extends Error {}
function refuse(message) { throw new Refusal(message); }
function usage(message) { throw new UsageError(message); }

let kindSeen;

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['--by', '--result', '--verdict', '--note'], bools: ['--all'] });
  const [id, kind, ...rest] = args._;
  kindSeen = kind;
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

  // 같은 사람의 다른 철자. "서로 다른 두 사람"은 reviewerKey() 로 세므로 철자가 달라도 한 사람이다.
  // 그대로 적으면 기록을 읽는 사람이 두 사람으로 오해하고, 두 사람째 확인을 받은 줄 안다.
  const names = [...lesson.reviews.map((r) => r.by), ...lesson.facts.flatMap((f) => f.checks.map((x) => x.by))];
  const twin = names.find((n) => n !== by && c.reviewerKey(n) === c.reviewerKey(by));
  if (twin) refuse(`이 명세에 같은 사람으로 세는 이름이 다른 철자로 적혀 있습니다: "${twin}". 같은 사람이면 철자를 똑같이 맞추고, 다른 사람이면 다른 이름을 씁니다`);

  if (kind === 'check') {
    if (args.flags['--result']) refuse('사실 확인에는 --result 가 아니라 --verdict 를 씁니다 (confirmed 또는 disputed)');
    const all = args.bools.has('--all');
    if (all && rest.length) usage('사실 id 와 --all 을 함께 쓰지 않습니다. 하나만 씁니다');
    if (!all && !rest.length) usage('확인한 사실의 id 를 적습니다. 여럿이면 빈칸으로 띄워 적고, 전부면 --all 을 붙입니다');
    const factIds = all ? lesson.facts.map((f) => f.id) : [...new Set(rest)];
    for (const factId of factIds) {
      if (factId.includes('/')) refuse(`${factId} 는 앞 묶음의 사실입니다. 그 사실이 적힌 묶음에서 확인합니다 (npm run sign -- <그 묶음 id> check ${factId.split('/')[1]} …)`);
      if (!lesson.facts.some((f) => f.id === factId)) refuse(`${id} 에 사실 ${factId} 가 없습니다 (있는 사실: ${lesson.facts.map((f) => f.id).join(', ') || '없음'})`);
    }
    if (!factIds.length) refuse(`${id} 에 적힌 사실이 없습니다`);
    const verdict = args.flags['--verdict'] ?? 'confirmed';
    if (!['confirmed', 'disputed'].includes(verdict)) refuse('--verdict 는 confirmed 또는 disputed 입니다');
    // 하나라도 적을 수 없으면 아무것도 적지 않는다 (반만 적힌 채로 끝나지 않게)
    for (const factId of factIds) {
      const last = lesson.facts.find((f) => f.id === factId).checks.at(-1);
      if (last && last.date > date) refuse(`사실 ${factId} 의 마지막 확인 기록 날짜(${last.date})가 오늘(${date})보다 늦습니다. 그 기록의 날짜를 확인합니다`);
    }
    for (const factId of factIds) {
      const index = lesson.facts.findIndex((f) => f.id === factId);
      const record = { by, date, verdict, seal: seals.facts[factId], ...(note ? { note } : {}) };
      appendRecord(file, ['facts', index, 'checks'], record, check);
      console.log(`기록했습니다: ${id} 사실 ${factId} ${verdict} (${by}, ${date}, 지문 ${record.seal})`);
    }
  } else {
    if (rest.length) usage(`모르는 인자입니다: ${rest.join(' ')}`);
    if (args.bools.has('--all')) usage('--all 은 사실 확인(check)에만 씁니다');
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
  else if (e instanceof UsageError) console.error(`${e.message}\n\n${usageFor(kindSeen)}`);
  else throw e;
  process.exitCode = 2;
}
