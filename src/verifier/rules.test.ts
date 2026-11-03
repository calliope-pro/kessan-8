// N1〜N9・V1〜V55・C1〜C3・S1〜S13 (docs/test-cases/validator.md §2.2〜§2.5): 規則の振る舞い。
import { describe, expect, it } from 'vitest';
import type { Company, Problem } from '../domain/types.ts';
import { HARD_RULE_IDS, SOFT_RULE_IDS, verifyProblem } from './index.ts';
import { numericCells } from './path.ts';
import { add, clone, companyA, companyB, mutate, normalA, normalB, onlyRule, set } from './test-utils.ts';

const hardSet = (p: Problem, c: Company) => [...new Set(verifyProblem(p, c).hard.map((v) => v.rule))].sort();
const sorted = (xs: string[]) => [...xs].sort();

describe('正常な問題 (N)', () => {
  it('N1: 基準問題 A は hard も soft も 0 件', () => {
    const r = verifyProblem(normalA(), companyA());
    expect(r.hard).toEqual([]);
    expect(r.soft).toEqual([]);
  });

  it('N2: fiscalYear だけ変えると header-period-label が 2 件 (短信・IR)', () => {
    const r = verifyProblem(set(normalA(), 'fiscalYear', 2026), companyA());
    expect(r.hard.map((v) => v.rule).sort()).toEqual(['dates-period-end', 'header-period-label', 'header-period-label']);
  });

  it('N3: 会社の name を変えると header-company-name が 2 件', () => {
    const r = verifyProblem(normalA(), { ...companyA(), name: '別の会社' });
    expect(r.hard.map((v) => v.rule)).toEqual(['header-company-name', 'header-company-name']);
  });

  it('N4: 会社の segmentNames を入れ替えると segment-names だけ。短信・IR の両方の場所が paths に出る', () => {
    const c = companyA();
    const r = verifyProblem(normalA(), { ...c, segmentNames: [...c.segmentNames].reverse() });
    expect([...new Set(r.hard.map((v) => v.rule))]).toEqual(['segment-names']);
    const paths = r.hard.flatMap((v) => v.paths);
    expect(paths.some((p) => p.startsWith('tanshin.notes.segments'))).toBe(true);
    expect(paths.some((p) => p.startsWith('ir.segments.items'))).toBe(true);
  });

  it('N5: fiscalYearEndMonth を 9 にすると header-period-label が 2 件と dates-period-end が 1 件だけ', () => {
    const r = verifyProblem(normalA(), { ...companyA(), fiscalYearEndMonth: 9 });
    expect(r.hard.map((v) => v.rule).sort()).toEqual(['dates-period-end', 'header-period-label', 'header-period-label']);
  });

  it('N6: 基準問題 B (億円・3 セグメント) は hard も soft も 0 件', () => {
    const r = verifyProblem(normalB(), companyB());
    expect(r.hard).toEqual([]);
    expect(r.soft).toEqual([]);
  });

  it('N7: B の IR の header.unit を百万円にすると header-unit だけ', () => {
    expect(hardSet(set(normalB(), 'ir.header.unit', '百万円'), companyB())).toEqual(['header-unit']);
  });

  it('N8: B の ir.highlights.netSales.amount +0.1 で xdoc-hl-net-sales だけ', () => {
    expect(hardSet(add(normalB(), 'ir.highlights.netSales.amount', 0.1), companyB())).toEqual(['xdoc-hl-net-sales']);
  });

  it('N9: 2028 年 2 月期 (うるう年の末日 2028-02-29) は hard が空', () => {
    let p = set(normalA(), 'fiscalYear', 2028);
    p = set(p, 'tanshin.header.periodLabel', '2028年2月期');
    p = set(p, 'ir.header.periodLabel', '2028年2月期');
    p = set(p, 'tanshin.dates', {
      periodEnd: '2028-02-29',
      previousPeriodEnd: '2027-02-28',
      disclosure: '2028-04-14',
      shareholdersMeeting: '2028-05-26',
    });
    const heads = { previous: '2027-02-28', current: '2028-02-29' };
    p = set(p, 'tanshin.columnDates', { balanceSheet: heads, incomeStatement: heads, cashFlow: heads });
    expect(verifyProblem(p, { ...companyA(), fiscalYearEndMonth: 2 }).hard).toEqual([]);
  });

  it('規則 ID は重複せず、hard と soft は別', () => {
    expect(new Set(HARD_RULE_IDS).size).toBe(HARD_RULE_IDS.length);
    expect(new Set(SOFT_RULE_IDS).size).toBe(SOFT_RULE_IDS.length);
    expect(HARD_RULE_IDS.filter((i) => SOFT_RULE_IDS.includes(i))).toEqual([]);
  });
});

interface VCase {
  id: string;
  /** 基準問題 A から作る変更。 */
  build: (a: Problem) => Problem;
  expected: string[];
  /** 基準問題 B から作るとき true。 */
  onB?: boolean;
}

const A = (path: string, delta: number) => (p: Problem) => add(p, path, delta);
const V: VCase[] = [
  { id: 'V1', build: A('tanshin.balanceSheet.current.totalAssets', 100), expected: ['bs-total-assets', 'bs-balance', 'sum-total-assets', 'ratio-equity-ratio'] },
  { id: 'V2', build: A('tanshin.balanceSheet.current.cash', 100), expected: ['bs-current-assets', 'link-cf-cash-end', 'xdoc-supp-cash'] },
  { id: 'V3', build: A('tanshin.balanceSheet.current.totalCurrentAssets', 100), expected: ['bs-current-assets', 'bs-total-assets'] },
  { id: 'V4', build: A('tanshin.balanceSheet.current.retainedEarnings', 100), expected: ['bs-shareholders-equity', 'link-retained-earnings'] },
  { id: 'V5', build: A('tanshin.balanceSheet.current.totalNetAssets', 100), expected: ['bs-net-assets', 'bs-liabilities-and-net-assets', 'sum-net-assets', 'sum-equity', 'ratio-equity-ratio', 'ratio-roe', 'ratio-bps'] },
  { id: 'V6', build: A('tanshin.incomeStatement.current.ordinaryIncome', 100), expected: ['pl-ordinary-income', 'pl-income-before-tax', 'sum-ordinary-income', 'xdoc-hl-ordinary-income', 'ir-hl-change-ordinary-income'] },
  { id: 'V7', build: A('tanshin.summary.ordinaryIncome.changeRate', 2), expected: ['sum-change-ordinary-income'] },
  { id: 'V8', build: A('tanshin.summary.netSales.current', 100), expected: ['sum-net-sales', 'sum-change-net-sales'] },
  { id: 'V9', build: A('tanshin.cashFlow.cashEnding', 100), expected: ['cf-ending', 'link-cf-cash-end'] },
  { id: 'V10', build: A('tanshin.cashFlow.operatingCashFlow', 100), expected: ['cf-operating', 'cf-net-change'] },
  { id: 'V11', build: A('tanshin.cashFlow.depreciation', 100), expected: ['cf-subtotal', 'link-tangible-assets', 'xdoc-outlook-actual-capex-depreciation', 'xdoc-supp-capex-depreciation'] },
  { id: 'V12', build: A('tanshin.cashFlow.capex', -100), expected: ['cf-investing', 'link-tangible-assets', 'xdoc-outlook-actual-capex-depreciation', 'xdoc-supp-capex-depreciation'] },
  { id: 'V13', build: A('tanshin.incomeStatement.current.incomeTaxes', 100), expected: ['pl-net-income', 'link-cf-income-taxes'] },
  { id: 'V14', build: A('tanshin.notes.segments.current.segments.0.netSales', 100), expected: ['seg-sales-sum', 'xdoc-seg-sales', 'ir-seg-change-sales', 'ir-seg-share'] },
  { id: 'V15', build: A('tanshin.notes.segments.current.adjustment', 10), expected: ['seg-profit-sum', 'xdoc-seg-adjustment'] },
  { id: 'V16', build: A('ir.highlights.netSales.amount', 100), expected: ['xdoc-hl-net-sales'] },
  { id: 'V17', build: A('ir.segments.items.0.netSales.current', 100), expected: ['xdoc-seg-sales'] },
  { id: 'V18', build: A('ir.supplement.capex.current', 100), expected: ['xdoc-supp-capex-depreciation'] },
  { id: 'V19', build: A('ir.supplement.netDebt.current', 100), expected: ['ir-supp-net-debt'] },
  { id: 'V20', build: A('ir.results.operatingMargin.current', 1), expected: ['ir-results-operating-margin'] },
  { id: 'V21', build: (p) => set(p, 'ir.header.companyName', '第七試作電機株式会杜'), expected: ['header-company-name'] },
  { id: 'V22', build: (p) => set(p, 'tanshin.header.unit', '千円'), expected: ['header-unit'] },
  { id: 'V23', build: (p) => set(p, 'ir.header.periodLabel', '2026年3月期'), expected: ['header-period-label'] },
  { id: 'V24', build: (p) => set(p, 'tanshin.notes.segments.current.segments.1.name', '別の事業'), expected: ['segment-names'] },
  { id: 'V25', build: A('tanshin.summary.payoutRatio', 3), expected: ['ratio-payout', 'xdoc-hl-payout'] },
  { id: 'V26', build: A('tanshin.notes.averageSharesThousand', 400), expected: ['ratio-eps', 'ratio-bps', 'ratio-dividend-total', 'link-cf-dividends-paid', 'check-eps-product', 'check-bps-product'] },
  { id: 'V27', build: A('tanshin.summary.eps', 10), expected: ['ratio-eps', 'notes-per-share', 'ratio-payout', 'check-eps-product'] },
  { id: 'V28', build: A('ir.outlook.forecast.netSalesChangeRate', 1), expected: ['ir-outlook-change-net-sales'] },
  { id: 'V29', build: A('ir.highlights.annualDividend', 2), expected: ['xdoc-hl-dividend'] },
  { id: 'V30', build: A('tanshin.cashFlow.interestDividendIncome', 10), expected: ['cf-subtotal', 'link-cf-interest-income'] },
  { id: 'V31', build: A('tanshin.balanceSheet.previous.totalAssets', 100), expected: ['bs-total-assets', 'bs-balance'] },
  { id: 'V32', build: A('tanshin.balanceSheet.previous.receivables', 100), expected: ['bs-current-assets', 'link-cf-receivables'] },
  { id: 'V33', build: A('tanshin.cashFlow.longTermBorrowings', 100), expected: ['cf-financing', 'link-cf-long-debt'] },
  { id: 'V34', build: A('tanshin.cashFlow.longTermRepayments', -100), expected: ['cf-financing', 'link-cf-long-debt'] },
  { id: 'V35', build: A('tanshin.summary.interimDividend', 5), expected: ['link-cf-dividends-paid'] },
  { id: 'V36', build: A('tanshin.summary.dividendTotal', 10), expected: ['ratio-dividend-total'] },
  { id: 'V37', build: A('tanshin.summary.equity', 100), expected: ['sum-equity', 'check-bps-product'] },
  { id: 'V38', build: A('tanshin.summary.operatingMargin', 2), expected: ['ratio-operating-margin'] },
  { id: 'V39', build: A('tanshin.summary.roe', 1), expected: ['ratio-roe'] },
  { id: 'V40', build: (p) => set(p, 'tanshin.summary.auditNote', '監査済みです'), expected: ['audit-note'] },
  { id: 'V41', build: (p) => set(p, 'tanshin.summary.accountingPolicyChange', true), expected: ['accounting-policy-match'] },
  { id: 'V42', build: (p) => set(p, 'tanshin.dates.disclosure', '2027-03-01'), expected: ['dates-order'] },
  { id: 'V43', build: (p) => set(p, 'tanshin.columnDates.incomeStatement.current', '2028-03-31'), expected: ['dates-column-headings'] },
  { id: 'V44', build: (p) => set(p, 'ir.results.chart.operatingIncome.current', 900), expected: ['chart-bars'] },
  { id: 'V45', build: (p) => set(p, 'ir.results.chart.netSales.axisMin', 11000), expected: ['chart-axis-zero'] },
  { id: 'V46', build: (p) => set(p, 'ir.statements.0.claims.0.direction', 'down'), expected: ['claims-direction'] },
  { id: 'V47', build: (p) => set(p, 'ir.outlook.subsequentEvent', '期末後に子会社の売却を決定した。'), expected: ['subsequent-event-match'] },
  { id: 'V48', build: (p) => set(p, 'tanshin.header.securitiesCode', '0810'), expected: ['header-securities-code'] },
  { id: 'V49', build: (p) => set(p, 'unitOverrides', { 'tanshin.balanceSheet': '千円' }), expected: ['unit-consistency'] },
  { id: 'V50', build: (p) => set(p, 'signOverrides', { 'tanshin.cashFlow.capex': '-' }), expected: ['sign-consistency'] },
  { id: 'V51', build: (p) => set(p, 'labelOverrides', { 'tanshin.incomeStatement.operatingIncome': '営業利金' }), expected: ['label-spelling'] },
  { id: 'V52', build: (p) => set(p, 'labelOverrides', { 'tanshin.balanceSheet.receivables': '買掛金' }), expected: ['account-section'] },
  { id: 'V53', onB: true, build: (p) => mutate(p, 'ir.segments.items', (items) => (items as unknown[]).slice(0, 2)), expected: ['seg-count', 'segment-names', 'ir-seg-reconcile'] },
  {
    id: 'V54',
    build: (p) => mutate(p, 'tanshin.notes.segments.current.segments', (s) => [...(s as unknown[]), { name: 'x', netSales: 0, profit: 0 }]),
    expected: ['seg-count', 'segment-names'],
  },
  {
    id: 'V55a',
    build: (p) => mutate(p, 'ir.statements.0.claims', (c) => [...(c as unknown[]), { metric: 'dividend', direction: 'up' }]),
    expected: ['claims-direction'],
  },
  {
    id: 'V55b',
    build: (p) => mutate(p, 'ir.statements.0.claims', (c) => [...(c as unknown[]), { metric: 'dividend', direction: 'down' }]),
    expected: ['claims-direction'],
  },
];

describe('1 つのセルを変えたとき、破れる規則がちょうどこれ (V)', () => {
  it.each(V)('$id', ({ build, expected, onB }) => {
    const p = build(onB ? normalB() : normalA());
    expect(hardSet(p, onB ? companyB() : companyA())).toEqual(sorted(expected));
  });

  it('V1: bs-total-assets の paths は変えたセルを含み、前期のセルを含まない', () => {
    const r = verifyProblem(add(normalA(), 'tanshin.balanceSheet.current.totalAssets', 100), companyA());
    const v = r.hard.find((x) => x.rule === 'bs-total-assets');
    expect(v?.paths).toContain('tanshin.balanceSheet.current.totalAssets');
    expect(v?.paths.some((p) => p.includes('balanceSheet.previous'))).toBe(false);
  });

  it('V31: previous の違反の paths は previous のセルだけ', () => {
    const r = verifyProblem(add(normalA(), 'tanshin.balanceSheet.previous.totalAssets', 100), companyA());
    for (const v of r.hard) expect(v.paths.every((p) => p.includes('balanceSheet.previous'))).toBe(true);
  });

  it('V48/V21/V49/V50/V51 の paths', () => {
    const one = (p: Problem, c: Company, rule: string) => verifyProblem(p, c).hard.filter((v) => v.rule === rule).flatMap((v) => v.paths);
    expect(one(set(normalA(), 'tanshin.header.securitiesCode', '0810'), companyA(), 'header-securities-code')).toEqual(['tanshin.header.securitiesCode']);
    expect(one(set(normalA(), 'ir.header.companyName', 'x'), companyA(), 'header-company-name')).toEqual(['ir.header.companyName']);
    expect(one(set(normalA(), 'unitOverrides', { 'tanshin.balanceSheet': '千円' }), companyA(), 'unit-consistency')).toEqual(['tanshin.balanceSheet.unit']);
    expect(one(set(normalA(), 'signOverrides', { 'tanshin.cashFlow.capex': '-' }), companyA(), 'sign-consistency')).toEqual(['tanshin.cashFlow.capex']);
    expect(one(set(normalA(), 'labelOverrides', { 'tanshin.incomeStatement.operatingIncome': '営業利金' }), companyA(), 'label-spelling')).toEqual(['tanshin.incomeStatement.operatingIncome']);
  });
});

describe('どの数字を変えても、どれかの規則が破れる (C)', () => {
  const EXCLUDED = ['ir.outlook.forecast.capex', 'ir.outlook.forecast.depreciation', 'ir.outlook.forecast.annualDividend'];
  const RATE_ONLY = ['ir.outlook.forecast.netSales', 'ir.outlook.forecast.operatingIncome'];
  const base = normalA();
  const cells = numericCells(base);

  const valueOf = (p: Problem, cell: string): number => cell.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], p) as number;
  const delta = (cell: string, v: number): number => {
    if (RATE_ONLY.includes(cell)) return Math.ceil(v * 0.01);
    if (Number.isInteger(v)) return 1;
    return String(v).split('.')[1]!.length >= 2 ? 0.01 : 0.1;
  };

  it('C2: 除外は 3 つだけ', () => {
    expect(EXCLUDED).toHaveLength(3);
    for (const e of EXCLUDED) expect(cells).toContain(e);
  });

  it.each(cells.filter((c) => !EXCLUDED.includes(c)))('C1: %s を変えると、そのセルに触れる hard が 1 件以上', (cell) => {
    const p = add(base, cell, delta(cell, valueOf(base, cell)));
    const r = verifyProblem(p, companyA());
    expect(r.hard.some((v) => v.paths.includes(cell)), cell).toBe(true);
  });

  const STRING_CASES: [string, string][] = [
    ['tanshin.header.companyName', 'header-company-name'],
    ['ir.header.companyName', 'header-company-name'],
    ['tanshin.header.securitiesCode', 'header-securities-code'],
    ['ir.header.securitiesCode', 'header-securities-code'],
    ['tanshin.header.periodLabel', 'header-period-label'],
    ['ir.header.periodLabel', 'header-period-label'],
    ['tanshin.header.unit', 'header-unit'],
    ['ir.header.unit', 'header-unit'],
    ['tanshin.summary.auditNote', 'audit-note'],
    ['tanshin.notes.accountingPolicyNote', 'accounting-policy-match'],
    ['tanshin.notes.subsequentEvents', 'subsequent-event-match'],
    ['tanshin.dates.periodEnd', 'dates-period-end'],
    ['tanshin.dates.previousPeriodEnd', 'dates-period-end'],
    ['tanshin.dates.disclosure', 'dates-order'],
    ['tanshin.dates.shareholdersMeeting', 'dates-order'],
    ['tanshin.columnDates.balanceSheet.current', 'dates-column-headings'],
    ['tanshin.columnDates.cashFlow.previous', 'dates-column-headings'],
  ];
  it.each(STRING_CASES)('C3: %s を x にすると %s が破れる', (path, rule) => {
    expect(verifyProblem(set(base, path, 'x'), companyA()).hard.map((v) => v.rule)).toContain(rule);
  });

  it('C3: 式が無く破れないと明示した文 (goingConcern・cashScope・statements の text)', () => {
    for (const path of ['tanshin.notes.goingConcern', 'tanshin.notes.cashScope', 'ir.statements.0.text']) {
      expect(verifyProblem(set(base, path, 'x'), companyA()).hard, path).toEqual([]);
    }
  });
});

describe('参考の規則 (S)', () => {
  const softs = (p: Problem) => verifyProblem(p, companyA()).soft.map((v) => v.rule);
  const S: [string, Problem, string][] = [
    ['S1', set(normalA(), 'tanshin.balanceSheet.current.receivables', -5), 'soft-nonnegative-bs'],
    ['S2', set(normalA(), 'tanshin.balanceSheet.current.totalCurrentAssets', 1000), 'soft-current-ratio'],
    ['S3', set(normalA(), 'tanshin.summary.equityRatio', 10), 'soft-equity-ratio-range'],
    ['S4', set(normalA(), 'tanshin.incomeStatement.current.operatingIncome', 4000), 'soft-operating-margin-range'],
    ['S5', set(normalA(), 'tanshin.summary.netSales.changeRate', 25), 'soft-sales-growth-range'],
    ['S6', set(normalA(), 'tanshin.incomeStatement.current.operatingIncome', -1), 'soft-operating-profit-positive'],
    ['S7', set(normalA(), 'tanshin.incomeStatement.current.incomeTaxes', 100), 'soft-tax-rate-range'],
    ['S8', set(normalA(), 'tanshin.cashFlow.operatingCashFlow', 100), 'soft-ocf-vs-operating-income'],
    ['S9', set(normalA(), 'tanshin.balanceSheet.current.cash', 100), 'soft-cash-vs-sales'],
    ['S10', set(normalA(), 'tanshin.summary.payoutRatio', 120), 'soft-payout-max'],
    ['S11', set(normalA(), 'tanshin.summary.netSales.previous', 0), 'soft-rates-expressible'],
    ['S12', set(normalA(), 'tanshin.summary.payoutRatio', 31), 'soft-payout-cross-path'],
  ];
  it.each(S)('%s', (_id, p, rule) => {
    expect(softs(p)).toContain(rule);
  });

  it('S11: 前期が 0 でも verifyProblem は例外にならない', () => {
    expect(() => verifyProblem(set(normalA(), 'tanshin.summary.netSales.previous', 0), companyA())).not.toThrow();
  });

  it('S13: 基準問題のままなら soft は空、soft の規則 ID は 12 個', () => {
    expect(softs(clone(normalA()))).toEqual([]);
    expect(SOFT_RULE_IDS).toHaveLength(12);
  });
});

describe('規則の計算元 (変異で見つかった抜けを埋める。ほかの式が破れる問題でも、1 つの規則だけを評価する)', () => {
  // 億円の会社: 短信 売上高 12,449・売上総利益 3,725 (百万円) → 短信から 29.9%。IR の表示 37.3 ÷ 124.5 から計算すると 30.0%。
  const bWithRounding = () => {
    let p = normalB();
    p = set(p, 'tanshin.incomeStatement.current.netSales', 12449);
    p = set(p, 'tanshin.incomeStatement.current.grossProfit', 3725);
    p = set(p, 'ir.results.netSales.current', 124.5);
    p = set(p, 'ir.results.grossProfit.current', 37.3);
    return set(p, 'ir.results.grossMargin.current', 29.9);
  };

  it('IR の利益率は短信の百万円から計算する (億円の丸めに左右されない)', () => {
    expect(onlyRule('ir-results-gross-margin', bWithRounding(), companyB())).toEqual([]);
    expect(onlyRule('ir-results-gross-margin', set(bWithRounding(), 'ir.results.grossMargin.current', 30.0), companyB())).toHaveLength(1);
  });

  it('IR のハイライトの前期比は短信の百万円から計算する', () => {
    // 短信 12,449 と 11,751 (百万円) → 5.9%。IR の表示 124.5 と 117.5 (億円) から計算すると 6.0%
    let p = set(normalB(), 'tanshin.incomeStatement.current.netSales', 12449);
    p = set(p, 'tanshin.incomeStatement.previous.netSales', 11751);
    p = set(p, 'ir.highlights.netSales.amount', 124.5);
    expect(onlyRule('ir-hl-change-net-sales', set(p, 'ir.highlights.netSales.changeRate', 5.9), companyB())).toEqual([]);
    expect(onlyRule('ir-hl-change-net-sales', set(p, 'ir.highlights.netSales.changeRate', 6.0), companyB())).toHaveLength(1);
  });

  it('文章の主張: 前期と同じ (差が 0) なら増収も減収も主張できない', () => {
    const same = set(normalA(), 'tanshin.incomeStatement.previous.netSales', 12400); // 当期と同じ
    expect(onlyRule('claims-direction', same, companyA())).toHaveLength(1); // netSales の up が破れる
    const down = mutate(same, 'ir.statements.0.claims', () => [{ metric: 'netSales', direction: 'down' }]);
    expect(onlyRule('claims-direction', down, companyA())).toHaveLength(1);
  });
});
