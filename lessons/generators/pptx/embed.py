"""PPTX 에 글꼴을 심고(전체 글꼴, EOT 꼴의 .fntdata) 꾸러미의 남은 틀 흔적을 정리한다.

학교 컴퓨터에 Pretendard 가 깔려 있지 않아도 PowerPoint 가 같은 글꼴로 보여 주게 하려는 것이다.
심는 것은 'Pretendard'(보통·굵게)와 장 번호의 'Pretendard Medium'(보통) 세 벌이다 (R55).
부분(subset) 임베드는 교사가 새로 쓴 글자가 다른 글꼴로 보이게 만들므로 늘 전체 글꼴을 넣는다.
python-pptx 의 기본 틀은 4:3 화면(sldSz type="screen4x3")과 남의 프로그램 이름(app.xml)을 달고 오므로 여기서 지운다.
"""
import re
import zipfile

from lxml import etree

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
RELNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
APP_XML = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
           'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
           '<Slides>{slides}</Slides><Notes>{notes}</Notes><HiddenSlides>0</HiddenSlides></Properties>')
FONT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'
P, R = '{%s}' % NS['p'], '{%s}' % NS['r']


def embed_fonts(src, dst, families):
    """families: [(글꼴 이름, {'regular': Font, 'bold'?: Font}), ...] (ttf.Font).
    예: [('Pretendard', {보통, 굵게}), ('Pretendard Medium', {보통})]. 이름마다 p:embeddedFont 하나, 글꼴 파일마다 .fntdata 하나다."""
    zin = zipfile.ZipFile(src)
    files = {i.filename: zin.read(i.filename) for i in zin.infolist()}
    order = [i.filename for i in zin.infolist()]
    zin.close()
    pres = etree.fromstring(files['ppt/presentation.xml'])
    rels = etree.fromstring(files['ppt/_rels/presentation.xml.rels'])
    ct = files['[Content_Types].xml'].decode('utf8')
    if 'Extension="fntdata"' not in ct:
        ct = ct.replace('<Default ', '<Default Extension="fntdata" ContentType="application/x-fontdata"/><Default ', 1)
        files['[Content_Types].xml'] = ct.encode('utf8')
    rid = max([int(m) for r in rels for m in re.findall(r'^rId(\d+)$', r.get('Id'))] + [0])
    lst = etree.Element(P + 'embeddedFontLst')
    # p:embeddedFontLst 는 p:notesSz 바로 뒤에 온다 (요소 차례가 틀리면 PowerPoint 가 파일을 고치겠다고 묻는다)
    pres.find('p:notesSz', NS).addnext(lst)
    n = 0
    for face, fonts in families:
        ef = etree.SubElement(lst, P + 'embeddedFont')
        etree.SubElement(ef, P + 'font', typeface=face, panose=fonts['regular'].panose_hex(), pitchFamily='50', charset='-127')
        # 자식 요소의 차례는 regular, bold (스키마의 차례)
        for slot in ('regular', 'bold'):
            if slot not in fonts:
                continue
            n += 1
            rid += 1
            target = f'fonts/font{n}.fntdata'
            etree.SubElement(rels, '{%s}Relationship' % RELNS, Id=f'rId{rid}', Type=FONT_REL, Target=target)
            el = etree.SubElement(ef, P + slot)
            el.set(R + 'id', f'rId{rid}')
            files['ppt/' + target] = fonts[slot].eot(face, 'Bold' if slot == 'bold' else 'Regular')
            order.append('ppt/' + target)
    pres.set('embedTrueTypeFonts', '1')
    pres.attrib.pop('saveSubsetFonts', None)
    # 16:9 로 바꾼 크기에 4:3 이라는 이름이 남지 않게
    pres.find('p:sldSz', NS).attrib.pop('type', None)
    # 앱 정보: 프로그램 이름·화면 비율·틀의 제목 목록을 빼고 장 수만 적는다
    if 'docProps/app.xml' in files:
        slides = len(pres.find('p:sldIdLst', NS))
        notes = sum(1 for n in files if re.match(r'ppt/notesSlides/notesSlide\d+\.xml$', n))
        files['docProps/app.xml'] = APP_XML.format(slides=slides, notes=notes).encode('utf8')
    files['ppt/presentation.xml'] = etree.tostring(pres, xml_declaration=True, encoding='UTF-8', standalone=True)
    files['ppt/_rels/presentation.xml.rels'] = etree.tostring(rels, xml_declaration=True, encoding='UTF-8', standalone=True)
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zo:
        for n in order:
            zo.writestr(n, files[n])
