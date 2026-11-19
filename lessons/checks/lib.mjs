// 검사 스크립트와 기록 도구(checks/*.mjs, scripts/sign.mjs, scripts/factsheet.mjs)가 같이 쓰는 작은 도우미.
// 명세를 읽는 길은 lib/content.ts 하나다. 여기에는 명세를 읽는 코드를 두지 않고, 터미널에 찍는 꼴과 기록을 적는 일만 둔다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { ROOT } from '#lib/content.ts';

/** 오늘 날짜 ("2026-11-19"). 기록은 한국에서 적으므로 한국 시각으로 센다 (CI 의 컴퓨터는 UTC 라서 밤 9시 뒤에는 날짜가 하루 늦게 나온다). */
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 저장소 뿌리(lessons/) 기준 경로. 터미널에 찍을 때 쓴다. */
export const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/') || '.';

/** dir 이 든 git 저장소의 뿌리. git 저장소가 아니면(내려받은 압축 파일) undefined */
export function gitRoot(dir = ROOT) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
}

/**
 * 인자 읽기. flags 는 값을 받는 이름들("--by" 등). 값을 받지 않는 "--push" 같은 것은 bools 에 적는다.
 * 모르는 이름이 있으면 바로 알려 준다 (철자를 틀린 --reslt 가 말없이 버려지면 fix 로 적으려던 기록이 pass 로 적힌다).
 */
export function parseArgs(argv, { flags = [], bools = [] } = {}) {
  const out = { _: [], flags: {}, bools: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [name, inline] = a.split(/=(.*)/s, 2);
    if (bools.includes(name)) { out.bools.add(name); continue; }
    if (!flags.includes(name)) throw new UsageError(`모르는 선택입니다: ${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new UsageError(`${name} 뒤에 값을 적습니다`);
    out.flags[name] = value;
  }
  return out;
}

/** 쓰는 법을 틀렸을 때. 쓰는 법을 함께 찍고 2 로 끝낸다. */
export class UsageError extends Error {}

/** 터미널 폭에 맞춰 줄을 접지 않는다 (CI 기록에서 그대로 읽히게). 들여쓰기만 맞춘다. */
export function indent(text, by = '    ') {
  return text.split('\n').map((l) => by + l).join('\n');
}

/**
 * 명세 파일 맨 아래의 기록 목록(reviews, facts[i].checks, 차시표의 originality)에 한 줄을 더해 쓴다.
 * YAML 의 주석과 적은 꼴이 남도록 parseDocument 로 고친다 (docs/CONTRACT.md 12절). 목록이 없으면 만든다.
 * 쓰기 전에 check(text) 로 새 글을 읽어 본다. 형식에 맞지 않으면 파일을 그대로 두고 던진다.
 */
export function appendRecord(file, at, record, check, { after } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  const doc = parseDocument(text);
  const node = doc.getIn(at, true);
  const item = doc.createNode(record);
  if (node && typeof node === 'object' && 'items' in node) {
    // 비어 있던 목록을 "reviews: []" 처럼 적어 두었으면 새 줄도 한 줄짜리 괄호 꼴로 붙는다. 기록은 블록 꼴로 쓴다.
    node.flow = false;
    node.items.push(item);
  } else {
    const seq = doc.createNode([record]);
    seq.flow = false;
    const parent = at.length === 1 ? doc.contents : doc.getIn(at.slice(0, -1), true);
    const i = after && parent?.items ? parent.items.findIndex((p) => p.key?.value === after) : -1;
    // 맨 바깥의 reviews 는 status 바로 아래에 둔다 (본보기 명세의 차례). 그 밖에는 묶음의 맨 끝에 붙는다.
    if (i >= 0) parent.items.splice(i + 1, 0, doc.createPair(at.at(-1), seq));
    else doc.setIn(at, seq);
  }
  const next = write(doc);
  check(next);
  fs.writeFileSync(file, next);
}

// 사람이 적은 꼴을 되도록 그대로 둔다: 긴 줄을 접지 않고, 한 줄 목록은 [f1] 처럼 괄호 안에 빈칸을 넣지 않는다.
const write = (doc) => doc.toString({ lineWidth: 0, flowCollectionPadding: false });

/** 차시표의 originality 처럼 한 칸을 통째로 바꿔 쓴다. 주석은 남는다. */
export function setRecord(file, at, record, check) {
  const doc = parseDocument(fs.readFileSync(file, 'utf8'));
  doc.setIn(at, doc.createNode(record));
  const next = write(doc);
  check(next);
  fs.writeFileSync(file, next);
}

/** 기록의 이름(by)으로 쓸 수 없는 것. 공개 저장소에 그대로 실리므로 실명·학교·이메일을 막을 수 있는 만큼 막는다. */
export function byProblem(by) {
  if (!by || !by.trim()) return '--by 에 기록하는 이의 이름(별명)을 적습니다. AI 는 "ai:" 로 시작하는 이름을 씁니다. 예: --by "ai:다듬기"';
  if (/@/.test(by) && !/^copy-guard@/.test(by)) return '--by 에 이메일 주소를 적지 않습니다. 공개해도 되는 이름(별명)을 적습니다';
  if (/^copy-guard@/i.test(by)) return '"copy-guard@…" 는 베끼기 검사 도구만 쓰는 이름입니다. 다른 이름을 적습니다';
  if (/(초등학교|중학교|고등학교|교육청)/.test(by)) return '--by 에 학교·기관 이름을 적지 않습니다. 공개해도 되는 이름(별명)을 적습니다';
  if (by.length > 30) return '--by 는 30자까지 적습니다';
  return undefined;
}
