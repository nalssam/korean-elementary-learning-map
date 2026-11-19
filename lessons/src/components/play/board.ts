// 웹 활동의 브라우저 동작. PlayPage.astro 가 찍어 둔 카드와 자리를 움직인다.
//  <play-board>  : 분류하기(sort)·짝 맞추기(match)·그림에 이름표 놓기(place). 카드를 골라 상자나 빈칸에 놓는다.
//  <order-board> : 차례 맞추기(order). 줄을 골라 다른 자리로 옮긴다.
// 세 가지 손놀림이 모두 된다: 누르고 누르기(터치·마우스), 끌어 놓기, 키보드(Tab 으로 가서 Enter·Space, Esc 로 취소).
// 시간을 재지 않고, 아무것도 저장하거나 보내지 않는다 (docs/CONTRACT.md 9절).
// 점수(몇 개 가운데 몇 개)는 data-scored 가 "true" 인 차시에서만 한 줄로 보여 준다. 축하 효과는 어느 차시에도 없다.

/** 키보드로 누른 클릭인가 (Enter·Space 로 누른 단추의 click 은 detail 이 0 이다). 그때만 초점을 다음 할 일로 옮긴다. */
const byKeyboard = (e: Event) => (e as MouseEvent).detail === 0;
const textOf = (el: Element) => (el.querySelector('.chip-btn, .row-btn')?.textContent ?? '').trim();

/**
 * 끌어 놓기. 마우스·펜은 바로 끌리고, 손가락은 잠깐(0.3초) 누르고 있어야 끌린다.
 * 손가락으로 바로 끌리게 하면 카드가 많은 휴대폰 화면에서 쓸어 넘기기(스크롤)를 할 수 없다. 누르고 누르기는 언제나 된다.
 */
function enableDrag(root: HTMLElement, opts: {
  grab: (t: HTMLElement) => HTMLElement | null;
  hover: (el: HTMLElement, under: HTMLElement | null) => void;
  drop: (el: HTMLElement, under: HTMLElement | null) => void;
}) {
  type S = { el: HTMLElement; id: number; x0: number; y0: number; touch: boolean; timer?: number; ghost?: HTMLElement; dx: number; dy: number };
  let s: S | null = null;
  let suppressClick = false;

  const under = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    return hit && root.contains(hit) ? hit : null;
  };
  const begin = () => {
    if (!s) return;
    const r = s.el.getBoundingClientRect();
    const ghost = s.el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.classList.add('ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${r.width}px`;
    s.dx = s.x0 - r.left;
    s.dy = s.y0 - r.top;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    document.body.append(ghost);
    s.ghost = ghost;
    s.el.classList.add('is-dragging');
    root.classList.add('is-dragging-any');
  };
  const end = () => {
    if (!s) return;
    clearTimeout(s.timer);
    s.ghost?.remove();
    s.el.classList.remove('is-dragging');
    root.classList.remove('is-dragging-any');
    opts.hover(s.el, null);
    s = null;
  };

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || s) return;
    const el = opts.grab(e.target as HTMLElement);
    if (!el) return;
    s = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, touch: e.pointerType === 'touch', dx: 0, dy: 0 };
    if (s.touch) s.timer = window.setTimeout(begin, 300);
  });
  window.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.ghost) {
      const far = Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 6;
      if (!far) return;
      // 손가락이 기다리기 전에 움직였으면 화면을 쓸어 넘기는 것이다
      if (s.touch) return end();
      begin();
    }
    s.ghost!.style.left = `${e.clientX - s.dx}px`;
    s.ghost!.style.top = `${e.clientY - s.dy}px`;
    opts.hover(s.el, under(e.clientX, e.clientY));
  });
  window.addEventListener('pointerup', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (s.ghost) {
      const el = s.el;
      const target = under(e.clientX, e.clientY);
      suppressClick = true;
      end();
      opts.drop(el, target);
      setTimeout(() => { suppressClick = false; }, 0);
    } else end();
  });
  window.addEventListener('pointercancel', end);
  // 끄는 동안에는 화면이 함께 밀리지 않게 한다 (손가락)
  root.addEventListener('touchmove', (e) => { if (s?.ghost) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => { if (s) e.preventDefault(); });
  // 끌어 놓은 뒤 따라오는 click 이 '고르기'로 읽히지 않게 한다
  root.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
}

/** 고른 카드 안내 줄, 확인하기·다시 해 보기, 결과 한 줄. 두 판이 같이 쓴다. */
abstract class Board extends HTMLElement {
  protected picked: HTMLElement | null = null;
  protected get scored() { return this.dataset.scored === 'true'; }
  protected get total() { return Number(this.dataset.total); }
  protected $<T extends HTMLElement = HTMLElement>(sel: string) { return this.querySelector<T>(sel)!; }

  protected say(text: string) { this.$('[data-status]').textContent = text; }

  protected pickbar(msg: string | null) {
    const bar = this.$('[data-pickbar]');
    bar.hidden = msg === null;
    if (msg !== null) this.$('[data-pickmsg]').textContent = msg;
    this.classList.toggle('is-picking', msg !== null);
  }

  protected unpick() {
    this.picked?.querySelector('.chip-btn, .row-btn')?.setAttribute('aria-pressed', 'false');
    this.picked?.classList.remove('is-picked');
    this.picked = null;
    this.pickbar(null);
  }

  protected setPicked(el: HTMLElement, msg: string) {
    this.unpick();
    this.picked = el;
    el.classList.add('is-picked');
    el.querySelector('.chip-btn, .row-btn')?.setAttribute('aria-pressed', 'true');
    this.pickbar(msg);
  }

  /** 다시 놓을 카드에 '다시'를 붙일까. 차례 맞추기는 줄마다 붙으면 어지러워서 맞은 줄에만 '맞음'을 붙이고 나머지는 점선으로만 둔다. */
  protected againTag = '다시';

  protected setMark(el: HTMLElement, state: 'ok' | 'again' | null) {
    el.classList.toggle('is-ok', state === 'ok');
    el.classList.toggle('is-again', state === 'again');
    const mark = el.querySelector('[data-mark]');
    if (mark) mark.textContent = state === 'ok' ? '맞음' : state === 'again' ? this.againTag : '';
    const why = el.querySelector<HTMLElement>('[data-why]');
    if (why) why.hidden = state !== 'ok';
  }

  /** 결과 한 줄. 점수를 보여 주는 차시에서만 몇 개 가운데 몇 개인지 앞에 붙인다. */
  protected report(ok: number, allDone: string, rest: string, none: string) {
    if (ok === this.total) return this.say(allDone);
    // 하나도 맞지 않았을 때 '0개가 맞았습니다'·'맞음 표시를 했습니다'는 어색하고 기를 꺾는다. 다시 해 볼 일만 말한다.
    if (ok === 0) return this.say(none);
    this.say(`${this.scored ? `${this.total}개 가운데 ${ok}개가 맞았습니다. ` : ''}${rest}`);
  }
}

class PlayBoard extends Board {
  private one = false;
  private initial: HTMLElement[] = [];

  connectedCallback() {
    // 짝 맞추기와 이름표 놓기는 한 자리에 하나만 들어간다. 분류하기의 상자에는 여럿이 들어간다.
    this.one = this.dataset.kind !== 'sort';
    this.initial = [...this.querySelectorAll<HTMLElement>('.chip')];
    for (const b of this.querySelectorAll('.chip-btn')) b.setAttribute('aria-pressed', 'false');
    this.addEventListener('click', (e) => this.onClick(e));
    this.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.picked) { this.unpick(); this.say('고르기를 취소했습니다.'); } });
    enableDrag(this, {
      grab: (t) => { const c = t.closest<HTMLElement>('.chip'); return c && !c.classList.contains('is-ok') ? c : null; },
      hover: (_, under) => {
        const id = under ? this.targetAt(under) : null;
        for (const el of this.querySelectorAll<HTMLElement>('[data-target]')) el.classList.toggle('is-over', id !== null && el.dataset.target === id);
      },
      drop: (el, under) => {
        const id = under ? this.targetAt(under) : null;
        if (id !== null) this.place(el, id, false);
      },
    });
    this.layoutPicture();
    this.update();
  }

  private drop(id: string) { return this.$(`[data-drop="${id}"]`); }
  private where(chip: HTMLElement) { return chip.parentElement!.dataset.drop!; }
  private chips() { return [...this.querySelectorAll<HTMLElement>('.chip')]; }
  /** 손가락·마우스 아래의 자리. 자리에 놓인 카드 위라면 그 카드의 자리다. */
  private targetAt(el: HTMLElement): string | null {
    const chip = el.closest<HTMLElement>('.chip');
    if (chip && !chip.classList.contains('ghost')) return this.where(chip);
    return el.closest<HTMLElement>('[data-target]')?.dataset.target ?? null;
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const key = byKeyboard(e);
    if (t.closest('[data-cancel]')) { this.unpick(); return; }
    if (t.closest('[data-check]')) return this.check(key);
    if (t.closest('[data-again]')) return this.again(key);
    const chip = t.closest<HTMLElement>('.chip');
    if (chip) {
      if (this.picked && this.picked !== chip && this.where(chip) !== 'tray') return this.place(this.picked, this.where(chip), key);
      if (this.picked === chip) { this.unpick(); return; }
      return this.pick(chip);
    }
    const target = t.closest<HTMLElement>('[data-target]');
    if (!target) return;
    const id = target.dataset.target!;
    if (this.picked) return this.place(this.picked, id, key);
    // 아무것도 고르지 않고 채워진 번호를 누르면 거기 놓인 이름표를 고른다
    const there = id !== 'tray' ? this.drop(id).querySelector<HTMLElement>('.chip') : null;
    if (there && !there.classList.contains('is-ok')) return this.pick(there);
    if (id !== 'tray') this.say(`먼저 ${this.dataset.noun}를 골라 봅시다.`);
  }

  private pick(chip: HTMLElement) {
    if (chip.classList.contains('is-ok')) { this.say('이미 알맞게 놓은 것입니다.'); return; }
    this.setPicked(chip, `‘${textOf(chip)}’ ${this.dataset.noun}를 골랐습니다. ${this.dataset.prompt}`);
    this.$('[data-back]').hidden = this.where(chip) === 'tray';
  }

  protected unpick() {
    super.unpick();
    const back = this.querySelector<HTMLElement>('[data-back]');
    if (back) back.hidden = true;
  }

  private place(chip: HTMLElement, id: string, key: boolean) {
    if (id === this.where(chip)) { this.unpick(); return; }
    if (this.one && id !== 'tray') {
      const there = this.drop(id).querySelector<HTMLElement>('.chip');
      if (there?.classList.contains('is-ok')) { this.say('그 자리에는 이미 알맞은 것이 놓여 있습니다.'); return; }
      if (there) { this.setMark(there, null); this.drop('tray').append(there); }
    }
    this.setMark(chip, null);
    this.drop(id).append(chip);
    this.unpick();
    this.say('');
    this.update();
    if (key) {
      // 키보드로 놓았으면 다음에 놓을 카드로, 다 놓았으면 확인하기로 초점을 옮긴다
      const next = this.drop('tray').querySelector<HTMLElement>('.chip-btn');
      (next ?? this.$('[data-check]')).focus();
    }
  }

  private update() {
    const left = this.drop('tray').querySelectorAll('.chip').length;
    this.classList.toggle('tray-done', left === 0);
    for (const slot of this.querySelectorAll<HTMLElement>('.slot')) {
      const chip = slot.querySelector<HTMLElement>('.chip');
      slot.querySelector<HTMLElement>('.slot-empty')!.hidden = !!chip;
      slot.classList.toggle('is-filled', !!chip);
    }
    for (const m of this.querySelectorAll<HTMLElement>('.marker')) {
      const chip = this.drop(m.dataset.target!).querySelector<HTMLElement>('.chip');
      const no = Number(m.dataset.target) + 1;
      m.classList.toggle('is-filled', !!chip);
      m.classList.toggle('is-ok', !!chip?.classList.contains('is-ok'));
      m.setAttribute('aria-label', chip ? `${no}번 자리: ${textOf(chip)}` : `${no}번 자리에 놓기`);
    }
    const done = this.chips().every((c) => c.classList.contains('is-ok'));
    this.$('[data-check]').setAttribute('aria-disabled', String(left > 0 || done));
  }

  private check(key: boolean) {
    this.unpick();
    if (this.drop('tray').querySelector('.chip')) { this.say(`${this.dataset.noun}를 모두 놓은 뒤에 확인해 봅시다.`); return; }
    if (this.chips().every((c) => c.classList.contains('is-ok'))) return;
    let ok = 0;
    for (const chip of this.chips()) {
      if (chip.dataset.answer === this.where(chip)) { this.setMark(chip, 'ok'); ok++; }
      else { this.setMark(chip, 'again'); this.drop('tray').append(chip); }
    }
    this.update();
    this.report(ok, '모두 알맞게 놓았습니다.', `알맞게 놓은 것에 맞음 표시를 했습니다. 남은 ${this.dataset.noun}를 다시 놓아 봅시다.`, `아직 알맞은 자리에 놓인 것이 없습니다. ${this.dataset.noun}를 다시 놓아 봅시다.`);
    if (key) (this.drop('tray').querySelector<HTMLElement>('.chip-btn') ?? this.$('[data-again]')).focus();
  }

  private again(key: boolean) {
    this.unpick();
    for (const chip of this.initial) { this.setMark(chip, null); this.drop('tray').append(chip); }
    this.update();
    this.say('처음으로 돌려놓았습니다.');
    if (key) this.drop('tray').querySelector<HTMLElement>('.chip-btn')?.focus();
  }

  /**
   * 그림 위 번호 자리를 그림의 크기에 맞춘다. 번호는 그림의 왼쪽 위에서 잰 백분율(x, y)에 놓인다 (9절).
   * 그림은 Media.astro 가 출처 표시와 함께 찍으므로, 번호를 담은 판을 그림(img)의 상자에 겹친다.
   */
  private layoutPicture() {
    const img = this.querySelector<HTMLImageElement>('.place-pic img');
    const layer = this.querySelector<HTMLElement>('[data-layer]');
    if (!img || !layer) return;
    const fit = () => {
      layer.style.left = `${img.offsetLeft}px`;
      layer.style.top = `${img.offsetTop}px`;
      layer.style.width = `${img.offsetWidth}px`;
      layer.style.height = `${img.offsetHeight}px`;
      layer.classList.toggle('is-ready', img.offsetWidth > 0);
    };
    new ResizeObserver(fit).observe(img);
    img.addEventListener('load', fit);
    fit();
  }
}

class OrderBoard extends Board {
  private initial: HTMLElement[] = [];
  protected againTag = '';

  connectedCallback() {
    this.initial = this.rows();
    for (const b of this.querySelectorAll('.row-btn')) b.setAttribute('aria-pressed', 'false');
    this.addEventListener('click', (e) => this.onClick(e));
    this.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.picked) { this.unpick(); this.say('고르기를 취소했습니다.'); } });
    enableDrag(this, {
      grab: (t) => (t.closest('.row-arrow') ? null : t.closest<HTMLElement>('.row')),
      hover: (el, under) => {
        const row = under?.closest<HTMLElement>('.row') ?? null;
        for (const r of this.rows()) r.classList.toggle('is-over', r === row && r !== el);
      },
      drop: (el, under) => {
        const row = under?.closest<HTMLElement>('.row');
        if (row && row !== el) this.moveTo(el, this.rows().indexOf(row), false);
      },
    });
    this.update();
  }

  private rows() { return [...this.querySelectorAll<HTMLElement>('.order-list .row')]; }
  private list() { return this.$('.order-list'); }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const key = byKeyboard(e);
    if (t.closest('[data-cancel]')) { this.unpick(); return; }
    if (t.closest('[data-check]')) return this.check(key);
    if (t.closest('[data-again]')) return this.again(key);
    const row = t.closest<HTMLElement>('.row');
    if (!row) return;
    const arrow = t.closest<HTMLElement>('.row-arrow');
    if (arrow) {
      if (arrow.getAttribute('aria-disabled') === 'true') return;
      this.unpick();
      const i = this.rows().indexOf(row);
      this.moveTo(row, i + (arrow.hasAttribute('data-up') ? -1 : 1), false);
      // 옮긴 줄의 같은 화살표에 초점을 남긴다 (끝에 닿았으면 반대쪽 화살표로)
      const same = row.querySelector<HTMLElement>(arrow.hasAttribute('data-up') ? '[data-up]' : '[data-down]')!;
      const other = row.querySelector<HTMLElement>(arrow.hasAttribute('data-up') ? '[data-down]' : '[data-up]')!;
      (same.getAttribute('aria-disabled') === 'true' ? other : same).focus();
      return;
    }
    if (this.picked && this.picked !== row) return this.moveTo(this.picked, this.rows().indexOf(row), key);
    if (this.picked === row) { this.unpick(); return; }
    this.setPicked(row, `‘${textOf(row)}’ 카드를 골랐습니다. ${this.dataset.prompt}`);
  }

  private moveTo(row: HTMLElement, index: number, key: boolean) {
    const rows = this.rows();
    const from = rows.indexOf(row);
    if (index < 0 || index >= rows.length || index === from) { this.unpick(); return; }
    const ref = rows[index];
    // 아래로 옮기면 그 줄의 뒤에, 위로 옮기면 그 줄의 앞에 들어간다
    this.list().insertBefore(row, index > from ? ref.nextSibling : ref);
    for (const r of this.rows()) this.setMark(r, null);
    this.unpick();
    this.update();
    this.say(`‘${textOf(row)}’ 카드를 ${index + 1}번째 자리로 옮겼습니다.`);
    if (key) row.querySelector<HTMLElement>('.row-btn')!.focus();
  }

  private update() {
    const rows = this.rows();
    rows.forEach((r, i) => {
      r.querySelector('.row-no')!.textContent = String(i + 1);
      r.querySelector('[data-up]')!.setAttribute('aria-disabled', String(i === 0));
      r.querySelector('[data-down]')!.setAttribute('aria-disabled', String(i === rows.length - 1));
    });
  }

  private check(key: boolean) {
    this.unpick();
    let ok = 0;
    this.rows().forEach((r, i) => {
      const right = Number(r.dataset.item) === i;
      this.setMark(r, right ? 'ok' : 'again');
      if (right) ok++;
    });
    this.report(ok, '모두 알맞은 차례로 놓았습니다.', '알맞은 자리에 있는 카드에 맞음 표시를 했습니다. 나머지 카드의 자리를 바꿔 봅시다.', '아직 알맞은 자리에 있는 카드가 없습니다. 카드의 자리를 바꿔 봅시다.');
    if (key) (this.rows().find((r) => r.classList.contains('is-again'))?.querySelector<HTMLElement>('.row-btn') ?? this.$('[data-again]')).focus();
  }

  private again(key: boolean) {
    this.unpick();
    for (const r of this.initial) { this.setMark(r, null); this.list().append(r); }
    this.update();
    this.say('처음 차례로 돌려놓았습니다.');
    if (key) this.rows()[0].querySelector<HTMLElement>('.row-btn')!.focus();
  }
}

customElements.define('play-board', PlayBoard);
customElements.define('order-board', OrderBoard);
