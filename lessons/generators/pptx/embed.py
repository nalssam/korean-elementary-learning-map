"""PPTX 에 글꼴을 심는다 (전체 글꼴, EOT 꼴의 .fntdata).

학교 컴퓨터에 Pretendard 가 깔려 있지 않아도 PowerPoint 가 같은 글꼴로 보여 주게 하려는 것이다.
부분(subset) 임베드는 교사가 새로 쓴 글자가 다른 글꼴로 보이게 만들므로 늘 전체 글꼴을 넣는다.
"""
import re
import zipfile

from lxml import etree

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
RELNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
FONT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'
P, R = '{%s}' % NS['p'], '{%s}' % NS['r']


def embed_fonts(src, dst, face, fonts):
    """fonts: {'regular': Font, 'bold': Font} (ttf.Font)"""
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
    ef = etree.SubElement(lst, P + 'embeddedFont')
    etree.SubElement(ef, P + 'font', typeface=face, panose=fonts['regular'].panose_hex(), pitchFamily='50', charset='-127')
    for n, slot in enumerate(('regular', 'bold'), start=1):
        rid += 1
        target = f'fonts/font{n}.fntdata'
        etree.SubElement(rels, '{%s}Relationship' % RELNS, Id=f'rId{rid}', Type=FONT_REL, Target=target)
        el = etree.SubElement(ef, P + slot)
        el.set(R + 'id', f'rId{rid}')
        files['ppt/' + target] = fonts[slot].eot(face, 'Bold' if slot == 'bold' else 'Regular')
        order.append('ppt/' + target)
    pres.set('embedTrueTypeFonts', '1')
    pres.attrib.pop('saveSubsetFonts', None)
    files['ppt/presentation.xml'] = etree.tostring(pres, xml_declaration=True, encoding='UTF-8', standalone=True)
    files['ppt/_rels/presentation.xml.rels'] = etree.tostring(rels, xml_declaration=True, encoding='UTF-8', standalone=True)
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zo:
        for n in order:
            zo.writestr(n, files[n])
