// 표지에 찍는 차시표 값. 웹 무대(TitleSlide.astro)와 PPTX(generators/pptx/build.mjs)가 같은 글을 쓴다.
import { bundleOf, footerNotice, lessonsLabel, pagesLabel, semesterLabel } from '#lib/content.ts';
import type { Lesson } from '#schema/lesson.ts';

export function coverText(lesson: Lesson): { kicker: string; meta: string; notice: string } {
  const b = bundleOf(lesson);
  return {
    kicker: `${semesterLabel(b.semester.id)} · ${b.unit.no}단원`,
    meta: `${b.unit.title} · ${lessonsLabel(b.lessons)} · 교과서 ${pagesLabel(b.pages)}`,
    // AI 사용 표시·초안 표시. 1번 장(표지)에 찍는다 (docs/CONTRACT.md 6·8절).
    notice: footerNotice(lesson),
  };
}
