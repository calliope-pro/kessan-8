// 問題データの全件検証 (npm run verify:data)。docs/test-cases/validator.md §2.9。
// 使いかた: node --experimental-strip-types scripts/verify-data.ts [--dir <データのディレクトリ>] [--require-complete] [--fail-on-soft]
// 既定のディレクトリは src/data。companies.json・anomaly-kinds.json・problems/ が無ければ 0 件として扱う。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verifyDataset } from '../src/verifier/index.ts';
import type { Entry } from '../src/verifier/index.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
// --require-complete (全難易度) / --require-complete=easy / --require-complete=hard (その難易度の不足だけ致命)
const requireArg = args.find((a) => a === '--require-complete' || a.startsWith('--require-complete='));
const requireScope = requireArg?.split('=')[1];
const dirAt = args.indexOf('--dir');
const explicitDir = dirAt >= 0;
const dir = explicitDir ? (args[dirAt + 1] ?? '') : 'src/data';

if (explicitDir && !existsSync(dir)) {
  console.error(`読めません: ${dir}`);
  process.exit(1);
}

const jsonErrors: Entry[] = [];

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    jsonErrors.push({ code: 'json', message: `${path}: JSON として読めません (${(error as Error).message})` });
    return undefined;
  }
}

function listJson(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return listJson(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

const array = (path: string): unknown[] => {
  if (!existsSync(path)) return [];
  const value = readJson(path);
  return Array.isArray(value) ? value : value === undefined ? [] : (jsonErrors.push({ code: 'json', message: `${path}: 配列ではありません` }), []);
};

const problems = listJson(join(dir, 'problems'))
  .map((file) => ({ file, value: readJson(file) }))
  .filter((p) => p.value !== undefined);

const result = verifyDataset({ companies: array(join(dir, 'companies.json')), kinds: array(join(dir, 'anomaly-kinds.json')), problems });
const errors = [...jsonErrors, ...result.errors];

const line = (e: Entry) => `  [${e.code}]${e.problem ? ` ${e.problem}` : ''} ${e.message}`;
const { easy, hard } = result.stats;
console.log(`${dir}: ${easy.total + hard.total} 問を検証 (easy ${easy.total}: 異変 ${easy.anomaly}・正常 ${easy.normal} / hard ${hard.total}: 異変 ${hard.anomaly}・正常 ${hard.normal})`);
if (!explicitDir && !existsSync(dir)) console.log('  データのディレクトリがまだ無い (0 件として扱う)');
if (errors.length > 0) console.error(`致命 ${errors.length} 件:\n${errors.map(line).join('\n')}`);
const fatalShortfalls = requireArg === undefined ? [] : result.shortfalls.filter((e) => requireScope === undefined || e.difficulty === requireScope);
if (result.shortfalls.length > 0) console.log(`数が足りない ${result.shortfalls.length} 件${fatalShortfalls.length > 0 ? ` (うち致命 ${fatalShortfalls.length})` : ' (警告)'}:\n${result.shortfalls.map(line).join('\n')}`);
if (result.soft.length > 0) console.log(`参考の規則 ${result.soft.length} 件${flag('--fail-on-soft') ? ' (致命)' : ' (警告)'}:\n${result.soft.map(line).join('\n')}`);

const failed = errors.length > 0 || fatalShortfalls.length > 0 || (flag('--fail-on-soft') && result.soft.length > 0);
process.exit(failed ? 1 : 0);
