// 장 컴포넌트가 받는 값의 꼴
import type { Lesson, Slide } from '#schema/lesson.ts';

/** layout 하나에 해당하는 장 */
export type SlideOf<L extends Slide['layout']> = Extract<Slide, { layout: L }>;
export interface SlideProps<L extends Slide['layout']> {
  lesson: Lesson; slide: SlideOf<L>; no: number;
  /** 제목 위에 찍는 흐름 단계 머리말 ("01 도입"). 제 머리말이 없는 장만 받는다 (R55, counter.ts 의 slideFrame) */
  phase?: string;
}
