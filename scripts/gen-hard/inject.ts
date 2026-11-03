// @ts-nocheck — 正常な土台の 1 か所を変えて異変を入れ、答え合わせの文言と期待集合を作る (anomalies.md の定義どおり)。
// 変えたセル以外は触らない。何が落ちるか (expectedRules) は検証器に実際にかけて決め、種類の許容集合に収まることを #76 のテストが確かめる。
import { irScaled, toIrUnit } from '../../src/verifier/math.ts';
import { verifyProblem } from '../../src/verifier/index.ts';
import { roundHalfAway as rh } from '../../src/verifier/math.ts';

const clone = (x) => JSON.parse(JSON.stringify(x));
const n = (v) => Number(v).toLocaleString('ja-JP');
const fmt1 = (v) => Number(v).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** IR の単位に合わせて表示: 億円は小数第一位、百万円は整数。 */
const fu = (v, unit) => (unit === '億円' ? fmt1(v) : n(v));
/** 負の数は △ を付ける (資料の標準)。 */
const sg = (v) => (v < 0 ? `△${n(-v)}` : n(v));
const touches = (a, b) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/** 貸借対照表の小計・合計を、内訳から再計算する。 */
function resumBs(b) {
  b.totalCurrentAssets = b.cash + b.receivables + b.inventories + b.otherCurrentAssets;
  b.totalFixedAssets = b.tangibleAssets + b.investments;
  b.totalAssets = b.totalCurrentAssets + b.totalFixedAssets;
  b.totalCurrentLiabilities = b.payables + b.shortTermDebt + b.incomeTaxesPayable + b.otherCurrentLiabilities;
  b.totalLiabilities = b.totalCurrentLiabilities + b.longTermDebt;
  b.totalShareholdersEquity = b.capitalStock + b.capitalSurplus + b.retainedEarnings;
  b.totalNetAssets = b.totalShareholdersEquity + b.nonControllingInterests;
  b.totalLiabilitiesAndNetAssets = b.totalLiabilities + b.totalNetAssets;
}

/** キャッシュ・フロー計算書の小計以降を、内訳から再計算する。 */
function resumCf(cf) {
  cf.subtotal = cf.incomeBeforeTax + cf.depreciation + cf.interestDividendIncome + cf.interestExpense + cf.receivablesChange + cf.inventoriesChange + cf.payablesChange + cf.otherAssetsChange + cf.otherLiabilitiesChange;
  cf.operatingCashFlow = cf.subtotal + cf.interestDividendReceived + cf.interestPaid + cf.incomeTaxesPaid;
  cf.investingCashFlow = cf.capex + cf.otherInvestingChange;
  cf.financingCashFlow = cf.shortTermDebtChange + cf.longTermBorrowings + cf.longTermRepayments + cf.dividendsPaid;
  cf.netChangeInCash = cf.operatingCashFlow + cf.investingCashFlow + cf.financingCashFlow + cf.fxEffect;
  cf.cashEnding = cf.cashBeginning + cf.netChangeInCash;
}

/** T2 の合計が変わったとき、T1 の対応する値 (総資産・純資産・自己資本・自己資本比率・ROE・BPS) と、写し (注記の BPS・IR の自己資本比率) を T2 から再計算して揃える (anomalies.md G1)。 */
function realign(p) {
  const t = p.tanshin;
  const s = t.summary;
  const b1 = t.balanceSheet.current;
  const b0 = t.balanceSheet.previous;
  const eq1 = b1.totalNetAssets - b1.nonControllingInterests;
  const eq0 = b0.totalNetAssets - b0.nonControllingInterests;
  const shares = t.notes.averageSharesThousand;
  s.totalAssets = b1.totalAssets;
  s.netAssets = b1.totalNetAssets;
  s.equity = eq1;
  s.equityRatio = rh(eq1 * 1000, b1.totalAssets) / 10;
  s.bps = rh(eq1 * 100000, shares) / 100;
  s.roe = rh(t.incomeStatement.current.netIncomeParent * 2000, eq0 + eq1) / 10;
  t.notes.bps = s.bps;
  p.ir.supplement.equityRatio = s.equityRatio;
}

/** 数字の並びの入れ替え: 10 倍した整数の文字列で、隣り合う違う 2 桁を入れ替える (桁が多ければ 2 桁目から)。 */
function swapDigits(v) {
  const arr = [...String(Math.round(v * 10))];
  let i = arr.length >= 4 ? 1 : 0;
  while (i < arr.length - 1 && arr[i] === arr[i + 1]) i++;
  if (i >= arr.length - 1) i = arr.findIndex((c, k) => k < arr.length - 1 && c !== arr[k + 1]);
  if (i < 0) return Math.round(v * 11) / 10; // 全部同じ数字なら、1 割多い別の数字にする
  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  return Number(arr.join('')) / 10;
}

// 変更の定義。各関数は土台の複製 q を変更し、{ focus: 場所 (変えたセルなど), explanation } を返す。
export const INJECTORS = {
  'H-22': (q) => {
    q.tanshin.summary.auditNote = '決算短信は監査済みです';
    return {
      focus: [{ doc: 'tanshin', path: 'summary.auditNote' }],
      explanation: '決算短信 (サマリー) の注意書きが「監査済みです」となっています。決算短信は公認会計士又は監査法人の監査の対象外で、様式には「決算短信は公認会計士又は監査法人の監査の対象外です」と書く決まりです。',
    };
  },
  'H-28': (q) => {
    q.labelOverrides = { 'tanshin.balanceSheet.receivables': '買掛金' };
    return {
      focus: [{ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.receivables' }],
      explanation: '貸借対照表の資産の部に「買掛金」があります。買掛金は負債の科目で、負債の部に置くものです。資産の部のこの行は、売掛金のはずです。',
    };
  },
  'H-19': (q, co) => {
    const items = q.ir.segments.items;
    const dropped = items.pop();
    const unit = co.irUnit;
    for (const k of ['previous', 'current']) {
      const oi = q.ir.segments.consolidatedOperatingIncome[k];
      const sum10 = items.reduce((a, it) => a + Math.round(it.profit[k] * 10), 0);
      q.ir.segments.adjustment[k] = (Math.round(oi * 10) - sum10) / 10;
    }
    return {
      focus: [{ doc: 'ir', path: 'segments.items' }, { doc: 'tanshin', path: 'notes.segments.current.segments' }],
      explanation: `決算短信の注記のセグメントは ${q.tanshin.notes.segments.current.segments.length} つ (${q.tanshin.notes.segments.current.segments.map((s) => s.name).join('・')}) ですが、IR スライドのセグメント別には ${items.length} つしか載っていません。${dropped.name}が欠けています。`,
    };
  },
  'H-01': (q) => {
    const b = q.tanshin.balanceSheet.current;
    const d = Math.max(20, Math.round((b.payables * 0.06) / 10) * 10);
    const before = b.totalLiabilitiesAndNetAssets;
    b.payables += d;
    b.totalCurrentLiabilities += d;
    b.totalLiabilities += d;
    b.totalLiabilitiesAndNetAssets += d;
    return {
      focus: [
        { doc: 'tanshin', path: 'balanceSheet.current.payables' },
        { doc: 'tanshin', path: 'balanceSheet.current.totalAssets' },
        { doc: 'tanshin', path: 'balanceSheet.current.totalLiabilitiesAndNetAssets' },
      ],
      explanation: `貸借対照表の資産合計は ${n(b.totalAssets)} 百万円ですが、負債純資産合計は ${n(b.totalLiabilitiesAndNetAssets)} 百万円で、差は ${n(d)} です (どの小計も内訳の和と合っています)。貸借対照表は、資産の合計と、負債と純資産の合計が必ず一致します。買掛金が ${n(d)} 多く書かれています。`,
    };
  },
  'H-13': (q) => {
    const a = q.ir.highlights.netSales.amount;
    const swapped = swapDigits(a);
    q.ir.highlights.netSales.amount = swapped;
    const unit = q.ir.header.unit;
    return {
      focus: [{ doc: 'ir', path: 'highlights.netSales.amount' }, { doc: 'tanshin', path: 'incomeStatement.current.netSales' }],
      explanation: `IR スライド (ハイライト) の売上高は ${fu(swapped, unit)} ${unit}ですが、決算短信の損益計算書の売上高は ${n(q.tanshin.incomeStatement.current.netSales)} 百万円 (${fu(a, unit)} ${unit}) です。数字の並びが入れ替わっています。`,
    };
  },
  'H-17': (q) => {
    const a = q.ir.highlights.netSales.amount;
    q.ir.highlights.netSales.amount = Math.round(a * 10 * 10) / 10;
    return {
      focus: [{ doc: 'ir', path: 'highlights.netSales.amount' }, { doc: 'tanshin', path: 'incomeStatement.current.netSales' }],
      explanation: `IR スライド (ハイライト) の売上高は ${fmt1(q.ir.highlights.netSales.amount)} 億円ですが、決算短信の売上高 ${n(q.tanshin.incomeStatement.current.netSales)} 百万円は ${fmt1(a)} 億円です (1 億円 = 100 百万円)。換算で桁が 1 つずれています。`,
    };
  },
  'H-21': (q) => {
    const b = q.tanshin.balanceSheet.current;
    q.ir.statements.push({
      slide: 'highlights',
      text: '有利子負債はなく、無借金経営を続けております。',
      claims: [{ metric: 'interestBearingDebt', direction: 'zero' }],
    });
    return {
      focus: [{ doc: 'ir', path: `statements.${q.ir.statements.length - 1}.text` }, { doc: 'tanshin', path: 'balanceSheet.current.shortTermDebt' }, { doc: 'tanshin', path: 'balanceSheet.current.longTermDebt' }],
      explanation: `IR スライド (ハイライト) に「無借金経営」とありますが、決算短信の貸借対照表には短期借入金 ${n(b.shortTermDebt)} 百万円と長期借入金 ${n(b.longTermDebt)} 百万円があります。借入金が残っているので、無借金ではありません。`,
    };
  },
  'H-03': (q) => {
    const t = q.tanshin;
    const cf = t.cashFlow;
    const pre = cf.incomeBeforeTax;
    cf.incomeBeforeTax = t.incomeStatement.current.netIncome;
    resumCf(cf);
    return {
      focus: [{ doc: 'tanshin', path: 'cashFlow.incomeBeforeTax' }],
      explanation: `キャッシュ・フロー計算書の営業活動が「当期純利益」(${n(cf.incomeBeforeTax)} 百万円) から始まっています。日本の基準 (間接法) では税金等調整前当期純利益から始めます (損益計算書では ${n(pre)} 百万円)。`,
    };
  },
  'H-05': (q) => {
    const cf = q.tanshin.cashFlow;
    const was = cf.receivablesChange;
    cf.receivablesChange = -was;
    resumCf(cf);
    const b0 = q.tanshin.balanceSheet.previous.receivables;
    const b1 = q.tanshin.balanceSheet.current.receivables;
    return {
      focus: [{ doc: 'tanshin', path: 'cashFlow.receivablesChange' }],
      explanation: `売掛金は ${n(b0)} 百万円から ${n(b1)} 百万円に${b1 > b0 ? '増えた' : '減った'}ので、キャッシュ・フロー計算書の「売上債権の増減額」は ${sg(was)} (${was < 0 ? '資金が減る' : '資金が増える'}) と書くはずですが、${sg(cf.receivablesChange)} と書かれています。符号が逆です。`,
    };
  },
  'H-06': (q) => {
    const cf = q.tanshin.cashFlow;
    const was = cf.inventoriesChange;
    cf.inventoriesChange = -was;
    resumCf(cf);
    const b0 = q.tanshin.balanceSheet.previous.inventories;
    const b1 = q.tanshin.balanceSheet.current.inventories;
    return {
      focus: [{ doc: 'tanshin', path: 'cashFlow.inventoriesChange' }],
      explanation: `棚卸資産は ${n(b0)} 百万円から ${n(b1)} 百万円に${b1 > b0 ? '増えた' : '減った'}ので、キャッシュ・フロー計算書の「棚卸資産の増減額」は ${sg(was)} (${was < 0 ? '資金が減る' : '資金が増える'}) のはずですが、${sg(cf.inventoriesChange)} と書かれています。符号が逆です。`,
    };
  },
  'H-15': (q) => {
    const it = q.ir.segments.items[1];
    const was = it.profit.current;
    it.profit.current = swapDigits(was);
    const unit = q.ir.header.unit;
    const t = q.tanshin.notes.segments.current.segments[1];
    return {
      focus: [{ doc: 'ir', path: 'segments.items.1.profit.current' }, { doc: 'tanshin', path: 'notes.segments.current.segments.1.profit' }],
      explanation: `IR スライド (セグメント別) の${it.name}の利益は ${fu(it.profit.current, unit)} ${unit}ですが、決算短信の注記のセグメント情報では ${n(t.profit)} 百万円 (${fu(was, unit)} ${unit}) です。数字の並びが入れ替わっています。`,
    };
  },
  'H-16': (q) => {
    const o = q.ir.outlook;
    const was = o.actual.netSales;
    const unit = q.ir.header.unit;
    o.actual.netSales = unit === '億円' ? Math.round(was * 10 * 1.04) / 10 : Math.round(was * 1.04);
    o.forecast.netSalesChangeRate = rh((Math.round(o.forecast.netSales * 10) - Math.round(o.actual.netSales * 10)) * 1000, Math.round(o.actual.netSales * 10)) / 10;
    return {
      focus: [{ doc: 'ir', path: 'outlook.actual.netSales' }, { doc: 'tanshin', path: 'incomeStatement.current.netSales' }],
      explanation: `IR スライド (見通し) が比較に使っている当期の売上高は ${fu(o.actual.netSales, unit)} ${unit}ですが、決算短信の損益計算書の当期の売上高は ${n(q.tanshin.incomeStatement.current.netSales)} 百万円${unit === '億円' ? ` (${fu(was, unit)} ${unit})` : ''}です。見通しの比較の基準が違っています。`,
    };
  },
  'H-23': (q) => {
    q.tanshin.notes.accountingPolicyNote = '当期から、収益認識に関する会計基準の適用指針の改正を適用している。この変更による当期の損益への影響は軽微である。';
    return {
      focus: [{ doc: 'tanshin', path: 'summary.accountingPolicyChange' }, { doc: 'tanshin', path: 'notes.accountingPolicyNote' }],
      explanation: '決算短信のサマリーは会計方針の変更を「無」としていますが、注記には、当期から会計基準の適用指針の改正を適用したと書かれています。サマリーで「有」とすべきです (注記と食い違っています)。',
    };
  },
  'H-24': (q) => {
    const ni = q.tanshin.incomeStatement.current.netIncomeParent;
    const gain = Math.max(10, Math.round((ni * 0.58) / 10) * 10);
    const pct = Math.round((gain / ni) * 100);
    q.ir.outlook.subsequentEvent = `期末後に子会社を売却することを決定した。売却益は約 ${n(gain)} 百万円 (当期の親会社株主に帰属する当期純利益の約 ${pct}%) の見込みである。`;
    return {
      focus: [{ doc: 'tanshin', path: 'notes.subsequentEvents' }, { doc: 'ir', path: 'outlook.subsequentEvent' }],
      explanation: `決算短信の重要な後発事象は「該当事項はありません。」ですが、IR スライド (見通し) には、期末後に子会社の売却を決定し、売却益が約 ${n(gain)} 百万円 (当期純利益の約 ${pct}%) と書かれています。重要な後発事象は注記に書くものです。`,
    };
  },
  'H-02': (q) => {
    const t = q.tanshin;
    const b = t.balanceSheet.current;
    const d = Math.max(20, Math.round((b.retainedEarnings * 0.015) / 10) * 10);
    const expected = t.balanceSheet.previous.retainedEarnings + t.incomeStatement.current.netIncomeParent + t.cashFlow.dividendsPaid;
    b.retainedEarnings += d;
    resumBs(b);
    realign(q);
    return {
      focus: [{ doc: 'tanshin', path: 'balanceSheet.current.retainedEarnings' }],
      explanation: `利益剰余金は 前期末 ${n(t.balanceSheet.previous.retainedEarnings)} + 当期純利益 ${n(t.incomeStatement.current.netIncomeParent)} − 配当金の支払額 ${n(-t.cashFlow.dividendsPaid)} = ${n(expected)} 百万円になるはずですが、${n(b.retainedEarnings)} 百万円と書かれています (差は ${n(d)})。`,
    };
  },
  'H-09': (q) => {
    const t = q.tanshin;
    const b = t.balanceSheet.current;
    const d = Math.max(20, Math.round((b.tangibleAssets * 0.012) / 10) * 10);
    const expected = t.balanceSheet.previous.tangibleAssets - t.cashFlow.capex - t.cashFlow.depreciation;
    b.tangibleAssets += d;
    resumBs(b);
    realign(q);
    return {
      focus: [{ doc: 'tanshin', path: 'balanceSheet.current.tangibleAssets' }],
      explanation: `有形固定資産は 前期末 ${n(t.balanceSheet.previous.tangibleAssets)} + 設備投資 ${n(-t.cashFlow.capex)} − 減価償却費 ${n(t.cashFlow.depreciation)} = ${n(expected)} 百万円になるはずですが、${n(b.tangibleAssets)} 百万円と書かれています (差は ${n(d)})。`,
    };
  },
};

/** 違反の paths の最初の一つを場所にする。 */
function toPlace(path) {
  const [doc, ...rest] = path.split('.');
  return { doc, path: rest.join('.') };
}
const placeKey = (pl) => ('itemKey' in pl ? pl.itemKey : `${pl.doc}.${pl.path}`);

/** 異変を入れる: 土台の複製を変え、場所 (変えたセル + 違反に触れていない違反の最初のセル)・期待集合・文言を付ける。 */
export function inject(base, company, spec) {
  const q = clone(base);
  const fn = INJECTORS[spec.kind];
  if (!fn) throw new Error(`未実装の種類: ${spec.kind}`);
  const { focus, explanation } = fn(q, company);
  const result = verifyProblem(q, company);
  const rules = [...new Set(result.hard.map((v) => v.rule))].sort();
  const keep = [];
  for (const pl of focus) {
    const key = placeKey(pl);
    if (result.hard.some((v) => v.paths.some((p) => touches(key, p)))) keep.push(pl);
  }
  const places = [...keep];
  for (const v of result.hard) {
    if (!places.some((pl) => v.paths.some((p) => touches(placeKey(pl), p)))) places.push(toPlace(v.paths[0]));
  }
  q.anomaly = { kind: spec.kind, places, explanation, expectedRules: rules };
  q.tier = spec.tier;
  return q;
}
