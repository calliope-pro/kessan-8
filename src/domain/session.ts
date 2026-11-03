// 走行 (状態の全体) の保存と読み出し (experience.md §6.6)。reduce の外。問題は ID だけを保存し、読み出すときに引く。
import { ROUNDS_TO_CLEAR } from './config';
import { isScreen, type GameState, type Run } from './game';
import { type KeyValueStore, safeGet, safeRemove, safeSet } from './storage';
import type { Difficulty, Problem } from './types';
import { IR_SLIDES, TANSHIN_SCREENS } from './types';
import type { ScreenRef } from './screen';

export type { KeyValueStore } from './storage';
export const SESSION_VERSION = 1;
export const RUN_KEY = 'kessan8.run';

export function serialize(state: GameState): string {
  const base = { version: SESSION_VERSION, phase: state.phase, draws: state.draws };
  switch (state.phase) {
    case 'title':
    case 'difficulty':
      return JSON.stringify(base);
    case 'cleared':
      return JSON.stringify({ ...base, difficulty: state.difficulty, problemIds: state.problems.map((p) => p.id) });
    case 'reading':
    case 'revealed': {
      const run = { difficulty: state.difficulty, problemIds: state.problems.map((p) => p.id), round: state.round, view: state.view, marks: state.marks };
      return JSON.stringify(state.phase === 'reading' ? { ...base, ...run } : { ...base, ...run, answer: state.answer, correct: state.correct });
    }
  }
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isDifficulty = (x: unknown): x is Difficulty => x === 'easy' || x === 'hard';
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

function isView(x: unknown): x is ScreenRef {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as { doc?: unknown; screen?: unknown };
  if (v.doc === 'tanshin') return (TANSHIN_SCREENS as readonly unknown[]).includes(v.screen);
  if (v.doc === 'ir') return (IR_SLIDES as readonly unknown[]).includes(v.screen);
  return false;
}

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
    case 'reading':
    case 'revealed': {
      if (!isDifficulty(v.difficulty) || !isStrings(v.problemIds) || v.problemIds.length !== ROUNDS_TO_CLEAR) return undefined;
      const problems: Problem[] = [];
      for (const id of v.problemIds) {
        const p = lookup(id);
        if (!p || p.difficulty !== v.difficulty) return undefined;
        problems.push(p);
      }
      if (v.phase === 'cleared') return { phase: 'cleared', draws, difficulty: v.difficulty, problems };
      if (!isInt(v.round) || v.round < 0 || v.round >= ROUNDS_TO_CLEAR || !isView(v.view) || !isStrings(v.marks)) return undefined;
      const run: Run = { draws, difficulty: v.difficulty, problems, round: v.round, view: v.view, marks: v.marks };
      if (v.phase === 'reading') return { phase: 'reading', ...run };
      if ((v.answer !== 'anomaly' && v.answer !== 'normal') || typeof v.correct !== 'boolean') return undefined;
      // 正誤は問題から決まる。食い違う値は捨てる
      if (v.correct !== ((v.answer === 'anomaly') === (problems[v.round]!.anomaly !== null))) return undefined;
      return { phase: 'revealed', ...run, answer: v.answer, correct: v.correct };
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

export { isScreen };
