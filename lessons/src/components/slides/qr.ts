// 수업 화면의 QR 창(R25)에 싣는 학생 페이지. 차시 안내 페이지(KitStudent.astro)와 같은 주소를 같은 absoluteUrl() 로 만든다.
// 안내 페이지의 다른 것(학습지, 인쇄물 등)은 싣지 않는다.
import { absoluteUrl, lessonRoute } from '#lib/content.ts';
import { ASSET_LABEL, ASSET_ROUTE } from '#lib/site.ts';
import type { Lesson } from '#schema/lesson.ts';

export interface StudentPage {
  kind: 'quiz' | 'web_activity';
  /** 페이지 이름. 예: "확인 퀴즈" */
  name: string;
  /** 종이와 화면에 박히는 온전한 주소 (QR 에 담는 글) */
  url: string;
}

/** 이 차시에 준비된 학생 페이지. 확인 퀴즈는 모든 차시에 있고(형식이 문항 셋 이상을 요구한다), 웹 활동은 ready 일 때만. */
export function studentPages(lesson: Lesson): StudentPage[] {
  const out: StudentPage[] = [];
  if (lesson.quiz.items.length > 0) out.push({ kind: 'quiz', name: ASSET_LABEL.quiz, url: absoluteUrl(lessonRoute(lesson.id, ASSET_ROUTE.quiz)) });
  if (lesson.assets.web_activity.state === 'ready') {
    out.push({ kind: 'web_activity', name: ASSET_LABEL.web_activity, url: absoluteUrl(lessonRoute(lesson.id, ASSET_ROUTE.web_activity)) });
  }
  return out;
}
