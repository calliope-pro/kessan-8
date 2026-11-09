// @ts-nocheck — 問題データを作る道具 (むずかしい 132 問。docs/plans/problems-hard.md)。生成物は src/data/problems/hard/*.json で、JSON が唯一の出所。
// 使いかた: node --experimental-strip-types --no-warnings scripts/gen-hard/run.ts
// 設計表 (plan.ts) の 132 問を src/data/problems/hard/ に書く。置き場の古いファイルは消す (hard-001〜132 だけにする)。
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { buildAll } from './build.ts';

const dir = new URL('../../src/data/problems/hard/', import.meta.url);
mkdirSync(dir, { recursive: true });
const problems = buildAll();
const keep = new Set(problems.map((p) => `${p.id}.json`));
for (const f of readdirSync(dir)) if (f.endsWith('.json') && !keep.has(f)) unlinkSync(new URL(f, dir));
for (const p of problems) writeFileSync(new URL(`${p.id}.json`, dir), JSON.stringify(p, null, 2) + '\n');
console.log(`問題 ${problems.length} 件を書いた`);
