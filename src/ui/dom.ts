// DOM を作る最小の道具。style 属性は作らない (CSP の style-src 'self')。状態は data- 属性と class で表す。
type Attr = string | number | boolean | undefined | ((e: Event) => void);
export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Attr> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'style') throw new Error('style 属性は使えません (CSP)');
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value);
    else if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/** ボタン (type=button)。 */
export function button(label: string, onClick: () => void, extra: Record<string, Attr> = {}): HTMLButtonElement {
  return h('button', { type: 'button', ...extra, onclick: onClick }, label);
}
