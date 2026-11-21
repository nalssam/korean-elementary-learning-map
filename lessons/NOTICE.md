# 가져다 쓴 자료의 출처와 이용 조건

이 저장소에 들어 있거나 빌드할 때 함께 실리는 남의 자료입니다. 차시마다 쓰는 사진·그림의 출처는 여기가 아니라 각 차시 명세(`lesson.yaml`)의 `media[].credit` 에 있습니다.

## 1. 사회과 성취기준 자료 — `data/standards/social-2022.json`

2022 개정 사회과 성취기준 49개의 **코드, 학년군, 영역 이름, 한 줄 요약**만 추려 담은 파일입니다.

- 원 자료: Korean Elementary Learning Map (한국 초등 학습지도), `data/kr/workstreams/social.json`
- 저작권: © 2026 DECK (github.com/DECK6), MIT License
- 받은 곳: https://github.com/nalssam/korean-elementary-learning-map (커밋 `3ef0563084aa2a9baaa47da2c1ec0ebf5d7edc5c`)
- 고친 것: 성취기준마다 네 칸(code, grade_band, unit, summary)만 남기고 나머지를 뺐습니다. 코드의 대괄호를 뗐습니다.

**요약은 공식 문구가 아닙니다.** `summary` 는 교육부가 고시한 성취기준 문장이 아니라 원 자료를 만든 쪽이 쓴 비공식 요약입니다. 사이트에 보여 줄 때도 요약이라고 밝힙니다. 성취기준의 코드와 영역 배치는 아래 공식 자료에서 확인된 것입니다.

- 교육부 고시 제2022-33호 [별책 7] 사회과 교육과정 (교육부 발행, NCIC 국가교육과정정보센터 배포)
- https://ncic.re.kr/inv/org/download.do?year=2022&seq=10003800&orgType=ogi4 (원 자료가 확인한 날: 2026-07-10)

이 저장소와 여기 실린 자료는 교육부·국가교육위원회·NCIC 의 공식 간행물이 아니며, 그 기관들이 만들거나 보증한 것이 아닙니다.

원 자료의 MIT License 고지:

```
MIT License

Copyright (c) 2026 DECK (github.com/DECK6)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. 글꼴 — Pretendard

- Pretendard (길형진), SIL Open Font License 1.1
- npm 패키지 `pretendard` 에서 빌드할 때 사이트에 함께 실립니다. 저장소에는 글꼴 파일을 넣지 않습니다.
- https://github.com/orioncactus/pretendard

## 3. 사이트 검색 — Pagefind

- Pagefind, MIT License (Copyright (c) Pagefind)
- npm 패키지 `pagefind` 로 빌드할 때 검색 색인과 검색 화면의 스크립트를 만들어 사이트의 `pagefind/` 폴더에 싣습니다. 그 폴더에 원 저작권 고지(`pagefind/LICENSE`)를 함께 싣습니다.
- https://github.com/CloudCannon/pagefind
