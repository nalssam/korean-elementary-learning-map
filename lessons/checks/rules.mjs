// 글과 그림을 보는 규칙 (docs/CONTRACT.md 11·15절). checks/run.mjs 가 쓰고, tests/repo/ 가 규칙 하나하나를 시험한다.
// 규칙을 더하거나 고칠 때는 "무엇을 대신 쓰는지"를 함께 적는다. 검사 결과를 읽는 사람은 교사다.

/** 화면에 쓰지 않는 말 (15절). 하나라도 나오면 실패한다. */
export const BANNED = [
  { re: /쉽고\s*재미있/, say: '"쉽고 재미있게" 같은 꾸미는 말을 빼고, 아이가 할 일을 씁니다' },
  { re: /다양한/, say: '"다양한" 대신 무엇이 있는지 몇 가지를 직접 씁니다' },
  { re: /효과적/, say: '"효과적" 대신 무엇이 어떻게 나아지는지 씁니다' },
  { re: /[을를]\s*통(?:해|하여)/, say: '"~를 통해" 대신 "~로", "~에서", "~을 보고"처럼 씁니다' },
];

/**
 * 다른 회사의 서비스 이름 (15절). 수업 자료가 특정 회사의 도구에 기대지 않게 한다.
 * 교과서·수업 자료 회사 이름은 lib/checks.ts 의 DENIED_PUBLISHER 가 출처 칸에서 따로 본다. 여기는 화면에 찍히는 글 전부를 본다.
 * "아이스크림"처럼 낱말과 겹치는 회사 이름은 서비스 이름 꼴로만 찾는다.
 */
export const SERVICES = /유튜브|youtube|카카오톡|카톡|네이버|naver|구글|google|패들렛|padlet|띵커벨|클래스팅|하이클래스|퀴즈앤|카훗|kahoot|멘티미터|mentimeter|캔바|canva|미리캔버스|게더타운|마인크래프트|minecraft|로블록스|roblox|챗\s?GPT|chatgpt|아이스크림\s?(?:에듀|미디어|홈런|S)|티처빌|쌤동네|인디스쿨|비바샘|비상교육|천재교육|천재교과서|미래엔|동아출판|지학사|금성출판사|교학사|티셀파/i;

/** 교실에서 해 본 듯한 말 (15절). 교사가 읽는 글에서 찾고 알림으로 보여 준다. 날쌤이 수업에서 확인한 것이면 그대로 둔다. */
export const CLASSROOM = [
  { re: /가장\s*많/, say: '"가장 많" — 수업에서 확인한 것이 아니면 "~일 수 있습니다"로 씁니다' },
  { re: /대부분/, say: '"대부분" — 수업에서 확인한 것이 아니면 "~일 수 있습니다"로 씁니다' },
  { re: /항상/, say: '"항상" — 수업에서 확인한 것이 아니면 "~일 수 있습니다"로 씁니다' },
  { re: /\d+\s*분\s*안에/, say: '"N분 안에" — 걸리는 시간은 수업에서 확인한 것만 적습니다' },
];

/** 무게가 있는 차시(scored() 가 false)의 퀴즈·카드·웹 활동에 나오면 알리는 피해 낱말 (11절) */
export const PAIN_WORDS = /사망|희생|학살|전사|고문|끌려|처형|살해|폭격|숨졌|목숨을\s*잃/;

/** 놀이 자료의 글인가 (퀴즈·카드·웹 활동). childStrings() 의 경로로 가린다. */
export const isPlayPath = (p) => /^(quiz\.|assets\.cards\.|assets\.web_activity\.)/.test(p);

/**
 * 곧은 따옴표(' ")를 쓴 한국어 글 (15절 '글'). 아이와 교사가 읽는 글에서는 굽은 따옴표(‘ ’ “ ”)를 씁니다.
 * 곧은 따옴표는 글꼴에 따라 세로 막대처럼 찍히고, 여는 것과 닫는 것이 같아 낱말이 어디에서 시작하는지 흐려진다.
 * 한글이 없는 글(id·주소·영문 값), 주소와 `코드` 안, 영어 줄임표(don't), 숫자 뒤의 표시(5' 같은 분·피트)는 뺀다.
 * 돌려주는 값: undefined 괜찮음 · { marks: 찾은 따옴표들, fixed: 굽은 따옴표로 바꾼 글, at: 처음 찾은 자리(fixed 안) }
 */
export function straightQuotes(text) {
  if (!/[가-힣]/.test(text)) return undefined;
  // 뺄 자리를 같은 길이의 빈칸으로 덮어 자리 번호가 그대로 맞게 한다
  const blank = (m) => ' '.repeat(m.length);
  const masked = text.replace(/\b(?:https?:\/\/|www\.)\S+/g, blank).replace(/`[^`]*`/g, blank);
  const isLatin = (ch) => /[A-Za-z]/.test(ch ?? '');
  const hits = [];
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch !== "'" && ch !== '"') continue;
    if (ch === "'" && isLatin(masked[i - 1]) && isLatin(masked[i + 1])) continue; // don't
    if (/\d/.test(masked[i - 1] ?? '')) continue; // 5' 30"
    hits.push(i);
  }
  if (!hits.length) return undefined;
  // 여는 것: 글의 처음이거나 앞이 빈칸·여는 괄호. 그 밖에는 닫는 것. 굽은 따옴표도 한 글자라 자리 번호가 그대로다.
  let out = text;
  for (const i of hits) {
    const opening = i === 0 || /[\s(\[{<·—–-]/.test(text[i - 1]);
    const curly = text[i] === "'" ? (opening ? '‘' : '’') : (opening ? '“' : '”');
    out = out.slice(0, i) + curly + out.slice(i + 1);
  }
  return { marks: [...new Set(hits.map((i) => text[i]))], fixed: out, at: hits[0] };
}

/** 이모지 (14절). 아이콘이 필요하면 선 그림 SVG 를 쓴다. */
export const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * SVG 그림 파일에서 막는 것 (11절): 스크립트, on… 속성, foreignObject, 바깥 주소를 부르는 것,
 * javascript: 주소, 움직임(<set>·<animate>)으로 링크 주소를 바꿔 쓰는 것, 그림이 아닌 data: 주소.
 * xmlns 와 DOCTYPE 의 주소, 그림 정보(rdf:resource 등)는 부르는 것이 아니라 이름이라 뺀다.
 * 그림 안에 심은 사진(data:image/png·jpeg·gif·webp)은 바깥을 부르지 않고 코드도 돌지 않으므로 받는다.
 * 돌려주는 값은 [줄 번호, 까닭] 목록이다.
 */
export function svgProblems(text) {
  const out = [];
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  const find = (re, why) => { for (const m of text.matchAll(re)) out.push([lineAt(m.index), why]); };
  find(/<script\b/gi, '<script> 가 있습니다. 그림 파일에는 스크립트를 넣지 않습니다');
  // <svg/onload=…> 처럼 빈칸 대신 / 로 띄운 속성도 브라우저는 속성으로 읽는다
  find(/[\s/"']on[a-z]+\s*=/gi, 'on… 속성(누르거나 열 때 도는 코드)이 있습니다. 지웁니다');
  find(/<foreignObject\b/gi, '<foreignObject> 가 있습니다. 글은 <text> 로 적습니다');
  find(/[\s/](?:xlink:)?(?:href|src)\s*=\s*["']?\s*(?:https?:|ftp:|\/\/)/gi, '바깥 주소를 부르는 그림·링크가 있습니다. 그림 안에 넣거나 지웁니다');
  find(/url\(\s*["']?\s*(?:https?:|ftp:|\/\/)/gi, '바깥 주소를 부르는 url(…) 이 있습니다. 지웁니다');
  find(/@import\b/gi, '@import 가 있습니다. 바깥 글꼴·스타일을 부르지 않습니다');
  find(/(?:java|vb)script\s*:/gi, 'javascript: 주소(누르면 도는 코드)가 있습니다. 지웁니다');
  find(/<(?:set|animate)\b[^>]*\battributeName\s*=\s*["']?\s*(?:xlink:)?href\b/gi, '<set>·<animate> 가 링크 주소(href)를 바꿔 씁니다. 지웁니다');
  find(/(?:[\s/](?:xlink:)?(?:href|src)\s*=\s*["']?|url\(\s*["']?)\s*data:(?!image\/(?:png|jpe?g|gif|webp)[;,])/gi, '사진이 아닌 data: 주소(심어 둔 문서·SVG)가 있습니다. 그림은 따로 파일로 두거나 지웁니다');
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * 출처 표시의 제목(credit.title)이 파일 이름인가. 제목은 사람이 읽는 이름이어야 한다 (안내 페이지의 그림 출처 목록에 그대로 찍힌다).
 * 위키미디어 공용의 "GMJ 0154.jpg" 같은 파일 이름을 그대로 적으면 화면과 인쇄물의 출처 줄에 그대로 찍힌다.
 * 돌려주는 값: 'name' 제목 전체가 파일 이름 · 'part' 제목 안에 파일 이름이 섞임 · undefined 괜찮음
 */
export function fileNameTitle(title) {
  if (!title) return undefined;
  const ext = /\.(?:jpe?g|png|gif|svg|webp|tiff?|bmp)\b/i;
  if (/\.(?:jpe?g|png|gif|svg|webp|tiff?|bmp)\s*$/i.test(title)) return 'name';
  return ext.test(title) ? 'part' : undefined;
}

/**
 * 낱말 검사에서 뺄 말 (checks/terms-allow.txt). 한 줄에 하나, # 뒤는 주석.
 * 글에서 이 말을 지운 뒤 낱말을 찾는다. "가야 합니다" 를 적으면 "가야" 라는 낱말 검사에서 그 자리만 빠진다.
 */
export function parseAllow(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}
