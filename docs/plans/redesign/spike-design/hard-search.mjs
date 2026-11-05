// 設計 v2 §1.4: 3 形を選ぶ探索 (製品のコードではない)。
//   node docs/plans/redesign/spike-design/hard-search.mjs <規則のセルの JSON>   (JSON は rule-cells.ts が出す { 規則 ID: [[セル,…],…] })
// 乱数を使う貪欲法 (90 秒)。結果は実行ごとに少し違う (最大は 14 分類)。
// むずかしいのカード 3 形 (各 短信型+IR 型。数字 4 + 文 3) で、見え方の分類がいくつ載るかの探索 (使い捨て)。
import fs from 'node:fs';
const rc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const TEXT = new Set(['tanshin.summary.auditNote','tanshin.notes.accountingPolicyNote','tanshin.summary.accountingPolicyChange','tanshin.notes.subsequentEvents','ir.outlook.subsequentEvent','ir.statement','tanshin.label.asset','tanshin.segnames','ir.segnames']);
const cls = (c) => (c.startsWith('tanshin.') ? 'T' : 'I') + (TEXT.has(c) ? 'S' : 'N');
// 見え方の分類 -> 規則 (セルの組は規則の評価ごと)
const CLASSES = {
  'C01 監査済みの文言': [['tanshin.summary.auditNote']],
  'C02 資産の科目名が負債側': [['tanshin.label.asset']],
  'C03 会計方針の言い違い': [['tanshin.notes.accountingPolicyNote','tanshin.summary.accountingPolicyChange']],
  'C04 後発事象の言い違い': [['tanshin.notes.subsequentEvents','ir.outlook.subsequentEvent']],
  'C05 セグメントの欠け': [['tanshin.segnames','ir.segnames']],
  'C06 貸借の合計が合わない': rc['bs-balance'],
  'C07 IR と短信で同じ数字が違う(金額・前期・実績・セグメント)': [...rc['xdoc-hl-net-sales'],...rc['xdoc-hl-operating-income'],...rc['xdoc-outlook-actual-results'],...rc['xdoc-seg-profit'].map(s=>s),...rc['xdoc-hl-dividend'],...rc['xdoc-supp-cash']],
  'C08 IR の単位換算 (100 倍違い)': [...rc['xdoc-hl-net-sales'],...rc['xdoc-hl-operating-income']],
  'C09 CF の起点が税引前利益と違う': rc['link-cf-start'],
  'C10 CF の期末残高が貸借の現金と違う': rc['link-cf-cash-end'],
  'C11 CF の増減が貸借の差と違う(売上債権・棚卸・借入)': [...rc['link-cf-receivables'],...rc['link-cf-inventories'],...rc['link-cf-short-debt']],
  'C12 IR の純有利子負債': rc['ir-supp-net-debt'],
  'C13 利益剰余金の増減': rc['link-retained-earnings'],
  'C14 IR の説明と数字の向き': [['tanshin.incomeStatement.current.operatingIncome','tanshin.incomeStatement.previous.operatingIncome','ir.statement'],['tanshin.incomeStatement.current.netSales','tanshin.incomeStatement.previous.netSales','ir.statement']],
  'C15 設備の増減': rc['link-tangible-assets'],
  'C16 法人税の支払': rc['link-cf-income-taxes'],
  'C17 自己資本比率・ROE の計算': [...rc['ratio-roe'],...rc['ratio-equity-ratio']],
  'C18 営業 CF の黒字と文': [['tanshin.cashFlow.operatingCashFlow','ir.statement']],
};
const items = [];
for (const [k, sets] of Object.entries(CLASSES)) for (const s of sets) items.push({ k, cells: [...new Set(s)] });
const cap = { TN: 4, TS: 3, IN: 4, IS: 3 };
const fits = (cells) => { const n = { TN: new Set(), TS: new Set(), IN: new Set(), IS: new Set() }; for (const c of cells) n[cls(c)].add(c); return Object.entries(cap).every(([t, m]) => n[t].size <= m); };
const covered = (cells) => { const set = new Set(cells); const out = new Set(); for (const it of items) if (it.cells.every((c) => set.has(c))) out.add(it.k); return out; };
let best = null;
function rnd(n) { return Math.floor(Math.random() * n); }
function greedyShape(exclude) {
  let cells = new Set();
  const order = [...items].sort(() => Math.random() - 0.5);
  for (let pass = 0; pass < 3; pass++) for (const it of order) {
    const nc = new Set([...cells, ...it.cells]);
    if (!fits(nc)) continue;
    const gain = [...covered(nc)].filter((k) => !exclude.has(k)).length - [...covered(cells)].filter((k) => !exclude.has(k)).length;
    if (gain > 0) cells = nc;
  }
  return cells;
}
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const shapes = []; const got = new Set();
  for (let s = 0; s < 3; s++) { const c = greedyShape(got); shapes.push(c); for (const k of covered(c)) got.add(k); }
  if (!best || got.size > best.got.size) best = { shapes, got };
}
console.log('合計', best.got.size, '分類 /', Object.keys(CLASSES).length);
best.shapes.forEach((c, i) => console.log('形', i + 1, [...covered(c)].join(' / '), '\n   ', [...c].map(x=>x.replace('tanshin.','T:').replace('ir.','I:')).join(', ')));
