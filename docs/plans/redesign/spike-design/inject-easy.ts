// 設計 v2 §2.2: やさしいの E-02・E-09・E-18 を今の正常な問題に 1 問ずつ注入し、落ちる規則と V2 (種類の主な規則の候補がカードに収まるか) を測る。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/inject-easy.ts [正常な問題の ID。省略は easy-017]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const id = process.argv[2] ?? 'easy-017';
const base = read(`src/data/problems/easy/${id}.json`);
const co = companies.find((c: any) => c.id === base.companyId);
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const T = (s: string) => `tanshin.${s}`;
const SHOWN: Record<string, string[]> = {
  E1: [T('incomeStatement.current.netSales'), T('incomeStatement.previous.operatingIncome'), T('incomeStatement.current.operatingIncome'), T('summary.operatingMargin'), 'ir.statements.*'],
  E2: [T('incomeStatement.previous.netSales'), T('incomeStatement.current.netSales'), 'ir.results.chart.netSales.axisMin', 'ir.results.chart.netSales.previous', 'ir.results.chart.netSales.current', 'ir.results.netSales.previous', 'ir.results.netSales.current', 'ir.statements.*'],
  E3: [T('balanceSheet.current.totalCurrentAssets'), T('balanceSheet.current.totalFixedAssets'), T('balanceSheet.current.totalAssets')],
};
const FRAME = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode')];
const clone = () => JSON.parse(JSON.stringify(base));
const set = (p: any, path: string, f: (v: number) => number) => { const ks = path.split('.'); let o = p.tanshin; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)!] = f(o[ks.at(-1)!]); };
const swap = (p: any, a: string, b: string) => { const g = (path: string) => path.split('.').reduce((o: any, k) => o[k], p.tanshin); const s = (path: string, v: number) => { const ks = path.split('.'); const o = ks.slice(0, -1).reduce((o: any, k) => o[k], p.tanshin); o[ks.at(-1)!] = v; }; const va = g(a), vb = g(b); s(a, vb); s(b, va); };
const CASES: { name: string; shape: string; make: () => any }[] = [
  { name: 'E-09: 流動資産の小計を総資産の 10% ずらす (総資産は元のまま)', shape: 'E3', make: () => { const p = clone(); const b = p.tanshin.balanceSheet.current; b.totalCurrentAssets += Math.round(b.totalAssets * 0.1); return p; } },
  { name: 'E-09 (旧案): 総資産を 10% ずらす', shape: 'E3', make: () => { const p = clone(); set(p, 'balanceSheet.current.totalAssets', (v) => Math.round(v * 1.1)); return p; } },
  { name: 'E-02 (E1): 当期の営業利益を 10 倍 (再計算しない)', shape: 'E1', make: () => { const p = clone(); set(p, 'incomeStatement.current.operatingIncome', (v) => v * 10); return p; } },
  { name: 'E-02 (E1): 売上高 (当期) を 10 倍 (再計算しない)', shape: 'E1', make: () => { const p = clone(); set(p, 'incomeStatement.current.netSales', (v) => v * 10); return p; } },
  { name: 'E-02 (E2): 当期の売上高を 10 倍 (再計算しない)', shape: 'E2', make: () => { const p = clone(); set(p, 'incomeStatement.current.netSales', (v) => v * 10); return p; } },
  { name: 'E-02 (E2、採らない): 前期の売上高を 10 倍 (再計算しない)', shape: 'E2', make: () => { const p = clone(); set(p, 'incomeStatement.previous.netSales', (v) => v * 10); return p; } },
  { name: 'E-02 (E3、E3 から外す。E-09 と同じ見え方): 流動資産を 10 倍 (再計算しない)', shape: 'E3', make: () => { const p = clone(); set(p, 'balanceSheet.current.totalCurrentAssets', (v) => v * 10); return p; } },
  { name: 'E-18 (E1): 売上高と当期の営業利益の入れ替え', shape: 'E1', make: () => { const p = clone(); swap(p, 'incomeStatement.current.netSales', 'incomeStatement.current.operatingIncome'); return p; } },
  { name: 'E-18 (E2、採らない。E-17 と同じ見え方): 前期と当期の売上高の入れ替え', shape: 'E2', make: () => { const p = clone(); swap(p, 'incomeStatement.previous.netSales', 'incomeStatement.current.netSales'); return p; } },
];
console.log(`基: ${id} (${base.companyId})`);
for (const c of CASES) {
  const p = c.make();
  const r = verifyProblem(p, co);
  const vs = [...r.hard, ...r.soft];
  const shown = new Set([...SHOWN[c.shape]!, ...FRAME]);
  const rules = [...new Set(vs.map((v: any) => v.rule))];
  const fit = rules.filter((rule) => vs.filter((v: any) => v.rule === rule).some((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x)))));
  console.log(`\n${c.name} [形 ${c.shape}]\n  落ちた規則 (${rules.length}): ${rules.join(', ')}\n  カードに収まる規則 (V2 の候補): ${fit.join(', ') || 'なし'}`);
}
