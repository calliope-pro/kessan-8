// UR1〜UR3 (docs/test-cases/flow.md §1.1)
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';

const take = (r: () => number, n: number) => Array.from({ length: n }, r);

describe('種つきの乱数', () => {
  it('UR1: 同じ種なら同じ並び', () => {
    expect(take(mulberry32(7), 5)).toEqual(take(mulberry32(7), 5));
  });

  it('UR2: 種が違えば並びが違う', () => {
    expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5));
  });

  it('UR3: 0 以上 1 未満で、平均がほぼ 0.5', () => {
    const xs = take(mulberry32(1), 1000);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThanOrEqual(0.45);
    expect(mean).toBeLessThanOrEqual(0.55);
  });
});
