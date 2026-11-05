// DW1〜DW29 (docs/test-cases/domain-v2.md §1.1〜§1.4)。出題 v2: 枠ごとに形を先に引く (R-S1〜S3・R-S6)。
import { describe, expect, it } from 'vitest';
import { buildPool, counting, makePoolV2, makeSkewedPool, mergePools, range, type TestPool } from '../testing/pool-v2';
import { shapesOf } from './cards';
import { TIER_BY_ROUND } from './config';
import { canDraw, draw, type DrawOptions } from './draw';
import { mulberry32 } from './rng';
import { emptyRecords, recordAnswer, type Records } from './records';
import type { Difficulty, Round, ShapeId } from './types';

const run = (t: TestPool, difficulty: Difficulty, seed: number, extra: Partial<DrawOptions> = {}): Round[] =>
  draw(t.pool, { difficulty, rng: mulberry32(seed), visible: t.visible, ...extra });
const seeds = (n: number): number[] => range(1, n);
const ids = (rs: Round[]): string[] => rs.map((r) => r.problem.id);
const shapes = (rs: Round[]): ShapeId[] => rs.map((r) => r.shape);
const anomalyCount = (rs: Round[]): number => rs.filter((r) => r.problem.anomaly !== null).length;
/** 8 枠すべてに、その難易度の形が付いている (形が無いまま「同じ」と比べて通らないように)。 */
const hasValidShapes = (rs: Round[], d: Difficulty): boolean => rs.length === 8 && rs.every((r) => shapesOf(d).includes(r.shape));
const BOTH: Difficulty[] = ['easy', 'hard'];

const easy = makePoolV2({ difficulty: 'easy' });
const hard = makePoolV2({ difficulty: 'hard' });
const standard = (d: Difficulty): TestPool => (d === 'easy' ? easy : hard);
const skewed = (d: Difficulty): TestPool => makeSkewedPool(d);

describe('形・異変の有無・候補 (R-S1〜R-S3)', () => {
  it('DW1: 毎回 8 枠で、問題も会社も重複せず、その難易度の問題と形だけ', () => {
    for (const d of BOTH) {
      for (const seed of seeds(200)) {
        const rs = run(standard(d), d, seed);
        expect(rs).toHaveLength(8);
        expect(new Set(ids(rs)).size).toBe(8);
        expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
        expect(rs.every((r) => r.problem.difficulty === d)).toBe(true);
        expect(rs.every((r) => shapesOf(d).includes(r.shape))).toBe(true);
      }
    }
  });

  it('DW2: 各枠の問題は、その枠の形で見える。正常な問題はどの形の枠にも出る', () => {
    for (const d of BOTH) {
      for (const t of [standard(d), skewed(d)]) {
        const normalShapes = new Set<ShapeId>();
        for (const seed of seeds(200)) {
          for (const r of run(t, d, seed)) {
            expect(t.visible(r.problem), `${r.problem.id} は ${r.shape} で見える`).toContain(r.shape);
            if (r.problem.anomaly === null) normalShapes.add(r.shape);
          }
        }
        expect([...normalShapes].sort()).toEqual([...shapesOf(d)].sort());
      }
    }
  });

  it('DW3: 形の並びは、異変の比・プール・履歴・見つけた種類に依らず、同じ種なら同じ', () => {
    for (const d of BOTH) {
      const kindless = makePoolV2({ difficulty: d, kindsPerShape: 2 });
      const bigger = makePoolV2({ difficulty: d, companies: 12 });
      const normals = standard(d).pool.filter((p) => p.anomaly === null).map((p) => p.id);
      for (const seed of seeds(30)) {
        const baseRounds = run(standard(d), d, seed, { anomalyRatio: 0.5 });
        expect(hasValidShapes(baseRounds, d)).toBe(true);
        const base = shapes(baseRounds);
        for (const ratio of [0, 1]) expect(shapes(run(standard(d), d, seed, { anomalyRatio: ratio }))).toEqual(base);
        for (const t of [skewed(d), kindless, bigger]) expect(shapes(run(t, d, seed))).toEqual(base);
        expect(shapes(run(standard(d), d, seed, { history: normals }))).toEqual(base);
        expect(shapes(run(standard(d), d, seed, { foundKinds: ['kA', 'kB'] }))).toEqual(base);
        expect(shapes(run(standard(d), d, seed, { history: normals, foundKinds: ['kA'], anomalyRatio: 1 }))).toEqual(base);
      }
    }
  });

  it('DW4: 枠の位置ごとに、3 形のそれぞれが 1/3 ± 4 ポイント以内', () => {
    for (const d of BOTH) {
      const n = 3000;
      const count = Array.from({ length: 8 }, () => new Map<ShapeId, number>());
      for (const seed of seeds(n)) shapes(run(standard(d), d, seed)).forEach((s, i) => count[i]!.set(s, (count[i]!.get(s) ?? 0) + 1));
      count.forEach((m, pos) => {
        for (const s of shapesOf(d)) expect(Math.abs((m.get(s) ?? 0) / n - 1 / 3), `位置 ${pos} の ${s}`).toBeLessThanOrEqual(0.04);
      });
    }
  });

  it('DW5: 比 0.5 のとき、異変ありの枠の数は枠ごとに独立 (平均 4 前後、4 以外の回もある)', () => {
    const counts = seeds(400).map((seed) => anomalyCount(run(easy, 'easy', seed, { anomalyRatio: 0.5 })));
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThanOrEqual(3.7);
    expect(mean).toBeLessThanOrEqual(4.3);
    expect(counts.some((c) => c !== 4)).toBe(true);
    expect(counts.some((c) => c >= 6)).toBe(true);
  });

  it('DW6: 比 0 はすべて正常、比 1 はすべて異変', () => {
    for (const seed of seeds(50)) {
      expect(anomalyCount(run(easy, 'easy', seed, { anomalyRatio: 0 }))).toBe(0);
      expect(anomalyCount(run(easy, 'easy', seed, { anomalyRatio: 1 }))).toBe(8);
    }
  });

  it('DW7: 同じ種・同じ入力なら (問題 ID, 形) の並びまで同じ。種が違えば散らばる', () => {
    const key = (rs: Round[]) => rs.map((r) => `${r.problem.id}@${r.shape}`).join(',');
    expect(key(run(easy, 'easy', 5, { history: ['easy-1-n2'] }))).toBe(key(run(easy, 'easy', 5, { history: ['easy-1-n2'] })));
    expect(new Set(seeds(50).map((seed) => key(run(easy, 'easy', seed)))).size).toBeGreaterThanOrEqual(40);
  });

  it('DW8: 段がそろうプールでは、枠 1・2 は段 1、3〜5 は段 2、6〜8 は段 3', () => {
    expect(TIER_BY_ROUND).toEqual([1, 1, 2, 2, 2, 3, 3, 3]);
    for (const d of BOTH) {
      const t = makePoolV2({ difficulty: d, tiers: 'all' });
      for (const seed of seeds(200)) expect(run(t, d, seed).map((r) => r.problem.tier)).toEqual([...TIER_BY_ROUND]);
    }
  });

  it('DW9: 段が足りない・段の項目が無いプールでも 8 枠引ける', () => {
    for (const tiers of [[3] as const, null]) {
      const t = makePoolV2({ difficulty: 'easy', tiers: tiers === null ? null : [...tiers] });
      expect(hasValidShapes(run(t, 'easy', 1), 'easy')).toBe(true);
    }
  });

  it('DW10: 見える形が 2 つ (E1・E2) の問題は、E1 の枠にも E2 の枠にも出て、E3 の枠には出ない', () => {
    const t = buildPool('easy', range(1, 10), () => [
      { tag: 'n', tier: 1 },
      { tag: 'both', kind: 'kA', shapes: ['E1', 'E2'], tier: 1 },
      { tag: 'e3', kind: 'kB', shapes: ['E3'], tier: 1 },
    ]);
    const seen = new Set<string>();
    for (const seed of seeds(300)) {
      for (const r of run(t, 'easy', seed, { anomalyRatio: 1 })) {
        const tag = r.problem.id.split('-')[2];
        seen.add(`${tag}@${r.shape}`);
        expect(tag, `${r.problem.id} の枠の形 ${r.shape}`).toBe(r.shape === 'E3' ? 'e3' : 'both');
      }
    }
    expect([...seen].sort()).toEqual(['both@E1', 'both@E2', 'e3@E3']);
  });

  it('DW11: 難易度の違う問題が混じったプールでは、指定した難易度の問題だけから引く', () => {
    const t = mergePools(easy, hard);
    for (const d of BOTH) {
      for (const seed of seeds(30)) {
        const rs = run(t, d, seed);
        expect(rs.every((r) => r.problem.difficulty === d && shapesOf(d).includes(r.shape))).toBe(true);
      }
    }
  });

  it('DW12: 履歴・見つけた種類にプールに無い ID が混じっても、無視して出題できる', () => {
    for (const seed of seeds(20)) {
      expect(hasValidShapes(run(easy, 'easy', seed, { history: ['no-such', 'easy-1-n2'], foundKinds: ['k-none', 'kA'] }), 'easy')).toBe(true);
    }
  });
});

describe('履歴と見つけた種類 (設計 §3.4 ⑤)', () => {
  const twoNormals = buildPool('easy', range(1, 12), () => [{ tag: 'n1' }, { tag: 'n2' }]);
  const n = (c: number, k: 1 | 2) => `easy-${c}-n${k}`;

  it('DW13: 答えていない問題を優先する', () => {
    const history = range(1, 12).map((c) => n(c, 1));
    for (const seed of seeds(50)) {
      expect(ids(run(twoNormals, 'easy', seed, { anomalyRatio: 0, history })).every((id) => id.endsWith('-n2'))).toBe(true);
    }
  });

  it('DW14: 全部答えていれば、履歴の古い方から (会社が違う範囲で)', () => {
    const history = [...range(1, 12).map((c) => n(c, 1)), ...range(1, 12).map((c) => n(c, 2))];
    const expected = range(1, 8).map((c) => n(c, 1)).sort();
    for (const seed of seeds(50)) expect(ids(run(twoNormals, 'easy', seed, { anomalyRatio: 0, history })).sort()).toEqual(expected);
  });

  const kinds2 = makePoolV2({ difficulty: 'easy', kindsPerShape: 2, tiers: null });
  const kindOf = (r: Round) => r.problem.anomaly?.kind;

  it('DW15: 見つけた種類の問題は後回し (見つけていない種類が先)', () => {
    for (const seed of seeds(50)) {
      const rs = run(kinds2, 'easy', seed, { anomalyRatio: 1, foundKinds: ['kB'] });
      expect(rs.map(kindOf)).toEqual(Array(8).fill('kA'));
    }
  });

  it('DW16: 全種類を見つけていても、例外にならず 8 枠引ける (後回しであって除外ではない)', () => {
    for (const seed of seeds(50)) expect(hasValidShapes(run(kinds2, 'easy', seed, { anomalyRatio: 1, foundKinds: ['kA', 'kB'] }), 'easy')).toBe(true);
  });

  it('DW17: 種類が履歴の順位より先 (答えていない見つけた種類 B より、答えた未発見の種類 A)', () => {
    const history = kinds2.pool.filter((p) => p.anomaly?.kind === 'kA').map((p) => p.id);
    for (const seed of seeds(50)) {
      const rs = run(kinds2, 'easy', seed, { anomalyRatio: 1, foundKinds: ['kB'], history });
      expect(rs.map(kindOf)).toEqual(Array(8).fill('kA'));
    }
  });

  it('DW18: 見つけた種類を渡しても、正常な問題の選び方は変わらない', () => {
    const history = [...range(1, 12).map((c) => n(c, 1)), ...range(1, 12).map((c) => n(c, 2))];
    for (const seed of seeds(50)) {
      const plain = run(twoNormals, 'easy', seed, { anomalyRatio: 0, history });
      const withKinds = run(twoNormals, 'easy', seed, { anomalyRatio: 0, history, foundKinds: ['kA', 'kB'] });
      expect(withKinds.map((r) => `${r.problem.id}@${r.shape}`)).toEqual(plain.map((r) => `${r.problem.id}@${r.shape}`));
    }
  });
});

describe('出題できないとき・canDraw', () => {
  it('DW19: 会社が 7 社だけのプールは例外 (黙って重複させない)', () => {
    expect(() => run(makePoolV2({ difficulty: 'easy', companies: 7 }), 'easy', 1)).toThrow(/出題できません/);
  });

  it('DW20: 異変の問題を持つ会社が 7 社だけなら、比 1 で毎回例外', () => {
    const t = buildPool('easy', range(1, 12), (c) => [
      { tag: 'n' },
      ...(c <= 7 ? shapesOf('easy').map((s) => ({ tag: s, kind: 'kA', shapes: [s] })) : []),
    ]);
    for (const seed of seeds(20)) expect(() => run(t, 'easy', seed, { anomalyRatio: 1 })).toThrow(/出題できません/);
  });

  it('DW21: 会社がちょうど 8 社なら、毎回 8 枠・会社 8 社がすべて違う', () => {
    const t = makePoolV2({ difficulty: 'easy', companies: 8 });
    for (const seed of seeds(100)) {
      const rs = run(t, 'easy', seed);
      expect(rs).toHaveLength(8);
      expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
    }
  });

  it('DW22: canDraw は、会社 10 社の試験用プールで true', () => {
    for (const d of BOTH) expect(canDraw(standard(d).pool, d, standard(d).visible)).toBe(true);
  });

  it('DW23: canDraw は、E1 で見える異変を持つ会社が 7 社なら false (同じプールのむずかしいは true)', () => {
    const e = buildPool('easy', range(1, 10), (c) => [
      { tag: 'n' },
      ...shapesOf('easy').map((s) => ({ tag: s, kind: 'kA', shapes: s === 'E1' && c > 7 ? ['E2' as const] : [s] })),
    ]);
    const t = mergePools(e, hard);
    expect(canDraw(t.pool, 'easy', t.visible)).toBe(false);
    expect(canDraw(t.pool, 'hard', t.visible)).toBe(true);
  });

  it('DW24: canDraw は、正常な問題を持つ会社が 7 社・その難易度の問題が無いとき false', () => {
    const t = buildPool('easy', range(1, 10), (c) => [
      ...(c <= 7 ? [{ tag: 'n' }] : []),
      ...shapesOf('easy').map((s) => ({ tag: s, kind: 'kA', shapes: [s] })),
    ]);
    expect(canDraw(t.pool, 'easy', t.visible)).toBe(false);
    expect(canDraw([], 'easy', () => [])).toBe(false);
    expect(canDraw(easy.pool, 'hard', easy.visible)).toBe(false);
  });

  it('DW25: canDraw が true のプールは、比 0・0.5・1 のどれでも、種 1〜500 で例外にならない', () => {
    const pools: [Difficulty, TestPool][] = [['easy', easy], ['hard', hard], ['easy', skewed('easy')], ['hard', skewed('hard')], ['easy', makePoolV2({ difficulty: 'easy', companies: 8 })]];
    for (const [d, t] of pools) {
      expect(canDraw(t.pool, d, t.visible)).toBe(true);
      for (const ratio of [0, 0.5, 1]) for (const seed of seeds(500)) expect(() => run(t, d, seed, { anomalyRatio: ratio })).not.toThrow();
    }
  });

  it('DW25b: 異変だけの会社と正常だけの会社に分かれたプールでも、canDraw は true で draw は例外にならない', () => {
    const t = buildPool('easy', range(1, 16), (c) =>
      c <= 8 ? shapesOf('easy').map((s) => ({ tag: s, kind: 'kA', shapes: [s] })) : [{ tag: 'n' }],
    );
    expect(canDraw(t.pool, 'easy', t.visible)).toBe(true);
    for (const ratio of [0, 0.5, 1]) {
      for (const seed of seeds(500)) {
        const rs = run(t, 'easy', seed, { anomalyRatio: ratio });
        expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
        for (const r of rs) {
          const c = Number(r.problem.companyId.slice(1));
          expect(r.problem.anomaly !== null ? c <= 8 : c >= 9).toBe(true);
        }
      }
    }
  });

  it('DW25c: draw・canDraw は、1 回の呼び出しで visible を各問題に高々 1 回しか呼ばない。結果は変わらない', () => {
    for (const seed of seeds(50)) {
      const c = counting(easy.visible);
      const rs = run({ pool: easy.pool, visible: c.visible }, 'easy', seed, { anomalyRatio: 0.5 });
      expect([...c.calls.values()].every((n) => n <= 1)).toBe(true);
      expect(rs.map((r) => `${r.problem.id}@${r.shape}`)).toEqual(run(easy, 'easy', seed, { anomalyRatio: 0.5 }).map((r) => `${r.problem.id}@${r.shape}`));
    }
    const c = counting(easy.visible);
    expect(canDraw(easy.pool, 'easy', c.visible)).toBe(true);
    expect([...c.calls.values()].every((n) => n <= 1)).toBe(true);
  });
});

describe('形の出方が正常と異変でそろう (R-S6)', () => {
  const LAPS = 10_000;
  const tolerance = 0.015;

  interface Tally {
    anomaly: Map<ShapeId, number>;
    normal: Map<ShapeId, number>;
    slots: number;
  }
  const tally = (laps: Iterable<Round[]>): Tally => {
    const t: Tally = { anomaly: new Map(), normal: new Map(), slots: 0 };
    for (const rs of laps) {
      for (const r of rs) {
        const m = r.problem.anomaly !== null ? t.anomaly : t.normal;
        m.set(r.shape, (m.get(r.shape) ?? 0) + 1);
        t.slots++;
      }
    }
    return t;
  };
  const total = (m: Map<ShapeId, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const expectSteady = (t: Tally, d: Difficulty) => {
    expect(t.slots).toBe(LAPS * 8);
    for (const [name, m] of [['異変の枠', t.anomaly], ['正常の枠', t.normal]] as const) {
      for (const s of shapesOf(d)) expect(Math.abs((m.get(s) ?? 0) / total(m) - 1 / 3), `${name}の ${s}`).toBeLessThanOrEqual(tolerance);
    }
    expect(Math.abs(total(t.anomaly) / t.slots - 0.5), '異変の枠の割合').toBeLessThanOrEqual(tolerance);
  };

  it('DW26・DW27: 偏ったプールの 1 万周で、異変の枠でも正常の枠でも各形が 1/3 ± 1.5 ポイント、異変の枠の割合が 0.5 ± 1.5 ポイント', () => {
    for (const d of BOTH) {
      const t = skewed(d);
      expectSteady(tally(seeds(LAPS).map((seed) => run(t, d, seed))), d);
    }
  });

  it('DW28: 履歴と見つけた種類を引き継いで (毎周、全問を正しく答える) 1 万周回しても、同じ幅に収まる', () => {
    for (const d of BOTH) {
      const t = skewed(d);
      let rec: Records = emptyRecords();
      const laps: Round[][] = [];
      for (const seed of seeds(LAPS)) {
        const rs = run(t, d, seed, { history: rec[d].history, foundKinds: rec[d].kinds });
        laps.push(rs);
        rs.forEach((r, round) => {
          const answer = r.problem.anomaly !== null ? 'anomaly' : 'normal';
          rec = recordAnswer(rec, { difficulty: d, round, problem: r.problem, answer, correct: true });
        });
      }
      expectSteady(tally(laps), d);
    }
  });

  it('DW29: 形ごとに 1 対 1 の異変を持つ試験用プールでも、同じ幅に収まる', () => {
    for (const d of BOTH) {
      expectSteady(tally(seeds(LAPS).map((seed) => run(standard(d), d, seed))), d);
    }
  });
});

