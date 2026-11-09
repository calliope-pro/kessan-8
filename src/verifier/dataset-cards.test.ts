// ケース表 docs/test-cases/cards.md §6.4 (KD)・§7 (DS1〜DS20)・§12.2 (B1〜B6): データ全件のカードの検査 (Sub-task #180)。
import { describe, expect, it } from 'vitest';
import { kinds as dataKinds } from '../data/pool-source.ts';
import type { AnomalyKind, Company, Difficulty, Problem } from '../domain/types.ts';
import { HARD_RULE_IDS, SOFT_RULE_IDS } from './rules/index.ts';
import { verifyDataset, verifyProblem } from './index.ts';
import { changedCells } from './path.ts';
import { add, companyA, companyB, kindOf, ledgerAnomaly, ledgerKind, normalOf, normalVariant, set, type DatasetInput } from './test-utils.ts';

const file = (p: Problem) => `problems/${p.difficulty}/${p.id}.json`;
const comps = (n: number, base: Company = companyB()): Company[] => Array.from({ length: n }, (_, i) => ({ ...base, id: `c${i + 1}` }));
const KINDS: Record<Difficulty, string[]> = { easy: ['E-12', 'E-24'], hard: ['H-22', 'H-33'] };
const codesOf = (r: { shortfalls: { code: string }[] }) => [...new Set(r.shortfalls.map((s) => s.code))].sort();
const errCodes = (r: { errors: { code: string }[] }) => [...new Set(r.errors.map((e) => e.code))].sort();
const replace = (input: DatasetInput, id: string, value: unknown): DatasetInput => ({ ...input, problems: input.problems.map((p) => ((p.value as Problem).id === id ? { file: p.file, value } : p)) });
const without = (input: DatasetInput, keep: (p: Problem) => boolean): DatasetInput => ({ ...input, problems: input.problems.filter((p) => keep(p.value as Problem)) });
const plus = (input: DatasetInput, ...ps: Problem[]): DatasetInput => ({ ...input, problems: [...input.problems, ...ps.map((p) => ({ file: file(p), value: p }))] });
const pb = (input: DatasetInput) => input.problems.map((p) => p.value as Problem);

interface PoolOptions {
  difficulty?: Difficulty;
  companies?: number;
  withBase?: boolean;
  tier?: 1 | 2 | 3;
}
/** 会社 N 社 × (正常 1 + 種類ごとに異変 1)。会社・IR は億円 (B)。 */
function pool(opts: PoolOptions = {}): DatasetInput {
  const d = opts.difficulty ?? 'easy';
  const companies = comps(opts.companies ?? 3);
  const problems: Problem[] = [];
  let n = 0;
  const id = () => `${d}-${String(++n).padStart(3, '0')}`;
  for (const c of companies) {
    const normal = normalOf(id(), d, c.id);
    problems.push(normal);
    for (const kind of KINDS[d]) problems.push(ledgerAnomaly(kind, id(), normal, opts.tier, opts.withBase !== false));
  }
  return { companies, kinds: KINDS[d].map((k) => ledgerKind(k)), problems: problems.map((p) => ({ file: file(p), value: p })) };
}
const normalIn = (input: DatasetInput, companyId = 'c1') => pb(input).find((p) => p.anomaly === null && p.companyId === companyId)!;
const anomalyIn = (input: DatasetInput, kind: string, companyId = 'c1') => pb(input).find((p) => p.anomaly?.kind === kind && p.companyId === companyId)!;

describe('満たす小さなデータ (やさしい・むずかしい)', () => {
  it.each<Difficulty>(['easy', 'hard'])('%s: errors 無し。カードの作りに関する shortfalls (見える・二重・許す検査・40 字・IR の単位) も無い', (d) => {
    const r = verifyDataset(pool({ difficulty: d }));
    expect(r.errors).toEqual([]);
    const forbidden = ['card-invisible', 'card-double-discrepancy', 'card-relation-extra', 'card-text-length', 'card-ir-unit', 'card-place-text', 'card-anomaly-base', 'anomaly-min-deviation', 'card-normal-tier'];
    expect(codesOf(r).filter((c) => forbidden.includes(c)), d).toEqual([]);
  });
});

describe('DS1・DS2・DS9・DS20 errors', () => {
  it('DS1: 正常な問題の見出し語が引けない (statements が空) → card-structure。異変の dup は +1 で通る', () => {
    const input = pool();
    const normal = normalIn(input);
    const r = verifyDataset(replace(input, normal.id, set(normal, 'ir.statements', [])));
    expect(errCodes(r)).toContain('card-structure');
    expect(r.errors.find((e) => e.code === 'card-structure')?.problem).toBe(normal.id);
    const dup = verifyDataset(pool({ difficulty: 'hard' }));
    expect(dup.errors.filter((e) => e.code === 'card-structure')).toEqual([]); // H-33 は文欄 9 (8 + 1)
  });
  it('DS2: 正常な問題がカードの関係を破る (営業利益率 20.0) → card-relation (落ちた検査の名前入り。hard-violation も出る)', () => {
    const input = pool();
    const normal = normalIn(input);
    const r = verifyDataset(replace(input, normal.id, set(normal, 'tanshin.summary.operatingMargin', 20)));
    expect(errCodes(r)).toEqual(expect.arrayContaining(['card-relation', 'hard-violation']));
    expect(r.errors.find((e) => e.code === 'card-relation')?.message).toContain('R-margin');
  });
  it('DS9: claims-count は営業利益・営業 CF がちょうど 1 つ。売上高は数えない。問題 × metric ごとに 1 件 (異変の問題・見本にも)', () => {
    const input = pool({ difficulty: 'hard' });
    expect(errCodes(verifyDataset(input))).not.toContain('claims-count');
    const normal = normalIn(input);
    const noSales = set(normal, 'ir.statements.0.claims', [{ metric: 'operatingIncome', direction: 'up' }]); // netSales の主張が無い → 数えない
    expect(verifyDataset(replace(input, normal.id, noSales)).errors.filter((e) => e.code === 'claims-count')).toEqual([]);
    const noOp = set(normal, 'ir.statements.0.claims', [{ metric: 'netSales', direction: 'up' }]);
    expect(verifyDataset(replace(input, normal.id, noOp)).errors.filter((e) => e.code === 'claims-count').map((e) => e.message).join()).toContain('operatingIncome の主張が 0 個');
    const twice = set(normal, 'ir.statements', [...normal.ir.statements, { slide: 'highlights', text: 'x', claims: [{ metric: 'operatingCashFlow', direction: 'up' }] }]);
    expect(verifyDataset(replace(input, normal.id, twice)).errors.some((e) => e.code === 'claims-count' && e.message.includes('operatingCashFlow の主張が 2 個'))).toBe(true);
    const bare = set(normal, 'ir.statements', [{ slide: 'highlights', text: 'x', claims: [{ metric: 'netSales', direction: 'up' }] }]);
    expect(verifyDataset(replace(input, normal.id, bare)).errors.filter((e) => e.code === 'claims-count' && e.problem === normal.id)).toHaveLength(2);
    const anomaly = anomalyIn(input, 'H-22');
    expect(verifyDataset(replace(input, anomaly.id, set(anomaly, 'ir.statements', anomaly.ir.statements.slice(0, 2)))).errors.some((e) => e.code === 'claims-count' && e.problem === anomaly.id)).toBe(true);
  });
  it('DS20: deriveCards が RangeError を投げる cardEdits (glyph の at がカンマ) → errors の card-edit-op (握りつぶさない)', () => {
    const input = pool({ difficulty: 'hard' });
    const target = anomalyIn(input, 'H-33');
    const bad = { ...target, cardEdits: [{ card: 0, slot: 'ta', op: 'glyph', at: 2 }] } as Problem; // 15,200 の添字 2 は 2 ('1','5',',' → at 2 はカンマ)
    const r = verifyDataset(replace(input, target.id, bad));
    expect(r.errors.some((e) => e.code === 'card-edit-op' && e.problem === target.id)).toBe(true);
    const shortComma = { ...target, cardEdits: [{ card: 0, slot: 'cfAr', op: 'format', style: 'comma-shift' }] } as Problem;
    expect(verifyDataset(replace(input, target.id, shortComma)).errors.some((e) => e.code === 'card-edit-op' && e.problem === target.id)).toBe(true);
    expect(verifyDataset(input).errors.filter((e) => e.code === 'card-edit-op')).toEqual([]);
  });
});

describe('DS3 card-relation-extra・DS4 card-text-length・DS5 card-invisible', () => {
  it('DS3: 異変の問題が許す検査の外を落とす → 問題ごとに 1 件。許す検査だけなら出ない', () => {
    const input = pool();
    expect(codesOf(verifyDataset(input))).not.toContain('card-relation-extra');
    const target = anomalyIn(input, 'E-12');
    const noChecks = { ...input, kinds: input.kinds.map((k) => (k.id === 'E-12' ? { ...k, relationChecks: undefined } : k)) as AnomalyKind[] };
    const r = verifyDataset(noChecks);
    const e = r.shortfalls.filter((s) => s.code === 'card-relation-extra');
    expect(e.map((s) => s.problem)).toEqual(pb(noChecks).filter((p) => p.anomaly?.kind === 'E-12').map((p) => p.id));
    expect(e[0]?.message).toContain('R-margin');
    expect(r.errors).toEqual([]);
    // 許す外の検査 (E-12 の問題が R-lt も落とす)
    const lt = set(target, 'tanshin.incomeStatement.current.netSales', 744);
    const r2 = verifyDataset(replace(input, target.id, lt));
    expect(r2.shortfalls.filter((s) => s.code === 'card-relation-extra' && s.problem === target.id)).toHaveLength(1);
  });
  it('DS4: 41 字 → 問題ごとに 1 件 (異変の問題にも)。40 字 → 出ない。見本は両方の難易度の形で数え、超えた難易度を付ける', () => {
    const input = pool({ difficulty: 'hard' });
    const at = (text: string, target: Problem) => {
      const p = set(set(target, 'tanshin.notes.subsequentEvents', text), 'ir.outlook.subsequentEvent', '期末後の出来事 (300 百万円)。');
      return verifyDataset(replace(input, target.id, p));
    };
    const normal = normalIn(input);
    expect(at('あ'.repeat(41), normal).shortfalls.filter((s) => s.code === 'card-text-length').map((s) => s.problem)).toEqual([normal.id]);
    expect(at('あ'.repeat(40), normal).shortfalls.filter((s) => s.code === 'card-text-length')).toEqual([]);
    const anomaly = anomalyIn(input, 'H-22');
    expect(at('あ'.repeat(41), anomaly).shortfalls.filter((s) => s.code === 'card-text-length' && s.problem === anomaly.id)).toHaveLength(1);
    const sample = set(set(normalOf('sample', 'easy', 'c-sample'), 'tanshin.notes.subsequentEvents', 'あ'.repeat(41)), 'ir.outlook.subsequentEvent', '期末後の出来事 (300 百万円)。');
    const withSample = { ...pool(), companies: [...pool().companies, { ...companyB(), id: 'c-sample' }], samples: [{ file: 'samples/sample.json', value: { problem: sample, notes: {} } }] };
    const found = verifyDataset(withSample).shortfalls.filter((s) => s.code === 'card-text-length' && s.problem === 'sample');
    expect(found.map((s) => s.difficulty)).toEqual(['hard']);
  });
  it('DS5: カードに載らない場所の異変 (やさしいの総資産) → 問題ごとに 1 件 (V1)', () => {
    const input = pool();
    const target = anomalyIn(input, 'E-12');
    const hidden = set(set(target, 'tanshin.balanceSheet.current.totalAssets', 15300), 'anomaly', { ...target.anomaly!, kind: 'E-12', places: [{ doc: 'tanshin', path: 'balanceSheet.current.totalAssets' }], expectedRules: [...new Set(verifyProblem(set(target, 'tanshin.balanceSheet.current.totalAssets', 15300), companyB()).hard.map((v) => v.rule))].sort(), changed: changedCells(normalIn(input), set(target, 'tanshin.balanceSheet.current.totalAssets', 15300)) });
    const r = verifyDataset(replace(input, target.id, hidden));
    const e = r.shortfalls.find((s) => s.code === 'card-invisible' && s.problem === target.id);
    expect(e?.message).toContain('V1');
  });
});

describe('DS6〜DS8 会社・期・向き', () => {
  it('DS6: ある会社が異変の問題を持たない・正常な問題を持たない → card-company-both-sided (会社を書く)', () => {
    const input = pool();
    expect(codesOf(verifyDataset(input))).not.toContain('card-company-both-sided');
    const noAnomaly = verifyDataset(without(input, (p) => !(p.anomaly !== null && p.companyId === 'c1')));
    expect(noAnomaly.shortfalls.find((s) => s.code === 'card-company-both-sided')?.message).toContain('c1');
    const noNormal = verifyDataset(without(input, (p) => !(p.anomaly === null && p.companyId === 'c2')));
    expect(noNormal.shortfalls.find((s) => s.code === 'card-company-both-sided')?.message).toContain('c2');
  });
  it('DS7: ある (会社, 期) に正常な問題しか無い → card-company-period', () => {
    const input = pool();
    const lonely = { ...normalOf('easy-901', 'easy', 'c1'), fiscalYear: 2026 };
    const r = verifyDataset(plus(input, lonely));
    const e = r.shortfalls.find((s) => s.code === 'card-company-period');
    expect(e?.message).toContain('c1');
    expect(e?.message).toContain('2026');
    expect(verifyDataset(input).shortfalls.some((s) => s.code === 'card-company-period')).toBe(false);
  });
  it('DS8: 正常な問題の向き: やさしい = 減益 3 社、むずかしい = 減益 3 社・営業 CF マイナス 1 社。減収は要らない', () => {
    const msg = (r: ReturnType<typeof verifyDataset>, d: Difficulty) => r.shortfalls.find((s) => s.code === 'card-claim-directions' && s.difficulty === d)?.message ?? '';
    const down = (input: DatasetInput, n: number, path: string): DatasetInput => replace(input, normalIn(input, `c${n}`).id, set(normalIn(input, `c${n}`), path, 'down'));
    const easy = pool({ companies: 3 });
    expect(msg(verifyDataset(easy), 'easy')).toContain('operatingIncome');
    expect(msg(verifyDataset(easy), 'easy')).not.toContain('netSales');
    let ok = easy;
    for (const n of [1, 2, 3]) ok = down(ok, n, 'ir.statements.0.claims.1.direction');
    expect(msg(verifyDataset(ok), 'easy')).toBe('');
    let two = easy;
    for (const n of [1, 2]) two = down(two, n, 'ir.statements.0.claims.1.direction');
    expect(msg(verifyDataset(two), 'easy')).toContain('operatingIncome');
    const hard = pool({ difficulty: 'hard', companies: 3 });
    expect(msg(verifyDataset(hard), 'hard')).toContain('operatingCashFlow');
    expect(msg(verifyDataset(hard), 'hard')).toContain('operatingIncome');
    let hardOk = hard;
    for (const n of [1, 2, 3]) hardOk = down(hardOk, n, 'ir.statements.0.claims.1.direction');
    hardOk = down(hardOk, 1, 'ir.statements.2.claims.0.direction');
    expect(msg(verifyDataset(hardOk), 'hard')).toBe('');
  });
});

describe('DS10・DS11 IR の単位 (R-D7)', () => {
  it('B (IR が億円・会社も億円) → 出ない。IR が百万円の問題・会社 → card-ir-unit (問題ごと・会社ごと)', () => {
    expect(codesOf(verifyDataset(pool()))).not.toContain('card-ir-unit');
    const a = comps(2, companyA());
    const problems = a.flatMap((c, i) => [normalVariant(`easy-${i + 1}`, 'easy', c.id)]);
    const r = verifyDataset({ companies: a, kinds: [], problems: problems.map((p) => ({ file: file(p), value: p })) });
    const found = r.shortfalls.filter((s) => s.code === 'card-ir-unit');
    expect(found.some((s) => s.problem === 'easy-1')).toBe(true);
    expect(found.some((s) => s.message.includes('c1') && s.problem === undefined)).toBe(true);
    expect(r.errors.filter((e) => e.code === 'hard-violation' && e.message.startsWith('card-unit'))).toEqual([]); // 規則 card-unit は落とさない (DS11)
  });
});

describe('DS12〜DS15 構成 (tier-balance・normal-tier・kind-count・pool-size)', () => {
  /** counts[会社][段-1] = その会社が持つ段 t の異変の問題の数。 */
  const tiered = (counts: number[][]): DatasetInput => {
    const companies = comps(counts.length);
    const problems: Problem[] = [];
    let n = 0;
    const id = () => `easy-${String(++n).padStart(3, '0')}`;
    counts.forEach((row, ci) => {
      const normal = normalOf(id(), 'easy', companies[ci]!.id);
      problems.push(normal);
      row.forEach((count, ti) => {
        for (let k = 0; k < count; k++) problems.push(ledgerAnomaly(KINDS.easy[k % 2]!, id(), normal, (ti + 1) as 1 | 2 | 3));
      });
    });
    return { companies, kinds: KINDS.easy.map((k) => ledgerKind(k)), problems: problems.map((p) => ({ file: file(p), value: p })) };
  };
  const balance = (rows: number[][]) => verifyDataset(tiered(rows)).shortfalls.filter((s) => s.code === 'card-tier-balance');
  it('DS12: 段ごとに会社どうしの差 ≤ 1。1 社の中の段どうしの差は見ない・0 問の会社も数える', () => {
    expect(balance([[5, 0, 0], [4, 0, 0]])).toEqual([]); // 差 1
    expect(balance([[5, 0, 0], [3, 0, 0]]).length).toBe(1); // 差 2
    expect(balance([[5, 0, 1], [5, 0, 1], [5, 0, 1]])).toEqual([]); // どの会社も段 1 が 5 問・段 3 が 1 問
    expect(balance([[1, 0, 2], [1, 0, 0], [1, 0, 1]]).length).toBe(1); // 段 3 を 2・0・1: 0 問の会社を数えると差 2
    expect(balance([[1, 0, 1], [1, 0, 1], [1, 0, 0]])).toEqual([]); // 差 1
  });
  it('DS13: 正常な問題が tier を持つ → card-normal-tier (問題ごと)', () => {
    const input = pool();
    expect(codesOf(verifyDataset(input))).not.toContain('card-normal-tier');
    const normal = normalIn(input);
    const r = verifyDataset(replace(input, normal.id, { ...normal, tier: 1 }));
    expect(r.shortfalls.filter((s) => s.code === 'card-normal-tier').map((s) => s.problem)).toEqual([normal.id]);
  });
  it('DS14: 印 (ledger: v3) のある種類だけ数える。やさしい = 5 問・5 社、むずかしいの会計・資料間 = 7 問。0 問も出る', () => {
    const msg = (r: ReturnType<typeof verifyDataset>, code: string) => r.shortfalls.filter((s) => s.code === code).map((s) => s.message).join('\n');
    const five = pool({ companies: 5 }); // E-12・E-24 が 5 問・5 社ずつ
    expect(msg(verifyDataset(five), 'card-kind-count')).not.toContain('E-12');
    expect(msg(verifyDataset(five), 'card-kind-companies')).not.toContain('E-12');
    // 印のある種類が 0 問 → 出る
    const noProblems = { ...five, kinds: [...five.kinds, kindOf('E-77', 'appearance', ['card-slots'], ['card-slots'])].map((k) => (k.id === 'E-77' ? { ...k, ledger: 'v3' as const } : k)) };
    expect(msg(verifyDataset(noProblems), 'card-kind-count')).toContain('E-77');
    expect(msg(verifyDataset(noProblems), 'card-kind-companies')).toContain('E-77');
    // 印の無い種類は数えない (3 問あっても出ない)
    const unmarked = { ...five, kinds: [...five.kinds, kindOf('E-06', 'appearance', ['chart-bars'], ['chart-bars'])] };
    expect(msg(verifyDataset(unmarked), 'card-kind-count')).not.toContain('E-06');
    // 4 問 → 出る
    const four = without(five, (p) => !(p.anomaly?.kind === 'E-12' && p.companyId === 'c5'));
    expect(msg(verifyDataset(four), 'card-kind-count')).toContain('E-12');
    expect(msg(verifyDataset(four), 'card-kind-companies')).toContain('E-12');
    // むずかしいの accounting は 7 問 (5 問 → 出る)
    const acc = (n: number) => {
      const input = pool({ difficulty: 'hard', companies: n });
      return { ...input, kinds: input.kinds.map((k) => (k.id === 'H-22' ? { ...k, family: 'accounting' as const } : k)) };
    };
    expect(msg(verifyDataset(acc(5)), 'card-kind-count')).toContain('H-22');
    expect(msg(verifyDataset(acc(7)), 'card-kind-count')).not.toContain('H-22');
  });
  it('DS15: 問題数が やさしい 85・むずかしい 132 でない → card-pool-size。pool-size (25 問。要件) は今のまま', () => {
    const small = verifyDataset(pool());
    expect(small.shortfalls.some((s) => s.code === 'card-pool-size' && s.difficulty === 'easy')).toBe(true);
    expect(small.shortfalls.some((s) => s.code === 'pool-size')).toBe(true);
    const exact = (d: Difficulty, normals: number, anomalies: number): DatasetInput => {
      const companies = comps(10);
      const problems: Problem[] = [];
      let n = 0;
      const id = () => `${d}-${String(++n).padStart(3, '0')}`;
      const normal = normalOf(id(), d, 'c1');
      problems.push(normal, ...Array.from({ length: normals - 1 }, (_, i) => normalOf(id(), d, companies[(i + 1) % 10]!.id)));
      for (let i = 0; i < anomalies; i++) problems.push(ledgerAnomaly(KINDS[d][0]!, id(), normal));
      return { companies, kinds: [ledgerKind(KINDS[d][0]!)], problems: problems.map((p) => ({ file: file(p), value: p })) };
    };
    expect(verifyDataset(exact('easy', 10, 75)).shortfalls.some((s) => s.code === 'card-pool-size' && s.difficulty === 'easy')).toBe(false);
    expect(verifyDataset(exact('easy', 10, 74)).shortfalls.some((s) => s.code === 'card-pool-size' && s.difficulty === 'easy')).toBe(true);
    expect(verifyDataset(exact('hard', 10, 122)).shortfalls.some((s) => s.code === 'card-pool-size' && s.difficulty === 'hard')).toBe(false);
  });
});

describe('DS17・DS18 二重の食い違い・最小のずれ・場所・cashScope・既存', () => {
  it('card-double-discrepancy: 向きが逆になる桁ずれ (営業利益 1/10) → 問題ごとに 1 件 (規則を書く)', () => {
    const input = pool();
    const normal = normalIn(input);
    const p0 = set({ ...normal, id: 'easy-906' }, 'tanshin.incomeStatement.current.operatingIncome', 124);
    const actual = [...new Set(verifyProblem(p0, companyB()).hard.map((v) => v.rule))].sort();
    const p = set(p0, 'anomaly', { kind: 'E-02x', places: [{ doc: 'tanshin', path: 'summary.operatingMargin' }], explanation: 'x', expectedRules: actual, base: normal.id, changed: changedCells(normal, p0) });
    const kind = { ...kindOf('E-02x', 'calculation', ['ratio-operating-margin'], actual), ledger: 'v3' as const };
    const r = verifyDataset({ ...plus(input, p), kinds: [...input.kinds, kind] });
    const e = r.shortfalls.find((s) => s.code === 'card-double-discrepancy');
    expect(e?.problem).toBe('easy-906');
    expect(e?.message).toContain('claims-direction');
  });
  it('anomaly-min-deviation: E-12 のずれが小さい (11.0) → 出る。22.0 → 出ない', () => {
    const input = pool();
    const target = anomalyIn(input, 'E-12');
    const small = set(set(target, 'tanshin.summary.operatingMargin', 11), 'anomaly.expectedRules', target.anomaly!.expectedRules);
    expect(verifyDataset(replace(input, target.id, small)).shortfalls.filter((s) => s.code === 'anomaly-min-deviation').map((s) => s.problem)).toEqual([target.id]);
    expect(verifyDataset(input).shortfalls.some((s) => s.code === 'anomaly-min-deviation')).toBe(false);
  });
  it('card-place-text: places が ir.statements.<N>.text を指す異変 → 問題ごとに 1 件', () => {
    const input = pool();
    const target = anomalyIn(input, 'E-12');
    const bad = set(target, 'anomaly.places', [{ doc: 'ir', path: 'statements.0.text' }]);
    expect(verifyDataset(replace(input, target.id, bad)).shortfalls.filter((s) => s.code === 'card-place-text').map((s) => s.problem)).toEqual([target.id]);
  });
  it('cash-scope (errors): 標準の名前と違う → 問題・異変の問題・見本ごとに 1 件', () => {
    const input = pool();
    const normal = normalIn(input);
    expect(errCodes(verifyDataset(input))).not.toContain('cash-scope');
    expect(verifyDataset(replace(input, normal.id, set(normal, 'tanshin.notes.cashScope', '現金及び預金・定期預金'))).errors.filter((e) => e.code === 'cash-scope').map((e) => e.problem)).toEqual([normal.id]);
    const sample = set(normalOf('sample', 'easy', 'c-sample'), 'tanshin.notes.cashScope', 'x');
    const withSample = { ...input, companies: [...input.companies, { ...companyB(), id: 'c-sample' }], samples: [{ file: 'samples/sample.json', value: { problem: sample, notes: {} } }] };
    expect(verifyDataset(withSample).errors.some((e) => e.code === 'cash-scope' && e.problem === 'sample')).toBe(true);
  });
  it('既存: anomaly-ratio は出ない。pool-size・both-sided-companies は今のまま。形ごとの検査 (card-shape-*) は出ない', () => {
    const r = verifyDataset(pool());
    expect(codesOf(r)).not.toContain('anomaly-ratio');
    expect(codesOf(r).filter((c) => c.startsWith('card-shape-'))).toEqual([]);
    expect(codesOf(verifyDataset(pool({ companies: 2 })))).toEqual(expect.arrayContaining(['pool-size', 'both-sided-companies']));
    expect(r.stats.easy).toEqual({ total: 9, anomaly: 6, normal: 3 });
  });
});

describe('見本 (S21 の v3 版): claims-count・card-structure・card-relation・card-text-length', () => {
  const withSample = (problem: Problem): DatasetInput => ({ ...pool(), companies: [...pool().companies, { ...companyB(), id: 'c-sample' }], samples: [{ file: 'samples/sample.json', value: { problem, notes: {} } }] });
  const sample = () => normalOf('sample', 'easy', 'c-sample');
  it('基準の見本は errors も shortfalls も出ない', () => {
    const r = verifyDataset(withSample(sample()));
    expect(r.errors.filter((e) => e.problem === 'sample')).toEqual([]);
    expect(r.shortfalls.filter((s) => s.problem === 'sample')).toEqual([]);
  });
  it('主張が 2 つ → claims-count (errors)', () => {
    const p = set(sample(), 'ir.statements', [...sample().ir.statements, { slide: 'highlights', text: 'x', claims: [{ metric: 'operatingIncome', direction: 'down' }] }]);
    expect(verifyDataset(withSample(p)).errors.some((e) => e.code === 'claims-count' && e.problem === 'sample')).toBe(true);
  });
  it('見出し語が引けない・関係が破れる → card-structure・card-relation (errors)', () => {
    expect(verifyDataset(withSample(set(sample(), 'ir.statements', []))).errors.some((e) => e.code === 'card-structure' && e.problem === 'sample')).toBe(true);
    expect(verifyDataset(withSample(set(sample(), 'tanshin.summary.operatingMargin', 20))).errors.some((e) => e.code === 'card-relation' && e.problem === 'sample')).toBe(true);
  });
  it('見本は 1 つの異変も持たない (sample-anomaly)', () => {
    const p = ledgerAnomaly('E-12', 'sample', normalOf('sample', 'easy', 'c-sample'));
    expect(verifyDataset(withSample(p)).errors.some((e) => e.code === 'sample-anomaly')).toBe(true);
  });
});

describe('KD 種類の定義 (anomaly-kinds.json。§6.4)', () => {
  const byId = (id: string) => dataKinds.find((k) => k.id === id) as AnomalyKind;
  const ledger = dataKinds.filter((k) => k.ledger === 'v3');
  it('KD1: 台帳 v3 の印は やさしい 15・むずかしい 20 種類', () => {
    expect(ledger.filter((k) => k.id.startsWith('E-')).map((k) => k.id).sort()).toEqual(['E-02', 'E-03', 'E-04', 'E-05', 'E-12', 'E-17', 'E-19', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-26', 'E-27', 'E-28']);
    expect(ledger.filter((k) => k.id.startsWith('H-')).map((k) => k.id).sort()).toEqual(['H-01', 'H-03', 'H-04', 'H-05', 'H-13', 'H-17', 'H-19', 'H-20', 'H-21', 'H-22', 'H-23', 'H-24', 'H-28', 'H-29', 'H-30', 'H-31', 'H-32', 'H-33', 'H-34', 'H-35']);
    expect(dataKinds.filter((k) => ['E-01', 'E-06', 'E-07', 'H-02', 'H-06'].includes(k.id)).every((k) => k.ledger === undefined)).toBe(true);
  });
  it('KD2: 新しい種類の系統と主な規則', () => {
    const want: Record<string, [string, string]> = {
      'E-19': ['appearance', 'card-slots'], 'E-21': ['appearance', 'card-format'], 'E-22': ['appearance', 'card-slots'], 'E-23': ['appearance', 'card-headline'],
      'E-24': ['calculation', 'ratio-operating-margin'], 'E-25': ['appearance', 'card-sign'], 'E-26': ['appearance', 'card-column-suffix'], 'E-27': ['appearance', 'card-digits'], 'E-28': ['appearance', 'card-date-valid'],
      'H-29': ['card-form', 'card-unit'], 'H-30': ['card-form', 'label-spelling'], 'H-31': ['card-form', 'card-slots'], 'H-32': ['card-form', 'card-format'], 'H-33': ['card-form', 'card-slots'], 'H-34': ['card-form', 'card-sign'], 'H-35': ['cross-document', 'header-company-name'],
    };
    for (const [id, [family, rule]] of Object.entries(want)) {
      expect(byId(id)?.family, id).toBe(family);
      expect(byId(id)?.primaryRules, id).toContain(rule);
      for (const r of byId(id)?.primaryRules ?? []) expect(byId(id)?.allowedRules, id).toContain(r);
    }
    expect(byId('E-23')?.relationChecks).toEqual(['R-dir']);
    expect([...(byId('E-24')?.relationChecks ?? [])].sort()).toEqual(['R-lt', 'R-margin']);
  });
  it('KD3: 既存の種類に足す (外さない)', () => {
    expect(byId('E-02').family).toBe('calculation');
    expect(byId('E-02').primaryRules).toContain('ratio-operating-margin');
    expect(byId('E-02').allowedRules).toContain('ratio-operating-margin');
    expect(byId('E-02').primaryRules).toContain('sum-operating-income'); // 今のものは残る
    expect([...(byId('E-02').relationChecks ?? [])].sort()).toEqual(['R-margin', 'R-range']);
    expect(byId('E-12').relationChecks).toEqual(['R-margin']);
    expect(byId('E-17').relationChecks).toEqual(['R-dir']);
    expect(byId('E-03').primaryRules).toContain('card-unit');
    expect(byId('E-03').primaryRules).toContain('unit-consistency');
  });
  it('KD4: 種類が参照する規則はすべて存在する', () => {
    const all = [...HARD_RULE_IDS, ...SOFT_RULE_IDS];
    for (const k of dataKinds) for (const r of [...k.primaryRules, ...k.allowedRules]) expect(all, `${k.id} ${r}`).toContain(r);
  });
  it('KD5: 今のデータの errors は 0 件のまま (card-* は shortfalls)', async () => {
    const { problems, companies, sample } = await import('../data/pool-source.ts');
    const r = verifyDataset({
      companies,
      kinds: dataKinds,
      problems: problems.map((p) => ({ file: `problems/${p.difficulty}/${p.id}.json`, value: p })),
      samples: sample === undefined ? [] : [{ file: 'samples/sample.json', value: sample }],
    });
    expect(r.errors).toEqual([]);
    expect(codesOf(r).filter((c) => c.startsWith('card-')).length).toBeGreaterThan(0);
  });
});

describe('12.2 base・changed (B1〜B6)', () => {
  const setup = () => {
    const input = pool();
    return { input, base: normalIn(input), target: anomalyIn(input, 'E-12') };
  };
  const withBase = (target: Problem, extra: Record<string, unknown>) => set(target, 'anomaly', { ...target.anomaly!, ...extra });

  it('B1: base・changed が実際の差と一致 → anomaly-changed-mismatch・anomaly-base は出ない', () => {
    const { input, base, target } = setup();
    const r = verifyDataset(replace(input, target.id, withBase(target, { base: base.id, changed: ['tanshin.summary.operatingMargin'] })));
    expect(errCodes(r)).not.toContain('anomaly-changed-mismatch');
    expect(errCodes(r)).not.toContain('anomaly-base');
    expect(r.shortfalls.some((s) => s.code === 'card-anomaly-base' && s.problem === target.id)).toBe(false);
  });
  it('B2: changed が少ない・多い → anomaly-changed-mismatch。順序だけ違う → 出ない', () => {
    const { input, base, target } = setup();
    const two = set(target, 'tanshin.summary.roe', 99);
    const run = (changed: string[], t: Problem = two) => verifyDataset(replace(input, target.id, withBase(t, { base: base.id, changed })));
    expect(errCodes(run(['tanshin.summary.operatingMargin']))).toContain('anomaly-changed-mismatch');
    expect(run(['tanshin.summary.operatingMargin']).errors.find((e) => e.code === 'anomaly-changed-mismatch')?.message).toContain('tanshin.summary.roe');
    expect(errCodes(run(['tanshin.summary.operatingMargin', 'tanshin.summary.roe', 'tanshin.summary.eps']))).toContain('anomaly-changed-mismatch');
    expect(errCodes(run(['tanshin.summary.roe', 'tanshin.summary.operatingMargin']))).not.toContain('anomaly-changed-mismatch');
  });
  it('B3: base が存在しない・異変の問題・別の会社・別の期・自分自身 → anomaly-base', () => {
    const { input, target } = setup();
    const otherCompany = normalIn(input, 'c2');
    const otherYear = { ...normalOf('easy-903', 'easy', 'c1'), fiscalYear: 2026, tanshin: { ...target.tanshin, header: { ...target.tanshin.header, periodLabel: '2026年3月期' } } } as Problem;
    const withExtra = plus(input, otherYear);
    const code = (id: string) => errCodes(verifyDataset(replace(withExtra, target.id, withBase(target, { base: id, changed: ['tanshin.summary.operatingMargin'] }))));
    expect(code('easy-999')).toContain('anomaly-base');
    expect(code(target.id)).toContain('anomaly-base');
    expect(code(otherCompany.id)).toContain('anomaly-base');
    expect(code(otherYear.id)).toContain('anomaly-base');
    expect(code(anomalyIn(input, 'E-24').id)).toContain('anomaly-base');
  });
  it('B4: labelOverrides だけの異変は changed: []。差があれば changed: [] は誤り', () => {
    const { input, base } = setup();
    const typo = { ...normalOf('easy-904', 'easy', 'c1'), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    const p = set(typo, 'anomaly', { kind: 'E-05', places: [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }], explanation: 'x', expectedRules: ['label-spelling'], base: base.id, changed: [] });
    const kinds = [...input.kinds, kindOf('E-05', 'appearance', ['label-spelling'], ['label-spelling'])];
    expect(errCodes(verifyDataset({ ...plus(input, p), kinds }))).not.toContain('anomaly-changed-mismatch');
    expect(errCodes(verifyDataset({ ...plus(input, set(p, 'tanshin.summary.roe', 99)), kinds }))).toContain('anomaly-changed-mismatch');
  });
  it('B5: base・changed が無い異変の問題 → shortfalls card-anomaly-base (問題ごと)', () => {
    const input = pool({ withBase: false });
    const missing = verifyDataset(input).shortfalls.filter((s) => s.code === 'card-anomaly-base');
    expect(missing).toHaveLength(pb(input).filter((p) => p.anomaly !== null).length);
    expect(missing.every((s) => s.problem !== undefined)).toBe(true);
  });
  it('B6: 配列の差は添字つきのパス。要素の数が違えば、足りない添字のパスが差', () => {
    const { input, base } = setup();
    const t = normalOf('easy-905', 'easy', 'c1');
    const p = set(set(t, 'ir.statements.0.text', '別の文'), 'anomaly', { kind: 'E-12', places: [{ doc: 'ir', path: 'statements.0.text' }], explanation: 'x', expectedRules: [], base: base.id, changed: ['ir.statements.0.text'] });
    expect(verifyDataset(plus(input, p)).errors.filter((e) => e.problem === 'easy-905' && e.code === 'anomaly-changed-mismatch')).toEqual([]);
    const shorter = set(set(t, 'ir.statements', t.ir.statements.slice(0, 2)), 'anomaly', { kind: 'E-12', places: [{ doc: 'ir', path: 'statements.2' }], explanation: 'x', expectedRules: [], base: base.id, changed: [] });
    expect(verifyDataset(plus(input, shorter)).errors.find((e) => e.problem === 'easy-905' && e.code === 'anomaly-changed-mismatch')?.message).toContain('ir.statements.2');
    expect(add(t, 'tanshin.summary.eps', 0)).toBeDefined();
  });
});
