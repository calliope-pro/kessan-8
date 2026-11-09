// DW1〜DW33 (docs/test-cases/domain-v3.md §1)。出題 v3: 形を引かない・段は累積・履歴は直近 K 件・R-S6 は種類の出方 (設計 v3 §1.5・§2.7)。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPool, EASY_KINDS, HARD_KINDS, HARD_PRIMARY, kindsOf, makeRecommendedPool, makeSmallPool, makeUnevenPool, mergePools, range } from '../testing/pool-v3';
import { checkGroups, GROUPS, simulate, type SimOptions, type SimResult } from '../testing/rs6';
import { HISTORY_WINDOW, TIER_BY_ROUND } from './config';
import { canDraw, draw, type DrawOptions } from './draw';
import { mulberry32 } from './rng';
import type { Difficulty, Problem, Round } from './types';

const BOTH: Difficulty[] = ['easy', 'hard'];
const run = (pool: Problem[], difficulty: Difficulty, seed: number, extra: Partial<DrawOptions> = {}): Round[] => draw(pool, { difficulty, rng: mulberry32(seed), ...extra });
const seeds = (n: number): number[] => range(1, n);
const ids = (rs: Round[]): string[] => rs.map((r) => r.problem.id);
const anomalyCount = (rs: Round[]): number => rs.filter((r) => r.problem.anomaly !== null).length;
const kindOf = (r: Round): string | undefined => r.problem.anomaly?.kind;
const companyNumber = (r: Round): number => Number(r.problem.companyId.slice(1));

const small = (d: Difficulty): Problem[] => makeSmallPool(d);

describe('異変の有無・候補・段 (R-S2・R-S3・段は累積)', () => {
  it('DW1: 毎回 8 枠で、問題も会社も重複せず、その難易度の問題だけ。枠は問題だけを持つ (形が無い)', () => {
    for (const d of BOTH) {
      for (const seed of seeds(200)) {
        const rs = run(small(d), d, seed);
        expect(rs).toHaveLength(8);
        expect(new Set(ids(rs)).size).toBe(8);
        expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
        expect(rs.every((r) => r.problem.difficulty === d)).toBe(true);
        expect(rs.every((r) => Object.keys(r).join() === 'problem')).toBe(true);
      }
    }
  });

  it('DW2: 推奨のプールの全問が少なくとも 1 回は出る。正常な問題はどの枠の位置にも出る', () => {
    for (const d of BOTH) {
      const pool = makeRecommendedPool(d);
      const seen = new Set<string>();
      const normalSlots = new Set<number>();
      for (const seed of seeds(3000)) {
        run(pool, d, seed).forEach((r, slot) => {
          seen.add(r.problem.id);
          if (r.problem.anomaly === null) normalSlots.add(slot);
        });
      }
      expect(pool.filter((p) => !seen.has(p.id)).map((p) => p.id), `${d} で出なかった問題`).toEqual([]);
      expect([...normalSlots].sort()).toEqual(range(0, 7));
    }
  });

  it('DW5: 異変の比 0.5 で、異変ありの枠の数の平均は 4 の付近。枠ごとに独立 (4 でない回・6 以上の回がある)', () => {
    for (const d of BOTH) {
      const counts = seeds(400).map((seed) => anomalyCount(run(small(d), d, seed, { anomalyRatio: 0.5 })));
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      expect(mean).toBeGreaterThanOrEqual(3.7);
      expect(mean).toBeLessThanOrEqual(4.3);
      expect(counts.some((c) => c !== 4)).toBe(true);
      expect(counts.some((c) => c >= 6)).toBe(true);
    }
  });

  it('DW6: 比 0 はすべて正常、比 1 はすべて異変', () => {
    for (const d of BOTH) {
      for (const seed of seeds(50)) {
        expect(anomalyCount(run(small(d), d, seed, { anomalyRatio: 0 }))).toBe(0);
        expect(anomalyCount(run(small(d), d, seed, { anomalyRatio: 1 }))).toBe(8);
      }
    }
  });

  it('DW7: 同じ種・同じ入力なら同じ並び。種を変えると散らばる', () => {
    for (const d of BOTH) {
      for (const seed of seeds(20)) expect(ids(run(small(d), d, seed))).toEqual(ids(run(small(d), d, seed)));
      expect(new Set(seeds(50).map((seed) => ids(run(small(d), d, seed)).join())).size).toBeGreaterThanOrEqual(40);
    }
  });

  it('DW8: 段は累積 — 1〜2 社目は段 1 だけ、3〜5 社目は段 1・2、6〜8 社目は段 1・2・3', () => {
    for (const d of BOTH) {
      const tiersBySlot = range(0, 7).map(() => new Set<number>());
      for (const seed of seeds(500)) {
        run(small(d), d, seed, { anomalyRatio: 1 }).forEach((r, slot) => tiersBySlot[slot]!.add(r.problem.tier!));
      }
      const tiers = tiersBySlot.map((s) => [...s].sort());
      expect(tiers.slice(0, 2)).toEqual([[1], [1]]);
      expect(tiers.slice(2, 5)).toEqual([[1, 2], [1, 2], [1, 2]]);
      expect(tiers.slice(5)).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
      // 狙いの段は設定値 (TIER_BY_ROUND) のとおり
      expect(TIER_BY_ROUND).toEqual([1, 1, 2, 2, 2, 3, 3, 3]);
    }
  });

  it('DW8b: 比 0 (全枠が正常) で毎回 8 枠引け、正常な問題は段を持たない', () => {
    for (const d of BOTH) {
      for (const pool of [small(d), makeRecommendedPool(d)]) {
        for (const seed of seeds(200)) {
          const rs = run(pool, d, seed, { anomalyRatio: 0 });
          expect(rs).toHaveLength(8);
          expect(rs.every((r) => r.problem.tier === undefined && r.problem.anomaly === null)).toBe(true);
        }
      }
    }
  });

  it('DW9: 段 3 の異変の問題しか無いとき、1 枠目にも段 3 が出る。段の項目が無いプールでも引ける', () => {
    for (const d of BOTH) {
      const tier3 = buildPool(d, range(1, 10), () => [{ tag: 'n' }, { tag: 'a', kind: 'K3', tier: 3 }]);
      const noTier = buildPool(d, range(1, 10), () => [{ tag: 'n' }, { tag: 'a', kind: 'K0' }]);
      for (const seed of seeds(100)) {
        const rs = run(tier3, d, seed, { anomalyRatio: 1 });
        expect(rs).toHaveLength(8);
        expect(rs.every((r) => r.problem.tier === 3)).toBe(true);
        expect(run(noTier, d, seed)).toHaveLength(8);
      }
    }
  });

  it('DW9b: 段 1 の会社が c01 だけのとき、段を無視するのは必要な枠だけ (毎回 1・2 枠目の 1 つが c01 の段 1、もう 1 つと 3〜8 枠目は段 3)', () => {
    for (const d of BOTH) {
      const pool = buildPool(d, range(1, 10), (c) => (c === 1 ? [{ tag: 'n' }, { tag: 't1', kind: 'K1', tier: 1 }] : [{ tag: 'n' }, { tag: 't3', kind: 'K3', tier: 3 }]));
      for (const seed of seeds(200)) {
        const rs = run(pool, d, seed, { anomalyRatio: 1 });
        const first = rs.slice(0, 2);
        expect(first.filter((r) => r.problem.tier === 1 && r.problem.companyId === 'c01'), `seed ${seed}`).toHaveLength(1);
        expect(first.filter((r) => r.problem.tier === 3), `seed ${seed}`).toHaveLength(1);
        expect(rs.slice(2).every((r) => r.problem.tier === 3), `seed ${seed}`).toBe(true);
      }
    }
  });

  it('DW11: 難易度の違う問題が混じっても、指定した難易度の問題だけから引く', () => {
    const mixed = mergePools(small('easy'), small('hard'));
    for (const d of BOTH) for (const seed of seeds(100)) expect(run(mixed, d, seed).every((r) => r.problem.difficulty === d)).toBe(true);
  });

  it('DW12: 履歴・見つけた種類にプールに無い ID が混じっても出題できる', () => {
    for (const d of BOTH) {
      const rs = run(small(d), d, 1, { history: ['nothing-1', 'nothing-2'], foundKinds: ['no-such-kind'] });
      expect(rs).toHaveLength(8);
      expect(ids(rs)).toEqual(ids(run(small(d), d, 1)));
    }
  });
});

describe('履歴と見つけた種類', () => {
  const historyPool = buildPool('easy', range(1, 12), () => [{ tag: 'n1' }, { tag: 'n2' }]);
  const n1 = (companies: number[]): string[] => companies.map((c) => `easy-${c}-n1`);
  const n2 = (companies: number[]): string[] => companies.map((c) => `easy-${c}-n2`);
  const normalOnly = { anomalyRatio: 0 };

  it('DW13: 履歴が 12 社の n1 なら、毎回 n2 を引く (答えていない問題を優先)', () => {
    expect(12).toBeLessThanOrEqual(HISTORY_WINDOW);
    for (const seed of seeds(50)) {
      const rs = run(historyPool, 'easy', seed, { ...normalOnly, history: n1(range(1, 12)) });
      expect(rs.every((r) => r.problem.id.endsWith('-n2'))).toBe(true);
    }
  });

  it('DW14: 履歴が n1 ×12・n2 ×12 (24 件) なら、会社の中では窓の外の n1 (c01〜c08) と窓の中でも古い n1 (c09〜c12) を選び (n2 は選ばない)、会社の並びは履歴に依らない (c09〜c12 も選ばれる)', () => {
    const history = [...n1(range(1, 12)), ...n2(range(1, 12))];
    const chosen = new Set<number>();
    for (const seed of seeds(200)) {
      const rs = run(historyPool, 'easy', seed, { ...normalOnly, history });
      expect(rs.every((r) => r.problem.id.endsWith('-n1')), `seed ${seed}`).toBe(true);
      rs.forEach((r) => chosen.add(companyNumber(r)));
    }
    // 会社の並べ方に履歴の順位を使うと、窓の外の c01〜c08 に固定される (会社から答えが漏れる。#155 包括レビュー B1)
    expect([...chosen].some((c) => c >= 9)).toBe(true);
    expect(chosen.size).toBe(12);
  });

  it('DW14b: 履歴が窓の 3.75 倍あるとき、窓の中の問題は選ばれず、窓の外の問題はすべて同順位 (会社の中でも古い順に固定されない)', () => {
    expect(HISTORY_WINDOW).toBe(16);
    const companies = (HISTORY_WINDOW * 5) / 4; // 20 社 × 3 問 → 履歴 60 件
    const pool = buildPool('easy', range(1, companies), () => [{ tag: 'n1' }, { tag: 'n2' }, { tag: 'n3' }]);
    const all = range(1, companies);
    const history = [...all.map((c) => `easy-${c}-n1`), ...all.map((c) => `easy-${c}-n2`), ...all.map((c) => `easy-${c}-n3`)];
    const windowIds = new Set(history.slice(-HISTORY_WINDOW)); // n3 の c05〜c20
    expect(windowIds.size).toBe(HISTORY_WINDOW);
    const chosenTags = new Set<string>();
    for (const seed of seeds(200)) {
      const rs = run(pool, 'easy', seed, { ...normalOnly, history });
      expect(rs.filter((r) => windowIds.has(r.problem.id)).map((r) => r.problem.id), `seed ${seed}`).toEqual([]);
      rs.forEach((r) => chosenTags.add(r.problem.id.split('-')[2]!));
    }
    // 履歴の全部を数えると、会社の中で最も古い n1 に固定される。窓の外はすべて「答えていない」で同順位なので、n2 も選ばれる
    expect([...chosenTags].sort()).toEqual(['n1', 'n2', 'n3']);
  });

  const kindPool = buildPool('easy', range(1, 12), () => [
    { tag: 'a', kind: 'A' },
    { tag: 'b', kind: 'B' },
  ]);
  const anomaliesOnly = { anomalyRatio: 1 };

  it('DW15: 見つけた種類 = {B} なら、異変の枠はすべて種類 A (後回し)', () => {
    for (const seed of seeds(50)) {
      expect(run(kindPool, 'easy', seed, { ...anomaliesOnly, foundKinds: ['B'] }).map(kindOf)).toEqual(Array(8).fill('A'));
    }
  });

  it('DW15b: 会社の並びも、見つけた種類を後回しにする — 種類 A だけの会社 8 社と種類 B だけの会社 8 社で、見つけた種類 = {B} なら、8 枠とも A の会社 (c01〜c08)', () => {
    const pool = buildPool('easy', range(1, 16), (c) => [c <= 8 ? { tag: 'a', kind: 'A' } : { tag: 'b', kind: 'B' }]);
    for (const seed of seeds(50)) {
      const rs = run(pool, 'easy', seed, { ...anomaliesOnly, foundKinds: ['B'] });
      expect(rs.map(kindOf), `seed ${seed}`).toEqual(Array(8).fill('A'));
      expect(rs.every((r) => companyNumber(r) <= 8)).toBe(true);
    }
  });

  it('DW16: 見つけた種類が全種類でも例外にならない (除外でなく後回し)', () => {
    for (const seed of seeds(50)) expect(run(kindPool, 'easy', seed, { ...anomaliesOnly, foundKinds: ['A', 'B'] })).toHaveLength(8);
  });

  it('DW17: 見つけた種類 = {B}・履歴 = 種類 A の全問 なら、答えていない B より答えた A を選ぶ (種類が履歴より先)', () => {
    const history = range(1, 12).map((c) => `easy-${c}-a`);
    for (const seed of seeds(50)) {
      expect(run(kindPool, 'easy', seed, { ...anomaliesOnly, foundKinds: ['B'], history }).map(kindOf)).toEqual(Array(8).fill('A'));
    }
  });

  it('DW18: 正常な問題だけの枠 (比 0) では、見つけた種類を渡しても結果が変わらない', () => {
    const history = [...n1(range(1, 12)), ...n2(range(1, 12))];
    for (const seed of seeds(50)) {
      for (const h of [undefined, n1(range(1, 12)), history]) {
        const base = ids(run(historyPool, 'easy', seed, { ...normalOnly, history: h }));
        expect(ids(run(historyPool, 'easy', seed, { ...normalOnly, history: h, foundKinds: ['A', 'B'] }))).toEqual(base);
      }
    }
  });

  it('DW33: 段は候補の絞り込み、種類は候補の並び — 見つけた種類 = {K1} でも 1・2 枠目は K1、3〜5 枠目は K2、6〜8 枠目は K2 か K3', () => {
    const pool = small('easy');
    const midWithoutFound = new Set<string>();
    for (const seed of seeds(200)) {
      const rs = run(pool, 'easy', seed, { ...anomaliesOnly, foundKinds: ['K1'] });
      expect(rs.slice(0, 2).map(kindOf), `seed ${seed}`).toEqual(['K1', 'K1']);
      expect(rs.slice(2, 5).map(kindOf), `seed ${seed}`).toEqual(['K2', 'K2', 'K2']);
      expect(rs.slice(5).every((r) => kindOf(r) === 'K2' || kindOf(r) === 'K3'), `seed ${seed}`).toBe(true);
      run(pool, 'easy', seed, anomaliesOnly)
        .slice(2, 5)
        .forEach((r) => midWithoutFound.add(kindOf(r)!));
    }
    // 対照: 見つけた種類が無ければ、3〜5 枠目に K1 と K2 の両方が出る
    expect([...midWithoutFound].sort()).toEqual(['K1', 'K2']);
  });
});

describe('出題できないとき・canDraw', () => {
  it('DW19: 会社が 7 社だけなら例外 (黙って重複させない)', () => {
    for (const d of BOTH) expect(() => run(makeSmallPool(d, 7), d, 1)).toThrow('出題できません');
  });

  /** 異変の問題を持つ会社が anomalyCompanies 社、正常な問題を持つ会社が normalCompanies 社 (c01 から)。 */
  const sided = (d: Difficulty, anomalyCompanies: number, normalCompanies: number, companies = 10): Problem[] =>
    buildPool(d, range(1, companies), (c) => [
      ...(c <= normalCompanies ? [{ tag: 'n' }] : []),
      ...(c <= anomalyCompanies
        ? [
            { tag: 't1', kind: 'K1', tier: 1 as const },
            { tag: 't2', kind: 'K2', tier: 2 as const },
            { tag: 't3', kind: 'K3', tier: 3 as const },
          ]
        : []),
    ]);

  it('DW20: 異変の問題を持つ会社が 7 社だけなら、比 1 は毎回例外', () => {
    for (const d of BOTH) for (const seed of seeds(20)) expect(() => run(sided(d, 7, 10), d, seed, { anomalyRatio: 1 })).toThrow('出題できません');
  });

  it('DW21: 会社 8 社 (全社が正常・異変を持つ) なら、毎回 8 枠・会社 8 社がすべて違う', () => {
    for (const d of BOTH) {
      for (const seed of seeds(100)) {
        const rs = run(makeSmallPool(d, 8), d, seed);
        expect(rs).toHaveLength(8);
        expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
      }
    }
  });

  it('DW22: canDraw は、小プール・推奨のプールで true', () => {
    for (const d of BOTH) {
      expect(canDraw(small(d), d)).toBe(true);
      expect(canDraw(makeRecommendedPool(d), d)).toBe(true);
    }
  });

  it('DW23: canDraw は、異変の問題を持つ会社が 7 社なら false・8 社なら true (難易度ごと)', () => {
    for (const d of BOTH) {
      const other: Difficulty = d === 'easy' ? 'hard' : 'easy';
      expect(canDraw(sided(d, 7, 10), d)).toBe(false);
      expect(canDraw(sided(d, 8, 10), d)).toBe(true);
      // 同じプールのもう一方の難易度 (10 社) は true
      expect(canDraw(mergePools(sided(d, 7, 10), sided(other, 10, 10)), other)).toBe(true);
      expect(canDraw(mergePools(sided(d, 7, 10), sided(other, 10, 10)), d)).toBe(false);
    }
  });

  it('DW24: canDraw は、正常な問題を持つ会社が 7 社なら false・8 社なら true。その難易度の問題が無ければ false', () => {
    for (const d of BOTH) {
      const other: Difficulty = d === 'easy' ? 'hard' : 'easy';
      expect(canDraw(sided(d, 10, 7), d)).toBe(false);
      expect(canDraw(sided(d, 10, 8), d)).toBe(true);
      expect(canDraw(small(other), d)).toBe(false);
    }
  });

  it('DW25: canDraw が true のプールは、どの比・種でも draw が例外にならない', () => {
    for (const d of BOTH) {
      for (const [pool, n] of [[small(d), 500], [makeSmallPool(d, 8), 500], [makeRecommendedPool(d), 100]] as const) {
        expect(canDraw(pool, d)).toBe(true);
        for (const ratio of [0, 0.5, 1]) for (const seed of seeds(n)) expect(run(pool, d, seed, { anomalyRatio: ratio })).toHaveLength(8);
      }
    }
  });

  it('DW25b: 異変だけの会社 c01〜c08 と正常だけの会社 c09〜c16 に分かれたプールでも、canDraw は true で draw は通る (会社が両方を持つことを求めない)', () => {
    for (const d of BOTH) {
      const pool = buildPool(d, range(1, 16), (c) =>
        c <= 8
          ? [
              { tag: 't1', kind: 'K1', tier: 1 as const },
              { tag: 't2', kind: 'K2', tier: 2 as const },
              { tag: 't3', kind: 'K3', tier: 3 as const },
            ]
          : [{ tag: 'n' }],
      );
      expect(canDraw(pool, d)).toBe(true);
      for (const ratio of [0, 0.5, 1]) {
        for (const seed of seeds(500)) {
          const rs = run(pool, d, seed, { anomalyRatio: ratio });
          expect(rs).toHaveLength(8);
          expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
          for (const r of rs) expect(companyNumber(r) <= 8, `${r.problem.id}`).toBe(r.problem.anomaly !== null);
        }
      }
    }
  });

  it('DW25d: 異変の問題が全社とも段 3 だけでも、canDraw は true で draw は通る (累積の第 1 候補が空の枠は段を無視する)', () => {
    for (const d of BOTH) {
      const pool = buildPool(d, range(1, 10), () => [{ tag: 'n' }, { tag: 't3', kind: 'K3', tier: 3 as const }]);
      expect(canDraw(pool, d)).toBe(true);
      for (const ratio of [0, 0.5, 1]) for (const seed of seeds(200)) expect(run(pool, d, seed, { anomalyRatio: ratio })).toHaveLength(8);
    }
  });
});

describe('種類の出方 (R-S6 の置き換え)', () => {
  const memo = new Map<string, SimResult>();
  const measure = (name: string, pool: Problem[], d: Difficulty, o: SimOptions): SimResult => {
    const key = `${name}/${d}/${JSON.stringify(o)}`;
    if (!memo.has(key)) memo.set(key, simulate(pool, d, o));
    return memo.get(key)!;
  };
  const recommended = (d: Difficulty, o: SimOptions): SimResult => measure('recommended', makeRecommendedPool(d), d, o);
  const LAPS = 10_000;
  const LONG = 120_000; // テストの時間切れ (ms)

  it('DW26: 1 万周で、異変の枠の割合は 0.5 ± 1.5 ポイント', () => {
    for (const d of BOTH) {
      const r = recommended(d, { laps: LAPS });
      expect(r.slots).toBe(LAPS * 8);
      expect(Math.abs(r.anomalySlots / r.slots - 0.5)).toBeLessThanOrEqual(0.015);
    }
  }, LONG);

  it('DW27: 難易度のどの種類 ID も、1 万周の異変の枠のどこかで出る', () => {
    for (const d of BOTH) {
      const seen = new Set(recommended(d, { laps: LAPS }).kindCounts.flatMap((m) => [...m.keys()]));
      expect([...seen].sort()).toEqual(kindsOf(d).map((k) => k.id).sort());
    }
  }, LONG);

  it('DW28: 枠の群ごとに、最大の割合が一様の割合の 1.5 倍以内で、出る ID の集合が群の候補 (段が狙い以下) の集合と同じ', () => {
    for (const d of BOTH) {
      const checks = checkGroups(recommended(d, { laps: LAPS }), kindsOf(d));
      expect(checks).toHaveLength(GROUPS.length);
      checks.forEach((c, gi) => {
        expect(c.sameIds, `${d} 群 ${gi}: 候補 ${c.candidateIds.join()} / 出た ${c.seenIds.join()}`).toBe(true);
        expect(c.maxRatio, `${d} 群 ${gi}`).toBeLessThanOrEqual(1.5);
      });
      // 候補の ID の数: やさしい 10・13・15、むずかしい 8・15・20
      expect(checks.map((c) => c.candidateIds.length)).toEqual(d === 'easy' ? [10, 13, 15] : [8, 15, 20]);
    }
  }, LONG);

  it('DW29: 履歴と見つけた種類を引き継いで 1 万周 (全問正解) しても、DW26〜DW28 と同じ幅に収まる', () => {
    for (const d of BOTH) {
      const r = recommended(d, { laps: LAPS, carry: true });
      expect(Math.abs(r.anomalySlots / r.slots - 0.5)).toBeLessThanOrEqual(0.015);
      const seen = new Set(r.kindCounts.flatMap((m) => [...m.keys()]));
      expect([...seen].sort()).toEqual(kindsOf(d).map((k) => k.id).sort());
      checkGroups(r, kindsOf(d)).forEach((c, gi) => {
        expect(c.sameIds, `${d} 群 ${gi}`).toBe(true);
        expect(c.maxRatio, `${d} 群 ${gi}`).toBeLessThanOrEqual(1.5);
      });
    }
  }, LONG);

  it('DW29d: 遊び手が途中で落ちる遊び方 (各答え 0.85 で正解・3 万周・見た枠だけ数える) でも、群ごとに 1.5 倍以内', () => {
    for (const d of BOTH) {
      const r = recommended(d, { laps: 30_000, carry: true, accuracy: 0.85 });
      checkGroups(r, kindsOf(d)).forEach((c, gi) => expect(c.maxRatio, `${d} 群 ${gi}`).toBeLessThanOrEqual(1.5));
    }
  }, LONG);

  it('DW34: 会社から答えが漏れない — 履歴を引き継ぐ 3 万周 (各答え 0.85 で正解) で、「前の周で正常として出た会社」でもそれ以外でも、異変の枠の割合は 0.5 ± 2 ポイント', () => {
    for (const d of BOTH) {
      const r = recommended(d, { laps: 30_000, carry: true, accuracy: 0.85 });
      const p = (b: { anomaly: number; total: number }): number => b.anomaly / b.total;
      expect(r.afterNormal.total, `${d}: 前の周で正常だった会社の枠の数 (標準誤差が小さいだけ)`).toBeGreaterThan(20_000);
      expect(Math.abs(p(r.afterNormal) - 0.5), `${d}: 前の周で正常だった会社 ${p(r.afterNormal).toFixed(3)}`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(p(r.others) - 0.5), `${d}: それ以外 ${p(r.others).toFixed(3)}`).toBeLessThanOrEqual(0.02);
    }
  }, LONG);

  it('DW29b: 偏ったプールでは、検査 (R-S6 (c)) がどれかの群で 1.5 倍超を返す (検査が偏りを見逃さない)', () => {
    for (const d of BOTH) {
      const checks = checkGroups(measure('uneven', makeUnevenPool(d), d, { laps: LAPS }), kindsOf(d));
      expect(Math.max(...checks.map((c) => c.maxRatio)), d).toBeGreaterThan(1.5);
    }
  }, LONG);

  describe('DW29c: 推奨のプールの構成 (試験用の道具の確かめ)', () => {
    const design = readFileSync(fileURLToPath(new URL('../../docs/design-v3.md', import.meta.url)), 'utf-8');

    it('問題の数・正常は各社 1 問で段なし・種類ごとの数・会社への散らし方', () => {
      for (const d of BOTH) {
        const pool = makeRecommendedPool(d);
        expect(pool).toHaveLength(d === 'easy' ? 85 : 132);
        const normals = pool.filter((p) => p.anomaly === null);
        expect(normals.map((p) => p.companyId).sort()).toEqual(range(1, 10).map((c) => `c${String(c).padStart(2, '0')}`));
        expect(normals.every((p) => p.tier === undefined)).toBe(true);
        for (const k of kindsOf(d)) {
          const of = pool.filter((p) => p.anomaly?.kind === k.id);
          expect(of, k.id).toHaveLength(k.count);
          expect(new Set(of.map((p) => p.companyId)).size, `${k.id} は 1 社に 1 問以下`).toBe(k.count);
          expect(of.every((p) => p.tier === k.tier)).toBe(true);
        }
        for (const tier of [1, 2, 3]) {
          const perCompany = range(1, 10).map((c) => pool.filter((p) => p.tier === tier && p.companyId === `c${String(c).padStart(2, '0')}`).length);
          expect(Math.max(...perCompany) - Math.min(...perCompany), `段 ${tier} の会社ごとの数 ${perCompany.join()}`).toBeLessThanOrEqual(1);
        }
      }
    });

    it('種類 ID と段は、設計 v3 §2.2・§2.3 の表と同じ。7 問の 11 種類は §2.3 の系統の 会計 5・資料間 6', () => {
      const rows = (from: string, to: string, prefix: string): [string, number][] => {
        const text = design.slice(design.indexOf(from), design.indexOf(to));
        return [...text.matchAll(new RegExp(`^\\| (${prefix}-\\d+) \\|.*\\| (\\d) \\|$`, 'gm'))].map((m) => [m[1]!, Number(m[2])]);
      };
      const easyRows = rows('### 2.2 ', '### 2.3 ', 'E');
      const hardRows = rows('### 2.3 ', '### 2.4 ', 'H');
      expect(easyRows).toHaveLength(15);
      expect(hardRows).toHaveLength(20);
      expect(EASY_KINDS.map((k) => [k.id, k.tier]).sort()).toEqual(easyRows.sort());
      expect(HARD_KINDS.map((k) => [k.id, k.tier]).sort()).toEqual(hardRows.sort());
      const m = /会計 5 \(([^)]*)\)、資料間 6 \(([^)]*)\)/.exec(design);
      expect(m).not.toBeNull();
      expect([...HARD_PRIMARY].sort()).toEqual([...(m![1]!.match(/H-\d+/g) ?? []), ...(m![2]!.match(/H-\d+/g) ?? [])].sort());
      // 段ごとの種類の数: やさしい 10・3・2、むずかしい 8・7・5
      const count = (ks: readonly { tier: number }[], t: number): number => ks.filter((k) => k.tier === t).length;
      expect([1, 2, 3].map((t) => count(EASY_KINDS, t))).toEqual([10, 3, 2]);
      expect([1, 2, 3].map((t) => count(HARD_KINDS, t))).toEqual([8, 7, 5]);
    });
  });
});
