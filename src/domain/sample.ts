// 見本 (0 社目)。正常な問題 1 つ。プールの外で、両方の難易度で共有する (docs/design-v3.md §1.2・§1.3。画面ごとの注釈は無い)。
import type { Problem } from './types';

export interface Sample {
  /** 正常な問題 (`anomaly: null`)。 */
  problem: Problem;
}
