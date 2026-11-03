// 記録 (P5)・答えた問題の履歴 (P3)・見本の済 (P0)。ブラウザ内 (localStorage) だけに保存する。更新は判定の書き込みと同時に 1 回だけ。
import { ROUNDS_TO_CLEAR } from './config';
import type { Answer } from './answer';
import type { GameState } from './game';
import { type KeyValueStore, safeGet, safeSet } from './storage';
import type { Difficulty, Problem } from './types';

export type { KeyValueStore } from './storage';
export const RECORDS_KEY = 'kessan8.records';
export const RECORDS_VERSION = 1;

export interface DifficultyRecord {
  /** 最高の到達社数 (`round + 1` の最大)。 */
  best: number;
  clears: number;
  /** 「異変あり」と正しく判定した問題の異変の種類 ID (重複なし)。見逃して答え合わせで見ただけの種類は入れない。 */
  kinds: string[];
  /** 答えた問題 ID。古い順。同じ ID を再び答えると末尾に移る (重複なし)。 */
  history: string[];
}
export interface Records {
  easy: DifficultyRecord;
  hard: DifficultyRecord;
  /** 見本の済。難易度ごとに数える (見本のファイルは共有)。 */
  sampleSeen: Record<Difficulty, boolean>;
}

const emptyDifficulty = (): DifficultyRecord => ({ best: 0, clears: 0, kinds: [], history: [] });
export const emptyRecords = (): Records => ({ easy: emptyDifficulty(), hard: emptyDifficulty(), sampleSeen: { easy: false, hard: false } });

export interface AnswerEvent {
  difficulty: Difficulty;
  /** 0 始まり。 */
  round: number;
  problem: Problem;
  answer: Answer;
  correct: boolean;
}

export function recordAnswer(rec: Records, e: AnswerEvent): Records {
  const d = rec[e.difficulty];
  const kind = e.problem.anomaly && e.answer === 'anomaly' ? e.problem.anomaly.kind : undefined;
  const next: DifficultyRecord = {
    best: Math.max(d.best, e.round + 1),
    clears: d.clears + (e.correct && e.round + 1 >= ROUNDS_TO_CLEAR ? 1 : 0),
    kinds: kind !== undefined && !d.kinds.includes(kind) ? [...d.kinds, kind] : d.kinds,
    history: [...d.history.filter((id) => id !== e.problem.id), e.problem.id],
  };
  return { ...rec, [e.difficulty]: next };
}

/** 状態の遷移 1 回につき、記録を更新する。更新するのは reading → revealed (判定の書き込み) だけ。それ以外は同じ値を返す。 */
export function recordTransition(rec: Records, prev: GameState, next: GameState): Records {
  if (prev.phase !== 'reading' || next.phase !== 'revealed') return rec;
  const problem = prev.problems[prev.round];
  if (!problem) return rec;
  return recordAnswer(rec, { difficulty: prev.difficulty, round: prev.round, problem, answer: next.answer, correct: next.correct });
}

export function markSampleSeen(rec: Records, difficulty: Difficulty): Records {
  return { ...rec, sampleSeen: { ...rec.sampleSeen, [difficulty]: true } };
}

const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

function parseDifficulty(x: unknown): DifficultyRecord | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const v = x as Record<string, unknown>;
  return isCount(v.best) && isCount(v.clears) && isStrings(v.kinds) && isStrings(v.history)
    ? { best: v.best, clears: v.clears, kinds: v.kinds, history: v.history }
    : undefined;
}

/** 壊れた値・版違い・形の違う値は、空の記録 (例外にしない)。 */
export function parseRecords(raw: string | null): Records {
  if (raw === null) return emptyRecords();
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return emptyRecords();
    const o = v as Record<string, unknown>;
    const easy = parseDifficulty(o.easy);
    const hard = parseDifficulty(o.hard);
    const seen = o.sampleSeen as Record<string, unknown> | undefined;
    if (o.version !== RECORDS_VERSION || !easy || !hard || typeof seen !== 'object' || seen === null) return emptyRecords();
    return { easy, hard, sampleSeen: { easy: seen.easy === true, hard: seen.hard === true } };
  } catch {
    return emptyRecords();
  }
}

export const stringifyRecords = (rec: Records): string => JSON.stringify({ version: RECORDS_VERSION, ...rec });

export function loadRecords(store: KeyValueStore): Records {
  return parseRecords(safeGet(store, RECORDS_KEY));
}

/** 書けたら true。 */
export function saveRecords(store: KeyValueStore, rec: Records): boolean {
  return safeSet(store, RECORDS_KEY, stringifyRecords(rec));
}
