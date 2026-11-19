// 학생 페이지(확인 퀴즈·웹 활동)가 빌드할 때와 브라우저에서 함께 쓰는 작은 셈.
// 파일을 읽지 않으므로 브라우저 스크립트도 가져다 쓸 수 있다. 시험(tests/play/)도 이 파일을 바로 부른다.

/** 단답 채점용으로 글을 고른다: 앞뒤 공백을 떼고 안쪽 공백을 모두 없앤다 (docs/CONTRACT.md 9절). 그 밖의 것은 바꾸지 않는다. */
export function normalizeShort(s: string): string {
  return s.trim().replace(/\s+/g, '');
}

/** 단답이 맞았는가. answer 와 accept 도 같은 규칙으로 고른 뒤 견준다. 빈 답은 늘 틀린다. */
export function markShort(input: string, answer: string, accept: readonly string[] = []): boolean {
  const got = normalizeShort(input);
  if (!got) return false;
  return [answer, ...accept].some((a) => normalizeShort(String(a)) === got);
}

/** 글에서 씨앗 수를 만든다 (FNV-1a). 묶음 id 를 넣으면 빌드마다 같은 값이 나온다. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 순서 번호(0부터)를 섞는다. 같은 씨앗 글이면 늘 같은 차례가 나온다 (빌드마다 화면이 바뀌지 않게).
 * 섞은 차례가 원래 차례와 같으면 한 칸 돌린다. 차례 맞추기가 처음부터 맞은 채로 나오지 않게 하려는 것이다.
 */
export function shuffledOrder(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let s = seedOf(seed) || 1;
  // mulberry32
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}
