// 設計 v2 §1.5 の V1 (anomaly.places がすべてカードに載る) を、今の異変の問題 (むずかしい) に文字どおり当てると、いくつの種類が見えるか。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/places-fit.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
// 形ごとに載るセル (shape-fit.ts の SHAPES と同じ。疑似セルは places の書き方に直した)
const SHAPES: Record<string, string[]> = {
  H1: ['tanshin.incomeStatement.previous.netSales', 'tanshin.incomeStatement.current.netSales', 'tanshin.balanceSheet.current.totalAssets', 'tanshin.balanceSheet.current.totalLiabilitiesAndNetAssets', 'ir.highlights.netSales.amount', 'ir.statements.*'],
  H2: ['tanshin.balanceSheet.previous.receivables', 'tanshin.balanceSheet.current.receivables', 'tanshin.cashFlow.receivablesChange', 'tanshin.cashFlow.operatingCashFlow', 'tanshin.summary.accountingPolicyChange', 'tanshin.notes.accountingPolicyNote', 'ir.statements.*', 'itemKey:receivables'],
  H3: ['tanshin.cashFlow.incomeBeforeTax', 'tanshin.incomeStatement.current.incomeBeforeTax', 'tanshin.balanceSheet.current.cash', 'tanshin.cashFlow.cashEnding', 'tanshin.summary.auditNote', 'tanshin.notes.subsequentEvents', 'tanshin.notes.segments.current.segments.*.name', 'ir.supplement.cash.current', 'ir.supplement.cash.previous', 'ir.supplement.interestBearingDebt.previous', 'ir.supplement.netDebt.previous', 'ir.outlook.subsequentEvent', 'ir.segments.items.*.name'],
};
const kinds = new Map<string, Set<string>>(); // 種類 → V1 を満たす形
let n = 0;
for (const f of readdirSync(resolve(root, 'src/data/problems/hard')).sort()) {
  const p = read(`src/data/problems/hard/${f}`);
  if (!p.anomaly) continue;
  n++;
  const cells = p.anomaly.places.map((pl: any) => ('path' in pl ? `${pl.doc}.${norm(pl.path)}` : `itemKey:${String(pl.itemKey).split('.').pop()}`));
  const ok = Object.entries(SHAPES).filter(([, shown]) => cells.every((c: string) => shown.includes(c) || (c.startsWith('tanshin.') && false))).map(([k]) => k);
  const set = kinds.get(p.anomaly.kind) ?? new Set<string>();
  ok.forEach((k) => set.add(k));
  kinds.set(p.anomaly.kind, set);
  console.log(p.id, p.anomaly.kind, '場所:', cells.join(' | '), '→ 見える形:', ok.join(',') || 'なし');
}
const visible = [...kinds].filter(([, s]) => s.size > 0).map(([k]) => k);
console.log(`\n異変の問題 ${n} 問・種類 ${kinds.size}。V1 を文字どおり当てて、いずれかの形で見える種類: ${visible.length} (${visible.join(', ')})`);
