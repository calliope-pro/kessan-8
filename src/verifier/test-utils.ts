// テストの共通の道具 (ケース表 docs/test-cases/validator.md の基準問題 A・B と、セルを書き換える関数)。
import { readFileSync } from 'node:fs';
import type { Company, Problem } from '../domain/types.ts';

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'));

export const normalA = (): Problem => read('normal.problem.json') as Problem;
export const companyA = (): Company => read('company.json') as Company;
export const normalB = (): Problem => read('normal-b.problem.json') as Problem;
export const companyB = (): Company => read('company-b.json') as Company;

export const clone = <T>(x: T): T => structuredClone(x);

/** `a.b.0.c` のような `.` 区切りの場所を、オブジェクトの入れ子でたどって書き換える (元は壊さず、複製を返す)。 */
export function mutate(problem: Problem, path: string, change: (old: unknown) => unknown): Problem {
  const copy = clone(problem) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let node: Record<string, unknown> = copy;
  for (const k of keys.slice(0, -1)) {
    const next = node[k];
    if (typeof next !== 'object' || next === null) throw new Error(`場所が無い: ${path}`);
    node = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1] as string;
  node[last] = change(node[last]);
  return copy as unknown as Problem;
}

export const add = (problem: Problem, path: string, delta: number): Problem =>
  mutate(problem, path, (old) => {
    if (typeof old !== 'number') throw new Error(`数値でない: ${path}`);
    return Number((old + delta).toFixed(4));
  });

export const set = (problem: Problem, path: string, value: unknown): Problem => mutate(problem, path, () => value);

/** `<doc>.<path>` の場所の値 (テスト側の独立のたどりかた)。 */
export function valueAt(problem: Problem, path: string): unknown {
  let node: unknown = problem;
  for (const k of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

/** 基準問題をたどって数値のセルの `<doc>.<path>` を数える (numericCells とは独立)。 */
export function numericLeaves(problem: Problem): string[] {
  const out: string[] = [];
  const walk = (node: unknown, trail: string[]) => {
    if (typeof node === 'number') out.push(trail.join('.'));
    else if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...trail, String(i)]));
    else if (typeof node === 'object' && node !== null) {
      for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
    }
  };
  walk(problem.tanshin, ['tanshin']);
  walk(problem.ir, ['ir']);
  return out;
}

// ---- データ全件のテスト (D・L) 用 ----
import type { AnomalyKind, Difficulty } from '../domain/types.ts';

export const kindOf = (id: string, family: AnomalyKind['family'], primary: string[], allowed = primary): AnomalyKind => ({
  id,
  family,
  name: id,
  primaryRules: primary,
  allowedRules: allowed,
});

export const V1_RULES = ['bs-balance', 'bs-total-assets', 'ratio-equity-ratio', 'sum-total-assets'];

export const DATA_KINDS: AnomalyKind[] = [
  kindOf('k-rate', 'calculation', ['sum-change-ordinary-income']),
  kindOf('k-balance', 'accounting', ['bs-balance'], V1_RULES),
  kindOf('k-text', 'text', ['claims-direction']),
];

/** 基準問題 A を ID・会社・難易度だけ変えた正常な問題。 */
export function normalVariant(id: string, difficulty: Difficulty, companyId: string): Problem {
  return { ...clone(normalA()), id, difficulty, companyId };
}

/** 異変の問題: easy は k-rate (V7 の変更)、hard は k-balance (V1 の変更)、text は k-text (V46 の変更)。 */
export function anomalyVariant(id: string, difficulty: Difficulty, companyId: string, which: 'rate' | 'balance' | 'text' = difficulty === 'easy' ? 'rate' : 'balance'): Problem {
  let p = normalVariant(id, difficulty, companyId);
  if (which === 'rate') {
    p = add(p, 'tanshin.summary.ordinaryIncome.changeRate', 2);
    return set(p, 'anomaly', { kind: 'k-rate', places: [{ doc: 'tanshin', path: 'summary.ordinaryIncome.changeRate' }], explanation: '経常利益の前期比が合わない。', expectedRules: ['sum-change-ordinary-income'] });
  }
  if (which === 'balance') {
    p = add(p, 'tanshin.balanceSheet.current.totalAssets', 100);
    return set(p, 'anomaly', { kind: 'k-balance', places: [{ doc: 'tanshin', path: 'balanceSheet.current.totalAssets' }], explanation: '資産合計が合わない。', expectedRules: V1_RULES });
  }
  p = set(p, 'ir.statements.0.claims.0.direction', 'down');
  return set(p, 'anomaly', { kind: 'k-text', places: [{ doc: 'ir', path: 'statements.0' }], explanation: '文章が数字と逆。', expectedRules: ['claims-direction'] });
}

export interface DatasetInput {
  companies: Company[];
  kinds: AnomalyKind[];
  problems: { file: string; value: unknown }[];
  samples?: { file: string; value: unknown }[];
}

const fileOf = (p: Problem) => `problems/${p.difficulty}/${p.id}.json`;

/** 難易度ごとに 25 件 (会社 8 社 × (正常 1 + 異変 1) + 異変 4・正常 5)。textCount 件は text 系統の異変にする。 */
export function completePool(textCount = 0): DatasetInput {
  const companies = Array.from({ length: 8 }, (_, i) => ({ ...companyA(), id: `c${i + 1}` }));
  const problems: Problem[] = [];
  for (const d of ['easy', 'hard'] as const) {
    let n = 0;
    const next = () => `${d}-${String(++n).padStart(3, '0')}`;
    companies.forEach((c) => {
      problems.push(normalVariant(next(), d, c.id));
      problems.push(anomalyVariant(next(), d, c.id));
    });
    for (let i = 0; i < 4; i++) problems.push(anomalyVariant(next(), d, companies[i % 8]!.id));
    for (let i = 0; i < 5; i++) problems.push(normalVariant(next(), d, companies[i % 8]!.id));
    if (textCount && d === 'easy') {
      // 異変 12 件のうち textCount 件を text 系統に置き換える
      let replaced = 0;
      for (let i = 0; i < problems.length && replaced < textCount; i++) {
        const q = problems[i]!;
        if (q.difficulty === 'easy' && q.anomaly) {
          problems[i] = anomalyVariant(q.id, 'easy', q.companyId, 'text');
          replaced++;
        }
      }
    }
  }
  return { companies, kinds: DATA_KINDS, problems: problems.map((p) => ({ file: fileOf(p), value: p })) };
}
export { fileOf };

/**
 * soft だけが破れる問題: 株数を 8,630 千株にし、EPS・BPS・配当性向を表示値の再計算に合わせる。
 * hard はすべて通るが、配当性向 (1 株配当 ÷ EPS = 30.1%) と配当金総額 ÷ 純利益 (258 ÷ 860 = 30.0%) の別経路がずれる。
 */
export function softOnly(id: string, difficulty: Difficulty = 'easy', companyId = 'fixture-c01'): Problem {
  let p = normalVariant(id, difficulty, companyId);
  for (const [path, value] of [
    ['tanshin.notes.averageSharesThousand', 8630],
    ['tanshin.summary.eps', 99.65],
    ['tanshin.notes.eps', 99.65],
    ['tanshin.summary.bps', 951.1],
    ['tanshin.notes.bps', 951.1],
    ['tanshin.summary.payoutRatio', 30.1],
    ['ir.highlights.payoutRatio', 30.1],
  ] as const) p = set(p, path, value);
  return p;
}

import { HARD_RULES } from './rules/index.ts';

/** 1 つの規則だけを評価する (ほかの式が破れる問題でも、その規則の振る舞いだけを見る)。 */
export function onlyRule(id: string, problem: Problem, company: Company) {
  const r = HARD_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`規則が無い: ${id}`);
  return r.check({ p: problem, c: company });
}

/** 基準問題 B を、短信の百万円から計算した比率は合うが IR の表示金額からは食い違う形にした正常な問題 (id easy-001)。 */
export function roundedSalesNormal(): Problem {
  let p: Problem = { ...clone(normalB()), id: 'easy-001', difficulty: 'easy', companyId: 'fixture-c01' };
  p = set(p, 'tanshin.incomeStatement.current.netSales', 12449);
  p = set(p, 'tanshin.incomeStatement.previous.netSales', 11751);
  p = set(p, 'ir.highlights.netSales.amount', 124.5);
  p = set(p, 'ir.results.netSales.current', 124.5);
  p = set(p, 'ir.results.netSales.previous', 117.5);
  return set(p, 'ir.highlights.netSales.changeRate', 5.9);
}

// ---- カードのテスト (docs/test-cases/cards.md §5〜§7・§12) 用 ----
import { verifyProblem } from './index.ts';

/** 基準問題 B (IR が億円) を ID・会社・難易度だけ変えた正常な問題 (v3 の基準)。 */
export function normalOf(id: string, difficulty: Difficulty, companyId: string): Problem {
  return { ...clone(normalB()), id, difficulty, companyId };
}

type Maker = { place: Problem['anomaly'] extends infer A ? (A extends { places: infer P } ? P : never) : never; primary: string[]; relationChecks?: string[]; change: (p: Problem) => Problem };
const T = (path: string) => ({ doc: 'tanshin' as const, path });
/** 台帳 v3 の種類のうち、データ全件のテストに使う 4 つ。見える・二重の食い違いが無い・許す検査だけが落ちる。 */
const MAKERS: Record<string, Maker & { family: AnomalyKind['family']; difficulty: Difficulty }> = {
  'E-12': { family: 'calculation', difficulty: 'easy', place: [T('summary.operatingMargin')], primary: ['ratio-operating-margin'], relationChecks: ['R-margin'], change: (p) => set(p, 'tanshin.summary.operatingMargin', 22) },
  'E-24': { family: 'calculation', difficulty: 'easy', place: [T('incomeStatement.current.netSales')], primary: ['ratio-operating-margin'], relationChecks: ['R-margin', 'R-lt'], change: (p) => set(p, 'tanshin.incomeStatement.current.netSales', 744) },
  'H-22': { family: 'notes', difficulty: 'hard', place: [T('summary.auditNote')], primary: ['audit-note'], change: (p) => set(p, 'tanshin.summary.auditNote', '決算短信は監査済みです') },
  'H-33': { family: 'card-form', difficulty: 'hard', place: [{ doc: 'card', card: 0, slot: 'audit' }], primary: ['card-slots'], change: (p) => ({ ...p, cardEdits: [{ card: 0, slot: 'audit', op: 'dup' }] }) },
};

/** 台帳 v3 の種類の定義 (ledger: 'v3')。allowedRules は実際に落ちた規則。 */
export function ledgerKind(id: string, extra: Partial<AnomalyKind> = {}): AnomalyKind {
  const m = MAKERS[id];
  if (!m) throw new Error(`作り方が無い: ${id}`);
  const sample = m.change(normalOf('x', m.difficulty, 'c1'));
  const actual = [...new Set(verifyProblem(sample, companyB()).hard.map((v) => v.rule))].sort();
  return { ...kindOf(id, m.family, m.primary, [...new Set([...m.primary, ...actual])]), ledger: 'v3', ...(m.relationChecks ? { relationChecks: m.relationChecks as AnomalyKind['relationChecks'] } : {}), ...extra };
}

/** 基の正常な問題 base から、種類 id の異変を 1 つ作る (base・changed つき。tier は任意)。 */
export function ledgerAnomaly(id: string, newId: string, base: Problem, tier?: 1 | 2 | 3, withBase = true): Problem {
  const m = MAKERS[id];
  if (!m) throw new Error(`作り方が無い: ${id}`);
  const q = { ...m.change({ ...clone(base), id: newId }), ...(tier ? { tier } : {}) };
  const actual = [...new Set(verifyProblem(q, companyB()).hard.map((v) => v.rule))].sort();
  const anomaly = { kind: id, places: m.place, explanation: '説明', expectedRules: actual, ...(withBase ? { base: base.id, changed: changedCells(base, q) } : {}) };
  return set(q, 'anomaly', anomaly);
}
import { changedCells } from './path.ts';

/** 問題を別の決算期 (年) にする: 年・期の表記・日付をそろえる (正常な問題のまま)。 */
export function inYear(p: Problem, year: number): Problem {
  let q: Problem = { ...clone(p), fiscalYear: year };
  const label = `${year}年3月期`;
  q = set(q, 'tanshin.header.periodLabel', label);
  q = set(q, 'ir.header.periodLabel', label);
  const end = `${year}-03-31`;
  const prev = `${year - 1}-03-31`;
  q = set(q, 'tanshin.dates.periodEnd', end);
  q = set(q, 'tanshin.dates.previousPeriodEnd', prev);
  q = set(q, 'tanshin.dates.disclosure', `${year}-05-10`);
  q = set(q, 'tanshin.dates.shareholdersMeeting', `${year}-06-25`);
  for (const screen of ['balanceSheet', 'incomeStatement', 'cashFlow']) {
    q = set(q, `tanshin.columnDates.${screen}.current`, end);
    q = set(q, `tanshin.columnDates.${screen}.previous`, prev);
  }
  return q;
}
