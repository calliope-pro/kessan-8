// 設計 v2 §2.2 E-04 (包括レビュー 4 回目 N2): 期末日 (columnDates の当期) を 1 年ずらす注入を、今の正常な問題 12 問に当てて測る。製品のコードではない。
// 枠の欄 (frame.period) の reads = header.periodLabel + その形が見せる表の columnDates.<表>.current。E1・E2 = incomeStatement、E3 = balanceSheet。
// 数える: (1) 注入した表が形の見せる表と同じとき、カードに収まる hard の違反が dates-column-headings だけか (二重の食い違い) (2) 違うとき、カードに収まる違反が無い (= その形では見えない)
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/inject-easy-period.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const T = (s: string) => `tanshin.${s}`;
const FRAME_BASE = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode')];
const TABLE_OF: Record<string, string> = { E1: 'incomeStatement', E2: 'incomeStatement', E3: 'balanceSheet' };
const SHOWN: Record<string, string[]> = {
  E1: [T('incomeStatement.current.netSales'), T('incomeStatement.previous.operatingIncome'), T('incomeStatement.current.operatingIncome'), T('summary.operatingMargin'), 'ir.statements.*'],
  E2: [T('incomeStatement.previous.netSales'), T('incomeStatement.current.netSales'), 'ir.results.chart.netSales.axisMin', 'ir.results.chart.netSales.previous', 'ir.results.chart.netSales.current', 'ir.results.netSales.previous', 'ir.results.netSales.current', 'ir.statements.*'],
  E3: [T('balanceSheet.current.totalCurrentAssets'), T('balanceSheet.current.totalFixedAssets'), T('balanceSheet.current.totalAssets')],
};
const bases = readdirSync(resolve(root, 'src/data/problems/easy')).sort().map((f) => read(`src/data/problems/easy/${f}`)).filter((p) => !p.anomaly);
for (const table of ['incomeStatement', 'balanceSheet', 'cashFlow']) {
  for (const shape of ['E1', 'E2', 'E3']) {
    let n = 0, onCardRules = new Map<string, number>(), noneOnCard = 0;
    for (const b of bases) {
      const q = JSON.parse(JSON.stringify(b));
      const d = q.tanshin.columnDates[table].current as string; // 例: 2027-03-31 (形式は今のデータのまま)
      q.tanshin.columnDates[table].current = d.replace(/^\d{4}/, (y: string) => String(Number(y) - 1));
      const co = companies.find((c: any) => c.id === b.companyId);
      const vs = verifyProblem(q, co).hard;
      const shown = new Set([...SHOWN[shape]!, ...FRAME_BASE, T(`columnDates.${TABLE_OF[shape]}.current`)]);
      const onCard = vs.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x))));
      n++;
      if (!onCard.length) noneOnCard++;
      for (const r of new Set<string>(onCard.map((v: any) => v.rule))) onCardRules.set(r, (onCardRules.get(r) ?? 0) + 1);
    }
    console.log(`columnDates.${table}.current を 1 年前に → ${shape} (見せる表 = ${TABLE_OF[shape]}): ${n} 問 / カードに収まる違反が無い ${noneOnCard} / カードに収まる規則 ${JSON.stringify([...onCardRules])}`);
  }
}
// 正常な問題の期 (header.periodLabel) と、3 表の当期の期末日 (年・月) が一致するか (新しい規則 card-period の正常の条件)
const bad = bases.filter((b) => ['incomeStatement', 'balanceSheet', 'cashFlow'].some((t) => {
  const m = /^(\d{4})年(\d{1,2})月期$/.exec(b.tanshin.header.periodLabel); const d = /^(\d{4})-(\d{2})-/.exec(b.tanshin.columnDates[t].current);
  return !m || !d || Number(m[1]) !== Number(d[1]) || Number(m[2]) !== Number(d[2]);
}));
console.log(`正常 ${bases.length} 問のうち、期の年月 ≠ 期末日の年月 の問題 ${bad.length}`);
// 2 つ目: card-period の違反の paths (periodLabel と、見せる表の columnDates.<表>.current) は、枠の欄の reads に収まる。既存の dates-column-headings は dates.periodEnd を読む (カードに無い) ので、V2 を満たさない
