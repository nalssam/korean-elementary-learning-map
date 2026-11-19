// 빌드 2단계: 이번 빌드에 실리는 차시의 그림을 dist/media/<id>/ 로 복사한다 (docs/CONTRACT.md 10절).
//
//   node scripts/sync-media.mjs                 → dist/media/
//   node scripts/sync-media.mjs --out <폴더>    → <폴더>/media/   (환경 변수 DIST_DIR 로도 준다. 둘 다 있으면 인자)
//
// - dist/media/ 를 비우고 다시 채운다. 지난 빌드의 그림(초안의 그림 포함)이 남아 다음 공개 빌드에 섞이지 않는다.
// - visibleLessons() 의 media 에 적힌 파일만 복사한다. media/ 폴더에 있어도 명세에 없는 파일은 복사하지 않는다.
//   공개 빌드에서는 공개된 차시의 그림만, 미리 보기 빌드(SHOW_DRAFTS=1)에서는 초안의 그림까지 실린다.
// - public/ 은 쓰지 않는다. astro build(1단계)가 끝난 dist 에 바로 쓴다.
// 앞 묶음에서 빌려 온 그림("05/rain-gauge")은 그 그림이 적힌 묶음의 폴더(/media/<그 묶음 id>/)에서 나온다.
// 공개된 차시는 공개된 묶음만 가리킬 수 있으므로 그 묶음도 visibleLessons() 에 들어 있다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SpecError, distDir, lessonDir, mediaRoute, visibleLessons } from '#lib/content.ts';

try {
  const dist = distDir();
  const shown = path.relative(ROOT, dist) || dist;
  if (!fs.existsSync(dist)) throw new Error(`${shown} 폴더가 없습니다. 먼저 사이트를 빌드합니다 (astro build). 다른 폴더에 빌드했으면 --out <폴더> 로 알려 줍니다`);

  const media = path.join(dist, 'media');
  fs.rmSync(media, { recursive: true, force: true });

  let files = 0;
  let lessons = 0;
  for (const lesson of visibleLessons()) {
    if (lesson.media.length === 0) continue;
    lessons += 1;
    for (const m of lesson.media) {
      // 사이트 안 주소(/media/<id>/<파일>)와 같은 자리에 둔다. 주소는 mediaRoute() 가 정한다.
      const to = path.join(dist, ...mediaRoute(lesson, m.id).split('/').filter(Boolean));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(lessonDir(lesson.id), m.file), to);
      files += 1;
    }
  }
  console.log(`그림 ${files}개를 ${path.join(shown, 'media')}/ 로 복사했습니다 (차시 묶음 ${lessons}개)`);
} catch (e) {
  // 명세에 고칠 곳이 있으면 로더가 알려 준 글을 그대로 보여 준다
  console.error(e instanceof SpecError ? e.message : `그림을 복사하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
