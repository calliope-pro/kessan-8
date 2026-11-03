// 資料束の表示 (Task #57) との接ぎ目。#28 (遊びの流れ) がこの口を呼び、#57 が `src/ui/viewer/index.ts` で `createViewer` を実装する。
// 実体は #57 の `src/ui/viewer/index.ts`。使う側の import は 1 行 (src/ui/viewer-impl.ts) だけ。
import type { ScreenRef } from '../domain/screen';
import type { AnomalyPlace, DocKind, Problem } from '../domain/types';

/** 資料束の 1 画面。保存する状態の型なので、持ち主は domain (src/domain/screen.ts)。ここは再エクスポート。 */
export type { ScreenRef };

export interface ViewerProps {
  /** 1 社の資料束。 */
  problem: Problem;
  /** いま見ている画面。#28 の状態が持つ (reading でも revealed でも)。 */
  view: ScreenRef;
  /**
   * 印を付けた場所のキー (#28 の状態 `reading.marks` が持つ)。キーの形:
   * 数字・文のセルは `data-path` と同じ文字列 (`<doc>.<path>`。例 `tanshin.incomeStatement.current.ordinaryIncome`)、
   * 行の名前は `<doc>.item:<itemKey>` (項目キーは docs/design.md §4.1。例 `tanshin.item:tanshin.incomeStatement.ordinaryIncome`。数字のセルの `data-path` と区別するため `item:` を付ける)。
   */
  marks: readonly string[];
  /** 答え合わせで強調する場所。強調は、該当の要素 (`data-path` / `data-item-key`) に `data-highlight="true"` を付ける。reading では空。 */
  highlights: readonly AnomalyPlace[];
  /** read = 道具 (印・検算) が使える。check = 答え合わせ (印は表示だけ。道具バーは出さない)。 */
  mode: 'read' | 'check';
  /** 道具バーの右端に置く要素 (#28 の「判定する」ボタン。SC4-9)。mode = read のときだけ。 */
  toolbarEnd?: HTMLElement;
}

export interface ViewerEvents {
  /** 資料のページ送り (タブ・前へ・次へ) で、見る画面が変わった。 */
  onView(ref: ScreenRef): void;
  /** 印の付け外し。印の状態は #28 が持つので、#57 は押されたキーを返すだけ。 */
  onToggleMark(key: string): void;
}

export interface Viewer {
  /** 同じ要素を使い回して更新する (印のスイッチ・検算の選択など #57 の内部の状態を保つため)。 */
  update(props: ViewerProps): void;
  destroy(): void;
}

export type CreateViewer = (host: HTMLElement, events: ViewerEvents) => Viewer;

export type { DocKind };

/**
 * 異変の場所がある画面 (答え合わせの最初の画面・「場所 n」のボタン)。どの場所がどの画面に出るかは、ビューアの画面の中身だけが知る
 * (path の先頭は画面の ID とは限らない: columnDates・dates・statements)。実体は `src/ui/viewer/screen-of.ts`。
 */
export type ScreenOfPlace = (problem: Problem, place: AnomalyPlace) => ScreenRef;
