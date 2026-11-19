"""수업 화면 PPTX 를 만든다 (python-pptx).

사용: python build_pptx.py <lessons.json> <차시 id> [<차시 id> ...]
lessons.json 은 generators/pptx/build.mjs 가 검증을 마친 명세에서 내보낸 것이다 (README.md). 이 파일은 그것만 읽는다.
문구·색·글꼴 경로는 모두 lessons.json 에 실려 온다. 여기에 문구나 색을 다시 적지 않는다.

치수는 웹 무대와 같은 1920 × 1080 px 로 셈한다. 13.333in = 1920px 이므로 1px = 6350 EMU = 0.5pt 다.
웹 무대(src/components/slides/stage.css)와 같은 자리에 같은 크기로 놓아서 화면과 PPTX 가 같은 얼굴이 되게 한다.
글은 진짜 글상자로 넣는다 (교사가 고칠 수 있게). 넘침은 글꼴 파일의 글자 폭으로 줄바꿈을 미리 셈해 막는다.
글 조각(run)과 문단 끝(endParaRPr)에는 언어를 ko-KR(altLang en-US)로 적는다 (PowerPoint 가 영어 맞춤법 검사로 한글에 밑줄을 긋지 않게).
"""
import datetime
import json
import os
import sys

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

from embed import embed_fonts
from ttf import Font

W, H = 1920, 1080
PX = 6350
PAD_X, PAD_T, PAD_B = 120, 80, 88
CW = W - 2 * PAD_X          # 본문 폭
BOTTOM = H - PAD_B          # 본문 아래 끝
# 줄바꿈을 셀 때 상자 폭을 이만큼만 쓴다. 글자 폭은 글꼴 파일의 값 그대로라서 여유는 반올림만큼만 둔다.
# (예전에는 0.95 로 넉넉히 두었더니 한 줄에 들어가는 항목이 두 줄짜리 상자를 받아 항목 사이가 들쭉날쭉했다)
FIT = 0.99
# LibreOffice 는 한글과 그 밖의 글자(로마자·숫자·문장 부호) 사이마다 글자 크기의 이만큼 틈을 더 둔다 (README.md).
# PowerPoint 는 두지 않지만, 두 프로그램 어디에서 열어도 넘치지 않게 이 틈을 넣어 셈한다. 1920 무대·26pt 로 찍어 재어 보니 0.24em 남짓이었다.
ASIAN_GAP = 0.25
LANG, ALT_LANG = 'ko-KR', 'en-US'


class Overflow(Exception):
    pass


class Ctx:
    """한 덱을 만드는 동안 같이 쓰는 값"""

    def __init__(self, data):
        self.c = {k: RGBColor.from_string(v) for k, v in data['colors'].items()}
        f = data['fonts']
        self.face = f['name']
        self.reg = Font(f['regular'])
        self.bold = Font(f['bold'])
        self.copy = data['copy']
        self.type = data['type']
        # 장에 맞게 줄어드는 글의 크기 차례 (copy.ts 의 STAGE_FIT)와 그림 틀의 크기 (STAGE_PICTURE)
        self.fit = data['fit']
        self.pic = data['picture']
        # 글 곁에 그림 하나를 두는 장의 짜임 (copy.ts 의 STAGE_SIDE, sideCandidates)과 2 × 2 단계 장의 머리 글 크기 (STAGE_STEPS)
        self.side = data.get('side')
        self.steps = data.get('steps')


# ───────────────────────── 글 재기 ─────────────────────────

def _asian(ch):
    """한글·한자·가나 (LibreOffice 가 '아시아 문자'로 보는 것)"""
    o = ord(ch)
    return 0x1100 <= o <= 0x11FF or 0x3130 <= o <= 0x318F or 0xAC00 <= o <= 0xD7AF or 0x3040 <= o <= 0x30FF or 0x4E00 <= o <= 0x9FFF


def measure(font, text, size):
    """한 줄로 그린 글의 폭 (px). 글꼴 파일의 글자 폭에 LibreOffice 가 한글과 다른 글자 사이에 두는 틈(ASIAN_GAP)을 더한다.
    띄어쓰기는 건너뛰고 앞뒤 글자를 견준다 ('것: 아' 의 ':' 와 '아' 사이에도 틈이 생긴다)."""
    w = font.width(text, size)
    prev = None
    for ch in text:
        if ch == ' ':
            continue
        kind = _asian(ch)
        if prev is not None and kind != prev:
            w += ASIAN_GAP * size
        prev = kind
    return w


def wrap(ctx, text, size, width, bold=False):
    """웹 무대의 줄바꿈(word-break: keep-all; overflow-wrap: anywhere)과 같은 규칙으로 줄을 나눈다."""
    font = ctx.bold if bold else ctx.reg
    width *= FIT
    lines, cur = [], ''
    for word in text.split(' '):
        cand = f'{cur} {word}' if cur else word
        if measure(font, cand, size) <= width:
            cur = cand
            continue
        if cur:
            lines.append(cur)
        cur = ''
        # 한 낱말이 한 줄보다 길면 글자 단위로 끊는다
        for ch in word:
            if measure(font, cur + ch, size) > width and cur:
                lines.append(cur)
                cur = ''
            cur += ch
    lines.append(cur)
    return lines


def text_h(ctx, text, size, width, lh, bold=False):
    return len(wrap(ctx, text, size, width, bold)) * size * lh


def text_w(ctx, text, size, bold=False):
    return measure(ctx.bold if bold else ctx.reg, text, size)


# ───────────────────────── 도형 ─────────────────────────

def E(v):
    return Emu(int(round(v * PX)))


def _flat(sh):
    """테마 스타일(그림자 등)을 지운다. 어느 프로그램에서 열어도 그림자 없이 납작하게 보인다."""
    st = sh._element.find(qn('p:style'))
    if st is not None:
        sh._element.remove(st)


def _font(ctx, run, size, bold, color):
    f = run.font
    f.size = Pt(size / 2)
    f.bold = bold
    f.color.rgb = ctx.c[color]
    f.name = ctx.face
    rpr = run._r.get_or_add_rPr()
    rpr.set('lang', LANG)
    rpr.set('altLang', ALT_LANG)
    for tag in ('a:latin', 'a:ea', 'a:cs'):
        el = rpr.find(qn(tag))
        if el is None:
            el = rpr.makeelement(qn(tag), {})
            rpr.append(el)
        el.set('typeface', ctx.face)


def _end(p, size=None):
    """문단 끝 표시(endParaRPr)에도 언어를 적는다. 교사가 문단 끝에 글을 이어 쓰면 이 값을 물려받는다."""
    el = p._p.find(qn('a:endParaRPr'))
    if el is None:
        el = p._p.makeelement(qn('a:endParaRPr'), {})
        p._p.append(el)
    el.set('lang', LANG)
    el.set('altLang', ALT_LANG)
    if size:
        el.set('sz', str(int(round(size / 2 * 100))))


def text(ctx, s, x, y, w, h, paras, size, color='navy', bold=False, lh=1.4, align='l', anchor='t', gap=0):
    """글상자 하나. paras 는 글 하나 또는 문단 목록. 여백 0, 자동 맞춤 없음, 줄 간격은 고정값(size × lh)."""
    if isinstance(paras, str):
        paras = [paras]
    tb = s.shapes.add_textbox(E(x), E(y), E(w), E(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {'t': MSO_ANCHOR.TOP, 'm': MSO_ANCHOR.MIDDLE, 'b': MSO_ANCHOR.BOTTOM}[anchor]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {'l': PP_ALIGN.LEFT, 'c': PP_ALIGN.CENTER, 'r': PP_ALIGN.RIGHT}[align]
        p.line_spacing = Pt(size * lh / 2)
        if i and gap:
            p.space_before = Pt(gap / 2)
        # 한글 낱말을 줄 끝에서 가르지 않는다 (latinLnBrk="0": 띄어쓰기에서만 줄을 바꾼다)
        p._p.get_or_add_pPr().set('latinLnBrk', '0')
        r = p.add_run()
        r.text = para
        _font(ctx, r, size, bold, color)
        _end(p, size)
    return tb


def filled_text(ctx, s, x, y, w, h, px, py, paras, fill='paper', radius=20):
    """바탕을 칠한 둥근 상자 하나에 문단 여럿. 상자는 글에 맞춰 늘어난다 (spAutoFit).
    h 는 글꼴 폭으로 셈한 높이다. PowerPoint 는 그대로 열고, 글꼴이 바뀐 프로그램은 상자를 늘린다.
    paras: (글, 크기, 색, 굵게, 줄 간격, 앞 여백) 목록"""
    sh = box(ctx, s, x, y, w, h, fill=fill, line=None, radius=radius)
    tf = sh.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = E(px)
    tf.margin_top = tf.margin_bottom = E(py)
    tf.vertical_anchor = MSO_ANCHOR.TOP
    for i, (t, size, color, bold, lh, before) in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.line_spacing = Pt(size * lh / 2)
        if before:
            p.space_before = Pt(before / 2)
        p._p.get_or_add_pPr().set('latinLnBrk', '0')
        r = p.add_run()
        r.text = t
        _font(ctx, r, size, bold, color)
        _end(p, size)
    tf.auto_size = MSO_AUTO_SIZE.SHAPE_TO_FIT_TEXT
    return sh


def box(ctx, s, x, y, w, h, fill='card', line='line', radius=20, lw=1, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    sh = s.shapes.add_shape(shape, E(x), E(y), E(w), E(h))
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = ctx.c[fill]
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = ctx.c[line]
        sh.line.width = Pt(lw / 2) if lw >= 1.5 else Pt(0.75)
    else:
        sh.line.fill.background()
    _flat(sh)
    # 도형에도 빈 문단이 하나 들어 있다. 교사가 도형에 글을 써 넣어도 한글로 검사받게 문단 끝에 언어를 적는다
    _end(sh.text_frame.paragraphs[0])
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        sh.adjustments[0] = min(0.5, radius / max(1, min(w, h)))
    return sh


def hline(ctx, s, x1, y1, x2, y2, color='line', lw=1):
    ln = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, E(x1), E(y1), E(x2), E(y2))
    ln.line.color.rgb = ctx.c[color]
    ln.line.width = Pt(max(lw / 2, 0.75))
    _flat(ln)
    return ln


def num(ctx, s, x, y, n, d=64, size=40):
    """번호 동그라미"""
    c = box(ctx, s, x, y, d, d, fill='teal-soft', line=None, shape=MSO_SHAPE.OVAL)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    _font(ctx, r, size, True, 'teal')
    _end(p, size)


def chip(ctx, s, x, y, label, size=44, fill='teal-soft', color='teal', pad=18, lh=1.3, w=None):
    """알약 모양 이름표. 폭은 글에 맞춘다 (한 줄)."""
    tw = text_w(ctx, label, size, True) / FIT + 2 * pad
    w = w or tw
    h = size * lh + 12
    box(ctx, s, x, y, w, h, fill=fill, line=None, radius=h / 2)
    text(ctx, s, x, y + 6, w, size * lh, label, size, color, True, lh, align='c')
    return w, h


def credit_h(ctx, m, w):
    """그림 아래 출처 표시가 차지하는 높이 (위 여백 10 포함)"""
    return text_h(ctx, m['credit'], ctx.type['credit'], w, 1.3) + 10


def fit_box(m, w, h):
    """그림을 틀(w, h)에 원본 비율대로 넣었을 때의 크기"""
    k = min(w / m['width'], h / m['height'])
    return m['width'] * k, m['height'] * k


def picture(ctx, s, m, x, y, w, h, credit=True, valign='m'):
    """그림을 틀(x, y, w, h) 안에 원본 비율 그대로 넣는다 (자르지도 늘이지도 않는다). 출처 표시는 그림 바로 아래 가운데.
    valign='b' 는 그림과 출처 표시를 틀의 아래 끝에 붙인다 (견주기 장의 두 그림: 출처 표시가 같은 높이에 선다).
    사진(kind: photo)에는 --line 색의 가는 선(0.5pt, 무대 1px)을 두른다 (R26. 옅은 하늘이 바탕에 녹지 않게).
    돌려주는 값: 실제로 차지한 (y 시작, y 끝)"""
    ch = credit_h(ctx, m, w) if credit else 0
    bh = h - ch
    if min(w, bh) < ctx.pic['shortSide'] - 0.5:
        raise Overflow(f'그림 {m["id"]} 의 틀이 너무 작습니다 ({w:.0f} × {bh:.0f}px)')
    iw, ih = m['width'], m['height']
    k = min(w / iw, bh / ih)
    pw, ph = iw * k, ih * k
    px, py = x + (w - pw) / 2, (y + h - ch - ph) if valign == 'b' else y + (h - ch - ph) / 2
    # 폭과 높이를 원본 비율대로 계산해 함께 준다 (한쪽만 주면 python-pptx 가 반올림한 값으로 다시 셈한다)
    pic = s.shapes.add_picture(m['file'], E(px), E(py), E(pw), E(ph))
    pic._element.nvPicPr.cNvPr.set('descr', m['alt'])
    if m.get('kind') == 'photo':
        pic.line.color.rgb = ctx.c['line']
        pic.line.width = Pt(0.5)
    if credit:
        text(ctx, s, x, py + ph + 10, w, ch - 10, m['credit'], ctx.type['credit'], 'gray', lh=1.3, align='c')
    return py, py + ph + ch


# ───────────────────────── 장의 짜임 ─────────────────────────

def title(ctx, s, t, y=PAD_T, size=72, mb=48, width=CW):
    h = text_h(ctx, t, size, width, 1.25, True)
    text(ctx, s, PAD_X, y, width, h, t, size, 'navy', True, 1.25)
    return y + h + mb


def counter(ctx, s, label):
    """오른쪽 아래 장 번호. 두 차시 묶음은 "3차시 1 / 4" 처럼 차시마다 센다 (counter.ts)."""
    size = ctx.type['counter']
    text(ctx, s, W - 48 - 400, H - 36 - size, 400, size, label, size, 'gray', lh=1, align='r')


def draft_notice(ctx, s, notice):
    """공개하지 않은 차시: 왼쪽 아래에 초안 표시 (웹 무대의 .sl-draft 와 같은 자리)"""
    size = ctx.type['draft']
    text(ctx, s, PAD_X, H - 34 - size, 1400, size, notice, size, 'gray', lh=1)


def check(ctx, s, x, y, scale=1.0):
    """✓ 모양 (선 두 개)"""
    hline(ctx, s, x, y + 22 * scale, x + 12 * scale, y + 34 * scale, 'teal', 7)
    hline(ctx, s, x + 12 * scale, y + 34 * scale, x + 34 * scale, y + 6 * scale, 'teal', 7)


def lay_cover(ctx, s, sl, L):
    T = ctx.type
    foot_top = BOTTOM
    if sl['first']:
        meta, notice = L['cover']['meta'], L['cover']['notice']
        mh = text_h(ctx, meta, T['meta'], CW, 1.4)
        nh = text_h(ctx, notice, T['meta'], CW, 1.4)
        foot_top = BOTTOM - (28 + mh + 8 + nh)
        hline(ctx, s, PAD_X, foot_top, W - PAD_X, foot_top)
        text(ctx, s, PAD_X, foot_top + 28, CW, mh, meta, T['meta'], 'navy')
        text(ctx, s, PAD_X, foot_top + 28 + mh + 8, CW, nh, notice, T['meta'], 'gray')
    kh = T['label'] * 1.3
    th = text_h(ctx, sl['title'], T['cover'], CW, 1.2, True)
    sh = text_h(ctx, sl['subtitle'], T['coverSub'], CW, 1.35) if sl.get('subtitle') else 0
    total = 10 + 40 + kh + 24 + th + (32 + sh if sh else 0)
    y = PAD_T + (foot_top - PAD_T - total) / 2
    if y < PAD_T:
        raise Overflow('표지')
    box(ctx, s, PAD_X, y, 120, 10, fill='teal', line=None, radius=5)
    y += 50
    text(ctx, s, PAD_X, y, CW, kh, sl['kicker'], T['label'], 'teal', True, 1.3)
    y += kh + 24
    text(ctx, s, PAD_X, y, CW, th, sl['title'], T['cover'], 'navy', True, 1.2)
    if sh:
        text(ctx, s, PAD_X, y + th + 32, CW, sh, sl['subtitle'], T['coverSub'], 'gray', lh=1.35)


def side_plan(ctx, kind, measure, area_h):
    """글 곁에 그림을 두는 장 (R12): [그림 칸 폭, 글 크기] 후보를 웹 무대와 같은 차례로 해 보고 처음 들어가는 것을 고른다.
    measure(글 칸 폭, 글 크기) -> (글 덩어리 높이, 글 한 덩이의 가장 많은 줄 수).
    먼저 글 한 덩이가 maxLines 줄을 넘지 않는 짜임을 (가장 좁은 그림 칸은 빼고) 찾고, 없으면 줄 수를 보지 않고 (가장 넓은 칸은 빼고) 찾는다."""
    S = ctx.side
    cands = S['candidates'][kind]
    narrow = min(p for p, _ in cands)
    wide = max(p for p, _ in cands)
    for strict in (True, False):
        for pic, size in cands:
            # 줄 수를 지키려고 가장 좁은 칸까지 가지 않고, 가장 넓은 칸은 줄 수를 지킬 때만 쓴다 (웹 무대와 같다)
            if (pic <= narrow) if strict else (pic >= wide):
                continue
            h, lines = measure(CW - S['gap'] - pic, size)
            # 가장 넓은 칸은 글 한 덩이가 maxLines 보다 한 줄 적게 들어갈 때만 쓴다
            limit = S['maxLines'][kind] - (1 if pic >= wide else 0)
            if h <= area_h + 1 and (not strict or lines <= limit):
                return pic, size
    raise Overflow(f'{kind} 장의 글이 그림 곁에 들어가지 않습니다')


def side_place(ctx, s, media, pic, size, top, area_h, measure):
    """그림을 오른쪽 칸에 크게 그리고, 글 덩어리를 그릴 (x, y, 폭) 을 돌려준다.
    그림이 칸의 높이에 걸려 칸보다 좁게 그려지면 그림 칸을 그림 폭까지 좁힌다 (가장 좁은 후보 아래로는 줄이지 않는다).
    글이 그림보다 높으면 위 끝을 맞추고 둘을 한 덩어리로 위아래 가운데에, 아니면 둘의 가운데 높이를 맞춘다 (웹 무대와 같다)."""
    S = ctx.side
    narrow = min(p for k in S['candidates'] for p, _ in S['candidates'][k])
    ch = credit_h(ctx, media, pic)
    k = min(pic / media['width'], (area_h - ch) / media['height'])
    pw, ph = media['width'] * k, media['height'] * k
    if pw < pic - 1:
        pic = max(narrow, pw)
        ch = credit_h(ctx, media, pic)
    tw = CW - S['gap'] - pic
    th, _ = measure(tw, size)
    px = W - PAD_X - pic
    if th > ph + 1:
        group = max(th, ph + ch)
        y0 = top + (area_h - group) / 2
        picture(ctx, s, media, px, y0, pic, ph + ch)
        return PAD_X, y0, tw
    picture(ctx, s, media, px, top, pic, area_h)
    return PAD_X, top + (area_h - th) / 2, tw


def question_measure(ctx, sl):
    T = ctx.type

    def measure(tw, size):
        kh = T['label'] * 1.3 + 24 if sl.get('kicker') else 0
        lines = len(wrap(ctx, sl['title'], size, tw, True))
        h = kh + lines * size * 1.3
        if sl.get('hint'):
            hw = min(tw, text_w(ctx, sl['hint'], T['body']) / FIT + 64)
            h += 48 + text_h(ctx, sl['hint'], T['body'], hw - 64, 1.35) + 40
        return h, lines
    return measure


def lay_question(ctx, s, sl, L):
    T = ctx.type
    media = sl.get('media')
    measure = question_measure(ctx, sl)
    if media:
        area = BOTTOM - PAD_T
        pic, size = side_plan(ctx, 'question', measure, area)
        x, y, tw = side_place(ctx, s, media, pic, size, PAD_T, area, measure)
    else:
        size, tw = T['question'], CW
        total, _ = measure(tw, size)
        x, y = PAD_X, PAD_T + (BOTTOM - PAD_T - total) / 2
    if y < PAD_T - 1:
        raise Overflow('질문 장')
    if sl.get('kicker'):
        text(ctx, s, x, y, tw, T['label'] * 1.3, sl['kicker'], T['label'], 'coral', True, 1.3)
        y += T['label'] * 1.3 + 24
    th = text_h(ctx, sl['title'], size, tw, 1.3, True)
    text(ctx, s, x, y, tw, th, sl['title'], size, 'navy', True, 1.3)
    y += th
    hint = sl.get('hint')
    if hint:
        hw = min(tw, text_w(ctx, hint, T['body']) / FIT + 64)
        hh = text_h(ctx, hint, T['body'], hw - 64, 1.35) + 40
        y += 48
        box(ctx, s, x, y, hw, hh, fill='teal-soft', line=None, radius=16)
        text(ctx, s, x + 32, y + 20, hw - 64, hh - 40, hint, T['body'], 'navy', lh=1.35)


def lay_picture(ctx, s, sl, L):
    T = ctx.type
    y = title(ctx, s, sl['title'], mb=32)
    bottom = BOTTOM
    if sl.get('caption'):
        ch = text_h(ctx, sl['caption'], T['body'], CW, 1.3)
        bottom -= ch + 16
        text(ctx, s, PAD_X, bottom + 16, CW, ch, sl['caption'], T['body'], 'navy', lh=1.3, align='c')
    picture(ctx, s, sl['media'], PAD_X, y, CW, bottom - y)


def numbered_h(ctx, items, w, size, lh, gap):
    return sum(max(text_h(ctx, t, size, w - 92, lh), 64) for t in items) + gap * (len(items) - 1)


def numbered(ctx, s, items, x, y, w, size, lh, gap, bottom):
    """번호를 붙인 목록. 넘치면 Overflow"""
    for i, t in enumerate(items):
        th = text_h(ctx, t, size, w - 92, lh)
        num(ctx, s, x, y + 1 + (size * lh - 64) / 2 if size * lh > 64 else y + 1, i + 1)
        text(ctx, s, x + 92, y, w - 92, th, t, size, 'navy', lh=lh)
        y += max(th, 64) + gap
    if y - gap > bottom + 1:
        raise Overflow('목록')
    return y - gap


def lay_points(ctx, s, sl, L):
    media = sl.get('media')
    y = title(ctx, s, sl['title'])
    if media:
        # 제목 아래를 두 칸으로: 항목은 왼쪽, 그림은 오른쪽 (R12, 웹 무대의 .sl-side 와 같은 규칙)
        def measure(tw, size):
            h = numbered_h(ctx, sl['points'], tw, size, 1.4, 32)
            return h, max(len(wrap(ctx, t, size, tw - 92)) for t in sl['points'])
        pic, size = side_plan(ctx, 'points', measure, BOTTOM - y)
        x, ty, tw = side_place(ctx, s, media, pic, size, y, BOTTOM - y, measure)
        numbered(ctx, s, sl['points'], x, ty, tw, size, 1.4, 32, BOTTOM)
        return
    # 그림이 없으면 크게 쓰고(넘치면 줄이고) 제목 아래 남은 자리의 위아래 가운데에 둔다
    for size in ctx.fit['points']:
        h = numbered_h(ctx, sl['points'], CW, size, 1.4, 48)
        if y + h <= BOTTOM + 1:
            break
    numbered(ctx, s, sl['points'], PAD_X, y + max(0, (BOTTOM - y - h) / 2), CW, size, 1.4, 48, BOTTOM)


def bullets(ctx, s, items, x, y, w, size=44, lh=1.32, gap=12):
    for t in items:
        th = text_h(ctx, t, size, w - 36, lh)
        box(ctx, s, x, y + size * lh / 2 - 7, 14, 14, fill='teal', line=None, shape=MSO_SHAPE.OVAL)
        text(ctx, s, x + 36, y, w - 36, th, t, size, 'navy', lh=lh)
        y += th + gap
    return y - gap


def bullets_h(ctx, items, w, size=44, lh=1.32, gap=12):
    return sum(text_h(ctx, t, size, w - 36, lh) for t in items) + gap * (len(items) - 1)


def card(ctx, s, x, y, w, side, size, h=None):
    """이름표와 점 목록이 든 견주기 상자 하나 (그림 없음). 돌려주는 값: 상자 높이"""
    lab = 44 * 1.3
    iw = w - 72
    h = h or 24 + lab + 16 + bullets_h(ctx, side['points'], iw, size) + 24
    box(ctx, s, x, y, w, h, fill='card', line='line', radius=20)
    text(ctx, s, x + 36, y + 24, iw, lab, side['label'], 44, 'teal', True, 1.3)
    bullets(ctx, s, side['points'], x + 36, y + 24 + lab + 16, iw, size)
    return h


def lay_compare(ctx, s, sl, L):
    y = title(ctx, s, sl['title'])
    sides = (sl['left'], sl['right'])
    lab = 44 * 1.3
    shared = sl.get('media')
    if shared:
        # 함께 보는 그림 하나 (R23a): 글 곁에 그림 하나를 두는 두 칸 짜임. 왼쪽에 두 상자를 위아래로 쌓고, 오른쪽에 그림 (웹 무대와 같다)
        def stack(tw, size):
            hs = [24 + lab + 16 + bullets_h(ctx, sd['points'], tw - 72, size) + 24 for sd in sides]
            return hs, sum(hs) + 32

        def measure(tw, size):
            lines = max(len(wrap(ctx, t, size, tw - 72 - 36)) for sd in sides for t in sd['points'])
            return stack(tw, size)[1], lines
        pic, size = side_plan(ctx, 'compare', measure, BOTTOM - y)
        x, ty, tw = side_place(ctx, s, shared, pic, size, y, BOTTOM - y, measure)
        hs, _ = stack(tw, size)
        for sd, h in zip(sides, hs):
            card(ctx, s, x, ty, tw, sd, size, h)
            ty += h + 32
        return
    cw = (CW - 48) / 2
    any_media = sl['left'].get('media') or sl['right'].get('media')
    iw = cw - 72
    iy0 = y + 24 + lab + 16
    if any_media:
        # 쪽마다 그림 하나 (R23b): 두 상자의 그림 상자 높이를 같게 하고, 그림과 출처 표시를 상자 아래 끝에 붙인다.
        # 항목은 두 쪽 가운데 긴 쪽의 높이만큼 자리를 잡고 같은 높이에서 시작한다. 그래서 출처 표시와 첫 항목이 두 쪽에서 같은 높이에 선다.
        # 그림 틀이 compareMin 보다 낮아지지 않게 항목 글을 먼저 줄인다 (STAGE_FIT.compareMedia)
        def bh(size):
            return max(bullets_h(ctx, sd['points'], iw, size) for sd in sides)

        def frame(size):
            return min((BOTTOM - 24 - bh(size)) - 16 - iy0 - credit_h(ctx, sd['media'], iw) for sd in sides if sd.get('media'))
        sizes = ctx.fit['compareMedia']
        size = next((z for z in sizes if frame(z) >= ctx.pic['compareMin'] - 0.5), sizes[-1])
        top, bottom = y, BOTTOM
    else:
        # 그림이 없으면 카드는 글 높이만큼 (두 카드는 같은 높이), 크게 쓰고 넘치면 줄이고, 남은 자리의 위아래 가운데에 둔다
        def height(size):
            return 24 + lab + 16 + max(bullets_h(ctx, sd['points'], iw, size) for sd in sides) + 24
        sizes = ctx.fit['compare']
        size = next((z for z in sizes if y + height(z) <= BOTTOM + 1), sizes[-1])
        top = y + max(0, (BOTTOM - y - height(size)) / 2)
        bottom = top + height(size)
        if bottom > BOTTOM + 1:
            raise Overflow('견주기')
    for i, side in enumerate(sides):
        x = PAD_X + i * (cw + 48)
        box(ctx, s, x, top, cw, bottom - top, fill='card', line='line', radius=20)
        ix, iy = x + 36, top + 24
        text(ctx, s, ix, iy, iw, lab, side['label'], 44, 'teal', True, 1.3)
        iy += lab + 16
        if any_media:
            by = BOTTOM - 24 - bh(size)
            if side.get('media'):
                picture(ctx, s, side['media'], ix, iy, iw, by - 16 - iy, valign='b')
            bullets(ctx, s, side['points'], ix, by, iw, size)
        else:
            bullets(ctx, s, side['points'], ix, iy, iw, size)


def steps_row(ctx, sl, y, size, shared):
    """그림 있는 단계를 한 줄로 늘어놓은 자리. 넘치거나 그림 틀이 너무 작으면 Overflow.
    돌려주는 값: 칸마다 (x, 칸 폭, 그림 틀, 글 y, 위 선 y) 와 가장 작게 그려지는 그림의 넓이.
    그림이 모두 칸의 폭에 걸려 틀보다 낮게 그려지면 그림 줄을 그림 높이로 줄이고 단계 전체를 위아래 가운데에 둔다
    (틀의 짧은 변은 shortSide 아래로 줄이지 않는다. 웹 무대의 tightenRow 와 같다)."""
    steps = sl['steps']
    n = len(steps)
    cw = (CW - 32 * (n - 1)) / n
    bottom = BOTTOM - (shared_credit_h(ctx, shared) if shared else 0)
    chh = 44 * 1.3 + 12
    # 글의 첫 줄을 모든 칸에서 같은 높이에 둔다 (웹의 subgrid 와 같다)
    ty = bottom - max(text_h(ctx, st['text'], size, cw, 1.35) for st in steps)
    top = y + 30 + chh + 20
    cells, low, need = [], float('inf'), 0
    fh = ty - 20 - top
    for i, st in enumerate(steps):
        m = st.get('media')
        if m:
            cr = 0 if shared else credit_h(ctx, m, cw)
            ph = fh - cr
            if min(cw, ph) < ctx.pic['shortSide'] - 0.5:
                raise Overflow('단계')
            pw, pph = fit_box(m, cw, ph)
            low = min(low, pw * pph)
            need = max(need, max(pph, ctx.pic['shortSide'] + 1) + cr)
        elif fh < 0:
            raise Overflow('단계')
    off = 0
    if all(st.get('media') for st in steps) and need < fh - 2:
        off = (fh - need) / 2
        fh = need
    for i, st in enumerate(steps):
        x = PAD_X + i * (cw + 32)
        cells.append((x, cw, (x, top + off, cw, fh), ty - off, y + off))
    return cells, low


def steps_grid(ctx, sl, y, size, shared, limit):
    """그림 넷을 2 × 2 로 놓은 자리 (R22). 칸마다 위에 머리(단계 표와 단계 글, 같은 크기), 그 아래에 칸 폭 전체를 쓰는 그림 상자.
    웹 무대의 data-arrange="grid" 와 같은 치수. 머리 글이 limit 줄을 넘거나 그림 상자의 짧은 변이 shortSide 보다 작으면 Overflow.
    돌려주는 값: 칸마다 (x, 칸 y, 칸 폭, 표 폭, 글 폭, 그림 상자 y, 그림 상자 높이)"""
    bottom = BOTTOM - (shared_credit_h(ctx, shared) if shared else 0)
    cw = (CW - 48) / 2
    ch = (bottom - y - 32) / 2
    cells = []
    for i, st in enumerate(sl['steps']):
        x = PAD_X + (i % 2) * (cw + 48)
        cy = y + (i // 2) * (ch + 32)
        chw = text_w(ctx, st['label'], size, True) / FIT + 36
        tw = cw - chw - 20
        lines = len(wrap(ctx, st['text'], size, tw))
        if lines > limit:
            raise Overflow('단계')
        head = max(size * 1.3 + 12, 6 + lines * size * 1.35)
        by = cy + 6 + 16 + head + 16
        bh = cy + ch - by
        m = st['media']
        if min(cw, bh - (0 if shared else credit_h(ctx, m, cw))) < ctx.pic['shortSide'] - 0.5:
            raise Overflow('단계')
        cells.append((x, cy, cw, chw, tw, by, bh))
    return cells, 0


def shared_credit_h(ctx, credit):
    return 16 + text_h(ctx, credit, ctx.type['credit'], CW, 1.3)


def lay_steps(ctx, s, sl, L):
    T = ctx.type
    y = title(ctx, s, sl['title'])
    steps = sl['steps']
    pictured = [st['media'] for st in steps if st.get('media')]
    if pictured:
        # 단계 그림의 출처 표시가 모두 같으면 목록 아래에 한 번만 찍는다
        credits = {m['credit'] for m in pictured}
        shared = pictured[0]['credit'] if len(pictured) > 1 and len(credits) == 1 else None

        def first_fit(plan, *extra):
            for size in ctx.fit['stepsMedia']:
                try:
                    return (size,) + plan(ctx, sl, y, size, shared, *extra)
                except Overflow:
                    continue
            return None
        # 그림이 넷이면 2 × 2 (R22, 웹 무대와 같은 규칙): 네 머리가 모두 한 줄에 들어가는 가장 큰 글 크기를 먼저 찾고,
        # 없으면 maxLines 줄까지 받는다. 어느 것도 안 되는 아주 긴 글은 한 줄(4칸)로 놓는다.
        grid = None
        if len(steps) == 4 and len(pictured) == 4:
            for limit in (1, ctx.steps['maxLines']):
                for size in ctx.steps['gridFit']:
                    try:
                        grid = (size,) + steps_grid(ctx, sl, y, size, shared, limit)
                        break
                    except Overflow:
                        continue
                if grid:
                    break
        row = None if grid else first_fit(steps_row)
        if grid:
            size, cells, _ = grid
            for st, (x, cy, cw, chw, tw, by, bh) in zip(steps, cells):
                box(ctx, s, x, cy, cw, 6, fill='teal', line=None, radius=0, shape=MSO_SHAPE.RECTANGLE)
                chip(ctx, s, x, cy + 22, st['label'], size=size)
                th = text_h(ctx, st['text'], size, tw, 1.35)
                text(ctx, s, x + chw + 20, cy + 22 + 6, tw, th, st['text'], size, 'navy', lh=1.35)
                picture(ctx, s, st['media'], x, by, cw, bh, credit=not shared)
        elif row:
            size, cells, _ = row
            for st, (x, cw, (fx, fy, fw, fh), ty, ry) in zip(steps, cells):
                box(ctx, s, x, ry, cw, 6, fill='teal', line=None, radius=0, shape=MSO_SHAPE.RECTANGLE)
                chip(ctx, s, x, ry + 30, st['label'])
                th = text_h(ctx, st['text'], size, cw, 1.35)
                text(ctx, s, x, ty, cw, th, st['text'], size, 'navy', lh=1.35)
                if st.get('media'):
                    picture(ctx, s, st['media'], fx, fy, fw, fh, credit=not shared)
        else:
            raise Overflow('단계')
        if shared:
            sh = shared_credit_h(ctx, shared) - 16
            text(ctx, s, PAD_X, BOTTOM - sh, CW, sh, shared, T['credit'], 'gray', lh=1.3, align='r')
    else:
        # 이름표 칸의 폭은 가장 긴 이름표에 맞춘다 (웹의 subgrid 와 같다)
        cw = max(text_w(ctx, st['label'], 44, True) / FIT + 36 for st in steps)
        tx = PAD_X + cw + 32
        for i, st in enumerate(steps):
            th = text_h(ctx, st['text'], T['body'], W - PAD_X - tx, 1.35)
            chip(ctx, s, PAD_X, y, st['label'], w=cw)
            text(ctx, s, tx, y + 6, W - PAD_X - tx, th, st['text'], T['body'], 'navy', lh=1.35)
            rh = max(th + 6, 44 * 1.3 + 12)
            y += rh
            if i < len(steps) - 1:
                hline(ctx, s, PAD_X, y + 24, W - PAD_X, y + 24)
                y += 48
        if y > BOTTOM + 1:
            raise Overflow('단계')


def lay_term(ctx, s, sl, L):
    T = ctx.type
    mw = 1500
    kh = T['label'] * 1.3 + 24
    th = text_h(ctx, sl['term'], T['term'], CW, 1.15, True)
    mh = text_h(ctx, sl['meaning'], T['meaning'], mw, 1.4)
    ex = sl.get('example')
    eh = (T['label'] * 1.3 + 8 + text_h(ctx, ex, T['body'], mw - 80, 1.4) + 56) if ex else 0
    # 쓰임 예 상자는 글상자 하나에 바탕을 칠하고 글에 맞춰 늘어나게 한다 (다른 글꼴로 열어 줄이 늘어도 글이 상자 밖으로 나가지 않는다)
    total = kh + th + 40 + mh + (56 + eh if ex else 0)
    y = PAD_T + (BOTTOM - PAD_T - total) / 2
    if y < PAD_T:
        raise Overflow('낱말 장')
    text(ctx, s, PAD_X, y, CW, T['label'] * 1.3, ctx.copy['slide']['term'], T['label'], 'teal', True, 1.3)
    y += kh
    text(ctx, s, PAD_X, y, CW, th, sl['term'], T['term'], 'navy', True, 1.15)
    y += th + 40
    text(ctx, s, PAD_X, y, mw, mh, sl['meaning'], T['meaning'], 'navy', lh=1.4)
    y += mh
    if ex:
        y += 56
        filled_text(ctx, s, PAD_X, y, mw, eh, 40, 28, [
            (ctx.copy['slide']['example'], T['label'], 'teal', True, 1.3, 0),
            (ex, T['body'], 'navy', False, 1.4, 8),
        ])


def lay_passage(ctx, s, sl, L):
    T = ctx.type
    p = sl['passage']
    y = title(ctx, s, p['title'], mb=36)
    hs = [text_h(ctx, t, T['body'], CW, 1.5) for t in p['text']]
    th = sum(hs) + 20 * (len(hs) - 1)
    text(ctx, s, PAD_X, y, CW, th, p['text'], T['body'], 'navy', lh=1.5, gap=20)
    y += th + 20
    sh = text_h(ctx, p['source'], T['meta'], CW, 1.3)
    text(ctx, s, PAD_X, y, CW, sh, p['source'], T['meta'], 'gray', lh=1.3)
    if y + sh > BOTTOM + 1:
        raise Overflow('읽기 자료')


def lay_activity(ctx, s, sl, L):
    T = ctx.type
    y = title(ctx, s, sl['title'])
    aside = sl.get('minutes') is not None or sl.get('materials')
    lw = CW - 64 - 540 if aside else CW
    ah = activity_aside_h(ctx, sl) if aside else 0
    # 할 일은 크게 쓰고 넘치면 줄인다 (STAGE_FIT.activity). 목록과 상자를 한 덩어리로 남은 자리의 위아래 가운데에 둔다.
    for size in ctx.fit['activity']:
        lh_ = numbered_h(ctx, sl['instructions'], lw, size, 1.35, 20)
        if y + max(lh_, ah) <= BOTTOM + 1:
            break
    y += max(0, (BOTTOM - y - max(lh_, ah)) / 2)
    numbered(ctx, s, sl['instructions'], PAD_X, y, lw, size, 1.35, 20, BOTTOM)
    if aside:
        ax, aw = W - PAD_X - 540, 540
        iw = aw - 80
        lab = T['label'] * 1.3
        parts = []
        if sl.get('minutes') is not None:
            parts.append(('min', lab + 8 + 72 * 1.15))
        if sl.get('materials'):
            mh = sum(text_h(ctx, m, T['body'], iw - 36, 1.3) for m in sl['materials']) + 8 * (len(sl['materials']) - 1)
            parts.append(('mat', lab + 8 + mh))
        ah = 64 + sum(h for _, h in parts) + 32 * (len(parts) - 1)
        if y + ah > BOTTOM + 1:
            raise Overflow('활동 장')
        box(ctx, s, ax, y, aw, ah, fill='paper', line=None, radius=20)
        iy = y + 32
        for kind, h in parts:
            if kind == 'min':
                text(ctx, s, ax + 40, iy, iw, lab, ctx.copy['slide']['minutes'], T['label'], 'teal', True, 1.3)
                text(ctx, s, ax + 40, iy + lab + 8, iw, 72 * 1.15, f"{sl['minutes']}{ctx.copy['slide']['minuteUnit']}", 72, 'navy', True, 1.15)
            else:
                text(ctx, s, ax + 40, iy, iw, lab, ctx.copy['slide']['materials'], T['label'], 'teal', True, 1.3)
                my = iy + lab + 8
                # 상자 안의 목록은 점을 머리표로 쓴다 (R27, 웹 무대의 .sl-materials 와 같다)
                for m in sl['materials']:
                    mh = text_h(ctx, m, T['body'], iw - 36, 1.3)
                    box(ctx, s, ax + 40, my + T['body'] * 1.3 / 2 - 7, 14, 14, fill='teal', line=None, shape=MSO_SHAPE.OVAL)
                    text(ctx, s, ax + 40 + 36, my, iw - 36, mh, m, T['body'], 'navy', lh=1.3)
                    my += mh + 8
            iy += h + 32


def activity_aside_h(ctx, sl):
    T = ctx.type
    iw = 540 - 80
    lab = T['label'] * 1.3
    hs = []
    if sl.get('minutes') is not None:
        hs.append(lab + 8 + 72 * 1.15)
    if sl.get('materials'):
        hs.append(lab + 8 + sum(text_h(ctx, m, T['body'], iw - 36, 1.3) for m in sl['materials']) + 8 * (len(sl['materials']) - 1))
    return 64 + sum(hs) + 32 * (len(hs) - 1)


def lay_quiz(ctx, s, sl, L):
    """PPTX 에서는 정답을 화면에 드러내지 않고 메모란에 적는다 (docs/CONTRACT.md 8절)."""
    T = ctx.type
    q = sl['quiz']
    y = PAD_T
    lab = T['label'] * 1.3
    text(ctx, s, PAD_X, y, CW, lab, ctx.copy['slide']['quiz'], T['label'], 'teal', True, 1.3)
    y += lab + 24
    qh = text_h(ctx, q['q'], 72, CW, 1.3, True)
    text(ctx, s, PAD_X, y, CW, qh, q['q'], 72, 'navy', True, 1.3)
    y += qh + 48
    if q['type'] == 'choice':
        cols = 1 if len(q['choices']) == 3 else 2
        cw = (CW - 24 * (cols - 1)) / cols
        tw = cw - 64 - 64 - 24 - 8
        rows = [q['choices'][i:i + cols] for i in range(0, len(q['choices']), cols)]
        n = 0
        for row in rows:
            rh = max(max(text_h(ctx, c, T['body'], tw, 1.35), 64) for c in row) + 48
            for j, c in enumerate(row):
                x = PAD_X + j * (cw + 24)
                box(ctx, s, x, y, cw, rh, fill='card', line='line', radius=20, lw=3)
                th = text_h(ctx, c, T['body'], tw, 1.35)
                num(ctx, s, x + 32, y + (rh - 64) / 2, n + 1)
                text(ctx, s, x + 32 + 64 + 24, y + (rh - th) / 2, tw, th, c, T['body'], 'navy', lh=1.35)
                n += 1
            y += rh + 24
        if y - 24 > BOTTOM + 1:
            raise Overflow('퀴즈 장')
    elif q['type'] == 'ox':
        cw, chh = 420, 340
        x0 = PAD_X + (CW - 2 * cw - 64) / 2
        if y + chh > BOTTOM + 1:
            raise Overflow('퀴즈 장')
        for j, g in enumerate((ctx.copy['slide']['ox']['yes'], ctx.copy['slide']['ox']['no'])):
            x = x0 + j * (cw + 64)
            box(ctx, s, x, y, cw, chh, fill='card', line='line', radius=20, lw=3)
            text(ctx, s, x, y, cw, chh, g, 200, 'navy', True, 1.0, align='c', anchor='m')
    else:
        lw = text_w(ctx, ctx.copy['slide']['shortAnswer'], T['label'], True) / FIT
        text(ctx, s, PAD_X, y + 110 - 14 - lab, lw, lab, ctx.copy['slide']['shortAnswer'], T['label'], 'teal', True, 1.3)
        hline(ctx, s, PAD_X + lw + 32, y + 110, PAD_X + lw + 32 + 900, y + 110, 'navy', 4)
        if y + 110 > BOTTOM + 1:
            raise Overflow('퀴즈 장')


def lay_closing(ctx, s, sl, L):
    pts = sl.get('points') or []
    if not pts:
        mw = 1500
        th = text_h(ctx, sl['title'], 96, mw, 1.3, True)
        y = PAD_T + (BOTTOM - PAD_T - (th + 58)) / 2
        text(ctx, s, (W - mw) / 2, y, mw, th, sl['title'], 96, 'navy', True, 1.3, align='c')
        box(ctx, s, (W - 120) / 2, y + th + 48, 120, 10, fill='teal', line=None, radius=5)
        return
    th = text_h(ctx, sl['title'], 80, CW, 1.3, True)
    hs = [text_h(ctx, p, 48, CW - 72, 1.35) for p in pts]
    total = th + 56 + sum(hs) + 28 * (len(hs) - 1)
    y = PAD_T + (BOTTOM - PAD_T - total) / 2
    if y < PAD_T - 1:
        raise Overflow('마무리 장')
    text(ctx, s, PAD_X, y, CW, th, sl['title'], 80, 'navy', True, 1.3)
    y += th + 56
    for p, h in zip(pts, hs):
        check(ctx, s, PAD_X + 6, y + 8)
        text(ctx, s, PAD_X + 72, y, CW - 72, h, p, 48, 'navy', lh=1.35)
        y += h + 28


LAYOUTS = {
    'title': lay_cover, 'question': lay_question, 'picture': lay_picture, 'points': lay_points, 'compare': lay_compare,
    'steps': lay_steps, 'term': lay_term, 'passage': lay_passage, 'activity': lay_activity, 'quiz': lay_quiz, 'closing': lay_closing,
}


CREDIT = {'size': 28, 'url': 24, 'lh': 1.4, 'gap': 20}


def credit_pages(ctx, cr):
    """출처 목록을 장으로 나눈다. 한 장을 그 장의 실제 자리만큼 채운 뒤에 다음 장을 연다 (docs/CONTRACT.md 8절).
    돌려주는 값: [(제목, 장의 글 높이, [(줄 목록, 높이), ...]), ...]"""
    size, url, lh, gap = CREDIT['size'], CREDIT['url'], CREDIT['lh'], CREDIT['gap']
    fh = text_h(ctx, cr['footer'], 24, CW, 1.4)
    limit = BOTTOM - fh - 32
    items = [[it['text']] + [u for u in (it.get('sourceUrl'), it.get('licenceUrl')) if u] for it in cr['items']] or [[cr['empty']]]
    measured = [(it, sum(text_h(ctx, t, size if i == 0 else url, CW, lh) for i, t in enumerate(it))) for it in items]

    def heading(k, n):
        return cr['heading'] + (' ' + cr['more'].replace('{n}', str(k)).replace('{total}', str(n)) if n > 1 else '')

    def split(top_of):
        pages, cur = [], []
        y = top_of(0)
        for it, h in measured:
            if cur and y + h > limit:
                pages.append(cur)
                cur, y = [], top_of(len(pages))
            cur.append((it, h))
            y += h + gap
        pages.append(cur)
        return pages
    # 제목의 높이는 장 수("(1/2)")에 따라 달라질 수 있으므로, 장 수가 바뀌지 않을 때까지 다시 나눈다
    n = 1
    for _ in range(4):
        pages = split(lambda k: PAD_T + text_h(ctx, heading(k + 1, n), 72, CW, 1.25, True) + 48)
        if len(pages) == n:
            break
        n = len(pages)
    for k, page in enumerate(pages):
        top = PAD_T + text_h(ctx, heading(k + 1, len(pages)), 72, CW, 1.25, True) + 48
        used = sum(h for _, h in page) + gap * (len(page) - 1)
        if top + used > limit + 1 and len(page) > 1:
            raise Overflow('그림 출처')
    return [(heading(k + 1, len(pages)), page) for k, page in enumerate(pages)], fh


def credit_slides(ctx, prs, L):
    """마지막 장: 수업 화면에 실린 그림의 출처(creditList)와 sheetFooter. 길면 앞 장을 채운 뒤 다음 장을 연다."""
    cr = L['credits']
    size, url, lh, gap = CREDIT['size'], CREDIT['url'], CREDIT['lh'], CREDIT['gap']
    pages, fh = credit_pages(ctx, cr)
    foot = cr['footer']
    for head, page in pages:
        s = new_slide(ctx, prs)
        y = title(ctx, s, head)
        for it, _ in page:
            for i, t in enumerate(it):
                z = size if i == 0 else url
                th = text_h(ctx, t, z, CW, lh)
                text(ctx, s, PAD_X, y, CW, th, t, z, 'navy' if i == 0 else 'gray', lh=lh)
                y += th
            y += gap
        hline(ctx, s, PAD_X, BOTTOM - fh - 16, W - PAD_X, BOTTOM - fh - 16)
        text(ctx, s, PAD_X, BOTTOM - fh, CW, fh, foot, 24, 'gray', lh=1.4)
    return len(pages)


def notes(s, lines):
    """메모란: 줄마다 문단 하나. 글 조각에 언어(ko-KR)를 적는다 (메모란도 맞춤법 검사를 받는다)."""
    tf = s.notes_slide.notes_text_frame
    tf.text = ''
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = line
        rpr = r._r.get_or_add_rPr()
        rpr.set('lang', LANG)
        rpr.set('altLang', ALT_LANG)
        _end(p)
    if not lines:
        _end(tf.paragraphs[0])


def new_slide(ctx, prs):
    layout = next((l for l in prs.slide_layouts if l.name.strip().lower() == 'blank'), prs.slide_layouts[6])
    s = prs.slides.add_slide(layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    f = s.background.fill
    f.solid()
    f.fore_color.rgb = ctx.c['bg']
    return s


def properties(prs, doc):
    """파일 정보(core.xml). python-pptx 틀에 든 남의 이름·날짜·설명을 지우고 이 자료의 것으로 채운다."""
    cp = prs.core_properties
    when = datetime.datetime.strptime(doc['date'], '%Y-%m-%dT%H:%M:%SZ')
    cp.title = doc['title']
    cp.author = doc['author']
    cp.last_modified_by = doc['author']
    cp.comments = ''
    cp.subject = ''
    cp.category = ''
    cp.keywords = doc['keywords']
    cp.created = when
    cp.modified = when
    cp.revision = 1


def build(ctx, L):
    prs = Presentation()
    prs.slide_width, prs.slide_height = E(W), E(H)
    properties(prs, L['doc'])
    for sl in L['slides']:
        s = new_slide(ctx, prs)
        try:
            LAYOUTS[sl['layout']](ctx, s, sl, L)
        except Overflow as e:
            raise SystemExit(f'{L["id"]} 의 {sl["no"]}번 장({sl["layout"]})이 PPTX 한 장을 넘칩니다: {e}. 글을 줄입니다')
        if L.get('draft') and sl['no'] != 1:
            draft_notice(ctx, s, L['draft'])
        counter(ctx, s, sl['counter'])
        notes(s, sl['notes'])
    try:
        credit_slides(ctx, prs, L)
    except Overflow as e:
        raise SystemExit(f'{L["id"]} 의 그림 출처 장을 그리지 못했습니다: {e}')
    os.makedirs(os.path.dirname(L['pptx']), exist_ok=True)
    raw = L['pptx'] + '.raw'
    prs.save(raw)
    embed_fonts(raw, L['pptx'], ctx.face, {'regular': ctx.reg, 'bold': ctx.bold})
    os.remove(raw)


def main():
    data = json.load(open(sys.argv[1], encoding='utf-8'))
    ctx = Ctx(data)
    want = set(sys.argv[2:])
    for L in data['lessons']:
        if L['id'] not in want:
            continue
        for sl in L['slides']:
            for m in media_of(sl):
                with Image.open(m['file']) as im:
                    m['width'], m['height'] = im.size
        build(ctx, L)
        print(f'PPTX {L["id"]} → {L["pptx"]}')


def media_of(sl):
    out = [sl.get('media')]
    if sl['layout'] == 'compare':
        out += [sl['left'].get('media'), sl['right'].get('media')]
    if sl['layout'] == 'steps':
        out += [st.get('media') for st in sl['steps']]
    return [m for m in out if m]


if __name__ == '__main__':
    main()
