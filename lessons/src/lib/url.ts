// 사이트 안 주소 만들기. 사이트가 하위 경로(예: /korean-elementary/)에 놓여도 링크가 깨지지 않게 한다.
// 링크·그림·파일 주소는 모두 이 함수를 거친다. Astro 페이지에서도 Node 스크립트에서도 똑같이 돈다.
//
// 종이에 박히는 온전한 주소(QR, PPTX, 인쇄물 바닥글)는 이것이 아니라 lib/content.ts 의 absoluteUrl() 로 만든다.

/** href('/5-2/') → '/5-2/' 또는 '/korean-elementary/5-2/' */
export function href(path = '/'): string {
  // Astro(Vite) 안에서는 import.meta.env.BASE_URL, Node 에서는 환경 변수 SITE_BASE 가 하위 경로다.
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  const base = '/' + (env?.BASE_URL ?? process.env.SITE_BASE ?? '').replace(/^\/+|\/+$/g, '');
  return (base === '/' ? '' : base) + (path.startsWith('/') ? path : `/${path}`);
}
