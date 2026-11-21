// 표지에 찍는 차시표 값. 웹 무대(TitleSlide.astro)와 PPTX(generators/pptx/build.mjs)가 같은 글을 쓴다.
// AI 사용 표시·초안 표시(footerNotice)는 표지를 포함한 모든 장의 바닥글 줄(stageFooter)에 있으므로 표지에 따로 찍지 않는다 (R55).
import { bundleOf, lessonsLabel, pagesLabel, semesterLabel } from '#lib/content.ts';
import type { Lesson } from '#schema/lesson.ts';

export function coverText(lesson: Lesson): { kicker: string; meta: string } {
  const b = bundleOf(lesson);
  return {
    kicker: `${semesterLabel(b.semester.id)} · ${b.unit.no}단원`,
    meta: `${b.unit.title} · ${lessonsLabel(b.lessons)} · 교과서 ${pagesLabel(b.pages)}`,
  };
}
