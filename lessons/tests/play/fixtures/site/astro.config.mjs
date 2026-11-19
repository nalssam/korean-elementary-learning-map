// 활동 시험용 사이트. 저장소의 astro.config.mjs 를 그대로 쓰고, 페이지는 저장소의 퀴즈·웹 활동 페이지와 같은 두 파일만 둔다.
// 다른 담당의 페이지와 떼어 빌드하려고 따로 두었다. 만든 것은 .cache/ 아래에만 둔다.
import { fileURLToPath } from 'node:url';
import config from '../../../../astro.config.mjs';

const cache = fileURLToPath(new URL('../../../../.cache/tests/play-cache/', import.meta.url));
export default { ...config, cacheDir: cache, vite: { ...config.vite, cacheDir: cache + 'vite' } };
