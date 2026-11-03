// 異変の場所の強調 (答え合わせ。#28 が highlights に渡す)。印の照合 (domain/marks.ts の matchMarks) と同じ規則。docs/test-cases/viewer.md §5.3。
import type { AnomalyPlace } from '../../domain/types';

/** 画面の要素の記述: 数字・文のセルは `path` (`<doc>.<path>`)、行の名前の要素は `itemKey`。 */
export interface ElementRef {
  path?: string;
  itemKey?: string;
}

/**
 * place の path の場所は、同じ path・祖先・子孫の要素を強調する (. 区切りの前方一致。
 * `ir.segments.items.0.netSales` の場所は `….netSales.current` のセルを、`ir.statements.0.text` の場所は文のセル `ir.statements.0` を)。
 * place の itemKey の場所は、同じ項目キーの行の名前の要素だけ。path の場所は行の名前の要素を強調しない。
 */
export function placeHitsElement(place: AnomalyPlace, el: ElementRef): boolean {
  if ('itemKey' in place) return el.itemKey !== undefined && el.itemKey === place.itemKey;
  if (el.path === undefined) return false;
  const target = `${place.doc}.${place.path}`;
  return el.path === target || el.path.startsWith(`${target}.`) || target.startsWith(`${el.path}.`);
}
