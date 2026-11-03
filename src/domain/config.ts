// ゲームの設定値 (docs/design.md §6)。数字を画面やテストに直書きしない。
export const ROUNDS_TO_CLEAR = 8;
export const MIN_POOL_PER_DIFFICULTY = 25;
/** 異変ありの比率。仮の既定 (要件に指定は無い。ビジネス側が Task #28 で確定する)。 */
export const ANOMALY_RATIO = 0.5;
/** 難易度ごとの異変の問題数が ANOMALY_RATIO × 問題数 から離れてよい幅 (問題数。design §4.3)。 */
export const ANOMALY_RATIO_TOLERANCE = 3;
/** 受け入れ条件 6 の「多め」の閾値 (design §4.5): やさしい = 見た目 + 計算、むずかしい = 会計 + 資料間 が異変の問題に占める割合の下限。 */
export const FAMILY_SHARE_MIN = { easy: 0.8, hard: 0.6 } as const;
