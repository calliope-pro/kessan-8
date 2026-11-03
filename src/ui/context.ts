// 画面 (ui/screens-*.ts) が使う、アプリの状態と操作の束。
import type { Action, GameState } from '../domain/game';
import type { Pools } from '../domain/pool';
import type { Records } from '../domain/records';
import type { Sample } from '../domain/sample';
import type { ScreenRef } from '../domain/screen';
import type { KeyValueStore } from '../domain/storage';
import type { AnomalyKind, Company, Difficulty, Problem } from '../domain/types';
import type { CreateViewer, ViewerProps } from './viewer-port';

export interface AppDeps {
  pools: Pools;
  companies: readonly Company[];
  kinds: readonly AnomalyKind[];
  sample: Sample | undefined;
  /** 走行を保存する先 (sessionStorage)。 */
  session: KeyValueStore;
  /** 記録・履歴・見本の済を保存する先 (localStorage)。 */
  local: KeyValueStore;
  createViewer: CreateViewer;
  /** `?seed=N`。n 回目の出題の乱数の種は seed + draws。無ければ Math.random。 */
  seed: number | undefined;
}

/** 画面だけの状態 (保存しない。再読み込みで消える)。docs/design.md §5.2。 */
export interface Local {
  /** main = 状態 (phase) の画面。help = 遊びかた (SCH)。sample = 見本 (SC2)。intro = 会社の導入 (SC3)。restart = 最初へ戻る (SC6)。 */
  screen: 'main' | 'help' | 'sample' | 'intro' | 'restart';
  /** 見本の開きかた。pre = 難易度を選んだあとの、遊ぶ前 (「始める」がある)。browse = 見るだけ (閉じると元の画面)。 */
  sampleMode: 'pre' | 'browse';
  /** 見本を開いた元の画面 (閉じると戻る)。 */
  sampleFrom: 'help' | 'difficulty';
  /** 遊ぶ前の見本のあとに始める難易度。 */
  pending: Difficulty | undefined;
  sampleView: ScreenRef;
  /** 「タイトルへ」の確認を出しているか。 */
  confirm: boolean;
  /** 判定のパネルが開いているか。 */
  panel: boolean;
  /** 答え合わせで見ている場所の番号 (0 始まり。場所が 2 つ以上の異変のとき)。 */
  placeIndex: number;
  /** 判定を書き込む前の最高到達 (最初へ戻る画面で、自己ベストを示す)。 */
  bestBefore: number;
}

export interface Ctx {
  state: GameState;
  local: Local;
  records: Records;
  deps: AppDeps;
  dispatch(action: Action): void;
  patch(change: Partial<Local>): void;
  /** その難易度で遊べるか (プールが出題の条件を満たすか)。 */
  available(difficulty: Difficulty): boolean;
  /** 難易度を選んだとき: 見本の済でなければ見本、済なら出題して始める。 */
  choose(difficulty: Difficulty): void;
  /** 見本のあとに始める (見本の済にする)。 */
  begin(difficulty: Difficulty): void;
  /** 「もう一度」(新しい出題で 1 社目)。不正解のあと (RESTART) とクリアのあと (PICK)。 */
  restart(): void;
  /** 見本を閉じる (元の画面に戻る)。 */
  closeSample(): void;
  companyOf(problem: Problem): Company | undefined;
  /** 資料束の表示を使う。同じ要素を使い回して更新する。 */
  viewer(props: ViewerProps, onView: (ref: ScreenRef) => void): HTMLElement;
  /** 「タイトルへ」(走行中は確認を挟む)。 */
  titleLink(): HTMLElement;
}
