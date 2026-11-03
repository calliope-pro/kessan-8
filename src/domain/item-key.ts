// 項目キー (docs/design.md §4.1): path から、期・予実の段と末尾の changeRate・amount を除き、資料の種類を頭に付けたもの。
// 設計は `domain/labels.ts` の `itemKey(doc, path)` と書いている。labels.ts が main に入ったら、この関数はそちらを再エクスポートに替える。
import type { DocKind } from './types';

const PERIODS = new Set(['previous', 'current', 'forecast', 'actual']);
const TRAILING = new Set(['changeRate', 'amount']);

export function itemKey(doc: DocKind, path: string): string {
  const segments = path.split('.').filter((s) => !PERIODS.has(s));
  const last = segments[segments.length - 1];
  if (segments.length > 1 && last !== undefined && TRAILING.has(last)) segments.pop();
  return [doc, ...segments].join('.');
}
