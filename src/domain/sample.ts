// 見本 (P0)。正常な資料束 1 つ + 画面ごとの注釈。プールの外で、両方の難易度で共有する (docs/design.md §4.3)。
import type { Problem } from './types';

export interface Sample {
  /** 正常な問題 (`anomaly: null`)。 */
  problem: Problem;
  /** 画面 ID → 注釈の文。 */
  notes: Record<string, string>;
}
