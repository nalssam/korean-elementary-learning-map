// 확인 퀴즈의 브라우저 동작. QuizPage.astro 가 찍어 둔 문항을 한 문제씩 보여 주고 맞고 틀림과 풀이를 보여 준다.
// 아무것도 저장하지 않고 아무 데도 보내지 않는다 (docs/CONTRACT.md 9절). 새로 고치면 처음부터다.
// 점수는 data-scored 가 "true" 인 차시(scored(lesson))에서만 끝 화면에 한 줄로 보여 준다. 별·시간 재기·축하 효과는 어느 차시에도 없다.
import { markShort } from './logic.ts';

class QuizRunner extends HTMLElement {
  private group = 0;
  private index = 0;
  private right = 0;

  connectedCallback() {
    this.addEventListener('click', (e) => this.onClick(e));
    this.addEventListener('submit', (e) => this.onSubmit(e));
    const groups = this.groups();
    // 안내 페이지가 "#3" 처럼 차시를 붙여 열면 그 차시 문제로 바로 간다
    const fromHash = Number(location.hash.slice(1));
    if (groups.includes(fromHash)) this.start(fromHash, false);
    else if (this.querySelector('[data-screen="pick"]')) this.show(this.querySelector('[data-screen="pick"]')!, false);
    else this.start(groups[0], false);
  }

  private groups(): number[] {
    return [...new Set([...this.querySelectorAll<HTMLElement>('.q')].map((q) => Number(q.dataset.group)))];
  }
  private questions(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(`.q[data-group="${this.group}"]`)];
  }

  /** 화면 하나만 보인다. 키보드·화면 읽기 사용자가 새 화면의 처음을 듣도록 제목으로 초점을 옮긴다 (처음 열 때는 옮기지 않는다). */
  private show(screen: HTMLElement, focus = true) {
    for (const s of this.querySelectorAll<HTMLElement>('[data-screen]')) s.classList.toggle('is-current', s === screen);
    if (focus) {
      const title = screen.querySelector<HTMLElement>('.q-text, .quiz-screen-title');
      title?.focus({ preventScroll: true });
      screen.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -16);
    }
  }

  private start(group: number, focus = true) {
    this.group = group;
    this.index = 0;
    this.right = 0;
    for (const q of this.questions()) this.reset(q);
    this.show(this.questions()[0], focus);
  }

  private reset(q: HTMLElement) {
    delete q.dataset.done;
    for (const b of q.querySelectorAll<HTMLButtonElement>('.ans')) {
      b.disabled = false;
      b.classList.remove('is-right', 'is-wrong', 'is-dim');
      b.removeAttribute('aria-pressed');
      b.querySelector('[data-tag]')!.textContent = '';
    }
    const input = q.querySelector<HTMLInputElement>('.short-input');
    if (input) {
      input.value = '';
      input.readOnly = false;
      input.classList.remove('is-right', 'is-wrong');
      q.querySelector<HTMLButtonElement>('.short-submit')!.hidden = false;
      q.querySelector('[data-hint]')!.textContent = '';
    }
    q.querySelector<HTMLElement>('[data-feedback]')!.hidden = true;
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const start = t.closest<HTMLElement>('[data-start]');
    if (start) return this.start(Number(start.dataset.start));
    if (t.closest('[data-restart]')) return this.start(this.group);
    if (t.closest('[data-next]')) return this.next();
    const ans = t.closest<HTMLButtonElement>('.ans');
    if (ans && !ans.disabled) this.answer(ans.closest<HTMLElement>('.q')!, ans);
  }

  private onSubmit(e: Event) {
    e.preventDefault();
    const q = (e.target as HTMLElement).closest<HTMLElement>('.q')!;
    if (q.dataset.done) return;
    const input = q.querySelector<HTMLInputElement>('.short-input')!;
    if (!input.value.trim()) {
      q.querySelector('[data-hint]')!.textContent = '답을 써넣은 뒤에 확인해 봅시다.';
      input.focus();
      return;
    }
    const accept = JSON.parse(q.dataset.accept || '[]') as string[];
    const ok = markShort(input.value, q.dataset.answer!, accept);
    input.readOnly = true;
    input.classList.add(ok ? 'is-right' : 'is-wrong');
    q.querySelector<HTMLButtonElement>('.short-submit')!.hidden = true;
    q.querySelector('[data-hint]')!.textContent = '';
    this.finish(q, ok);
  }

  private answer(q: HTMLElement, chosen: HTMLButtonElement) {
    if (q.dataset.done) return;
    const ok = chosen.dataset.value === q.dataset.answer;
    for (const b of q.querySelectorAll<HTMLButtonElement>('.ans')) {
      const isAnswer = b.dataset.value === q.dataset.answer;
      b.disabled = true;
      // 고른 답과 정답에는 글자로도 표시한다 (색으로만 가리지 않는다)
      if (b === chosen) {
        b.setAttribute('aria-pressed', 'true');
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        b.querySelector('[data-tag]')!.textContent = ok ? '고른 답 · 정답' : '고른 답';
      } else if (isAnswer) {
        b.classList.add('is-right');
        b.querySelector('[data-tag]')!.textContent = '정답';
      } else {
        b.classList.add('is-dim');
      }
    }
    this.finish(q, ok);
  }

  private finish(q: HTMLElement, ok: boolean) {
    q.dataset.done = '1';
    if (ok) this.right++;
    const fb = q.querySelector<HTMLElement>('[data-feedback]')!;
    fb.classList.toggle('is-right', ok);
    fb.classList.toggle('is-wrong', !ok);
    fb.querySelector('[data-verdict]')!.textContent = ok ? '맞았습니다.' : '정답과 풀이를 읽어 봅시다.';
    fb.querySelector<HTMLElement>('[data-correct]')!.hidden = ok;
    fb.hidden = false;
    // 풀이의 머리로 초점을 옮겨 화면 읽기가 결과를 바로 읽게 하고, 풀이와 '다음 문제'가 보이게 한다
    const head = fb.querySelector<HTMLElement>('.feedback-head')!;
    head.focus({ preventScroll: true });
    fb.scrollIntoView({ block: 'nearest' });
  }

  private next() {
    const qs = this.questions();
    this.index++;
    if (this.index < qs.length) return this.show(qs[this.index]);
    const end = this.querySelector<HTMLElement>('[data-screen="end"]')!;
    const score = end.querySelector('[data-score]');
    if (score) score.textContent = `${qs.length}문제 가운데 ${this.right}문제를 맞혔습니다.`;
    // 다른 차시 문제로 가는 단추는 지금 푼 차시의 것만 숨긴다
    for (const b of end.querySelectorAll<HTMLElement>('[data-other]')) b.hidden = Number(b.dataset.start) === this.group;
    this.show(end);
  }
}

customElements.define('quiz-runner', QuizRunner);
