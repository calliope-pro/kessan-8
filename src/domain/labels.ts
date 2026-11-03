// 項目キー (itemKey) の文法と、項目名の標準の表示名。docs/design.md §4.1。DOM を使わない。
// 画面 (ui/) は表示名を LABELS から引き (labelOverrides があればそちら)、検証器は label-spelling・account-section の判定に使う。
import type { DocKind } from './types';

/** path の中の期・予実の段。行は分けず、列になる。 */
const STAGES = new Set(['previous', 'current', 'forecast', 'actual']);
/** 末尾にあれば取る列の名前 (同じ行の別の列)。 */
const COLUMN_TAILS = new Set(['changeRate', 'amount']);

/**
 * path から項目キーを作る (設計 §4.1)。段 (previous・current・forecast・actual) を取り除き、
 * 末尾が changeRate・amount ならそれも取り、資料の種類を頭に付ける。
 */
export function itemKey(doc: DocKind, path: string): string {
  const segs = path.split('.').filter((s) => !STAGES.has(s));
  const last = segs[segs.length - 1];
  if (segs.length > 1 && last !== undefined && COLUMN_TAILS.has(last)) segs.pop();
  return [doc, ...segs].join('.');
}

/** 貸借対照表の部。 */
export type BalanceSection = 'asset' | 'liability' | 'equity';

const T = 'tanshin.';
const I = 'ir.';

/** 貸借対照表: 項目キーの後ろ → [部, 標準の表示名]。 */
const BALANCE_SHEET: Record<string, [BalanceSection, string]> = {
  cash: ['asset', '現金及び預金'],
  receivables: ['asset', '受取手形及び売掛金'],
  inventories: ['asset', '棚卸資産'],
  otherCurrentAssets: ['asset', 'その他の流動資産'],
  totalCurrentAssets: ['asset', '流動資産合計'],
  tangibleAssets: ['asset', '有形固定資産'],
  investments: ['asset', '投資その他の資産'],
  totalFixedAssets: ['asset', '固定資産合計'],
  totalAssets: ['asset', '資産合計'],
  payables: ['liability', '支払手形及び買掛金'],
  shortTermDebt: ['liability', '短期借入金'],
  incomeTaxesPayable: ['liability', '未払法人税等'],
  otherCurrentLiabilities: ['liability', 'その他の流動負債'],
  totalCurrentLiabilities: ['liability', '流動負債合計'],
  longTermDebt: ['liability', '長期借入金'],
  totalLiabilities: ['liability', '負債合計'],
  capitalStock: ['equity', '資本金'],
  capitalSurplus: ['equity', '資本剰余金'],
  retainedEarnings: ['equity', '利益剰余金'],
  totalShareholdersEquity: ['equity', '株主資本合計'],
  nonControllingInterests: ['equity', '非支配株主持分'],
  totalNetAssets: ['equity', '純資産合計'],
  totalLiabilitiesAndNetAssets: ['equity', '負債純資産合計'],
};

/** 項目キー → 貸借対照表の部。 */
export const SECTION_OF_ITEM: Readonly<Record<string, BalanceSection>> = Object.fromEntries(
  Object.entries(BALANCE_SHEET).map(([k, [section]]) => [`${T}balanceSheet.${k}`, section]),
);

/** セグメントの添字は 0〜2 (会社のセグメントは 2 つか 3 つ)。 */
const SEGMENT_INDEXES = [0, 1, 2] as const;

const segmentLabels = (prefix: string, lines: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    SEGMENT_INDEXES.flatMap((i) => Object.entries(lines).map(([field, label]) => [`${prefix}.${i}.${field}`, label])),
  );

/** 項目キー → 標準の表示名。 */
export const LABELS: Readonly<Record<string, string>> = {
  // ── 決算短信 1: サマリー
  [`${T}summary.netSales`]: '売上高',
  [`${T}summary.operatingIncome`]: '営業利益',
  [`${T}summary.ordinaryIncome`]: '経常利益',
  [`${T}summary.netIncomeParent`]: '親会社株主に帰属する当期純利益',
  [`${T}summary.operatingMargin`]: '売上高営業利益率',
  [`${T}summary.roe`]: '自己資本当期純利益率',
  [`${T}summary.eps`]: '1株当たり当期純利益',
  [`${T}summary.totalAssets`]: '総資産',
  [`${T}summary.netAssets`]: '純資産',
  [`${T}summary.equity`]: '自己資本',
  [`${T}summary.equityRatio`]: '自己資本比率',
  [`${T}summary.bps`]: '1株当たり純資産',
  [`${T}summary.annualDividend`]: '年間配当金 (当期)',
  [`${T}summary.interimDividend`]: 'うち中間配当 (当期)',
  [`${T}summary.annualDividendPrevious`]: '年間配当金 (前期)',
  [`${T}summary.interimDividendPrevious`]: 'うち中間配当 (前期)',
  [`${T}summary.dividendTotal`]: '配当金総額',
  [`${T}summary.payoutRatio`]: '配当性向',
  [`${T}summary.accountingPolicyChange`]: '会計方針の変更',
  [`${T}summary.auditNote`]: '監査についての注意書き',
  [`${T}dates.periodEnd`]: '決算期末日',
  [`${T}dates.previousPeriodEnd`]: '前期末日',
  [`${T}dates.disclosure`]: '決算発表日',
  [`${T}dates.shareholdersMeeting`]: '定時株主総会の日',
  // ── 決算短信 2: 貸借対照表
  ...Object.fromEntries(Object.entries(BALANCE_SHEET).map(([k, [, label]]) => [`${T}balanceSheet.${k}`, label])),
  // ── 決算短信 3: 損益計算書
  [`${T}incomeStatement.netSales`]: '売上高',
  [`${T}incomeStatement.costOfSales`]: '売上原価',
  [`${T}incomeStatement.grossProfit`]: '売上総利益',
  [`${T}incomeStatement.sga`]: '販売費及び一般管理費',
  [`${T}incomeStatement.operatingIncome`]: '営業利益',
  [`${T}incomeStatement.nonOperatingIncome`]: '営業外収益',
  [`${T}incomeStatement.nonOperatingExpenses`]: '営業外費用',
  [`${T}incomeStatement.ordinaryIncome`]: '経常利益',
  [`${T}incomeStatement.extraordinaryGain`]: '特別利益',
  [`${T}incomeStatement.extraordinaryLoss`]: '特別損失',
  [`${T}incomeStatement.incomeBeforeTax`]: '税金等調整前当期純利益',
  [`${T}incomeStatement.incomeTaxes`]: '法人税等',
  [`${T}incomeStatement.netIncome`]: '当期純利益',
  [`${T}incomeStatement.netIncomeNonControlling`]: '非支配株主に帰属する当期純利益',
  [`${T}incomeStatement.netIncomeParent`]: '親会社株主に帰属する当期純利益',
  // ── 決算短信 4: キャッシュ・フロー計算書
  [`${T}cashFlow.incomeBeforeTax`]: '税金等調整前当期純利益',
  [`${T}cashFlow.depreciation`]: '減価償却費',
  [`${T}cashFlow.interestDividendIncome`]: '受取利息及び受取配当金',
  [`${T}cashFlow.interestExpense`]: '支払利息',
  [`${T}cashFlow.receivablesChange`]: '売上債権の増減額',
  [`${T}cashFlow.inventoriesChange`]: '棚卸資産の増減額',
  [`${T}cashFlow.payablesChange`]: '仕入債務の増減額',
  [`${T}cashFlow.otherAssetsChange`]: 'その他の資産の増減額',
  [`${T}cashFlow.otherLiabilitiesChange`]: 'その他の負債の増減額',
  [`${T}cashFlow.subtotal`]: '小計',
  [`${T}cashFlow.interestDividendReceived`]: '利息及び配当金の受取額',
  [`${T}cashFlow.interestPaid`]: '利息の支払額',
  [`${T}cashFlow.incomeTaxesPaid`]: '法人税等の支払額',
  [`${T}cashFlow.operatingCashFlow`]: '営業活動によるキャッシュ・フロー',
  [`${T}cashFlow.capex`]: '有形固定資産の取得による支出',
  [`${T}cashFlow.otherInvestingChange`]: 'その他の投資活動',
  [`${T}cashFlow.investingCashFlow`]: '投資活動によるキャッシュ・フロー',
  [`${T}cashFlow.shortTermDebtChange`]: '短期借入金の純増減額',
  [`${T}cashFlow.longTermBorrowings`]: '長期借入れによる収入',
  [`${T}cashFlow.longTermRepayments`]: '長期借入金の返済による支出',
  [`${T}cashFlow.dividendsPaid`]: '配当金の支払額',
  [`${T}cashFlow.financingCashFlow`]: '財務活動によるキャッシュ・フロー',
  [`${T}cashFlow.fxEffect`]: '現金及び現金同等物に係る換算差額',
  [`${T}cashFlow.netChangeInCash`]: '現金及び現金同等物の増減額',
  [`${T}cashFlow.cashBeginning`]: '現金及び現金同等物の期首残高',
  [`${T}cashFlow.cashEnding`]: '現金及び現金同等物の期末残高',
  // ── 決算短信 5: 注記
  [`${T}notes.goingConcern`]: '継続企業の前提に関する注記',
  [`${T}notes.cashScope`]: '資金の範囲',
  ...segmentLabels(`${T}notes.segments.segments`, { netSales: '売上高', profit: 'セグメント利益' }),
  [`${T}notes.segments.adjustment`]: '調整額',
  [`${T}notes.segments.consolidatedNetSales`]: '連結財務諸表計上額 (売上高)',
  [`${T}notes.segments.consolidatedOperatingIncome`]: '連結財務諸表計上額 (営業利益)',
  [`${T}notes.averageSharesThousand`]: '期中平均株式数 (千株)',
  [`${T}notes.bps`]: '1株当たり純資産',
  [`${T}notes.eps`]: '1株当たり当期純利益',
  [`${T}notes.subsequentEvents`]: '重要な後発事象',
  [`${T}notes.accountingPolicyNote`]: '会計方針の変更',
  // ── IR 1: ハイライト
  [`${I}highlights.netSales`]: '売上高',
  [`${I}highlights.operatingIncome`]: '営業利益',
  [`${I}highlights.ordinaryIncome`]: '経常利益',
  [`${I}highlights.netIncomeParent`]: '親会社株主に帰属する当期純利益',
  [`${I}highlights.annualDividend`]: '年間配当金',
  [`${I}highlights.payoutRatio`]: '配当性向',
  // ── IR 2: 業績
  [`${I}results.netSales`]: '売上高',
  [`${I}results.grossProfit`]: '売上総利益',
  [`${I}results.grossMargin`]: '売上総利益率',
  [`${I}results.operatingIncome`]: '営業利益',
  [`${I}results.operatingMargin`]: '営業利益率',
  [`${I}results.chart.netSales`]: '売上高 (グラフ)',
  [`${I}results.chart.netSales.axisMin`]: '売上高グラフの軸の下端',
  [`${I}results.chart.operatingIncome`]: '営業利益 (グラフ)',
  [`${I}results.chart.operatingIncome.axisMin`]: '営業利益グラフの軸の下端',
  // ── IR 3: セグメント別
  ...segmentLabels(`${I}segments.items`, { netSales: '売上高', profit: 'セグメント利益', salesShare: '売上構成比' }),
  [`${I}segments.adjustment`]: '調整額',
  [`${I}segments.consolidatedOperatingIncome`]: '連結営業利益',
  // ── IR 4: 見通し
  [`${I}outlook.netSales`]: '売上高',
  [`${I}outlook.netSalesChangeRate`]: '売上高の前期比',
  [`${I}outlook.operatingIncome`]: '営業利益',
  [`${I}outlook.operatingIncomeChangeRate`]: '営業利益の前期比',
  [`${I}outlook.capex`]: '設備投資額',
  [`${I}outlook.depreciation`]: '減価償却費',
  [`${I}outlook.annualDividend`]: '年間配当金',
  [`${I}outlook.subsequentEvent`]: '期末後の出来事',
  // ── IR 5: 補足
  [`${I}supplement.capex`]: '設備投資額',
  [`${I}supplement.depreciation`]: '減価償却費',
  [`${I}supplement.interestBearingDebt`]: '有利子負債',
  [`${I}supplement.cash`]: '現金及び預金',
  [`${I}supplement.netDebt`]: '純有利子負債',
  [`${I}supplement.equityRatio`]: '自己資本比率',
};
