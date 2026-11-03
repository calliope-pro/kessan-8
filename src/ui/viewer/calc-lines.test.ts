// docs/test-cases/viewer.md §5.2 (D3〜D15): 検算の表示の行 (差と比の文字。数値は domain/calc.ts、文字にするのは ui/format.ts の書式)。
import { describe, expect, it } from 'vitest';
import { compareCells, type CalcCell } from '../../domain/calc';
import { calcLines } from './calc-lines';

const lines = (a: CalcCell, b: CalcCell) => calcLines(compareCells(a, b));

const cell = (over: Partial<CalcCell> & Pick<CalcCell, 'value'>): CalcCell => ({
  path: 'tanshin.x',
  kind: 'money',
  unit: '百万円',
  stage: null,
  order: 0,
  ...over,
});

describe('calcLines: 比べられる組', () => {
  it('D3: 当期 − 前期、当期 ÷ 前期。渡す順に依らない', () => {
    const cur = cell({ value: 12400, stage: 'current', order: 1 });
    const prev = cell({ value: 11800, stage: 'previous', order: 0 });
    for (const [a, b] of [[cur, prev], [prev, cur]] as const) {
      expect(compareCells(a, b).comparable).toBe(true);
      expect(lines(a, b)).toEqual(['差 600', '比 1.05']);
    }
  });

  it('D4: 前期が大きい組は差が負 (△)、比は小数第二位', () => {
    const r = lines(cell({ value: 800, stage: 'current' }), cell({ value: 1000, stage: 'previous' }));
    expect(r).toEqual(['差 △200', '比 0.80']);
  });

  it('D5: 段が同じ・無い組は、表示の順の早い方 − 遅い方 (渡す順に依らない)', () => {
    const sales = cell({ value: 12400, stage: 'current', order: 3 });
    const op = cell({ value: 1240, stage: 'current', order: 9 });
    expect(lines(sales, op)).toEqual(['差 11,160', '比 10.00']);
    expect(lines(op, sales)).toEqual(['差 11,160', '比 10.00']);
    const x = cell({ value: 10, order: 2 });
    const y = cell({ value: 4, order: 1 });
    expect(lines(x, y)).toEqual(['差 △6', '比 0.40']); // y (order 1) が A: 4 − 10
  });

  it('D6: 段の序列は 前期 < 当期・実績 < 予想', () => {
    const forecast = cell({ value: 13000, stage: 'forecast', order: 5 });
    const actual = cell({ value: 12400, stage: 'actual', order: 4 });
    expect(lines(actual, forecast)).toEqual(['差 600', '比 1.05']);
    const prev = cell({ value: 11800, stage: 'previous', order: 0 });
    expect(lines(prev, actual)).toEqual(['差 600', '比 1.05']);
  });

  it('D7: 億円は 10 倍した整数で計算する (浮動小数の誤差が出ない)', () => {
    const a = cell({ value: 124.6, unit: '億円', stage: 'current', order: 1 });
    const b = cell({ value: 30.2, unit: '億円', stage: 'current', order: 5 });
    expect(124.6 - 30.2).not.toBe(94.4); // 罠: 94.39999999999999
    expect(lines(a, b)).toEqual(['差 94.4', '比 4.13']);
  });

  it('D8: 比率は ポイント', () => {
    const a = cell({ value: 54.0, kind: 'percent', unit: '%', stage: 'current' });
    const b = cell({ value: 50.0, kind: 'percent', unit: '%', stage: 'previous' });
    expect(lines(a, b)).toEqual(['差 4.0ポイント', '比 1.08']);
    expect(lines(b, a)).toEqual(['差 4.0ポイント', '比 1.08']);
  });

  it('D9: 1 株当たり', () => {
    const a = cell({ value: 954.42, kind: 'perShare', unit: '円', stage: 'current' });
    const b = cell({ value: 900, kind: 'perShare', unit: '円', stage: 'previous' });
    expect(lines(a, b)).toEqual(['差 54.42円', '比 1.06']);
  });

  it('D10: 10 桁の金額も整数で計算して丸めない', () => {
    const a = cell({ value: 1234567890, order: 1 });
    const b = cell({ value: 1, order: 2 });
    expect(lines(a, b)).toEqual(['差 1,234,567,889', '比 1,234,567,890.00']);
  });

  it('D13: B が 0 のとき、比は － (0 で割らない)', () => {
    const r = compareCells(cell({ value: 1240, order: 1 }), cell({ value: 0, order: 2 }));
    expect(lines(cell({ value: 1240, order: 1 }), cell({ value: 0, order: 2 }))).toEqual(['差 1,240', '比 －']);
    expect(r.comparable).toBe(true);
  });
});

describe('calcLines: 比べられない組', () => {
  it('D11: 種別・単位が違う', () => {
    const money = cell({ value: 100 });
    const pct = cell({ value: 5.1, kind: 'percent', unit: '%' });
    const perShare = cell({ value: 30, kind: 'perShare', unit: '円' });
    const shares = cell({ value: 8600, kind: 'shares', unit: '千株' });
    const oku = cell({ value: 12.3, unit: '億円' });
    const sen = cell({ value: 100, unit: '千円' });
    for (const [a, b] of [[money, pct], [money, perShare], [money, oku], [shares, money], [sen, money]] as const) {
      expect(compareCells(a, b).comparable).toBe(false);
      expect(lines(a, b)).toEqual(['比べられない (単位が違う)']);
    }
  });

  it('D11: 表示の単位 (上書きの後) で決める。同じ表示の単位なら比べられる', () => {
    const a = cell({ value: 100, unit: '千円', order: 1 });
    const b = cell({ value: 40, unit: '千円', order: 2 });
    expect(lines(a, b)).toEqual(['差 60', '比 2.50']);
  });

  it('D12: 数字でない組', () => {
    for (const other of [
      cell({ value: '該当事項はありません。', kind: 'text', unit: null }),
      cell({ value: '2027-03-31', kind: 'date', unit: null }),
      cell({ value: false, kind: 'flag', unit: null }),
      cell({ value: null }),
    ]) {
      expect(compareCells(cell({ value: 100 }), other).comparable).toBe(false);
      expect(lines(cell({ value: 100 }), other)).toEqual(['比べられない (数字ではない)']);
    }
  });
});

describe('calcLines: 表示の行数', () => {
  it('D15: 比べられる組はちょうど 2 行、比べられない組は 1 行', () => {
    expect(lines(cell({ value: 1, order: 1 }), cell({ value: 2, order: 2 }))).toHaveLength(2);
    expect(lines(cell({ value: 1 }), cell({ value: null }))).toHaveLength(1);
    expect(lines(cell({ value: 1 }), cell({ value: 5, kind: 'percent', unit: '%' }))).toHaveLength(1);
  });
});
