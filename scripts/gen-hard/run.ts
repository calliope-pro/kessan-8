// @ts-nocheck — 問題データを作る道具 (むずかしい 32 問。docs/plans/problems-hard.md)。生成物は src/data/problems/hard/*.json で、JSON が唯一の出所。
// 使いかた: node --experimental-strip-types --no-warnings scripts/gen-hard/run.ts [--normals-only]
// 設計表 (spec.ts) の 32 問のうち、正常な問題を src/data/problems/hard/ に書く (異変の問題は inject.ts を足したあと)。
import { mkdirSync, writeFileSync } from 'node:fs';
import { SPECS } from './spec.ts';
import { genAll } from './gen.ts';

const dir = new URL('../../src/data/problems/hard/', import.meta.url);
mkdirSync(dir, { recursive: true });
let n = 0;
for (const p of genAll(SPECS)) {
  const spec = SPECS.find((s) => s.n === Number(p.id.slice(5)));
  if (spec.kind !== null) continue;
  writeFileSync(new URL(`${p.id}.json`, dir), JSON.stringify(p, null, 2) + '\n');
  n++;
}
console.log(`正常な問題 ${n} 件を書いた`);
