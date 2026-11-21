// 계약 시험용 사이트. 저장소의 astro.config.mjs 를 그대로 쓰고, 만든 것을 .cache/ 아래에 두게만 한다.
// tests/contract/frame.test.ts 가 `astro build --root` 로 이 폴더를 빌드해 Base.astro·Media.astro·lessonPaths() 를 확인하고,
// tests/contract/print.test.ts 가 인쇄 페이지를 Chromium 으로 열어 넘침 조건을 재 본다.
import { fileURLToPath } from 'node:url';
import config from '../../../../astro.config.mjs';

const cache = fileURLToPath(new URL('../../../../.cache/tests/frame-cache/', import.meta.url));
export default { ...config, cacheDir: cache, vite: { ...config.vite, cacheDir: cache + 'vite' } };
