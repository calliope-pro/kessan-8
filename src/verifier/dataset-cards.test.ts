// ケース表 docs/test-cases/cards.md §5 (S1〜S15)・§9.2 (B1〜B6): データ全件のカードの検査 (R-S5 (a)〜(e)・§2.7・§2.8)。
import { describe, expect, it } from 'vitest';
import type { AnomalyKind, Company, Difficulty, Problem, ShapeId } from '../domain/types.ts';
import { verifyDataset, verifyProblem } from './index.ts';
import { inYear, kindOf, normalVariant, set, shapeAnomaly, anomalyVariant, type DatasetInput } from './test-utils.ts';
import { companyA } from './test-utils.ts';

const SHAPES: Record<Difficulty, ShapeId[]> = { easy: ['E1', 'E2', 'E3'], hard: ['H1', 'H2', 'H3'] };
const file = (p: Problem) => `problems/${p.difficulty}/${p.id}.json`;
const comps = (n: number): Company[] => Array.from({ length: n }, (_, i) => ({ ...companyA(), id: `c${i + 1}` }));

interface PoolOptions {
  difficulty?: Difficulty;
  companies?: number;
  /** 形ごとの種類の数 (同じ作りで種類の ID だけ変える) */
  kindsPerShape?: number;
  /** 異変の問題を作らない (会社 index, 形) */
  skip?: (company: number, shape: ShapeId) => boolean;
}

/** 難易度ごとに、会社 × (正常 1 + 形ごとの異変 1) の問題。異変の種類は形ごとに kindsPerShape 個を使い回す。 */
function cardPool(opts: PoolOptions = {}): DatasetInput {
  const d = opts.difficulty ?? 'easy';
  const companies = comps(opts.companies ?? 10);
  const kinds: AnomalyKind[] = [];
  const problems: Problem[] = [];
  let n = 0;
  const id = () => `${d}-${String(++n).padStart(3, '0')}`;
  companies.forEach((c, ci) => {
    problems.push(normalVariant(id(), d, c.id));
    SHAPES[d].forEach((shape, si) => {
      if (opts.skip?.(ci, shape)) return;
      const k = ((ci + si) % (opts.kindsPerShape ?? 4)) + 1;
      const { problem, kind } = shapeAnomaly(shape, id(), c.id);
      const named: AnomalyKind = { ...kind, id: `${kind.id}-${k}` };
      if (!kinds.some((x) => x.id === named.id)) kinds.push(named);
      problems.push(set(problem, 'anomaly.kind', named.id));
    });
  });
  return { companies, kinds, problems: problems.map((p) => ({ file: file(p), value: p })) };
}
const cardCodes = (r: { shortfalls: { code: string }[] }) => [...new Set(r.shortfalls.map((s) => s.code).filter((c) => c.startsWith('card-') || c === 'anomaly-min-deviation'))].sort();
const errCodes = (r: { errors: { code: string }[] }) => [...new Set(r.errors.map((e) => e.code))].sort();
const replace = (input: DatasetInput, id: string, value: unknown): DatasetInput => ({ ...input, problems: input.problems.map((p) => ((p.value as Problem).id === id ? { file: p.file, value } : p)) });

describe('S: 満たすデータ', () => {
  it('会社 10 社 × (正常 + 形ごとの異変)・形ごとに 4 種類 → errors も card-* の shortfalls も無い (やさしい・むずかしい)', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
      const r = verifyDataset(cardPool({ difficulty }));
      expect(r.errors, difficulty).toEqual([]);
      expect(r.shortfalls.map((s) => s.code), difficulty).toEqual([]);
    }
  });
});

describe('S1・S2 構造・関係 (errors)', () => {
  it('S1: 正常な問題の見出し語が引けない (statements が空) → card-structure', () => {
    const input = cardPool();
    const normal = input.problems.find((p) => (p.value as Problem).anomaly === null)!.value as Problem;
    const r = verifyDataset(replace(input, normal.id, set(normal, 'ir.statements', [])));
    expect(errCodes(r)).toContain('card-structure');
    expect(r.errors.find((e) => e.code === 'card-structure')?.problem).toBe(normal.id);
  });
  it('S2: 正常な問題がカードの関係を破る (営業利益率 20.0) → card-relation (hard-violation も出る)', () => {
    const input = cardPool();
    const normal = input.problems.find((p) => (p.value as Problem).anomaly === null)!.value as Problem;
    const r = verifyDataset(replace(input, normal.id, set(normal, 'tanshin.summary.operatingMargin', 20)));
    expect(errCodes(r)).toEqual(expect.arrayContaining(['card-relation', 'hard-violation']));
  });
});

describe('S3 card-text-length', () => {
  const longHard = (text: string) => {
    const input = cardPool({ difficulty: 'hard' });
    const normal = input.problems.find((p) => (p.value as Problem).anomaly === null)!.value as Problem;
    let p = set(normal, 'tanshin.notes.subsequentEvents', text);
    p = set(p, 'ir.outlook.subsequentEvent', '期末後の出来事 (300 百万円)。');
    return { r: verifyDataset(replace(input, normal.id, p)), id: normal.id };
  };
  it('41 字 → 問題ごとに 1 件。40 字 → 出ない', () => {
    const over = longHard('あ'.repeat(41));
    expect(over.r.shortfalls.filter((s) => s.code === 'card-text-length').map((s) => s.problem)).toEqual([over.id]);
    expect(over.r.errors).toEqual([]);
    expect(longHard('あ'.repeat(40)).r.shortfalls.filter((s) => s.code === 'card-text-length')).toEqual([]);
  });
});

describe('S4 card-invisible', () => {
  it('どの形でも見えない異変 (経常利益の前期比) → 問題ごとに 1 件', () => {
    const input = cardPool();
    const hidden = anomalyVariant('easy-900', 'easy', 'c1', 'rate');
    const r = verifyDataset({ ...input, kinds: [...input.kinds, kindOf('k-rate', 'calculation', ['sum-change-ordinary-income'])], problems: [...input.problems, { file: file(hidden), value: hidden }] });
    expect(r.shortfalls.filter((s) => s.code === 'card-invisible').map((s) => s.problem)).toEqual(['easy-900']);
    expect(r.errors).toEqual([]);
  });
});

describe('S5〜S8 形の出方 (R-S5 (a)〜(d))', () => {
  it('S5: ある形で見える異変を持つ会社が 7 社 → 出る、8 社 → 出ない', () => {
    const seven = verifyDataset(cardPool({ companies: 10, skip: (c, s) => s === 'E2' && c >= 7 }));
    expect(seven.shortfalls.filter((s) => s.code === 'card-shape-companies').map((s) => s.message).join()).toContain('E2');
    const eight = verifyDataset(cardPool({ companies: 10, skip: (c, s) => s === 'E2' && c >= 8 }));
    expect(eight.shortfalls.some((s) => s.code === 'card-shape-companies')).toBe(false);
  });
  it('S6: ある会社が、ある形の異変を持たない → card-shape-both-sided (会社と形を書く)', () => {
    const r = verifyDataset(cardPool({ skip: (c, s) => c === 0 && s === 'E3' }));
    const e = r.shortfalls.find((s) => s.code === 'card-shape-both-sided');
    expect(e?.message).toContain('c1');
    expect(e?.message).toContain('E3');
  });
  it('S6: ある会社が正常な問題を持たない', () => {
    const input = cardPool();
    const noNormal: DatasetInput = { ...input, problems: input.problems.filter((p) => !((p.value as Problem).anomaly === null && (p.value as Problem).companyId === 'c2')) };
    const r = verifyDataset(noNormal);
    expect(r.shortfalls.find((s) => s.code === 'card-shape-both-sided')?.message).toContain('c2');
  });
  it('S7: 1 形が見せる種類が 3 → 出る、4 → 出ない', () => {
    expect(verifyDataset(cardPool({ kindsPerShape: 3 })).shortfalls.filter((s) => s.code === 'card-shape-kinds').map((s) => s.message).join()).toContain('E1');
    expect(verifyDataset(cardPool({ kindsPerShape: 4 })).shortfalls.some((s) => s.code === 'card-shape-kinds')).toBe(false);
  });
  it('S8: ある (会社, 期) に正常な問題しか無い → card-company-period。(会社, 期) に両方そろえれば出ない', () => {
    const input = cardPool();
    const c1 = input.problems.find((p) => (p.value as Problem).anomaly === null && (p.value as Problem).companyId === 'c1')!.value as Problem;
    const lonely = { ...inYear(c1, 2026), id: 'easy-901' };
    const r = verifyDataset({ ...input, problems: [...input.problems, { file: file(lonely), value: lonely }] });
    const e = r.shortfalls.find((s) => s.code === 'card-company-period');
    expect(e?.message).toContain('c1');
    expect(e?.message).toContain('2026');
    expect(r.errors).toEqual([]);
    expect(verifyDataset(cardPool()).shortfalls.some((s) => s.code === 'card-company-period')).toBe(false);
  });
});

describe('S9・S10 anomaly-ratio の廃止・既存の維持', () => {
  it('S9: 異変の問題の比が 0.5 から離れても anomaly-ratio は出ない (cardPool は異変 30・正常 10)', () => {
    const r = verifyDataset(cardPool());
    expect(r.shortfalls.some((s) => s.code === 'anomaly-ratio')).toBe(false);
    expect(r.stats.easy).toEqual({ total: 40, anomaly: 30, normal: 10 });
  });
  it('S10: pool-size・both-sided-companies・family-balance は今のまま', () => {
    const small = verifyDataset(cardPool({ companies: 2 }));
    expect(small.shortfalls.map((s) => s.code)).toEqual(expect.arrayContaining(['pool-size', 'both-sided-companies']));
  });
});

describe('S11 anomaly-min-deviation', () => {
  it('E-12 の種類で営業利益率のずれが小さい (11.0) → 出る。20.0 → 出ない', () => {
    const at = (m: number) => {
      const input = cardPool();
      const { problem } = shapeAnomaly('E1', 'easy-902', 'c1');
      const p = set(set(problem, 'tanshin.summary.operatingMargin', m), 'anomaly.kind', 'E-12');
      const kind = kindOf('E-12', 'calculation', ['ratio-operating-margin'], ['ratio-operating-margin']);
      return verifyDataset({ ...input, kinds: [...input.kinds, kind], problems: [...input.problems, { file: file(p), value: p }] });
    };
    expect(at(11).shortfalls.filter((s) => s.code === 'anomaly-min-deviation').map((s) => s.problem)).toEqual(['easy-902']);
    expect(at(20).shortfalls.some((s) => s.code === 'anomaly-min-deviation')).toBe(false);
  });
});

describe('9.2 base・changed (S12〜S14・B1〜B6)', () => {
  const setup = () => {
    const input = cardPool();
    const base = input.problems.find((p) => (p.value as Problem).anomaly === null && (p.value as Problem).companyId === 'c1')!.value as Problem;
    const target = input.problems.find((p) => (p.value as Problem).anomaly !== null && (p.value as Problem).companyId === 'c1' && (p.value as Problem).anomaly!.kind.startsWith('k-E1'))!.value as Problem;
    return { input, base, target };
  };
  const withBase = (target: Problem, extra: Record<string, unknown>) => set(target, 'anomaly', { ...target.anomaly!, ...extra });

  it('B1: base・changed が実際の差と一致 → anomaly-changed-mismatch・anomaly-base は出ない', () => {
    const { input, base, target } = setup();
    const p = withBase(target, { base: base.id, changed: ['tanshin.summary.operatingMargin'] });
    const r = verifyDataset(replace(input, target.id, p));
    expect(errCodes(r)).not.toContain('anomaly-changed-mismatch');
    expect(errCodes(r)).not.toContain('anomaly-base');
    expect(r.shortfalls.some((s) => s.code === 'card-anomaly-base' && s.problem === target.id)).toBe(false);
  });
  it('B2: changed が少ない・多い → anomaly-changed-mismatch。順序だけ違う → 出ない', () => {
    const { input, base, target } = setup();
    const two = set(target, 'tanshin.summary.roe', 99);
    const run = (changed: string[], t: Problem = two) => verifyDataset(replace(input, target.id, withBase(t, { base: base.id, changed })));
    expect(errCodes(run(['tanshin.summary.operatingMargin']))).toContain('anomaly-changed-mismatch'); // roe が足りない
    expect(run(['tanshin.summary.operatingMargin']).errors.find((e) => e.code === 'anomaly-changed-mismatch')?.message).toContain('tanshin.summary.roe');
    expect(errCodes(run(['tanshin.summary.operatingMargin', 'tanshin.summary.roe', 'tanshin.summary.eps']))).toContain('anomaly-changed-mismatch'); // eps が余計
    expect(errCodes(run(['tanshin.summary.roe', 'tanshin.summary.operatingMargin']))).not.toContain('anomaly-changed-mismatch');
  });
  it('B3: base が存在しない・異変の問題・別の会社・別の期・自分自身 → anomaly-base', () => {
    const { input, base, target } = setup();
    const otherCompany = input.problems.find((p) => (p.value as Problem).anomaly === null && (p.value as Problem).companyId === 'c2')!.value as Problem;
    const otherYear = { ...inYear(base, 2026), id: 'easy-903' };
    const withExtra: DatasetInput = { ...input, problems: [...input.problems, { file: file(otherYear), value: otherYear }] };
    const code = (id: string) => errCodes(verifyDataset(replace(withExtra, target.id, withBase(target, { base: id, changed: ['tanshin.summary.operatingMargin'] }))));
    expect(code('easy-999')).toContain('anomaly-base');
    expect(code(target.id)).toContain('anomaly-base');
    expect(code(otherCompany.id)).toContain('anomaly-base');
    expect(code(otherYear.id)).toContain('anomaly-base');
    const anomalyId = (withExtra.problems.find((p) => (p.value as Problem).anomaly !== null && (p.value as Problem).id !== target.id)!.value as Problem).id;
    expect(code(anomalyId)).toContain('anomaly-base');
  });
  it('B4: labelOverrides だけの異変は changed: []。差があれば changed: [] は誤り', () => {
    const { input, base } = setup();
    const label = shapeAnomaly('E1', 'easy-904', 'c1').problem;
    const typo = { ...normalVariant('easy-904', 'easy', 'c1'), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    const p = set(typo, 'anomaly', { kind: label.anomaly!.kind, places: [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }], explanation: 'x', expectedRules: ['label-spelling'], base: base.id, changed: [] });
    const kinds = [...input.kinds, kindOf(label.anomaly!.kind, 'appearance', ['label-spelling'])];
    const run = (q: Problem) => verifyDataset({ ...input, kinds: kinds.filter((k, i, a) => a.findIndex((x) => x.id === k.id) === i), problems: [...input.problems.filter((x) => (x.value as Problem).id !== 'easy-904'), { file: file(q), value: q }] });
    expect(errCodes(run(p))).not.toContain('anomaly-changed-mismatch');
    expect(errCodes(run(set(p, 'tanshin.summary.roe', 99)))).toContain('anomaly-changed-mismatch');
  });
  it('B5: base・changed が無い異変の問題 → shortfalls card-anomaly-base (問題ごと)', () => {
    const { input } = setup();
    const r = verifyDataset(input);
    const missing = r.shortfalls.filter((s) => s.code === 'card-anomaly-base');
    expect(missing).toHaveLength(input.problems.filter((p) => (p.value as Problem).anomaly !== null).length);
    expect(missing.every((s) => s.problem !== undefined)).toBe(true);
  });
  it('B6: 配列の差は添字つきのパス。要素の数が違えば、足りない添字のパスが差', () => {
    const { input, base } = setup();
    const target = { ...normalVariant('easy-905', 'easy', 'c1') };
    const changedStatements = set(target, 'ir.statements.0.text', '別の文');
    const p = set(changedStatements, 'anomaly', { kind: 'k-E1-1', places: [{ doc: 'ir', path: 'statements.0.text' }], explanation: 'x', expectedRules: [], base: base.id, changed: ['ir.statements.0.text'] });
    const r = verifyDataset({ ...input, problems: [...input.problems, { file: file(p), value: p }] });
    expect(r.errors.filter((e) => e.problem === 'easy-905' && e.code === 'anomaly-changed-mismatch')).toEqual([]);
    const shorter = set(set(target, 'ir.statements', target.ir.statements.slice(0, 2)), 'anomaly', { kind: 'k-E1-1', places: [{ doc: 'ir', path: 'statements.2' }], explanation: 'x', expectedRules: [], base: base.id, changed: [] });
    const r2 = verifyDataset({ ...input, problems: [...input.problems, { file: file(shorter), value: shorter }] });
    expect(r2.errors.find((e) => e.problem === 'easy-905' && e.code === 'anomaly-changed-mismatch')?.message).toContain('ir.statements.2');
  });
});

describe('S15 card-double-discrepancy', () => {
  it('向きが逆になる桁ずれ (営業利益 1/10) → 問題ごとに 1 件 (形と規則を書く)', () => {
    const input = cardPool();
    const kind = kindOf('k-op', 'calculation', ['ratio-operating-margin'], []);
    const p0 = set(normalVariant('easy-906', 'easy', 'c1'), 'tanshin.incomeStatement.current.operatingIncome', 124);
    const actual = [...new Set(verifyProblem(p0, companyA()).hard.map((v) => v.rule))].sort();
    const p = set(p0, 'anomaly', { kind: 'k-op', places: [{ doc: 'tanshin', path: 'summary.operatingMargin' }], explanation: 'x', expectedRules: actual });
    const allowed = { ...kind, allowedRules: actual };
    const r = verifyDataset({ ...input, kinds: [...input.kinds, allowed], problems: [...input.problems, { file: file(p), value: p }] });
    const e = r.shortfalls.find((s) => s.code === 'card-double-discrepancy');
    expect(e?.problem).toBe('easy-906');
    expect(e?.message).toContain('E1');
    expect(e?.message).toContain('claims-direction');
    expect(r.shortfalls.filter((s) => s.code === 'card-double-discrepancy')).toHaveLength(1);
  });
});
