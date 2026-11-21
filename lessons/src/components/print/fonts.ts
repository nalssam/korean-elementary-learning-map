// 인쇄 페이지의 글꼴: 고정 굵기 Pretendard 의 온전한 woff2 파일 몇 개.
//
// 왜 이렇게 하나
//  - 가변 글꼴로 찍으면 Chromium 이 PDF 에 Type 3 글꼴을 수십 벌 넣는다. 고정 굵기 글꼴은 CID 글꼴로 들어가 글을 고르고 찾을 수 있다.
//  - 패키지의 고정 굵기 CSS(pretendard-dynamic-subset.css)는 굵기 아홉 벌을 92조각씩 나눠 woff2·woff 1,700개 남짓(30MB)을 dist 에 내놓았다.
//    인쇄 페이지가 하나도 없는 공개 빌드에도 실렸다 (Vite 는 페이지가 없어도 가져온 CSS 를 처리한다).
//  - 그래서 우리 @font-face 로 실제로 쓰는 굵기의 온전한 파일만 걸고, 파일은 인쇄 페이지가 있는 빌드에서만 dist 에 복사한다 (astro.config.mjs).
//
// 굵기를 더하거나 뺄 때: src/components/print/*.css, 인쇄 페이지의 <style>, generators/papercraft 의 weight 값을 함께 본다.
// 목록에 없는 굵기를 쓰면 브라우저가 가까운 굵기로 그리거나 굵게 흉내 내어(가짜 굵기) 화면과 PDF 가 어긋난다.

/** dist 안의 자리 (사이트 주소로는 href('/_fonts/pretendard/<파일>')). */
export const PRINT_FONT_DIR = '_fonts/pretendard';

/** 인쇄 페이지가 쓰는 굵기와 파일 (pretendard/dist/web/static/woff2/ 의 파일 이름) */
export const PRINT_FONTS: readonly { weight: number; file: string }[] = [
  { weight: 400, file: 'Pretendard-Regular.woff2' },   // 본문
  { weight: 500, file: 'Pretendard-Medium.woff2' },    // 카드 뒷면, 문장 틀, 전개도의 작은 글
  { weight: 600, file: 'Pretendard-SemiBold.woff2' },  // 전개도의 조각 이름, 화면의 인쇄 안내
  { weight: 700, file: 'Pretendard-Bold.woff2' },      // 표 머리, 번호, 표시
  { weight: 800, file: 'Pretendard-ExtraBold.woff2' }, // 쪽 제목, 지시문, 카드 앞면
];

/** 인쇄 페이지의 <head> 에 넣는 @font-face. url 은 href() 로 만든 사이트 안 주소를 받는다 (하위 경로가 붙는다). */
export function printFontFaces(url: (file: string) => string): string {
  // local() 은 쓰지 않는다. 컴퓨터에 깔린 다른 판의 Pretendard 가 끼어들면 화면과 PDF 의 글자 폭이 빌드마다 달라진다.
  return PRINT_FONTS.map(({ weight, file }) =>
    `@font-face{font-family:Pretendard;font-style:normal;font-weight:${weight};font-display:swap;src:url(${url(file)}) format('woff2')}`,
  ).join('');
}
