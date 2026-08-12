# CLAUDE.md

이 저장소에서 작업할 때 Claude Code가 참고하는 지침입니다.

## 저장소 성격

대한민국 2022 개정 초등 교육과정 기반 **학습 그래프 데이터셋 + 온톨로지 + 검증 파이프라인**입니다.
애플리케이션 코드나 런타임 서비스가 없습니다. 산출물은 JSON 데이터, RDF(JSON-LD/Turtle), 문서이며
빌드·검증 스크립트만 실행 코드입니다.

- Node.js `>=20.11`, ESM(`"type": "module"`), 런타임 의존성 없음(devDependency는 `ajv` 하나).
- 온톨로지 표준 검증(G7)만 Python 3와 고정 핀 RDF 도구(`rdflib`/`pyshacl`/`owlrl`)를 사용합니다.
- 문서와 데이터 문자열은 한국어가 기본입니다. 커밋 메시지는 Conventional Commits(`feat(ontology): …`) 형식.

## 파이프라인 (매우 중요)

```
scripts/*.mjs (생성기)
  → data/kr/workstreams/*.json (교과별 중간 산출물)
    → data/kr/{curriculum-standards,topics,dependencies,clusters,manifest}.json (정규 데이터)
      → dist/ontology/*.{jsonld,ttl,json} + docs/ontology-reference.md (릴리스 산출물)
```

`npm run build` = `build:kr:workstreams`(생성기 5개 + `repair-kr-workstreams.mjs`) → `build-kr-full-depth.mjs`.

### 생성 파일은 직접 수정하지 않습니다

아래는 모두 **생성물**입니다. 내용을 바꾸려면 해당 생성기를 고치고 다시 빌드하세요.

| 경로 | 생성 주체 |
| --- | --- |
| `data/kr/workstreams/{korean,english-efl,integrated,social,arts-pe}.json` | `scripts/generate-korean-workstream.mjs`, `build-english-efl-workstream.mjs`, `build-integrated-workstream.mjs`, `build-social-arts-pe-workstreams.mjs` |
| `data/kr/{curriculum-standards,topics,dependencies,clusters,manifest}.json` | `scripts/build-kr-full-depth.mjs` |
| `dist/ontology/{learning-map.jsonld,learning-map.ttl,manifest.json}` | `scripts/build-ontology.mjs` |
| `dist/ontology/release-manifest.json`, `docs/ontology-reference.md` | `scripts/build-ontology-release.mjs` |
| `dist/ontology/validation-report.json` | `scripts/validate-ontology.py` |

`data/kr/workstreams/{math,science,moral,practical-arts}.json`은 **직접 관리하는 입력**입니다.
단, `repair-kr-workstreams.mjs`가 빌드마다 이 파일들을 정규화해 제자리에 다시 씁니다(출처 별칭 정리, 조사 보정,
`counts` 재계산, `textPolicy` 강제). 수동 편집은 이 정규화를 통과하는 형태여야 합니다.

`data/kr/*.seed.json`은 이전 단계의 기록이며 빌드에 쓰이지 않습니다.

### 결정성이 계약입니다

생성기는 벽시계 시각·머신 경로를 출력하지 않고, 리소스/키/경로를 정렬해 씁니다.
날짜는 소스에 상수로 박혀 있습니다(`build-kr-full-depth.mjs`의 `VERSION`/`CREATED_AT`/`GENERATED_AT`).
CI는 `git diff --exit-code`로 재빌드 후 diff가 없어야 통과합니다. **빌드를 돌린 뒤 작업 트리가 더러워지면 버그입니다.**

## 명령어

```bash
npm ci
npm run build                    # 정규 데이터 재생성
npm test                         # node --test tests/*.test.mjs
npm run validate                 # 스키마·인벤토리·출처·DAG·해시
npm run check:content            # 콘텐츠 품질(조사·중복·증거)
npm run validate:ontology        # P0 통제 어휘 계약
npm run build:ontology && npm run check:ontology:artifacts
npm run build:ontology:release && npm run check:ontology:release
npm run verify:formal:node       # 위 Node 게이트(G1–G6) 일괄
```

`--check`를 붙인 빌드(`check:ontology:*`)는 산출물을 메모리에서 재생성해 바이트 단위로 비교만 합니다(파일을 쓰지 않음).

Python 게이트(G7)는 프로젝트 로컬 venv를 씁니다. 전역 설치 금지, 핀 버전 변경 금지.

```bash
npm run setup:ontology           # .venv-ontology 생성 (gitignore됨)
npm run validate:ontology:p2
npm run test:ontology:p2
npm run verify:formal            # 일곱 게이트 전체
```

`npm run check:links`는 공식 출처 URL의 실시간 접근성을 확인하며 네트워크에 의존하므로 릴리스 게이트가 아닙니다.

게이트 대응: G1 `build` / G2 `test` / G3 `validate` / G4 `check:content` / G5 `validate:ontology` /
G6 `check:ontology:artifacts`+`check:ontology:release` / G7 Python RDF·SHACL·OWL-RL·SPARQL·fixture.
CI는 `.github/workflows/ontology-release.yml`(Node 20.11.1, Python 3.14.3)에서 동일 순서로 실행합니다.

## 데이터 불변식

`scripts/validate-kr.mjs`와 `scripts/lib/kr-content-quality.mjs`가 강제하는 규칙 — 깨면 게이트가 막습니다.

- **DAG**: 선수 관계에 순환·자기참조 금지.
- **교과 간 간선 없음**: `graphPolicy.crossSubjectEdges: "none"`. 교과를 가로지르는 선수 관계를 만들지 마세요.
- **최소 주제 수** 1,500 (`MIN_TOPICS`). 현재 1,956.
- **성취기준 코드** 정규식 `^\[[246][국수과사영도실바슬즐건미음체][0-9]{2}-[0-9]{2}\]$`.
- **토픽 ID** 는 `kr.mt.<subject>.<...>.<code>.<slug>` 점 표기, 클러스터는 `kr.cluster.…`.
- 열거값: `type`은 `CONCEPTUAL|PROCEDURAL|REPRESENTATIONAL|LANGUAGE|META`, `strength`는 `hard|soft`,
  정렬 역할은 `introduces|supports|extends|assesses`,
  검증 상태는 `official-source-checked|public-doc-derived|needs-official-code-check`.
- 증거(`evidence`)는 관찰 가능한 문장 2개 이상, 성취기준 내 평가 질문 중복 금지, 조사(josa) 미해결 0건.
- `manifest.json`의 파일별 바이트 수·SHA-256이 실제 파일과 일치해야 합니다.
- 개수(11/620/1,956/1,894/153/43)는 README, `data/kr/manifest.json`, `dist/ontology/manifest.json`,
  `ontology/README.md`, `docs/*`에 중복 기재됩니다. 수치가 바뀌면 **전부 함께** 갱신하세요.

## 출처·권리 정책

- 공식 성취기준 **원문을 대량 수록하지 않습니다.** 데이터에는 코드, 출처 위치, 저장소 작성 요약·주제·증거만 넣습니다.
- 생성된 RDF 산출물에는 공식 성취기준 원문과 공식 출처 URL을 넣지 않습니다.
- `official-source-checked`는 "코드와 출처 위치를 확인했다"는 뜻이며, 공식 문구 수록이나 전문가 승인이 아닙니다.
- 저장소 라이선스는 MIT, 인용한 공식 문서의 권리 상태는 `cleared`(공개 공식 자료)입니다.
- 교육부·국가교육위원회·NCIC의 승인·후원을 주장하는 표현, 개별 학습자를 진단한다는 표현을 추가하지 마세요.
- 선수 관계는 이 모델의 **추천 구조**이지 보편적 학습 순서 주장이 아닙니다. 문서 표현을 이 선에 맞추세요.

## 온톨로지 작업 시

- `ontology/`는 손으로 관리하는 소스 계약(TBox `learning-map.ttl`, `context.jsonld`, SHACL `shapes.ttl`,
  `metadata.ttl`, `controlled-vocabulary.json`, `term-status.json`, `queries/`, `fixtures/`)입니다.
- 어휘 용어를 추가·변경·폐기하면 `controlled-vocabulary.json`, `term-status.json`, `replacements.json`,
  `ontology/CHANGELOG.md`를 함께 갱신하고 `deprecation-policy.md`/`governance.md`의 규칙을 따릅니다.
  `docs/ontology-reference.md`는 여기서 자동 생성되므로 직접 고치지 않습니다.
- 관계 의미: `directRequires`(원본), `unlocks`(직접 관계의 역), `indirectRequires`(길이 2 이상 비직접 경로).
  `hard`/`soft`는 원값을 보존한 채 `required`/`recommended`로 정규화합니다.
- SHACL을 바꾸면 `ontology/fixtures/adversarial/`의 실패 fixture와 `expected.json`,
  `queries/expected.json`도 같이 맞춰야 G7이 통과합니다.
- 공개 SPARQL 엔드포인트는 없습니다. `queries/`는 로컬 역량 질문 전용입니다.

## 작업 마무리 전 체크

1. 데이터·생성기를 건드렸으면 `npm run verify:formal:node` 실행.
2. 온톨로지 소스나 SHACL을 건드렸으면 Python 게이트까지 포함해 `npm run verify:formal` 실행.
3. `git status`가 깨끗한지 확인(생성물 재빌드분은 커밋에 포함).
4. 수치·상태 문구가 바뀌었으면 README·CHANGELOG·`ontology/CHANGELOG.md` 동기화.
