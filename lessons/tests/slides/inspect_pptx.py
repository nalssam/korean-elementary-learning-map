"""시험용: PPTX 하나를 읽어 시험이 볼 값을 JSON 으로 찍는다. 사용: python inspect_pptx.py <pptx>"""
import json
import re
import sys
import zipfile

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

path = sys.argv[1]


def line_of(sh):
    ln = sh._element.spPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}ln')
    if ln is None or ln.find('{http://schemas.openxmlformats.org/drawingml/2006/main}noFill') is not None:
        return None
    clr = ln.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
    return [int(ln.get('w', '0')) / EMU_PT, clr.get('val').upper() if clr is not None else None]

prs = Presentation(path)
EMU_PT = 12700
out = {'width': prs.slide_width, 'height': prs.slide_height, 'slides': []}
for s in prs.slides:
    texts, boxes, pics = [], [], []
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            texts.append(sh.text_frame.text)
            boxes.append([sh.left / EMU_PT, sh.top / EMU_PT, (sh.left + sh.width) / EMU_PT, (sh.top + sh.height) / EMU_PT])
        if sh.shape_type == 13:  # 그림
            import io
            im = Image.open(io.BytesIO(sh.image.blob))
            pics.append({
                'ratio_shape': sh.width / sh.height, 'ratio_image': im.width / im.height,
                'crop': [sh.crop_left, sh.crop_right, sh.crop_top, sh.crop_bottom],
                'inside': sh.left >= 0 and sh.top >= 0 and sh.left + sh.width <= prs.slide_width and sh.top + sh.height <= prs.slide_height,
                'alt': sh._element.nvPicPr.cNvPr.get('descr'),
                'box': [sh.left / EMU_PT, sh.top / EMU_PT, (sh.left + sh.width) / EMU_PT, (sh.top + sh.height) / EMU_PT],
                # 그림 둘레의 선: [굵기 pt, 색] (없으면 null)
                'line': line_of(sh),
            })
    notes = s.notes_slide.notes_text_frame.text if s.has_notes_slide else ''
    out['slides'].append({'texts': texts, 'boxes': boxes, 'pictures': pics, 'notes': notes})
z = zipfile.ZipFile(path)
pres = z.read('ppt/presentation.xml').decode()
out['embedded'] = re.findall(r'<p:font typeface="([^"]+)"', pres)
out['fontdata'] = [n for n in z.namelist() if n.endswith('.fntdata')]
colors = set()
faces = set()
# 글 조각(a:r 의 a:rPr)과 문단 끝(a:endParaRPr)의 언어: 장과 메모란 모두
lang = {'runs': 0, 'ends': 0, 'missing': []}
for n in z.namelist():
    if re.match(r'ppt/(slides/slide|notesSlides/notesSlide)\d+\.xml$', n):
        x = z.read(n).decode()
        for tag, key in (('<a:r><a:rPr', 'runs'), ('<a:endParaRPr', 'ends')):
            for m in re.finditer(re.escape(tag) + r'([^>]*)>', x):
                lang[key] += 1
                attrs = m.group(1)
                if 'lang="ko-KR"' not in attrs or 'altLang="en-US"' not in attrs:
                    lang['missing'].append(f'{n}: {tag}{attrs[:60]}')
        lang['runs_total'] = lang.get('runs_total', 0) + x.count('<a:r>')
        lang['paras_total'] = lang.get('paras_total', 0) + len(re.findall(r'<a:p>|<a:p ', x))
for n in z.namelist():
    if re.match(r'ppt/slides/slide\d+\.xml$', n):
        x = z.read(n).decode()
        colors.update(re.findall(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', x))
        faces.update(re.findall(r'typeface="([^"]+)"', x))
out['colors'] = sorted(c.upper() for c in colors)
cp = prs.core_properties
out['core'] = {'title': cp.title, 'author': cp.author, 'last_modified_by': cp.last_modified_by, 'comments': cp.comments,
               'keywords': cp.keywords, 'revision': cp.revision}
out['raw'] = {'core': z.read('docProps/core.xml').decode(), 'app': z.read('docProps/app.xml').decode(),
              'sldSz': (re.search(r'<p:sldSz[^>]*>', pres) or [''])[0]}
out['faces'] = sorted(faces)
out['lang'] = lang
print(json.dumps(out, ensure_ascii=False))
