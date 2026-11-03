// 問題の一覧から、難易度ごとのプールと ID の引き出しを作る (src/data/index.ts の純粋な部分)。
import type { Difficulty, Problem } from './types';

export interface Pools {
  byDifficulty: Record<Difficulty, Problem[]>;
  byId(id: string): Problem | undefined;
}

export function makePools(problems: readonly Problem[]): Pools {
  const byDifficulty: Record<Difficulty, Problem[]> = { easy: [], hard: [] };
  const index = new Map<string, Problem>();
  for (const p of problems) {
    if (index.has(p.id)) throw new Error(`問題 ID が重複しています: ${p.id}`);
    index.set(p.id, p);
    byDifficulty[p.difficulty].push(p);
  }
  return { byDifficulty, byId: (id) => index.get(id) };
}
