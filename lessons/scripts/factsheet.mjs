// npm run factsheet -- <id> — 사실 대조표를 찍는다 (docs/CONTRACT.md 12절).
//
// 사실의 문장마다 그것을 가리킨 글을 나란히 찍고, 끝에 아무 사실도 가리키지 않는 글을 '가리킨 사실 없음'으로 모아 찍는다.
// 문항은 거짓으로 낸 OX 문장과 틀린 보기까지 모두 찍고 정답을 곁에 적는다.
// 사실 대조(fact) 검수는 이 표를 끝까지 읽었다는 뜻이다. 숫자가 없는 문장이 사실에서 나오는지는 기계가 알 수 없다.
//
// 표는 마크다운으로 찍는다. 파일로 남기려면: npm run factsheet -- 5-2/1/01 > 대조표.md
import * as c from '#lib/content.ts';
import { factBoxes } from '#lib/checks.ts';
import { ASSET_LABEL } from '#lib/site.ts';

/** factBoxes() 의 자리 이름을 교사가 읽는 말로 */
function placeName(lesson, where) {
  let m;
  const n = (s) => Number(s) + 1;
  if (where === 'title') return '차시 이름';
  if (where === 'tagline') return '소개';
  if ((m = /^slides\[(\d+)\]\.notes$/.exec(where))) return `수업 화면 ${n(m[1])}번 장 · 교사 메모`;
  if ((m = /^slides\[(\d+)\]$/.exec(where))) return `수업 화면 ${n(m[1])}번 장`;
  if ((m = /^quiz\.items\[(\d+)\]$/.exec(where))) return `확인 퀴즈 ${n(m[1])}번`;
  if ((m = /^terms\.new\[(\d+)\]$/.exec(where))) return `낱말 풀이 「${lesson.terms.new[Number(m[1])]?.term ?? ''}」`;
  if ((m = /^media\.(.+)$/.exec(where))) return `그림 ${m[1]}`;
  if ((m = /^passages\[(\d+)\]$/.exec(where))) return `읽기 자료 「${lesson.passages[Number(m[1])]?.title ?? ''}」`;
  if ((m = /^flow\[(\d+)\]$/.exec(where))) return `수업 흐름 ${n(m[1])}단계`;
  if (where === 'worksheet') return '학습지';
  if (where === 'worksheet.print') return '학습지 · 인쇄 안내';
  if ((m = /^assets\.cards\.cards\[(\d+)\]$/.exec(where))) return `카드 ${n(m[1])}번`;
  if ((m = /^assets\.(\w+)\.print$/.exec(where))) return `${ASSET_LABEL[m[1]] ?? m[1]} · 인쇄 안내`;
  if ((m = /^assets\.(\w+)$/.exec(where))) return ASSET_LABEL[m[1]] ?? m[1];
  if ((m = /^misconceptions\[(\d+)\]$/.exec(where))) return `오개념 ${n(m[1])}`;
  if ((m = /^teacher_notes\[(\d+)\]$/.exec(where))) return `교사 메모 ${n(m[1])}`;
  const top = { objectives: '목표', prepare: '준비물', assessment: '평가', corrections: '고친 내용', sensitivity: '내용의 무게' };
  return top[where] ?? where;
}

const READER = { child: '아이', teacher: '교사' };
const one = (s) => s.replace(/\s*\n\s*/g, ' ');

function sheet(id) {
  const lesson = c.loadLesson(id);
  const boxes = factBoxes(lesson);
  const answers = new Map(lesson.quiz.items.map((q, i) => [`quiz.items[${i}]`, c.answerText(q)]));
  const out = [];
  const ref = c.bundleOf(lesson);
  out.push(`# 사실 대조표 · ${id} 「${lesson.title}」`, '');
  out.push(`${c.semesterLabel(ref.semester.id)} ${ref.unit.no}단원 ${c.lessonsLabel(ref.lessons)} · ${c.isPublic(lesson) ? '공개' : '초안'} · 지문 ${c.sealsOf(id).lesson}`, '');
  out.push('사실의 문장마다 그것을 가리킨 글을 나란히 놓았습니다. 글이 사실의 문장과 어긋나지 않는지 하나씩 봅니다.');
  out.push("끝의 '가리킨 사실 없음'까지 읽습니다. 거기에 사실을 말하는 문장이 있으면 fact 검수를 fix 로 적고, 그 문장이 가리킬 사실을 facts 에 더합니다.", '');

  const block = (b) => {
    const lines = [`- **${placeName(lesson, b.where)}** (${READER[b.reader]}가 읽는 글)`];
    for (const t of b.texts) lines.push(`  - ${one(t)}`);
    if (answers.has(b.where)) lines.push(`  - 정답: ${answers.get(b.where)}`);
    return lines;
  };

  // 이 묶음의 사실, 그다음 앞 묶음에서 빌려 온 사실 (가리킨 차례로)
  const refs = [...lesson.facts.map((f) => f.id)];
  for (const b of boxes) for (const r of b.refs) if (!refs.includes(r)) refs.push(r);
  out.push(`## 사실 ${refs.length}개`, '');
  for (const r of refs) {
    const f = c.getFact(lesson, r);
    out.push(`### ${r}${f.lessonId !== lesson.id ? ` (${f.lessonId} 의 사실)` : ''}${f.painful ? ' · 피해를 담은 사실' : ''}`, '');
    out.push(`> ${one(f.claim)}`, '');
    if (f.sources.length) for (const s of f.sources) out.push(`출처: ${s.name}${s.title ? ` 「${s.title}」` : ''} ${s.url}${s.quote ? `\n근거 구절: ${one(s.quote)}` : ''}`, '');
    else out.push('출처: 아직 없음', '');
    const using = boxes.filter((b) => b.refs.includes(r));
    if (using.length) for (const b of using) out.push(...block(b));
    else out.push('- 이 사실을 가리킨 글이 없습니다');
    out.push('');
  }

  const loose = boxes.filter((b) => b.refs.length === 0);
  out.push(`## 가리킨 사실 없음 (${loose.length}곳)`, '');
  out.push('아래 글은 아무 사실도 가리키지 않습니다. 숫자가 없으면 어떤 검사에도 걸리지 않으므로 사람이 읽고 봅니다.', '');
  for (const b of loose) out.push(...block(b));
  return out.join('\n') + '\n';
}

const ids = process.argv.slice(2);
if (ids.length === 0 || ids.some((a) => a.startsWith('--'))) {
  console.error('쓰는 법: npm run factsheet -- <묶음 id> [<묶음 id> …]\n예: npm run factsheet -- 5-2/1/01 > 대조표.md');
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(ids.map(sheet).join('\n'));
  } catch (e) {
    if (!(e instanceof c.SpecError)) throw e;
    console.error(`명세에 고칠 곳이 있어 대조표를 만들지 못했습니다. 먼저 고칩니다 (npm run check):\n${e.message}`);
    process.exitCode = 1;
  }
}
