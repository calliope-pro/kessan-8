// 道具バー (SC4-6): 印スイッチ・検算の結果 (最大 2 行)・右端の要素 (#28 の「判定する」)。画面の下に固定。docs/test-cases/viewer.md F6〜F10。
import { compareCells } from '../../domain/calc';
import type { Problem } from '../../domain/types';
import { calcLines } from './calc-lines';
import { h } from './dom';
import { cellLookup } from './lookup';

export interface Toolbar {
  el: HTMLElement;
  /** 印スイッチの入切。 */
  readonly marking: boolean;
  onSwitch(fn: (on: boolean) => void): void;
  /** 検算の欄を更新する。marks の直近の 2 つが対象 (付けた順)。 */
  update(problem: Problem, marks: readonly string[], end: HTMLElement | undefined): void;
}

const HINT = '2 つ選ぶと検算できます';

export function createToolbar(): Toolbar {
  const sw = h('button', { type: 'button', class: 'mark-switch', 'aria-pressed': 'false', 'aria-label': '印' }, '印');
  const calc = h('div', { class: 'calc', 'aria-live': 'polite' });
  const end = h('div', { class: 'toolbar-end' });
  const el = h('div', { class: 'toolbar' }, h('div', { class: 'toolbar-in' }, sw, calc, end));
  let marking = false;
  let shown = '';
  let listener: (on: boolean) => void = () => {};
  sw.addEventListener('click', () => {
    marking = !marking;
    sw.setAttribute('aria-pressed', String(marking));
    listener(marking);
  });
  return {
    el,
    get marking() {
      return marking;
    },
    onSwitch(fn) {
      listener = fn;
    },
    update(problem, marks, slot) {
      const lines = (() => {
        if (marks.length >= 2) {
          const lookup = cellLookup(problem);
          const [a, b] = marks.slice(-2).map((k) => lookup.get(k) ?? { path: k, value: null, kind: 'text' as const, unit: null, stage: null, order: 0 });
          return calcLines(compareCells(a!, b!));
        }
        return marking ? [HINT] : [];
      })();
      // 同じ文字なら作り直さない (aria-live の読み上げが、画面を移るたびに繰り返されないように)
      const text = lines.join('\n');
      if (text !== shown) {
        shown = text;
        calc.replaceChildren(...lines.map((l) => h('div', { class: 'calc-line' }, l)));
      }
      if (slot) {
        if (slot.parentElement !== end) end.replaceChildren(slot);
      } else end.replaceChildren();
    },
  };
}
