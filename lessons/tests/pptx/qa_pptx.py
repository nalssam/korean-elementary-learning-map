"""수업 화면 PPTX 를 내보내기 전에 보는 점검 (날쌤의 nalssam-pptx 스킬에 있는 qa.py 의 생각을 이 저장소에 맞춘 것).

사용: python tests/pptx/qa_pptx.py <pptx> [<pptx> ...]   → JSON {"<pptx>": {"slides": 장 수, "errors": [...]}} 를 찍는다.
렌더링을 눈으로 보는 일을 대신하지 않는다. 넘침은 tests/slides/pptx.test.ts 가 LibreOffice 로 찍어 본다.

점검
 - 글꼴: 장에 있는 모든 글 조각의 글꼴(latin·ea·cs)이 Pretendard 집안이다. 이름이 비어 테마 글꼴로 떨어지는 조각도 잡는다.
   쓴 글꼴은 모두 파일에 심겨 있다 (p:embeddedFontLst). 장 번호는 Pretendard Medium 이다 (R55).
 - 도형이 장 밖으로 나가지 않는다.
 - 모든 장(그림 출처 장까지)의 메모란에 글이 있다.
 - 장 번호("05 / 22", "3차시 01 / 04"): 두 자리로 채웠고, 한 장에 하나다. 덩어리(차시)마다 분모가 하나이고,
   장을 넘길 때마다 1씩 늘며(빠진 장 없이), 덩어리의 끝 장 번호가 분모와 같다. 덩어리는 섞이지 않고 차례대로 온다.
"""
import json
import re
import sys
import zipfile

from pptx import Presentation
from pptx.oxml.ns import qn

COUNTER = re.compile(r'^(?:(\d+)차시 )?(\d+) / (\d+)$')
FAMILY = 'Pretendard'
COUNTER_FACE = 'Pretendard Medium'
SLACK = 6350  # 0.5pt (EMU). 반올림으로 생기는 틈은 넘친 것으로 보지 않는다


def two(s):
    """두 자리로 채운 번호인가 ("05", "12", "123")"""
    return len(s) == max(2, len(str(int(s))))


def run_faces(run):
    """글 조각의 글꼴 이름들: latin(font.name)과 ea·cs. 적지 않은 칸은 None"""
    rpr = run._r.find(qn('a:rPr'))
    out = {'latin': run.font.name}
    for tag in ('ea', 'cs'):
        el = rpr.find(qn(f'a:{tag}')) if rpr is not None else None
        out[tag] = el.get('typeface') if el is not None else None
    return out


def embedded_faces(path):
    with zipfile.ZipFile(path) as z:
        pres = z.read('ppt/presentation.xml').decode('utf8')
    return set(re.findall(r'<p:font typeface="([^"]+)"', pres)), 'embedTrueTypeFonts="1"' in pres


def check(path):
    prs = Presentation(path)
    W, H = prs.slide_width, prs.slide_height
    errors = []
    used = set()
    counters = []  # (장 번호(1부터), 차시 또는 None, 분자 글, 분모 글)
    for i, s in enumerate(prs.slides, 1):
        for sh in s.shapes:
            name = sh.name
            if sh.left is not None and sh.width is not None:
                if sh.left < -SLACK or sh.top < -SLACK or sh.left + sh.width > W + SLACK or sh.top + sh.height > H + SLACK:
                    errors.append(f'{i}장: 도형이 장 밖으로 나감 ({name})')
            if not sh.has_text_frame:
                continue
            text = sh.text_frame.text.strip()
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    if not r.text.strip():
                        continue
                    faces = run_faces(r)
                    for slot, face in faces.items():
                        if face is None:
                            errors.append(f'{i}장: 글꼴 이름이 없는 글 조각({slot}, 테마 글꼴로 보임): {r.text[:20]!r}')
                        elif not (face == FAMILY or face.startswith(FAMILY + ' ')):
                            errors.append(f'{i}장: Pretendard 가 아닌 글꼴 "{face}"({slot}): {r.text[:20]!r}')
                        else:
                            used.add(face)
            m = COUNTER.fullmatch(text)
            if m:
                counters.append((i, m.group(1), m.group(2), m.group(3)))
                face = next((r.font.name for p in sh.text_frame.paragraphs for r in p.runs if r.text.strip()), None)
                if face != COUNTER_FACE:
                    errors.append(f'{i}장: 장 번호 "{text}" 의 글꼴이 {COUNTER_FACE} 가 아님 ({face})')
        note = s.notes_slide.notes_text_frame.text.strip() if s.has_notes_slide else ''
        if not note:
            errors.append(f'{i}장: 메모란이 비어 있음')

    embedded, on = embedded_faces(path)
    if not on:
        errors.append('글꼴을 심지 않았음 (embedTrueTypeFonts)')
    for face in sorted(used - embedded):
        errors.append(f'쓴 글꼴 "{face}" 가 파일에 심겨 있지 않음')

    # 장 번호의 차례
    seen = {}
    for i, lesson, a, b in counters:
        label = f'{lesson + "차시 " if lesson else ""}{a} / {b}'
        if not (two(a) and two(b)):
            errors.append(f'{i}장: 장 번호 "{label}" 를 두 자리로 채우지 않음')
        seen.setdefault(lesson, []).append((i, int(a), int(b), label))
    if len({i for i, *_ in counters}) != len(counters):
        errors.append('한 장에 장 번호가 둘 이상 있음')
    spans = []
    for lesson, items in seen.items():
        who = f'{lesson}차시' if lesson else '장 번호'
        dens = sorted({b for _, _, b, _ in items})
        if len(dens) > 1:
            errors.append(f'{who}: 분모가 제각각 ({", ".join(map(str, dens))})')
        offsets = {i - a for i, a, _, _ in items}
        if len(offsets) > 1:
            errors.append(f'{who}: 장 번호가 장마다 1씩 늘지 않음 ({", ".join(label for *_, label in items)})')
        last = max(a for _, a, _, _ in items)
        if dens and last != dens[-1]:
            errors.append(f'{who}: 끝 장의 번호({last})가 분모({dens[-1]})와 다름')
        spans.append((min(i for i, *_ in items), max(i for i, *_ in items), who))
    spans.sort()
    for (a0, a1, aw), (b0, b1, bw) in zip(spans, spans[1:]):
        if b0 <= a1:
            errors.append(f'{aw} 와 {bw} 의 장이 섞여 있음')
    return {'slides': len(prs.slides), 'errors': errors}


if __name__ == '__main__':
    print(json.dumps({p: check(p) for p in sys.argv[1:]}, ensure_ascii=False))
