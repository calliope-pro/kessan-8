// 画面の中身 (DOM を使わない。buildScreen の出力)。docs/test-cases/viewer.md §0。
import type { CellKind, Stage } from '../../domain/cell';
import type { DocKind } from '../../domain/types';

export type CellValue = number | string | boolean | null;

/** 画面のセル 1 つ。`path` は `<doc>.<path>` で、DOM の `data-path` と同じ文字列。 */
export interface ViewCell {
  path: string;
  /** itemKey(doc, path)。 */
  itemKey: string;
  /** 問題データの値そのまま (表示のために計算しない)。 */
  value: CellValue;
  /** 表示の文字列 (書式関数が value から作る)。 */
  text: string;
  kind: CellKind;
  /** 表示の単位 (上書きの後)。金額 = 画面の単位、比率 = %、1 株当たり = 円、株数 = 千株、それ以外 = null。 */
  unit: string | null;
  stage: Stage | null;
  /** 画面の中の表示の順 (検算で段が同じときの向きに使う)。 */
  order: number;
}

/** 列の見出し。cell は見出しの中の日付・名前のセル (列の期末日、セグメント名)。 */
export interface ViewColumn {
  label: string;
  cell: ViewCell | null;
}

/** 表の 1 行。label は行の名前 (項目キーが data-item-key)。cells は列と同じ並び (無ければ null)。 */
export interface ViewRow {
  itemKey: string;
  label: string;
  emphasis: boolean;
  cells: (ViewCell | null)[];
}

export interface ViewSection {
  title: string | null;
  /** 節の見出しの中の名前のセル (IR のセグメント名)。 */
  titleCell: ViewCell | null;
  columns: ViewColumn[];
  rows: ViewRow[];
}

/** グラフの棒。fraction は大きい方を 1 とした高さの割合。 */
export interface ViewBar {
  stage: 'previous' | 'current';
  cell: ViewCell;
  fraction: number;
}

export interface ViewChart {
  itemKey: string;
  label: string;
  axisItemKey: string;
  axisLabel: string;
  axisMin: ViewCell;
  bars: ViewBar[];
}

export interface ViewScreen {
  doc: DocKind;
  id: string;
  title: string;
  header: {
    companyName: ViewCell;
    securitiesCode: ViewCell;
    periodLabel: ViewCell;
    /** 表示の単位。unitOverrides があればその画面の要素 (`<doc>.<画面>.unit`)、無ければ `<doc>.header.unit`。 */
    unit: ViewCell;
    /** 見出しの中のそのほかのセル (CF の前期末の日付)。 */
    extra?: ViewCell[];
  };
  sections: ViewSection[];
  charts: ViewChart[];
  /** この画面の文章 (IR)。 */
  sentences: ViewCell[];
}
