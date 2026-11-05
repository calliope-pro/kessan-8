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
