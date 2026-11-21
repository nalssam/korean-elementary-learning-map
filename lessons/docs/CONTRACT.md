# 구현 계약서

이 저장소를 함께 만드는 사람과 에이전트가 지키는 약속입니다. 각자 맡은 폴더만 고치고, 나머지는 여기 적힌 대로 있다고 믿고 씁니다. 여기 적히지 않은 것은 맡은 폴더 안에서 스스로 정합니다.

- 형식의 칸마다 붙은 설명은 `schema/*.ts` 의 주석에 있습니다. 이 문서는 칸을 다시 늘어놓지 않고, 담당 사이에 걸리는 약속만 적습니다.
- 쓰는 법의 본보기는 `tests/contract/fixtures/` 에 있습니다. `content/` 는 가짜 명세 넷(한 차시, 두 차시, no_play, 단원 정리)이고 `site/` 는 틀과 도우미를 쓰는 작은 사이트입니다 (차시 안내, 컬러링 인쇄 페이지, 학생 페이지, `/published.json`, 함께 쓰는 화면 부품을 모두 그린 `/ui/`).
- 받아들이지 않은 제안과 까닭은 `docs/decisions.md`, 나중에 만들 것의 밑그림은 `docs/ROADMAP.md` 에 있습니다.

## 0. 놓인 자리

이 프로젝트는 `nalssam/korean-elementary-learning-map` 저장소의 `lessons/` 폴더에 놓입니다. 그 저장소의 나머지(학습 지도 데이터와 온톨로지)는 고치지 않습니다.

- 이 문서에서 "저장소 뿌리"는 `lessons/` 폴더입니다. 경로는 모두 이 폴더에서 잽니다. 명령도 이 폴더에서 돌립니다 (`cd lessons && npm ci`).
- git 뿌리에 두는 것은 `.github/` 하나입니다 (GitHub 이 거기에서만 읽습니다). 워크플로 파일 이름은 `lessons-` 로 시작하고, `defaults.run.working-directory: lessons` 로 돌며, `lessons/**` 가 바뀔 때만 돕니다. `CODEOWNERS` 의 경로에는 `/lessons/` 를 붙입니다. 이미 있는 워크플로(`ontology-release.yml`)는 고치지 않습니다. 예외는 그 CI 가 다시 돌게 하는 고침입니다 (러너 판 고정, 잠금 파일의 보안 고침). 그런 고침은 `lessons/` 의 일과 섞지 않고 따로 커밋합니다.
- `.githooks/` 는 `lessons/.githooks/` 에 둡니다. 훅은 git 뿌리에서 불리므로 먼저 `lessons/` 로 들어간 뒤에 일합니다.
- 라이선스 파일(`LICENSE`, `LICENSE-CONTENT.md`)과 `NOTICE.md`, `README.md`, `CONTRIBUTING.md` 는 `lessons/` 안에 둡니다. git 뿌리의 같은 이름 파일은 학습 지도 프로젝트의 것이라 고치지 않습니다.

## 1. 한 줄 요약

차시 묶음마다 `content/<학기>/<단원>/<묶음>/lesson.yaml` 하나를 씁니다. 안내 페이지, 수업 화면, PPTX, 학습지, 퀴즈, 카드, 컬러링, 웹 활동, 페이퍼크래프트는 모두 이 파일에서 나옵니다.

- 사실은 `facts` 에 한 번만 적고, 맞고 틀림이 있는 글(퀴즈 문항·카드·낱말 풀이)은 반드시 그 사실을 가리킵니다.
- 차시 번호·쪽수·단원명·성취기준은 차시표(`content/registry.yaml`)에만 있습니다. 같은 것을 두 번 적지 않습니다.
- 단원 카드 덱과 단원 정리지는 단원 정리 묶음(차시표의 `role: review`)의 `lesson.yaml` 에 적습니다. 단원 파일을 따로 두지 않습니다.

## 2. 담당과 폴더

| 담당 | 맡은 것 |
|---|---|
| 계약 | `schema/`, `lib/`, `src/lib/url.ts`, `src/layouts/Base.astro`, `src/components/Media.astro`, `src/components/Qr.astro`, `src/components/site/ui/`(화면 부품. 6절), `src/components/site/collect.ts`(내 자료함의 저장), `src/styles/tokens.css`, `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `.gitattributes`, `data/standards/`, `tests/contract/`, `docs/CONTRACT.md`, `docs/decisions.md`, `docs/ROADMAP.md` |
| 내용 | `content/` (차시표, 차시 명세, 묶음별 `media/`, 업데이트 소식 `updates.yaml`) |
| 사이트 | `src/layouts/SiteLayout.astro`(머리·바닥글), `src/components/site/`(`ui/` 와 `collect.ts` 는 빼고), 사이트 화면 페이지(3절: 첫 화면, 교과서 목차, 단원, 차시 자료실, 자료 유형별, 업데이트, 제작 현황, 내 자료함, 소개, 이용 조건, 오류 제보, 404), `scripts/sync-media.mjs`, `tests/site/` |
| 인쇄물 | `src/components/print/`, `src/styles/print.css`, 학습지·카드·컬러링 페이지, `scripts/render-pdf.mjs`, `tests/print/` |
| 슬라이드 | `src/components/slides/`, 수업 화면 페이지, `generators/pptx/`, `tests/slides/` |
| 활동 | `src/components/play/`, 확인 퀴즈·웹 활동 페이지, `tests/play/` |
| 페이퍼크래프트 | `generators/papercraft/`, 페이퍼크래프트 페이지, `tests/papercraft/` |
| 저장소 | `checks/`, `scripts/build.mjs`, `scripts/sign.mjs`, `scripts/factsheet.mjs`, `scripts/new.mjs`, `scripts/migrate/`, 미리보기 그림(`scripts/thumbs.mjs`. `scripts/render-pdf.mjs` 가 부르는 미리보기 단계. 10절), git 뿌리의 `.github/`(0절), `.githooks/`, 기여 문서(17절), `tests/repo/` |

**함께 쓰는 컴포넌트**는 `src/components/` 바로 아래(`Media.astro`, `Qr.astro`)와 `src/components/site/ui/`(머리말·민트 띠·상태 표·자료 그림·자료 카드. 6절)에 둡니다. 어느 담당의 페이지든 가져다 쓰고, 고칠 것이 있으면 계약 담당에게 알립니다. 부품의 CSS 는 무게가 0 인 `:where()` 로 적혀 있어 부르는 페이지가 class 하나로 여백과 격자를 정합니다.

`scripts/render-pdf.mjs` 는 인쇄물 담당의 것이고, 그것이 PDF 를 찍은 뒤 부르는 미리보기 그림 단계(`scripts/thumbs.mjs`. 10절)는 저장소 담당이 맡습니다. PDF 를 찍는 코드와 섞지 않으려고 파일을 나눴습니다.

**계약 파일은 고치지 않습니다.** 형식이나 도우미가 모자라면 고치지 말고 보고서에 "무엇을 표현할 수 없었는지"를 적습니다. `package.json` 의 스크립트나 의존성이 더 필요할 때도 같습니다.

**인쇄 틀의 뼈대는 미리 들어 있습니다.** `src/components/print/PrintLayout.astro`, `src/components/print/Sheet.astro`, `src/styles/print.css` 입니다. 인쇄물 담당이 이어서 채웁니다 (글자·줄·칸의 모양, 화면의 인쇄 안내). props 와 class 이름·치수(7절), 틀의 글 크기(머리의 학기·단원·차시 줄과 바닥글. 7절)는 계약 담당이 정하고 바꾸지 않습니다. 페이퍼크래프트 담당은 이 뼈대를 그대로 쓰고, `src/components/print/` 에 파일을 만들지 않습니다.

## 3. 주소와 페이지

`<id>` 는 `5-2/1/03-04` 같은 묶음 id 입니다 (학기/단원/묶음). 페이지 파일은 `src/pages/` 아래에 둡니다.

| 주소 | 내용 | 파일 | 담당 |
|---|---|---|---|
| `/` | 첫 화면: 머리글과 찾기, 학년·학기 타일 8개, 자료 유형, 최근 올라온 자료, 제작 현황 요약, 이렇게 만듭니다 (R43. 6절) | `index.astro` | 사이트 |
| `/<학기>/` | 교과서 목차: 단원과 차시표, 넓은 화면의 왼쪽 목차 (R44) | `[semester]/index.astro` | 사이트 |
| `/<학기>/<단원>/` | 단원: 실리는 묶음의 카드와 아직인 묶음의 줄, 앞뒤 단원 (R45) | `[semester]/[unit]/index.astro` | 사이트 |
| `/<id>/` | 차시 자료실: 자료 카드, 교사용 안내, 앞뒤 차시 (R46. 6절) | `[semester]/[unit]/[bundle]/index.astro` | 사이트 |
| `/<id>/slides/` | 수업 화면 (전체 화면 발표) | `…/[bundle]/slides.astro` | 슬라이드 |
| `/<id>/worksheet/` | 학습지 인쇄 페이지 | `…/[bundle]/worksheet.astro` | 인쇄물 |
| `/<id>/cards/` | 카드 인쇄 페이지 | `…/[bundle]/cards.astro` | 인쇄물 |
| `/<id>/coloring/` | 컬러링 도안 인쇄 페이지 | `…/[bundle]/coloring.astro` | 인쇄물 |
| `/<id>/papercraft/` | 페이퍼크래프트 인쇄 페이지 | `…/[bundle]/papercraft.astro` | 페이퍼크래프트 |
| `/<id>/quiz/` | 확인 퀴즈 (학생용, QR 로 연다) | `…/[bundle]/quiz.astro` | 활동 |
| `/<id>/play/` | 웹 활동 (학생용) | `…/[bundle]/play.astro` | 활동 |
| `/types/` | 자료 유형별: 실리는 자료 전부를 `KIND_ORDER` 차례로 묶어 (`#<kind>`). 종류 거르기와 학기 고르기 (R48) | `types.astro` | 사이트 |
| `/updates/` | 업데이트 소식: `visibleUpdates()`, 날짜가 늦은 것부터 (R49) | `updates.astro` | 사이트 |
| `/status/` | 제작 현황: 학기·단원마다 차시 수, 공개, 초안(미리 보기 빌드만), 준비 중 (R50) | `status.astro` | 사이트 |
| `/my/` | 내 자료함: 이 브라우저에 담은 자료 (R51. 검색 색인에 넣지 않는다) | `my.astro` | 사이트 |
| `/about/`, `/licence/`, `/report/` | 소개, 이용 조건, 오류 제보 | `about.astro` 등 | 사이트 |
| `/404` | 없는 주소를 열었을 때의 사이트 화면. 첫 화면과 오류 제보로 가는 링크 | `404.astro` | 사이트 |
| `/published.json` | 공개된 묶음 id 의 JSON 배열 (아래) | `published.json.ts` | 사이트 |
| `/media/<id>/<파일>` | 묶음의 그림·사진 | 빌드 2단계에서 `scripts/sync-media.mjs` 가 dist 로 복사 (10절) | 사이트 |
| `/files/<id>/<이름>` | 만들어진 파일 | 빌드가 만든다 (10절) | 인쇄물·슬라이드 |
| `/files/<id>/thumbs/<kind>.jpg` | 자료 카드의 미리보기 그림. 페이지가 있는 자료(`ASSET_ROUTE` 의 일곱)마다. 경로는 `thumbRoute(id, kind)` | 빌드 3단계가 만든다 (10절) | 저장소 |

만들어지는 파일은 `worksheet.pdf`, `cards.pdf`, `coloring.pdf`, `papercraft.pdf`, `slides.pptx` 입니다. 경로와 내려받는 한글 이름은 `printJobs()` 와 `pptxFile()` 이 줍니다.

- 주소는 모두 `/` 로 끝납니다 (`trailingSlash: 'always'`).
- 자료 페이지의 주소는 `lessonRoute(id, ASSET_ROUTE[kind])` 로 만듭니다. 웹 활동(`web_activity`)의 주소 조각이 `play` 인 것처럼, 이름을 손으로 잇지 않습니다.
- 사이트가 하위 경로에 놓일 수 있습니다. 페이지 안의 링크·그림·파일 주소는 `href('/5-2/')` 로 만듭니다. 문자열로 `/` 를 직접 이어 붙이지 않습니다.
- 종이에 박히는 주소(QR, PPTX, 인쇄물 바닥글)는 `absoluteUrl(lessonRoute(id, ASSET_ROUTE.quiz))` 로 만듭니다. 브라우저의 `location` 이나 `Astro.site` 로 만들지 않습니다 (PDF 는 127.0.0.1 에서 찍힙니다). 공개 빌드에서 `SITE_URL` 이 없으면 이 함수가 멈춥니다. `SITE_URL` 에는 하위 경로를 넣지 않습니다 (`https://nalssam.github.io`). 하위 경로는 `SITE_BASE` 로만 주고, `SITE_URL` 에 들어 있으면 이 함수가 멈춥니다 (그대로 두면 종이의 주소에서 하위 경로가 소리 없이 빠집니다).
- 선택 자료 가운데 페이지가 따로 있는 것은 papercraft·coloring·cards·web_activity 넷입니다. 만들기 세트(making_kit)는 사이트 담당이 차시 안내 페이지 안에 재료·순서·안전 안내를 그립니다. 방탈출(escape)과 3D(virtual3d)는 아직 생성기가 없어 명세에서 skip·planned 만 받습니다.
- 공개한 주소는 바꾸지 않습니다 (종이에 QR 로 박혀 있습니다). 묶음을 다시 나누면 옛 주소에 새 주소로 넘기는 페이지를 남깁니다. 배포 경로(`SITE_BASE`)도 날쌤이 한 번 정한 뒤에는 바꾸지 않습니다.
- `/report/` 에는 양식을 넣지 않습니다. `SITE.reportUrl`(날쌤이 정하는 제보 양식 주소. 비어 있으면 빼고)과 깃허브 이슈로 가는 링크만 두고, 링크에는 차시 id 만 붙입니다. 저작권 신고 양식으로 가는 링크는 양식의 `url` 칸(문제가 된 자료의 주소)에 그 차시 안내 페이지의 온전한 주소(`absoluteUrl(lessonRoute(id))`)도 채웁니다.
- `/licence/` 는 코드의 이용 조건으로 기본 가지(main)의 `lessons/LICENSE` 를 겁니다.
- `/published.json` 은 공개된 묶음 id 를 차시표 순서로 늘어놓은 JSON 배열입니다. 감싸는 칸이 없습니다: `["5-2/1/01","5-2/1/02-03"]`. `visibleLessons().filter(isPublic).map((l) => l.id)` 를 `JSON.stringify` 한 것이고, 미리 보기 빌드에서도 공개된 묶음만 나옵니다. 사이트 담당이 만들고 배포 워크플로(저장소)가 읽습니다 (12절). 본보기는 `tests/contract/fixtures/site` 에 있습니다.

### 차시 페이지 만들기

```astro
---
import { lessonPaths, loadLesson } from '#lib/content.ts';
export function getStaticPaths() { return lessonPaths(); }      // 선택 자료 페이지는 lessonPaths('cards')
const lesson = loadLesson(Astro.props.id);
---
```

- `getStaticPaths` 는 `lessonPaths()` 를 그대로 돌려줍니다. 종류를 넣으면 그 자료가 ready 인 차시만 나옵니다.
- props 로는 id 만 받고 본문에서 `loadLesson(Astro.props.id)` 로 읽습니다. lesson 을 props 로 넘기지 않습니다 (`astro dev` 에서 명세를 고쳐도 화면이 바뀌지 않습니다).
- 페이지, 검색 색인, `/media/`, `/files/`, PPTX 에 들어가는 차시는 모두 `visibleLessons()`(`lessonPaths()` 가 이것을 씁니다)에서 얻습니다. `lessonIds()` 나 `loadLesson()` 을 돌려 목록을 만들지 않습니다.
- 첫 화면의 학기 타일, 교과서 목차, 제작 현황에 붙는 "N/M 차시 공개"는 묶음이 아니라 차시를 셉니다 (두 차시 묶음은 2). M 은 차시표에 적힌 그 학기의 차시 수, N 은 그 가운데 `visibleLessons()` 의 공개된 묶음에 든 차시 수입니다. `semesterProgress(학기)`·`unitProgress(학기, 단원)` 이 `{ total, published, draft, planned }` 로 셉니다 (`draft` 는 미리 보기 빌드에서만 0 이 아닙니다). 손으로 세지 않습니다.
- 자료를 늘어놓는 페이지(차시 자료실, 자료 유형별, 내 자료함, 첫 화면의 자료 유형 타일)는 `catalog()` 에서 자료를 얻습니다. 차례는 차시표 차례, 그 안에서 `KIND_ORDER`(수업 화면, 학습지, 확인 퀴즈, 웹 활동, 페이퍼크래프트, 카드, 컬러링 도안, 만들기 세트, 방탈출, 3D·가상 체험)입니다. 준비된 수를 셀 때도 이 목록을 셉니다.
- 검색 색인: 차시 자료실은 그대로 넣습니다. 내 자료함(`/my/`)은 `<SiteLayout index={false}>` 로 뺍니다 (담은 자료는 브라우저마다 다릅니다). 자료 유형별의 카드 목록은 `data-pagefind-ignore` 로 감쌉니다 (같은 자료가 차시 자료실에서 이미 색인되어 찾기 결과가 두 번 나옵니다). 차시 자료실의 카드 격자도 감쌉니다 (카드의 글이 발췌를 채웁니다. 자료의 이름은 교사용 안내에 있습니다). ResourceCard 의 단추 줄과 QR 창은 이미 감싸져 있습니다.
- 학기·단원 페이지는 `allBundles()` 로 차시표 전체를 그리고, `visibleLessons()` 에 있는 묶음에만 링크를 겁니다. 공개되지 않은 묶음은 차시 번호와 쪽수만 보여 줍니다. 공개된 묶음에는 명세의 `title` 과 `tagline` 을 보여 줍니다.
- 차시표의 `focus` 는 사실 대조를 거치지 않은 계획 글이라 사이트에 찍지 않습니다 (쪽수·차시로 찾기의 결과도 같습니다. `checks/outputs.mjs` 가 봅니다). 사이트에 실리는 차시표의 글은 단원명과 학기 소개(`blurb`)뿐입니다. `blurb` 에는 사실을 말하는 문장을 적지 않고 무엇을 배우는 학기인지만 적습니다.

## 4. 명세를 읽는 법

```ts
import { loadLesson, printJobs, getMedia } from '#lib/content.ts';
import { SITE, ASSET_LABEL, ASSET_ROUTE } from '#lib/site.ts';
import type { Lesson } from '#schema/lesson.ts';
import { href } from '#src/lib/url.ts';
```

이 주소는 Astro 페이지와 Node 스크립트에서 똑같이 씁니다 (`package.json` 의 `imports`).

- YAML 을 직접 읽지 않습니다. `lib/content.ts` 가 단 하나의 통로입니다.
- 명세에 없는 내용을 페이지에 손으로 적지 않습니다. 한 차시에만 맞는 코드를 쓰지 않습니다. 다음 차시의 명세만 넣으면 같은 페이지가 나와야 합니다. 예외는 전개도 모듈 하나입니다 (7절).
- `lib/content.ts` 는 파일을 읽으므로 브라우저에서 도는 스크립트가 가져올 수 없습니다. 브라우저에 필요한 값은 페이지가 HTML 에 실어 줍니다. `lib/site.ts` 와 `src/lib/url.ts` 는 브라우저에서도 됩니다.
- 명세에 고칠 곳이 있으면 `SpecError` 가 나고, `issues` 는 "146번째 줄 · slides · 2번째 · title: 30자까지만 씁니다 (지금 31자)" 같은 한 줄씩입니다. 검사 스크립트는 이 글을 그대로 보여 줍니다. `category` 는 그 줄들을 보여 줄 갈래입니다: `형식`(명세의 꼴과 가리키는 것) 또는 `검수 기록`(공개 조건이 모자람). 검사는 `e.category` 갈래로 적습니다.
- 공개 조건이 모자라 막힐 때, 확인자가 모자란 사실은 사실마다 한 줄씩 늘어놓지 않고 "공개하려면 사실마다 서로 다른 두 확인자의 기록이 있어야 합니다. 아직 모자란 사실: f1, f2, …" 한 줄로 묶습니다. `publishGaps(id)` 는 사실마다 한 줄을 그대로 줍니다 (서명 도구가 씁니다).
- `astro dev` 에서는 고칠 곳이 있는 묶음 하나가 모든 페이지를 500 으로 만들지 않게, `visibleLessons()` 가 그 묶음만 빼고 터미널에 고칠 곳을 찍습니다. `astro build` 와 `npm run check` 는 그대로 멈춥니다.

### `lib/content.ts` 가 주는 것

| 쓰임 | 함수 |
|---|---|
| 차시표 | `allBundles()`, `findBundle(id)`, `bundleOf(lesson)`(차시 번호·쪽수·단원·성취기준·role), `findByPage(학기, 쪽)`, `unitPages(unit)`, `standardsOf(id)`, `standardSummary(code)`, `loadRegistry()`(학기 여덟 개와 `blurb`. 차시표가 아직 없는 학기는 `allBundles()` 에 나오지 않으므로 첫 화면의 학기 타일은 여기에서 얻습니다) |
| 차시 | `loadLesson(id)`, `visibleLessons()`, `lessonPaths(kind?)`, `readyAssets(lesson)`, `isPublic(lesson)`, `showDrafts()`, `lessonIds()`, `orphanLessons()` |
| 주소·이름 | `lessonRoute(id, sub?)`, `fileRoute(id, name)`, `absoluteUrl(route)`, `downloadName(id, label, ext)`, `lessonsLabel()`, `pagesLabel()`, `semesterLabel()`, `splitId()` |
| 가리키는 것 | `getMedia(lesson, ref)`, `mediaRoute(lesson, ref)`, `mediaFile(lesson, ref)`, `getFact(lesson, ref)`, `getPassage(lesson, id)`, `termMeaning(lesson, term)`, `shownMedia(lesson, where?)`, `creditShort(m)`, `creditFull(m)`, `creditList(media)` |
| 흐름·퀴즈 | `flowByLesson(lesson)`, `quizByLesson(lesson)`, `answerText(item)`, `slideNotes(lesson, no)`, `scored(lesson)` |
| 인쇄물 | `printJobs(lesson)`, `pptxFile(lesson)`, `deckCards(lesson)`, `worksheetKey(lesson)`, `splitFrame(frame)`, `papercraftModuleFile(lesson)`, `xmlText(s)` |
| 검수·공개 | `footerNotice(lesson?)`, `sheetFooter(lesson)`, `reviewedOn(lesson)`, `sealsOf(id)`, `reviewState(id)`, `publishGaps(id)`, `reviewerKey(by)`, `registrySeal()`, `registryOriginality()`, `COPY_GUARD` |
| 검사용 글 | `childStrings(lesson)`, `teacherStrings(lesson)`, `recordStrings(lesson)`, `parseLessonText(text)` |
| 검사 (`#lib/checks.ts`) | `factIssues(lesson)`, `sourceIssues(lesson)`, `factBoxes(lesson)`(사실 대조표에 찍을 글 묶음. 12절) |
| 플랫폼 페이지 (R41~R52) | `catalog()`(이번 빌드에 실리는 자료 전부. 한 줄의 꼴은 아래), `readyKinds(lesson)`(준비된 자료 종류, `KIND_ORDER` 차례), `formatLine(lesson, kind)`(자료 카드의 한 줄 설명), `semesterProgress(학기)`, `unitProgress(학기, 단원)`, `lessonNeighbours(id)`(같은 학기 안 차시표의 앞뒤 묶음), `courseLine(id, sep?)`("5학년 2학기 1단원 1차시"), `stageFooter(lesson)`(수업 화면·PPTX 의 바닥글 줄. 8절), `slidePhase(lesson, no)`(장을 쓰는 흐름 단계와 "01 도입" 머리말. 8절), `thumbRoute(id, kind)`, `thumbFile(id, kind, argv?)`(미리보기 그림의 주소와 dist 의 자리. 10절), `loadUpdates()`, `visibleUpdates()`, `updatesFile()`(업데이트 소식. 5절) |
| 파일 자리 | `ROOT`(저장소 뿌리), `hasLesson(id)`, `lessonFile(id)`, `lessonDir(id)`, `contentDir()` — 명세 파일을 고쳐 쓰는 도구(`sign`, `check:originality --record`, `migrate`)가 씁니다. `content/` 를 손으로 잇지 않습니다 (`CONTENT_DIR` 을 따르지 않게 되어 시험이 실제 명세에 서명합니다). `distDir()`, `cacheDir()` — 빌드한 사이트와 캐시의 자리 (10절) |

`lib/site.ts` 에는 고정 문구(`SITE`)와 이름표(`ASSET_LABEL`, `ASSET_ROUTE`, `LICENCE_LABEL`, `PER_LABEL`, `SIDES_LABEL`, `ORIENTATION_LABEL`, `REVIEW_LABEL`, `ROLE_LABEL`), 인쇄 기본값(`PRINT_DEFAULT`, `CARDS_PER_SIDE`), 인쇄 안내 한 줄(`printLine(print, pages)`), 양면 인쇄에서 종이를 넘기는 쪽(`DUPLEX_FLIP`. 안내 페이지의 인쇄 줄과 카드 인쇄 페이지의 '양면 맞추기'가 같은 말을 쓴다), 맞고 틀림의 표시(`MARK`, `MARK_LABEL`. 15절)와 따옴표 뒤 조사를 붙여 두는 `keepParticle(text)`(15절)가 있습니다. 같은 것은 여기 적힌 이름으로만 부릅니다.

플랫폼 페이지의 이름표도 `lib/site.ts` 에 있습니다 (브라우저에서도 읽힙니다).

| 이름 | 뜻 |
|---|---|
| `SITE.name`, `SITE.nameLead`, `SITE.shortName`, `SITE.tagline` | 사이트 이름 'nalssam의 초등사회콘텐츠 클라우드', 머리 이름표의 첫 줄 'nalssam의'와 둘째 줄(좁은 자리의 이름) '초등사회콘텐츠 클라우드', 첫 화면의 큰 제목 (R40, R43) |
| `KIND_ORDER` | 자료 종류를 늘어놓는 차례 (R43) |
| `KIND_GROUP`, `GROUP_ORDER`, `GROUP_LABEL` | 차시 자료실의 거르기 탭: 수업(`class`: 수업 화면), 인쇄(`print`: 학습지·카드·컬러링 도안·페이퍼크래프트·만들기 세트), 학생 활동(`student`: 확인 퀴즈·웹 활동·방탈출·3D) (R46) |
| `OPEN_LABEL` | 자료 카드의 여는 단추: 띄우기(수업 화면), 인쇄 페이지(인쇄물), 열기(그 밖) (R47) |
| `ACTIVITY_LABEL` | 웹 활동 네 가지의 이름 (분류하기, 짝 맞추기, 차례 맞추기, 그림에 이름표 놓기) |
| `LESSON_STATE_LABEL`, `UPDATE_LABEL` | 상태 표의 말: 공개·초안·준비 중, 새 자료·고침·알림 |
| `NAV`, `NAV_TOOLS`, `FOOT_LINKS` | 머리의 길잡이(차례·이름·주소), 찾기와 내 자료함 단추, 바닥글의 링크 (R42, R54). 주소는 base 없는 경로라 `href()` 를 씌웁니다 |

`catalog()` 의 한 줄(`CatalogItem`)은 아래 꼴입니다. 자료를 그리는 쪽은 명세를 다시 읽지 않고 이 값만 씁니다.

```ts
{
  key: '5-2/1/01#worksheet',      // 내 자료함에 담는 글 (R51)
  lessonId: '5-2/1/01', kind: 'worksheet',
  label: '학습지',                 // ASSET_LABEL
  title: '옛사람이 남긴 것에게 묻기', // 그 자료의 title. 없으면(수업 화면, 확인 퀴즈) 차시의 title
  lessonTitle: '이 큰 돌, 누가 어떻게?',
  semester: '5-2', unit: 1, lessonsLabel: '1차시', pagesLabel: '6~9쪽', course: '5학년 2학기 1단원 1차시',
  route: '/5-2/1/01/worksheet/',  // 여는 곳 (base 없음). 만들기 세트는 '/<id>/#making-kit'
  file: { route: '/files/5-2/1/01/worksheet.pdf', name: '5-2_1단원_1차시_학습지.pdf' }, // 수업 화면은 PPTX, 인쇄물은 PDF. 학생 페이지와 만들기 세트에는 없다
  format: 'PDF · A4 2쪽',          // formatLine(). '화면 22장 · PPTX', 'PDF · A4 가로 2쪽', '휴대폰·태블릿 · 5문항', '휴대폰·태블릿 · 분류하기', '수업 안 20분 · 재료 3가지'
  thumb: '/files/5-2/1/01/thumbs/worksheet.jpg', // 페이지가 있는 자료에만
  draft: true,                     // 검수 전 초안 (미리 보기 빌드에서만 나온다)
}
```

## 5. 명세에서 알아 둘 것

형식은 `schema/lesson.ts` 가 정합니다. 만드는 쪽이 서로 다르게 읽기 쉬운 것만 적습니다.

**차시와 흐름**
- 차시 번호는 묶음 id 에서 나옵니다 (`03-04` → 3, 4차시). 한 차시는 40분이고, 흐름의 시간 합은 차시마다 40분입니다.
- 두 차시 묶음은 흐름의 단계마다 `lesson` 이 적혀 있습니다. `flowByLesson()` 이 차시별로 나누어 줍니다. 안내 페이지는 차시마다 시간표를 따로 그리고 그 사이에 '쉬는 시간' 줄을 긋습니다. 쉬는 시간은 명세에 없습니다.
- 흐름 단계의 `slides: [첫 장, 끝 장]` 은 1번부터 빈틈없이 이어지고 모든 장을 덮습니다. `flowByLesson()` 의 `firstSlide` 로 "4차시부터 띄우기" 링크(`/<id>/slides/#5`)를 만듭니다.
- 수업 화면은 한 차시에 24장까지입니다 (`SLIDES_PER_LESSON`). 두 차시 묶음은 48장, 세 차시 묶음은 72장까지 씁니다 (형식이 막습니다).
- 퀴즈 문항은 `quizByLesson()` 으로 차시별로 나눕니다. `lesson` 을 적지 않은 문항은 마지막 차시의 것입니다. 문항을 띄우는 퀴즈 장이 있으면 문항의 차시는 그 장이 놓인 차시와 같습니다 (형식이 막습니다). 그래서 안내 페이지와 수업 화면이 같은 문항을 같은 차시의 것으로 보여 줍니다. 한 문항은 한 차시의 수업 화면에서만 띄웁니다. 다음 차시에 다시 물을 문항은 `quiz.items` 에 따로 적습니다 (형식이 막습니다).
- 안내 페이지의 준비물은 학습지와, 흐름의 `uses` 에 나오는 인쇄물마다 한 줄(이름, `PER_LABEL[print.per]`, `print.materials`), 그리고 명세의 `prepare` 를 모은 것입니다. 흐름에서 쓰지 않는 인쇄물(`printJobs()` 의 나머지)은 준비물에 넣지 않고 '더 해 볼 자료'로 따로 보여 줍니다.

**가리키는 것**
- `facts`·`media` 를 가리키는 값은 `"f3"`(이 묶음) 또는 `"05/f3"`(같은 단원의 앞 묶음)입니다. 그림도 `"05/rain-gauge"` 처럼 가리킵니다. 풀 때는 늘 `getFact()`·`getMedia()`·`mediaRoute()` 를 씁니다. `lesson.media.find()` 로 찾지 않습니다.
- 낱말의 풀이는 `terms.new` 한 곳에만 있습니다. 낱말 장(`layout: term`)은 `termMeaning(lesson, slide.term)` 으로 풀이를 얻습니다.
- 카드는 `deckCards(lesson)` 로 얻습니다. 뒷면을 적지 않은 카드의 풀이와 단원 덱(`collect`)이 모은 앞 묶음의 카드가 이미 채워져 있습니다. 카드의 그림은 `getMedia(card.lesson, card.media)` 로 얻습니다.
- 읽기 자료(`passages`)는 수업 화면의 `passage` 장과 학습지의 `passage` 블록이 같은 글을 가리킵니다. 제목, 문단, 그리고 글 아래 `source` 한 줄을 그대로 찍습니다.
- 남의 그림은 이용 조건이 퍼블릭 도메인(`PD`)·`CC0`, 공공누리 제1유형(`KOGL-1`), `CC-BY`, `CC-BY-SA` 인 것만 씁니다 (형식이 다른 값을 받지 않습니다). 공공누리 2~4유형, CC 의 NC·ND 조건, 따로 받은 허락은 고쳐 쓰거나 다시 나누는 데 조건이 붙어 이 사이트의 자료와 함께 내놓을 수 없습니다. 같은 그림을 공공누리 제1유형이나 퍼블릭 도메인으로 구할 수 있으면 그쪽을 씁니다.
- `CC-BY-SA` 그림은 원본 그대로만 씁니다 (`change: none`). 자르거나 본떠 그리거나 그림 파일 위에 무엇을 그려 넣지 않습니다. 고친 것은 CC BY-SA 로만 내놓을 수 있어서입니다. 형식이 막습니다 (`npm run check` 가 실패합니다).
- 지어낸 그림(`factual: false`. AI 로 만든 그림도 여기에 듭니다)은 수업 화면의 question·points 장에 곁그림으로만 쓸 수 있습니다. 아이가 보고 읽어 내는 자리(picture·compare·steps 장, 학습지, 카드, 컬러링, 웹 활동)에는 쓸 수 없습니다. 형식이 막습니다. AI 로 만든 그림은 우리가 만들었든 남이 만들었든 출처 표시에 'AI로 만든 그림'이 붙습니다 (`creditShort()`·`creditFull()` 이 붙입니다).

**글의 길이**
- `T(30)` 처럼 길이가 정해진 칸은 그 길이까지 넘치지 않게 그리는 것이 만드는 쪽의 몫입니다. 수업 화면: 제목 30자(질문 장 40자), 부제·도움말·항목·단계 40자, 견주기 항목 30자, 이름표 12자, 낱말 14자, 풀이 50자, 쓰임 예 60자. 카드: 앞 14자, 뒤 50자. 퀴즈: 물음 80자, 보기 30자, 단답 14자. 정확한 값은 `schema/lesson.ts` 에 있습니다.
- 읽기 자료는 문단 6개, 문단마다 120자까지입니다. 수업 화면의 `passage` 장이 가리키는 읽기 자료는 문단 4개, 모두 300자까지입니다 (`PASSAGE_SLIDE`. 본문 44px 로 한 장에 들어가는 길이입니다). 더 긴 글은 학습지에만 싣거나 둘로 나눕니다.

**선택 자료**
- `state` 는 skip(만들지 않음, `reason`) · planned(만들 예정, `idea`) · ready(만들었음) 입니다. 사이트에는 ready 만 보입니다 (안내 페이지는 준비된 자료만 늘어놓습니다). `reason` 과 `idea` 는 제작 기록이라 사이트에 보여 주지 않습니다. 묶음마다 어떤 자료를 만들 예정이고 어떤 것을 만들지 않는지는 `docs/ROADMAP.md` 의 표가 알려 줍니다.
- 인쇄 안내는 명세의 `print` 를 직접 읽지 않고 `printJobs(lesson)` 의 `print`(빈 칸이 기본값으로 채워진 값)와 `pages` 를 씁니다.
- 카드의 놀이 방법(`assets.cards.games`)은 차시 안내 페이지에 보이고(6절), 컬러링의 '찾아볼 것'(`assets.coloring.look_for`)은 컬러링 쪽의 그림 아래에 찍힙니다(7절).

**무게가 있는 차시** (`sensitivity.level`)
- `scored(lesson)` 이 false 인 차시(care, no_play)의 확인 퀴즈·웹 활동·수업 화면은 점수, 별, 순위, 시간 재기, 축하 효과를 보여 주지 않습니다. 맞았는지와 풀이(`explain`, `why`)만 보여 줍니다. 이 함수로만 판단합니다.
- 피해를 담은 사실(`painful`)은 퀴즈·카드·웹 활동이 가리킬 수 없고, 그런 사실에 기댄 낱말은 뒷면을 적지 않은 카드로 만들 수 없습니다 (낱말 풀이가 카드에 찍힙니다). 그런 사실을 그린 그림(`media[].facts` 가 그 사실을 가리키는 그림)도 카드·컬러링·웹 활동에 쓸 수 없습니다. 카드가 다른 사실을 가리키고 있어도 그림은 그대로 찍히기 때문입니다. 수업 화면과 학습지에는 쓸 수 있습니다. no_play 차시의 카드는 낱말만 담습니다. 형식이 막습니다. no_play 차시의 카드는 단원 덱에 모이지 않습니다.
- 피해를 담은 사실이 있는 차시는 care 나 no_play 입니다. 앞 묶음의 그런 사실을 가리키는 묶음(예: 단원 정리지의 읽기 자료)도 같습니다. 앞의 것은 형식이, 뒤의 것은 로더가 막습니다. 위의 카드 규칙과 그림 규칙도 앞 묶음의 사실과 그림에 똑같이 걸립니다 (로더가 막습니다).

**업데이트 소식** (`content/updates.yaml`, 형식은 `schema/updates.ts`. R49)
- 소식의 목록 하나입니다: `date`("2026-11-21"), `kind`(new 새 자료 · fix 고침 · notice 알림. 화면의 말은 `UPDATE_LABEL`), `title`(50자까지), `body`(선택, 300자까지), `lessons`(선택, 차시표에 있는 묶음 id 의 목록).
- 파일에 적는 차례는 아무래도 됩니다. `loadUpdates()` 가 날짜가 늦은 것부터(같은 날은 적은 차례) 줍니다. 날짜가 달력에 없거나, 갈래가 셋 가운데 하나가 아니거나, 차시표에 없는 묶음을 가리키면 `SpecError` 입니다.
- 화면에는 `visibleUpdates()` 만 씁니다. 차시를 가리키지 않는 소식은 늘 보이고, 가리키는 소식은 가리킨 묶음이 모두 이번 빌드에 실릴 때만 보입니다. 그래서 초안의 소식을 미리 적어 두어도 공개 빌드에 나오지 않습니다. 미리 보기 빌드에서 초안을 가리킨 소식은 `draft: true` 이고 화면에 '초안' 표를 붙입니다. `links` 는 가리킨 차시의 이름과 차시 자료실 경로입니다.
- 차시를 더하거나 공개하는 PR 은 이 파일에 `kind: new` 소식을 하나 적습니다 (`npm run new` 가 할 일로 알려 줍니다). 날짜는 공개하는 날로 고쳐 적어도 됩니다. 소식의 글도 교사가 읽는 글이라 15절을 따릅니다. 이 파일은 어느 차시의 지문에도 들지 않습니다.

## 6. 함께 쓰는 틀

### 미리 들어 있는 파일 (계약 파일)

- `src/layouts/Base.astro` — 모든 페이지의 `<html>`. props 는 `title`, `description?`, `kind: 'site' | 'print' | 'stage' | 'student'`, `lesson?`. tokens.css 와 Pretendard 를 여기에서만 싣습니다. `<body data-kind data-draft>` 안에 `<slot />` 을 두고, `<head>` 에 넣을 것은 `<slot name="head" />` 로 받습니다. kind 가 site·student 이면 맨 아래에 `<p class="site-notice">` 로 `footerNotice(lesson)` 을 찍습니다 (차시가 없는 페이지는 공개 빌드에서 `SITE.siteNotice`, 미리 보기에서 `SITE.previewNotice` 가 찍힙니다. 12절). print 는 바닥글(`sheetFooter`)이 그 일을 하고, stage 는 모든 장의 바닥글 줄(`stageFooter(lesson)`. 8절)이 그 일을 합니다. site 페이지에서 이 줄은 바닥글(R54)의 맨 아래 작은 줄입니다. site 가 아닌 페이지는 `noindex` 이고, 미리 보기 빌드의 모든 페이지와 초안의 페이지(`data-draft`)는 어느 빌드에서든 `noindex,nofollow` 입니다. 차시에 딸린 페이지는 `lesson` 을 꼭 넘깁니다.
- `src/components/Media.astro` — 그림 한 장. props 는 `lesson`, `id`(가리키는 값), `caption?: boolean`, `credit?: boolean`, `frame?: boolean`, `class?`. `<figure class="media">` 안에 `alt` 가 달린 `<img>` 와 `.media-caption`, `.media-credit`(`creditShort()`)을 찍습니다. 그림을 넣는 모든 페이지가 이것만 씁니다. 수업 화면의 `picture` 장은 `caption={false}` 로 부르고 장의 `caption` 을 찍습니다.
  - 사진(`kind: photo`)에는 가는 테두리를 두릅니다: 화면 1px `--line`, 종이 1px(0.75pt) `--rule`. 하늘이 옅은 사진이 바탕에 녹아 그림의 끝이 보이지 않아서입니다. 종이의 선은 쓰는 줄과 같은 `--rule` 이고 표의 선(`--ink-dim`, 0.4mm)보다 옅고 가늡니다. 100dpi 로 그려도 네 변이 보여야 합니다 (`--line` 은 종이에서 거의 보이지 않고, `--rule-soft` 는 하늘이 흰 사진에서 사진 위에 빈 띠가 있는 것처럼 읽혔습니다). 테두리는 `<img>` 상자가 아니라 그려진 그림의 둘레를 따라갑니다. contain 으로 줄여 상자 옆에 빈 띠가 남아도 띠를 두르지 않습니다. 화면은 번짐 없는 `drop-shadow` 이고, 종이는 `Base.astro` 의 스크립트가 `<img>` 상자를 그려진 그림의 크기로 줄이고 남는 자리를 바깥 여백으로 돌린 뒤(`data-framed`) 그 바깥에 `outline` 을 긋습니다. 그림 아래에 깐 사각형이나 `border` 는 100dpi 에서 사진에 덮여 사라지고, 인쇄에서 `filter` 를 쓰면 사진이 다시 찍혀 PDF 가 커집니다. Chromium 은 1px 보다 가는 outline 을 1px 로 그리므로 굵기는 1px 로 적습니다. 그림을 놓는 쪽은 따로 할 일이 없습니다. 그림 상자의 크기를 스크립트로 바꾸는 쪽은 바꾼 뒤에 `media-layout` 이벤트를 보내 테두리를 다시 재게 합니다. 도해·지도·그림(drawing)에는 두르지 않습니다.
  - `frame={false}` 는 그림이 이미 테두리 있는 상자 안에 있는 자리에만 줍니다: 웹 활동의 카드, 작은 미리보기.
- `src/components/Qr.astro` — QR 코드 한 개. props 는 `url`(`absoluteUrl()` 로 만든 온전한 주소)과 `label`(화면 낭독기가 읽는 이름). 빌드할 때 SVG 로 그리고 바깥 서비스를 부르지 않습니다. 바탕은 `--card`, 칸은 `--navy` 이고 크기는 부르는 쪽이 `.qr` 에 정합니다. 차시 안내 페이지와 수업 화면의 QR 창이 같이 씁니다.
- `src/lib/url.ts` — `href()`.
- `src/styles/tokens.css` — 색·글자·간격과 인쇄물 치수.

### 페이지 종류와 틀

| kind | 페이지 | 틀 (담당) |
|---|---|---|
| site | 첫 화면·교과서 목차·단원·차시 자료실·자료 유형별·업데이트·제작 현황·내 자료함·소개·이용 조건·오류 제보·404 | `src/layouts/SiteLayout.astro` (사이트) |
| print | worksheet·cards·coloring·papercraft | `src/components/print/PrintLayout.astro` (인쇄물) |
| stage | slides | `src/components/slides/Stage.astro` (슬라이드) |
| student | quiz·play | `src/components/play/StudentLayout.astro` (활동) |

- 틀은 모두 Base.astro 를 감쌉니다.
- 검색 색인에는 site 페이지의 `<main data-pagefind-body>` 만 들어갑니다. 인쇄·수업 화면·학생 페이지에는 `data-pagefind-body` 를 붙이지 않습니다.
- 검색 상자(낱말 찾기)는 첫 화면의 머리글 안에 쪽수·차시로 찾기와 한 덩어리로 둡니다 (R43. 그 덩어리의 id 는 `find` 이고, 머리의 찾기 단추(`NAV_TOOLS.search`)가 다른 페이지에서는 `/#find` 로 가고 첫 화면에서는 그 칸으로 초점을 옮깁니다). 첫 화면의 차례는 R43 이 정합니다: 머리글과 찾기, 학년·학기 타일, 자료 유형 타일, 최근 올라온 자료, 제작 현황 요약, 이렇게 만듭니다. 색인(`/pagefind/pagefind.js`)은 빌드 6단계에서야 생기므로 가져오기 문으로 묶지 않고, 브라우저에서 `import(/* @vite-ignore */ href('/pagefind/pagefind.js'))` 로 불러옵니다. 불러오지 못하면(`astro dev`, 6단계를 돌리기 전의 dist) 상자를 숨긴 채 둡니다. 검색은 사이트 밖으로 아무것도 보내지 않습니다.
- 그림은 자르지 않습니다 (`object-fit: contain`). CC BY-SA 그림은 고치지 않고 그대로 씁니다 (5절). 잘라야 하는 그림(CC BY-SA 가 아닌 것)은 내용 담당이 자른 파일을 따로 올리고 `change: cropped` 로 적습니다. PPTX 에 넣는 그림도 같습니다 (8절).
- 그림 옆에는 `creditShort()` 를 찍습니다 (그림을 쓰는 자리마다 만든 이와 이용 조건이 찍힙니다). 제목과 주소가 든 `creditFull()` 은 차시 안내 페이지의 '출처'에 넣고, 이용 조건의 이름에는 `licenceUrl` 로 그 조건의 안내 페이지(CC 는 deed)를 겁니다. PPTX 마지막 장은 제목을 뺀 `creditList()` 를 씁니다 (8절). 출처 표시를 손으로 쓰지 않습니다.
- 남의 그림은 그 그림의 이용 조건을 따르고 CC BY-NC-SA 에 들지 않습니다. `/licence/` 와 `LICENSE-CONTENT.md` 가 그렇게 밝힙니다 (`SITE.licenceNote`).
- '출처'에 올릴 그림은 `shownMedia(lesson)` 에서 얻습니다. 이 묶음의 화면·인쇄물에 실리는 그림 전부이고, 앞 묶음에서 빌려 온 그림과 단원 덱에 모은 카드의 그림도 들어 있습니다. `lesson.media` 를 그대로 늘어놓지 않습니다 (단원 정리 묶음은 `lesson.media` 가 비어 있습니다). PPTX 마지막 장은 `shownMedia(lesson, 'slides')`(수업 화면에 실리는 그림만)를 씁니다.
- 명세의 글은 글자로만 넣습니다. `set:html`·`innerHTML` 로 넣지 않고, 글 안의 HTML·마크다운을 풀지 않습니다. SVG 는 `<img>` 로만 싣고 본문에 끼워 넣지 않습니다. 예외는 전개도 모듈이 만든 SVG 하나입니다. 그 SVG 에 들어가는 명세의 글은 모듈이 `xmlText()` 로 감쌉니다 (7절).

### 사이트의 머리와 바닥글 (사이트, R42·R54)

- 머리: 왼쪽에 표시 그림과 두 줄 이름표(`SITE.nameLead` 위에 `SITE.shortName`), 길잡이 `NAV`(교과서 자료는 학기 여덟 개를 펼치는 메뉴. 차시표가 없는 학기는 링크 없이 '차시표 준비 중'), 오른쪽에 `NAV_TOOLS` 의 찾기와 내 자료함(담은 수 `<span data-collect-count>`). 지금 페이지의 길잡이에 `aria-current="page"` 를 붙입니다 (`NavKey`).
- 760px 아래: 이름표와 찾기·메뉴 두 단추만. 메뉴는 `<details>` 로 폭 전체의 판을 열고 같은 링크를 늘어놓습니다. 스크립트가 있으면 Esc 로 닫고 초점을 메뉴 단추(`<summary>`)로 돌려줍니다. 누르는 자리는 44px 이상입니다.
- 바닥글: 첫 줄 `FOOT_LINKS`(소개 · 이용 조건 · 오류 제보 · 깃허브 저장소. 차시 자료실에서는 오류 제보에 `?id=<id>` 를 붙입니다), 둘째 줄 이용 조건 안내(`SITE.licence.name` 과 `SITE.licenceNote`. 14절), 셋째 줄 "만든 이 {SITE.author} · {SITE.name}", 맨 아래 작게 `footerNotice()`(Base.astro 의 `.site-notice`).
- 모든 site 페이지가 `collect.ts` 의 `init()` 을 불러 머리의 담은 수를 맞춥니다 (아래 '함께 쓰는 화면 부품').

### 함께 쓰는 화면 부품 (계약, `src/components/site/ui/`)

R53 의 모양을 한 자리에 모은 부품입니다. 색·크기는 tokens.css 의 변수만 쓰고, 그림자·그러데이션이 없습니다 (`tests/contract/ui.test.ts` 가 봅니다). 쓰는 본보기는 `tests/contract/fixtures/site` 의 `/ui/` 쪽입니다.

| 부품 | props | 꼴 |
|---|---|---|
| `Kicker.astro` | `no?`, `as?`, `id?`, `class?` · 글은 slot | 섹션 제목 위의 청록 머리말 (700, 14px). `no` 를 주면 "02 전개"처럼 두 자리 번호가 앞에 붙는다. 차례가 실제로 있는 자리에만 준다. |
| `Band.astro` | `class?` · 글은 slot | 민트 띠: 가운데, 굵게, 알약 모서리. 강조할 말은 `<strong>`(청록). 한 페이지에 하나까지. |
| `StatusChip.astro` | `state`(published·draft·planned·new·fix·notice), `label?`, `quiet?` | 상태 표. 말은 `LESSON_STATE_LABEL`·`UPDATE_LABEL`, `label` 로 바꿀 수 있다 ("초안 5차시"). 산호색은 `new` 에만, 그것도 보이는 소식 가운데 가장 최근의 새 자료 하나에만 쓰고 나머지 `new` 에는 `quiet`(청록 테두리)를 준다. |
| `TypeIcon.astro` | `kind`, `size?`(기본 20), `class?` | 자료 종류 열 가지의 선 그림 (24 칸, 선 1.6, `currentColor`, `aria-hidden`). 늘 자료 이름 곁에 둔다. |
| `ResourceCard.astro` | `item`(`CatalogItem`), `withLesson?`, `level?`(2·3·4, 기본 3), `uid?` | 자료 카드 (R47). 아래 |

ResourceCard:
- 짜임: `<article class="rc" data-kind data-group data-key data-draft>` 안에 미리보기 틀(4:3, 종이색. 자료 그림 위에 `<img class="rc-thumb" loading="lazy">`. 그림이 실리지 않으면 `onerror` 가 그 `<img>` 를 지워 자료 그림이 보인다), 자료 종류와 담기 단추, 이름(`h{level}`), 차시 줄(`withLesson`), 한 줄 설명(초안이면 '초안' 표), 단추 줄(여는 단추 `OPEN_LABEL`, 파일이 있으면 내려받기 `download={file.name}`, 학생 페이지면 QR).
- `data-group` 은 `KIND_GROUP` 의 값입니다. 차시 자료실의 거르기 탭은 이 값으로 카드를 숨깁니다 (스크립트가 없으면 모두 보입니다).
- QR: 학생 페이지(확인 퀴즈, 웹 활동)에만 `<button popovertarget>` 과 `<div class="rc-pop" popover>`(자료 종류, 그 카드의 이름 `item.title`, QR, `absoluteUrl(route)` 주소 글자, 닫기). id 는 `qr-<key>` 이고, 같은 페이지에 같은 자료의 카드를 두 번 그리면 `uid` 로 가릅니다.
- `withLesson` 은 여러 차시의 자료를 늘어놓는 자료 유형별·내 자료함에서 켭니다 ("5학년 2학기 1단원 1차시 · 이름" 링크).
- 격자는 부르는 페이지가 정합니다 (`<ul>` 의 `<li>` 마다 카드 하나). 휴대폰(600px 아래)에서 카드는 미리보기를 왼쪽에 작게 두는 꼴로 바뀌므로 한 줄에 하나씩 놓습니다. 카드의 높이는 칸에 맞춰 늘어납니다 (`height: 100%`).
- 화면 읽기 프로그램에는 단추마다 어느 자료인지가 붙어 읽힙니다 ("띄우기: 수업 화면 이 큰 돌, 누가 어떻게?").
- 담기 단추의 보이는 말은 담기 전 '담기', 담은 뒤(`aria-pressed="true"`) '담음'입니다. 화면 읽기 프로그램에는 늘 "담기: <자료>"와 눌림 상태로 읽힙니다.
- 한 줄 설명과 '초안' 표 사이에는 빈칸을 둡니다 ('PPTX초안'처럼 붙여 읽히지 않게). 차시 자료실의 카드 격자는 검색 색인에서 뺍니다 (`data-pagefind-ignore`. 찾기 결과의 발췌가 단추 글로 채워졌습니다). 자료의 이름은 교사용 안내에 있어 그대로 찾힙니다.

내 자료함의 저장 (`src/components/site/collect.ts`, R51):
- 열쇠 `STORAGE_KEY` = `nalssam-cloud:saved:v1`, 값은 `CatalogItem.key`("5-2/1/01#worksheet") 글의 JSON 배열(담은 차례). 다른 꼴의 값은 읽을 때 버립니다.
- 내보내는 것: `storage()`(쓸 수 있는 localStorage 또는 undefined), `read()`, `has(key)`, `count()`, `toggle(key)`(바꾼 뒤 담겨 있는가. 저장하지 못하면 원래 상태), `remove(key)`, `subscribe(fn)`(이 페이지에서 바꾸거나 다른 탭에서 바꾸면 `fn(keys)`. 그만 들을 함수를 돌려준다), `refresh(root?)`, `init()`, 그리고 머리의 담은 수를 이번 빌드에 실린 자료로만 세는 `encodeKnown(keys, order)`·`decodeKnown(text, order)`·`shownCount(keys, known?)`. 저장소를 만지는 곳은 모두 try/catch 안에 있고 오류를 밖으로 던지지 않습니다.
- 페이지의 표시: `<button type="button" data-collect="<key>" aria-pressed="false" hidden>` 은 담기 단추이고(ResourceCard 가 그립니다), `[data-collect-count]` 요소에는 담은 수가 글과 `data-count` 로 들어갑니다 (0 일 때 숨기려면 `[data-count='0']` 으로). 페이지에 `[data-collect-known]`(머리가 `encodeKnown(catalog() 의 key, KIND_ORDER)` 로 싣는다)이 있으면 담은 수는 그 목록에 있는 열쇠만 셉니다. 그래서 머리의 수와 `/my/` 에 보이는 카드의 수가 같습니다. `init()` 은 저장소를 쓸 수 있을 때만 담기 단추의 `hidden` 을 풉니다. 여러 번 불러도 되고(누르기는 한 번만 듣습니다), 단추를 새로 그린 뒤에 다시 부르면 그 단추의 상태도 맞춥니다.
- 이 파일은 site 페이지에서만 싣습니다. 학생 페이지(9절)는 기기에 아무것도 남기지 않습니다.
- `/my/` 는 `catalog()` 를 JSON 으로 싣고(`<script type="application/json">`), `read()` 로 담은 것을 골라 카드로 보여 줍니다. 목록에 없는 열쇠(공개 빌드에서 사라진 초안 등)는 보여 주지 않고 지우지도 않습니다. 빼기는 `remove(key)` 다음 다시 그리기입니다.

### 차시 자료실이 맡는 것 (사이트)

차시 안내 페이지(`/<id>/`)는 이번 판부터 화면에서 '차시 자료실'이라고 부릅니다 (R46). 이 문서의 '안내 페이지'는 모두 이 페이지입니다.

- 차례(R46): 현재 위치, 머리(`courseLine(id, ' · ')` 머리말, 제목, 한 줄 소개, 교과서 쪽·수업 시간·상태 표, 접힌 성취기준), '자료'(ResourceCard 격자와 거르기 탭 전체·수업·인쇄·학생 활동), 교사용 안내(준비물, 수업 흐름, 문항과 정답, 학습지 풀이, 예상되는 오개념, 평가, 교사 메모, 사실과 출처, 그림 출처), 앞뒤 차시(`lessonNeighbours(id)`). 교사용 안내의 글은 지금 그대로 쓰고 모양만 바꿉니다.
- 차시·쪽수·성취기준(`standardsOf()`. 요약은 공식 문구가 아니라고 밝힙니다), 승인한 날(`reviewedOn()`), 고친 내용(`corrections`).
- 자료는 `catalog()` 가운데 이 차시의 것을 ResourceCard 로 늘어놓습니다 (전에 있던 큰 버튼 둘은 이 카드들로 바뀌었습니다). 자료의 이름은 `ASSET_LABEL` 의 것을 씁니다 (페이퍼크래프트와 만들기 세트를 헷갈리지 않게). 만들기 세트의 카드는 이 페이지 안의 `id="making-kit"` 자리로 갑니다.
- 준비물에서 인쇄물 줄과 같은 것을 가리키는 `prepare` 항목(예: 학습지)은 따로 적지 않고 그 인쇄물 줄에 합칩니다. 한 사실 아래 같은 출처(이름·주소가 같은 것)는 한 번만 보여 줍니다. '출처'의 그림 이름은 `credit.title`(사람이 읽는 한국어 제목)이고, 파일 이름을 그대로 보여 주지 않습니다.
- QR 은 학생 페이지(확인 퀴즈, 웹 활동)의 자료 카드가 여는 작은 창과 수업 화면의 QR 창(8절)에만 있습니다. 모두 `Qr.astro` 를 쓰고, 주소는 `absoluteUrl()` 로 만듭니다. 함께 보여 주는 주소 글자는 '/' 뒤에서만 줄을 바꿉니다 (`UrlText.astro`).
- 학습지 풀이(`worksheetKey()`)는 이 페이지의 접힌 상자에만 보여 줍니다.
- 카드가 ready 이면 놀이 방법(`assets.cards.games` 의 `name`·`how`)을 카드 줄 아래에 보여 줍니다. 단원 덱의 놀이 방법은 단원 정리 묶음의 안내 페이지에 같은 꼴로 보입니다. 카드 인쇄 페이지에는 찍지 않습니다 (쪽수가 2 × ceil(장수 ÷ 8) 로 정해져 있습니다). 본보기는 `tests/contract/fixtures/site` 의 안내 페이지입니다.
- 단원 페이지(R45)는 단원 정리 묶음이 실리면 그 묶음의 카드·학습지를 '단원 자료'로 맨 위에 겁니다. 명세에 없는 단원 자료를 만들어 내지 않습니다.

## 7. 인쇄물

### 한 쪽의 짜임

모든 인쇄 페이지는 한 쪽마다 아래 꼴을 내놓습니다. `src/components/print/` 의 `<PrintLayout>` 과 `<Sheet>` 가 만들고(인쇄물. 뼈대는 미리 들어 있습니다), 페이퍼크래프트 페이지도 이것을 씁니다. 쓰는 본보기는 `tests/contract/fixtures/site` 의 컬러링 페이지입니다.

```html
<section class="sheet">
  <header class="sheet-head">제목 · 반·이름 칸</header>
  <div class="sheet-body">…</div>
  <footer class="sheet-foot">sheetFooter(lesson) · 쪽/전체</footer>
</section>
```

| | 세로 | 가로 |
|---|---|---|
| `.sheet` | 210 × 297mm | 297 × 210mm |
| 여백 (`--page-margin`) | 10mm | 10mm |
| `.sheet-head` (`--sheet-head`) | 높이 22mm | 높이 22mm |
| `.sheet-body` | **190 × 249mm** | **277 × 162mm** |
| `.sheet-foot` (`--sheet-foot`) | 높이 6mm | 높이 6mm |

- 크기는 고정입니다. `.sheet-body` 는 `position: relative` 입니다. 넘친 내용을 `overflow: hidden` 으로 가리지 않습니다.
- 틀의 글(머리의 학기·단원·차시 줄, 반·이름 칸, 바닥글과 쪽 번호)은 8pt 이상입니다. 공개된 차시의 바닥글은 주소가 들어 두 줄로 접히므로 줄 간격을 좁혀(8pt × 1.05) 두 줄이 6mm 안에 들게 합니다. 9pt 하한은 아이가 읽고 쓰는 글의 것이고 틀의 글에는 걸지 않습니다.
- 본문의 마지막 블록과 바닥글의 글자 사이는 6mm 이상 띄웁니다. 바닥글이 한 줄이면 바닥글 상자 안에 3mm 남짓이 비므로 본문 쪽에서 나머지를 띄웁니다. 쓰는 칸이 남는 높이를 나누어 가질 때도 이 틈은 남깁니다. 실제 크기로 찍는 전개도는 바닥글에 따라 줄일 수 없으므로 늘 두 줄 바닥글에 맞춰 본문 아래 6.2mm 를 비웁니다 (`generators/papercraft/net.ts` 의 `DRAW_BOTTOM`). `scripts/render-pdf.mjs` 는 모든 인쇄물에서 이 틈이 모자라면 멈춥니다.
- `<PrintLayout lesson={lesson} job={job}>` — job 은 `printJobs(lesson)` 가운데 하나. 화면에서는 회색 바탕 위에 종이 미리보기, 인쇄 버튼, PDF 내려받기(`href(job.file)`, `download={job.download}`), 차시 안내로 돌아가기, 인쇄 안내(`printLine(job.print, job.pages)`, `job.print.paper`, `job.print.materials`, `job.print.note`)를 보여 주고, 인쇄할 때는 종이만 나옵니다. `@page` 방향은 `job.print.orientation` 입니다.
- `<Sheet lesson={lesson} job={job} no={1} title="…" sub="…" name="student">` — 한 쪽. `lesson`·`job` 은 바닥글(`sheetFooter(lesson) · 쪽/전체`)과 방향에 씁니다. `name` 은 `'student' | 'group' | 'none'` 이고 반·이름 칸을 정합니다. `title`·`sub`·이름 칸은 머리(22mm) 안에 들어가야 합니다. 넘친 글은 본문 위에 겹쳐 찍힙니다 (아래 조건 2 가 잡습니다).
- HTML 상자의 선은 `src/styles/print.css` 에 둡니다: `.cut` 실선 2px(0.53mm, 자르는 선), `.fold` 점선 1px(접는 선). Chromium 은 HTML 테두리 굵기를 px 아래로 버려 그리므로(0.5mm 는 1px 로 찍힌다) px 로 적습니다. 화면에만 보이는 것은 `.no-print`. 전개도 SVG 안의 선은 모듈이 직접 그립니다 (아래 '페이퍼크래프트').
- 흑백으로 뽑아도 읽혀야 합니다. 색으로만 구분하지 않고 선 굵기·무늬·글자로 구분합니다.
- 쓰는 칸은 줄 간격 10mm 이상, 본문 12pt 이상, 지시문 13pt 이상.
- 인쇄 페이지의 그림에 `loading="lazy"` 를 쓰지 않습니다 (Media.astro 는 쓰지 않습니다).

### 글꼴

인쇄 페이지(`kind: print`)는 고정 굵기 Pretendard 로 찍습니다. 가변 글꼴로 찍으면 Chromium 이 PDF 에 Type 3 글꼴을 수십 벌 넣어 글을 고르거나 찾기 어렵습니다. 고정 굵기 글꼴은 CID TrueType 으로 들어갑니다 (`pdffonts` 로 봅니다. `tests/contract/print.test.ts` 가 지킵니다). PDF 에는 Type 3 글꼴도, Pretendard 가 아닌 대신 글꼴도 없어야 합니다.

- 글꼴 파일은 패키지의 온전한 woff2 가운데 인쇄 페이지가 실제로 쓰는 굵기만 씁니다: 400·500·600·700·800 (`src/components/print/fonts.ts` 의 `PRINT_FONTS`). `@font-face` 는 우리가 적고 `PrintLayout.astro` 가 `<head>` 에 넣습니다. tokens.css 가 `body[data-kind='print']` 의 `--font` 를 `Pretendard` 로 바꿉니다.
- 파일은 `/_fonts/pretendard/` 에서 나갑니다. 빌드에서는 인쇄 페이지가 하나라도 있을 때만 `astro.config.mjs` 가 dist 로 복사하고, `astro dev` 는 `node_modules` 에서 바로 내줍니다. 다른 페이지는 이 글꼴을 싣지 않습니다.
- 이 약속은 인쇄 페이지의 것입니다. 화면 페이지(site·stage·student)는 Base.astro 가 싣는 가변 글꼴의 나눈 CSS(`pretendardvariable-dynamic-subset.css`)를 그대로 씁니다. 브라우저는 그 가운데 화면의 글자가 든 조각만 받아 옵니다.
- 고정 굵기 글꼴의 나눈 CSS(`pretendard-dynamic-subset.css`. 굵기마다 92조각, 모두 1,700개 남짓·30MB)는 어느 빌드에도 싣지 않습니다. 인쇄 페이지가 없는 공개 빌드에도 실리고 있었습니다.
- 목록에 없는 굵기(300, 900 등)를 CSS·전개도에 쓰지 않습니다. 쓰려면 `PRINT_FONTS` 에 더합니다. 없는 굵기는 브라우저가 흉내 내어 그려 화면과 PDF 가 어긋납니다.
- SVG 의 글에 테두리(`stroke`)를 둘러 바탕과 떼어 놓으면 Chromium 이 그 글을 Type 3 글꼴로 넣습니다. 글 뒤를 비우려면 글 아래에 채운 사각형을 깝니다.

### 쪽수와 넘침 검사

쪽수는 손으로 적지 않습니다. `printJobs()` 의 `pages` 가 기준입니다: 학습지는 `worksheet.pages` 의 수, 카드는 2 × ceil(장수 ÷ 8), 컬러링은 1, 페이퍼크래프트는 명세의 `pages`.

`scripts/render-pdf.mjs` 는 인쇄 페이지마다 아래를 확인하고, 하나라도 어긋나면 어느 차시 몇 쪽인지 적고 빌드를 멈춥니다.

재기 전에 `page.emulateMedia({ media: 'print' })` 를 겁니다. `.no-print` 와 `@media print` 로 달라지는 모양이 재는 값에 섞이지 않게 하려는 것입니다. 화면 모양으로 재면 화면에만 보이는 안내가 든 멀쩡한 쪽이 걸리고, 인쇄할 때만 커지는 상자는 빠져나갑니다.

1. `.sheet` 의 개수가 `pages` 와 같다.
2. 모든 `.sheet`, `.sheet-head`, `.sheet-body`, `.sheet-foot` 가 `scrollHeight <= clientHeight + 1` 이고 `scrollWidth <= clientWidth + 1` 이다. (크기가 고정된 상자는 넘쳐도 PDF 쪽수가 늘지 않아서 찍기 전에 DOM 에서 잡습니다. 머리의 글이 22mm 를 넘으면 `.sheet` 와 `.sheet-body` 는 그대로인 채 본문 위에 겹쳐 찍히므로 머리와 바닥글도 따로 잽니다.)
3. 찍은 PDF 의 쪽수가 `pages` 와 같다.
4. `document.fonts.ready` 뒤에 `document.fonts` 에 status 가 error 인 글꼴이 없고 loaded 인 글꼴이 하나 이상이다. (Chromium 이 찍은 PDF 에는 글꼴 이름이 남지 않아서, 글꼴이 실렸는지는 찍기 전 화면에서 봅니다.)
5. 찍은 PDF 의 모든 쪽이 `job.print.orientation` 에 맞는 크기다: 세로 210 × 297mm, 가로 297 × 210mm (±1mm). PDF 는 `page.pdf({ preferCSSPageSize: true, printBackground: true })` 로 찍는다. (선택값 없이 찍으면 Letter(216 × 279mm)에 94% 로 줄어든 PDF 가 나오는데 위 네 조건은 모두 통과합니다. 전개도와 카드는 실제 크기로 찍혀야 합니다.)
6. `.sheet-head`·`.sheet-body`·`.sheet-foot` 안의 모든 요소(SVG 의 도형·글 포함)의 `getBoundingClientRect()` 가 그 상자의 사각형 안(±1px)에 있다. `getClientRects()` 가 빈 요소(`display: none`, `<defs>` 안의 것)는 뺀다. (조건 2 는 아래와 오른쪽으로 넘친 것만 봅니다. 위나 왼쪽으로 나가 머리와 겹친 것, `overflow: hidden` 이나 SVG 뿌리가 잘라 내어 찍히지 않는 조각은 여기에서 잡습니다.)
7. 모든 `<img>` 가 실렸다 (`complete && naturalWidth > 0`). (그림을 복사하지 않았거나 주소가 틀린 쪽은 위 조건을 모두 통과합니다.)

조건 1·2·4·6·7 을 적힌 그대로 재는 본보기가 `tests/contract/print.test.ts` 의 `sheetProblems()` 입니다. 시험용 컬러링 페이지를 이 함수로 재고, 일부러 틀리게 만든 쪽이 걸리는지 봅니다.

PDF 의 쪽수·쪽 크기·글은 `pdfjs-dist`(`pdfjs-dist/legacy/build/pdf.mjs`)로 읽습니다. `render-pdf.mjs` 와 `checks/outputs.mjs` 가 같이 씁니다. PDF 의 글은 `getTextContent().items` 의 `str` 을 사이에 아무것도 넣지 않고 이어 붙인 뒤 빈칸과 줄바꿈을 모두 빼고, 찾는 글도 빈칸을 빼고 견줍니다. 바닥글의 주소는 줄이 바뀌는 자리에서 두 조각으로 나오고, 글자 사이의 빈칸은 글꼴과 줄바꿈에 따라 달라집니다. 조각을 빈칸으로 이으면 주소도 문구도 찾지 못합니다.

### 학습지

- 번호는 아이에게 무엇을 하라고 하는 블록에만 붙습니다: `number: true` 인 prompt 와 quiz 블록의 문항. 쪽이 바뀌어도 이어 셉니다. 번호 붙은 지시 아래의 표 이름 같은 것은 번호 없는 작은 제목으로 찍습니다. 첫 쪽 머리에 반·번호·이름 칸이 들어갑니다.
- 표의 머리 칸은 괄호 안이나 "~"와 그 뒤 낱말 사이에서 줄을 바꾸지 않습니다 (줄이 바뀌면 괄호 앞에서, 또는 "~"를 뒤 낱말에 붙인 채로 바꿉니다).
- 쓰는 칸(줄 쓰기 칸, 빈 칸, 글을 쓰는 표, 본 것·짐작한 것·까닭)이 있는 쪽은 남는 높이를 모두 쓰는 칸이 나누어 갖습니다. 쓰는 칸의 최소 크기('한 쪽의 짜임')는 줄이지 않습니다.
- 표: 가장 가까운 앞의 번호 붙은 지시문에 ○·×·✓ 가 있으면 표시를 받는 표입니다. 채우는 열을 좁게(40mm 남짓) 두고 칸 높이는 12mm 입니다. 그 밖의 표는 글을 쓰는 표로, 채우는 칸이 22mm 이고 쪽이 빠듯할 때만 12mm 까지 줄어듭니다.
- 고르기 문항의 보기 번호는 "1)" 꼴로 찍습니다.
- 풀어 놓은 보기(`example` 블록)는 "예"라는 작은 표시가 붙은 조용한 상자로 찍습니다. 글은 보통 굵기이고, 번호를 붙이지 않고, 굵은 작은 제목으로 찍지 않습니다. 칸(`parts`, 이름표와 글 2~4개)으로 적은 보기는 한 줄에 화살표로 이어 찍어 아이가 본 것 → 아는 것 → 짐작의 사슬을 봅니다.
- 그림(`figure`)을 나란히 놓은 줄은 그림이 모두 같은 높이로 그려지고 설명은 단마다 같은 높이의 줄에 섭니다. 단은 그 설명이 한 줄에 드는 폭보다 좁지 않고, 줄 폭의 절반을 넘지 않습니다. 그 안에서 모든 그림이 같은 높이가 되는 가장 큰 높이를 고릅니다 (학습지 페이지 `worksheet.astro` 의 스크립트. 스크립트가 돌지 않으면 그림의 가로세로 비로 단을 나눕니다). 줄 폭의 절반에도 한 줄로 들지 않는 설명은 절반 폭에서 고르게 접습니다. 줄의 그림이 모두 같은 출처이면 출처 표시는 줄 아래 왼쪽 끝에 한 번만 찍습니다.
- 초안의 PDF 는 문서 제목(PDF 의 Title) 앞에 "[검수 전 초안]"이 붙습니다 (`scripts/render-pdf.mjs`).
- 연표(timeline)는 `when` 을 늘 찍고 `blank` 인 칸은 `what` 자리를 비웁니다.
- 선 잇기(match)는 오른쪽만 섞어 찍습니다. 섞는 순서는 묶음 id 로 정해져 빌드마다 같아야 합니다.
- 문장 틀(sentence_frame)은 `splitFrame(frame)` 으로 나눈 조각 사이에 빈칸을 그립니다.
- 표의 빈 글(`""`)은 아이가 채우는 칸입니다.
- 풀이(`worksheetKey()`)는 인쇄하지 않습니다.

### 카드

- A4 세로 한 면에 8장까지(2열 × 4행, 폭 95mm). `.sheet-body` 의 왼쪽 위에서부터 채웁니다. 카드 높이는 한 벌에 하나(`cardHeight()`)로, 줄들이 본문 높이에서 바닥글 앞 틈(`footReserve()`)을 뺀 만큼을 나누어 가지되 85mm 를 넘지 않습니다 (8장이면 약 61mm, 6장이면 약 82mm).
- 앞면 쪽 다음에 그 뒷면 쪽이 옵니다. 뒷면 쪽은 좌우 열을 바꿔 놓습니다 (긴 변으로 뒤집어 양면 인쇄하면 앞뒤가 맞습니다).
- 앞면에는 `.cut` 테두리를 그립니다. 뒷면에는 테두리를 그리지 않고 안쪽 여백을 8mm 이상 둡니다. 양면 맞춤이 몇 mm 어긋나도 글이 잘리지 않게 하려는 것입니다.
- 뒷면의 글이 두 문장 이상이면 문장마다 새 줄에서 시작하고, 문장마다 따로 고르게 접습니다 (`text-wrap: balance`. 문장은 ". ", "? ", "! " 뒤에 글이 이어지는 자리에서 나누고 문장부호는 앞 문장에 둡니다. `backSentences()`). "옛사람의 자취가 남아 있는 / 곳. 무덤이나…"처럼 앞 문장의 끝이 다음 줄 첫머리로 밀리지 않습니다. 긴 한 문장도 마지막 줄에 짧은 낱말 하나만 남기지 않습니다.
- 단원 덱의 카드는 `label` 을 앞면 모서리에 글자로 찍습니다 (흑백에서도 구분됩니다).
- 카드는 늘 양면·세로입니다 (`printJobs()` 가 그렇게 채웁니다).
- 놀이 방법(`games`)은 카드 쪽에 찍지 않습니다. 차시 안내 페이지에 보입니다 (6절).

### 컬러링

- 한 쪽입니다. 머리에 `title`, 본문에 그림(`<Media caption={false}>`)과 그 아래 '찾아볼 것'(`look_for`)을 짧은 할 일 목록으로 찍습니다. `look_for` 가 비어 있으면 목록 없이 그림만 찍습니다.
- 도안의 가로세로 비는 정해져 있지 않습니다. 그림은 본문에서 '찾아볼 것'과 출처 표시 한 줄을 뺀 높이 안에 `object-fit: contain` 으로 줄입니다. 폭에만 맞추면 세로로 긴 도안(190 × 249)에서 출처 표시가 본문 밖으로 밀려나 조건 2 에 걸립니다.
- 본보기는 `tests/contract/fixtures/site` 의 컬러링 페이지입니다 (세로로 긴 도안과 '찾아볼 것' 한 줄을 싣고 `tests/contract/print.test.ts` 가 재어 봅니다).

### 페이퍼크래프트 (전개도 모듈)

- 전개도 모듈은 "한 차시에만 맞는 코드를 쓰지 않는다"의 예외입니다. `generators/papercraft/modules/<module>.ts` 는 그 입체물에만 맞는 코드여도 됩니다.
- 기본 내보내기는 `{ sheets(texts: string[]): { title: string; sub: string; svg: string }[]; preview?(): string }` 입니다. svg 는 1단위 = 1mm 로 190 × 249mm 안에 그립니다 (실제 크기 100% 로 인쇄). `preview()` 는 넣지 않아도 되는 내보내기로, 마지막 쪽 '만드는 법'에 싣는 SVG 한 장을 줍니다. 그림 여러 개와 그 그림의 이름(캡션)을 함께 담을 수 있고, 페이지는 따로 캡션을 달지 않습니다. 없으면 그림 없이 만듭니다.
- 전개도의 글(SVG 안의 `font-family`)은 `Pretendard` 를 먼저 적습니다. 인쇄 페이지는 고정 굵기 Pretendard 로 찍고(아래 '글꼴'), 가변 글꼴(`Pretendard Variable`)이 먼저면 그 글만 PDF 에 Type 3 글꼴로 들어갑니다.
- SVG 뿌리는 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 249" width="190mm" height="249mm" style="display:block">` 입니다. `display:block` 이 없으면 글줄 아래 틈 때문에 `.sheet-body` 가 2mm 넘쳐 빌드가 멈춥니다.
- 전개도의 선은 모듈이 SVG 안에 직접 그립니다. 굵기는 mm 가 아니라 SVG 단위로 적습니다 (SVG 안에서 `0.5mm` 는 1.9mm 로 그려집니다): 자르는 선 `stroke-width="0.5"` 실선, 접는 선 `stroke-width="0.3"` 과 `stroke-dasharray`, 풀칠 자리는 모듈의 `<pattern>` 빗금. `print.css` 의 `.cut`·`.fold` 는 HTML 상자에만 씁니다.
- 페이퍼크래프트는 늘 A4 세로·단면입니다 (형식이 막습니다).
- 모듈이 주는 `title`·`sub` 는 `<Sheet>` 의 머리(22mm)에 들어가야 합니다. 넘치면 `render-pdf` 가 멈춥니다 (조건 2). 긴 안내는 마지막 쪽의 '만드는 법'에 둡니다.
- 인쇄 쪽수는 `sheets().length + 1` 입니다. 마지막 쪽은 명세의 `steps`·`try_it`·`reflect` 로 만드는 '만드는 법'입니다. 이 값이 명세의 `pages` 와 다르거나 모듈 파일이 없으면 `npm run check` 가 실패합니다.
- 모듈 안에 적는 글은 조각 이름, 조립 표시, 마지막 쪽 그림의 짧은 이름표와 캡션(예: '여러 짐작 가운데 하나')뿐입니다. 아이가 읽는 문장(예: 차례 카드)은 명세의 `texts` 에서 받습니다. 모듈은 `texts` 를 SVG 에 넣을 때 `xmlText()` 를 거칩니다 (명세의 글이 `set:html` 로 페이지에 들어가는 단 하나의 길입니다).
- 모듈 파일(`papercraftModuleFile(lesson)`)은 그 차시의 내용이라 명세의 지문에 들어갑니다 (12절). 검수한 뒤에 도안을 고치면 다시 검수합니다. 모듈이 가져다 쓰는 다른 파일(`generators/papercraft/net.ts` 등)은 지문에 들지 않으므로, 그 차시에만 맞는 그림과 글은 모듈 파일 안에 둡니다.
- 조각 위에 찍는 맞춤 글자(같은 글자끼리 붙이는 자리의 표시)는 `--rule` 회색(#9a9a9a)으로 찍습니다.
- 인쇄된 조각은 모두 이름으로 불립니다: '만드는 법'의 단계나 해 보기(`try_it`)에서, 또는 그 조각의 전개도 위에 굵은 글자로. 마지막 쪽의 그림은 인쇄된 조각과 꼭 같은 꼴로 그립니다.
- 차례를 몸으로 해 보는 모형은 조각을 바닥판에 붙이지 않습니다. 바닥판에는 조각이 설 자리만 찍고, 모둠이 카드의 차례대로 조각을 옮기고 세우고 치울 수 있게 합니다. 고인돌 모형이 그 본보기입니다.
  - 조각: 덮개돌 1, 받침돌 2, 바닥판 1, 흙 비탈 1(한 조각으로 서는 쐐기. 윗면이 비탈이고 옆이 막혀 있으며 높은 쪽이 받침돌 높이와 같다. 밑은 열려 있어도 된다), 차례 카드 4. 조각 두 쪽과 '만드는 법' 한 쪽, 모두 3쪽입니다. 첫 쪽의 제목은 "종이 고인돌 · 덮개돌과 받침돌"입니다.
  - 비탈 위에 까는 굴림대는 조각으로 만들지 않고, 단계 그림과 마지막 쪽 그림에도 그리지 않습니다. 공개 출처가 굴림대를 말하는 것은 덮개돌을 땅 위로 옮길 때뿐이고, 고창 고인돌 박물관이 밝힌 차례(받침돌을 세우고, 흙을 비탈로 쌓고, 덮개돌을 비탈 위로 끌어 올리고, 흙을 걷어 낸다)에는 비탈 위의 굴림대가 없습니다.
  - 차례 카드 네 장의 글은 수업 화면의 단계 장(고인돌을 세우는 차례)의 네 단계 글과 글자까지 같습니다. 둘 다 명세에 있으므로 내용 담당이 맞춥니다.
  - 마지막 쪽에는 덮개돌을 비탈 위로 끌어 올리는 그림(여러 짐작 가운데 하나라고 적는다)과 비탈을 치운 완성 그림을 싣습니다.
  - 굴림대로 덮개돌을 옮기는 것은 교사 메모에서만 다룹니다 (연필 세 자루로 해 볼 수 있다). 모둠이 비탈 위에 굴림대를 깔자고 하면 '카드에 없는 방법'으로 받아 줍니다. 자료가 그렇게 말하지는 않습니다.

## 8. 수업 화면과 PPTX

- 무대는 16:9(1920 × 1080 기준), PPTX 는 13.333 × 7.5in 입니다. 명세의 슬라이드 한 장이 화면 한 장이고 PPTX 한 장입니다. 번호가 `flow.slides` 와 같아야 합니다.
- `/<id>/slides/#4` 는 4번 장에서 시작합니다.
- 1번 장은 늘 표지(`layout: title`)입니다 (형식이 막습니다). AI 사용 표시나 초안 표시(`footerNotice(lesson)`)는 표지를 포함한 모든 장의 바닥글 줄에 있습니다 (아래). 화면과 PPTX 가 같습니다. 두 차시 묶음이 둘째 차시 앞에 둔 표지에는 찍지 않아도 됩니다.
- 바닥글 줄과 장 번호 (R55): 모든 장의 왼쪽 아래에 `stageFooter(lesson)`("nalssam의 초등사회콘텐츠 클라우드  |  5학년 2학기 1단원 1차시  |  " 다음에 `footerNotice(lesson)`)을 장 번호와 같은 크기로, 오른쪽 아래에 장 번호 "NN / 전체"(두 자리로 채운다: "05 / 22". 두 차시 묶음은 차시마다 세어 "3차시 01 / 04")를 찍습니다. 장 번호의 글은 `src/components/slides/counter.ts` 의 `slideCounter()` 가 화면과 PPTX 에 같이 줍니다. 표지에는 장 번호가 없습니다 (두 차시 묶음의 둘째 표지도). PPTX 의 장 번호는 Pretendard Medium 입니다.
- 단계 머리말 (R55): 제 머리말이 없는 장(그림, 항목, 견주기, 단계, 읽기 자료, 활동)은 제목 위에 그 장을 쓰는 흐름 단계의 머리말을 찍습니다: `slidePhase(lesson, no).kicker`("01 도입", "02 전개"). 번호는 그 단계가 제 차시의 흐름에서 몇 번째인가이고(두 차시 묶음은 차시마다 1부터), 이름은 흐름의 `phase` 입니다. 청록 굵게, 1920 무대에서 28px 이상. 제 머리말이 있는 장(낱말, 퀴즈, 질문의 `kicker`, 마무리)과 표지는 제 것을 그대로 씁니다. `slidePhase()` 가 undefined 인 장(어느 단계의 `slides` 에도 들지 않는 장)은 머리말 없이 둡니다. PPTX 도 같습니다.
- 읽기 자료 장(`passage`)에는 문단 4개, 모두 300자까지 들어옵니다 (형식이 막습니다). 이 길이까지는 본문 44px 로 한 장에 넘치지 않게 그립니다.
- 본문 44px, 제목 72px. 그 밖의 글(그림 출처·장 번호·바닥글 줄은 빼고)도, 그림 안의 글까지 1920 × 1080 무대에서 28px 보다 작게 그리지 않습니다. 바닥글 줄(R55)은 장 번호와 같은 크기(24px)입니다. 글자 크기는 `src/components/slides/copy.ts` 의 `STAGE_TYPE` 에 둡니다. 색은 tokens.css 의 것만 씁니다.
- 그림이 셋이나 넷인 단계 장(`steps`)은 제목 아래 자리를 모두 씁니다: 셋은 폭 전체에 한 줄로, 넷은 2 × 2 로 놓습니다. 2 × 2 의 칸마다 위에 머리 한 줄(단계 번호 표와 단계 글, 1920 무대에서 40px 이상)이 있고 그 아래가 그림 상자입니다. 머리는 들어가면 한 줄, 길어도 두 줄까지입니다. 네 칸의 단계 번호 표는 모두 가장 긴 표의 폭입니다. 그림은 머리 아래 남은 높이와 칸의 폭 안에 contain 으로 가운데 놓입니다. 그림 상자는 그려진 그림에 꼭 맞고(상자의 테두리는 그림의 것입니다) 1920 무대에서 폭 500px 이상이며, 칸의 폭 전체를 채우지 않아도 됩니다. 단계 글을 그림 옆에 두지 않습니다. 우리가 그리는 단계 그림은 이 상자에 맞게 가로로 넓게(2.6:1 남짓, viewBox 780 × 300) 그립니다. PPTX 도 같은 짜임입니다.
- 글과 그림 한 장을 함께 보여 주는 장(그림이 있는 points·question 장과, 함께 보는 그림이 있는 compare 장)은 제목 아래를 두 단으로 나눕니다. term·activity 장에는 그림이 없습니다. 왼쪽이 글, 오른쪽이 그림입니다. 그림 단은 장 폭의 42% 이상이고 그림은 그 단에 들어가는 만큼 크게 그립니다. 글 덩어리와 그림은 세로 가운데를 맞추고, 글이 길면 위 끝을 맞춥니다. 글은 위에 있고 그림은 아래 구석에 떠 있는 꼴을 만들지 않습니다. 그림이 있는 장은 빈 자리가 장 넓이의 3분의 1 남짓을 넘지 않습니다. 이것을 재는 시험은 40% 까지 받고, 가로세로 비가 2:1 이나 1:2 보다 치우친 그림은 건너뛰어도 됩니다 (그런 그림은 단을 아무리 키워도 빈 자리가 남습니다). PPTX 도 같은 짜임입니다.
- 그림이 없는 points·activity 장은 목록을 제목 아래 48px 내려 위에 맞춥니다 (세로 가운데에 두지 않습니다). 장을 넘겨도 본문이 같은 높이에서 시작합니다. 세로 가운데는 title·question·term·closing 장의 것입니다. PPTX 도 같습니다.
- 견주기 장(`compare`)의 그림은 둘 가운데 한 가지입니다 (형식이 섞지 못하게 막습니다).
  - 두 쪽이 함께 보는 그림 한 장(`media`): 제목 아래를 위의 두 단으로 나눕니다. 왼쪽에 이름표 붙은 상자 둘을 위아래로 쌓고, 오른쪽에 그림을 둡니다. 이때 쪽마다 항목은 2개까지입니다 (형식이 막습니다). 두 상자가 그림 옆 한 단에 쌓이므로 셋 이상은 36px 로도 장 밖으로 넘칩니다.
  - 쪽마다 그림 하나(`left.media`, `right.media`): 두 그림은 높이가 같은 그림 상자에 놓입니다. 그래서 두 쪽의 출처 표시와 첫 항목이 같은 높이에 섭니다.
  - 어느 쪽이든 PPTX 도 같은 짜임입니다.
- 사진(`kind: photo`)에는 수업 화면과 PPTX 에서도 가는 테두리를 두릅니다 (화면은 `Media.astro` 가 두릅니다. 6절). PPTX 는 같은 색(`--line`)의 가는 선을 그림에 둘러 넣습니다.
- 표시와 색은 한 체계로 씁니다.
  - 퀴즈 장에서 드러난 정답은 번호 동그라미를 그대로 두고, 확인 퀴즈와 같은 청록색 "정답" 표를 붙입니다. 산호색으로 정답을 표시하지 않습니다. 산호색은 "이제 여러분 차례"나 "다시 해 봅시다"를 뜻합니다 (14절의 한 화면에 한 군데).
  - 목록의 머리표: 항목(points)에는 번호를 붙입니다. 교사가 "2번 문장"이라고 부를 수 있게 하려는 것입니다. 상자 안의 목록(견주기의 항목 등)은 점, 마무리 장은 확인 표시(✓ 모양의 선 그림)입니다.
- 그림이 있는 견주기 장과 그림이 있는 단계 장의 글은 `STAGE_FIT`(`src/components/slides/copy.ts`)의 차례대로 줄여 맞출 수 있습니다. 어느 단계에서도 28px 보다 작아지지 않습니다.
- 교사 메모는 `slideNotes(lesson, no)` 입니다 (발표 화면의 메모와 PPTX 메모란이 같은 글).
- 메모 창은 장을 가리지 않습니다. 메모 창을 열면 장 전체가 메모 창 위의 자리에 들어가게 줄여 그립니다. 장의 어느 부분도 메모 창 뒤로 숨지 않습니다. 메모 창의 높이는 덱 전체에서 하나입니다 (화면 높이로만 정하고, 메모가 길면 창 안에서 넘겨 읽습니다). 장마다 높이를 바꾸면 교사가 넘길 때마다 장의 크기가 바뀝니다. (메모와 다음 장을 보여 주는 발표자 창은 `docs/ROADMAP.md` 에 있습니다.)
- QR 창: 이 차시에 준비된 학생 페이지(확인 퀴즈, 웹 활동)가 있으면 조작 막대에 "QR" 단추(키 q)를 둡니다. 누르면 그 페이지들의 QR 코드(`Qr.astro`)와 주소를 글자로 보여 주는 창이 장 위에 열립니다. 차시 안내 페이지의 다른 것은 싣지 않습니다. Esc, q, 창 바깥 누르기로 닫힙니다. 준비된 학생 페이지가 없는 차시에는 단추가 없습니다. PPTX 에는 아직 QR 을 넣지 않습니다 (`docs/ROADMAP.md`).
- 퀴즈 장의 답(`answerText()`)은 화면에서는 다음 키에 드러나고 PPTX 에서는 메모란에 적습니다. OX 문항의 표시는 화면도 메모도 ○·× 입니다 (`MARK`. 15절).
- PPTX 는 Python(`python-pptx`)으로 만듭니다. `generators/pptx/build.mjs` 가 검증을 마친 명세를 `.cache/lessons.json` 으로 내보내고 Python 은 그 파일만 읽습니다 (`.cache/` 는 `cacheDir()` 로 얻습니다. 10절).
  - `.cache/lessons.json` 의 모양은 슬라이드 담당이 정하고 `generators/pptx/README.md` 에 적습니다. 다른 담당은 읽지 않습니다.
  - 들어가는 차시는 `visibleLessons()` 뿐입니다.
  - Python 쪽에 문구나 색을 다시 적지 않습니다. 화면에 찍히는 글은 모두 이 파일에 실어 보냅니다: 차시표 값(`bundleOf()`), 낱말 풀이, 교사 메모, 출처 표시(`creditShort()`·`creditList()`), 바닥글(`sheetFooter()`. 안내 페이지의 온전한 주소가 들어 있습니다), 모든 장의 바닥글 줄(`stageFooter()`)과 장 번호(`slideCounter()`), 단계 머리말(`slidePhase()`), 이름표, tokens.css 의 색, 그림 파일의 절대 경로(`mediaFile()`).
  - python-pptx 는 SVG 를 넣지 못합니다. SVG 그림은 Chromium 으로 폭 1600px PNG 로 바꿔 `.cache/media/<id>/` 에 두고 넣습니다.
  - PPTX 에 넣는 그림도 자르거나 늘이지 않습니다 (6절. CC BY-SA 그림은 고치지 않고 그대로 씁니다). 원본의 가로세로 비율을 지켜 틀 안에 맞춥니다. `add_picture()` 에 폭과 높이를 함께 주면 그림이 늘어나므로 한쪽만 주거나 비율을 계산해 줍니다. 자르기 값(`crop_left` 등)은 쓰지 않습니다. python-pptx 는 늘이거나 잘라도 아무 말 없이 저장하므로 `checks/outputs.mjs` 가 봅니다 (11절).
  - Python 은 환경 변수 `PYTHON` 이 있으면 그것을, 없으면 `python3` 을 씁니다. 필요한 패키지는 `generators/pptx/requirements.txt` 에 적습니다.
  - 글 조각(run)마다 언어를 `lang="ko-KR"`(`altLang="en-US"`)로 적습니다. 적지 않으면 PowerPoint 가 영어 맞춤법 검사로 한글 글마다 빨간 밑줄을 긋습니다.
  - PPTX 는 LibreOffice 로 그려 보았을 뿐입니다. PowerPoint 와 한컴 한쇼에서 여는 점검은 날쌤이 실제 컴퓨터에서 합니다 (`docs/ROADMAP.md`).
- PPTX 마지막 장에는 `creditList(shownMedia(lesson, "slides"))` 와 `sheetFooter(lesson)` 을 넣습니다. 수업 중에 띄우는 장이므로 그림 제목은 넣지 않습니다 (제목은 안내 페이지의 그림 출처에 있습니다). 같은 출처는 한 줄로 묶습니다.
  - 출처가 한 장에 다 들어가지 않으면 앞 장을 채운 뒤에 새 장을 엽니다. 앞 장에 들어갈 수 있는 한 줄만 따로 남은 장을 만들지 않습니다.

## 9. 학생 페이지 (확인 퀴즈, 웹 활동)

- 쿠키·localStorage·sessionStorage·IndexedDB 를 쓰지 않고, 이름·번호를 묻는 칸을 두지 않고, 아무것도 보내지 않습니다. 내 자료함의 `collect.ts`(6절)는 사이트 페이지에서만 싣고 학생 페이지에는 싣지 않습니다. 사이트 밖으로 나가는 링크(깃허브, 제보)를 넣지 않습니다. 하나만 예외입니다: 활동 아래 '그림 출처'의 이용 조건 안내 링크(creativecommons.org, kogl.or.kr. 새 탭으로 엽니다).
- 점수를 보여 줄지는 `scored(lesson)` 으로만 정합니다 (5절).
- 단답 채점(`normalizeShort()`, 활동): 앞뒤 공백을 떼고 안쪽 공백을 모두 없앱니다. 끝에 붙은 `.`·`!`·`?` 를 뗍니다. 그다음 흔한 끝말을 하나 뗍니다: "입니다", "이에요", "예요", "이요", "요", "이야", "야", "이다" (긴 것부터 봅니다). 떼고 나면 아무것도 남지 않는 경우에는 떼지 않습니다. 아이의 답은 그대로이거나 끝말 하나를 뗀 모양 가운데 하나가 `answer`·`accept` 와 같으면 맞습니다 (`markShort()`). `answer`·`accept` 쪽은 공백과 끝 문장부호만 고르고 끝말은 떼지 않습니다. 정답이 끝말처럼 끝나는 낱말('가야')일 때 '가'가 맞는 답이 되거나 '가야예요'가 틀린 답이 되지 않게 하려는 것입니다. 그래서 명세의 `accept` 에 "고인돌이요"·"고인돌입니다" 같은 끝말만 다른 답을 적지 않습니다.
- 확인 퀴즈는 문항마다 한 번 답합니다. 답하면 맞았는지와 풀이를 보여 주고 다음 문항으로 갑니다. 다시 풀려면 처음부터 다시 풉니다.
- 지도에 놓기(place)의 `x`·`y` 는 그림의 왼쪽 위에서 잰 백분율입니다.
- OX 릴레이 같은 활동은 따로 만들지 않습니다. OX 는 확인 퀴즈입니다.
- OX 문항의 단추와 풀이에 찍는 표시는 ○·× 이고(`MARK`), 단추의 이름(`aria-label`)은 `MARK_LABEL` 의 말입니다 (15절).
- 카드에 실린 그림은 폭 390px 휴대폰에서 짧은 변이 96px 이상입니다. 출처 표시는 카드마다 찍지 않고 활동 아래에 한 번 모아 찍습니다 (만든 이, 이용 조건과 그 안내 페이지 링크. 6절).
- 휴대폰에서 카드를 고른 뒤에는 어디에 놓을지가 화면에 보여야 합니다. 고른 카드를 알려 주는 띠가 카드를 가리지 않습니다.

## 10. 빌드

```
npm run dev        # astro dev. 늘 초안을 보여 주고, 그림은 content/ 에서 바로 내준다 (복사하지 않는다). 명세를 더하거나 지워도 다시 켜지 않는다.
npm run check      # 11절. Python 과 Chromium 을 부르지 않는다.
npm test           # node --test. tests/**/*.test.ts
npm run typecheck  # astro check && tsc --noEmit
npm run sign       # 12절
npm run factsheet  # 12절
npm run new -- <id>  # scripts/new.mjs (저장소). 새 묶음의 명세를 본보기에서 만든다 (아래)
npm run build      # scripts/build.mjs (저장소). 아래를 차례로 돌리고 하나라도 실패하면 멈춘다
  1. astro build                                  → dist/
  2. node scripts/sync-media.mjs      (사이트)   dist/media/ 를 비운 뒤 visibleLessons() 의 media 에 적힌 파일만 → dist/media/<id>/
  3. node scripts/render-pdf.mjs      (인쇄물)   printJobs() 의 인쇄 페이지 → dist/files/<id>/<kind>.pdf, 미리보기 그림 → dist/files/<id>/thumbs/<kind>.jpg (저장소)
  4. node generators/pptx/build.mjs   (슬라이드) → dist/files/<id>/slides.pptx
  5. node checks/outputs.mjs          (저장소)   11절
  6. pagefind --site dist             (저장소)
npm run build:site # astro build 만 (1단계). 그림·PDF·PPTX 와 산출물 검사가 없으므로 배포에는 쓰지 않는다
```

- **미리보기 그림 (R52).** 3단계의 `render-pdf.mjs` 가 PDF 를 찍은 뒤 `scripts/thumbs.mjs` 를 불러, PDF 와 같은 로컬 서버와 Chromium 으로 찍습니다. `visibleLessons()` 의 차시마다, 페이지가 있는 자료(`ASSET_ROUTE` 의 일곱: 수업 화면, 학습지, 확인 퀴즈, 페이퍼크래프트, 컬러링 도안, 카드, 웹 활동) 가운데 준비된 것 하나에 한 장, 자리는 `thumbFile(id, kind)` 입니다.
  - 인쇄물(학습지, 카드, 컬러링 도안, 페이퍼크래프트): 인쇄 페이지 첫 쪽(`.sheet`)의 윗부분을 쪽 폭 그대로 4:3 으로, 480 × 360. 가로 쪽은 쪽 전체가 4:3 보다 납작해서 쪽 전체를 480 × 339 로 찍습니다.
  - 수업 화면: 1번 장 전체를 1920 × 1080 무대에서, 480 × 270.
  - 확인 퀴즈, 웹 활동: 폭 360px 휴대폰 화면의 위쪽 480px 을, 270 × 360.
  - JPEG, 폭 480px 이하, 60KB 이하. 찍기 전에 `document.fonts.ready` 와 그림을 기다립니다. 인쇄물은 화면 모양(`emulateMedia` 없이)의 종이 미리보기를 찍되 화면에만 보이는 안내(`.no-print`)는 숨깁니다.
  - 남의 그림은 가립니다: `img[data-licence]`(Media.astro 가 이용 조건이 original 이 아닌 그림에 붙입니다)를 `visibility: hidden` 으로 두고, 그 자리에 '그림 자리'(종이색 `--paper` 바탕, 1px `--line` 테두리, 가운데 작은 그림 표시)를 얹고, 같은 그림의 출처 표시(`.media-credit`)도 가려 찍습니다 (`coverLicensed()`). 줄인 그림에서는 곁의 출처 표시를 읽을 수 없고, 쪽의 윗부분만 찍으면 사진이 잘릴 수 있어서입니다 (5·6절). 빈 상자 아래 출처 한 줄만 남기면 카드에서 그림이 깨진 것처럼 읽혀 그림 자리를 둡니다.
  - 캐시는 PDF 와 같습니다: 그 페이지의 HTML 과 부르는 파일들의 sha256 이 같으면 `.cache/files/<id>/thumbs/<kind>.jpg` 를 복사만 합니다. `--kind` 로 한 종류만 찍을 때는 그 종류의 미리보기만 다시 찍습니다. `--kind` 는 PDF 가 없는 자료(`slides`, `quiz`, `web_activity`)도 받고, 그때는 미리보기만 찍습니다.
  - `astro dev` 와 1단계만 돌린 dist 에는 미리보기 그림이 없습니다. 자료 카드는 그때 자료 그림(TypeIcon)을 보여 줍니다.
- **새 묶음 (R56).** `npm run new -- <id>` 는 `docs/template/lesson.yaml` 을 `content/<id>/lesson.yaml` 로 복사하고(본보기가 가리키는 `media/` 도 함께) `id` 를 그 묶음 id 로, `status` 를 `draft` 로 적습니다. 맨 위에 차시표의 값(학기, 단원 번호와 단원명, 차시 번호, 교과서 쪽수)을 주석 한 줄로 적습니다. 차시 번호와 쪽수는 차시표에만 있는 값이라 명세의 칸으로 적지 않습니다 (1절). 그 밖의 내용은 본보기 그대로이고 아무것도 지어내지 않습니다. 차시표에 없는 id, 이미 명세가 있는 묶음, `CONTENT_DIR` 밖으로 나가는 id 이면 아무것도 쓰지 않고 0 이 아닌 값으로 끝납니다. 마치면 할 일을 찍습니다: 명세 채우기, `npm run check`, `npm run factsheet -- <id>` 로 사실 대조, 검수 기록 넷(fact, originality, voice, print), 사실마다 두 확인자, `content/updates.yaml` 에 소식 한 줄(공개할 때 그 소식의 `date` 를 공개한 날로 고친다), 날쌤 승인. `CONTENT_DIR` 을 따릅니다 (시험은 `.cache/tests/` 의 복사본에 만듭니다).
- 스크립트는 모두 저장소 뿌리에서 `node <경로>` 로 따로 돌릴 수 있고, 실패하면 0 이 아닌 값으로 끝납니다.
- 환경 변수: `SITE_URL`(배포 주소. 하위 경로 없이 `https://nalssam.github.io` 처럼), `SITE_BASE`(하위 경로), `SHOW_DRAFTS=1`(초안도 싣는 미리 보기), `CHROMIUM_PATH`, `PYTHON`, `CONTENT_DIR`(시험용 명세 폴더), `DIST_DIR`(빌드한 사이트의 자리. 아래). 빈 값으로 준 `SITE_URL`·`SITE_BASE`·`DIST_DIR` 은 주지 않은 것으로 봅니다.
- **dist 의 자리.** 2~5단계의 스크립트(`sync-media`, `render-pdf`, `generators/pptx/build.mjs`, `checks/outputs.mjs`)는 dist 의 자리를 `distDir()`(`#lib/content.ts`)로만 얻습니다. 기본은 `dist/` 이고, `--out <폴더>` 인자나 환경 변수 `DIST_DIR` 로 바꿉니다 (둘 다 있으면 인자. 저장소 뿌리 기준). 네 스크립트가 같은 인자를 같은 뜻으로 받습니다. `scripts/build.mjs` 도 `--out` 을 받아 1단계(`astro build --outDir`)와 6단계(`pagefind --site`)까지 같은 폴더로 넘깁니다. 이 문서의 `dist/` 는 모두 이 폴더입니다.
- **캐시의 자리.** `.cache/files/`, `.cache/lessons.json`, `.cache/media/` 의 `.cache/` 는 `cacheDir()` 로 얻습니다. 기본은 `.cache/` 이고, dist 가 아닌 폴더를 가리킨 실행에서는 그 옆의 `<폴더>.cache/` 입니다. 시험용 명세의 묶음 id 는 실제 차시의 것과 같아서(`5-2/1/01`), 한 캐시를 같이 쓰면 시험이 찍은 PDF 가 실제 빌드에 복사되거나 같이 도는 시험이 서로의 `lessons.json` 을 덮어씁니다.
- 그림은 1단계가 끝난 뒤에 dist 로 바로 복사합니다. `public/` 은 쓰지 않습니다. `sync-media.mjs` 는 `dist/media/` 를 비우고 다시 채우며, 폴더에 있어도 명세에 없는 파일은 복사하지 않습니다. 초안의 그림이 어딘가에 남아 다음 공개 빌드에 섞이는 일이 없고, 같이 도는 시험들이 한 폴더를 두고 다투지 않습니다. `astro dev` 에서는 `astro.config.mjs` 가 `/media/<id>/<파일>` 을 `content/<id>/media/` 에서 바로 내줍니다.
- PDF 는 반드시 로컬 서버(`http://127.0.0.1:<포트>`)에서 엽니다. `file://` 로 열면 글꼴이 실리지 않습니다. 찍기 전에 `document.fonts.ready` 와 모든 `<img>` 의 `decode()` 를 기다리고, `page.pdf({ preferCSSPageSize: true, printBackground: true })` 로 찍습니다 (7절 조건 5). `SITE_BASE` 가 있어도 astro 는 `dist/5-2/…` 에 쓰므로 로컬 서버가 하위 경로를 떼고 dist 에 대응시킵니다.
- 다시 만들지 않아도 되는 파일은 `.cache/files/` 에서 복사만 합니다. 입력은 손으로 적은 목록이 아니라 실제로 찍는 것에서 얻습니다 (목록은 빠뜨릴 수 있습니다. 단원 덱은 앞 묶음의 카드에, 바닥글은 `SITE_URL` 에 기댑니다).
  - `render-pdf.mjs` 는 인쇄 페이지마다 dist 의 그 HTML 파일, 그 HTML 이 부르는 사이트 안 파일(`_astro/` 의 CSS·글꼴·스크립트, `/media/…`), `scripts/render-pdf.mjs` 자신, `package-lock.json` 의 sha256 을 `.cache/files/<id>/<kind>.pdf.sha256` 에 적고, 같으면 `.cache/files/<id>/<kind>.pdf` 를 `dist/files/` 로 복사만 합니다.
  - `generators/pptx` 는 `.cache/lessons.json` 에서 그 묶음의 항목, 거기 적힌 그림 파일, `generators/pptx/` 폴더의 sha256 을 씁니다.
  - `--only <id>` 로 한 묶음만 만들 수 있습니다. `render-pdf.mjs` 는 `--kind <worksheet·cards·coloring·papercraft·slides·quiz·web_activity>` 로 한 종류만(PDF 가 없는 셋은 미리보기만), `--force` 로 캐시를 쓰지 않고 모두 다시 찍습니다.
- `astro dev` 에서는 명세나 차시표(`.yaml`)를 더하거나 고치거나 지우면 주소 목록(`getStaticPaths()`)을 다시 만듭니다 (`astro.config.mjs`). 새 묶음과 방금 ready 로 바꾼 자료의 주소가 다시 켜지 않아도 열립니다.
- 에이전트가 켠 `astro dev`(환경 변수 `AI_AGENT` 가 있을 때)는 곧바로 끝난 것처럼 돌아오고 서버는 배경에서 계속 돕니다 (Astro 7). 같은 폴더에서 다시 켜면 환경 변수(`CONTENT_DIR`, `SHOW_DRAFTS`, `SITE_BASE`)와 포트가 달라도 새로 켜지 않고 먼저 켠 서버를 그대로 씁니다. 다 쓰면 `npx astro dev stop` 으로 끕니다 (`npx astro dev status` 로 켜져 있는지 봅니다). 시험은 dev 서버를 띄우지 않고 `astro build --outDir .cache/tests/…` 로 만든 것을 봅니다 (`tests/contract/frame.test.ts` 처럼).
- 초안이 저절로 열리는 것은 `astro dev` 명령뿐입니다. `astro build` 는 `SHOW_DRAFTS=1` 을 줄 때만 초안을 싣습니다 (`--mode dev` 같은 인자로는 열리지 않습니다).
- 만들어진 것은 저장소에 넣지 않습니다 (`dist/`, `.cache/`, `.astro/`). 1MB 를 넘는 파일을 저장소에 넣지 않습니다.
- 내용만 고치는 사람은 `npm ci`, `npm run check`, `npm run dev` 만으로 일할 수 있어야 합니다. PDF 와 PPTX 는 CI 가 만듭니다.

## 11. 검사 (저장소)

`npm run check` (`checks/run.mjs`) 가 보는 것. 하나라도 걸리면 실패합니다 ("알림"이라고 적은 것만 빼고).

| 검사 | 내용 |
|---|---|
| 형식 | 차시표와 모든 명세를 `loadLesson()` 으로 읽는다. `orphanLessons()` 가 비어 있다 (차시표에 없는 폴더의 명세, 그리고 `lesson.yml`·`Lesson.yaml`·`lesson.yaml.txt` 처럼 이름을 잘못 적어 읽히지 않는 명세 파일). 업데이트 소식(`content/updates.yaml`)을 `loadUpdates()` 로 읽는다 (5절). (`npm run typecheck` 는 여기에 들지 않는다. CI 가 따로 한 단계로 돌린다.) |
| 사실 | `factIssues(lesson)` 이 비어 있다. 아이가 읽는 글의 세 자리 이상 숫자, "N년"·"N세기", "70만"·"5천" 같은 큰 수, "3·1" 같은 날짜 이름, "8월 15일" 같은 날짜는 그 글이 가리킨 사실의 문장에 있어야 한다 (거짓으로 낸 OX 문장과 고르기의 틀린 보기는 뺀다). 연표의 `when` 도 본다. 어디에서도 가리키지 않는 사실이 없다. 사실의 문장은 한 문장이다. |
| 출처 | `sourceIssues(lesson)` 이 비어 있다. 출처의 이름, 그림의 소장처, 읽기 자료와 짧은 글의 `source` 에 "교과서"·"지도서"라는 말이 없다. 거기와 출처·그림의 제목에 교과서·수업 자료 회사 이름이 없다 (제목에 "교과서"라는 낱말이 든 공공 기관 자료는 쓸 수 있다). 주소가 그런 회사의 것이거나 누구나 고칠 수 있거나(위키백과, 나무위키) 개인이 올리는 곳(블로그, 지식인, 영상)이 아니다. 막는 이름과 곳의 목록은 `lib/checks.ts` 에 있다 (`DENIED_NAME`, `DENIED_PUBLISHER`, `DENIED_HOST`). 위키미디어 공용(commons.wikimedia.org)은 그림의 출처로 쓸 수 있다. `media` 에 적어 두고 어디에서도 쓰지 않는 그림이 없다 (쓰지 않아도 `/media/` 로 복사되어 공개되는데 출처 표시는 쓰는 자리에만 찍힌다). |
| 낱말 | 차시표 순서로 이 차시보다 뒤에 오는 차시의 `terms.new[].term` 이 이 차시의 `childStrings()` 에 나오면 **알림** (이 판에서는 실패가 아니다). 따로 낱말 목록을 두지 않는다. 글자만 같은 다른 말("가야 합니다"의 가야)은 `checks/terms-allow.txt` 에 적어 뺀다 (한 줄에 하나, 그 낱말이 든 짧은 구절. `#` 뒤는 주석). |
| 표현 | 15절의 금지 표현, 다른 회사의 서비스 이름 (업데이트 소식의 `title`·`body` 도 본다). 교실에서 해 본 듯한 말(`teacherStrings()` 의 "가장 많", "대부분", "항상", "N분 안에")과, `scored()` 가 false 인 차시의 퀴즈·카드·웹 활동에 나오는 피해 낱말(사망, 희생, 학살, 전사, 고문, 끌려 …)은 알림. `childStrings()`·`teacherStrings()` 의 곧은 따옴표(' ")도 알림이고 굽은 따옴표로 고친 글을 함께 찍는다 (출처 칸, 주소, `code` 로 묶은 글, 사실의 근거 구절은 뺀다). |
| 그림 | SVG 에 `<script`, `on…=` 속성, `<foreignObject`, 바깥 주소, `javascript:` 주소, 링크 주소(`href`)를 바꿔 쓰는 `<set>`·`<animate>`, 사진(png·jpeg·gif·webp)이 아닌 `data:` 주소가 없다. 파일이 1MB 를 넘지 않는다. 출처의 제목(`credit.title`)이 그림 파일 확장자로 끝나면(파일 이름을 그대로 적은 것) 실패, 제목 안에 파일 이름이 섞여 있으면 알림. (바로 가기(심볼릭 링크)인 그림 파일은 로더가 받지 않는다. 묶음 밖의 파일이 사이트에 실린다.) |
| 전개도 | `assets.papercraft.module` 의 파일이 있고 `sheets().length + 1` 이 명세의 `pages` 와 같다. `sheets(texts.map(() => '<i>&'))`(명세의 `texts` 와 같은 개수로 부른다. 모듈은 제 차시의 `texts` 개수에 맞춰 쓴 코드다)의 결과에 `<i>` 가 그대로 나오면 실패 (`xmlText()` 를 거치지 않은 것이다). `texts` 가 비어 있으면 이 검사는 건너뛴다. SVG 뿌리가 7절의 꼴이다. |
| 검수 기록 | 12·13절. 초안에 지금 내용의 베끼기 검사 기록이 없으면(`reviewState(id).originality` 가 pass 가 아니면) 알림, `--push` 를 주면 실패. 차시표의 베끼기 검사 기록(`registryOriginality()`)도 같다. `--push` 는 두 곳에서만 붙인다: 기본 가지의 CI(배포 워크플로 포함)와, `TEXTBOOK_STORE` 가 있는 컴퓨터의 `.githooks/pre-push`. PR 의 CI 와 비공개 자료가 없는 기여자의 컴퓨터에서는 붙이지 않는다 (13절). 기준 가지(`--base origin/main`)에서 공개되어 있던 차시의 사실이 바뀌었는데 `corrections` 가 늘지 않았으면 실패. 기준 가지에서 공개되어 있던 묶음의 명세가 없어졌거나 draft 로 바뀌었어도 실패 (종이에 박힌 주소가 사라진다). 초안마다 "공개까지 남은 것"(검수·사실 확인·먼저 공개할 앞 묶음)을 한 줄 알림으로 찍는다. |

`checks/outputs.mjs` 가 빌드 뒤에 보는 것: `visibleLessons()` 의 차시마다 페이지가 있는 자료 가운데 준비된 것의 미리보기 그림(`thumbFile(id, kind)`)이 있고 폭 480px·60KB 이하의 JPEG 인가 (10절. 없으면 실패), 공개 빌드의 dist 에 초안이 없는가(html 에 `data-draft` 가 없고, `dist/<id>/`·`dist/media/<id>/`·`dist/files/<id>/` 의 묶음이 모두 `visibleLessons()` 에 있다. 주소 목록을 `lessonPaths()` 로 만들지 않은 페이지가 있으면 여기에서 걸립니다), 파일마다 `printJobs()` 의 쪽수와 쪽 크기(A4, 7절 조건 5), 파일 크기(PDF 하나 5MB, PPTX 하나 20MB, 사이트 전체 1000MB 까지), 산출물(html, pdf 글자, pptx)에 `localhost`·`127.0.0.1` 이 없는가(공개 빌드), dist 의 html 이 사이트 밖 주소를 부르지 않는가(script·link·img·iframe·font), 초안의 PDF 에 `SITE.draftNotice` 가 있고 `SITE.aiNotice` 가 없는가, 공개된 차시의 PDF 에 안내 페이지 주소가 있는가 (PDF 의 글은 7절의 규칙으로 읽고 견준다: 조각을 그대로 이어 붙이고 빈칸을 뺀다), `/media/` 그림이 `object-fit: contain` 으로 그려지는가, pptx 안의 그림이 원본 파일과 가로세로 비율이 같고(±1%) 자르기 값이 0 인가 (8절), 차시표의 `focus` 가 dist 의 html 에 실리지 않았는가. dist 의 자리는 `distDir()` 로 얻는다 (10절).

## 12. 초안과 공개

- `status` 는 `draft` 와 `published` 둘뿐입니다. 어디까지 검수했는지는 `reviews` 가 말합니다 (`reviewState(id)`).
- 초안은 `SHOW_DRAFTS=1` 일 때만 실립니다. `SHOW_DRAFTS=1` 빌드는 미리 보기 전용이고 배포 워크플로는 쓰지 않습니다. `astro dev` 는 늘 초안을 보여 줍니다.
- 공개되지 않은 차시의 화면·인쇄물·PPTX 에는 "교사가 검수한 자료"라고 쓰지 않습니다. `footerNotice(lesson)` 과 `sheetFooter(lesson)` 이 알맞은 문구를 줍니다. `SITE.aiNotice`·`SITE.printFooter` 를 직접 쓰지 않습니다.
- 차시가 없는 페이지(첫 화면·교과서 목차·단원·자료 유형별·업데이트·제작 현황·내 자료함·소개)는 `footerNotice()` 를 인자 없이 부릅니다 (Base.astro 가 합니다). 공개 빌드에서는 `SITE.siteNotice`("차시 자료는 AI 도구로 초안을 만들고, 교사가 검수한 것만 공개합니다.")가 나오고, 미리 보기 빌드와 `astro dev` 에서는 초안을 늘어놓고 링크하는 페이지이므로 `SITE.previewNotice`("검수 전 초안이 섞여 있는 미리 보기입니다.")가 나옵니다.
- 저장소가 공개이므로 커밋하는 순간 공개입니다. 초안이라도 교과서 문장을 옮기지 않았는지, 그림의 이용 조건이 무엇인지 확인한 뒤에 올립니다.

### 공개 조건

`status: published` 인 명세는 아래를 모두 채워야 읽힙니다 (`loadLesson()` 이 막습니다). 남은 것은 `publishGaps(id)` 가 넷 모두 알려 줍니다. 빈 목록이면 공개할 수 있습니다. 넷 모두 로더가 봅니다. 형식(`schema/`)은 `status` 를 보고 막지 않습니다 (공개된 차시를 고친 뒤에도 지문과 남은 것을 읽을 수 있어야 합니다).

1. 검수 다섯 가지(fact 사실 대조, originality 베끼기 검사, voice 문장 다듬기, print 화면·인쇄 점검, owner 날쌤 승인) 모두, 마지막 기록이 **지금 내용의 지문**이 적힌 pass 이다. 베끼기 검사의 pass 는 검사 도구가 적은 것(`by` 가 `copy-guard@<8자>`)만 친다 (13절).
2. 사실마다 서로 다른 두 사람의 confirmed 확인이 **지금 문장의 지문**으로 있고, 마지막 확인이 confirmed 이다.
3. 사실마다 공개 출처가 있고, 그 가운데 하나에는 근거 구절(`quote`)이 있다.
4. 가리키는 다른 묶음도 공개되어 있다.

- 지문(`lib/seal.ts`)은 검수한 내용에 기록을 묶습니다. 검수한 뒤에 한 글자라도 고치면 그 기록은 없는 것으로 칩니다.
  - 명세의 지문에 들어가는 것: `status`·`reviews`·`checks`·`schema_version` 을 뺀 명세의 값 전체, 그림 파일의 내용, 전개도 모듈 파일의 내용, 그리고 **앞 묶음에서 빌려 온 것**(가리킨 사실의 문장과 출처 주소, 가리킨 그림의 권리 정보와 파일, 단원 덱에 모은 카드의 앞면·뒷면·사실·그림. 카드의 그림이 더 앞 묶음의 것이어도 그 그림까지 들어갑니다).
  - 그래서 앞 묶음을 고치면 그것을 가리키는 묶음(단원 정리 묶음)도 다시 검수합니다. 빌려 오지 않은 글을 고친 것은 뒤 묶음의 지문을 바꾸지 않습니다.
  - **지문에는 한 차시에 딸린 것(명세, 그림, 전개도 모듈)만 듭니다. 함께 쓰는 코드는 들지 않습니다.** 페이지와 인쇄물을 그리는 코드, `generators/papercraft/net.ts`, PPTX 생성기, 스타일을 고쳐도 어느 차시의 검수 기록도 낡지 않습니다. 그런 고침은 시험과 미리 보기 빌드를 보고 확인합니다. 함께 쓰는 코드 하나를 고칠 때마다 모든 차시의 기록을 무효로 하면 다시 검수할 수 없는 양이 됩니다.
  - 사실의 지문은 문장과 출처 주소입니다.
  - 지문은 값만 봅니다. YAML 의 주석·따옴표·칸의 차례는 들지 않습니다 (주석은 13절). 값은 형식이 읽은 값입니다. 형식이 같은 값으로 읽는 것은 지문도 같습니다: 따옴표 없는 `1392` 와 `"1392"`, 한 줄 글과 여러 줄 글(`|`), 묶음 id `01` 과 `"01"`. 적는 꼴만 바꾼 것으로는 검수 기록이 낡지 않습니다. 적지 않은 칸의 기본값은 지문에 들지 않으므로 형식에 기본값이 새로 생겨도 지문은 그대로입니다.
  - 줄 끝(LF·CRLF)도 들지 않습니다. 글 파일(SVG, 전개도 모듈)은 줄 끝을 LF 로 맞춘 뒤에 지문을 내므로 Windows 에서 꺼낸 저장소에서도 같은 지문이 나옵니다 (`.gitattributes` 도 줄 끝을 LF 로 둡니다).
- 적힌 차례가 시간 차례입니다. 나중에 적힌 fix 나 disputed 가 앞의 pass 를 뒤집습니다. 기록의 날짜는 위에서 아래로 같거나 늦어져야 합니다 (형식이 막습니다. 가지를 합치다 차례가 뒤섞이면 알 수 있습니다).
- 지문은 손으로 적지 않습니다. `scripts/sign.mjs`(저장소)가 `sealsOf(id)` 로 얻어 기록을 적습니다. YAML 의 주석이 남도록 `parseDocument` 로 고칩니다. 베끼기 검사의 pass 는 `sign` 이 적지 않습니다 (13절의 검사 도구가 적습니다. fix 는 적을 수 있습니다).
  - 검수 기록: `npm run sign -- 5-2/1/01 voice --by "ai:다듬기"` (`--result fix`, `--note "…"` 를 받습니다)
  - 사실 확인: `npm run sign -- 5-2/1/01 check f1 f3 --by "ai:검증자A"` (사실 id 를 여럿 적거나 `--all` 로 그 묶음의 사실 전부. `--verdict disputed`, `--note "…"` 를 받습니다)
  - 이 명세에 이미 적힌 이름과 `reviewerKey()` 가 같은데 철자가 다른 이름(`ai:검증자A` 와 `AI:검증자a`)으로는 적지 않고 멈춥니다. 같은 사람이면 철자를 맞추고, 다른 사람이면 다른 이름을 씁니다.
- **공개된 차시를 고칠 때**는 같은 커밋에서 `status` 를 `draft` 로 되돌립니다. **그 차시를 가리키는 공개된 묶음도 같은 커밋에서 `draft` 로 되돌립니다** (같은 단원의 뒤 묶음 가운데 `"01/f1"`·`"01/stone"` 처럼 가리키거나 카드를 모으는 묶음. 단원 정리 묶음은 거의 늘 그렇습니다). 그래야 다시 검수하는 동안 `npm run dev` 와 미리 보기가 열립니다. 공개된 차시는 공개된 묶음만 가리킬 수 있어서, 하나라도 `published` 인 채로 두면 `loadLesson()` 과 빌드와 `npm run dev` 가 그 묶음에서 멈춥니다 (오류 문구가 어느 묶음인지와 할 일을 알려 줍니다. 그때에도 `sealsOf()`·`reviewState()`·`publishGaps()` 는 읽힙니다).
  - 다시 검수를 마치면 날쌤이 `published` 로 적습니다.
  - 함께 내린 묶음은 빌려 온 것(사실·그림·카드)이 그대로이면 검수 기록이 그대로 맞습니다 (`reviewState()` 가 모두 pass, `publishGaps()` 가 빈 목록). 그때는 `status` 만 다시 `published` 로 적습니다. 빌려 온 것이 바뀌었으면 `publishGaps()` 가 알려 주는 대로 그 묶음도 다시 검수합니다.
  - 고치기부터 다시 공개하기까지를 한 PR 에서 마칩니다. `draft` 인 채로 합치면 종이에 박힌 주소가 사이트에서 사라집니다.
- 숫자가 없는 문장이 사실에서 나오는지는 기계가 알 수 없습니다. `npm run factsheet -- <id>` (`scripts/factsheet.mjs`, 저장소)가 `factBoxes(lesson)`(`#lib/checks.ts`)으로 사실 대조표를 찍어 줍니다.
  - 사실의 문장마다 그것을 가리킨 글(`refs` 에 그 사실이 든 상자의 `where` 와 `texts`)을 나란히 찍습니다. 문항은 거짓으로 낸 OX 문장과 틀린 보기까지 모두 찍고 정답(`answerText()`)을 곁에 적습니다.
  - 끝에 **아무 사실도 가리키지 않는 글**(`refs` 가 빈 상자)을 '가리킨 사실 없음'으로 모아 찍습니다. 마무리 장, 사실을 가리키지 않은 학습지, 오개념에 받아 주는 말, 교사 메모가 여기에 옵니다. 이런 글은 숫자가 없으면 어떤 검사에도 걸리지 않습니다.
  - 아이와 교사가 읽는 글(`childStrings()`·`teacherStrings()`)은 이 표의 어딘가에 빠짐없이 오릅니다. 빠지는 것은 대조의 기준인 사실의 문장·출처와 그림의 권리 정보뿐입니다 (`tests/contract/checks.test.ts` 가 지킵니다).
  - 사실 대조(fact) 검수는 이 표를 끝까지 읽었다는 뜻입니다. '가리킨 사실 없음'에 사실을 말하는 문장이 있으면 fix 로 적고, 내용 담당이 `facts` 에 사실을 더해 그 글이 가리키게 합니다.
- **`status: published` 와 `kind: owner` 기록은 날쌤만 적습니다.** 에이전트와 기여자는 적지 않습니다. 에이전트는 날쌤이 그 검수를 맡긴 때가 아니면 `npm run sign` 으로 검수·확인 기록도 적지 않습니다. 형식은 누가 적었는지 증명하지 못하므로 `.github/CODEOWNERS` 와 가지 보호로 지킵니다. 날쌤 승인이 있어야 바뀌는 곳은 그 파일이 정하고(명세와 검수 기록, 형식, 명세를 읽는 코드, 검사와 서명 도구, 전개도 도안, 워크플로, 계약서), 이 문서는 목록을 다시 적지 않습니다. 저장소 담당이 그 파일을 고칩니다.
- `by` 에는 공개해도 되는 이름(별명)만 적습니다. 실명·학교·이메일은 적지 않습니다. AI 는 `ai:` 로 시작하는 이름을 씁니다. owner 기록은 사람만 적습니다.
- 사실을 확인하는 두 사람은 AI 검증자여도 됩니다. 마지막 승인(owner)은 늘 사람(날쌤)이 차시 전체를 읽고 합니다. `/about/` 이 이것을 그대로 밝힙니다.
- "서로 다른 두 사람"은 `reviewerKey(by)` 로 견줍니다: 유니코드 정규화(NFKC), 소문자, 빈칸과 보이지 않는 글자를 뺀 값입니다. `ai:검증자A` 와 `AI:검증자a` 는 한 사람입니다. `scripts/sign.mjs` 도 같은 열쇠를 씁니다.
- 공개한 뒤에 사실을 고치면 `corrections` 에 날짜와 고친 내용을 적습니다. 안내 페이지에 보입니다.
- 워크플로가 도는 때: `lessons-ci` 는 pull_request, 기본 가지 push, workflow_dispatch 에서만 돕니다 (PR 가지에서 두 번 돌지 않습니다). `npm run typecheck` 는 `npm run check` 와 따로 한 단계입니다. `lessons-deploy` 는 기본 가지에서만 돕니다. SITE_URL 저장소 변수가 없으면 배포 작업은 실패하지 않고 건너뜁니다 (배포 요약에 까닭을 한 줄 적습니다). 빌드의 `SITE_BASE` 는 Pages 가 실제로 내주는 하위 경로(`configure-pages` 의 `base_path`)에서 얻습니다. 저장소 변수 `SITE_BASE` 는 적어 두면 그 값과 같은지만 보고, 다르면 멈춥니다.
- 배포 워크플로는 승인자가 날쌤인 `production` 환경을 쓰고, 배포 요약(`checks/deploy-summary.mjs`)에 이번에 새로 공개되는 묶음과 사이트에서 빠지는 묶음의 id(지금 사이트의 `/published.json` 과 새로 빌드한 `/published.json` 을 견준 차이. 둘 다 묶음 id 의 JSON 배열입니다. 3절)를 적습니다. 지금 사이트를 읽지 못하면(첫 배포, 사이트가 내려가 있을 때) 배포를 막지 않고, 견주지 못했다는 까닭과 이번 빌드의 공개 묶음만 적습니다.

## 13. 베끼기 검사

- 교과서·지도서·활동지·PPT 의 글은 이 저장소에 넣지 않습니다. 검사 결과에도 옮겨 적지 않습니다 (기록의 `note`, 커밋 글, CI 기록 포함). 겹친 곳은 "교과서 8쪽, 14자"처럼 쪽수와 길이로만 적습니다.
- 교과서에서 가져오는 것은 단원명, 차시 번호, 쪽수뿐이고 차시표에만 적습니다.
- 비공개 자료는 저장소 밖 폴더에 두고 환경 변수 `TEXTBOOK_STORE` 로 가리킵니다. 그 폴더가 저장소 안에 있으면 검사가 멈춥니다. 형식은 `<학기>/<종류>/<쪽 세 자리>.txt` (종류: textbook, guide, sheet, ppt). `npm run store:add` (`scripts/store-add.mjs`)가 PDF 나 쪽 글 파일 폴더에서 이 꼴로 만들고, 저장소 안의 폴더에는 만들지 않습니다.
- `npm run check:originality -- <id>` (`checks/originality.mjs`, 저장소) 는 lesson.yaml 의 글자 전체(주석 포함)와, 그 묶음의 지문에 드는 글 파일(`media` 의 SVG 파일, 전개도 모듈 `papercraftModuleFile(lesson)`)의 글자 전체를 봅니다. 통과 기록의 지문이 이 파일들까지 덮으므로 검사도 같은 범위를 봅니다 (SVG 안에 `<text>` 로 적은 문장은 명세의 글 뽑기에도 나오지 않습니다). `npm run check:originality -- --registry` 는 차시표(registry.yaml)의 글자 전체를 봅니다 (학기 소개 `blurb`, 묶음의 `focus`, 주석). 글자 그대로와 함께, 읽히는 글로 푼 것도 견줍니다: YAML 은 읽은 값(`\uAC00` 이스케이프와 여러 줄 글이 풀린 값), SVG 는 태그를 걷어 내고 문자 참조(`&#xAC00;`)를 푼 글, 전개도 모듈은 문자열 안의 `\u` 이스케이프를 푼 글입니다. 띄어쓰기와 문장부호를 뺀 뒤 한글 12자 이상이 이어서 같으면 실패, 8~11자는 알림입니다. 단원명과 고유 명사 목록(`checks/originality-allow.txt`. 한 줄에 고유 명사 하나, `#` 뒤는 주석, 문장이나 구절은 적지 않습니다)은 뺍니다.
- 활동의 짜임(같은 질문을 같은 차례로 묻는가)과 그림의 닮음은 글자 검사로 잡히지 않습니다. 비공개 자료를 볼 수 있는 검수자가 학습지와 발문, 직접 그린 그림(도해·지도·컬러링 도안·전개도)을 교과서의 해당 쪽과 견줍니다.
- 남의 그림·사진은 같은 검수에서 원본 페이지를 열어 이용 조건(사람이 나오면 초상)을 다시 확인하고 `credit.checked` 를 고칩니다. 고친 다음에 기록합니다 (명세를 고치면 지문이 바뀝니다).
- 기록은 검사 도구가 적습니다. 검수자가 짜임과 그림까지 본 뒤 `--record` 를 붙여 돌리면, 통과했을 때 도구가 기록을 적습니다. `npm run sign` 으로 적은 pass 는 치지 않습니다. 손으로 적은 pass 는 이름 꼴(copy-guard@…)이 아니면 치지 않습니다. 이름 꼴을 흉내 낸 기록은 형식이 막지 못하므로 CODEOWNERS 승인이 막습니다.
  - 기록은 견줄 자료가 있을 때만 적습니다: 비공개 자료에 그 묶음의 교과서 쪽(차시표의 `pages`)이 하나 이상, 그 학기의 지도서 쪽이 하나 이상 있어야 합니다. 모자라면 무엇이 없는지 알리고 적지 않습니다.
  - 차시: `npm run check:originality -- <id> --record` 가 `reviews` 에 `kind: originality`, `by: "copy-guard@<자료 묶음 지문 8자>"`, `result: pass`, `seal: sealsOf(id).lesson` 을 적습니다.
  - 차시표: `npm run check:originality -- --registry --record` 가 차시표의 `originality` 칸(맨 바깥 칸)에 `by`, `date`, `seal: registrySeal()` 을 적습니다. 차시표에는 명세가 없는 묶음의 `focus` 도 있어서 차시표가 제 기록을 갖습니다. `blurb` 나 `focus` 를 고치면 이 기록은 없는 것이 됩니다 (`registryOriginality()`).
- 공개 CI 는 교과서를 볼 수 없으므로 기록의 지문이 지금 내용과 같은지만 봅니다. 지문은 값만 보고 **주석은 지문에 들지 않습니다**. 그래서 둘을 더 지킵니다.
  - 주석에는 자료의 문장을 옮겨 적지 않습니다 (쪽수와 길이로만 적습니다).
  - `.githooks/pre-push` 는 `TEXTBOOK_STORE` 가 있으면 기록이 있든 없든, 이번에 올리는 커밋에서 바뀐 lesson.yaml 과 registry.yaml, 그리고 SVG 그림이나 전개도 모듈이 바뀐 묶음에 `check:originality` 를 다시 돌립니다 (주석까지 봅니다).
- 초안과 차시표도 이 기록이 있어야 기본 가지에 들어갑니다. 막는 곳은 둘입니다.
  - **기본 가지의 CI** 가 `npm run check -- --push` 를 돌립니다 (배포 워크플로도 이것을 먼저 돌립니다). 기록이 없거나 낡았으면 실패하고 배포하지 않습니다.
  - **CODEOWNERS 승인.** `content/` 를 고치는 PR 은 날쌤이 승인해야 합쳐집니다 (12절). 날쌤은 바뀐 파일에 검사를 돌려(`--record`) 그 기록을 PR 에 올린 뒤에 승인합니다. 기록이 이미 맞아 있어도 돌립니다 (주석은 기록에 묶여 있지 않습니다).
  - PR 의 CI 는 `--push` 없이 `npm run check` 를 돌립니다. 기록이 없는 것은 알림으로 보입니다. 비공개 자료가 없는 기여자는 이 기록을 만들 수 없기 때문입니다 (`npm run sign` 은 적지 못하고 손으로 적은 pass 는 치지 않습니다).
- `.githooks/pre-push` 는 `npm ci` 가 누구에게나 켭니다 (`package.json` 의 `prepare` 가 `core.hooksPath` 가 비어 있을 때만 `lessons/.githooks` 로 정합니다 (0절). 학습 지도 저장소에서 누가 이미 정해 둔 값은 덮어쓰지 않습니다. 따로 켜는 명령이 없습니다). 그래서 **비공개 자료가 없는 기여자를 막지 않습니다.**
  - `TEXTBOOK_STORE` 가 없으면: "베끼기 검사를 건너뜁니다 (비공개 자료가 없습니다). 기록은 날쌤이 PR 에서 적습니다" 한 줄을 찍고 0 으로 끝납니다. 다른 것은 돌리지 않습니다.
  - `TEXTBOOK_STORE` 가 있으면(날쌤의 컴퓨터): 위의 다시 검사를 돌리고 `npm run check -- --push` 로 막습니다. 검사는 꺼내 둔 파일을 읽으므로, `content/` 에 커밋하지 않은 고침이 있거나 올리는 커밋이 지금 꺼낸 커밋(HEAD)이 아니면 검사하지 않고 멈춥니다 (고친 글을 검사하고 고치기 전의 글을 올리게 됩니다).

## 14. 디자인

- 기준값은 `src/styles/tokens.css` 에 있습니다. 색·글자 크기·간격을 새로 만들지 않고 변수로 씁니다.
- 분위기 (날쌤의 nalssam-pptx 모양. R53): 따뜻한 미색 바탕(`--bg`), 남색 글씨(`--navy`), 청록 포인트(`--teal`), 산호 한 방울(`--coral`). 산호색은 주의를 끄는 자리에만 씁니다: 수업 화면에서는 "이제 여러분 차례"·"다시 해 봅시다", 사이트에서는 '새 자료' 표와 초안 표시 띠. 맞은 답에는 쓰지 않습니다 (맞은 답은 청록색. 8절). 한 화면에 여러 뜻으로 흩뿌리지 않습니다. 산호색 글자는 흰 바탕(`--card`)이나 `--bg` 위에만 얹습니다 (`--coral-soft` 위에서는 4.5:1 이 되지 않습니다).
- 카드는 흰 바탕에 1px `--line` 테두리의 납작한 상자(모서리 `--radius-sm`~`--radius`)이고 그림자가 없습니다. 제목은 Pretendard ExtraBold(`--fw-heading`, 800)입니다. 섹션 제목 위에는 청록 머리말(`Kicker`, `--fs-kicker`)을 둡니다. 머리말에 번호를 붙이는 것은 차례가 실제로 있는 자리(수업 흐름의 단계, 만드는 순서)뿐입니다. 한 줄 결론은 민트 띠(`Band`)로, 한 페이지에 하나까지 씁니다. 세는 숫자는 고른 폭 숫자(`font-variant-numeric: tabular-nums`)로 찍습니다. 여백을 넉넉히 둡니다. 그러데이션을 쓰지 않습니다.
- 어느 출판사의 로고·색·상품 이름·닮은 배치도 쓰지 않습니다 (R58). 출판사를 말하는 것은 차시 번호와 쪽수가 따르는 교과서를 밝히는 '비상교육(설규주) 교과서' 이름표(`loadRegistry().textbook`)뿐입니다.
- 글꼴은 Pretendard 이고 npm 패키지에서 직접 싣습니다 (Base.astro).
- 외부 요청을 하지 않습니다. 추적 도구, 외부 글꼴, 외부 스크립트, 끼워 넣은 외부 페이지가 없습니다 (학교망에서 막힐 수 있습니다). 광고와 유료 상품 안내를 싣지 않습니다.
- 이모지를 쓰지 않습니다. 아이콘이 필요하면 선으로 된 SVG 를 직접 그립니다.
- 한 화면에 한 가지 일만 시킵니다.
- 한글 줄바꿈은 Base.astro 가 정합니다 (`word-break: keep-all; overflow-wrap: anywhere;`, 제목은 `text-wrap: balance`).
- 휴대폰 폭(사이트 페이지는 320px, 그 밖은 360px)에서 가로 스크롤이 생기지 않아야 합니다. 휴대폰에서 누르는 자리는 44px(`--tap`) 이상입니다.
- 접근성: 본문 대비 4.5:1 이상, 키보드로 모든 기능(메뉴, 탭, 작은 창 포함)을 쓸 수 있어야 하고 초점 표시가 보여야 합니다. 지금 자리는 `aria-current`, 켜고 끄는 단추(담기)는 `aria-pressed` 로 알립니다. 읽기와 길 찾기는 스크립트 없이 되고, 스크립트는 거르기·담기·찾기처럼 덧붙이는 기능에만 씁니다. 그림에는 명세의 `alt` 를 씁니다. 움직임은 `prefers-reduced-motion` 을 따릅니다.
- 이용 조건을 말하는 자리에는 `SITE.licence.name` 과 `SITE.licenceNote` 를 함께 씁니다 (출처를 따로 적은 사진·그림은 이 조건이 아니라 저마다 적힌 조건을 따릅니다).
- 차시가 없는 페이지(첫 화면·교과서 목차·단원·자료 유형별·업데이트·제작 현황·내 자료함·소개)의 맨 아래 문구는 공개 빌드에서 `SITE.siteNotice`("차시 자료는 AI 도구로 초안을 만들고, 교사가 검수한 것만 공개합니다.")입니다. 그 페이지 자체는 검수한 자료가 아니므로 `SITE.aiNotice` 를 쓰지 않습니다 (12절).

## 15. 글

- 화면의 모든 글은 한국어입니다. 교사에게는 합니다체, 아이에게는 "~해 봅시다", "~인가요?" 로 씁니다.
- 꾸미는 말을 줄이고 할 일을 씁니다. "쉽고 재미있게", "다양한", "효과적인", "~를 통해" 같은 말을 쓰지 않습니다.
- 버튼에는 누르면 일어나는 일을 씁니다: "학습지 인쇄", "수업 화면 띄우기".
- 같은 것은 같은 이름으로 부릅니다: 차시, 묶음, 학습지, 수업 화면, 확인 퀴즈, 페이퍼크래프트, 컬러링 도안, 카드, 웹 활동, 만들기 세트 (`ASSET_LABEL`). 사이트는 제 이름을 `SITE.name` 으로 부르고, 페이지는 교과서 목차, 차시 자료실, 자료 유형별, 업데이트, 제작 현황, 내 자료함으로 부릅니다. 자료 카드의 단추는 `OPEN_LABEL`(띄우기, 인쇄 페이지, 열기)과 내려받기, 담기입니다.
- 교과서 문장·활동·예시 답을 옮기지 않습니다 (13절).
- 다른 회사의 서비스 이름을 쓰지 않습니다.
- 아이가 읽는 글에는 아직 배우지 않은 낱말을 쓰지 않습니다 (11절의 낱말 검사가 알려 줍니다. 이 판에서는 알림입니다).
- 아이가 읽는 글(수업 화면, 학습지, 카드, 페이퍼크래프트의 조각 이름과 순서, 확인 퀴즈, 웹 활동)에서는 한 가지를 한 이름으로만 부릅니다. 사전마다 다른 이름이 있으면 하나를 골라 아이가 읽는 모든 글에 씁니다. 다른 이름은 교사 메모에서 한 번 "같은 말"이라고 밝힙니다. 예: 고인돌의 부분은 덮개돌과 받침돌이라고만 부르고, 굄돌·고임돌·막음돌·받침판은 아이가 읽는 글에 쓰지 않습니다. 만들기 모형도 사진과 수업 화면의 도해와 같은 짜임으로 만들고(덮개돌 하나를 받침돌 둘이 받친다), 모형이 서는 데 꼭 필요한 바닥은 바닥판, 덮개돌을 끌어 올리는 비탈은 흙 비탈이라고 부릅니다.
- 수업에서 견주는 갈래의 이름도 같습니다. 이름표 자리(표의 머리 칸, 학습지의 보기 칸, 수업 화면의 상자 이름표와 머리말, 학습지의 부제, 낱말 장의 쓰임 예)에서는 정한 이름을 글자까지 같게 씁니다. 고인돌 차시의 세 갈래는 '눈으로 본 것', '아는 것', '짐작한 것'입니다. 이어지는 문장 안에서는 자연스러우면 줄여 써도 됩니다.
- 아무도 본 적 없는 과정(옛사람이 큰 돌을 어떻게 옮기고 올렸는지 같은 것)은 사실이 아니라 여러 짐작 가운데 하나로 씁니다. 자료는 출처가 말하는 데까지만 그립니다. 출처에 없는 것(예: 흙 비탈 위의 굴림대)을 그림이나 조각으로 보태지 않고, 아이가 스스로 떠올리면 수업에서 받아 줍니다. 그 짐작을 그대로 설명하는 공개 출처가 있으면 근거 구절과 함께 적고, 찾지 못했거나 출처의 설명과 어긋나는 데가 있으면 교사 메모에 그대로 밝힙니다.
- 맞고 틀림의 표시는 사람이 읽는 모든 자리(확인 퀴즈의 단추와 풀이, 안내 페이지의 정답, 학습지, 수업 화면, PPTX 메모)에서 ○(U+25CB)와 ×(U+00D7)입니다. 라틴 글자 O·X 로 쓰지 않습니다. 기호와 소리 내어 읽는 말은 `MARK`·`MARK_LABEL`(`#lib/site.ts`)에서 가져오고 손으로 적지 않습니다. 명세의 OX 문항 답은 그대로 `true`·`false` 입니다.
- 닫는 따옴표와 바로 뒤의 조사(‘눈으로 본 것’은)는 다른 줄로 갈리지 않습니다. 수업 화면, 확인 퀴즈, 웹 활동, 인쇄 페이지는 아이가 읽는 명세의 글을 HTML 로 그릴 때 `keepParticle(text)` 를 거칩니다 (그 사이에 U+2060 WORD JOINER 를 넣습니다). 여는 따옴표 뒤의 물결표와 뒤의 한글(‘~하니까’) 사이에도 넣습니다. 빈칸 없이 두 낱말을 잇는 가운뎃점(무덤·집터)은 앞뒤 모두에 넣어 점 앞이나 뒤에서 줄이 갈리지 않게 합니다. 양쪽이 한글·라틴 글자·숫자일 때만이고, 앞뒤에 빈칸이 있는 점(가 · 나)은 그대로 둡니다. 낱말에 빈칸 없이 붙은 괄호 이름표(괄호 안 10자 이하. 없다(아는 것))는 괄호 앞에 넣고 괄호 안의 빈칸을 U+00A0 으로 바꿉니다. 그래서 이름표가 앞 낱말과 떨어지거나 둘로 갈리지 않습니다. PPTX, 검색 색인에 드는 차시 안내 페이지, 글 뽑기와 검사에는 쓰지 않습니다 (보이지 않는 글자가 찾기와 견주기를 어긋나게 합니다). 인쇄 PDF 의 글에는 이 글자가 남으므로, PDF 글을 찾거나 견주는 코드는 빈칸과 함께 U+2060 도 뺍니다.
- 아이와 교사가 읽는 글의 따옴표는 굽은 따옴표(‘ ’ “ ”)입니다. 곧은 따옴표(' ")는 `npm run check` 가 알립니다 (11절 '표현').
- 교실에서 해 본 것처럼 쓰지 않습니다. 걸리는 시간이나 "가장 많습니다" 같은 말은 날쌤이 수업에서 확인한 것만 적고, 그 전에는 "~일 수 있습니다"로 씁니다. 수업 방법에 관한 말은 `facts` 에 넣지 않습니다.
- 낱말 풀이(`terms.new[].meaning`)는 명사구든 문장이든 사전처럼 마침표로 끝냅니다. 이 풀이가 카드 뒷면과 낱말 장에 그대로 찍힙니다.
- 자료를 준비하는 데 걸리는 시간(예: 종이 고인돌을 오리고 접는 시간)은 준비물(`prepare`)에 한 번만, 어림한 값이라고 밝혀 적습니다. 교사 메모나 인쇄 안내 같은 다른 자리는 숫자를 되풀이하지 않고 준비물을 가리킵니다.

## 16. 코드와 시험

- Node 24, ESM. TypeScript 는 지울 수 있는 문법만 씁니다 (enum, namespace, 생성자 매개변수 속성 `constructor(public x)` 금지. `tsconfig.json` 의 `erasableSyntaxOnly`). 가져올 때 확장자 `.ts` 를 붙입니다. `lib/` 와 `schema/` 는 Astro 없이 `node` 로 바로 돕니다.
- 프레임워크를 더하지 않습니다. 화면의 동작은 작은 바닐라 스크립트나 웹 컴포넌트로 씁니다.
- 의존성을 새로 넣으려면 보고서에 까닭을 적습니다.
- 주석은 한국어로, 왜 그렇게 했는지를 적습니다.
- 명세의 칸 이름과 선택값은 영문 소문자 snake_case 입니다. 예외는 셋입니다: `phase` 의 도입·전개·정리(그대로 찍는 말), 이용 조건 코드(`KOGL-1`, `CC-BY-SA`), 주소·파일·그림 id(소문자와 하이픈). 철자는 `licence` 입니다.
- 시험은 `tests/<담당>/<이름>.test.ts` 에 두고 `npm test`(`node --test`)로 돌립니다. 폴더 이름을 인자로 주지 않습니다. 시험에서 dev 서버를 띄우지 않습니다 (10절).
- 시험용 명세는 `CONTENT_DIR` 로 가리킵니다. `tests/contract/fixtures/content` 를 그대로 써도 되고(고치지는 않습니다), 고쳐 보려면 `.cache/tests/` 아래에 복사해 씁니다 (`tests/contract/helpers.ts` 의 `tempContent()`).
- **시험은 제 폴더에만 씁니다.** `npm test` 는 시험 파일들을 함께 돌립니다. 시험은 `dist/`, `public/`, 기본 캐시(`.cache/files/`, `.cache/lessons.json`, `.cache/media/`)에 쓰지 않습니다.
  - 사이트는 `.cache/tests/<이름>-<pid>/` 아래에 빌드합니다 (`tests/contract/helpers.ts` 의 `buildSite(out, env)`. `astro build --outDir` 를 깨끗한 환경 변수로 돌립니다).
  - 이어서 돌리는 `sync-media`·`render-pdf`·`generators/pptx/build.mjs`·`checks/outputs.mjs` 에는 같은 폴더를 `--out <폴더>` 로 줍니다 (10절). 그림은 `<폴더>/media/` 에, 캐시는 `<폴더>.cache/` 에 생깁니다.
  - 끝나면 그 폴더를 지웁니다.
  - 손으로 가짜 차시 넷을 빌드해 볼 때도 같습니다: `CONTENT_DIR=tests/contract/fixtures/content SHOW_DRAFTS=1 npx astro build --outDir .cache/tests/fixtures`. 그림까지 보려면 같은 환경 변수로 `node scripts/sync-media.mjs --out .cache/tests/fixtures` 를 이어서 돌립니다.
- **Chromium 이나 python-pptx 가 필요한 시험은 그것을 쓸 수 없으면 실패하지 않고 까닭을 적어 건너뜁니다.** 내용만 고치는 사람은 둘 다 없이 `npm test` 를 돌립니다. `tests/contract/helpers.ts` 의 `noChromium()`·`noPython()` 이 건너뛰는 까닭(글)이나 false 를 줍니다.
  - `const skip = await noChromium();` 다음에 `test('이름', { skip }, async () => { … })`. Python 은 `noPython()` 이고, `PYTHON`(없으면 `python3`)으로 `import pptx` 가 되는지 봅니다.
  - CI 는 둘 다 깔고 돌립니다. CI 에서는 건너뛴 시험이 없어야 합니다. LibreOffice(`soffice`)와 `pdftotext` 처럼 다른 도구가 없으면 건너뛰는 시험도 같습니다. CI 는 그 도구를 깔고, 건너뛴 시험이 하나라도 있으면 실패합니다.

## 17. 기여 문서 (저장소)

| 파일 | 내용 |
|---|---|
| `README.md` | 무엇인지, 돌려 보는 법 |
| `CONTRIBUTING.md` | ① 차시 하나 고치기·더하기 (폴더가 곧 id, `npm run new -- <id>` 가 `docs/template/lesson.yaml` 을 복사한다. 같은 PR 에 `content/updates.yaml` 소식 한 줄) ② YAML 에서 자주 틀리는 다섯 가지 (글 안의 콜론+빈칸, 따옴표로 시작하는 글, 값 뒤의 ` #`, 탭 들여쓰기, true/false 자리의 O·X) ③ 그림을 넣기 전에 확인할 것 (이용 조건, 출처 주소, 확인한 날, 1MB, 파일 이름) ④ 교과서 문장·활동·예시 답을 옮기지 않는다 ⑤ 기여한 글과 그림은 CC BY-NC-SA 4.0, 코드는 MIT 로 공개하는 데 동의한다 ⑥ 검수 기록은 누가 적는가, 실명을 적지 않는다. 베끼기 검사 기록은 날쌤이 PR 에서 적는다 (비공개 자료가 없으면 올리기 전 검사는 한 줄 알리고 지나가고, PR 의 검사에는 '기록 없음'이 알림으로 보인다. 정상이다) ⑦ 공개된 차시를 고칠 때의 순서 (12절: 그 차시와 그것을 가리키는 묶음을 draft 로, 다시 검수, 다시 공개) |
| `LICENSE` | MIT (코드) |
| `LICENSE-CONTENT.md` | CC BY-NC-SA 4.0: `content/` 의 글과 직접 만든 그림, `generators/papercraft/modules/` 의 도안, 만들어진 PDF·PPTX. 단원명은 교과서의 것이다. `credit.licence` 가 original 이 아닌 그림은 CC BY-NC-SA 에 들지 않고 거기 적힌 제 조건을 따른다 (퍼블릭 도메인·CC0, 공공누리 제1유형, CC BY, CC BY-SA 뿐이다. 5절) |
| `NOTICE.md` | 가져다 쓴 자료의 출처 (이미 들어 있습니다. 더 생기면 이어 적습니다). 사이트 검색에 쓰는 Pagefind(MIT)도 여기에 적습니다 |
| `docs/template/lesson.yaml` | 칸마다 한국어 주석을 단 본보기. `tests/repo/` 가 형식으로 검증합니다. 본보기가 가리키는 그림은 `docs/template/media/` 에 함께 둡니다 (폴더째 복사하면 바로 읽힙니다) |
| `docs/CHANGELOG.md` | 형식이 바뀐 기록 |
| git 뿌리의 `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/` (양식 이름 "수업 자료 오류 제보"(`lessons-error.yml`), "수업 자료 저작권 신고"(`lessons-copyright.yml`)), `.github/workflows/lessons-ci.yml`, `.github/workflows/lessons-deploy.yml` | 0절 |
| `.githooks/pre-push` | 13절 |

## 18. 형식을 바꿀 때

- 첫 구현이 끝난 뒤 계약 파일은 따로 PR 을 올려 날쌤 승인을 받고 고칩니다.
- 선택 칸이나 선택값을 더하는 변경은 `schema_version` 을 올리지 않습니다.
- 첫 공개 전에 조인 규칙(첫 장은 표지, 주소의 "@", 피해를 담은 사실을 그린 그림 등)도 판을 올리지 않았습니다. 공개된 명세가 아직 없고, 시험용 명세와 고인돌 초안은 모두 새 규칙에 맞습니다.
- 칸 이름·값·뜻을 바꾸거나 필수 칸을 더하면 `schema_version`(`schema/common.ts` 의 `SCHEMA_VERSION`)을 1 올리고, 같은 PR 에 ① `scripts/migrate/v<N>-to-v<N+1>.mjs` (주석이 남도록 `parseDocument` 로 고칩니다) ② 그 스크립트로 고친 `content/` 와 `tests/**/fixtures/` 전부 ③ `docs/CHANGELOG.md` 한 줄을 싣습니다.
- `schema_version` 은 지문에 들지 않으므로 판만 올리는 옮김은 지문을 바꾸지 않습니다. 칸 이름이나 값의 꼴이 바뀌는 옮김은 지문을 바꿉니다. 그때 옮기기 스크립트는 고치기 전에 `sealsOf(id)` 와 `reviewState(id)` 로 옛 지문과 그 지문에 맞던 기록을 적어 두고(옮기기 전의 코드로 돕니다), 옮긴 뒤에 그 기록들의 `seal` 만 새 `sealsOf(id)` 값으로 바꿔 적습니다. 값의 뜻이 바뀌거나 필수 칸이 느는 옮김에는 바꿔 적지 않고 다시 검수합니다. 이 PR 은 날쌤이 승인합니다.
- 로더는 지금 판만 읽습니다.
- 도우미를 더하거나 이름을 바꾸면 이 문서의 4절 표도 함께 고칩니다. 표에 적힌 이름이 `lib/` 에 없거나, `lib/` 가 내보내는 이름이 이 문서 어디에도 없으면 `tests/contract/contract-doc.test.ts` 가 실패합니다 (다른 도우미 안에서만 쓰는 것은 그 시험의 목록에 까닭과 함께 적습니다).
- 글이 들어가는 칸을 더하면 `lib/content.ts` 의 글 뽑기(`childStrings`·`teacherStrings`·`recordStrings`)에 넣고, 시험용 명세(`tests/contract/fixtures/content`)에 그 칸을 쓴 본보기를 넣습니다. 글 뽑기에서 빠지면 `tests/contract/fixtures.test.ts` 가 실패합니다. 글이 아닌 칸(선택값, id, 주소)은 `NOT_PROSE` 에 칸 이름으로 적고, 이름이 글 칸과 겹치면 `NOT_PROSE_AT` 에 경로로 적습니다.
