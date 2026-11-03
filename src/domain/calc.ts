// 検算: 印を付けた 2 つの数字の差と比 (遊び手の道具。正否は教えない)。docs/test-cases/viewer.md §5.2。DOM を使わない。
// 表示の文字列まで作る (書式は ui/format.ts が決める。domain から ui を読む逆向きの依存を避けるため、ここでは文字列の組み立てだけ持つ)。
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

export interface CalcResult {
  comparable: boolean;
  /** 表示の行。比べられる組は 2 行 (差・比)、比べられない組は 1 行。 */
  lines: string[];
}

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

const NEG = '△';
const group = (fixed: string) => fixed.replace(/^(\d+)/, (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
/** 符号つきの文字列 (負は △)。丸めて 0 になる負には付けない。 */
function fmt(value: number, digits: number, suffix = ''): string {
  const fixed = Math.abs(value).toFixed(digits);
  return `${value < 0 && Number(fixed) !== 0 ? NEG : ''}${group(fixed)}${suffix}`;
}

/**
 * 2 つのセルを比べる。A = 段の序列の高い方 (同じなら表示の順の早い方)、差 = A − B、比 = A ÷ B。渡す順に依らない。
 * 差は 10^桁 倍した整数で引く (億円の 124.6 − 30.2 が 94.39999999999999 にならないように)。
 */
export function compareCells(x: CalcCell, y: CalcCell): CalcResult {
  if (!isNumber(x) || !isNumber(y)) return { comparable: false, lines: ['比べられない (数字ではない)'] };
  if (x.kind !== y.kind || x.unit !== y.unit) return { comparable: false, lines: ['比べられない (単位が違う)'] };
  const [a, b] = rank(x) !== rank(y) ? (rank(x) > rank(y) ? [x, y] : [y, x]) : x.order <= y.order ? [x, y] : [y, x];
  const digits = Math.max(baseDigits(a), needed(a.value), needed(b.value));
  const scale = 10 ** digits;
  const diff = (Math.round(a.value * scale) - Math.round(b.value * scale)) / scale;
  const suffix = a.kind === 'percent' ? 'ポイント' : a.kind === 'perShare' ? '円' : '';
  const ratio = Math.round(b.value * scale) === 0 ? '－' : fmt(a.value / b.value, 2);
  return { comparable: true, lines: [`差 ${fmt(diff, digits, suffix)}`, `比 ${ratio}`] };
}
