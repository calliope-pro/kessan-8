// 問題データの型 (正本)。docs/design.md §4.2 に同じ全文を載せ、src/domain/design-sync.test.ts が一致を確かめる。
// 金額は百万円 (百万円未満切捨ての整数)。比率は % (小数第一位)。1 株当たりは円。符号は数値の符号で持つ。

/** 難易度。 */
export type Difficulty = 'easy' | 'hard';

/** 資料の種類。決算短信 = tanshin、IR スライド = ir。 */
export type DocKind = 'tanshin' | 'ir';

/** 決算短信の 5 画面 (この順に並べる)。 */
export const TANSHIN_SCREENS = ['summary', 'balanceSheet', 'incomeStatement', 'cashFlow', 'notes'] as const;
export type TanshinScreenId = (typeof TANSHIN_SCREENS)[number];

/** IR スライドの 5 画面 (この順に並べる)。 */
export const IR_SLIDES = ['highlights', 'results', 'segments', 'outlook', 'supplement'] as const;
export type IrSlideId = (typeof IR_SLIDES)[number];

/** 異変の段。やさしい = appearance・calculation、むずかしい = accounting・cross-document を多めにする。 */
export const ANOMALY_STAGES = ['appearance', 'calculation', 'accounting', 'cross-document'] as const;
export type AnomalyStage = (typeof ANOMALY_STAGES)[number];

/** 前期と当期の組。 */
export interface Pair {
  previous: number;
  current: number;
}

/** 前期比つきの項目。changeRate は前期比の増減率 (%)。 */
export interface Change extends Pair {
  changeRate: number;
}

/** 架空の会社 (src/data/companies.json)。実在の企業名・人物は使わない。 */
export interface Company {
  id: string;
  name: string;
  industry: string;
  /** 2 つの事業セグメントの名前。 */
  segmentNames: [string, string];
  /** 決算期末の月 (3 = 3 月期)。 */
  fiscalYearEndMonth: number;
  /** 事業の説明 1 文 (導入の 1 行の出所。数字・増減の語を含めない)。UX の部品 P2 を採るとき必須。 */
  business?: string;
  /** 社章の幾何形の指定 (形の名前とパラメータ)。生成は純粋な関数。配色は industry から引く表 (ui の定数) で、ここには持たない。UX の部品 V3 を採るとき必須。 */
  emblem?: { shape: string; params?: number[] };
}

/** 異変の種類の一覧 (src/data/anomaly-kinds.json)。 */
export interface AnomalyKind {
  id: string;
  stage: AnomalyStage;
  /** 遊び手に見せる名前 (答え合わせで使う)。 */
  name: string;
  /** 種類ごとの一般的な見かた 1 行。UX の部品 R7 を採るとき必須。 */
  tip?: string;
  /** この種類の異変で破れる、検証器の規則 ID。正常な問題ではすべて成り立ち、この種類の問題ではこれだけが破れる。 */
  rules: string[];
}

/** 資料の見出し。見た目の異変 (社名の誤植・単位違い・期の表記違い) はここに入る。 */
export interface DocHeader {
  companyName: string;
  /** 例: 2027年3月期 */
  periodLabel: string;
  /** 例: 百万円 */
  unit: string;
}

/** 貸借対照表 (期末 1 時点)。 */
export interface BalanceSheet {
  cash: number;
  receivables: number;
  inventories: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  tangibleAssets: number;
  investments: number;
  totalFixedAssets: number;
  totalAssets: number;
  payables: number;
  shortTermDebt: number;
  incomeTaxesPayable: number;
  otherCurrentLiabilities: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  capitalStock: number;
  capitalSurplus: number;
  retainedEarnings: number;
  totalShareholdersEquity: number;
  nonControllingInterests: number;
  totalNetAssets: number;
  totalLiabilitiesAndNetAssets: number;
}

/** 損益計算書 (1 期間)。 */
export interface IncomeStatement {
  netSales: number;
  costOfSales: number;
  grossProfit: number;
  sga: number;
  operatingIncome: number;
  nonOperatingIncome: number;
  nonOperatingExpenses: number;
  ordinaryIncome: number;
  extraordinaryGain: number;
  extraordinaryLoss: number;
  incomeBeforeTax: number;
  incomeTaxes: number;
  netIncome: number;
  netIncomeNonControlling: number;
  netIncomeParent: number;
}

/** キャッシュ・フロー計算書 (当期、間接法)。 */
export interface CashFlow {
  incomeBeforeTax: number;
  depreciation: number;
  interestDividendIncome: number;
  interestExpense: number;
  receivablesChange: number;
  inventoriesChange: number;
  payablesChange: number;
  otherAssetsChange: number;
  otherLiabilitiesChange: number;
  subtotal: number;
  interestDividendReceived: number;
  interestPaid: number;
  incomeTaxesPaid: number;
  operatingCashFlow: number;
  capex: number;
  otherInvestingChange: number;
  investingCashFlow: number;
  shortTermDebtChange: number;
  longTermDebtChange: number;
  dividendsPaid: number;
  financingCashFlow: number;
  fxEffect: number;
  netChangeInCash: number;
  cashBeginning: number;
  cashEnding: number;
}

/** セグメント 1 つ分。name は company.segmentNames と同じ。 */
export interface SegmentLine {
  name: string;
  netSales: number;
  profit: number;
}

/** 1 期間のセグメント情報。調整額は全社費用など (負の値)。 */
export interface SegmentInfo {
  segments: [SegmentLine, SegmentLine];
  adjustment: number;
  consolidatedNetSales: number;
  consolidatedOperatingIncome: number;
}

/** 決算短信の 5 画面目 (注記)。 */
export interface TanshinNotes {
  goingConcern: string;
  cashScope: string;
  segments: { previous: SegmentInfo; current: SegmentInfo };
  averageSharesThousand: number;
  bps: number;
  eps: number;
  subsequentEvents: string;
}

/** 決算短信 (5 画面)。 */
export interface Tanshin {
  header: DocHeader;
  /** 1 画面目: サマリー。 */
  summary: {
    netSales: Change;
    operatingIncome: Change;
    ordinaryIncome: Change;
    netIncomeParent: Change;
    eps: number;
    totalAssets: number;
    netAssets: number;
    equityRatio: number;
    bps: number;
    annualDividend: number;
    payoutRatio: number;
  };
  balanceSheet: { previous: BalanceSheet; current: BalanceSheet };
  incomeStatement: { previous: IncomeStatement; current: IncomeStatement };
  cashFlow: CashFlow;
  notes: TanshinNotes;
}

/** IR スライド (5 画面)。 */
export interface IrDeck {
  header: DocHeader;
  highlights: {
    netSales: { amount: number; changeRate: number };
    operatingIncome: { amount: number; changeRate: number };
    ordinaryIncome: { amount: number; changeRate: number };
    netIncomeParent: { amount: number; changeRate: number };
    annualDividend: number;
    payoutRatio: number;
  };
  results: {
    netSales: Pair;
    grossProfit: Pair;
    grossMargin: Pair;
    operatingIncome: Pair;
    operatingMargin: Pair;
    commentary?: string;
  };
  segments: {
    items: [
      { name: string; netSales: Change; profit: Change; salesShare: number },
      { name: string; netSales: Change; profit: Change; salesShare: number },
    ];
    adjustment: Pair;
    consolidatedOperatingIncome: Pair;
  };
  outlook: {
    forecast: {
      netSales: number;
      netSalesChangeRate: number;
      operatingIncome: number;
      operatingIncomeChangeRate: number;
      capex: number;
      depreciation: number;
      annualDividend: number;
    };
    /** 比較用の当期実績。 */
    actual: { netSales: number; operatingIncome: number; capex: number; depreciation: number };
    commentary?: string;
  };
  supplement: {
    capex: { previous: number | null; current: number };
    depreciation: { previous: number | null; current: number };
    interestBearingDebt: Pair;
    cash: Pair;
    netDebt: Pair;
    equityRatio: number;
  };
}

/** 異変の場所。path は資料の中の位置で、先頭が画面の ID か header (例: incomeStatement.current.ordinaryIncome、header.companyName)。 */
export interface AnomalyPlace {
  doc: DocKind;
  path: string;
}

/** 異変の指定と答え合わせの文言。問題データのここが唯一の出所で、画面はこれを表示するだけ。 */
export interface Anomaly {
  /** AnomalyKind.id。段 (stage) は AnomalyKind が唯一の出所なので、ここには持たない。 */
  kind: string;
  /** 1 件以上。資料間の矛盾は食い違う両側の場所を並べる。 */
  places: AnomalyPlace[];
  /** 答え合わせの文言 (何がどう食い違っているか。数字を含める)。 */
  explanation: string;
}

/** 1 問 = 架空の 1 社の資料束。src/data/problems/<難易度>/<id>.json の中身そのもの。 */
export interface Problem {
  /** 例: easy-001。ファイル名と同じ。 */
  id: string;
  difficulty: Difficulty;
  /** Company.id。 */
  companyId: string;
  /** 決算期の年 (2027 = 2027年3月期)。 */
  fiscalYear: number;
  /** 難しさの段 (1 = 目立つ、3 = 紛らわしい)。正常な問題にも付ける。UX の部品 P1 を採るとき必須。 */
  tier?: 1 | 2 | 3;
  tanshin: Tanshin;
  ir: IrDeck;
  /** 項目名の差し替え (見た目の異変用)。キーは項目キー (docs/design.md §4.1)。正常な問題には無い。 */
  labelOverrides?: Record<string, string>;
  /** null = 正常。 */
  anomaly: Anomaly | null;
}
