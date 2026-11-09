// 最小の DOM 部品。innerHTML は使わない (文字列を DOM に直接流さない)。
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** 札・ボタン。画面が替わった直後の 250 ms は押せない (前の札を押した指が、次の画面の同じ位置のボタンに当たる誤タップを防ぐ。`arm`)。 */
export function seal(text: string, cls: string, onClick: () => void, sub?: string | null): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `seal ${cls}`.trim() }, h('span', {}, text, sub ? h('small', {}, sub) : null));
  b.addEventListener('click', onClick);
  return b;
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

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;
/** 会社ごとの色を、構築できるスタイルシートで渡す (style 属性を使わない。CSP の style-src 'self' に合う)。色は 16 進だけ。 */
export function installCompanyColors(companies: readonly { id: string; colors: { main: string; light: string } }[]): void {
  const rules = companies
    .filter((c) => /^[A-Za-z0-9_-]+$/.test(c.id) && SAFE_COLOR.test(c.colors.main) && SAFE_COLOR.test(c.colors.light))
    .map((c) => `.co-${c.id}{--company:${c.colors.main};--company-light:${c.colors.light}}`)
    .join('\n');
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(rules);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
