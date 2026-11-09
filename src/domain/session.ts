// 走行 (状態の全体) の保存と読み出し (docs/design-v2.md §3.3。ケース表 docs/test-cases/domain-v3.md §3)。reduce の外。
// 問題は ID だけを保存し、読み出すときに引く。版違い・壊れた値は捨てる。
import { ROUNDS_TO_CLEAR } from './config';
import type { GameState, Reading, Revealed } from './game';
import { type KeyValueStore, safeGet, safeRemove, safeSet } from './storage';
import type { Difficulty, Problem, Round } from './types';

export type { KeyValueStore } from './storage';
/** 2 = 枠が問題だけ (形を持たない) の最初の形式。今の版 (1) は捨てる。 */
export const SESSION_VERSION = 2;
export const RUN_KEY = 'kessan8.run';

const ids = (rounds: Round[]): string[] => rounds.map((r) => r.problem.id);

export function serialize(state: GameState): string {
  const base = { version: SESSION_VERSION, phase: state.phase, draws: state.draws };
  switch (state.phase) {
    case 'title':
    case 'difficulty':
      return JSON.stringify(base);
    case 'cleared':
      return JSON.stringify({ ...base, difficulty: state.difficulty, problemIds: ids(state.rounds) });
    case 'sample':
      return JSON.stringify({ ...base, difficulty: state.difficulty, problemIds: ids(state.rounds), ...(state.missed ? { missedId: state.missed.problem.id } : {}) });
    case 'reading':
    case 'revealed': {
      const run = { difficulty: state.difficulty, problemIds: ids(state.rounds), round: state.round };
      return JSON.stringify(state.phase === 'reading' ? { ...base, ...run } : { ...base, ...run, answer: state.answer, correct: state.correct });
    }
  }
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isDifficulty = (x: unknown): x is Difficulty => x === 'easy' || x === 'hard';
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

/** 読み出す。壊れた値・版違い・存在しない問題 ID・範囲外・形の違う値は捨てて undefined (例外にしない)。 */
export function hydrate(raw: unknown, lookup: (id: string) => Problem | undefined): GameState | undefined {
  if (typeof raw !== 'string') return undefined;
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    v = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (v.version !== SESSION_VERSION || !isInt(v.draws) || v.draws < 0) return undefined;
  const draws = v.draws;
  switch (v.phase) {
    case 'title':
      return { phase: 'title', draws };
    case 'difficulty':
      return { phase: 'difficulty', draws };
    case 'cleared':
    case 'sample':
    case 'reading':
    case 'revealed': {
      if (!isDifficulty(v.difficulty) || !isStrings(v.problemIds) || v.problemIds.length !== ROUNDS_TO_CLEAR) return undefined;
      const rounds: Round[] = [];
      for (const id of v.problemIds) {
        const p = lookup(id);
        if (!p || p.difficulty !== v.difficulty) return undefined;
        rounds.push({ problem: p });
      }
      if (v.phase === 'cleared') return { phase: 'cleared', draws, difficulty: v.difficulty, rounds };
      if (v.phase === 'sample') {
        if (v.missedId === undefined) return { phase: 'sample', draws, difficulty: v.difficulty, rounds };
        const missed = typeof v.missedId === 'string' ? lookup(v.missedId) : undefined;
        return missed ? { phase: 'sample', draws, difficulty: v.difficulty, rounds, missed: { problem: missed } } : undefined;
      }
      if (!isInt(v.round) || v.round < 0 || v.round >= ROUNDS_TO_CLEAR) return undefined;
      const run = { draws, difficulty: v.difficulty, rounds, round: v.round };
      if (v.phase === 'reading') return { phase: 'reading', ...run } satisfies Reading;
      if ((v.answer !== 'anomaly' && v.answer !== 'normal') || typeof v.correct !== 'boolean') return undefined;
      // 正誤は問題から決まる。食い違う値は捨てる
      if (v.correct !== ((v.answer === 'anomaly') === (rounds[v.round]!.problem.anomaly !== null))) return undefined;
      return { phase: 'revealed', ...run, answer: v.answer, correct: v.correct } satisfies Revealed;
    }
    default:
      return undefined;
  }
}

export function loadState(store: KeyValueStore, lookup: (id: string) => Problem | undefined): GameState | undefined {
  return hydrate(safeGet(store, RUN_KEY), lookup);
}

/** 書けたら true。 */
export function saveState(store: KeyValueStore, state: GameState): boolean {
  return safeSet(store, RUN_KEY, serialize(state));
}

export function clearState(store: KeyValueStore): void {
  safeRemove(store, RUN_KEY);
}
