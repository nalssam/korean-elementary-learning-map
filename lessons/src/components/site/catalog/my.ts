// 내 자료함(/my/)의 브라우저 쪽 (R51). 페이지에 실린 자료 목록(JSON)에서 이 브라우저에 담긴 것만 골라 자료 카드로 그린다.
//
// 카드는 ResourceCard.astro 와 같은 짜임과 class 로 그린다 (rc, rc-frame, rc-thumb, rc-head, rc-label, rc-title, rc-lesson, rc-format,
// rc-actions, rc-open, rc-btn, rc-pop). 그래서 함께 쓰는 카드의 CSS 가 그대로 걸린다. 다른 점은 하나: 담기 단추 자리에 빼기 단추가 있다.
// 명세의 글은 글자로만 넣는다 (textContent). innerHTML 을 쓰지 않는다.
// 자료 종류의 선 그림(TypeIcon)과 초안 표(StatusChip)는 페이지가 <template> 에 그려 둔 것을 복사한다 (그림을 두 곳에 적지 않는다).
// QR 은 창을 처음 열 때 만든다. 그때만 QR 을 만드는 코드를 불러온다 (내 자료함을 여는 사람 대부분은 QR 을 열지 않는다).
import { ASSET_LABEL, KIND_GROUP, OPEN_LABEL } from '#lib/site.ts';
import type { AssetKind } from '#schema/lesson.ts';

/** 페이지가 싣는 자료 한 줄 (catalog() 의 한 줄에서 화면에 쓰는 것만, 주소는 href() 를 씌운 것) */
export interface MyItem {
  key: string;
  kind: AssetKind;
  title: string;
  lessonTitle: string;
  course: string;
  /** 차시 자료실 */
  lesson: string;
  /** 여는 곳 */
  route: string;
  file?: { route: string; name: string };
  format: string;
  thumb?: string;
  draft: boolean;
  /** 학생 페이지(확인 퀴즈, 웹 활동)의 QR 에 담는 온전한 주소 (absoluteUrl) */
  qr?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const hidden = (text: string) => el('span', 'visually-hidden', text);

/** <template> 에 그려 둔 선 그림 (크기 44 는 미리보기 틀, 16 은 자료 종류 줄) */
function icon(tpl: HTMLTemplateElement, kind: string, frame: boolean): Node {
  const svg = tpl.content.querySelector(`svg[data-kind="${kind}"]${frame ? '.rc-icon' : ':not(.rc-icon)'}`);
  return svg ? svg.cloneNode(true) : document.createTextNode('');
}

/** QR 그리기: Qr.astro 와 같은 꼴 (오류 복원 M, 네 칸의 여백, 가로로 이어진 칸을 한 줄로). 바탕은 --card, 칸은 --navy. */
async function qrSvg(url: string, label: string): Promise<SVGSVGElement> {
  const QRCode = await import('qrcode');
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  const QUIET = 4;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.get(y, x)) continue;
      let run = 1;
      while (x + run < size && modules.get(y, x + run)) run++;
      d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
      x += run;
    }
  }
  const box = size + QUIET * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const ground = document.createElementNS(NS, 'rect');
  ground.setAttribute('class', 'qr-ground');
  ground.setAttribute('width', String(box));
  ground.setAttribute('height', String(box));
  const ink = document.createElementNS(NS, 'path');
  ink.setAttribute('class', 'qr-ink');
  ink.setAttribute('d', d);
  svg.append(ground, ink);
  return svg;
}

/** 손으로 옮겨 적을 주소: '/' 뒤에서만 줄을 바꾼다 (UrlText.astro 와 같다) */
function urlText(url: string): DocumentFragment {
  const out = document.createDocumentFragment();
  url.split(/(?<=\/)(?!\/)/).forEach((part, i) => {
    if (i > 0) out.append(document.createElement('wbr'));
    const span = el('span', 'url-part', part);
    span.style.whiteSpace = 'nowrap';
    out.append(span);
  });
  return out;
}

const popovers = typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');

/** 자료 카드 하나. ResourceCard.astro(withLesson, level 3)와 같은 짜임에 담기 대신 빼기 단추를 둔다. */
export function card(item: MyItem, icons: HTMLTemplateElement): HTMLElement {
  const label = ASSET_LABEL[item.kind];
  const which = `${label} ${item.title} (${item.course})`;
  const article = el('article', 'rc');
  article.dataset.kind = item.kind;
  article.dataset.group = KIND_GROUP[item.kind];
  article.dataset.key = item.key;
  if (item.draft) article.dataset.draft = 'true';

  const frame = el('div', 'rc-frame');
  frame.append(icon(icons, item.kind, true));
  if (item.thumb) {
    const img = el('img', 'rc-thumb');
    img.src = item.thumb;
    img.alt = `${label} 미리보기`;
    img.loading = 'lazy';
    img.decoding = 'async';
    // 미리보기 그림이 실리지 않으면(1단계만 돌린 dist) 지워서 뒤의 선 그림이 보이게 한다
    img.addEventListener('error', () => img.remove());
    frame.append(img);
  }

  const body = el('div', 'rc-body');
  const head = el('div', 'rc-head');
  const kind = el('p', 'rc-label');
  kind.append(icon(icons, item.kind, false), label);
  const remove = el('button', 'rc-collect my-remove');
  remove.type = 'button';
  remove.dataset.remove = item.key;
  remove.append(xMark(), '빼기', hidden(`: ${which}`));
  head.append(kind, remove);
  const title = el('h3', 'rc-title', item.title);
  const lesson = el('p', 'rc-lesson');
  const lessonLink = el('a', undefined, `${item.course} · ${item.lessonTitle}`);
  lessonLink.href = item.lesson;
  lesson.append(lessonLink);
  const format = el('p', 'rc-format', item.format);
  if (item.draft) {
    const chip = icons.content.querySelector('.status-chip[data-state="draft"]');
    // 한 줄 설명과 초안 표 사이에 빈칸 (화면 읽기 프로그램과 검색이 '…PPTX초안'처럼 붙여 읽지 않게. ResourceCard 와 같다)
    if (chip) format.append(' ', chip.cloneNode(true));
  }
  body.append(head, title, lesson, format);

  const actions = el('div', 'rc-actions');
  const open = el('a', 'rc-open', OPEN_LABEL[item.kind]);
  open.href = item.route;
  open.append(hidden(`: ${which}`));
  actions.append(open);
  if (item.file) {
    const down = el('a', 'rc-btn', '내려받기');
    down.href = item.file.route;
    down.download = item.file.name;
    down.append(hidden(`: ${which}`));
    actions.append(down);
  }
  article.append(frame, body, actions);

  if (item.qr) {
    const id = `qr-${item.key.replace(/[^a-z0-9]+/gi, '-')}-my`;
    const button = el('button', 'rc-btn rc-qr', 'QR');
    button.type = 'button';
    button.setAttribute('popovertarget', id);
    button.append(hidden(` 코드 보기: ${which}`));
    actions.append(button);

    const pop = el('div', 'rc-pop');
    pop.id = id;
    pop.setAttribute('popover', '');
    const url = el('p', 'rc-pop-url');
    url.append(urlText(item.qr));
    const close = el('button', 'rc-btn rc-pop-close', '닫기');
    close.type = 'button';
    close.setAttribute('popovertarget', id);
    close.setAttribute('popovertargetaction', 'hide');
    close.autofocus = true;
    pop.append(el('p', 'rc-pop-title', label), el('p', 'rc-pop-sub', item.title), url, close);
    let made = false;
    const make = () => {
      if (made) return;
      made = true;
      void qrSvg(item.qr!, `${label} QR 코드`).then((svg) => url.before(svg));
    };
    // popover 를 모르는 브라우저에서는 QR 과 주소가 카드 아래에 펼쳐져 있으므로 곧바로 그린다
    if (popovers) pop.addEventListener('beforetoggle', (e) => { if ((e as ToggleEvent).newState === 'open') make(); });
    else make();
    article.append(pop);
  }
  return article;
}

/** 빼기 단추의 그림: 가는 ×. 선 그림과 같은 굵기다. */
function xMark(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rc-mark');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M7 7l10 10M17 7 7 17');
  svg.append(path);
  return svg;
}
