# 나중에 만들 것의 밑그림

지금 형식에는 없고, 생성기를 만들 때 함께 정할 것들입니다. 여기 적힌 꼴은 **계획**이지 약속이 아닙니다. 만드는 사람이 써 보고 고칩니다. 꼴을 정하면 `schema/`, 주소, 담당을 한 번에 더합니다 (`docs/CONTRACT.md` 18절).

## 1. 방탈출

지금은 `assets.escape` 에 skip·planned 만 적습니다. 편성표의 방탈출 30편 가운데 퀴즈만으로 되는 것은 없습니다. 읽고 답하기 13, 짝 맞추기 11, 지도에서 찾기 6, 차례 맞추기 6편입니다. 그래서 퍼즐은 퀴즈 문항 번호가 아니라 아래 넷 가운데 하나로 잡습니다.

```ts
/** 퍼즐: 퀴즈 문항 / 읽기 자료를 읽고 퀴즈 문항에 답하기 / 이 묶음의 웹 활동 그대로 / 활동을 바로 적기 */
const Puzzle = z.discriminatedUnion('kind', [
  so({ kind: z.literal('quiz'), item: z.number().int().min(1) }),
  so({ kind: z.literal('read'), passage: Slug, item: z.number().int().min(1) }),
  so({ kind: z.literal('web_activity') }),
  // sort | match | order | place: 웹 활동과 같은 꼴
]);

/** 방. 차시용은 방 하나, 단원 정리용은 다섯까지 */
const Room = so({
  title: T(20).optional(),
  /** 이 방을 풀면 얻는 글자·숫자. 방들의 key 를 차례로 이으면 마지막 자물쇠의 답이다. */
  key: T(4).optional(),
  /** 같은 단원 앞 묶음의 방탈출 퍼즐을 그대로 가져온다 (단원 정리 묶음에서만). 예: ["02", "03-04"] */
  from: z.array(BundleId).max(3).default([]),
  puzzles: z.array(Puzzle).max(4).default([]),
});

escape: opt({ title: T(30), minutes: z.number().int().min(5).max(40), rooms: z.array(Room).min(1).max(5), print: PrintSpec.optional() })
```

함께 정할 것:

- 주소 `/<id>/escape/` 와 담당(활동). `print` 가 있으면 단서지를 `/<id>/escape/print/` 와 `escape.pdf` 로도 냅니다 (인쇄물의 틀을 씁니다).
- `lib/content.ts` 에 `escapeRooms(lesson)`: `from` 을 풀어 앞 묶음의 퍼즐을 먼저, 이 묶음의 퍼즐을 뒤에 놓습니다. 로더는 `from` 이 같은 단원의 앞 묶음이고, 그 묶음의 방탈출이 ready 이며, no_play 차시가 아닌지 봅니다 (단원 카드 덱의 `collect` 와 같은 규칙).
- 피해를 담은 사실은 퍼즐이 가리킬 수 없습니다 (지금 퀴즈·카드·웹 활동에 거는 규칙 그대로). `scored()` 가 false 인 차시의 방탈출은 시간 재기와 순위를 쓰지 않습니다.
- no_play 차시에는 방탈출을 만들지 않습니다 (지금도 planned 조차 막습니다).
- 기존 저장소(mdbf2026)의 방탈출 엔진(퍼즐 다섯 가지: 문서·짝 맞추기·지도·순서·OX)을 옮길 때는 그림의 권리를 먼저 점검합니다.

## 2. 3D·가상 체험

지금은 `assets.virtual3d` 에 skip·planned 만 적습니다. 5학년 2학기에 계획된 것은 단원마다 하나, 모두 셋입니다 (석굴암, 앙부일구, 3단원 하나).

```ts
/** 우리가 만든 3D 는 module, 바깥 자료는 url. 둘 가운데 하나만 */
virtual3d: opt({ title: T(30), module: Slug.optional(), url: Url.optional(), how: z.array(Text).min(1) })
```

함께 정할 것:

- 주소 `/<id>/3d/` 와 담당(활동). 우리가 만든 장면은 `src/components/play/scenes/<module>.ts` 에 둡니다. 전개도 모듈처럼 "그 차시에만 맞는 코드"가 허용되는 두 번째 자리가 됩니다.
- 바깥 자료(`url`)는 사이트 밖으로 나가는 링크라서 학생 페이지에 두지 않고 차시 안내 페이지에만 겁니다. "외부 요청을 하지 않는다"는 약속과 부딪히지 않게, 끼워 넣지 않고 링크로만 엽니다.
- 3D 엔진은 새 의존성입니다. 학교망과 낮은 사양 기기에서 도는지 먼저 시험합니다.

## 3. 그 밖에 미뤄 둔 것

- **묶음마다의 성취기준.** 지금은 단원에만 적혀 있습니다. 묶음과 성취기준의 짝을 확인하면 차시표의 `bundles[].standards` 에 적습니다 (형식은 이미 받습니다).
- **영상.** 띄우는 장과 생성기를 만들 때 `media.kind` 와 큰 파일을 두는 곳(저장소 밖)을 함께 정합니다.
- **공공누리 제0유형.** 있는지 확인되면 `Licence` 에 더합니다.
- **묶음을 다시 나눌 때의 옛 주소.** 차시표에 옛 id 를 적는 선택 칸을 더해 넘기는 페이지를 만듭니다.
- **주석까지 묶는 베끼기 검사 기록.** 지금 지문은 값만 보고 주석은 올리기 전 검사가 다시 봅니다 (`docs/CONTRACT.md` 13절). 주석의 베끼기를 CI 에서도 막아야 하면, 베끼기 검사 기록에만 주석을 넣은 지문을 따로 두는 길이 있습니다 (다른 검수 넷의 지문은 그대로 둡니다).
- **출처 주소 살아 있는지 보기.** 주마다 `--online` 검사로 주소가 열리고 근거 구절(`quote`)이 그대로 있는지 봅니다.
