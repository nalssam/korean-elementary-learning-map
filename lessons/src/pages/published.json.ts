// /published.json: 공개된 묶음 id 의 JSON 배열, 차시표 순서. 감싸는 칸이 없다: ["5-2/1/01","5-2/1/02-03"] (docs/CONTRACT.md 3절).
// 배포 워크플로가 지금 사이트의 이 파일과 새 빌드의 이 파일을 견주어, 새로 공개되는 묶음과 사이트에서 빠지는 묶음을 배포 요약에 적는다.
// 미리 보기 빌드(SHOW_DRAFTS=1)에서도 공개된 묶음만 나온다.
import { isPublic, visibleLessons } from '#lib/content.ts';

export function GET(): Response {
  const ids = visibleLessons().filter(isPublic).map((l) => l.id);
  return new Response(JSON.stringify(ids), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
