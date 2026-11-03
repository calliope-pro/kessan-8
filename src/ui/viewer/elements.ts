// 1 画面の「場所になりうる要素」の一覧 (path を持つセルと、項目キーを持つ行の名前)。強調・検算・画面の特定が同じ一覧を使う。DOM を使わない。
import type { ViewCell, ViewScreen } from './types';

/** path を持つセル (見出し・列見出し・節の見出し・行・グラフ・文章)。DOM の data-path を持つ要素と同じ。 */
export function screenCells(s: ViewScreen): ViewCell[] {
  const h = s.header;
  return [
    h.companyName, h.securitiesCode, h.periodLabel, h.unit, ...(h.extra ?? []),
    ...s.sections.flatMap((sec) => [
      ...(sec.titleCell ? [sec.titleCell] : []),
      ...sec.columns.flatMap((c) => (c.cell ? [c.cell] : [])),
      ...sec.rows.flatMap((r) => r.cells.flatMap((c) => (c ? [c] : []))),
    ]),
    ...s.charts.flatMap((c) => [c.axisMin, ...c.bars.map((b) => b.cell)]),
    ...s.sentences,
  ];
}

/** 項目キーを持つ行の名前の要素 (グラフの題・軸の下端の見出しを含む)。DOM の data-item-key を持つ要素と同じ。 */
export function screenNameKeys(s: ViewScreen): string[] {
  return [...s.sections.flatMap((sec) => sec.rows.map((r) => r.itemKey)), ...s.charts.flatMap((c) => [c.itemKey, c.axisItemKey])];
}
