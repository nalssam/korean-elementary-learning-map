// 학생 페이지(확인 퀴즈·웹 활동)가 빌드할 때와 브라우저에서 함께 쓰는 작은 셈.
// 파일을 읽지 않으므로 브라우저 스크립트도 가져다 쓸 수 있다. 시험(tests/play/)도 이 파일을 바로 부른다.

/** 답 끝에 흔히 붙는 끝말 (docs/CONTRACT.md 9절). 긴 것부터 본다 ('이에요'를 '요'보다 먼저). */
export const SHORT_ENDINGS = ['입니다', '이에요', '예요', '이요', '이야', '이다', '요', '야'] as const;

/** 빈칸을 모두 없애고 끝에 붙은 . ! ? 를 뗀다. 떼고 나서 아무것도 남지 않으면 떼지 않는다. */
function bare(s: string): string {
  const t = s.replace(/\s+/g, '');
  return t.replace(/[.!?]+$/, '') || t;
}

/** 끝말 하나를 뗀 모양들 (끝에 붙은 끝말마다 하나씩). 떼고 나서 아무것도 남지 않는 것은 넣지 않는다. */
function withoutEnding(t: string): string[] {
  return SHORT_ENDINGS.filter((e) => t.length > e.length && t.endsWith(e)).map((e) => t.slice(0, -e.length));
}

/**
 * 단답 채점용으로 글을 고른다 (docs/CONTRACT.md 9절). 앞뒤 공백을 떼고 안쪽 공백을 모두 없앤다.
 * 끝에 붙은 . ! ? 를 떼고, 흔한 끝말(SHORT_ENDINGS) 하나를 긴 것부터 찾아 뗀다 ('유물이에요.' 와 '유물' 은 같은 답).
 * 떼고 나면 아무것도 남지 않을 때는 떼지 않는다 ('입니다'만 쓴 답은 '입니다'로 남는다).
 * 그 밖의 것(글자 모양, 가운데 문장부호)은 바꾸지 않는다.
 */
export function normalizeShort(s: string): string {
  const t = bare(s);
  return withoutEnding(t)[0] ?? t;
}

/**
 * 단답이 맞았는가. 빈 답은 늘 틀린다.
 * 아이의 답은 빈칸·문장부호를 고른 뒤, 그대로이거나 끝말 하나를 뗀 모양 가운데 하나가 answer·accept(같은 방법으로 빈칸·문장부호를 고른 것)와 같으면 맞다.
 * 정답 쪽의 끝말은 떼지 않는다. 정답이 끝말처럼 끝나는 낱말('가야'의 '야')일 때 '가'가 맞는 답이 되거나 '가야예요'가 틀린 답이 되지 않게 하려는 것이다.
 */
export function markShort(input: string, answer: string, accept: readonly string[] = []): boolean {
  const got = bare(input);
  if (!got) return false;
  const forms = new Set([got, ...withoutEnding(got)]);
  return [answer, ...accept].some((a) => forms.has(bare(String(a))));
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
