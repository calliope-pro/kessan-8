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

/**
 * claims から作る語 (見出し語・資料 2 の営業 CF の文) が、正常な問題に両方の向きで出るための下限 (docs/design-v3.md §1.5 R-S5 (f))。
 * 難易度ごとの正常な問題で、その向きを持つ会社の数。値は仮定 (減益は今の正常 28 問の 3/28 に合わせた水準。営業 CF のマイナスは最小の 1 社)。売上高の主張は使わない (カードに前期の売上高が無い)。
 */
export const CLAIM_DOWN_MIN_COMPANIES = { operatingIncome: 3, operatingCashFlow: 1 } as const;
/** 難易度ごとに、カードに語が出る主張 (やさしい = 見出し語、むずかしい = 見出し語と資料 2 の営業 CF の文)。 */
export const CLAIMS_SHOWN: Record<Difficulty, readonly (keyof typeof CLAIM_DOWN_MIN_COMPANIES)[]> = { easy: ['operatingIncome'], hard: ['operatingIncome', 'operatingCashFlow'] };

/** 難易度ごとの問題の数 (docs/design-v3.md §1.5。やさしい = 15 種類 × 5 問 + 正常 10、むずかしい = 11 × 7 + 9 × 5 + 10)。要件の「25 問以上」(MIN_POOL_PER_DIFFICULTY) とは別に、種類の出方を均すのに要る数。 */
export const CARD_POOL_SIZE: Record<Difficulty, number> = { easy: 85, hard: 132 };
/** 種類ごとの異変の問題の数と、その種類を持つ会社の下限 (設計 §1.5・§2.3)。むずかしいの会計・資料間は 7 問 (系統の割合 0.6 のため)。 */
export const KIND_PROBLEMS = { default: 5, heavy: 7 } as const;
export const KIND_MIN_COMPANIES = 5;
/** 段ごとに、会社どうしが持つ異変の問題の数の差の上限 (設計 §2.7 の tier-balance)。 */
export const TIER_BALANCE_MAX_GAP = 1;
