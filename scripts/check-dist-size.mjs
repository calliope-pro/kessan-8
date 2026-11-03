// ビルド後の dist の転送量の予算を確かめる (docs/design.md §8)。
// 使いかた: node scripts/check-dist-size.mjs <dir> [--budget <バイト数>]
// dist の全ファイルを gzip した長さの合計が、予算 (既定 1,000,000 B = 方針「初回 1 MB 未満」) 未満なら終了コード 0、以上なら 1、読めなければ 2。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DEFAULT_BUDGET = 1_000_000;

const args = process.argv.slice(2);
const budgetAt = args.indexOf('--budget');
const budget = budgetAt >= 0 ? Number(args[budgetAt + 1]) : DEFAULT_BUDGET;
const dir = args.find((a, i) => !a.startsWith('--') && (budgetAt < 0 || i !== budgetAt + 1));

if (!dir || !Number.isFinite(budget)) {
  console.error('使いかた: node scripts/check-dist-size.mjs <dir> [--budget <バイト数>]');
  process.exit(2);
}

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]));
}

let list;
try {
  list = files(dir);
} catch {
  console.error(`読めません: ${dir}`);
  process.exit(2);
}

const total = list.reduce((sum, f) => sum + gzipSync(readFileSync(f), { level: 9 }).length, 0);
console.log(`${dir}: ${list.length} ファイル、gzip 後の合計 ${total} B (予算 ${budget} B 未満)`);
if (total >= budget) {
  console.error(`予算を超過しています (${total} B ≥ ${budget} B。未満である必要があります)`);
  process.exit(1);
}
