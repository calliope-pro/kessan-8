// 最小の DOM 部品。innerHTML は使わない (文字列を DOM に直接流さない)。
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** CSP (style-src 'self') は style 属性を禁じるので、動的な値は CSSOM のカスタムプロパティで渡す。 */
export function setVar(el: HTMLElement, name: string, value: string): void {
  el.style.setProperty(name, value);
}

/** 札 (印を押す欄)。画面が替わった直後の 250 ms は押せない (前の札を押した指が、次の画面の札に当たる誤タップを防ぐ)。 */
export function seal(text: string, sub: string | null, cls: string, onClick: () => void, mini?: string): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `seal ${cls}` }, mini && h('span', { class: 'mini', 'aria-hidden': 'true' }, mini), h('span', {}, text, sub && h('small', {}, sub)));
  b.addEventListener('click', onClick);
  return b;
}

/** 画面の見出し (h1)。画面が替わるたびに、ここへフォーカスを移して、読み上げに「何社目か」を伝える。 */
export function screenHeading(text: string): HTMLElement {
  return h('h1', { class: 'now', tabindex: '-1' }, text);
}

export const ARMING_MS = 250;
export function arm(actions: HTMLElement): void {
  actions.classList.add('arming');
  setTimeout(() => actions.classList.remove('arming'), ARMING_MS);
}

/** 答え合わせの朱書きが、札の帯 (画面の下端) に隠れるときは、見える所まで少しだけ上へ送る。 */
export function scrollMarksIntoView(actions: HTMLElement): void {
  const marks = [...document.querySelectorAll<HTMLElement>('.slip .marked')];
  if (marks.length === 0) return;
  const limit = actions.getBoundingClientRect().top - 12;
  const bottom = Math.max(...marks.map((m) => m.getBoundingClientRect().bottom));
  if (bottom > limit) window.scrollBy(0, bottom - limit);
}
