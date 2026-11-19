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

/** 그림 안의 글이 너무 작은 것으로 일부러 넣은 장 (넘침 시험이 이 장의 이 글만 잡아야 한다) */
export const SMALL_LABEL = { media: 'small-label', text: '덮개돌' } as const;

const L = longText;

/** 바꿔 넣는 장들. 앞에서부터 차례로 장 번호가 붙는다. */
function stressSlides(): Raw[] {
  const pts = (n: number, len: number, seed = 0) => Array.from({ length: n }, (_, i) => L(len, seed + i * 2));
  return [
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2) },
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2), media: 'tall' },
    { layout: 'question', kicker: L(12), title: L(40, 1), hint: L(40, 2), media: 'wide' },
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
    { layout: 'passage', passage: 'long-even' },
    { layout: 'passage', passage: 'long-uneven' },
    { layout: 'activity', title: L(30, 9), instructions: pts(5, 40), minutes: 40, materials: pts(6, 12) },
    { layout: 'activity', title: L(30, 9), instructions: pts(5, 40) },
    { layout: 'quiz', item: 5 },
    { layout: 'quiz', item: 6 },
    { layout: 'quiz', item: 7 },
    { layout: 'quiz', item: 8 },
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
  for (const id of ['wide', 'tall', 'labelled', SMALL_LABEL.media]) {
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
  );
  // 1번 장(표지)도 가장 긴 글로
  raw.slides[0] = { layout: 'title', title: L(30), subtitle: L(40, 1) };
  raw.slides = [...raw.slides.slice(0, 6), ...stressSlides()];
  const last = raw.flow[raw.flow.length - 1];
  last.slides = [7, raw.slides.length];
  return raw.slides.length;
}
