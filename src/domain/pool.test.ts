// UP1・UP2 (docs/test-cases/flow.md §1.5b)
import { describe, expect, it } from 'vitest';
import { makeProblem } from '../testing/fixtures';
import { makePools } from './pool';

const e = (n: number) => makeProblem({ id: `e${n}`, difficulty: 'easy', companyId: `c${n}` });
const h = (n: number) => makeProblem({ id: `h${n}`, difficulty: 'hard', companyId: `c${n}` });

describe('プールの取り込み', () => {
  it('UP1: 難易度ごとに分かれ、元の並びを保ち、ID から引ける', () => {
    const pools = makePools([e(1), h(1), e(2), h(2), e(3)]);
    expect(pools.byDifficulty.easy.map((p) => p.id)).toEqual(['e1', 'e2', 'e3']);
    expect(pools.byDifficulty.hard.map((p) => p.id)).toEqual(['h1', 'h2']);
    expect(pools.byId('h2')?.id).toBe('h2');
    expect(pools.byId('zzz')).toBeUndefined();
  });

  it('UP2: 空の一覧は空のプール。同じ ID が 2 つあれば例外', () => {
    const empty = makePools([]);
    expect(empty.byDifficulty).toEqual({ easy: [], hard: [] });
    expect(() => makePools([e(1), e(1)])).toThrow();
  });
});
