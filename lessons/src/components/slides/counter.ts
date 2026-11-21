// 장 번호와 장마다 찍는 바닥글 줄·단계 머리말 (R55). 웹 무대(Slide.astro, Stage.astro)와 PPTX(generators/pptx/build.mjs)가 같은 글을 쓴다.
// 장 번호는 두 자리로 채운다: 한 차시 묶음은 "05 / 20", 두 차시 묶음은 차시마다 따로 세어 "3차시 01 / 04" (둘째 차시 표지가 "05 / 08" 로 보이지 않게).
import { flowByLesson, slidePhase, stageFooter } from '#lib/content.ts';
import type { Lesson, Slide } from '#schema/lesson.ts';

export interface SlidePart {
  /** 차시 번호. 한 차시 묶음이면 없다 */
  lesson?: number;
  /** 이 차시의 첫 장과 끝 장 (묶음 전체의 번호, 1부터) */
  first: number;
  last: number;
}

/** 묶음의 장을 차시별로 나눈다. 수업 화면을 쓰는 차시가 하나뿐이면 한 덩어리다. */
export function slideParts(lesson: Lesson): SlidePart[] {
  const total = lesson.slides.length;
  const starts = flowByLesson(lesson).filter((f) => f.firstSlide !== undefined).map((f) => ({ lesson: f.lesson, first: f.firstSlide! }));
  starts.sort((a, b) => a.first - b.first);
  if (starts.length < 2) return [{ first: 1, last: total }];
  // 첫 차시는 1번 장부터 (표지가 흐름 단계 앞에 있어도 그 차시에 넣는다)
  starts[0].first = 1;
  return starts.map((s, i) => ({ lesson: s.lesson, first: s.first, last: i + 1 < starts.length ? starts[i + 1].first - 1 : total }));
}

const two = (n: number) => String(n).padStart(2, '0');

/** no 번 장(1부터)이 든 덩어리와 그 장의 번호 글. 예: "05 / 20", "3차시 01 / 04" */
export function slideCounter(lesson: Lesson, no: number): { text: string; part: SlidePart } {
  const parts = slideParts(lesson);
  const part = [...parts].reverse().find((p) => p.first <= no) ?? parts[0];
  const n = no - part.first + 1;
  const of = part.last - part.first + 1;
  return { text: `${part.lesson !== undefined ? `${part.lesson}차시 ` : ''}${two(n)} / ${two(of)}`, part };
}

/** 제 머리말이 없어 흐름 단계의 머리말("01 도입")을 제목 위에 찍는 장 (R55). 낱말·퀴즈·질문·마무리 장과 표지는 제 것을 쓴다. */
export const PHASE_LAYOUTS: readonly Slide['layout'][] = ['picture', 'points', 'compare', 'steps', 'passage', 'activity'];

/**
 * no 번 장의 둘레에 찍는 글 (R55).
 *  - footer: 왼쪽 아래 바닥글 줄 (stageFooter). 표지를 포함한 모든 장
 *  - counter: 오른쪽 아래 장 번호. 표지(두 차시 묶음의 둘째 표지도)에는 없다
 *  - phase: 제목 위의 단계 머리말 ("01 도입"). PHASE_LAYOUTS 이고 어느 흐름 단계의 slides 에 든 장만
 */
export function slideFrame(lesson: Lesson, no: number): { footer: string; counter?: string; phase?: string } {
  const slide = lesson.slides[no - 1];
  return {
    footer: stageFooter(lesson),
    counter: slide.layout === 'title' ? undefined : slideCounter(lesson, no).text,
    phase: PHASE_LAYOUTS.includes(slide.layout) ? slidePhase(lesson, no)?.kicker : undefined,
  };
}
