// 設計 v2 §1.4: むずかしいの 3 形 (短信型・IR 型。各 数字 4 + 文 3) に、見え方の違う種類がいくつ収まるかを数える。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/shape-fit.ts
//   1. 検証器の各規則が 1 回の評価で読むセルの組を、正常な 1 問から取り出す (Reader の get・raw を差し替えて記録。添字は *)
//   2. 形ごとに「載せるセル」を定義し、数字 4・文 3 の上限を確かめる
//   3. 見え方の分類ごとに、その規則の評価の 1 組が全部、形のセルに載るかを調べる
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const imp = (p: string) => import(pathToFileURL(resolve(root, p)).href);
const dsl = await imp('src/verifier/rules/dsl.ts');
const idx = await imp('src/verifier/rules/index.ts');
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const evals = new Map<object, string[]>();
for (const m of ['get', 'raw'] as const) {
  const orig = dsl.Reader.prototype[m];
  dsl.Reader.prototype[m] = function (this: object, ...a: unknown[]) {
    const out = orig.apply(this, a);
    if (!evals.has(this)) evals.set(this, []);
    evals.get(this)!.push(`${a[0]}.${a[1]}`);
    return out;
  };
}
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const p = read('src/data/problems/hard/hard-008.json'); // 正常な 1 問 (セルの組は値に依らない)
const co = companies.find((x: { id: string }) => x.id === p.companyId);
const rc: Record<string, string[][]> = {};
for (const r of [...idx.HARD_RULES, ...idx.SOFT_RULES]) {
  evals.clear();
  r.check({ p, c: co });
  rc[r.id] = [...new Set([...evals.values()].map((u) => [...new Set(u.map(norm))].sort().join('|')))].map((s) => s.split('|'));
}

// 文欄になるセル (規則のセルでないもの = 疑似セルは、規則が値を比べる文・名前の並びを 1 つのセルとして置いた)
const TEXT = new Set([
  'tanshin.summary.auditNote', 'tanshin.notes.accountingPolicyNote', 'tanshin.summary.accountingPolicyChange',
  'tanshin.notes.subsequentEvents', 'ir.outlook.subsequentEvent', 'ir.statement.highlights', 'ir.statement.supplement',
  'tanshin.label.receivables', 'tanshin.segnames', 'ir.segnames',
]);
const kindOf = (c: string) => (c.startsWith('tanshin.') ? 'T' : 'I') + (TEXT.has(c) ? 'S' : 'N');
const CAP: Record<string, number> = { TN: 4, TS: 3, IN: 4, IS: 3 };

// 形ごとのセル (§1.4 の表と同じ)
const SHAPES: Record<string, string[]> = {
  H1: ['tanshin.incomeStatement.previous.netSales', 'tanshin.incomeStatement.current.netSales', 'tanshin.balanceSheet.current.totalAssets', 'tanshin.balanceSheet.current.totalLiabilitiesAndNetAssets',
       'ir.highlights.netSales.amount', 'ir.statement.highlights'],
  H2: ['tanshin.balanceSheet.previous.receivables', 'tanshin.balanceSheet.current.receivables', 'tanshin.cashFlow.receivablesChange', 'tanshin.cashFlow.operatingCashFlow',
       'tanshin.label.receivables', 'tanshin.summary.accountingPolicyChange', 'tanshin.notes.accountingPolicyNote', 'ir.statement.supplement'],
  H3: ['tanshin.cashFlow.incomeBeforeTax', 'tanshin.incomeStatement.current.incomeBeforeTax', 'tanshin.balanceSheet.current.cash', 'tanshin.cashFlow.cashEnding',
       'tanshin.summary.auditNote', 'tanshin.notes.subsequentEvents', 'tanshin.segnames',
       'ir.supplement.cash.current', 'ir.supplement.cash.previous', 'ir.supplement.interestBearingDebt.previous', 'ir.supplement.netDebt.previous', 'ir.outlook.subsequentEvent', 'ir.segnames'],
};

// 見え方の分類 → 規則の評価 (セルの組)。文のセルを含む分類は、疑似セルで置いた。
const CLASSES: Record<string, string[][]> = {
  'C01 監査済みの文言 (H-22)': rc['audit-note'],
  'C02 資産の科目名が負債側 (H-28)': [['tanshin.label.receivables']],
  'C03 会計方針の言い違い (H-23)': rc['accounting-policy-match'],
  'C04 後発事象の言い違い (H-24)': rc['subsequent-event-match'],
  'C05 セグメントの欠け (H-19)': [['tanshin.segnames', 'ir.segnames']],
  'C06 貸借の合計が合わない (H-01)': rc['bs-balance'],
  'C07 IR と短信で同じ数字が違う (H-13・H-16・H-18 の現金など)': [...rc['xdoc-hl-net-sales'], ...rc['xdoc-hl-operating-income'], ...rc['xdoc-outlook-actual-results'], ...rc['xdoc-hl-dividend'], ...rc['xdoc-supp-cash']],
  'C08 IR の単位換算 (H-17。同じセルで 100 倍)': [...rc['xdoc-hl-net-sales'], ...rc['xdoc-hl-operating-income']],
  'C09 CF の起点が税引前利益と違う (H-03)': rc['link-cf-start'],
  'C10 CF の期末残高が貸借の現金と違う (H-04)': rc['link-cf-cash-end'],
  'C11 CF の増減が貸借の差と違う (H-05・H-06・H-08)': [...rc['link-cf-receivables'], ...rc['link-cf-inventories'], ...rc['link-cf-short-debt']],
  'C12 IR の純有利子負債 (H-20)': rc['ir-supp-net-debt'],
  'C14 IR の説明と数字の向き (H-21 型)': [['tanshin.incomeStatement.current.netSales', 'tanshin.incomeStatement.previous.netSales', 'ir.statement.highlights']],
  'C18 営業 CF の黒字と文 (H-21 型)': [['tanshin.cashFlow.operatingCashFlow', 'ir.statement.supplement']],
};

const all = new Set<string>();
for (const [id, cells] of Object.entries(SHAPES)) {
  const n: Record<string, Set<string>> = { TN: new Set(), TS: new Set(), IN: new Set(), IS: new Set() };
  for (const c of cells) n[kindOf(c)]!.add(c);
  const over = Object.entries(CAP).filter(([k, m]) => n[k]!.size > m);
  const set = new Set(cells);
  const got = Object.entries(CLASSES).filter(([, sets]) => sets.some((s) => s.every((c) => set.has(c)))).map(([k]) => k);
  got.forEach((g) => all.add(g));
  console.log(`${id}: 短信 数字 ${n.TN!.size} 文 ${n.TS!.size} / IR 数字 ${n.IN!.size} 文 ${n.IS!.size}${over.length ? ' 【上限超え: ' + over.map(([k]) => k).join(',') + '】' : ''}`);
  got.forEach((g) => console.log('   ', g));
}
console.log(`3 形の合計 ${all.size} 分類 (候補 ${Object.keys(CLASSES).length})`);
