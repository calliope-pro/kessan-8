// 設計 v2: 各規則が 1 回の評価で読むセル (添字は *) を JSON で出す。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/rule-cells.ts src/data/problems/hard/hard-008.json > rules.json
import { readFileSync, readdirSync } from 'node:fs';
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
  dsl.Reader.prototype[m] = function (this: any, ...a: any[]) {
    const out = orig.apply(this, a);
    (evals.get(this) ?? evals.set(this, []).get(this)!);
    evals.get(this)!.push(`${a[0]}.${a[1]}`);
    return out;
  };
}
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const pick = process.argv[2] ?? 'src/data/problems/hard/hard-008.json';
const p = read(pick);
const c = companies.find((x: any) => x.id === p.companyId);
const result: Record<string, string[][]> = {};
for (const r of [...idx.HARD_RULES, ...idx.SOFT_RULES]) {
  evals.clear();
  // check は違反だけ返すので、Reader の記録から全評価を取る
  try { r.check({ p, c }); } catch (e) { /* 無視 */ }
  const sets = [...evals.values()].map((u) => [...new Set(u.map(norm))].sort());
  const uniq = [...new Set(sets.map((s) => s.join('|')))].map((s) => s.split('|'));
  result[r.id] = uniq;
}
console.log(JSON.stringify(result));
