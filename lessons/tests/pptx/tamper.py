"""시험용: 잘 만든 PPTX 를 일부러 한 군데 망가뜨린 사본을 만든다. qa_pptx.py 가 그것을 잡는지 보려는 것이다.

사용: python tests/pptx/tamper.py <원본 pptx> <사본 pptx> <무엇>
  notes    2번 장의 메모란을 비운다
  font     2번 장의 첫 글 조각을 Pretendard 가 아닌 글꼴(Malgun Gothic)로 바꾼다
  theme    2번 장의 첫 글 조각에서 글꼴 이름을 지운다 (테마 글꼴로 떨어진다)
  outside  3번 장의 첫 도형을 장 오른쪽 밖으로 민다
  counter  3번 장의 장 번호 분모를 99 로 바꾼다
  pad      3번 장의 장 번호를 두 자리로 채우지 않은 꼴("3 / 22")로 바꾼다
"""
import re
import sys

from pptx import Presentation
from pptx.oxml.ns import qn

src, dst, what = sys.argv[1:4]
prs = Presentation(src)
slides = list(prs.slides)


def first_run(s):
    return next(r for sh in s.shapes if sh.has_text_frame for p in sh.text_frame.paragraphs for r in p.runs if r.text.strip())


def counter_run(s):
    return next(r for sh in s.shapes if sh.has_text_frame for p in sh.text_frame.paragraphs for r in p.runs
                if re.fullmatch(r'(\d+차시 )?\d+ / \d+', r.text))


if what == 'notes':
    slides[1].notes_slide.notes_text_frame.text = ''
elif what == 'font':
    first_run(slides[1]).font.name = 'Malgun Gothic'
elif what == 'theme':
    rpr = first_run(slides[1])._r.find(qn('a:rPr'))
    for tag in ('a:latin', 'a:ea', 'a:cs'):
        el = rpr.find(qn(tag))
        if el is not None:
            rpr.remove(el)
elif what == 'outside':
    sh = list(slides[2].shapes)[0]
    sh.left = prs.slide_width - sh.width // 2
elif what == 'counter':
    r = counter_run(slides[2])
    r.text = re.sub(r'/ \d+$', '/ 99', r.text)
elif what == 'pad':
    r = counter_run(slides[2])
    r.text = re.sub(r'(\d+) / (\d+)$', lambda m: f'{int(m.group(1))} / {m.group(2)}', r.text)
else:
    raise SystemExit(f'모르는 것: {what}')
prs.save(dst)
