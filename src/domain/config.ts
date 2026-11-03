// ゲームの設定値 (docs/design.md §6)。数字を画面やテストに直書きしない。
import type { Difficulty } from './types';

/** 要件「8 社連続」。 */
export const ROUNDS_TO_CLEAR = 8;
/** 要件「25 問以上」(難易度ごと)。 */
export const MIN_POOL_PER_DIFFICULTY = 25;
/** 異変ありにする枠の確率。決定 (experience.md M6・open-decisions D-G4: 50%)。値を変えても他は変わらない。 */
export const anomalyRatio = 0.5;

/** 枠 (何社目か。0 始まり) ごとの狙いの段 (P1)。1〜2 社目 = 目立つ異変、3〜5 社目 = 中、6〜8 社目 = 紛らわしい異変。 */
export const TIER_BY_ROUND: readonly (1 | 2 | 3)[] = [1, 1, 2, 2, 2, 3, 3, 3];

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'hard'];
