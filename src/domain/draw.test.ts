// UD1〜UD12 (docs/test-cases/flow.md §1.2)
import { describe, expect, it } from 'vitest';
import { makePool } from '../testing/fixtures';
import { TIER_BY_ROUND } from './config';
import { draw } from './draw';
import { mulberry32 } from './rng';
import type { Problem } from './types';

const pool72 = makePool({ difficulty: 'easy', companies: 12 });
const pool24 = makePool({ difficulty: 'easy', companies: 12, tiers: null });
const run = (pool: Problem[], seed: number, extra: Partial<Parameters<typeof draw>[1]> = {}) =>
  draw(pool, { difficulty: 'easy', rng: mulberry32(seed), ...extra });
const anomalyCount = (ps: Problem[]) => ps.filter((p) => p.anomaly !== null).length;
const ids = (ps: Problem[]) => ps.map((p) => p.id);
const anomalyIds = (pool: Problem[]) => pool.filter((p) => p.anomaly !== null).map((p) => p.id);

describe('出題 draw', () => {
  it('UD1: 毎回 8 問で、問題も会社も重複せず、その難易度の問題だけ', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ps = run(pool72, seed);
      expect(ps).toHaveLength(8);
      expect(new Set(ids(ps)).size).toBe(8);
      expect(new Set(ps.map((p) => p.companyId)).size).toBe(8);
      expect(ps.every((p) => p.difficulty === 'easy')).toBe(true);
    }
  });

  it('UD2: 同じ種・同じ履歴なら同じ並び。種が違えば散らばる', () => {
    expect(ids(run(pool72, 5, { history: ['easy-1-a-1'] }))).toEqual(ids(run(pool72, 5, { history: ['easy-1-a-1'] })));
    const distinct = new Set(Array.from({ length: 50 }, (_, i) => ids(run(pool72, i + 1)).join(',')));
    expect(distinct.size).toBeGreaterThanOrEqual(40);
  });

  it('UD3: 比 0.5 のとき、異変ありの枠の数は枠ごとに独立 (平均 4 前後、4 以外の回もある)', () => {
    const counts = Array.from({ length: 400 }, (_, i) => anomalyCount(run(pool72, i + 1, { anomalyRatio: 0.5 })));
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThanOrEqual(3.7);
    expect(mean).toBeLessThanOrEqual(4.3);
    expect(counts.some((c) => c !== 4)).toBe(true);
    expect(counts.some((c) => c >= 6)).toBe(true);
  });

  it('UD4: 比 0 はすべて異変なし、比 1 はすべて異変あり', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(anomalyCount(run(pool72, seed, { anomalyRatio: 0 }))).toBe(0);
      expect(anomalyCount(run(pool72, seed, { anomalyRatio: 1 }))).toBe(8);
    }
  });

  it('UD5: 枠 1・2 は段 1、3〜5 は段 2、6〜8 は段 3', () => {
    expect(TIER_BY_ROUND).toEqual([1, 1, 2, 2, 2, 3, 3, 3]);
    for (let seed = 1; seed <= 200; seed++) {
      const ps = run(pool72, seed);
      expect(ps.map((p) => p.tier)).toEqual([...TIER_BY_ROUND]);
    }
  });

  it('UD6: 段が足りない・段の項目が無いプールでも 8 問引ける', () => {
    expect(run(makePool({ difficulty: 'easy', companies: 12, tiers: [3] }), 1)).toHaveLength(8);
    expect(run(pool24, 1)).toHaveLength(8);
  });

  it('UD7: 両方を持つ会社が 7 社のプールは例外', () => {
    const pool = makePool({ difficulty: 'easy', companies: 12, sides: (c) => (c <= 7 ? ['normal', 'anomaly'] : ['normal']) });
    expect(() => run(pool, 1)).toThrow();
  });

  it('UD8: 両方を持つ会社がちょうど 8 社なら、毎回 8 社がすべて違う', () => {
    const pool = makePool({ difficulty: 'easy', companies: 12, sides: (c) => (c <= 8 ? ['normal', 'anomaly'] : ['normal']) });
    for (let seed = 1; seed <= 100; seed++) {
      const ps = run(pool, seed);
      expect(ps).toHaveLength(8);
      expect(new Set(ps.map((p) => p.companyId)).size).toBe(8);
    }
  });

  it('UD9: 72 問のプールで全枠が異変ありのとき、履歴の 6 問は 1 問も引かれない', () => {
    const history = anomalyIds(pool72).slice(0, 6);
    for (let seed = 1; seed <= 50; seed++) {
      const got = ids(run(pool72, seed, { anomalyRatio: 1, history }));
      expect(got.filter((id) => history.includes(id))).toEqual([]);
    }
  });

  it('UD9b: 異変ありが 1 社 1 問の 24 問では、履歴の 6 問のうちちょうど 2 問が補われる', () => {
    const history = anomalyIds(pool24).slice(0, 6);
    for (let seed = 1; seed <= 50; seed++) {
      const got = ids(run(pool24, seed, { anomalyRatio: 1, history }));
      expect(got.filter((id) => history.includes(id))).toHaveLength(2);
    }
  });

  it('UD10: 異変ありの 12 問すべてが履歴にあるとき、履歴の古いほうから 8 問', () => {
    const history = anomalyIds(pool24);
    for (let seed = 1; seed <= 50; seed++) {
      expect(ids(run(pool24, seed, { anomalyRatio: 1, history })).sort()).toEqual(history.slice(0, 8).sort());
    }
  });

  it('UD10b: 72 問で履歴が異変あり 36 問すべてのとき、各枠の段の中で履歴の古いほう (同じ会社が重ならない範囲)', () => {
    // 履歴の古い順: 段 1 の会社 1〜12、段 2 の会社 1〜12、段 3 の会社 1〜12
    const history = [1, 2, 3].flatMap((tier) => Array.from({ length: 12 }, (_, i) => `easy-${i + 1}-a-${tier}`));
    for (let seed = 1; seed <= 50; seed++) {
      expect(ids(run(pool72, seed, { anomalyRatio: 1, history }))).toEqual([
        'easy-1-a-1', 'easy-2-a-1', 'easy-3-a-2', 'easy-4-a-2', 'easy-5-a-2', 'easy-6-a-3', 'easy-7-a-3', 'easy-8-a-3',
      ]);
    }
  });

  it('UD11: 履歴にプールに無い ID が混じっても出題できる', () => {
    expect(run(pool72, 1, { history: ['no-such-id', 'easy-1-a-1'] })).toHaveLength(8);
  });

  it('UD12: 難易度の違う問題が混じっていても、指定した難易度だけから引く', () => {
    const mixed = [...pool72, ...makePool({ difficulty: 'hard', companies: 12 })];
    for (let seed = 1; seed <= 20; seed++) {
      expect(draw(mixed, { difficulty: 'hard', rng: mulberry32(seed) }).every((p) => p.difficulty === 'hard')).toBe(true);
    }
  });
});
