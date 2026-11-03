// I1〜I3 (docs/test-cases/validator.md §2.1): 項目キーと標準の表示名。
import { describe, expect, it } from 'vitest';
import { numericLeaves, normalA, normalB } from '../verifier/test-utils.ts';
import { itemKey, LABELS, SECTION_OF_ITEM } from './labels.ts';

describe('itemKey (設計 §4.1 の文法)', () => {
  it('I1: 期・予実の段と末尾の changeRate/amount を取り除き、資料の種類を頭に付ける', () => {
    expect(itemKey('tanshin', 'incomeStatement.current.ordinaryIncome')).toBe('tanshin.incomeStatement.ordinaryIncome');
    expect(itemKey('tanshin', 'summary.ordinaryIncome.changeRate')).toBe('tanshin.summary.ordinaryIncome');
    expect(itemKey('ir', 'segments.items.0.netSales.current')).toBe('ir.segments.items.0.netSales');
    expect(itemKey('ir', 'outlook.forecast.netSales')).toBe('ir.outlook.netSales');
    expect(itemKey('ir', 'outlook.actual.netSales')).toBe('ir.outlook.netSales');
    expect(itemKey('ir', 'highlights.netSales.amount')).toBe('ir.highlights.netSales');
  });
});

describe('LABELS / SECTION_OF_ITEM', () => {
  it('I2: 基準問題 A・B のすべての数値のセルの項目キーに標準の表示名がある', () => {
    for (const p of [normalA(), normalB()]) {
      for (const cell of numericLeaves(p)) {
        const [doc, ...rest] = cell.split('.') as ['tanshin' | 'ir', ...string[]];
        const key = itemKey(doc, rest.join('.'));
        expect(LABELS[key], key).toBeTruthy();
      }
    }
  });
  it('I2b: 貸借対照表の項目は部 (asset/liability/equity/total) を持つ', () => {
    const bsKeys = Object.keys(LABELS).filter((k) => k.startsWith('tanshin.balanceSheet.'));
    expect(bsKeys.length).toBe(23);
    for (const k of bsKeys) expect(SECTION_OF_ITEM[k], k).toBeTruthy();
  });
  it('I3: 表示名は空でなく、貸借対照表の中で重複しない', () => {
    expect(Object.values(LABELS).every((v) => v.length > 0)).toBe(true);
    const bs = Object.keys(LABELS).filter((k) => k.startsWith('tanshin.balanceSheet.')).map((k) => LABELS[k]);
    expect(new Set(bs).size).toBe(bs.length);
  });
});
