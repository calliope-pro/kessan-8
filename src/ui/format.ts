// 表示の書式。負の記号 (△) を決めるのはこの 1 か所だけ (docs/design.md §4.1)。docs/test-cases/viewer.md §1。DOM を使わない。

/** 標準の負の記号。signOverrides (キー `<doc>.<path>`) があればそれに替える。 */
export const NEGATIVE_MARK = '△';
/** 値が無い (null) ときの表示。 */
export const EMPTY_MARK = '－';

export interface FormatOptions {
  /** 負の記号の上書き (signOverrides)。 */
  sign?: string;
}

/** 整数部に千区切りを付ける。 */
function group(fixed: string): string {
  const [int = '', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/** 桁数に丸めた絶対値の文字列と、符号を付けるか (丸めて 0 になる値には付けない)。 */
function round(value: number, digits: number): { body: string; negative: boolean } {
  const fixed = Math.abs(value).toFixed(digits);
  return { body: group(fixed), negative: value < 0 && Number(fixed) !== 0 };
}

function signed(value: number, digits: number, suffix: string, opts: FormatOptions): string {
  const { body, negative } = round(value, digits);
  return `${negative ? (opts.sign ?? NEGATIVE_MARK) : ''}${body}${suffix}`;
}

/** 金額。億円は小数第一位に固定、百万円は整数 (整数でない値は小数第一位で、隠さない)。 */
export function formatMoney(value: number | null, opts: FormatOptions & { unit?: string; digits?: number } = {}): string {
  if (value === null) return EMPTY_MARK;
  const digits = opts.digits ?? (opts.unit === '億円' || !Number.isInteger(value) ? 1 : 0);
  return signed(value, digits, '', opts);
}

/** 比率 (%)。小数第一位。 */
export function formatPercent(value: number, opts: FormatOptions = {}): string {
  return signed(value, 1, '%', opts);
}

/** 1 株当たり (円)。小数第二位。 */
export function formatPerShare(value: number, opts: FormatOptions = {}): string {
  return signed(value, 2, '円', opts);
}

/** 比率の差 (ポイント)。桁は digits。 */
export function formatPoints(value: number, digits = 1, opts: FormatOptions = {}): string {
  return signed(value, digits, 'ポイント', opts);
}

/** 株数 (千株) などの整数。 */
export function formatCount(value: number, opts: FormatOptions = {}): string {
  return signed(value, 0, '', opts);
}

/** ISO の日付 (YYYY-MM-DD) → 2027年3月31日。日付でなければそのまま。 */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

export function formatFlag(value: boolean): string {
  return value ? 'あり' : 'なし';
}
