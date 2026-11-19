# 초등 사회 수업 자료

초등 사회 3~6학년의 차시마다 수업 자료를 만드는 오픈소스 프로젝트입니다. 차시 묶음마다 명세 파일(`lesson.yaml`) 하나를 쓰면 나머지는 그 파일에서 만들어집니다.

예를 들어 5학년 2학기 1단원 1차시는 `content/5-2/1/01/lesson.yaml` 하나입니다. 이 파일에서 차시 안내 페이지, 수업 화면과 PPTX, 학습지 PDF, 확인 퀴즈가 나오고, 카드·컬러링 도안·페이퍼크래프트·웹 활동은 명세에 적은 차시에만 나옵니다. 그래서 자료를 고칠 때는 명세 한 곳만 고칩니다.

## 놓인 자리

이 폴더(`lessons/`)는 [korean-elementary-learning-map](https://github.com/nalssam/korean-elementary-learning-map) 저장소 안에 있습니다. 저장소의 나머지는 학습 지도 데이터와 온톨로지이고, 이 프로젝트는 그것을 고치지 않습니다. 명령은 모두 `lessons/` 안에서 돌립니다.

## 지금 있는 것

- 5학년 2학기 차시표 (`content/registry.yaml`): 단원명, 차시 번호, 교과서 쪽수
- 1단원 1차시 명세 (`content/5-2/1/01/`): 초안입니다. 검수를 마치지 않아 공개 사이트에는 실리지 않습니다.
- 나머지 학기는 차시표가 아직 비어 있습니다.

## 폴더

| 폴더 | 들어 있는 것 |
|---|---|
| `content/` | 차시표와 차시 명세, 묶음마다 쓰는 그림 (`media/`) |
| `schema/` | 명세의 형식. 칸마다 설명이 주석으로 달려 있습니다 |
| `lib/` | 명세를 읽는 코드. 사이트와 생성기가 모두 이것을 거칩니다 |
| `src/` | 사이트 화면 (Astro) |
| `generators/` | PPTX와 페이퍼크래프트 전개도를 만드는 코드 |
| `scripts/`, `checks/` | 빌드, 검사, 검수 기록 도구 |
| `docs/` | 구현 계약서(`docs/CONTRACT.md`), 명세 본보기(`docs/template/lesson.yaml`), 형식 변경 기록(`docs/CHANGELOG.md`) |
| `tests/` | 시험 |

## 돌려 보기

Node.js 24가 있어야 합니다.

```sh
cd lessons
npm ci            # 처음 한 번. 필요한 것을 내려받습니다
npm run dev       # 사이트를 내 컴퓨터에서 띄웁니다. 초안도 보입니다
npm run check     # 명세를 검사합니다. 무엇을 고칠지 줄 번호와 함께 알려 줍니다
npm test          # 시험을 돌립니다
```

명세만 고치는 사람은 이 넷이면 됩니다. PDF와 PPTX는 깃허브의 CI가 만듭니다.

전체를 만들어 보려면 `npm run build` 를 돌립니다. 사이트, 그림, PDF, PPTX, 검색 색인을 차례로 만들고 산출물을 검사합니다. PDF를 찍는 데 Chromium(`npx playwright install chromium`), PPTX를 만드는 데 python-pptx가 있는 Python이 필요합니다. 공개용으로 만들 때는 배포 주소를 `SITE_URL` 로 줍니다. 종이에 박히는 QR 주소가 여기에서 나오기 때문입니다.

자주 쓰는 도구는 이렇습니다.

| 명령 | 하는 일 |
|---|---|
| `npm run factsheet -- 5-2/1/01` | 사실 대조표를 찍습니다. 사실마다 그것을 가리킨 글이 나란히 나옵니다 |
| `npm run sign -- 5-2/1/01 voice --by "별명"` | 검수 기록을 적습니다 |
| `npm run check:originality -- 5-2/1/01` | 교과서 자료와 겹치는 글을 찾습니다. 비공개 자료가 있는 컴퓨터에서만 돕니다 |

## 이용 조건

한 저장소 안에 조건이 다른 것이 섞여 있습니다. 폴더로 가립니다.

| 무엇 | 조건 | 파일 |
|---|---|---|
| `lessons/` 의 코드 | MIT | [`LICENSE`](LICENSE) |
| `lessons/content/` 의 글과 직접 만든 그림, 전개도 도안, 만들어진 PDF·PPTX | CC BY-NC-SA 4.0 | [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md) |
| 남의 사진·그림 | 명세의 `credit` 에 적힌 조건 | 각 차시의 `lesson.yaml` |
| 가져다 쓴 자료(성취기준 요약, 글꼴) | 원 자료의 조건 | [`NOTICE.md`](NOTICE.md) |
| `lessons/` 밖 (학습 지도 데이터와 코드) | 학습 지도 프로젝트의 조건 | 저장소 뿌리의 `LICENSE`, `NOTICE.md` |

수업에 쓰고 학교에서 나누는 것은 자유입니다. 팔거나 유료 상품에 넣을 수는 없습니다.

## 함께 만들기

차시를 고치거나 더하는 법, 그림을 넣기 전에 볼 것, 검수가 어떻게 돌아가는지는 [`CONTRIBUTING.md`](CONTRIBUTING.md)에 있습니다. 틀린 곳을 찾았는데 고칠 시간이 없으면 깃허브 이슈의 '오류 제보'로 알려 주세요.
