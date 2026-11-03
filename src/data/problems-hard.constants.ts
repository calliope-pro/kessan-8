// ゲームの設定値 (docs/design.md §6 の ANOMALY_RATIO) は検証器 (Task #23) の src/domain/config.ts にある。
// config.ts が main に入るまでの間、設計表のテストが使う値をここに置く。config.ts が入ったら、この値を config.ts の ANOMALY_RATIO に置き換える。
export const ANOMALY_RATIO_PLACEHOLDER = 0.5;
