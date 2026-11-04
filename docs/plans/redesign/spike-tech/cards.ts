// 試作 (製品のコードではない)。Task #125 / Sub-task #126。
// 各「異変あり」の問題で、異変の検出に必要なセル (= 期待する規則が落ちたとき、食い違った式が読んだセル。Violation.paths)
// が、資料束の何画面にまたがるかを数える。1 画面 (= カード 1 枚に収まりうる) に収まるかの判定の材料。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-tech/cards.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const kinds = read('src/data/anomaly-kinds.json');
const kindOf = (id: string) => kinds.find((k: any) => k.id === id);
const comp = (id: string) => companies.find((c: any) => c.id === id);

// 'tanshin.summary.netSales.current' のような <doc>.<path> が出る画面を返す。header は全画面に出るので数えない。
function screensOf(p: any, full: string): string[] {
  const [doc, ...rest] = full.split('.');
  const head = rest[0];
  if (head === 'header') return [];
  if (head === 'dates') return ['tanshin.summary'];
  if (head === 'columnDates') return [`${doc}.${rest[1]}`];
  if (head === 'statements') return [`ir.${p.ir.statements?.[Number(rest[1])]?.slide ?? '?'}`];
  return [`${doc}.${head}`];
}

const rows: { id: string; kind: string; name: string; cells: number; screens: string[] }[] = [];
for (const d of ['easy', 'hard']) {
  for (const f of readdirSync(resolve(root, `src/data/problems/${d}`)).sort()) {
    const p = read(`src/data/problems/${d}/${f}`);
    if (!p.anomaly) continue;
    const res = verifyProblem(p, comp(p.companyId));
    const expected = new Set<string>(p.anomaly.expectedRules);
    const cells = [...new Set([...res.hard, ...res.soft].filter((v: any) => expected.has(v.rule)).flatMap((v: any) => v.paths))] as string[];
    const screens = [...new Set(cells.flatMap((c) => screensOf(p, c)))];
    rows.push({ id: p.id, kind: p.anomaly.kind, name: kindOf(p.anomaly.kind)?.name, cells: cells.length, screens });
  }
}
for (const r of rows) console.log([r.id, r.kind, r.name, `cells=${r.cells}`, `screens=${r.screens.length} ${r.screens.join('|')}`].join('  '));
for (const d of ['easy', 'hard']) {
  const a = rows.filter((r) => r.id.startsWith(d));
  const n = (f: (r: (typeof rows)[number]) => boolean) => a.filter(f).length;
  console.log(`${d}: 異変あり ${a.length} 問 / 0〜1 画面 ${n((r) => r.screens.length <= 1)} / 2 画面 ${n((r) => r.screens.length === 2)} / 3 画面以上 ${n((r) => r.screens.length >= 3)}`);
}
