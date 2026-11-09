// やさしいの異変の問題 75 問を作る (Sub-task #168。ケース表 docs/test-cases/problems-easy-v3.md §0)。
// 使いかた: node --experimental-strip-types --no-warnings scripts/gen-easy/run.ts [--dir <データのディレクトリ。既定 src/data>]
// 先に python3 docs/plans/problems-easy/gen.py --spec docs/plans/problems-easy/spec-v3.json --out <同じディレクトリ> で正常な問題 10 問と見本を作る。
// <dir>/problems/easy/ の正常な問題 (spec の kind が null) と spec-v3.json から、異変の問題を同じディレクトリに書く。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Company, Problem } from '../../src/domain/types.ts';
import { inject } from './inject.ts';
import type { SpecEntry } from './inject.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const at = process.argv.indexOf('--dir');
const dir = at >= 0 ? (process.argv[at + 1] as string) : `${root}src/data`;
const spec = JSON.parse(readFileSync(`${root}docs/plans/problems-easy/spec-v3.json`, 'utf-8')) as { problems: (SpecEntry & { kind: string | null })[] };
const companies = JSON.parse(readFileSync(`${root}src/data/companies.json`, 'utf-8')) as Company[];

let n = 0;
for (const entry of spec.problems) {
  if (entry.kind === null) continue;
  const base = JSON.parse(readFileSync(`${dir}/problems/easy/${entry.base}.json`, 'utf-8')) as Problem;
  const company = companies.find((c) => c.id === entry.company) as Company;
  writeFileSync(`${dir}/problems/easy/${entry.id}.json`, `${JSON.stringify(inject(base, company, entry), null, 1)}\n`);
  n++;
}
console.log(`異変の問題 ${n} 問を ${dir} に書いた`);
