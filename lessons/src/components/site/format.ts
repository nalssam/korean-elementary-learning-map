// 사이트 화면이 같이 쓰는 작은 글 꼴. 파일을 읽지 않는다.

/** "2026-11-20" → "2026년 11월 20일" */
export function koDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 성취기준 코드를 흔히 적는 꼴로. "6사04-01" → "[6사04-01]" */
export const standardCode = (code: string) => `[${code}]`;

/**
 * 출처 제목을 「」로 감싼다. 제목에 이미 낫표가 있으면(사전의 뜻 번호 「1」 같은 것) 감싸지 않고 그대로 둔다.
 * 「유물4 (遺物) 「1」」처럼 낫표가 겹치면 어디까지가 제목인지 읽기 어렵다.
 * "유적8 (遺跡)" → "「유적8 (遺跡)」", "유물4 (遺物) 「1」" → "유물4 (遺物) 「1」"
 */
export function quoteTitle(title: string): string {
  return /[「」『』]/.test(title) ? title : `「${title}」`;
}
