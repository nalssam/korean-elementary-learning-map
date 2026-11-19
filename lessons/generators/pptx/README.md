# 수업 화면 PPTX 생성기

차시 명세의 `slides` 에서 수업 화면 PPTX(13.333 × 7.5in)를 만듭니다. 웹의 수업 화면(`/<id>/slides/`)과 같은 자료, 같은 짜임입니다.

```
node generators/pptx/build.mjs                       # 이번 빌드에 실리는 묶음 전부 → dist/files/<id>/slides.pptx
node generators/pptx/build.mjs --only 5-2/1/01        # 한 묶음만
node generators/pptx/build.mjs --out .cache/tests/x   # 다른 dist 폴더 (캐시는 .cache/tests/x.cache/)
```

- Python 은 환경 변수 `PYTHON` 이 있으면 그것을, 없으면 `python3` 을 씁니다. 필요한 패키지는 `requirements.txt` 에 있습니다 (`python-pptx`. Pillow 와 lxml 은 함께 깔립니다).
- SVG 그림은 Chromium(Playwright)으로 폭 1600px PNG 로 바꿔 `.cache/media/<id>/` 에 둡니다. `CHROMIUM_PATH` 를 따릅니다.
- 다시 만들지 않아도 되는 묶음은 `.cache/files/<id>/slides.pptx` 를 복사만 합니다. 그 묶음의 `lessons.json` 항목, 거기 적힌 그림 파일, 이 폴더의 파일, `package-lock.json` 이 같으면 다시 만들지 않습니다.
- 글이 한 장을 넘칠 것 같으면 어느 묶음의 몇 번 장인지 적고 멈춥니다. 형식이 허락하는 가장 긴 글까지는 넘치지 않습니다 (`tests/slides/` 가 봅니다).

## 파일

| 파일 | 하는 일 |
|---|---|
| `build.mjs` | 명세를 `.cache/lessons.json` 으로 내보내고, SVG 를 PNG 로 바꾸고, Python 을 부르고, 캐시와 dist 에 놓습니다 |
| `build_pptx.py` | `lessons.json` 만 읽고 장을 그립니다. 웹 무대(`src/components/slides/stage.css`)와 같은 1920 × 1080 px 자리에 놓습니다 (1px = 0.5pt) |
| `ttf.py` | 글꼴 파일에서 글자 폭을 읽어 줄바꿈을 미리 셉니다. PowerPoint 에 심을 EOT 꼴도 만듭니다 |
| `embed.py` | Pretendard 보통·굵게 두 벌을 통째로 PPTX 에 심습니다 (글꼴이 없는 학교 컴퓨터에서도 같은 모양) |

## 만들어지는 PPTX

- 명세의 슬라이드 한 장이 PPTX 한 장입니다. 번호가 `flow.slides` 와 같습니다. 오른쪽 아래에 `4 / 12` 처럼 장 번호가 있습니다.
- 글은 모두 고칠 수 있는 글상자입니다. 줄 간격은 고정값이고 자동 맞춤을 쓰지 않습니다.
- 1번 장(표지)에 `footerNotice(lesson)` 이 찍힙니다.
- 메모란은 `slideNotes(lesson, no)` 입니다. 퀴즈 장은 그 뒤에 `정답: …`, `풀이: …` 두 줄이 붙습니다 (화면에는 정답을 찍지 않습니다).
- 마지막 장은 '그림 출처'입니다: `shownMedia(lesson, 'slides')` 의 `creditFull()` 과 그 주소, 맨 아래 `sheetFooter(lesson)`. 길면 여러 장으로 나뉩니다.
- 그림은 원본 비율 그대로 틀 안에 넣습니다. 자르기 값을 쓰지 않습니다. 그림 바로 아래에 `creditShort()` 를 찍습니다.
- 색은 `src/styles/tokens.css` 의 것만 씁니다 (`lessons.json` 으로 넘어옵니다).

## `.cache/lessons.json`

`build.mjs` 가 쓰고 `build_pptx.py` 만 읽습니다. 다른 담당은 읽지 않습니다. 화면에 찍히는 글은 모두 여기에 실려 있어서 Python 쪽에는 문구가 없습니다.

```jsonc
{
  "version": 1,
  "colors": { "bg": "FBFAF6", "card": "FFFFFF", "navy": "132C3D", "teal": "18766B", "teal-soft": "E3F0EC", "coral": "D9734E", … }, // tokens.css 의 색 전부 (# 없이 대문자)
  "fonts": { "name": "Pretendard", "regular": "<절대 경로>/Pretendard-Regular.ttf", "bold": "<절대 경로>/Pretendard-Bold.ttf" },
  "type": { "cover": 104, "title": 72, "body": 44, … },          // 글자 크기 px (src/components/slides/copy.ts 의 STAGE_TYPE)
  "copy": { "slide": { "term": "새 낱말", "quiz": "확인 퀴즈", … } }, // 장 안의 이름표 (SLIDE_COPY)
  "lessons": [
    {
      "id": "5-2/1/01",
      "title": "…",
      "pptx": "<절대 경로>/.cache/files/5-2/1/01/slides.pptx",      // Python 이 쓰는 자리. build.mjs 가 dist 로 복사한다
      "cover": { "meta": "단원명 · 1차시 · 교과서 6~9쪽", "notice": "footerNotice(lesson)" },
      "slides": [ /* 아래 */ ],
      "credits": {
        "heading": "그림 출처", "empty": "…", "more": "({n}/{total})",
        "items": [ { "text": "creditFull().text", "sourceUrl": "…", "licenceUrl": "…" } ],
        "footer": "sheetFooter(lesson)"
      }
    }
  ]
}
```

장마다 `no`(1부터), `layout`, `notes`(메모란 줄들)가 있고, layout 에 따라 아래 칸이 더 있습니다. 그림(`media`)은 `{ "id": "5-2/1/01/stone", "file": "<절대 경로: jpg·png, SVG 는 바꾼 PNG>", "alt": "…", "credit": "creditShort()" }` 입니다.

| layout | 칸 |
|---|---|
| `title` | `title`, `subtitle?`, `kicker`(학기·단원), `first`(1번 장인가. 1번 장만 `cover` 의 글을 찍는다) |
| `question` | `kicker?`, `title`, `hint?`, `media?` |
| `picture` | `title`, `caption?`, `media` |
| `points` | `title`, `points[]`, `media?` |
| `compare` | `title`, `left`·`right`: `{ label, points[], media? }` |
| `steps` | `title`, `steps[]`: `{ label, text, media? }` |
| `term` | `term`, `meaning`(termMeaning), `example?` |
| `passage` | `passage`: `{ title, text[], source }` |
| `activity` | `title`, `instructions[]`, `minutes?`, `materials[]` |
| `quiz` | `quiz`: `{ type: ox·choice·short, q, choices? }` (정답은 `notes` 에) |
| `closing` | `title`, `points[]` |
