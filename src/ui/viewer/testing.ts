// テスト用の資料束 (docs/test-cases/viewer.md §0)。製品のコードからは読まない。
import normal from '../../domain/fixtures/normal.problem.json';
import type { DocKind, Problem } from '../../domain/types';

/** 基準問題 (#47。百万円・セグメント 2 つ)。 */
export function normalProblem(): Problem {
  return structuredClone(normal) as unknown as Problem;
}

/** 全部入り: 基準問題に第 3 セグメント・後発事象の文・IR の前期の設備投資と減価償却費を足す。 */
export function fullProblem(): Problem {
  const p = normalProblem();
  const third = { name: '第三事業', netSales: 100, profit: 10 };
  p.tanshin.notes.segments.previous.segments.push({ ...third });
  p.tanshin.notes.segments.current.segments.push({ ...third });
  p.ir.segments.items.push({
    name: '第三事業',
    netSales: { previous: 100, current: 100, changeRate: 0 },
    profit: { previous: 10, current: 10, changeRate: 0 },
    salesShare: 1,
  });
  p.ir.outlook.subsequentEvent = '期末後に重要な出来事があった。';
  p.ir.supplement.capex.previous = 800;
  p.ir.supplement.depreciation.previous = 650;
  return p;
}

/** 億円版: 全部入りの IR を億円にする (見た目の確かめ用。会計の整合は問わない)。 */
export function okuProblem(): Problem {
  const p = fullProblem();
  p.ir.header.unit = '億円';
  const scale = (v: number) => Math.round(v / 10) / 10; // 百万円 → 億円 (小数第一位)
  const walk = (node: unknown, key: string): unknown => {
    if (typeof node === 'number') return /(changeRate|Rate|Margin|Ratio|salesShare|payoutRatio|annualDividend)$/i.test(key) || key === 'axisMin' ? node : scale(node);
    if (Array.isArray(node)) return node.map((n) => walk(n, key));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]));
    return node;
  };
  const { header, statements, ...rest } = p.ir;
  p.ir = { header, statements, ...(walk(rest, '') as object) } as Problem['ir'];
  return p;
}

type Leaf = { doc: DocKind; path: string; value: unknown };

/** 資料の中のすべての葉 (数値・文字列・真偽値・null)。配列は添字で入れ子にする。 */
export function leaves(doc: DocKind, node: unknown, prefix: string[] = []): Leaf[] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(doc, v, [...prefix, k]));
  }
  return [{ doc, path: prefix.join('.'), value: node }];
}

/** `<doc>.<path>` で問題の値を引く。 */
export function valueAt(p: Problem, docPath: string): unknown {
  const [doc, ...rest] = docPath.split('.');
  return rest.reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), doc === 'ir' ? p.ir : p.tanshin);
}
