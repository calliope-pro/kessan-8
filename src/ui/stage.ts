// 舞台 (V2): 何社目かから決まる時刻と段。実際の時計は使わない (テストが決定的になる)。
export const STAGE_COUNT = 8;
/** クリアの朝の表示。 */
export const MORNING_LABEL = '翌朝 6:00';

const LABELS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '翌 0:00', '翌 1:00'] as const;

/** 何社目か (0 始まり) の時刻。 */
export function timeLabel(round: number): string {
  return LABELS[Math.min(Math.max(round, 0), LABELS.length - 1)]!;
}
