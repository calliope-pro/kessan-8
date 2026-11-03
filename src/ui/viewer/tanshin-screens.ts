// 決算短信 5 画面の中身 (docs/test-cases/viewer.md §3)。行の順は型 (types.ts) の宣言の順。DOM を使わない。
import type { TanshinScreenId } from '../../domain/types';
import { col, Ctx, plain, single } from './context';
import type { ViewCell, ViewScreen, ViewSection } from './types';

const PREV_CUR = ['previous', 'current'] as const;

/** 貸借対照表: 部ごとの項目 (型の順)。負債純資産合計は部の外の合計の行。 */
const BS_SECTIONS: [string | null, string[]][] = [
  ['資産の部', ['cash', 'receivables', 'inventories', 'otherCurrentAssets', 'totalCurrentAssets', 'tangibleAssets', 'investments', 'totalFixedAssets', 'totalAssets']],
  ['負債の部', ['payables', 'shortTermDebt', 'incomeTaxesPayable', 'otherCurrentLiabilities', 'totalCurrentLiabilities', 'longTermDebt', 'totalLiabilities']],
  ['純資産の部', ['capitalStock', 'capitalSurplus', 'retainedEarnings', 'totalShareholdersEquity', 'nonControllingInterests', 'totalNetAssets']],
  [null, ['totalLiabilitiesAndNetAssets']],
];

const PL_FIELDS = [
  'netSales', 'costOfSales', 'grossProfit', 'sga', 'operatingIncome', 'nonOperatingIncome', 'nonOperatingExpenses', 'ordinaryIncome',
  'extraordinaryGain', 'extraordinaryLoss', 'incomeBeforeTax', 'incomeTaxes', 'netIncome', 'netIncomeNonControlling', 'netIncomeParent',
];
const PL_EMPHASIS = new Set(['grossProfit', 'operatingIncome', 'ordinaryIncome', 'incomeBeforeTax', 'netIncome', 'netIncomeParent']);

const CF_FIELDS = [
  'incomeBeforeTax', 'depreciation', 'interestDividendIncome', 'interestExpense', 'receivablesChange', 'inventoriesChange', 'payablesChange',
  'otherAssetsChange', 'otherLiabilitiesChange', 'subtotal', 'interestDividendReceived', 'interestPaid', 'incomeTaxesPaid', 'operatingCashFlow',
  'capex', 'otherInvestingChange', 'investingCashFlow', 'shortTermDebtChange', 'longTermBorrowings', 'longTermRepayments', 'dividendsPaid',
  'financingCashFlow', 'fxEffect', 'netChangeInCash', 'cashBeginning', 'cashEnding',
];
const CF_EMPHASIS = new Set(['subtotal', 'operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'netChangeInCash', 'cashBeginning', 'cashEnding']);

function summary(c: Ctx): ViewSection[] {
  const line = (f: string) =>
    c.row(`summary.${f}`, [c.cell(`summary.${f}.previous`, 'money', 'previous'), c.cell(`summary.${f}.current`, 'money', 'current'), c.cell(`summary.${f}.changeRate`, 'percent')]);
  const one = (f: string, kind: Parameters<Ctx['cell']>[1], stage: 'previous' | 'current' = 'current') => c.row(`summary.${f}`, [c.cell(`summary.${f}`, kind, stage)]);
  const date = (f: string) => c.row(`dates.${f}`, [c.cell(`dates.${f}`, 'date')]);
  return [
    plain([col('前期'), col('当期'), col('前期比')], ['netSales', 'operatingIncome', 'ordinaryIncome', 'netIncomeParent'].map(line), '経営成績'),
    plain(
      [col('当期')],
      [one('operatingMargin', 'percent'), one('roe', 'percent'), one('eps', 'perShare'), one('totalAssets', 'money'), one('netAssets', 'money'), one('equity', 'money'), one('equityRatio', 'percent'), one('bps', 'perShare')],
      '財政状態・指標',
    ),
    // 当期と前期の値が並ぶので、列見出しは付けない (前期の値が「当期」の列に見えないように)。行の名前に 前期 と付いている
    single(
      [one('annualDividend', 'perShare'), one('interimDividend', 'perShare'), one('annualDividendPrevious', 'perShare', 'previous'), one('interimDividendPrevious', 'perShare', 'previous'), one('dividendTotal', 'money'), one('payoutRatio', 'percent')],
      '配当',
    ),
    single([one('accountingPolicyChange', 'flag')], '会計方針'),
    single(['periodEnd', 'previousPeriodEnd', 'disclosure', 'shareholdersMeeting'].map(date), '日程'),
    single([one('auditNote', 'text')], '注意書き'),
  ];
}

function balanceSheet(c: Ctx): ViewSection[] {
  // 列見出しの日付のセルは、最初の節だけが持つ (同じ path のセルを 2 つ作らない)
  const columns = PREV_CUR.map((s) => col(s === 'previous' ? '前期' : '当期', c.cell(`columnDates.balanceSheet.${s}`, 'date')));
  const labelsOnly = columns.map((x) => col(x.label));
  return BS_SECTIONS.map(([title, fields], i) =>
    plain(i === 0 ? columns : labelsOnly, fields.map((f) => c.row(`balanceSheet.current.${f}`, PREV_CUR.map((s) => c.cell(`balanceSheet.${s}.${f}`, 'money', s)), f.startsWith('total'))), title),
  );
}

function incomeStatement(c: Ctx): ViewSection[] {
  const columns = PREV_CUR.map((s) => col(s === 'previous' ? '前期' : '当期', c.cell(`columnDates.incomeStatement.${s}`, 'date')));
  return [plain(columns, PL_FIELDS.map((f) => c.row(`incomeStatement.current.${f}`, PREV_CUR.map((s) => c.cell(`incomeStatement.${s}.${f}`, 'money', s)), PL_EMPHASIS.has(f)))) ];
}

function cashFlow(c: Ctx): ViewSection[] {
  const columns = [col('当期', c.cell('columnDates.cashFlow.current', 'date'))];
  return [plain(columns, CF_FIELDS.map((f) => c.row(`cashFlow.${f}`, [c.cell(`cashFlow.${f}`, 'money', 'current')], CF_EMPHASIS.has(f))))];
}

function notes(c: Ctx): ViewSection[] {
  const seg = (s: 'previous' | 'current') => c.root && (c.at(`notes.segments.${s}.segments`) as unknown[] | undefined)?.length;
  const count = Math.max(seg('previous') ?? 0, seg('current') ?? 0);
  const text = (f: string) => c.row(`notes.${f}`, [c.cell(`notes.${f}`, 'text')]);
  const sections: ViewSection[] = [single(['goingConcern', 'cashScope'].map(text), '継続企業・資金の範囲')];
  for (let i = 0; i < count; i++) {
    const columns = PREV_CUR.map((s) => col(s === 'previous' ? '前期' : '当期', c.cell(`notes.segments.${s}.segments.${i}.name`, 'text')));
    const line = (f: 'netSales' | 'profit') => c.row(`notes.segments.current.segments.${i}.${f}`, PREV_CUR.map((s) => c.cell(`notes.segments.${s}.segments.${i}.${f}`, 'money', s)));
    sections.push(plain(columns, [line('netSales'), line('profit')], `セグメント情報 ${i + 1}`));
  }
  const total = (f: string) => c.row(`notes.segments.current.${f}`, PREV_CUR.map((s) => c.cell(`notes.segments.${s}.${f}`, 'money', s)));
  sections.push(plain([col('前期'), col('当期')], ['adjustment', 'consolidatedNetSales', 'consolidatedOperatingIncome'].map(total), 'セグメント情報 全社'));
  sections.push(
    plain(
      [col('当期')],
      [
        c.row('notes.averageSharesThousand', [c.cell('notes.averageSharesThousand', 'shares', 'current')]),
        c.row('notes.bps', [c.cell('notes.bps', 'perShare', 'current')]),
        c.row('notes.eps', [c.cell('notes.eps', 'perShare', 'current')]),
      ],
      '1株当たり情報',
    ),
  );
  sections.push(single(['subsequentEvents', 'accountingPolicyNote'].map(text), '後発事象・会計方針'));
  return sections;
}

const BUILDERS: Record<TanshinScreenId, (c: Ctx) => ViewSection[]> = { summary, balanceSheet, incomeStatement, cashFlow, notes };

export function buildTanshin(c: Ctx, id: TanshinScreenId, title: string): ViewScreen {
  const sections = BUILDERS[id](c);
  const header = c.header();
  const extra: ViewCell[] = [];
  if (id === 'cashFlow') {
    const prev = c.cell('columnDates.cashFlow.previous', 'date');
    if (prev) extra.push(prev);
  }
  return { doc: 'tanshin', id, title, header: extra.length ? { ...header, extra } : header, sections, charts: [], sentences: [] };
}
