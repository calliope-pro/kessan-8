// docs/test-cases/viewer.md §5.1 (D2): 印のキー。§5.3 (E1〜E6): 強調の口。
import { describe, expect, it } from 'vitest';
import { cellMarkKey, itemMarkKey } from './keys';
import { placeHitsElement } from './highlight';

describe('印のキー', () => {
  it('D2: セルは <doc>.<path>、行の名前は <doc>.item:<項目キー>', () => {
    expect(cellMarkKey('tanshin', 'incomeStatement.current.ordinaryIncome')).toBe('tanshin.incomeStatement.current.ordinaryIncome');
    expect(itemMarkKey('tanshin', 'tanshin.incomeStatement.ordinaryIncome')).toBe('tanshin.item:tanshin.incomeStatement.ordinaryIncome');
  });
  it('D2: 項目キーと path が同じ文字列の行でも、2 種類のキーは重ならない', () => {
    expect(cellMarkKey('tanshin', 'summary.auditNote')).not.toBe(itemMarkKey('tanshin', 'tanshin.summary.auditNote'));
  });
});

describe('placeHitsElement', () => {
  const place = { doc: 'tanshin', path: 'incomeStatement.current.ordinaryIncome' } as const;

  it('E1: path が同じ要素を強調する', () => {
    expect(placeHitsElement(place, { path: 'tanshin.incomeStatement.current.ordinaryIncome' })).toBe(true);
  });
  it('E2: 別の資料・別のセルは強調しない', () => {
    expect(placeHitsElement(place, { path: 'ir.incomeStatement.current.ordinaryIncome' })).toBe(false);
    expect(placeHitsElement(place, { path: 'tanshin.incomeStatement.current.operatingIncome' })).toBe(false);
    expect(placeHitsElement(place, { path: 'tanshin.incomeStatement.previous.ordinaryIncome' })).toBe(false);
  });
  it('E3: path の途中の place は子孫の要素を強調し、深い place は祖先の要素を強調する (. 区切り)', () => {
    const mid = { doc: 'ir', path: 'segments.items.0.netSales' } as const;
    expect(placeHitsElement(mid, { path: 'ir.segments.items.0.netSales.current' })).toBe(true);
    expect(placeHitsElement(mid, { path: 'ir.segments.items.0.netSales.changeRate' })).toBe(true);
    expect(placeHitsElement(mid, { path: 'ir.segments.items.0.netSalesX' })).toBe(false);
    expect(placeHitsElement(mid, { path: 'ir.segments.items.1.netSales.current' })).toBe(false);
    const deep = { doc: 'ir', path: 'statements.0.text' } as const;
    expect(placeHitsElement(deep, { path: 'ir.statements.0' })).toBe(true);
    expect(placeHitsElement(deep, { path: 'ir.statements.1' })).toBe(false);
  });
  it('E4: 見出しの場所', () => {
    expect(placeHitsElement({ doc: 'tanshin', path: 'header.companyName' }, { path: 'tanshin.header.companyName' })).toBe(true);
    expect(placeHitsElement({ doc: 'tanshin', path: 'header.companyName' }, { path: 'ir.header.companyName' })).toBe(false);
  });
  it('E5: itemKey の場所は、同じ項目キーの行の名前の要素を強調する。数字のセルは強調しない', () => {
    const item = { doc: 'tanshin', itemKey: 'tanshin.balanceSheet.cash' } as const;
    expect(placeHitsElement(item, { itemKey: 'tanshin.balanceSheet.cash' })).toBe(true);
    expect(placeHitsElement(item, { itemKey: 'tanshin.balanceSheet.receivables' })).toBe(false);
    expect(placeHitsElement(item, { path: 'tanshin.balanceSheet.current.cash' })).toBe(false);
  });
  it('E5b: path の場所は、行の名前の要素 (path を持たない) を強調しない', () => {
    expect(placeHitsElement(place, { itemKey: 'tanshin.incomeStatement.ordinaryIncome' })).toBe(false);
  });
  it('E6: 期末後の出来事 (null の文) のセルも強調できる', () => {
    expect(placeHitsElement({ doc: 'ir', path: 'outlook.subsequentEvent' }, { path: 'ir.outlook.subsequentEvent' })).toBe(true);
  });
});
