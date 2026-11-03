// 貸借対照表・損益計算書・キャッシュ・フロー計算書の中の式 (ケース表 §1.1)。
import { eq, PERIODS, rule, sum } from './dsl.ts';
import type { Rule } from './dsl.ts';

const bs = (q: string, k: string) => `balanceSheet.${q}.${k}`;
const pl = (q: string, k: string) => `incomeStatement.${q}.${k}`;
const cf = (k: string) => `cashFlow.${k}`;

const bsRule = (id: string, total: string, parts: string[]) =>
  rule(id, (each) => {
    for (const q of PERIODS) each((r) => eq(`${total} (${q})`, r.t(bs(q, total)), sum(...parts.map((k) => r.t(bs(q, k))))));
  });

const plRule = (id: string, result: string, plus: string[], minus: string[]) =>
  rule(id, (each) => {
    for (const q of PERIODS) each((r) => eq(`${result} (${q})`, r.t(pl(q, result)), sum(...plus.map((k) => r.t(pl(q, k)))) - sum(...minus.map((k) => r.t(pl(q, k))))));
  });

const cfRule = (id: string, total: string, parts: string[]) =>
  rule(id, (each) => each((r) => eq(total, r.t(cf(total)), sum(...parts.map((k) => r.t(cf(k)))))));

export const STATEMENT_RULES: Rule[] = [
  bsRule('bs-current-assets', 'totalCurrentAssets', ['cash', 'receivables', 'inventories', 'otherCurrentAssets']),
  bsRule('bs-fixed-assets', 'totalFixedAssets', ['tangibleAssets', 'investments']),
  bsRule('bs-total-assets', 'totalAssets', ['totalCurrentAssets', 'totalFixedAssets']),
  bsRule('bs-current-liabilities', 'totalCurrentLiabilities', ['payables', 'shortTermDebt', 'incomeTaxesPayable', 'otherCurrentLiabilities']),
  bsRule('bs-total-liabilities', 'totalLiabilities', ['totalCurrentLiabilities', 'longTermDebt']),
  bsRule('bs-shareholders-equity', 'totalShareholdersEquity', ['capitalStock', 'capitalSurplus', 'retainedEarnings']),
  bsRule('bs-net-assets', 'totalNetAssets', ['totalShareholdersEquity', 'nonControllingInterests']),
  bsRule('bs-liabilities-and-net-assets', 'totalLiabilitiesAndNetAssets', ['totalLiabilities', 'totalNetAssets']),
  rule('bs-balance', (each) => {
    for (const q of PERIODS) each((r) => eq(`貸借の一致 (${q})`, r.t(bs(q, 'totalAssets')), r.t(bs(q, 'totalLiabilitiesAndNetAssets'))));
  }),
  plRule('pl-gross-profit', 'grossProfit', ['netSales'], ['costOfSales']),
  plRule('pl-operating-income', 'operatingIncome', ['grossProfit'], ['sga']),
  plRule('pl-ordinary-income', 'ordinaryIncome', ['operatingIncome', 'nonOperatingIncome'], ['nonOperatingExpenses']),
  plRule('pl-income-before-tax', 'incomeBeforeTax', ['ordinaryIncome', 'extraordinaryGain'], ['extraordinaryLoss']),
  plRule('pl-net-income', 'netIncome', ['incomeBeforeTax'], ['incomeTaxes']),
  plRule('pl-net-income-parent', 'netIncomeParent', ['netIncome'], ['netIncomeNonControlling']),
  cfRule('cf-subtotal', 'subtotal', ['incomeBeforeTax', 'depreciation', 'interestDividendIncome', 'interestExpense', 'receivablesChange', 'inventoriesChange', 'payablesChange', 'otherAssetsChange', 'otherLiabilitiesChange']),
  cfRule('cf-operating', 'operatingCashFlow', ['subtotal', 'interestDividendReceived', 'interestPaid', 'incomeTaxesPaid']),
  cfRule('cf-investing', 'investingCashFlow', ['capex', 'otherInvestingChange']),
  cfRule('cf-financing', 'financingCashFlow', ['shortTermDebtChange', 'longTermBorrowings', 'longTermRepayments', 'dividendsPaid']),
  cfRule('cf-net-change', 'netChangeInCash', ['operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'fxEffect']),
  cfRule('cf-ending', 'cashEnding', ['cashBeginning', 'netChangeInCash']),
];

