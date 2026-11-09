// 型の形の検証 (実行時)。記述子は型から機械的に写し、キーの漏れ・余りは tsc が止める。
import { ANOMALY_FAMILIES, CLAIM_METRICS, IR_SLIDES, RELATION_CHECKS } from '../domain/types.ts';
import type {
  Anomaly,
  AnomalyKind,
  BalanceSheet,
  CashFlow,
  Change,
  ChartBars,
  Company,
  DocHeader,
  IncomeStatement,
  IrClaim,
  IrDeck,
  IrStatement,
  Pair,
  Problem,
  SegmentInfo,
  SegmentLine,
  Tanshin,
  TanshinNotes,
} from '../domain/types.ts';

type Desc =
  | 'number'
  | 'numberOrNull'
  | 'string'
  | 'stringOrNull'
  | 'boolean'
  | 'place'
  | 'anomalyOrNull'
  | 'cardEdit'
  | { enum: readonly (string | number)[] }
  | { array: Desc; min: number; max: number }
  | { record: Desc }
  | { object: Record<string, Desc>; optional?: Record<string, Desc> };

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];
/** T のキーの漏れ・余りを型で止める記述子。 */
function obj<T extends object>(required: { [K in RequiredKeys<T>]: Desc }, optional?: { [K in OptionalKeys<T>]: Desc }): Desc {
  return { object: required as Record<string, Desc>, optional: optional as Record<string, Desc> | undefined };
}
const N = 'number' as const;
const S = 'string' as const;
const list = (item: Desc, min = 0, max = Number.POSITIVE_INFINITY): Desc => ({ array: item, min, max });

const PAIR = obj<Pair>({ previous: N, current: N });
const CHANGE = obj<Change>({ previous: N, current: N, changeRate: N });
const HEADER = obj<DocHeader>({ companyName: S, securitiesCode: S, periodLabel: S, unit: S });
const BS = obj<BalanceSheet>({
  cash: N, receivables: N, inventories: N, otherCurrentAssets: N, totalCurrentAssets: N, tangibleAssets: N, investments: N, totalFixedAssets: N, totalAssets: N,
  payables: N, shortTermDebt: N, incomeTaxesPayable: N, otherCurrentLiabilities: N, totalCurrentLiabilities: N, longTermDebt: N, totalLiabilities: N,
  capitalStock: N, capitalSurplus: N, retainedEarnings: N, totalShareholdersEquity: N, nonControllingInterests: N, totalNetAssets: N, totalLiabilitiesAndNetAssets: N,
});
const PL = obj<IncomeStatement>({
  netSales: N, costOfSales: N, grossProfit: N, sga: N, operatingIncome: N, nonOperatingIncome: N, nonOperatingExpenses: N, ordinaryIncome: N,
  extraordinaryGain: N, extraordinaryLoss: N, incomeBeforeTax: N, incomeTaxes: N, netIncome: N, netIncomeNonControlling: N, netIncomeParent: N,
});
const CF = obj<CashFlow>({
  incomeBeforeTax: N, depreciation: N, interestDividendIncome: N, interestExpense: N, receivablesChange: N, inventoriesChange: N, payablesChange: N,
  otherAssetsChange: N, otherLiabilitiesChange: N, subtotal: N, interestDividendReceived: N, interestPaid: N, incomeTaxesPaid: N, operatingCashFlow: N,
  capex: N, otherInvestingChange: N, investingCashFlow: N, shortTermDebtChange: N, longTermBorrowings: N, longTermRepayments: N, dividendsPaid: N,
  financingCashFlow: N, fxEffect: N, netChangeInCash: N, cashBeginning: N, cashEnding: N,
});
const SEGMENT_LINE = obj<SegmentLine>({ name: S, netSales: N, profit: N });
const SEGMENT_INFO = obj<SegmentInfo>({ segments: list(SEGMENT_LINE, 2, 3), adjustment: N, consolidatedNetSales: N, consolidatedOperatingIncome: N });
const NOTES = obj<TanshinNotes>({
  goingConcern: S, cashScope: S, segments: obj<TanshinNotes['segments']>({ previous: SEGMENT_INFO, current: SEGMENT_INFO }),
  averageSharesThousand: N, bps: N, eps: N, subsequentEvents: S, accountingPolicyNote: S,
});
const DATE_PAIR = obj<{ previous: string; current: string }>({ previous: S, current: S });
const TANSHIN = obj<Tanshin>({
  header: HEADER,
  summary: obj<Tanshin['summary']>({
    netSales: CHANGE, operatingIncome: CHANGE, ordinaryIncome: CHANGE, netIncomeParent: CHANGE, operatingMargin: N, roe: N, eps: N, totalAssets: N, netAssets: N,
    equity: N, equityRatio: N, bps: N, annualDividend: N, interimDividend: N, annualDividendPrevious: N, interimDividendPrevious: N, dividendTotal: N,
    payoutRatio: N, accountingPolicyChange: 'boolean', auditNote: S,
  }),
  dates: obj<Tanshin['dates']>({ periodEnd: S, previousPeriodEnd: S, disclosure: S, shareholdersMeeting: S }),
  columnDates: obj<Tanshin['columnDates']>({ balanceSheet: DATE_PAIR, incomeStatement: DATE_PAIR, cashFlow: DATE_PAIR }),
  balanceSheet: obj<Tanshin['balanceSheet']>({ previous: BS, current: BS }),
  incomeStatement: obj<Tanshin['incomeStatement']>({ previous: PL, current: PL }),
  cashFlow: CF,
  notes: NOTES,
});
const CHART = obj<ChartBars>({ axisMin: N, previous: N, current: N });
const CLAIM = obj<IrClaim>({ metric: { enum: CLAIM_METRICS }, direction: { enum: ['up', 'down', 'zero'] } });
const STATEMENT = obj<IrStatement>({ slide: { enum: IR_SLIDES }, text: S, claims: list(CLAIM) });
const SEG_ITEM = obj<IrDeck['segments']['items'][number]>({ name: S, netSales: CHANGE, profit: CHANGE, salesShare: N });
const IR = obj<IrDeck>({
  header: HEADER,
  highlights: obj<IrDeck['highlights']>({
    netSales: obj<{ amount: number; changeRate: number }>({ amount: N, changeRate: N }),
    operatingIncome: obj<{ amount: number; changeRate: number }>({ amount: N, changeRate: N }),
    ordinaryIncome: obj<{ amount: number; changeRate: number }>({ amount: N, changeRate: N }),
    netIncomeParent: obj<{ amount: number; changeRate: number }>({ amount: N, changeRate: N }),
    annualDividend: N,
    payoutRatio: N,
  }),
  results: obj<IrDeck['results']>({
    netSales: PAIR, grossProfit: PAIR, grossMargin: PAIR, operatingIncome: PAIR, operatingMargin: PAIR,
    chart: obj<IrDeck['results']['chart']>({ netSales: CHART, operatingIncome: CHART }),
  }),
  segments: obj<IrDeck['segments']>({ items: list(SEG_ITEM, 2, 3), adjustment: PAIR, consolidatedOperatingIncome: PAIR }),
  outlook: obj<IrDeck['outlook']>({
    forecast: obj<IrDeck['outlook']['forecast']>({ netSales: N, netSalesChangeRate: N, operatingIncome: N, operatingIncomeChangeRate: N, capex: N, depreciation: N, annualDividend: N }),
    actual: obj<IrDeck['outlook']['actual']>({ netSales: N, operatingIncome: N, capex: N, depreciation: N }),
    subsequentEvent: 'stringOrNull',
  }),
  supplement: obj<IrDeck['supplement']>({
    capex: obj<IrDeck['supplement']['capex']>({ previous: 'numberOrNull', current: N }),
    depreciation: obj<IrDeck['supplement']['depreciation']>({ previous: 'numberOrNull', current: N }),
    interestBearingDebt: PAIR, cash: PAIR, netDebt: PAIR, equityRatio: N,
  }),
  statements: list(STATEMENT),
});
const ANOMALY = obj<Anomaly>({ kind: S, places: list('place', 1), explanation: S, expectedRules: list(S) }, { base: S, changed: list(S) });
const PROBLEM = obj<Problem>(
  { id: S, difficulty: { enum: ['easy', 'hard'] }, companyId: S, fiscalYear: N, tanshin: TANSHIN, ir: IR, anomaly: 'anomalyOrNull' },
  { tier: { enum: [1, 2, 3] }, labelOverrides: { record: S }, unitOverrides: { record: S }, signOverrides: { record: S }, cardEdits: list('cardEdit') },
);
const COMPANY = obj<Company>(
  {
    id: S, name: S, securitiesCode: S, industry: S, segmentNames: list(S, 2, 3), fiscalYearEndMonth: N, irUnit: { enum: ['百万円', '億円'] }, emblem: S,
    colors: obj<Company['colors']>({ main: S, light: S }),
  },
  { business: S },
);
const KIND = obj<AnomalyKind>({ id: S, family: { enum: ANOMALY_FAMILIES }, name: S, primaryRules: list(S), allowedRules: list(S) }, { tip: S, relationChecks: list({ enum: RELATION_CHECKS }), ledger: { enum: ['v3'] } });

const typeName = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function check(value: unknown, desc: Desc, path: string, out: string[]): void {
  const where = path || '(ルート)';
  if (typeof desc === 'string') {
    if (desc === 'place') return checkPlace(value, where, out);
    if (desc === 'cardEdit') return checkCardEdit(value, where, out);
    if (desc === 'anomalyOrNull') return value === null ? undefined : check(value, ANOMALY, path, out);
    const okays: Record<string, boolean> = {
      number: typeof value === 'number' && Number.isFinite(value),
      numberOrNull: value === null || (typeof value === 'number' && Number.isFinite(value)),
      string: typeof value === 'string',
      stringOrNull: value === null || typeof value === 'string',
      boolean: typeof value === 'boolean',
    };
    if (!okays[desc]) out.push(`${where}: 型が違う (期待 ${desc}、実際 ${typeName(value)})`);
    return;
  }
  if ('enum' in desc) {
    if (!desc.enum.includes(value as string | number)) out.push(`${where}: ${JSON.stringify(value)} は ${JSON.stringify(desc.enum)} のどれでもない`);
  } else if ('array' in desc) {
    if (!Array.isArray(value)) return void out.push(`${where}: 型が違う (期待 array、実際 ${typeName(value)})`);
    if (value.length < desc.min || value.length > desc.max) out.push(`${where}: 長さ ${value.length} が ${desc.min}〜${desc.max} の外`);
    value.forEach((v, i) => check(v, desc.array, `${path}.${i}`, out));
  } else if ('record' in desc) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return void out.push(`${where}: 型が違う (期待 object、実際 ${typeName(value)})`);
    for (const [k, v] of Object.entries(value)) check(v, desc.record, `${path}.${k}`, out);
  } else {
    checkObject(value, desc, path, where, out);
  }
}

function checkObject(value: unknown, desc: { object: Record<string, Desc>; optional?: Record<string, Desc> }, path: string, where: string, out: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return void out.push(`${where}: 型が違う (期待 object、実際 ${typeName(value)})`);
  const record = value as Record<string, unknown>;
  const join = (k: string) => (path ? `${path}.${k}` : k);
  for (const [k, d] of Object.entries(desc.object)) {
    if (!(k in record)) out.push(`${join(k)}: 欠けている`);
    else check(record[k], d, join(k), out);
  }
  for (const [k, d] of Object.entries(desc.optional ?? {})) if (k in record) check(record[k], d, join(k), out);
  for (const k of Object.keys(record)) if (!(k in desc.object) && !(k in (desc.optional ?? {}))) out.push(`${join(k)}: 未知のキー`);
}

function checkPlace(value: unknown, where: string, out: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return void out.push(`${where}: 型が違う (期待 object、実際 ${typeName(value)})`);
  const r = value as Record<string, unknown>;
  if (r.doc === 'card') {
    if (r.card !== 0) out.push(`${where}.card: 0 でない (カードと資料は 1 つの欄の並び)`);
    if (typeof r.slot !== 'string') out.push(`${where}.slot: 文字列でない`);
    for (const k of Object.keys(r)) if (!['doc', 'card', 'slot'].includes(k)) out.push(`${where}.${k}: 未知のキー`);
    return;
  }
  if (r.doc !== 'tanshin' && r.doc !== 'ir') out.push(`${where}.doc: ${JSON.stringify(r.doc)} は tanshin・ir・card のどれか`);
  const hasPath = 'path' in r;
  const hasKey = 'itemKey' in r;
  if (hasPath === hasKey) out.push(`${where}: path か itemKey のどちらか 1 つだけ`);
  else if (typeof (hasPath ? r.path : r.itemKey) !== 'string') out.push(`${where}: path / itemKey が文字列でない`);
  for (const k of Object.keys(r)) if (!['doc', 'path', 'itemKey'].includes(k)) out.push(`${where}.${k}: 未知のキー`);
}

/** 形のずれの編集 (CardEdit)。op ごとに、持つキーが決まっている (docs/design-v3.md §1.6)。 */
const EDIT_KEYS: Record<string, string[]> = {
  drop: ['slot'],
  format: ['slot', 'style'],
  unit: ['slot', 'unit'],
  dup: ['slot'],
  suffix: ['slot', 'word'],
  glyph: ['slot', 'at'],
  sign: ['slot'],
  day: ['slot', 'day'],
  headline: ['word'],
};

function checkCardEdit(value: unknown, where: string, out: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return void out.push(`${where}: 型が違う (期待 object、実際 ${typeName(value)})`);
  const r = value as Record<string, unknown>;
  const op = typeof r.op === 'string' ? r.op : '';
  const needed = EDIT_KEYS[op];
  if (needed === undefined) out.push(`${where}.op: ${JSON.stringify(r.op)} は ${JSON.stringify(Object.keys(EDIT_KEYS))} のどれでもない`);
  if (r.card !== 0) out.push(`${where}.card: 0 でない (カードと資料は 1 つの欄の並び)`);
  for (const k of needed ?? []) {
    if (!(k in r)) out.push(`${where}.${k}: 欠けている`);
    else if (k === 'style') {
      if (r.style !== 'no-comma' && r.style !== 'comma-shift') out.push(`${where}.style: ${JSON.stringify(r.style)} は no-comma か comma-shift`);
    } else if (k === 'at') {
      if (typeof r.at !== 'number' || !Number.isInteger(r.at)) out.push(`${where}.at: 整数でない`);
    } else if (k === 'day') {
      if (r.day !== 32) out.push(`${where}.day: ${JSON.stringify(r.day)} は 32 でない`);
    } else if (typeof r[k] !== 'string') out.push(`${where}.${k}: 文字列でない`);
    else if (op === 'suffix' && k === 'word' && r.word !== '前期' && r.word !== '当期') out.push(`${where}.word: ${JSON.stringify(r.word)} は 前期 か 当期`);
    else if (op === 'suffix' && k === 'slot' && r.slot !== 'opPrev' && r.slot !== 'opCurr') out.push(`${where}.slot: ${JSON.stringify(r.slot)} は opPrev か opCurr`);
    else if (op === 'day' && k === 'slot' && r.slot !== 'period') out.push(`${where}.slot: ${JSON.stringify(r.slot)} は period`);
  }
  for (const k of Object.keys(r)) if (!['card', 'op', ...(needed ?? [])].includes(k)) out.push(`${where}.${k}: 未知のキー`);
}

/** 未検証の JSON が Problem の形か。誤りの配列 (空 = 形は正しい)。 */
export function shapeErrors(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['問題がオブジェクトでない'];
  const out: string[] = [];
  check(value, PROBLEM, '', out);
  return out;
}

export const companyShapeErrors = (value: unknown): string[] => {
  const out: string[] = [];
  check(value, COMPANY, '', out);
  return out;
};

export const kindShapeErrors = (value: unknown): string[] => {
  const out: string[] = [];
  check(value, KIND, '', out);
  return out;
};
