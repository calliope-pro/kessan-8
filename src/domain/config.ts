// ゲームの設定値 (docs/design.md §6)。数字を画面やテストに直書きしない。
import type { Difficulty } from './types';

/** 要件「8 社連続」。 */
export const ROUNDS_TO_CLEAR = 8;
/** 要件「25 問以上」(難易度ごと)。 */
export const MIN_POOL_PER_DIFFICULTY = 25;
/** 異変ありの比率。決定 (experience.md M6・open-decisions D-G4: 50%)。値を変えても他は変わらない。 */
export const ANOMALY_RATIO = 0.5;
/** 出題 (draw) が使う名前 (design §6 の `anomalyRatio`)。値の出所は ANOMALY_RATIO の 1 か所。 */
export const anomalyRatio = ANOMALY_RATIO;
/** 難易度ごとの異変の問題数が ANOMALY_RATIO × 問題数 から離れてよい幅 (問題数。design §4.3)。 */
export const ANOMALY_RATIO_TOLERANCE = 3;
/** 受け入れ条件 6 の「多め」の閾値 (design §4.5): やさしい = 見た目 + 計算、むずかしい = 会計 + 資料間 が異変の問題に占める割合の下限。 */
export const FAMILY_SHARE_MIN = { easy: 0.8, hard: 0.6 } as const;

/** 枠 (何社目か。0 始まり) ごとの狙いの段 (P1)。1〜2 社目 = 目立つ異変、3〜5 社目 = 中、6〜8 社目 = 紛らわしい異変。 */
export const TIER_BY_ROUND: readonly (1 | 2 | 3)[] = [1, 1, 2, 2, 2, 3, 3, 3];

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'hard'];
