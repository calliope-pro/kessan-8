// 設計 v2 §2.8: やさしいの E-02・E-09・E-18 の作り方 (向きを変えない倍率など) を、今の正常な問題 12 問すべてに注入し、
// 「その形のカードに収まる hard の違反が、すべて種類の primaryRules に入る」(カードの上の食い違いが 1 つだけ) ことを数える。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/inject-easy-all.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const T = (s: string) => `tanshin.${s}`;
const FRAME = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode')];
const SHOWN: Record<string, string[]> = {
  E1: [T('incomeStatement.current.netSales'), T('incomeStatement.previous.operatingIncome'), T('incomeStatement.current.operatingIncome'), T('summary.operatingMargin'), 'ir.statements.*'],
  E2: [T('incomeStatement.previous.netSales'), T('incomeStatement.current.netSales'), 'ir.results.chart.netSales.axisMin', 'ir.results.chart.netSales.previous', 'ir.results.chart.netSales.current', 'ir.results.netSales.previous', 'ir.results.netSales.current', 'ir.statements.*'],
  E3: [T('balanceSheet.current.totalCurrentAssets'), T('balanceSheet.current.totalFixedAssets'), T('balanceSheet.current.totalAssets')],
};
const SUM = ['sum-net-sales', 'sum-operating-income', 'sum-ordinary-income', 'sum-net-income-parent'];
const PRIMARY: Record<string, string[]> = {
  'E-02/E1': [...SUM, 'ratio-operating-margin'], 'E-02/E2': [...SUM, 'xdoc-results-net-sales'],
  'E-09/E3': ['bs-current-assets', 'bs-fixed-assets', 'bs-current-liabilities', 'bs-total-assets'], 'E-18/E1': ['ratio-operating-margin'],
};
const g = (p: any, path: string) => path.split('.').reduce((o: any, k) => o[k], p.tanshin);
const s = (p: any, path: string, v: number) => { const ks = path.split('.'); ks.slice(0, -1).reduce((o: any, k) => o[k], p.tanshin)[ks.at(-1)!] = v; };
const up = (p: any, a: string, b: string) => g(p, a) > g(p, b); // 当期 > 前期 (増)
type Recipe = (p: any) => any | null; // 適用できない基は null
const RECIPES: Record<string, { shape: string; make: Recipe }> = {
  'E-02/E1': { shape: 'E1', make: (p) => { const q = JSON.parse(JSON.stringify(p)); const k = 'incomeStatement.current.operatingIncome'; s(q, k, up(p, k, 'incomeStatement.previous.operatingIncome') ? g(p, k) * 10 : Math.round(g(p, k) / 10)); return q; } },
  'E-02/E2': { shape: 'E2', make: (p) => { const q = JSON.parse(JSON.stringify(p)); const k = 'incomeStatement.current.netSales'; s(q, k, up(p, k, 'incomeStatement.previous.netSales') ? g(p, k) * 10 : Math.round(g(p, k) / 10)); return q; } },
  'E-09/E3': { shape: 'E3', make: (p) => { const q = JSON.parse(JSON.stringify(p)); const b = q.tanshin.balanceSheet.current; b.totalCurrentAssets += Math.round(b.totalAssets * 0.1); return q; } },
  'E-18/E1': { shape: 'E1', make: (p) => { if (!up(p, 'incomeStatement.current.operatingIncome', 'incomeStatement.previous.operatingIncome')) return null; const q = JSON.parse(JSON.stringify(p)); const a = 'incomeStatement.current.netSales', b = 'incomeStatement.current.operatingIncome'; const va = g(q, a), vb = g(q, b); s(q, a, vb); s(q, b, va); return q; } },
};
const bases = readdirSync(resolve(root, 'src/data/problems/easy')).sort().map((f) => read(`src/data/problems/easy/${f}`)).filter((p) => !p.anomaly);
for (const [name, rc] of Object.entries(RECIPES)) {
  let applied = 0, skipped = 0, doubled = 0, noPrimary = 0;
  const bad: string[] = [];
  for (const b of bases) {
    const q = rc.make(b);
    if (q === null) { skipped++; continue; }
    applied++;
    const co = companies.find((c: any) => c.id === b.companyId);
    const vs = verifyProblem(q, co).hard;
    const shown = new Set([...SHOWN[rc.shape]!, ...FRAME]);
    const onCard = vs.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x))));
    const extra = [...new Set(onCard.map((v: any) => v.rule))].filter((r) => !PRIMARY[name]!.includes(r));
    if (extra.length) { doubled++; bad.push(`${b.id}: ${extra.join(',')}`); }
    if (!onCard.some((v: any) => PRIMARY[name]!.includes(v.rule))) noPrimary++;
  }
  console.log(`${name}: 基 ${bases.length} 問のうち適用 ${applied}・適用できない ${skipped} / カードに収まる違反が primaryRules の外にもある (二重の食い違い) ${doubled} / カードに収まる主な規則が無い ${noPrimary}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`);
}
