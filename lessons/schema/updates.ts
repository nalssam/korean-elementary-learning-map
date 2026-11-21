// content/updates.yaml 형식: 사이트의 업데이트 소식 (/updates/, 첫 화면의 '최근 올라온 자료'. R49).
//
// 파일은 소식을 늘어놓은 목록 하나다. 차례는 아무래도 되고, 사이트는 날짜가 늦은 것부터 보여 준다 (visibleUpdates()).
// 차시를 가리키는 소식(lessons)은 가리킨 차시가 모두 이번 빌드에 실릴 때만 보인다. 그래서 초안의 소식을 미리 적어 두어도 공개 빌드에 새지 않는다.
// 차시를 더하는 PR 은 명세와 함께 이 파일에 한 줄을 더한다 (docs/CONTRACT.md 10절의 npm run new 가 알려 준다).
import { z } from 'zod';
import { DateStr, LessonId, T } from './common.ts';

export const UPDATE_KINDS = ['new', 'fix', 'notice'] as const;
/** new 새 자료 · fix 고침 · notice 알림. 화면의 이름은 lib/site.ts 의 UPDATE_LABEL */
export const UpdateKind = z.enum(UPDATE_KINDS, { error: 'kind 에는 new(새 자료), fix(고침), notice(알림) 가운데 하나를 씁니다' });
export type UpdateKind = z.infer<typeof UpdateKind>;

export const UpdateEntry = z.strictObject({
  /** 올린 날. "2026-11-21" */
  date: DateStr,
  kind: UpdateKind,
  /** 한 줄 제목. 무엇이 올라왔거나 바뀌었는지를 씁니다. */
  title: T(50),
  /** 덧붙이는 말. 한두 문장으로 씁니다. */
  body: T(300).optional(),
  /** 이 소식이 말하는 차시 묶음 id. 차시표(registry.yaml)에 있는 id 만 씁니다. 예: ["5-2/1/01"] */
  lessons: z.array(LessonId).min(1, '가리키는 차시가 없으면 lessons 칸을 지웁니다').optional(),
});
export type UpdateEntry = z.infer<typeof UpdateEntry>;

export const Updates = z.array(UpdateEntry, { error: '업데이트 소식은 "- date: …" 로 시작하는 목록으로 적습니다' });
export type Updates = z.infer<typeof Updates>;
