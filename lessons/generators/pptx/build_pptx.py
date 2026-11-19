"""수업 화면 PPTX 를 만든다 (python-pptx).

사용: python build_pptx.py <lessons.json> <차시 id> [<차시 id> ...]
lessons.json 은 generators/pptx/build.mjs 가 검증을 마친 명세에서 내보낸 것이다 (README.md). 이 파일은 그것만 읽는다.
문구·색·글꼴 경로는 모두 lessons.json 에 실려 온다. 여기에 문구나 색을 다시 적지 않는다.

치수는 웹 무대와 같은 1920 × 1080 px 로 셈한다. 13.333in = 1920px 이므로 1px = 6350 EMU = 0.5pt 다.
웹 무대(src/components/slides/stage.css)와 같은 자리에 같은 크기로 놓아서 화면과 PPTX 가 같은 얼굴이 되게 한다.
글은 진짜 글상자로 넣는다 (교사가 고칠 수 있게). 넘침은 글꼴 파일의 글자 폭으로 줄바꿈을 미리 셈해 막는다.
"""
import json
import os
import sys

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

from embed import embed_fonts
from ttf import Font

W, H = 1920, 1080
PX = 6350
PAD_X, PAD_T, PAD_B = 120, 80, 88
CW = W - 2 * PAD_X          # 본문 폭
BOTTOM = H - PAD_B          # 본문 아래 끝
# 줄바꿈을 셀 때 상자 폭을 이만큼만 쓴다. PowerPoint·LibreOffice 의 글자 사이와 줄바꿈 규칙이 조금씩 달라도 넘치지 않게 둔 여유다.
FIT = 0.95


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


# ───────────────────────── 글 재기 ─────────────────────────

def wrap(ctx, text, size, width, bold=False):
    """웹 무대의 줄바꿈(word-break: keep-all; overflow-wrap: anywhere)과 같은 규칙으로 줄을 나눈다."""
    font = ctx.bold if bold else ctx.reg
    width *= FIT
    lines, cur = [], ''
    for word in text.split(' '):
        cand = f'{cur} {word}' if cur else word
        if font.width(cand, size) <= width:
            cur = cand
            continue
        if cur:
            lines.append(cur)
        cur = ''
        # 한 낱말이 한 줄보다 길면 글자 단위로 끊는다
        for ch in word:
            if font.width(cur + ch, size) > width and cur:
                lines.append(cur)
                cur = ''
            cur += ch
    lines.append(cur)
    return lines


def text_h(ctx, text, size, width, lh, bold=False):
    return len(wrap(ctx, text, size, width, bold)) * size * lh


def text_w(ctx, text, size, bold=False):
    return (ctx.bold if bold else ctx.reg).width(text, size)


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
    for tag in ('a:latin', 'a:ea', 'a:cs'):
        el = rpr.find(qn(tag))
        if el is None:
            el = rpr.makeelement(qn(tag), {})
            rpr.append(el)
        el.set('typeface', ctx.face)


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
    return tb


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


def chip(ctx, s, x, y, label, size=44, fill='teal-soft', color='teal', pad=18, lh=1.3, w=None):
    """알약 모양 이름표. 폭은 글에 맞춘다 (한 줄)."""
    tw = text_w(ctx, label, size, True) / FIT + 2 * pad
    w = w or tw
    h = size * lh + 12
    box(ctx, s, x, y, w, h, fill=fill, line=None, radius=h / 2)
    text(ctx, s, x, y + 6, w, size * lh, label, size, color, True, lh, align='c')
    return w, h


def picture(ctx, s, m, x, y, w, h, credit=True):
    """그림을 틀(x, y, w, h) 안에 원본 비율 그대로 넣는다 (자르지도 늘이지도 않는다). 출처 표시는 그림 바로 아래 가운데.
    돌려주는 값: 실제로 차지한 (y 시작, y 끝)"""
    size = ctx.type['credit']
    ch = text_h(ctx, m['credit'], size, w, 1.3) + 10 if credit else 0
    bh = h - ch
    if bh < 20:
        raise Overflow(f'그림 {m["id"]} 이 들어갈 자리가 없습니다')
    iw, ih = m['width'], m['height']
    k = min(w / iw, bh / ih)
    pw, ph = iw * k, ih * k
    px, py = x + (w - pw) / 2, y + (h - ch - ph) / 2
    # 폭과 높이를 원본 비율대로 계산해 함께 준다 (한쪽만 주면 python-pptx 가 반올림한 값으로 다시 셈한다)
    pic = s.shapes.add_picture(m['file'], E(px), E(py), E(pw), E(ph))
    pic._element.nvPicPr.cNvPr.set('descr', m['alt'])
    if credit:
        text(ctx, s, x, py + ph + 10, w, ch - 10, m['credit'], size, 'gray', lh=1.3, align='c')
    return py, py + ph + ch


# ───────────────────────── 장의 짜임 ─────────────────────────

def title(ctx, s, t, y=PAD_T, size=72, mb=48, width=CW):
    h = text_h(ctx, t, size, width, 1.25, True)
    text(ctx, s, PAD_X, y, width, h, t, size, 'navy', True, 1.25)
    return y + h + mb


def counter(ctx, s, no, total):
    size = ctx.type['counter']
    text(ctx, s, W - 48 - 200, H - 36 - size, 200, size, f'{no} / {total}', size, 'gray', lh=1, align='r')


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


def lay_question(ctx, s, sl, L):
    T = ctx.type
    media = sl.get('media')
    tw = (CW - 72) / 1.72 if media else CW
    kh = T['label'] * 1.3 + 24 if sl.get('kicker') else 0
    th = text_h(ctx, sl['title'], T['question'], tw, 1.3, True)
    hint = sl.get('hint')
    if hint:
        hw = min(tw, text_w(ctx, hint, T['body']) / FIT + 64)
        hh = text_h(ctx, hint, T['body'], hw - 64, 1.35) + 40
    total = kh + th + (48 + hh if hint else 0)
    y = PAD_T + (BOTTOM - PAD_T - total) / 2
    if y < PAD_T:
        raise Overflow('질문 장')
    if kh:
        text(ctx, s, PAD_X, y, tw, T['label'] * 1.3, sl['kicker'], T['label'], 'coral', True, 1.3)
        y += kh
    text(ctx, s, PAD_X, y, tw, th, sl['title'], T['question'], 'navy', True, 1.3)
    y += th
    if hint:
        y += 48
        box(ctx, s, PAD_X, y, hw, hh, fill='teal-soft', line=None, radius=16)
        text(ctx, s, PAD_X + 32, y + 20, hw - 64, hh - 40, hint, T['body'], 'navy', lh=1.35)
    if media:
        mx = PAD_X + tw + 72
        picture(ctx, s, media, mx, PAD_T, W - PAD_X - mx, BOTTOM - PAD_T)


def lay_picture(ctx, s, sl, L):
    T = ctx.type
    y = title(ctx, s, sl['title'], mb=32)
    bottom = BOTTOM
    if sl.get('caption'):
        ch = text_h(ctx, sl['caption'], T['body'], CW, 1.3)
        bottom -= ch + 16
        text(ctx, s, PAD_X, bottom + 16, CW, ch, sl['caption'], T['body'], 'navy', lh=1.3, align='c')
    picture(ctx, s, sl['media'], PAD_X, y, CW, bottom - y)


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
    lw = CW - 72 - 620 if media else CW
    numbered(ctx, s, sl['points'], PAD_X, y, lw, 44 if media else 48, 1.4, 32, BOTTOM)
    if media:
        picture(ctx, s, media, W - PAD_X - 620, y, 620, BOTTOM - y)


def bullets(ctx, s, items, x, y, w, size=44, lh=1.32, gap=12):
    for t in items:
        th = text_h(ctx, t, size, w - 36, lh)
        box(ctx, s, x, y + size * lh / 2 - 7, 14, 14, fill='teal', line=None, shape=MSO_SHAPE.OVAL)
        text(ctx, s, x + 36, y, w - 36, th, t, size, 'navy', lh=lh)
        y += th + gap
    return y - gap


def bullets_h(ctx, items, w, size=44, lh=1.32, gap=12):
    return sum(text_h(ctx, t, size, w - 36, lh) for t in items) + gap * (len(items) - 1)


def lay_compare(ctx, s, sl, L):
    y = title(ctx, s, sl['title'])
    cw = (CW - 48) / 2
    any_media = sl['left'].get('media') or sl['right'].get('media')
    sides = (sl['left'], sl['right'])
    lab = 44 * 1.3
    iw = cw - 72
    # 그림이 없으면 카드는 글 높이만큼만 (두 카드는 같은 높이). 그림이 있으면 아래 끝까지 쓰고 남는 자리를 그림이 쓴다.
    bottom = BOTTOM if any_media else y + 24 + lab + 16 + max(bullets_h(ctx, sd['points'], iw) for sd in sides) + 24
    if bottom > BOTTOM + 1:
        raise Overflow('견주기')
    for i, side in enumerate(sides):
        x = PAD_X + i * (cw + 48)
        box(ctx, s, x, y, cw, bottom - y, fill='card', line='line', radius=20)
        ix, iy = x + 36, y + 24
        text(ctx, s, ix, iy, iw, lab, side['label'], 44, 'teal', True, 1.3)
        iy += lab + 16
        if any_media:
            by = BOTTOM - 24 - bullets_h(ctx, side['points'], iw)
            if side.get('media'):
                picture(ctx, s, side['media'], ix, iy, iw, by - 16 - iy)
            bullets(ctx, s, side['points'], ix, by, iw)
        else:
            bullets(ctx, s, side['points'], ix, iy, iw)


def lay_steps(ctx, s, sl, L):
    T = ctx.type
    y = title(ctx, s, sl['title'])
    steps = sl['steps']
    if any(st.get('media') for st in steps):
        n = len(steps)
        cw = (CW - 32 * (n - 1)) / n
        # 글의 첫 줄을 모든 칸에서 같은 높이에 둔다 (웹의 subgrid 와 같다)
        ty = BOTTOM - max(text_h(ctx, st['text'], T['body'], cw, 1.35) for st in steps)
        for i, st in enumerate(steps):
            x = PAD_X + i * (cw + 32)
            box(ctx, s, x, y, cw, 6, fill='teal', line=None, radius=0, shape=MSO_SHAPE.RECTANGLE)
            _, chh = chip(ctx, s, x, y + 30, st['label'])
            th = text_h(ctx, st['text'], T['body'], cw, 1.35)
            text(ctx, s, x, ty, cw, th, st['text'], T['body'], 'navy', lh=1.35)
            top = y + 30 + chh + 20
            if st.get('media'):
                picture(ctx, s, st['media'], x, top, cw, ty - 20 - top)
            elif ty - 20 < top:
                raise Overflow('단계')
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
        box(ctx, s, PAD_X, y, mw, eh, fill='paper', line=None, radius=20)
        text(ctx, s, PAD_X + 40, y + 28, mw - 80, T['label'] * 1.3, ctx.copy['slide']['example'], T['label'], 'teal', True, 1.3)
        text(ctx, s, PAD_X + 40, y + 28 + T['label'] * 1.3 + 8, mw - 80, eh - 56 - T['label'] * 1.3 - 8, ex, T['body'], 'navy', lh=1.4)


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
    numbered(ctx, s, sl['instructions'], PAD_X, y, lw, T['body'], 1.35, 20, BOTTOM)
    if aside:
        ax, aw = W - PAD_X - 540, 540
        iw = aw - 80
        lab = T['label'] * 1.3
        parts = []
        if sl.get('minutes') is not None:
            parts.append(('min', lab + 8 + 72 * 1.15))
        if sl.get('materials'):
            mh = sum(text_h(ctx, m, T['body'], iw, 1.3) for m in sl['materials']) + 8 * (len(sl['materials']) - 1)
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
                for m in sl['materials']:
                    mh = text_h(ctx, m, T['body'], iw, 1.3)
                    text(ctx, s, ax + 40, my, iw, mh, m, T['body'], 'navy', lh=1.3)
                    my += mh + 8
            iy += h + 32


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


def credit_slides(ctx, prs, L, total_before):
    """마지막 장: 수업 화면에 실린 그림의 출처(creditFull)와 sheetFooter. 길면 여러 장으로 나눈다."""
    cr = L['credits']
    size, lh, gap = 28, 1.4, 20
    foot = cr['footer']
    fh = text_h(ctx, foot, 24, CW, 1.4)
    items = [[it['text']] + [u for u in (it.get('sourceUrl'), it.get('licenceUrl')) if u] for it in cr['items']] or [[cr['empty']]]
    pages, cur, top = [], [], PAD_T + 72 * 1.25 + 48
    limit = BOTTOM - fh - 32
    y = top
    for it in items:
        h = sum(text_h(ctx, t, size if i == 0 else 24, CW, lh) for i, t in enumerate(it))
        if cur and y + h > limit:
            pages.append(cur)
            cur, y = [], top
        cur.append((it, h))
        y += h + gap
    pages.append(cur)
    for k, page in enumerate(pages):
        s = new_slide(ctx, prs)
        head = cr['heading'] + (' ' + cr['more'].replace('{n}', str(k + 1)).replace('{total}', str(len(pages))) if len(pages) > 1 else '')
        y = title(ctx, s, head)
        for it, h in page:
            for i, t in enumerate(it):
                th = text_h(ctx, t, size if i == 0 else 24, CW, lh)
                text(ctx, s, PAD_X, y, CW, th, t, size if i == 0 else 24, 'navy' if i == 0 else 'gray', lh=lh)
                y += th
            y += gap
        hline(ctx, s, PAD_X, BOTTOM - fh - 16, W - PAD_X, BOTTOM - fh - 16)
        text(ctx, s, PAD_X, BOTTOM - fh, CW, fh, foot, 24, 'gray', lh=1.4)
    return len(pages)


def new_slide(ctx, prs):
    layout = next((l for l in prs.slide_layouts if l.name.strip().lower() == 'blank'), prs.slide_layouts[6])
    s = prs.slides.add_slide(layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    f = s.background.fill
    f.solid()
    f.fore_color.rgb = ctx.c['bg']
    return s


def build(ctx, L):
    prs = Presentation()
    prs.slide_width, prs.slide_height = E(W), E(H)
    n = len(L['slides'])
    for sl in L['slides']:
        s = new_slide(ctx, prs)
        try:
            LAYOUTS[sl['layout']](ctx, s, sl, L)
        except Overflow as e:
            raise SystemExit(f'{L["id"]} 의 {sl["no"]}번 장({sl["layout"]})이 PPTX 한 장을 넘칩니다: {e}. 글을 줄입니다')
        counter(ctx, s, sl['no'], n)
        s.notes_slide.notes_text_frame.text = '\n'.join(sl['notes'])
    credit_slides(ctx, prs, L, n)
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
