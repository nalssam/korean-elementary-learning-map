// 사이트 화면이 같이 쓰는 작은 글 꼴. 파일을 읽지 않는다.

/** "2026-11-20" → "2026년 11월 20일" */
export function koDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 성취기준 코드를 흔히 적는 꼴로. "6사04-01" → "[6사04-01]" */
export const standardCode = (code: string) => `[${code}]`;
