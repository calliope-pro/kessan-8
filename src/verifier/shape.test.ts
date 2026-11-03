// SH1〜SH19 (docs/test-cases/validator.md §2.7): 型の形。
import { describe, expect, it } from 'vitest';
import { shapeErrors } from './index.ts';
import { clone, mutate, normalA, normalB, set } from './test-utils.ts';

const errs = (v: unknown) => shapeErrors(v);
const del = (path: string) => {
  const p = clone(normalA()) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let node = p;
  for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
  delete node[keys[keys.length - 1] as string];
  return p;
};
const anomalyOf = (extra: Record<string, unknown> = {}) => ({
  kind: 'k',
  places: [{ doc: 'tanshin', path: 'summary.eps' }],
  explanation: 'x',
  expectedRules: ['ratio-eps'],
  ...extra,
});

describe('shapeErrors', () => {
  it('SH1: 基準問題 A・B は空', () => {
    expect(errs(normalA())).toEqual([]);
    expect(errs(normalB())).toEqual([]);
  });
  it('SH2: キーが無い → 場所つきの誤り 1 件', () => {
    const e = errs(del('tanshin.cashFlow.capex'));
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('tanshin.cashFlow.capex');
  });
  it('SH3: 数値のセルが文字列', () => {
    const e = errs(set(normalA(), 'tanshin.balanceSheet.current.cash', '2300'));
    expect(e.some((m) => m.includes('tanshin.balanceSheet.current.cash'))).toBe(true);
  });
  it('SH4: NaN・Infinity', () => {
    expect(errs(set(normalA(), 'tanshin.balanceSheet.current.cash', NaN)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'tanshin.balanceSheet.current.cash', Infinity)).length).toBeGreaterThan(0);
  });
  it('SH5: 未知のキー', () => {
    const e = errs(set(normalA(), 'tanshin.summary.typo', 1));
    expect(e.some((m) => m.includes('tanshin.summary.typo'))).toBe(true);
  });
  it('SH6: IR の items が 1 要素 → 長さの誤り', () => {
    const e = errs(mutate(normalA(), 'ir.segments.items', (x) => (x as unknown[]).slice(0, 1)));
    expect(e.some((m) => m.includes('ir.segments.items'))).toBe(true);
  });
  it('SH7: previous は null も数値も可、current が null は誤り', () => {
    expect(errs(set(normalA(), 'ir.supplement.capex.previous', null))).toEqual([]);
    expect(errs(set(normalA(), 'ir.supplement.capex.previous', 7))).toEqual([]);
    expect(errs(set(normalA(), 'ir.supplement.capex.current', null)).length).toBeGreaterThan(0);
  });
  it('SH8: 任意項目は許し、tier の値は 1〜3 だけ', () => {
    expect(errs(set(normalA(), 'tier', 2))).toEqual([]);
    expect(errs(set(normalA(), 'labelOverrides', {}))).toEqual([]);
    expect(errs(set(normalA(), 'tier', 4)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'tier', '1')).length).toBeGreaterThan(0);
  });
  it('SH9: difficulty が normal', () => {
    expect(errs(set(normalA(), 'difficulty', 'normal')).length).toBeGreaterThan(0);
  });
  it('SH10: anomaly.places が空', () => {
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [] }))).length).toBeGreaterThan(0);
  });
  it('SH11: anomaly.places[0].doc が pdf', () => {
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [{ doc: 'pdf', path: 'x' }] }))).length).toBeGreaterThan(0);
  });
  it('SH12: ルートがオブジェクトでない → 1 件で止まる (例外にならない)', () => {
    for (const root of [[], null, '問題']) expect(errs(root)).toHaveLength(1);
  });
  it('SH13: セグメントは 2 か 3、4 と 1 は誤り', () => {
    const seg = { name: 'x', netSales: 0, profit: 0 };
    const withN = (n: number) => mutate(normalA(), 'tanshin.notes.segments.current.segments', (s) => [...(s as unknown[]), ...Array(Math.max(0, n - 2)).fill(seg)].slice(0, n));
    expect(errs(withN(3))).toEqual([]);
    expect(errs(withN(4)).length).toBeGreaterThan(0);
    expect(errs(withN(1)).length).toBeGreaterThan(0);
  });
  it('SH14: unitOverrides・signOverrides の値が数値', () => {
    expect(errs(set(normalA(), 'unitOverrides', { 'tanshin.balanceSheet': 1 })).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'signOverrides', { 'tanshin.cashFlow.capex': 1 })).length).toBeGreaterThan(0);
  });
  it('SH15: place は path か itemKey のどちらか 1 つだけ', () => {
    const both = anomalyOf({ places: [{ doc: 'tanshin', path: 'a', itemKey: 'b' }] });
    const none = anomalyOf({ places: [{ doc: 'tanshin' }] });
    expect(errs(set(normalA(), 'anomaly', both)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', none)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [{ doc: 'tanshin', itemKey: 'tanshin.summary.eps' }] })))).toEqual([]);
  });
  it('SH16: expectedRules が無い・配列でない', () => {
    const noRules = { ...anomalyOf() } as Record<string, unknown>;
    delete noRules.expectedRules;
    expect(errs(set(normalA(), 'anomaly', noRules)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ expectedRules: 'ratio-eps' }))).length).toBeGreaterThan(0);
  });
  it('SH17: claims の direction・metric が未知', () => {
    expect(errs(set(normalA(), 'ir.statements.0.claims.0.direction', 'flat')).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'ir.statements.0.claims.0.metric', 'nothing')).length).toBeGreaterThan(0);
  });
  it('SH18: statements の slide が未知', () => {
    expect(errs(set(normalA(), 'ir.statements.0.slide', 'nothing')).length).toBeGreaterThan(0);
  });
  it('SH19: 旧名の longTermDebtChange を足し、新しい 2 つを消すと欠落と未知のキーの 2 件以上', () => {
    const p = del('tanshin.cashFlow.longTermBorrowings') as unknown as Record<string, unknown>;
    const cf = (p.tanshin as Record<string, Record<string, unknown>>).cashFlow as Record<string, unknown>;
    cf.longTermDebtChange = -100;
    const e = errs(p);
    expect(e.some((m) => m.includes('longTermBorrowings'))).toBe(true);
    expect(e.some((m) => m.includes('longTermDebtChange'))).toBe(true);
  });
});
