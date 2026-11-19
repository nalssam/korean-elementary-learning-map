// 명세만 보고 판단할 수 있는 검사. `npm run check`(checks/run.mjs)가 차시마다 부른다.
//
//   factIssues    아이가 읽는 글의 숫자가 그 글이 가리킨 사실에 있는가, 쓰이지 않는 사실이 없는가
//   sourceIssues  출처와 그림의 소장처가 교과서 회사나 누구나 고칠 수 있는 곳이 아닌가, 쓰이지 않는 그림이 없는가
//   factBoxes     사실 대조표(`npm run factsheet`)에 찍을 글 묶음. 사실을 가리키지 않는 글까지 빠짐없이 든다
//
// 형식(schema)이 막지 않고 여기에서 보는 까닭: 쓰는 도중의 초안도 읽어서 미리 볼 수 있어야 한다.
// 숫자가 없는 문장이 사실에서 나오는지는 기계가 알 수 없다. 그것은 사실 대조(fact) 검수가 factBoxes() 의 표를 읽고 본다.
import { factUses, leafBlocksOf, mediaUses } from '../schema/lesson.ts';
import type { Lesson, QuizItem } from '../schema/lesson.ts';
import { childStrings, getFact, teacherStrings } from './content.ts';

// "3·1"·"6·25" 같은 날짜 이름, "8월 15일" 같은 날짜, "70만"·"5천"·"2억"처럼 큰 수를 한글로 적은 것, 세 자리 이상 숫자, "숫자+년/세기"
// (큰 수 꼴을 세 자리 숫자보다 먼저 본다. "100만" 이 "100" 으로 읽히면 "100명"과 구분되지 않는다.)
const NUM = /\d+·\d+|\d+월\s*\d+일|\d+[천만억]+|\d{3,}|\d+(?=\s*(?:년|세기))/g;
/** 글에서 사실과 대조할 숫자를 뽑는다. "1,000" 은 "1000" 으로, "8월 15일" 은 "8월15일" 로 본다. */
export function numbersIn(text: string): string[] {
  return (text.replace(/(\d),(?=\d{3})/g, '$1').match(NUM) ?? []).map((n) => n.replace(/\s+/g, ''));
}

function refs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((v) => refs(v, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
    if (k === 'facts' && Array.isArray(v)) out.push(...(v as string[]));
    else refs(v, out);
  }
  return out;
}

// 문항에서 참이어야 하는 글만. 거짓으로 낸 OX 문장과 고르기의 틀린 보기에는 일부러 틀린 숫자가 들어간다.
function truthsOf(q: QuizItem): string[] {
  if (q.type === 'ox') return q.answer ? [q.q, q.explain] : [q.explain];
  if (q.type === 'choice') return [q.q, q.choices[q.answer - 1], q.explain];
  return [q.q, q.answer, ...q.accept, q.explain];
}
// 문항의 글 전부를 읽는 차례로: 물음, 보기나 답, 풀이
function textsOf(q: QuizItem): string[] {
  if (q.type === 'ox') return [q.q, q.explain];
  if (q.type === 'choice') return [q.q, ...q.choices, q.explain];
  return [q.q, q.answer, ...q.accept, q.explain];
}

/** 글 한 덩어리와 그 글이 가리킨 사실. 사실 대조의 단위다. */
export interface FactBox {
  /** 자리. 예: "slides[3]", "quiz.items[0]", "worksheet", "flow[1]" */
  where: string;
  /** 누가 읽는 글인가. 숫자 대조(factIssues)는 아이가 읽는 글만 본다. */
  reader: 'child' | 'teacher';
  /** 이 자리의 글 전부. 문항은 거짓으로 낸 문장과 틀린 보기까지 든다. */
  texts: string[];
  /** 이 자리가 가리킨 사실 ("f3", "05/f3"). 비어 있으면 아무 사실도 가리키지 않는 글이다. */
  refs: string[];
}

/**
 * 명세의 글을 '사실을 가리키는 단위'로 묶은 것. 사실 대조표(`npm run factsheet`, scripts/factsheet.mjs)가 이것을 찍는다:
 * 사실마다 그것을 가리킨 상자의 글을 나란히 찍고, 끝에 아무 사실도 가리키지 않는 상자(refs 가 빈 것)를 '가리킨 사실 없음'으로 모아 찍는다.
 * 사실을 가리키지 않는 글은 숫자가 없으면 어떤 검사에도 걸리지 않는다. 사실을 말하는 문장이 거기 숨어 있는지는 사실 대조 검수가 그 목록에서 본다.
 *
 * 아이가 읽는 글(childStrings)과 교사가 읽는 글(teacherStrings)은 빠짐없이 어느 상자에 든다.
 * 빼는 것은 대조의 기준이 되는 것뿐이다: 사실의 문장과 출처, 그림의 권리 정보.
 * 묶는 단위: 낱말 풀이 하나, 그림 설명 하나, 읽기 자료 한 편, 수업 화면 한 장(진행 메모는 따로), 학습지 전체(풀이 포함), 퀴즈 문항 하나, 카드 한 장,
 * 그 밖의 선택 자료 하나, 흐름의 단계 하나, 그리고 사실을 가리킬 칸이 없는 교사용 글(소개, 목표, 준비물, 오개념, 평가, 교사 메모, 인쇄 안내).
 */
export function factBoxes(lesson: Lesson): FactBox[] {
  const boxes = new Map<string, FactBox>();
  const put = (where: string, reader: FactBox['reader'], from: unknown, text: string) => {
    let box = boxes.get(where);
    if (!box) boxes.set(where, (box = { where, reader, texts: [], refs: refs(from) }));
    box.texts.push(text);
  };
  const a = lesson.assets as Record<string, unknown>;
  // 글의 경로에서 그 글이 드는 상자를 찾는다. 글 뽑기(lib/content.ts)에 새 칸이 들어오면 맨 아래 줄이 받아서, 어느 상자에도 들지 않는 글이 없다.
  const place = (path: string, text: string) => {
    let m: RegExpExecArray | null;
    if (/^facts\[|^media\.[^.]+\.credit\./.test(path)) return;
    if (path === 'title') put('title', 'child', {}, text);
    else if ((m = /^terms\.new\[(\d+)\]/.exec(path))) put(m[0], 'child', lesson.terms.new[Number(m[1])], text);
    else if ((m = /^media\.([^.]+)\./.exec(path))) put(`media.${m[1]}`, 'child', lesson.media.find((x) => x.id === m![1]), text);
    else if ((m = /^passages\[(\d+)\]/.exec(path))) put(m[0], 'child', lesson.passages[Number(m[1])], text);
    else if ((m = /^slides\[(\d+)\]\.notes$/.exec(path))) put(path, 'teacher', lesson.slides[Number(m[1])], text);
    else if ((m = /^slides\[(\d+)\]/.exec(path))) put(m[0], 'child', lesson.slides[Number(m[1])], text);
    else if (/^worksheet\.print\./.test(path)) put('worksheet.print', 'teacher', {}, text);
    else if (/^worksheet\./.test(path)) put('worksheet', 'child', lesson.worksheet, text);
    else if ((m = /^quiz\.items\[(\d+)\]/.exec(path))) put(m[0], 'child', lesson.quiz.items[Number(m[1])], text);
    else if ((m = /^assets\.(\w+)\.print\./.exec(path))) put(`assets.${m[1]}.print`, 'teacher', {}, text);
    else if ((m = /^assets\.cards\.cards\[(\d+)\]/.exec(path))) put(m[0], 'child', (a.cards as { cards: unknown[] }).cards[Number(m[1])], text);
    else if (/^assets\.cards\./.test(path)) put('assets.cards', 'child', {}, text);
    else if ((m = /^assets\.(\w+)\./.exec(path))) put(`assets.${m[1]}`, 'child', a[m[1]], text);
    else if ((m = /^flow\[(\d+)\]/.exec(path))) put(m[0], 'teacher', lesson.flow[Number(m[1])], text);
    else if ((m = /^(?:misconceptions|teacher_notes)\[\d+\]/.exec(path))) put(m[0], 'teacher', {}, text);
    else put(/^\w+/.exec(path)?.[0] ?? path, 'teacher', {}, text);
  };
  const seen = new Set<string>();
  for (const s of [...childStrings(lesson), ...teacherStrings(lesson)]) {
    if (seen.has(s.path)) continue;
    seen.add(s.path);
    place(s.path, s.text);
  }
  // 문항의 글은 명세에 적힌 칸의 차례가 아니라 읽는 차례로 둔다
  lesson.quiz.items.forEach((q, i) => { const box = boxes.get(`quiz.items[${i}]`); if (box) box.texts = textsOf(q); });
  return [...boxes.values()];
}

/**
 * 사실 대조에서 기계가 볼 수 있는 것.
 *  - 아이가 읽는 글의 숫자(세 자리 이상, "N년"·"N세기", "70만"·"5천" 같은 큰 수, "3·1" 같은 날짜 이름, "8월 15일" 같은 날짜)는 그 글이 가리킨 사실의 문장에 있어야 한다.
 *    글과 사실의 짝은 factBoxes() 의 상자다: 낱말 풀이, 그림 설명, 읽기 자료, 수업 화면 한 장, 학습지 전체(풀이 포함), 퀴즈 문항, 카드 한 장, 그 밖의 선택 자료 하나.
 *    문항에서는 참이어야 하는 글만 본다 (거짓으로 낸 OX 문장과 고르기의 틀린 보기는 뺀다). 차시 이름(title)과 교사가 읽는 글은 보지 않는다.
 *  - 어디에서도 가리키지 않는 사실이 없어야 한다.
 *  - 사실의 문장은 한 문장이어야 한다 (둘이면 따로 확인할 수 있게 나눈다).
 */
export function factIssues(lesson: Lesson): string[] {
  const out: string[] = [];
  const truths = new Map(lesson.quiz.items.map((q, i) => [`quiz.items[${i}]`, truthsOf(q)]));

  for (const b of factBoxes(lesson)) {
    if (b.reader !== 'child' || b.where === 'title') continue;
    const allowed = new Set(b.refs.flatMap((r) => numbersIn(getFact(lesson, r).claim)));
    for (const text of truths.get(b.where) ?? b.texts) for (const n of new Set(numbersIn(text))) {
      if (!allowed.has(n)) out.push(`${b.where}: 숫자 "${n}" 이(가) 가리킨 사실(${b.refs.join(', ') || '없음'})의 문장에 없습니다 — 「${text.length > 40 ? text.slice(0, 40) + '…' : text}」`);
    }
  }

  const used = new Set(factUses(lesson).map((u) => u.ref));
  for (const f of lesson.facts) {
    if (!used.has(f.id)) out.push(`사실 ${f.id}: 어디에서도 가리키지 않습니다. 가리키게 하거나 지웁니다`);
    if (/[.?!]\s+\S/.test(f.claim)) out.push(`사실 ${f.id}: 문장을 하나로 씁니다. 둘이면 사실을 나누어 적습니다`);
  }
  return out;
}

/** 출처·소장처 이름과, 읽기 자료·짧은 글의 source 에 들어 있으면 안 되는 말 (교과서와 지도서는 출처로도 그림으로도 쓰지 않는다) */
export const DENIED_NAME = /비상교육|비바샘|교과서|지도서/;
/** 교과서·수업 자료 회사의 이름. 출처 이름과 제목, 그림의 소장처와 제목, 읽기 자료·짧은 글의 source 에서 찾는다. */
export const DENIED_PUBLISHER = /비상교육|비바샘|visang|천재교육|천재교과서|미래엔|아이스크림|동아출판|지학사|금성출판사|교학사|와이비엠|YBM|티셀파|인디스쿨/i;
/** 공개 출처로 쓰지 않는 곳: 교과서·수업 자료 회사, 누구나 고칠 수 있는 곳, 개인이 올리는 곳. (commons.wikimedia.org 는 그림의 출처로 쓸 수 있다.) */
export const DENIED_HOST = /(^|\.)(vivasam\.com|visang\.com|chunjae\.co\.kr|mirae-n\.com|i-scream\.co\.kr|indischool\.com|wikipedia\.org|namu\.wiki|kin\.naver\.com|blog\.naver\.com|cafe\.naver\.com|tistory\.com|brunch\.co\.kr|blog\.daum\.net|youtube\.com|youtu\.be)$/;

/**
 * 출처와 그림의 소장처가 교과서 회사나 누구나 고칠 수 있는 곳이면 알려 준다.
 * 이름은 출처의 name 과 title, 그림의 holder 와 title, 읽기 자료와 짧은 글(note)의 source 에서 찾는다.
 * (제목에 "교과서"라는 낱말이 들어간 공공 기관 자료는 쓸 수 있다. 예: 우리역사넷의 "교과서 용어 해설")
 * media 에 적어 두고 어디에서도 쓰지 않는 그림도 알려 준다. 쓰지 않아도 /media/ 로 복사되어 공개되는데, 출처 표시는 쓰는 자리에만 찍힌다.
 */
export function sourceIssues(lesson: Lesson): string[] {
  const out: string[] = [];
  const shown = new Set(mediaUses(lesson).map((u) => u.ref));
  for (const m of lesson.media) if (!shown.has(m.id)) out.push(`media.${m.id}: 어디에서도 쓰지 않는 그림입니다. 쓰는 자리를 적거나 media 에서 지웁니다 (쓰지 않아도 사이트에 실리고, 출처 표시는 찍히지 않습니다)`);
  const see = (where: string, name: string, url?: string, title = '') => {
    const byName = DENIED_NAME.test(name) || DENIED_PUBLISHER.test(name);
    if (byName || DENIED_PUBLISHER.test(title)) out.push(`${where}: 교과서 회사의 자료는 출처나 그림으로 쓰지 않습니다 (${byName ? name : `${name} · ${title}`})`);
    const host = url ? new URL(url).hostname : '';
    if (DENIED_HOST.test(host)) out.push(`${where}: 공개 출처로 쓰지 않는 곳입니다 (${host}). 기관이 낸 자료를 찾습니다`);
  };
  for (const f of lesson.facts) for (const s of f.sources) see(`사실 ${f.id}`, s.name, s.url, s.title);
  for (const m of lesson.media) see(`media.${m.id}`, m.credit.holder, m.credit.source_url, m.credit.title);
  for (const p of lesson.passages) see(`passages.${p.id}.source`, p.source);
  for (const { path, block } of leafBlocksOf(lesson.worksheet)) {
    if (block.type === 'note' && block.source) see(`worksheet.pages[${path[2]}].blocks[${path[4]}].source`, block.source);
  }
  return out;
}
