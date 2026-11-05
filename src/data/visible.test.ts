// DW30〜DW32 (docs/test-cases/domain-v2.md §1.5)。本番の visible の配線。
import { describe, expect, it } from 'vitest';
import { canDraw, draw } from '../domain/draw';
import { mulberry32 } from '../domain/rng';
import type { Difficulty } from '../domain/types';
import { visibleShapes } from '../verifier/cards';
import { companies, kinds, pools, sample } from './index';
import { makeVisible } from './visible';

const all = [...pools.byDifficulty.easy, ...pools.byDifficulty.hard, ...(sample ? [sample.problem] : [])];
const companyOf = (id: string) => companies.find((c) => c.id === id)!;

describe('本番の visible (makeVisible)', () => {
  it('DW30: 本番のプールの全問と見本で、検証器の visibleShapes と同じ形。もう一度当てると同じ配列', () => {
    expect(all.length).toBeGreaterThan(0);
    const visible = makeVisible(companies, kinds);
    for (const p of all) {
      const shapes = visible(p);
      expect(shapes, p.id).toEqual(visibleShapes(p, companyOf(p.companyId), kinds));
      expect(visible(p)).toBe(shapes);
    }
  });

  it('DW31: 会社の一覧に無い companyId の問題は例外', () => {
    const p = { ...all[0]!, companyId: 'no-such-company' };
    expect(() => makeVisible(companies, kinds)(p)).toThrow(/会社が見つかりません/);
  });

  it('DW32: 本番のプール × makeVisible で、canDraw が true の難易度は draw が通り、各枠の形が見える', () => {
    const visible = makeVisible(companies, kinds);
    for (const d of ['easy', 'hard'] as Difficulty[]) {
      const pool = pools.byDifficulty[d];
      if (!canDraw(pool, d, visible)) continue; // データの Task (#139・#140) が R-S5 (a) を満たすと、この確かめが効き始める
      for (let seed = 1; seed <= 100; seed++) {
        const rounds = draw(pool, { difficulty: d, rng: mulberry32(seed), visible, anomalyRatio: 0.5 });
        expect(rounds).toHaveLength(8);
        for (const r of rounds) expect(visible(r.problem)).toContain(r.shape);
      }
    }
  });
});
