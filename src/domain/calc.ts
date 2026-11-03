// 検算: 印を付けた 2 つの数字の差と比 (遊び手の道具。正否は教えない)。docs/test-cases/viewer.md §5.2。DOM を使わない。
// 数値だけを返す。文字 (△・桁区切り・ポイント) にするのは ui/viewer/calc-lines.ts が ui/format.ts の書式で行う
// (負の記号を決めるのは format.ts の 1 か所だけ。設計 §4.1)。
import type { CellKind, Stage } from './cell';

export type { CellKind, Stage };

/** 検算に渡すセルの記述。order は資料の中で表示される順 (段が同じときの向きに使う)。 */
export interface CalcCell {
  path: string;
  value: number | string | boolean | null;
  kind: CellKind;
  /** 表示の単位 (上書きの後)。 */
  unit: string | null;
  stage: Stage | null;
  order: number;
}

export type CalcResult =
  | { comparable: false; reason: 'not-number' | 'unit' }
  | {
      comparable: true;
      kind: CellKind;
      unit: string | null;
      /** 差と比の表示の小数の桁 (差)。 */
      digits: number;
      /** 差 = A − B (10^桁 倍した整数で引いた値)。 */
      diff: number;
      /** 比 = A ÷ B。B が 0 のときは null。 */
      ratio: number | null;
    };

/** 段の序列: 前期 < 当期・実績 < 予想 (段が無いものは当期と同じ)。 */
const RANK: Record<Stage, number> = { previous: 0, current: 1, actual: 1, forecast: 2 };
const rank = (c: CalcCell) => (c.stage === null ? 1 : RANK[c.stage]);

/** 小数の桁の標準 (種別と単位から)。 */
function baseDigits(c: CalcCell): number {
  if (c.kind === 'percent') return 1;
  if (c.kind === 'perShare') return 2;
  if (c.kind === 'money') return c.unit === '億円' ? 1 : 0;
  return 0;
}
/** 値が必要とする小数の桁 (最大 2)。 */
const needed = (v: number) => (Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2);

const isNumber = (c: CalcCell): c is CalcCell & { value: number } =>
  typeof c.value === 'number' && (c.kind === 'money' || c.kind === 'percent' || c.kind === 'perShare' || c.kind === 'shares');

/**
 * 2 つのセルを比べる。A = 段の序列の高い方 (同じなら表示の順の早い方)、差 = A − B、比 = A ÷ B。渡す順に依らない。
 * 差は 10^桁 倍した整数で引く (億円の 124.6 − 30.2 が 94.39999999999999 にならないように)。
 */
export function compareCells(x: CalcCell, y: CalcCell): CalcResult {
  if (!isNumber(x) || !isNumber(y)) return { comparable: false, reason: 'not-number' };
  if (x.kind !== y.kind || x.unit !== y.unit) return { comparable: false, reason: 'unit' };
  const [a, b] = rank(x) !== rank(y) ? (rank(x) > rank(y) ? [x, y] : [y, x]) : x.order <= y.order ? [x, y] : [y, x];
  const digits = Math.max(baseDigits(a), needed(a.value), needed(b.value));
  const scale = 10 ** digits;
  const diff = (Math.round(a.value * scale) - Math.round(b.value * scale)) / scale;
  return { comparable: true, kind: a.kind, unit: a.unit, digits, diff, ratio: Math.round(b.value * scale) === 0 ? null : a.value / b.value };
}
