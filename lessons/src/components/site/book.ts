// 교과서 목차·단원·차시 자료실(R44~R46)이 같이 쓰는 셈. 빌드할 때만 돈다 (lib/content.ts 는 파일을 읽는다).
// 차시표와 이번 빌드에 실리는 차시에서만 값을 얻는다. 명세에 없는 것을 만들어 내지 않는다 (docs/CONTRACT.md 4절).
import { isPublic, shownMedia, worksheetKey } from '#lib/content.ts';
import type { Progress } from '#lib/content.ts';
import { PERIOD_MINUTES } from '#schema/lesson.ts';
import type { Lesson } from '#schema/lesson.ts';
import { allRows, factRefs } from './data.ts';
import type { Row } from './data.ts';

/** 한 학기의 묶음 전부, 차시표 차례. 실리지 않는 묶음에는 lesson 이 없다. */
export const semesterRows = (semester: string): Row[] => allRows().filter((r) => r.ref.semester.id === semester);

/** "N/M 차시 공개". 묶음이 아니라 차시를 센다 (docs/CONTRACT.md 3절). */
export const progressText = (p: Progress) => `${p.published}/${p.total} 차시 공개`;

/** 진행 막대의 폭(%): 공개, 그 뒤에 초안(미리 보기 빌드에서만 0 이 아니다) */
export function progressWidths(p: Progress): { published: number; draft: number } {
  if (p.total === 0) return { published: 0, draft: 0 };
  return { published: (100 * p.published) / p.total, draft: (100 * p.draft) / p.total };
}

/** 차시 상태 표의 값. 실리는 묶음만 published·draft 이고, 나머지는 planned 다. */
export const rowState = (row: Row): 'published' | 'draft' | 'planned' => (row.lesson ? (isPublic(row.lesson) ? 'published' : 'draft') : 'planned');

/** 수업 시간: 한 차시는 40분, 두 차시 묶음은 80분 (2차시) */
export function lessonTime(count: number): string {
  return count > 1 ? `${PERIOD_MINUTES * count}분 (${count}차시)` : `${PERIOD_MINUTES}분`;
}

/** 차시 자료실의 교사용 안내에서 길잡이가 가리키는 자리 (R46). 내용이 있는 것만, 페이지에 놓인 차례대로. */
export interface GuideSection { id: string; label: string }

/**
 * 교사용 안내의 길잡이 (R46): 준비물, 수업 흐름, 문항과 정답, 학습지 풀이, 예상되는 오개념, 평가, 교사 메모, 사실과 출처, 그림 출처.
 * 접힌 상자(Fold)를 가리키는 것은 그 상자가 그려질 때만 넣는다 (KitTeacher 와 같은 조건).
 */
export function guideSections(lesson: Lesson): GuideSection[] {
  const out: GuideSection[] = [
    { id: 'prepare', label: '준비물' },
    { id: 'flow', label: '수업 흐름' },
    { id: 'quiz-key', label: '문항과 정답' },
  ];
  if (worksheetKey(lesson).length > 0) out.push({ id: 'worksheet-key', label: '학습지 풀이' });
  if (lesson.misconceptions.length > 0) out.push({ id: 'misconceptions', label: '예상되는 오개념' });
  if (lesson.assessment) out.push({ id: 'assessment', label: '평가' });
  if (lesson.teacher_notes.length > 0) out.push({ id: 'notes', label: '교사 메모' });
  if (factRefs(lesson).length > 0) out.push({ id: 'facts', label: '사실과 출처' });
  if (shownMedia(lesson).length > 0) out.push({ id: 'credits', label: '그림 출처' });
  return out;
}
