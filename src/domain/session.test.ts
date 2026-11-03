// US1〜US4 (docs/test-cases/flow.md §1.5): 走行 (状態の全体) の保存と読み出し
import { describe, expect, it } from 'vitest';
import { makePool } from '../testing/fixtures';
import { draw } from './draw';
import { type GameState, initialState, reduce } from './game';
import { mulberry32 } from './rng';
import { type KeyValueStore, clearState, hydrate, loadState, saveState, serialize } from './session';
import type { Problem } from './types';

const pool = makePool({ difficulty: 'easy', companies: 12 });
const byId = new Map(pool.map((p) => [p.id, p]));
const lookup = (id: string): Problem | undefined => byId.get(id);
const eight = draw(pool, { difficulty: 'easy', rng: mulberry32(1) });

const difficulty = reduce(initialState, { type: 'START' });
const reading = reduce(difficulty, { type: 'PICK', difficulty: 'easy', problems: eight });
const marked = reduce(reading, { type: 'TOGGLE_MARK', key: 'tanshin.summary.netSales.current' });
const answerFor = (correct: boolean) => ({ type: 'ANSWER', answer: (eight[0]!.anomaly !== null) === correct ? 'anomaly' : 'normal' }) as const;
const revealedOk = reduce(marked, answerFor(true));
const revealedNg = reduce(marked, answerFor(false));
function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const broken: KeyValueStore = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
};

describe('走行の保存', () => {
  it('US1: 各状態を保存して読み出すと、元と同じ', () => {
    const states: GameState[] = [initialState, difficulty, reading, marked, revealedOk, revealedNg];
    for (const s of states) expect(hydrate(serialize(s), lookup), s.phase).toEqual(s);
  });

  it('US1: cleared も往復する', () => {
    const c: GameState = { phase: 'cleared', difficulty: 'easy', draws: 3, problems: eight };
    expect(hydrate(serialize(c), lookup)).toEqual(c);
    const bad = JSON.parse(serialize(c)) as Record<string, unknown>;
    expect(hydrate(JSON.stringify({ ...bad, problemIds: (bad.problemIds as string[]).slice(0, 7) }), lookup)).toBeUndefined();
    expect(hydrate(JSON.stringify({ ...bad, problemIds: ['no-such-id', ...(bad.problemIds as string[]).slice(1)] }), lookup)).toBeUndefined();
    expect(hydrate(JSON.stringify({ ...bad, problemIds: undefined }), lookup)).toBeUndefined();
  });

  it('US2: 保存した文字列は問題の本体を含まない (reading で 2 KiB 未満)', () => {
    expect(serialize(reading).length).toBeLessThan(2048);
    expect(serialize(reading)).not.toContain('companyName');
  });

  it('US3: 壊れた値・版違い・存在しない ID・範囲外は捨てる (例外にならない)', () => {
    const good = JSON.parse(serialize(revealedOk)) as Record<string, unknown>;
    const bad: unknown[] = [
      '{not json',
      JSON.stringify({ ...good, version: 999 }),
      JSON.stringify({ ...good, problemIds: ['no-such-id', ...(good.problemIds as string[]).slice(1)] }),
      JSON.stringify({ ...good, round: 8 }),
      JSON.stringify({ ...good, round: -1 }),
      JSON.stringify({ ...good, problemIds: (good.problemIds as string[]).slice(0, 7) }),
      JSON.stringify({ ...good, phase: 'unknown' }),
      JSON.stringify({ ...good, answer: undefined }),
      JSON.stringify({ ...good, draws: -1 }),
      JSON.stringify({ ...good, draws: 1.5 }),
      'null',
      '42',
      null,
      42,
      undefined,
    ];
    for (const raw of bad) expect(hydrate(raw, lookup), String(raw)).toBeUndefined();
  });

  it('US4: 保存先が例外を投げても、読み出しは無し・書き込みは失敗を返し、例外を出さない', () => {
    expect(loadState(broken, lookup)).toBeUndefined();
    expect(saveState(broken, reading)).toBe(false);
    expect(() => clearState(broken)).not.toThrow();
  });

  it('保存先に書いて読む往復・捨てる', () => {
    const store = memoryStore();
    expect(saveState(store, revealedNg)).toBe(true);
    expect(loadState(store, lookup)).toEqual(revealedNg);
    clearState(store);
    expect(loadState(store, lookup)).toBeUndefined();
  });
});
