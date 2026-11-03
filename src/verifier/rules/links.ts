// 財務諸表のあいだの連動 (ケース表 §1.2)。当期 = 日本基準・間接法・資金の範囲は現金及び預金。
import { dividendAmount } from '../math.ts';
import { eq, rule } from './dsl.ts';
import type { Reader, Rule } from './dsl.ts';

const b = (q: 'previous' | 'current', k: string) => `balanceSheet.${q}.${k}`;
const p1 = (k: string) => `incomeStatement.current.${k}`;
const cf = (k: string) => `cashFlow.${k}`;
/** 当期 − 前期 の増加額。 */
const rise = (r: Reader, k: string) => r.t(b('current', k)) - r.t(b('previous', k));

const linkRule = (id: string, cfKey: string, bsKey: string, sign: 1 | -1) =>
  rule(id, (each) => each((r) => eq(cfKey, r.t(cf(cfKey)), sign * rise(r, bsKey))));

export const LINK_RULES: Rule[] = [
  rule('link-cf-start', (each) => each((r) => eq('CF 起点 = 税金等調整前当期純利益', r.t(cf('incomeBeforeTax')), r.t(p1('incomeBeforeTax'))))),
  rule('link-cf-cash-end', (each) => each((r) => eq('CF 期末残高 = 貸借の現金', r.t(cf('cashEnding')), r.t(b('current', 'cash'))))),
  rule('link-cf-cash-begin', (each) => each((r) => eq('CF 期首残高 = 前期の貸借の現金', r.t(cf('cashBeginning')), r.t(b('previous', 'cash'))))),
  linkRule('link-cf-receivables', 'receivablesChange', 'receivables', -1),
  linkRule('link-cf-inventories', 'inventoriesChange', 'inventories', -1),
  linkRule('link-cf-payables', 'payablesChange', 'payables', 1),
  linkRule('link-cf-other-assets', 'otherAssetsChange', 'otherCurrentAssets', -1),
  linkRule('link-cf-other-liabilities', 'otherLiabilitiesChange', 'otherCurrentLiabilities', 1),
  rule('link-cf-income-taxes', (each) =>
    each((r) => eq('法人税等の支払額', -r.t(cf('incomeTaxesPaid')), r.t(p1('incomeTaxes')) - rise(r, 'incomeTaxesPayable'))),
  ),
  rule('link-cf-interest-income', (each) => {
    each((r) => eq('受取利息及び配当金 (調整)', r.t(cf('interestDividendIncome')), -r.t(p1('nonOperatingIncome'))));
    each((r) => eq('利息及び配当金の受取額', r.t(cf('interestDividendReceived')), r.t(p1('nonOperatingIncome'))));
  }),
  rule('link-cf-interest-expense', (each) => {
    each((r) => eq('支払利息 (調整)', r.t(cf('interestExpense')), r.t(p1('nonOperatingExpenses'))));
    each((r) => eq('利息の支払額', r.t(cf('interestPaid')), -r.t(p1('nonOperatingExpenses'))));
  }),
  rule('link-tangible-assets', (each) =>
    each((r) => eq('有形固定資産の増減', r.t(b('current', 'tangibleAssets')), r.t(b('previous', 'tangibleAssets')) - r.t(cf('capex')) - r.t(cf('depreciation')))),
  ),
  linkRule('link-cf-other-investing', 'otherInvestingChange', 'investments', -1),
  linkRule('link-cf-short-debt', 'shortTermDebtChange', 'shortTermDebt', 1),
  rule('link-cf-long-debt', (each) =>
    each((r) => eq('長期借入金の増減 = 収入 + 支出', r.t(cf('longTermBorrowings')) + r.t(cf('longTermRepayments')), rise(r, 'longTermDebt'))),
  ),
  rule('link-cf-dividends-paid', (each) =>
    each((r) => {
      const sh = r.t('notes.averageSharesThousand');
      const prevYearEnd = r.t('summary.annualDividendPrevious') - r.t('summary.interimDividendPrevious');
      const perShare = prevYearEnd + r.t('summary.interimDividend');
      return eq('配当金の支払額 = (前期の期末配当 + 当期の中間配当) × 株数', -r.t(cf('dividendsPaid')), dividendAmount(perShare, sh));
    }),
  ),
  rule('link-retained-earnings', (each) =>
    each((r) => eq('利益剰余金の増減', r.t(b('current', 'retainedEarnings')), r.t(b('previous', 'retainedEarnings')) + r.t(p1('netIncomeParent')) + r.t(cf('dividendsPaid')))),
  ),
  rule('link-nci', (each) =>
    each((r) => eq('非支配株主持分の増減', r.t(b('current', 'nonControllingInterests')), r.t(b('previous', 'nonControllingInterests')) + r.t(p1('netIncomeNonControlling')))),
  ),
  rule('link-capital-unchanged', (each) => {
    each((r) => eq('資本金', r.t(b('current', 'capitalStock')), r.t(b('previous', 'capitalStock'))));
    each((r) => eq('資本剰余金', r.t(b('current', 'capitalSurplus')), r.t(b('previous', 'capitalSurplus'))));
  }),
];
