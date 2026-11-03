// UA9・UA10 (docs/test-cases/flow.md §1.3): 印と場所の照合 (R3)
import { describe, expect, it } from 'vitest';
import { matchMarks } from './marks';
import type { AnomalyPlace } from './types';

const cash: AnomalyPlace = { doc: 'tanshin', path: 'balanceSheet.current.cash' };
const irCash: AnomalyPlace = { doc: 'ir', path: 'supplement.cash.current' };
const counts = (r: ReturnType<typeof matchMarks>) => [r.hits.length, r.misses.length, r.missed.length];

describe('印の照合 matchMarks', () => {
  it('UA9: 場所の 1 つにだけ当たる印 / 当たらない印だけ / 印なし', () => {
    expect(counts(matchMarks(['tanshin.balanceSheet.current.cash'], [cash, irCash]))).toEqual([1, 0, 1]);
    expect(counts(matchMarks(['tanshin.incomeStatement.current.netSales', 'ir.results.netSales.current'], [cash, irCash]))).toEqual([0, 2, 2]);
    expect(counts(matchMarks([], [cash, irCash]))).toEqual([0, 0, 2]);
  });

  it('UA9: 見逃した場所は、印の無かった場所そのもの', () => {
    expect(matchMarks(['tanshin.balanceSheet.current.cash'], [cash, irCash]).missed).toEqual([irCash]);
  });

  it('UA9c: path の場所は、同じキー・祖先・子孫の印で当たり。行の名前の印は当たりにしない', () => {
    const seg: AnomalyPlace = { doc: 'ir', path: 'segments.items.0.netSales.current' };
    expect(counts(matchMarks(['ir.segments.items.0.netSales.current'], [seg]))).toEqual([1, 0, 0]);
    expect(counts(matchMarks(['ir.segments.items.0.netSales'], [seg]))).toEqual([1, 0, 0]);
    const text: AnomalyPlace = { doc: 'ir', path: 'statements.0.text' };
    expect(counts(matchMarks(['ir.statements.0'], [text]))).toEqual([1, 0, 0]);
    expect(counts(matchMarks(['ir.statements.0.text.deeper'], [text]))).toEqual([1, 0, 0]);
    expect(counts(matchMarks(['ir.item:ir.segments.items.0.netSales'], [seg]))).toEqual([0, 1, 1]);
    expect(counts(matchMarks(['ir.segments.items.1.netSales.current'], [seg]))).toEqual([0, 1, 1]);
  });

  it('UA10: itemKey の場所は、同じ行の数字の印・行名の印で当たり。別の行の印は外れ', () => {
    const row: AnomalyPlace = { doc: 'tanshin', itemKey: 'tanshin.incomeStatement.ordinaryIncome' };
    for (const mark of [
      'tanshin.incomeStatement.current.ordinaryIncome',
      'tanshin.incomeStatement.previous.ordinaryIncome',
      'tanshin.item:tanshin.incomeStatement.ordinaryIncome',
    ]) {
      expect(counts(matchMarks([mark], [row]))).toEqual([1, 0, 0]);
    }
    expect(counts(matchMarks(['tanshin.incomeStatement.current.operatingIncome'], [row]))).toEqual([0, 1, 1]);
  });
});
