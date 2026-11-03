// docs/test-cases/viewer.md §1 (A1〜A10): 表示の書式。負の記号 (△) を決めるのはこの 1 か所だけ。
import { describe, expect, it } from 'vitest';
import { formatDate, formatFlag, formatMoney, formatPercent, formatPerShare } from './format';

describe('formatMoney', () => {
  it('A1: 百万円は千区切り、負は △、null は －', () => {
    expect(formatMoney(12400)).toBe('12,400');
    expect(formatMoney(1234567)).toBe('1,234,567');
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(-90)).toBe('△90');
    expect(formatMoney(-1234567)).toBe('△1,234,567');
    expect(formatMoney(null)).toBe('－');
  });

  it('A2: 億円は小数第一位に固定', () => {
    expect(formatMoney(124.6, { unit: '億円' })).toBe('124.6');
    expect(formatMoney(125, { unit: '億円' })).toBe('125.0');
    expect(formatMoney(-30.2, { unit: '億円' })).toBe('△30.2');
    expect(formatMoney(0, { unit: '億円' })).toBe('0.0');
    expect(formatMoney(1234.5, { unit: '億円' })).toBe('1,234.5');
  });

  it('A3: 百万円でも整数でない値は小数を隠さない', () => {
    expect(formatMoney(124.6)).toBe('124.6');
  });

  it('A9: 負の記号を上書きできる (正の数・0 には付かない)', () => {
    expect(formatMoney(-90, { sign: '▲' })).toBe('▲90');
    expect(formatMoney(90, { sign: '▲' })).toBe('90');
    expect(formatMoney(0, { sign: '▲' })).toBe('0');
  });

  it('A10: 浮動小数の誤差は表示の桁に丸め、-0 は 0', () => {
    expect(formatMoney(0.1 + 0.2, { unit: '億円' })).toBe('0.3');
    expect(formatMoney(-0)).toBe('0');
    expect(formatMoney(124.6 - 30.2, { unit: '億円' })).toBe('94.4');
  });
});

describe('formatPercent', () => {
  it('A4: 小数第一位と %、負は △、丸めて 0 になる負は符号を付けない', () => {
    expect(formatPercent(5.1)).toBe('5.1%');
    expect(formatPercent(-2.3)).toBe('△2.3%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(-0.04)).toBe('0.0%');
    expect(formatPercent(12.34)).toBe('12.3%');
  });
  it('A9: 負の記号の上書き / A10: 誤差', () => {
    expect(formatPercent(-2.3, { sign: '▲' })).toBe('▲2.3%');
    expect(formatPercent(0.1 + 0.2)).toBe('0.3%');
  });
});

describe('formatPerShare', () => {
  it('A5: 小数第二位と 円、負は △', () => {
    expect(formatPerShare(954.42)).toBe('954.42円');
    expect(formatPerShare(30)).toBe('30.00円');
    expect(formatPerShare(0)).toBe('0.00円');
    expect(formatPerShare(-1.5)).toBe('△1.50円');
    expect(formatPerShare(1234.5)).toBe('1,234.50円');
  });
});

describe('formatDate', () => {
  it('A6: YYYY-MM-DD → YYYY年M月D日 (月日は 0 を付けない)', () => {
    expect(formatDate('2027-03-31')).toBe('2027年3月31日');
    expect(formatDate('2028-02-29')).toBe('2028年2月29日');
    expect(formatDate('2027-05-04')).toBe('2027年5月4日');
  });
  it('A7: 日付でない文字列はそのまま (隠さない)', () => {
    expect(formatDate('abc')).toBe('abc');
    expect(formatDate('2027-3-31')).toBe('2027-3-31');
    expect(formatDate('')).toBe('');
  });
});

describe('formatFlag', () => {
  it('A8: true → あり、false → なし', () => {
    expect(formatFlag(true)).toBe('あり');
    expect(formatFlag(false)).toBe('なし');
  });
});
