"""시험용: PPTX 하나를 읽어 시험이 볼 값을 JSON 으로 찍는다. 사용: python inspect_pptx.py <pptx>"""
import json
import re
import sys
import zipfile

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

path = sys.argv[1]
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
            })
    notes = s.notes_slide.notes_text_frame.text if s.has_notes_slide else ''
    out['slides'].append({'texts': texts, 'boxes': boxes, 'pictures': pics, 'notes': notes})
z = zipfile.ZipFile(path)
pres = z.read('ppt/presentation.xml').decode()
out['embedded'] = re.findall(r'<p:font typeface="([^"]+)"', pres)
out['fontdata'] = [n for n in z.namelist() if n.endswith('.fntdata')]
colors = set()
faces = set()
for n in z.namelist():
    if re.match(r'ppt/slides/slide\d+\.xml$', n):
        x = z.read(n).decode()
        colors.update(re.findall(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', x))
        faces.update(re.findall(r'typeface="([^"]+)"', x))
out['colors'] = sorted(c.upper() for c in colors)
out['faces'] = sorted(faces)
print(json.dumps(out, ensure_ascii=False))
