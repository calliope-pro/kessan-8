import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
let n = 0, bad = 0, nci = 0, claimsOk = 0, payNo = 0;
for (const d of ['easy', 'hard']) for (const f of readdirSync(resolve(root, `src/data/problems/${d}`)).sort()) {
  const p = read(`src/data/problems/${d}/${f}`);
  if (p.anomaly) continue;
  n++;
  const r = verifyProblem(p, companies.find((c: any) => c.id === p.companyId));
  if (r.hard.length) { bad++; console.log('違反', p.id, r.hard.map((v: any) => v.rule)); }
  if (p.tanshin.balanceSheet.current.nonControllingInterests !== 0) nci++;
  const ms = new Set(p.ir.statements.flatMap((s: any) => s.claims.map((c: any) => c.metric)));
  if (ms.has('netSales') && ms.has('operatingIncome')) claimsOk++;
  if (p.tanshin.summary.annualDividend === 0) payNo++;
}
console.log({ 正常の問題: n, 検証器の違反あり: bad, 非支配株主持分が0でない: nci, '売上高・営業利益の主張あり': claimsOk, 無配: payNo });
