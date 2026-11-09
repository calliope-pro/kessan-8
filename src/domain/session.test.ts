// DP1〜DP6 (docs/test-cases/domain-v3.md §3): 走行 (状態の全体) の保存と読み出し。問題は ID だけを保存する。
import { describe, expect, it } from 'vitest';
import { makeSmallPool } from '../testing/pool-v3';
import { draw } from './draw';
import { type GameState, initialState, reduce } from './game';
import { mulberry32 } from './rng';
import { SESSION_VERSION, type KeyValueStore, clearState, hydrate, loadState, saveState, serialize } from './session';
import type { Problem } from './types';

const pool = makeSmallPool('easy', 12);
const byId = new Map(pool.map((p) => [p.id, p]));
const lookup = (id: string): Problem | undefined => byId.get(id);
const eight = draw(pool, { difficulty: 'easy', rng: mulberry32(1) });
const second = draw(pool, { difficulty: 'easy', rng: mulberry32(2) });

const difficulty = reduce(initialState, { type: 'START' });
const sample = reduce(difficulty, { type: 'PICK', difficulty: 'easy', rounds: eight });
const reading = reduce(sample, { type: 'BEGIN' });
const answerFor = (correct: boolean) => ({ type: 'ANSWER', answer: (eight[0]!.problem.anomaly !== null) === correct ? 'anomaly' : 'normal' }) as const;
const revealedOk = reduce(reading, answerFor(true));
const revealedNg = reduce(reading, answerFor(false));
const sampleMissed = reduce(revealedNg, { type: 'RESTART', rounds: second });
const cleared: GameState = { phase: 'cleared', difficulty: 'easy', draws: 3, rounds: eight };

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const broken: KeyValueStore = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
};
const json = (s: GameState): Record<string, unknown> => JSON.parse(serialize(s)) as Record<string, unknown>;

describe('走行の保存', () => {
  it('DP1: 各状態を保存して読み出すと、元と同じ (sample は sample のまま・missed も往復する)', () => {
    const states: GameState[] = [initialState, difficulty, sample, sampleMissed, reading, revealedOk, revealedNg, cleared];
    for (const s of states) expect(hydrate(serialize(s), lookup), `${s.phase}${'missed' in s ? '(missed)' : ''}`).toEqual(s);
    expect(hydrate(serialize(sample), lookup)?.phase).toBe('sample'); // 0 社目で再読み込みしてもタイトルに戻らない
    expect(SESSION_VERSION).toBe(2);
  });

  it('DP2: 保存した文字列は問題の本体を含まない (ID だけ。reading で 1 KiB 未満)', () => {
    for (const s of [sample, sampleMissed, reading, revealedNg, cleared]) {
      expect(serialize(s).length).toBeLessThan(1024);
      expect(serialize(s)).not.toContain('companyName');
    }
    expect(json(reading).problemIds).toEqual(eight.map((r) => r.problem.id));
  });

  it('DP3: 壊れた値・版違い (今の版 = 1)・存在しない ID・範囲外・形の違う値は捨てる (例外にならない)', () => {
    const good = json(revealedOk);
    const missed = json(sampleMissed);
    const ids = good.problemIds as string[];
    const bad: [string, unknown][] = [
      ['壊れた JSON', '{not json'],
      ['版 1 (今の版。view・marks を持つ形)', JSON.stringify({ ...good, version: 1, view: { doc: 'tanshin', screen: 'summary' }, marks: [] })],
      ['版違い', JSON.stringify({ ...good, version: 999 })],
      ['存在しない問題 ID', JSON.stringify({ ...good, problemIds: ['no-such-id', ...ids.slice(1)] })],
      ['round が 8', JSON.stringify({ ...good, round: 8 })],
      ['round が -1', JSON.stringify({ ...good, round: -1 })],
      ['枠が 7', JSON.stringify({ ...good, problemIds: ids.slice(0, 7) })],
      ['枠が 9', JSON.stringify({ ...good, problemIds: [...ids, ids[0]] })],
      ['枠が ID の文字列でない (形を持つ v2 の形式)', JSON.stringify({ ...good, problemIds: ids.map((problemId) => ({ problemId, shape: 'E1' })) })],
      ['枠が無い', JSON.stringify({ ...good, problemIds: undefined })],
      ['問題の難易度が保存の難易度と違う', JSON.stringify({ ...good, difficulty: 'hard' })],
      ['phase が不明', JSON.stringify({ ...good, phase: 'unknown' })],
      ['revealed なのに答えが無い', JSON.stringify({ ...good, answer: undefined })],
      ['正誤が問題と食い違う', JSON.stringify({ ...good, correct: !good.correct })],
      ['sample の missed の問題 ID が存在しない', JSON.stringify({ ...missed, missedId: 'no-such-id' })],
      ['sample の missed が文字列でない', JSON.stringify({ ...missed, missedId: { problemId: ids[0], shape: 'E1' } })],
      ['draws が負', JSON.stringify({ ...good, draws: -1 })],
      ['draws が小数', JSON.stringify({ ...good, draws: 1.5 })],
      ['null (文字列)', 'null'],
      ['42 (文字列)', '42'],
      ['null', null],
      ['数値', 42],
      ['undefined', undefined],
    ];
    for (const [name, raw] of bad) expect(hydrate(raw, lookup), name).toBeUndefined();
  });

  it('DP4: 保存先が例外を投げても、読み出しは無し・書き込みは失敗を返し、例外を出さない', () => {
    expect(loadState(broken, lookup)).toBeUndefined();
    expect(saveState(broken, reading)).toBe(false);
    expect(() => clearState(broken)).not.toThrow();
  });

  it('DP5: 保存した reading を読み出して ANSWER を渡すと、保存前と同じ結果 (再読み込みしても同じ枠を判定する)', () => {
    const restored = hydrate(serialize(reading), lookup)!;
    for (const answer of ['anomaly', 'normal'] as const) expect(reduce(restored, { type: 'ANSWER', answer })).toEqual(reduce(reading, { type: 'ANSWER', answer }));
  });

  it('DP6: 不正解の revealed を保存して読み出すと revealed (不正解) のまま。受け付けるのは RESTART・TO_DIFFICULTY・TO_TITLE だけ (ANSWER は ignored)', () => {
    const store = memoryStore();
    expect(saveState(store, revealedNg)).toBe(true);
    const restored = loadState(store, lookup)!;
    expect(restored).toEqual(revealedNg);
    expect(restored.phase).toBe('revealed');
    expect(reduce(restored, { type: 'ANSWER', answer: 'anomaly' })).toBe(restored);
    expect(reduce(restored, { type: 'RESTART', rounds: second }).phase).toBe('sample');
    expect(reduce(restored, { type: 'TO_DIFFICULTY' }).phase).toBe('difficulty');
    expect(reduce(restored, { type: 'TO_TITLE' }).phase).toBe('title');
    clearState(store);
    expect(loadState(store, lookup)).toBeUndefined();
  });
});
