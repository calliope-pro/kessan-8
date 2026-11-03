// Y1〜Y6 (docs/test-cases/validator.md §2.12): 正常な問題では、IR の比率が「短信から」と「IR の表示金額から」の両方に一致する (#81 の B1)。
import { describe, expect, it } from 'vitest';
import { verifyIrDisplay, verifyProblem } from './index.ts';
import { companyA, companyB, mutate, normalA, normalB, set } from './test-utils.ts';

const ids = (p: Parameters<typeof verifyIrDisplay>[0], c = companyB()) => [...new Set(verifyIrDisplay(p, c).map((v) => v.rule))].sort();

// 億円の会社で、短信の百万円から計算した比率は IR に書いてある値と一致するが、IR の表示金額 (0.1 億円に丸め) から検算すると食い違う問題
const roundedSales = () => {
  let p = set(normalB(), 'tanshin.incomeStatement.current.netSales', 12449);
  p = set(p, 'tanshin.incomeStatement.previous.netSales', 11751);
  p = set(p, 'ir.highlights.netSales.amount', 124.5);
  p = set(p, 'ir.results.netSales.current', 124.5);
  p = set(p, 'ir.results.netSales.previous', 117.5);
  return set(p, 'ir.highlights.netSales.changeRate', 5.9); // 短信から 5.9%。IR の 124.5 と 117.5 からは 6.0%
};

describe('IR の表示金額から検算した比率 (正常な問題だけに当てる)', () => {
  it('Y1: 基準問題 B (金額が 10 百万円の倍数) と A は空', () => {
    expect(ids(normalB())).toEqual([]);
    expect(ids(normalA(), companyA())).toEqual([]);
  });

  it('Y2: 売上高の前期比 (X2 と同じ形) は、短信の規則は通るが、IR の表示金額からは食い違う', () => {
    const p = roundedSales();
    expect(verifyProblem(p, companyB()).hard.map((v) => v.rule)).not.toContain('ir-hl-change-net-sales');
    expect(ids(p)).toContain('ir-display-hl-change-net-sales');
  });

  it('Y3: セグメント利益の前期比 (導いた例: 前期 413・当期 467 百万円 → IR 4.1・4.7 億円。短信から 13.1%、IR から 14.6%)', () => {
    let p = set(normalB(), 'ir.segments.items.0.profit.previous', 4.1);
    p = set(p, 'ir.segments.items.0.profit.current', 4.7);
    p = set(p, 'ir.segments.items.0.profit.changeRate', 13.1);
    expect(ids(p)).toEqual(['ir-display-seg-change-profit']);
  });

  it('Y4: 利益率 (売上総利益率) と構成比も IR の表示金額から検算する', () => {
    const margin = set(normalB(), 'ir.results.grossMargin.current', 31);
    expect(ids(margin)).toEqual(['ir-display-results-gross-margin']);
    const share = set(normalB(), 'ir.segments.items.0.salesShare', 60.0);
    expect(ids(share)).toEqual(['ir-display-seg-share']);
  });

  it('Y5: 営業利益の前期比と営業利益率も同じ', () => {
    const p = mutate(normalB(), 'ir.results.operatingIncome.previous', () => 11.5);
    expect(ids(p)).toContain('ir-display-hl-change-operating-income');
    expect(ids(set(normalB(), 'ir.results.operatingMargin.previous', 9.0))).toEqual(['ir-display-results-operating-margin']);
  });

  it('Y6: 経常利益・純利益の前期比は、IR に前期の金額が無いので検算の対象にしない', () => {
    expect(ids(set(normalB(), 'ir.highlights.ordinaryIncome.changeRate', 99))).toEqual([]);
  });
});
