"""시험용: build_pptx.py 의 credit_pages() 를 출처 줄 수를 바꿔 가며 돌려 장 나누기를 JSON 으로 찍는다.
사용: python tests/slides/credit_pages.py (lessons/ 에서)"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'generators', 'pptx'))
import build_pptx as B  # noqa: E402

FONT = os.path.join(ROOT, 'node_modules', 'pretendard', 'dist', 'public', 'static', 'alternative')
ctx = B.Ctx({
    'colors': {}, 'copy': {}, 'type': {}, 'fit': {}, 'picture': {},
    'fonts': {'name': 'Pretendard', 'regular': os.path.join(FONT, 'Pretendard-Regular.ttf'), 'bold': os.path.join(FONT, 'Pretendard-Bold.ttf')},
})
C = B.CREDIT


def item(i):
    # 줄 수가 섞이게: 주소 둘, 하나, 없음
    it = {'text': f'사진 {i}: 국립중앙박물관, 공공누리 제1유형'}
    if i % 3 != 2:
        it['sourceUrl'] = f'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?schM=view&searchId=search&relicId={4000 + i}'
    if i % 3 == 0:
        it['licenceUrl'] = 'https://www.kogl.or.kr/info/licenseType1.do'
    return it


def height(it):
    lines = [it['text']] + [u for u in (it.get('sourceUrl'), it.get('licenceUrl')) if u]
    return sum(B.text_h(ctx, t, C['size'] if i == 0 else C['url'], B.CW, C['lh']) for i, t in enumerate(lines))


cases = []
for n in range(1, 41):
    cr = {'heading': '그림 출처', 'more': '({n}/{total})', 'empty': '-', 'footer': '검수 전 초안입니다. 수업에 쓰지 마세요.', 'items': [item(i) for i in range(n)]}
    pages, fh = B.credit_pages(ctx, cr)
    limit = B.BOTTOM - fh - 32
    sizes = [len(p) for _, p in pages]
    used = []
    for head, page in pages:
        top = B.PAD_T + B.text_h(ctx, head, 72, B.CW, 1.25, True) + 48
        used.append((top, top + sum(h for _, h in page) + C['gap'] * (len(page) - 1)))
    overfull = any(bottom > limit + 1 and len(p) > 1 for (_, bottom), (_, p) in zip(used, pages))
    # 다음 장의 첫 줄이 앞 장의 남은 자리에 들어갈 수 있었는가 (그렇다면 앞 장을 덜 채운 것이다)
    next_fits = any(used[k][1] + C['gap'] + pages[k + 1][1][0][1] <= limit for k in range(len(pages) - 1))
    lone_fits = len(pages) > 1 and sizes[-1] == 1 and used[-2][1] + C['gap'] + pages[-1][1][0][1] <= limit
    cases.append({'n': n, 'pages': sizes, 'overfull': overfull, 'next_fits': next_fits, 'lone_fits': lone_fits})
print(json.dumps({'cases': cases}, ensure_ascii=False))
