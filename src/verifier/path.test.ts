// P1〜P6 (docs/test-cases/validator.md §2.1): 場所の取り出し。
import { describe, expect, it } from 'vitest';
import { getPath, numericCells } from './path.ts';
import { normalA, numericLeaves } from './test-utils.ts';

describe('getPath / numericCells', () => {
  const a = normalA();
  it('P1: 短信の貸借対照表の現金', () => expect(getPath(a, 'tanshin', 'balanceSheet.current.cash')).toBe(2300));
  it('P2: 配列の添字', () => expect(getPath(a, 'ir', 'segments.items.0.netSales.current')).toBe(7900));
  it('P3: 見出し', () => expect(getPath(a, 'tanshin', 'header.companyName')).toBe('第七試作電機株式会社'));
  it('P4: 存在しない場所は undefined', () => {
    expect(getPath(a, 'tanshin', 'balanceSheet.current.nothing')).toBeUndefined();
    expect(getPath(a, 'tanshin', 'balanceSheet.nothing.cash')).toBeUndefined();
  });
  it('P5: numericCells は数値のセルだけで、独立にたどった一覧と等しい', () => {
    const cells = numericCells(a);
    expect([...cells].sort()).toEqual(numericLeaves(a).sort());
    expect(cells.every((c) => c.startsWith('tanshin.') || c.startsWith('ir.'))).toBe(true);
    expect(cells).not.toContain('ir.supplement.capex.previous'); // null
    expect(cells).not.toContain('tanshin.header.companyName'); // 文字列
  });
  it('P6: 画面の単位の場所は header.unit、存在しない画面は undefined', () => {
    expect(getPath(a, 'tanshin', 'balanceSheet.unit')).toBe('百万円');
    expect(getPath(a, 'tanshin', 'nothing.unit')).toBeUndefined();
  });
});
