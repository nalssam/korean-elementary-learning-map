import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SITE_URL    : 배포 주소 (예: https://nalssam.github.io). QR 과 PPTX 에 박히는 주소가 여기에서 나온다. 하위 경로는 넣지 않는다.
// SITE_BASE   : 하위 경로에 놓일 때 (예: /korean-elementary)
// SHOW_DRAFTS : 1 이면 초안도 싣는 미리 보기 빌드. 배포 워크플로는 쓰지 않는다.

// astro dev 는 명세를 고치며 보는 자리라서 늘 초안을 보여 준다. (끄려면 SHOW_DRAFTS=0 astro dev)
// 명령이 dev 일 때만이다. `astro build --mode dev` 나 `--outDir dev` 처럼 다른 자리에 'dev' 가 있어도 켜지지 않는다.
if (process.argv[2] === 'dev') process.env.SHOW_DRAFTS ??= '1';

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' };

// astro dev 에서만 도는 플러그인. 두 가지를 한다.
// ① 명세가 바뀌면 주소 목록을 다시 만들게 한다. ② /media/<id>/<파일> 을 content/<id>/media/ 에서 바로 내준다.
// 그래서 dev 는 그림을 복사해 둘 필요가 없다.
// 빌드에서는 astro build 뒤에 scripts/sync-media.mjs 가 이번 빌드에 실리는 차시의 그림만 dist/media/ 로 바로 복사한다 (public/ 은 쓰지 않는다).
// 초안의 그림이 어딘가에 남아 다음 공개 빌드에 섞이는 일이 없고, 같이 도는 시험들이 한 폴더를 두고 다투지 않는다 (docs/CONTRACT.md 10절).
const devMedia = {
  name: 'dev-media',
  configureServer(server) {
    const content = process.env.CONTENT_DIR ? path.resolve(root, process.env.CONTENT_DIR) : path.join(root, 'content');
    // 명세나 차시표(.yaml)를 더하거나 고치거나 지우면 Astro 가 붙들고 있는 getStaticPaths() 결과를 버리게 하고 열린 화면을 새로 읽는다.
    // (이것이 없으면 새로 만든 묶음과 방금 ready 로 바꾼 자료의 주소가 dev 를 다시 켤 때까지 404 로 남고, skip 으로 바꾼 자료의 주소는 빈 화면으로 남는다.)
    server.watcher.add(content);
    const refresh = (file) => {
      if (!file.startsWith(content + path.sep) || !file.endsWith('.yaml')) return;
      for (const env of Object.values(server.environments)) if (env.name !== 'client') env.hot.send('astro:content-changed', {});
      server.environments.client.hot.send({ type: 'full-reload', path: '*' });
    };
    for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, refresh);
    server.middlewares.use((req, res, next) => {
      const base = (process.env.SITE_BASE ?? '').replace(/\/+$/, '');
      const url = decodeURIComponent((req.url ?? '').split('?')[0]);
      const m = /^\/media\/([0-9]-[0-9]\/[0-9]{1,2}\/[0-9]{2}(?:-[0-9]{2})?)\/([a-z0-9-]+\.(svg|png|jpg))$/.exec(url.startsWith(base) ? url.slice(base.length) : url);
      if (!m) return next();
      const file = path.join(content, m[1], 'media', m[2]);
      if (!fs.existsSync(file)) return next();
      res.setHeader('Content-Type', TYPES[m[3]]);
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(file).pipe(res);
    });
  },
};

// 빈 글(값을 넣지 않은 CI 변수)은 주지 않은 것으로 본다. lib/content.ts 의 absoluteUrl() 과 같은 규칙이다.
const site = process.env.SITE_URL || 'http://localhost:4321';
// Astro 는 주소 꼴이 아니면 "Invalid URL" 한 줄만 남기고 멈춘다. 무엇을 고칠지 알려 준다. (하위 경로가 든 SITE_URL 은 absoluteUrl() 이 막는다.)
if (!URL.canParse(site)) throw new Error(`SITE_URL 이 웹 주소가 아닙니다 (지금: ${site}). https:// 로 시작하는 배포 주소를 줍니다 (예: SITE_URL=https://nalssam.github.io)`);

// 주소 별칭은 package.json 의 "imports" (#lib/*, #schema/*, #src/*) 에만 둔다. Node 스크립트와 Astro 가 같은 주소를 쓴다.
export default defineConfig({
  site,
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { plugins: [devMedia] },
});
