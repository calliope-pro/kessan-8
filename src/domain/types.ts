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

/** 異変の系統 (docs/plans/anomalies.md §5 の「系統」。見た目・計算・文章・会計・資料間・注記・手口)。 */
export const ANOMALY_FAMILIES = ['appearance', 'calculation', 'text', 'accounting', 'cross-document', 'notes', 'tactics'] as const;
export type AnomalyFamily = (typeof ANOMALY_FAMILIES)[number];

/** 系統 → 出す難易度。やさしい = 見た目・計算・文章、むずかしい = 会計・資料間・注記・手口。受け入れ条件 6 の「やさしいは見た目と計算、むずかしいは会計と資料間を多め」は、この表で数える。 */
export const FAMILY_DIFFICULTY: Record<AnomalyFamily, Difficulty> = {
  appearance: 'easy',
  calculation: 'easy',
  text: 'easy',
  accounting: 'hard',
  'cross-document': 'hard',
  notes: 'hard',
  tactics: 'hard',
};

/** 前期と当期の組。 */
export interface Pair {
  previous: number;
  current: number;
}

/** 前期比つきの項目。changeRate は前期比の増減率 (%)。 */
export interface Change extends Pair {
  changeRate: number;
}

/** 架空の会社 (src/data/companies.json。設定は docs/plans/companies.md)。実在の企業名・人物は使わない。 */
export interface Company {
  id: string;
  name: string;
  /** 証券コード (架空。08xx)。 */
  securitiesCode: string;
  industry: string;
  /** 事業セグメントの名前 (2 つか 3 つ)。短信・IR のセグメントの数と並びは、これと同じ。 */
  segmentNames: string[];
  /** 決算期末の月 (3 = 3 月期)。 */
  fiscalYearEndMonth: number;
  /** IR の金額の単位。百万円 = 短信と同じ。億円 = 短信の百万円 ÷ 100 を小数第一位まで四捨五入した値 (docs/design.md §4.1)。 */
  irUnit: '百万円' | '億円';
  /** 社章 (幾何図形の記号 1 文字。画像は使わない)。 */
  emblem: string;
  /** 社色と淡い色 (社色は白に対するコントラスト比 4.5 以上を計算済み。companies.md §4)。 */
  colors: { main: string; light: string };
  /** 事業の説明 1 文 (導入の 1 行の出所。数字・増減の語を含めない)。UX の部品 P2 を採るとき必須。 */
  business?: string;
}

/** 異変の種類の一覧 (src/data/anomaly-kinds.json。定義は docs/plans/anomalies.md)。 */
export interface AnomalyKind {
  id: string;
  family: AnomalyFamily;
  /** 遊び手に見せる名前 (答え合わせで使う)。 */
  name: string;
  /** 種類ごとの一般的な見かた 1 行。UX の部品 R7 を採るとき必須。 */
  tip?: string;
  /** 主な規則: この種類を定義する検証器の規則 ID。異変の問題では、このうち 1 つ以上が必ず落ちる。 */
  primaryRules: string[];
  /** 許容集合: この種類の異変で落ちてよい規則 ID (primaryRules を含む)。同じ原因で必然的に付随して落ちる規則を含む。 */
  allowedRules: string[];
}

/** 資料の見出し。見た目の異変 (社名の誤植・単位違い・期の表記違い) はここに入る。 */
export interface DocHeader {
  companyName: string;
  /** Company.securitiesCode と同じ。 */
  securitiesCode: string;
  /** 例: 2027年3月期 */
  periodLabel: string;
  /** 資料の金額の単位。短信 = 百万円、IR = Company.irUnit。 */
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

/** セグメント 1 つ分。name は Company.segmentNames と同じ。 */
export interface SegmentLine {
  name: string;
  netSales: number;
  profit: number;
}

/** 1 期間のセグメント情報。調整額は全社費用など (負の値)。 */
export interface SegmentInfo {
  /** Company.segmentNames と同じ数・並び。 */
  segments: SegmentLine[];
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
  /** 会計方針の変更等の記述 (「該当事項はありません。」か、変更の説明)。summary.accountingPolicyChange と食い違わない。 */
  accountingPolicyNote: string;
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
    /** 売上高営業利益率 (%)。 */
    operatingMargin: number;
    /** 自己資本当期純利益率 (%)。期首と期末の自己資本の平均で割る。 */
    roe: number;
    eps: number;
    totalAssets: number;
    netAssets: number;
    /** (参考) 自己資本 = 純資産合計 − 非支配株主持分。 */
    equity: number;
    equityRatio: number;
    bps: number;
    annualDividend: number;
    /** 前期の年間配当金 (円)。 */
    annualDividendPrevious: number;
    /** 配当金総額 (百万円)。 */
    dividendTotal: number;
    payoutRatio: number;
    /** 会計基準等の改正に伴う会計方針の変更の有無。 */
    accountingPolicyChange: boolean;
    /** 最下部の注意書き (正常 = 「決算短信は公認会計士又は監査法人の監査の対象外です」)。 */
    auditNote: string;
  };
  /** 日付 (YYYY-MM-DD)。期末日が決算期と合い、期末日 < 発表日 < 定時株主総会の日。 */
  dates: { periodEnd: string; previousPeriodEnd: string; disclosure: string; shareholdersMeeting: string };
  /** 各画面の列見出しの期末日 (YYYY-MM-DD)。正常は dates と同じ。 */
  columnDates: {
    balanceSheet: { previous: string; current: string };
    incomeStatement: { previous: string; current: string };
    cashFlow: { previous: string; current: string };
  };
  balanceSheet: { previous: BalanceSheet; current: BalanceSheet };
  incomeStatement: { previous: IncomeStatement; current: IncomeStatement };
  cashFlow: CashFlow;
  notes: TanshinNotes;
}

/** IR の文章の主張が見る数字。方向は、短信の数字の動きと照らす (docs/design.md §4.1)。 */
export const CLAIM_METRICS = [
  'netSales',
  'operatingIncome',
  'ordinaryIncome',
  'netIncomeParent',
  'forecastNetSales',
  'forecastOperatingIncome',
  'dividend',
  'interestBearingDebt',
] as const;
export type ClaimMetric = (typeof CLAIM_METRICS)[number];

/** 文章の主張: 数字の動き。zero は有利子負債が無いこと (「無借金」)。 */
export interface IrClaim {
  metric: ClaimMetric;
  direction: 'up' | 'down' | 'zero';
}

/** IR スライドの文章 1 つと、それが主張する数字の動き (文章と数字の矛盾を機械で確かめるため)。 */
export interface IrStatement {
  slide: IrSlideId;
  text: string;
  claims: IrClaim[];
}

/** グラフの棒 (棒の高さは、表示の数字と同じ単位の値)。軸の下端は 0 が正常。 */
export interface ChartBars {
  axisMin: number;
  previous: number;
  current: number;
}

/** IR スライド (5 画面)。金額は header.unit の単位 (億円なら小数第一位)。比率は短信の百万円の値から計算した値を出す。 */
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
    /** 棒グラフ (売上高・営業利益)。 */
    chart: { netSales: ChartBars; operatingIncome: ChartBars };
  };
  segments: {
    /** 短信のセグメントと同じ数・並び (欠けると資料間の食い違い)。 */
    items: { name: string; netSales: Change; profit: Change; salesShare: number }[];
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
    /** 期末後の出来事 (金額つきの文)。無ければ null。短信の重要な後発事象が「該当なし」のときは null が正常。 */
    subsequentEvent: string | null;
  };
  supplement: {
    capex: { previous: number | null; current: number };
    depreciation: { previous: number | null; current: number };
    interestBearingDebt: Pair;
    cash: Pair;
    netDebt: Pair;
    equityRatio: number;
  };
  /** 文章と、それが主張する数字の動き。 */
  statements: IrStatement[];
}

/**
 * 異変の場所。数字・文のセルは path (先頭が画面の ID か header。例: incomeStatement.current.ordinaryIncome、header.companyName)。
 * 項目名 (行の名前。科目名の誤字など) は itemKey (docs/design.md §4.1 の項目キー)。
 */
export type AnomalyPlace = { doc: DocKind; path: string } | { doc: DocKind; itemKey: string };

/** 異変の指定と答え合わせの文言。問題データのここが唯一の出所で、画面はこれを表示するだけ。 */
export interface Anomaly {
  /** AnomalyKind.id。系統 (family) は AnomalyKind が唯一の出所なので、ここには持たない。 */
  kind: string;
  /** 1 件以上。資料間の矛盾は食い違う両側の場所を並べる。 */
  places: AnomalyPlace[];
  /** 答え合わせの文言 (何がどう食い違っているか。数字を含める)。 */
  explanation: string;
  /**
   * 落ちるべき検証器の規則 ID の集合 (期待集合)。変えたセルによって落ちる規則が変わるので、問題ごとに持つ。
   * 検証器は、実際に落ちた集合とこれが一致すること、kind の primaryRules を 1 つ以上含み allowedRules に収まることを確かめる。
   */
  expectedRules: string[];
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
  /** 画面ごとの単位の差し替え (見た目の異変用)。キーは `<doc>.<画面の ID>`、値は表示する単位の語。正常な問題には無い。 */
  unitOverrides?: Record<string, string>;
  /** 負の数の記号の差し替え (見た目の異変用)。キーは `<doc>.<path>`、値は表示する記号。正常な問題には無い。 */
  signOverrides?: Record<string, string>;
  /** null = 正常。 */
  anomaly: Anomaly | null;
}
