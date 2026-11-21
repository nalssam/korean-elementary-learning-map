// 넘침 시험용 명세: 형식이 허락하는 가장 긴 글로 모든 layout 을 채운 장들.
// 시험용 두 차시 묶음(5-2/1/02-03)의 복사본을 고쳐 만든다. 1번 장과 7번 장부터 끝까지를 이 장들로 바꾼다.
import fs from 'node:fs';
import path from 'node:path';
import { longText } from './helpers.ts';

type Raw = Record<string, any>;
export const STRESS_ID = '5-2/1/02-03';

/** 가로로 긴 그림과 세로로 긴 그림 (직접 그린 도해) */
const svg = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="#e3f0ec" stroke="#132c3d" stroke-width="8"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="none" stroke="#18766b" stroke-width="8"/></svg>`;

/**
 * 글이 든 도해 (600 × 380). 그림 안의 글자 크기는 label 단위다.
 * 22 단위 글은 단계 장의 칸에 줄여 그리면 28px 보다 작아진다 (slideProblems 가 잡아야 하는 것).
 */
const labelled = (label: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380"><rect x="4" y="4" width="592" height="372" fill="#e3f0ec" stroke="#132c3d" stroke-width="6"/><rect x="200" y="200" width="200" height="40" fill="#d8d2c4" stroke="#132c3d" stroke-width="4"/><g font-family="Pretendard, sans-serif" fill="#132c3d"><text x="300" y="170" font-size="${label}" text-anchor="middle">덮개돌</text></g></svg>`;

/**
 * 단계 그림 (R22): 2 × 2 칸의 그림 상자에 맞게 가로로 넓게 그린 도해 (viewBox 780 × 300, 2.6:1).
 * 내용 담당이 고쳐 그리는 고인돌 단계 그림과 같은 꼴의 대역이다. 글은 40 단위라서 상자에 맞춰 줄여 그려도 28px 을 넘는다.
 */
const stepDrawing = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 300"><rect x="3" y="3" width="774" height="294" fill="#fbfaf6" stroke="#132c3d" stroke-width="6"/><path d="M40 250 H740" stroke="#132c3d" stroke-width="6"/><rect x="${200 + n * 60}" y="130" width="60" height="120" fill="#d8d2c4" stroke="#132c3d" stroke-width="5"/><rect x="${420 + n * 20}" y="130" width="60" height="120" fill="#d8d2c4" stroke="#132c3d" stroke-width="5"/><g font-family="Pretendard, sans-serif" fill="#132c3d" font-weight="700"><text x="390" y="90" font-size="40" text-anchor="middle">받침돌</text></g></svg>`;

/** 정사각형 도해 (단계 장의 그림 상자에 꼴이 다른 그림이 들어갈 때) */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="4" y="4" width="392" height="392" fill="#e3f0ec" stroke="#132c3d" stroke-width="8"/><circle cx="200" cy="200" r="120" fill="none" stroke="#18766b" stroke-width="8"/></svg>`;

/** 실제 차시(5-2/1/01) 10번 장의 단계 글 넷 (R21: 차례 카드와 같은 글). 1920 무대에서 머리 한 줄에 40px 이상으로 들어가야 한다. */
export const DOLMEN_STEPS = ['받침돌을 세웁니다.', '흙을 쌓아 비탈을 만듭니다.', '덮개돌을 비탈 위로 끌어 올립니다.', '흙을 걷어 냅니다.'] as const;
export const STEP_LABELS = ['하나', '둘', '셋', '넷'] as const;

/** 실제 차시 8번 장의 할 일 셋. 모두 한 줄이다 (첫 줄은 52px 에서 상자 폭의 97% 남짓으로 길다) */
export const EVEN_ITEMS = ['차례 카드 네 장을 모둠이 정한 차례로 놓습니다.', '카드를 놓은 차례대로 조각을 움직여 봅니다.', '차례와 그 까닭을 학습지 1쪽에 적습니다.'] as const;

/** 그림 안의 글이 너무 작은 것으로 일부러 넣은 장 (넘침 시험이 이 장의 이 글만 잡아야 한다) */
export const SMALL_LABEL = { media: 'small-label', text: '덮개돌' } as const;

const L = longText;

/** 닫는 따옴표 뒤에 조사가 붙은 퀴즈 문제 (넘침 시험용 명세의 마지막 퀴즈 장) */
export const QUOTED_QUESTION = '옛 그릇을 보고 한 말 가운데 ‘눈으로 본 것’은 무엇인가요?';

/** 바꿔 넣는 장들. 앞에서부터 차례로 장 번호가 붙는다. */
function stressSlides(): Raw[] {
  const pts = (n: number, len: number, seed = 0) => Array.from({ length: n }, (_, i) => L(len, seed + i * 2));
  return [
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2) },
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2), media: 'tall' },
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2), media: 'wide' },
    // 글 곁에 보통 비율(600 × 380)의 그림 하나 (R12): 짧은 글과 가장 긴 글
    { layout: 'question', title: '길은 어디로 이어질까요?', media: 'labelled' },
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2), media: 'labelled' },
    { layout: 'points', title: L(16, 5), points: ['바닥판 위에 받침돌 두 개를 세웁니다.', '덮개돌을 그 위에 얹습니다.'], media: 'labelled' },
    { layout: 'points', title: L(30, 5), points: pts(4, 40, 1), media: 'labelled' },
    { layout: 'picture', title: L(30, 3), media: 'wide', caption: L(40, 4) },
    { layout: 'picture', title: L(30, 3), media: 'tall', caption: L(40, 4) },
    { layout: 'points', title: L(30, 5), points: pts(4, 40) },
    { layout: 'points', title: L(30, 5), points: pts(4, 40, 1), media: 'tall' },
    { layout: 'points', title: L(30, 5), points: pts(4, 40, 1), media: 'wide' },
    { layout: 'compare', title: L(30, 6), left: { label: L(12), points: pts(4, 30) }, right: { label: L(12, 3), points: pts(4, 30, 1) } },
    { layout: 'compare', title: L(30, 6), left: { label: L(12), points: pts(4, 30), media: 'wide' }, right: { label: L(12, 3), points: pts(4, 30, 1), media: 'tall' } },
    { layout: 'steps', title: L(30, 7), steps: Array.from({ length: 5 }, (_, i) => ({ label: L(6, i), text: L(40, i) })) },
    { layout: 'steps', title: L(30, 7), steps: Array.from({ length: 5 }, (_, i) => ({ label: L(6, i), text: L(40, i), media: i % 2 ? 'tall' : 'wide' })) },
    { layout: 'steps', title: L(30, 7), steps: Array.from({ length: 2 }, (_, i) => ({ label: L(6, i), text: L(40, i), media: 'wide' })) },
    { layout: 'term', term: L(14), example: L(60, 8) },
    // 그림 셋·넷 (그림 안에 글이 든 도해). 넷째 장의 둘째 그림은 글자가 22 단위라서 줄여 그리면 28px 보다 작다.
    { layout: 'steps', title: L(30, 7), steps: Array.from({ length: 3 }, (_, i) => ({ label: L(6, i), text: L(40, i), media: 'labelled' })) },
    { layout: 'steps', title: L(30, 7), steps: Array.from({ length: 4 }, (_, i) => ({ label: L(6, i), text: L(40, i), media: i === 1 ? SMALL_LABEL.media : 'labelled' })) },
    { layout: 'steps', title: L(20, 7), steps: Array.from({ length: 4 }, (_, i) => ({ label: L(3, i), text: L(16, i), media: 'labelled' })) },
    // R22: 실제 차시의 단계 글 넷과 가로로 넓은 단계 그림(780 × 300)
    { layout: 'steps', title: '이렇게 올렸다는 짐작이 있습니다', steps: DOLMEN_STEPS.map((text, i) => ({ label: STEP_LABELS[i], text, media: `step${i + 1}` })) },
    // R22: 꼴이 다른 그림(사진, 정사각형 도해, 넓은 도해)도 상자 안에 contain 으로 가운데 놓인다
    { layout: 'steps', title: '이렇게 올렸다는 짐작이 있습니다', steps: DOLMEN_STEPS.map((text, i) => ({ label: STEP_LABELS[i], text, media: ['sample', 'square', 'step1', 'tall'][i] })) },
    // R23b: 쪽마다 그림 하나, 항목 수와 그림 꼴이 다른 두 쪽 (출처 표시와 첫 항목이 같은 높이에 서야 한다)
    { layout: 'compare', title: '박물관의 짐작과 견주어 봅시다', left: { label: '그릇', points: ['본 것: 아래쪽에 작은 구멍이 있다.', '짐작: 깨진 곳을 고쳐 쓴 흔적으로 본다.'], media: 'square' }, right: { label: '돌 도구', points: ['본 것: 끝이 뾰족하고 가장자리에 날이 있다.', '짐작: 여러 가지 일에 썼다고 본다.', '짐작: 주로 큰 동물을 가르는 데 썼다고 본다.'], media: 'sample' } },
    // R23a: 두 쪽이 함께 보는 그림 하나. 상자 둘을 그림 곁에 쌓으므로 쪽마다 항목 둘(가장 긴 글)까지 들어간다.
    // 셋 이상은 어느 크기로도 들어가지 않는다 (형식에서 막아 달라고 계약 담당에게 부탁했다)
    { layout: 'compare', title: L(30, 6), media: 'labelled', left: { label: L(12), points: pts(2, 30) }, right: { label: L(12, 3), points: pts(2, 30, 1) } },
    { layout: 'passage', passage: 'long-even' },
    { layout: 'passage', passage: 'long-uneven' },
    { layout: 'activity', title: L(30, 9), instructions: pts(5, 40), minutes: 40, materials: pts(6, 12) },
    { layout: 'activity', title: L(30, 9), instructions: pts(5, 40) },
    // 한 줄에 들어가는 할 일 셋 (실제 차시 8번 장). PPTX 에서 항목 사이가 고르게 벌어져야 한다 (한 줄짜리에 두 줄 상자를 주지 않는다)
    { layout: 'activity', title: '덮개돌을 올린 차례를 짐작해 봅시다', instructions: [...EVEN_ITEMS], minutes: 4 },
    { layout: 'quiz', item: 5 },
    { layout: 'quiz', item: 6 },
    { layout: 'quiz', item: 7 },
    { layout: 'quiz', item: 8 },
    { layout: 'quiz', item: 9 },
    { layout: 'title', title: L(30, 10), subtitle: L(40, 11) },
    { layout: 'closing', title: L(30, 12), points: pts(3, 40) },
    { layout: 'closing', title: L(30, 12) },
  ];
}

/** 시험용 명세 복사본(dir)의 두 차시 묶음을 넘침 시험용으로 고친다. 고친 뒤의 장 수를 돌려준다. */
export function makeStress(dir: string, raw: Raw): number {
  const media = path.join(dir, ...STRESS_ID.split('/'), 'media');
  fs.writeFileSync(path.join(media, 'wide.svg'), svg(1600, 400));
  fs.writeFileSync(path.join(media, 'tall.svg'), svg(400, 1600));
  fs.writeFileSync(path.join(media, 'labelled.svg'), labelled(60));
  fs.writeFileSync(path.join(media, `${SMALL_LABEL.media}.svg`), labelled(22));
  for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(media, `step${i}.svg`), stepDrawing(i));
  fs.writeFileSync(path.join(media, 'square.svg'), square);
  for (const id of ['wide', 'tall', 'labelled', SMALL_LABEL.media, 'square', 'step1', 'step2', 'step3', 'step4']) {
    raw.media.push({ id, kind: 'diagram', file: `media/${id}.svg`, alt: L(20), caption: L(40), credit: { holder: L(30), licence: 'original' }, facts: ['f1'] });
  }
  raw.terms.new.push({ term: L(14), meaning: L(50, 2), facts: ['f1'] });
  const even = Array.from({ length: 4 }, (_, i) => L(75, i * 3));
  const uneven = [L(93, 1), L(93, 4), L(93, 7), L(21, 2)];
  raw.passages.push({ id: 'long-even', title: L(30, 2), text: even, source: L(60, 5), facts: ['f1'] });
  raw.passages.push({ id: 'long-uneven', title: L(30, 3), text: uneven, source: L(60, 6), facts: ['f1'] });
  raw.quiz.items.push(
    { type: 'choice', q: L(80), choices: [L(30, 1), L(30, 2), L(30, 3), L(30, 4)], answer: 4, explain: L(120), facts: ['f1'] },
    { type: 'choice', q: L(80, 2), choices: [L(30, 5), L(30, 6), L(30, 7)], answer: 2, explain: L(40), facts: ['f1'] },
    { type: 'ox', q: L(80, 3), answer: false, explain: L(40), facts: ['f1'] },
    { type: 'short', q: L(80, 4), answer: L(14), explain: L(40), facts: ['f1'] },
    // 닫는 따옴표 바로 뒤의 조사 (R18): 화면에서 ’ 와 은 이 다른 줄로 갈리지 않아야 한다
    { type: 'choice', q: QUOTED_QUESTION, choices: ['아래쪽에 작은 구멍이 있다.', '깨진 곳을 고쳐 썼을 것이다.', '물을 담아 두었을 것이다.'], answer: 1, explain: L(40), facts: ['f1'] },
  );
  // 1번 장(표지)도 가장 긴 글로
  raw.slides[0] = { layout: 'title', title: L(30), subtitle: L(40, 1) };
  raw.slides = [...raw.slides.slice(0, 6), ...stressSlides()];
  const last = raw.flow[raw.flow.length - 1];
  last.slides = [7, raw.slides.length];
  return raw.slides.length;
}
