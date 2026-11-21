// npm run new -- <묶음 id> — 새 묶음의 명세를 본보기에서 만든다 (docs/CONTRACT.md 10절 '새 묶음', R56).
//
//   npm run new -- 5-2/1/02
//
// docs/template/lesson.yaml 을 content/<id>/lesson.yaml 로, 본보기가 가리키는 그림(docs/template/media/)을 content/<id>/media/ 로 복사한다.
// 고치는 것은 셋뿐이다: id 를 그 묶음 id 로, status 를 draft 로, 맨 위에 차시표의 값(학기, 단원, 차시, 교과서 쪽수)을 주석 한 줄로.
// 차시 번호와 쪽수는 차시표에만 있는 값이라 명세의 칸으로 적지 않는다 (1절). 그 밖의 내용은 본보기 그대로이고 아무것도 지어내지 않는다.
//
// 아무것도 쓰지 않고 멈추는 때 (0 이 아닌 값으로 끝난다):
//   - 차시표(content/registry.yaml)에 없는 id
//   - 이미 명세가 있는 묶음 (이름을 잘못 적은 lesson.yml 따위도 명세로 본다)
//   - content/ 밖으로 나가는 id
//   - 본보기 그림과 이름이 같은데 내용이 다른 그림이 그 묶음의 media/ 에 이미 있을 때 (덮어쓰지 않는다)
// CONTENT_DIR 을 따른다. 시험은 .cache/tests/ 아래의 복사본에 만든다.
import fs from 'node:fs';
import path from 'node:path';
import * as c from '#lib/content.ts';
import { ROLE_LABEL } from '#lib/site.ts';
import { UsageError, parseArgs, rel } from '../checks/lib.mjs';

const USAGE = `쓰는 법: npm run new -- <묶음 id>
  예: npm run new -- 5-2/1/02
  묶음 id 는 차시표(content/registry.yaml)에 적힌 학기/단원/묶음입니다.`;

const TEMPLATE = path.join(c.ROOT, 'docs', 'template', 'lesson.yaml');
const TEMPLATE_MEDIA = path.join(c.ROOT, 'docs', 'template', 'media');
// "5-2/1/02", "5-2/1/03-04". 점·빈칸·역슬래시가 든 id 는 여기에서 걸러진다 (폴더 밖으로 나가는 id).
const ID = /^[3-6]-[12]\/[1-9]\d?\/\d{2}(?:-\d{2})?$/;

/** 멈추는 까닭. 글만 보여 주고 1 로 끝낸다. */
class Stop extends Error {}

/** 차시표에 없는 id 일 때 그 단원(없으면 그 학기)에 있는 묶음 id 를 알려 준다 */
function nearby(id) {
  const [semester, unit] = id.split('/');
  const all = c.allBundles();
  const sameUnit = all.filter((b) => b.semester.id === semester && String(b.unit.no) === unit);
  if (sameUnit.length) return `이 단원의 묶음: ${sameUnit.map((b) => b.id).join(', ')}`;
  const sameSemester = all.filter((b) => b.semester.id === semester);
  if (sameSemester.length) return `${c.semesterLabel(semester)}의 단원: ${[...new Set(sameSemester.map((b) => `${b.unit.no}단원`))].join(', ')}`;
  return c.loadRegistry().semesters.some((s) => s.id === semester)
    ? `${c.semesterLabel(semester)}는 아직 차시표가 없습니다. 차시표에 단원과 묶음을 먼저 적습니다`
    : '';
}

/** 맨 위에 붙이는 주석 한 줄: 차시표에서 옮겨 적은 값 */
function headerLine(ref) {
  const role = ROLE_LABEL[ref.bundle.role];
  return `# ${c.semesterLabel(ref.semester.id)} ${ref.unit.no}단원 「${ref.unit.title}」 · ${c.lessonsLabel(ref.lessons)}${role ? ` (${role})` : ''} · 교과서 ${c.pagesLabel(ref.pages)}. 차시표에서 옮겨 적은 주석이고 명세의 칸이 아닙니다.`;
}

/** 본보기의 글에서 id 와 status 줄을 바꾼다. 두 줄은 맨 바깥에 꼭 한 번씩 있다 (tests/repo/template.test.ts 가 본보기를 지킨다). */
function fill(text, id, ref) {
  const swap = (src, key, value) => {
    const re = new RegExp(`^${key}: .*$`, 'gm');
    const hits = src.match(re) ?? [];
    if (hits.length !== 1) throw new Error(`본보기(docs/template/lesson.yaml)에 맨 바깥의 "${key}:" 줄이 ${hits.length}개 있습니다. 하나여야 합니다`);
    return src.replace(re, `${key}: ${value}`);
  };
  return `${headerLine(ref)}\n${swap(swap(text, 'id', id), 'status', 'draft')}`;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    if (args._.length !== 1) throw new UsageError(args._.length ? `묶음 id 는 하나만 적습니다 (지금: ${args._.join(' ')})` : '묶음 id 를 적습니다');
  } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\n${USAGE}`); return 2; }
    throw e;
  }
  const id = args._[0].trim().replace(/^\/+|\/+$/g, '');

  if (!ID.test(id)) throw new Stop(`"${args._[0]}" 는 묶음 id 꼴이 아닙니다. 학기/단원/묶음 꼴로 적습니다 (예: 5-2/1/02, 5-2/1/04-05).`);
  const ref = c.findBundle(id);
  if (!ref) {
    const hint = nearby(id);
    throw new Stop(`차시표(${rel(path.join(c.contentDir(), 'registry.yaml'))})에 ${id} 가 없습니다.${hint ? ` ${hint}.` : ''}\n차시표에 없는 묶음은 만들지 않습니다. 묶음 id 를 고치거나 차시표에 먼저 적습니다.`);
  }

  const root = path.resolve(c.contentDir());
  const dir = path.resolve(c.lessonDir(id));
  if (!dir.startsWith(root + path.sep)) throw new Stop(`${id}: 명세 폴더(${rel(root)}) 밖을 가리킵니다. 아무것도 쓰지 않았습니다.`);
  const file = c.lessonFile(id);
  if (c.hasLesson(id)) throw new Stop(`${rel(file)} 가 이미 있습니다. 이미 있는 명세는 덮어쓰지 않습니다.`);
  // 이름을 잘못 적은 명세(lesson.yml, Lesson.yaml)도 명세로 본다. 새로 만들면 한 묶음에 명세가 둘이 된다.
  const misnamed = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /lesson/i.test(f)) : [];
  if (misnamed.length) throw new Stop(`${rel(dir)} 에 명세로 보이는 파일이 있습니다 (${misnamed.join(', ')}). 이름을 lesson.yaml 로 고쳐 씁니다. 새로 만들지 않았습니다.`);

  // 본보기가 가리키는 그림. 같은 이름의 다른 그림이 이미 있으면 덮어쓰지 않고 멈춘다 (먼저 넣어 둔 사진을 잃지 않게).
  const media = fs.existsSync(TEMPLATE_MEDIA) ? fs.readdirSync(TEMPLATE_MEDIA).filter((f) => fs.statSync(path.join(TEMPLATE_MEDIA, f)).isFile()) : [];
  const clash = media.filter((f) => {
    const to = path.join(dir, 'media', f);
    return fs.existsSync(to) && !fs.readFileSync(to).equals(fs.readFileSync(path.join(TEMPLATE_MEDIA, f)));
  });
  if (clash.length) throw new Stop(`${rel(path.join(dir, 'media'))} 에 본보기 그림과 이름이 같은 다른 파일이 있습니다 (${clash.join(', ')}). 덮어쓰지 않고 멈춥니다. 그 파일의 이름을 바꾼 뒤 다시 돌립니다.`);

  const text = fill(fs.readFileSync(TEMPLATE, 'utf8'), id, ref);
  // 쓰기 전에 읽어 본다. 본보기가 형식에 맞지 않으면 아무것도 쓰지 않는다.
  const lesson = c.parseLessonText(text, file);
  if (lesson.id !== id || lesson.status !== 'draft') throw new Error(`만든 명세의 id 나 status 가 맞지 않습니다 (id ${lesson.id}, status ${lesson.status})`);

  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  for (const f of media) {
    const to = path.join(dir, 'media', f);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(TEMPLATE_MEDIA, f), to);
  }
  fs.writeFileSync(file, text);

  const course = `${c.semesterLabel(ref.semester.id)} ${ref.unit.no}단원 「${ref.unit.title}」 ${c.lessonsLabel(ref.lessons)} · 교과서 ${c.pagesLabel(ref.pages)}`;
  const examples = lesson.media.map((m) => m.id).join(', ');
  console.log([
    `만들었습니다: ${rel(file)}`,
    `  ${course}`,
    `  본보기 그림 ${media.length}개를 ${rel(path.join(dir, 'media'))}/ 에 함께 복사했습니다.`,
    '',
    '이제 할 일',
    `  1. 명세를 채웁니다. 칸마다 윗줄의 주석을 읽고, 본보기의 글은 모두 이 차시의 글로 바꿉니다.${examples ? ` 본보기 그림(${examples})은 실제 그림으로 바꾸거나, 지우고 그 그림을 가리키는 칸도 함께 지웁니다.` : ''}`,
    '  2. npm run check 로 검사하고, npm run dev 로 화면을 봅니다.',
    `  3. npm run factsheet -- ${id} 로 사실 대조표를 찍어, 글마다 가리킨 사실과 맞는지 봅니다.`,
    '  4. 검수 기록 넷을 남깁니다: 사실 대조(fact), 베끼기 검사(originality), 문장 다듬기(voice), 화면·인쇄 점검(print).',
    `     예: npm run sign -- ${id} voice --by "별명". 베끼기 검사 기록은 날쌤이 npm run check:originality -- ${id} --record 로 적습니다.`,
    `  5. 사실마다 서로 다른 두 확인자의 확인 기록을 남깁니다. 예: npm run sign -- ${id} check --all --by "별명"`,
    `  6. content/updates.yaml 에 새 자료 소식을 하나 적습니다 (kind: new, lessons: ["${id}"]). 차시가 공개되어야 공개 사이트에 보입니다.`,
    '  7. 날쌤이 읽고 승인한 뒤 공개합니다. 승인(owner)과 status: published 는 날쌤만 적습니다.',
  ].join('\n'));
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  // 멈춘 까닭과 명세를 읽다 난 오류(SpecError)는 글만, 그 밖의 오류는 어디에서 났는지도 보여 준다
  console.error(e instanceof Stop || e?.name === 'SpecError' ? `${e.message}` : e);
  process.exitCode = 1;
}
