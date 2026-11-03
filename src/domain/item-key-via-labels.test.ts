// UA11 (docs/test-cases/flow.md §1.3): 行のキー (項目キー。docs/design.md §4.1)
import { describe, expect, it } from 'vitest';
import { itemKey } from './labels';

describe('項目キー itemKey', () => {
  it('UA11: 期・予実の段と、末尾の changeRate・amount を除き、資料の種類を頭に付ける', () => {
    expect(itemKey('tanshin', 'incomeStatement.current.ordinaryIncome')).toBe('tanshin.incomeStatement.ordinaryIncome');
    expect(itemKey('tanshin', 'incomeStatement.previous.ordinaryIncome')).toBe('tanshin.incomeStatement.ordinaryIncome');
    expect(itemKey('tanshin', 'summary.ordinaryIncome.changeRate')).toBe('tanshin.summary.ordinaryIncome');
    expect(itemKey('ir', 'segments.items.0.netSales.current')).toBe('ir.segments.items.0.netSales');
    expect(itemKey('ir', 'outlook.forecast.netSales')).toBe('ir.outlook.netSales');
    expect(itemKey('ir', 'outlook.actual.netSales')).toBe('ir.outlook.netSales');
    expect(itemKey('ir', 'highlights.netSales.amount')).toBe('ir.highlights.netSales');
  });
});
