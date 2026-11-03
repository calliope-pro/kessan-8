// 丸めと換算 (docs/test-cases/validator.md §0・§1)。作成要領の端数処理: 0.5 は絶対値の大きい側へ。整数だけで計算する。
import type { Company } from '../domain/types.ts';

/** num ÷ den を、0.5 を絶対値の大きい側へ丸めた整数にする。 */
export function roundHalfAway(num: number, den: number): number {
  if (den === 0) throw new Error('0 で割れません');
  const negative = num < 0 !== den < 0;
  const n = Math.abs(num);
  const d = Math.abs(den);
  const q = Math.floor((2 * n + d) / (2 * d));
  return negative ? -q : q;
}

/** 百万円の整数を、IR の単位の値にする。億円は ÷100 を小数第一位まで。 */
export function toIrUnit(millions: number, unit: Company['irUnit']): number {
  return unit === '億円' ? roundHalfAway(millions, 10) / 10 : millions;
}

/** 比較に使う 10 倍した整数 (浮動小数の誤差を避ける。124.6 − 30.2 は素の引き算では 94.4 にならない)。 */
export function scaled10(x: number): number {
  return Math.round(x * 10);
}

/** 百万円の整数を、IR の単位の値を 10 倍した整数にする (scaled10(toIrUnit(v, unit)) と同じ)。 */
export function irScaled(millions: number, unit: Company['irUnit']): number {
  return unit === '億円' ? roundHalfAway(millions, 10) : millions * 10;
}

/** 1 株当たり配当 (円) × 株数 (千株) ÷ 1,000 を、百万円未満切捨てにした整数。 */
export function dividendAmount(perShareYen: number, sharesThousand: number): number {
  const n = Math.round(perShareYen * 100) * sharesThousand;
  return (n - (n % 100000)) / 100000;
}

/** 表示した % (小数第一位) を 10 倍した整数に。 */
export const tenths = (x: number): number => Math.round(x * 10);
/** 表示した円 (小数第二位) を 100 倍した整数に。 */
export const hundredths = (x: number): number => Math.round(x * 100);
