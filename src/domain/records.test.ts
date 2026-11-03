// UC1〜UC9 (docs/test-cases/flow.md §1.5): 記録 (P5)・答えた履歴・見本の済
import { describe, expect, it } from 'vitest';
import { makeProblem } from '../testing/fixtures';
import { type GameState, initialState, reduce } from './game';
import { draw } from './draw';
import { makePool } from '../testing/fixtures';
import { mulberry32 } from './rng';
import { type KeyValueStore, emptyRecords, loadRecords, markSampleSeen, parseRecords, recordAnswer, recordTransition, saveRecords, stringifyRecords } from './records';

const anomaly = makeProblem({ id: 'a1', difficulty: 'easy', companyId: 'c01', kind: 'k-calc' });
const anomaly2 = makeProblem({ id: 'a2', difficulty: 'easy', companyId: 'c02', kind: 'k-cross' });
const normal = makeProblem({ id: 'n1', difficulty: 'easy', companyId: 'c03' });

const answer = (rec = emptyRecords(), o: Partial<Parameters<typeof recordAnswer>[1]> = {}) =>
  recordAnswer(rec, { difficulty: 'easy', round: 0, problem: normal, answer: 'normal', correct: true, ...o });

describe('記録', () => {
  it('UC1: 空の記録', () => {
    for (const d of ['easy', 'hard'] as const) expect(emptyRecords()[d]).toEqual({ best: 0, bestBefore: 0, clears: 0, kinds: [], history: [] });
  });

  it('UC2: やさしいの 3 社目 (round 2) で答えると、やさしいの最高到達が 3。むずかしいは変わらない', () => {
    const r = answer(emptyRecords(), { round: 2 });
    expect(r.easy.best).toBe(3);
    expect(r.hard).toEqual(emptyRecords().hard);
  });

  it('UC3: 8 社目 (round 7) に正解すると、クリア回数 + 1・最高到達 8。7 社目までの正解や不正解では増えない', () => {
    const r = answer(emptyRecords(), { round: 7, correct: true });
    expect(r.easy.clears).toBe(1);
    expect(r.easy.best).toBe(8);
    expect(answer(emptyRecords(), { round: 7, correct: false }).easy.clears).toBe(0);
    expect(answer(emptyRecords(), { round: 6, correct: true }).easy.clears).toBe(0);
  });

  it('UC10: bestBefore は、直前の判定の前の最高到達。往復し、無い古い値は 0', () => {
    let r = answer(emptyRecords(), { round: 2 });
    expect(r.easy).toMatchObject({ best: 3, bestBefore: 0 });
    r = answer(answer(emptyRecords(), { round: 4 }), { round: 1 });
    expect(r.easy).toMatchObject({ best: 5, bestBefore: 5 });
    expect(parseRecords(stringifyRecords(r)).easy.bestBefore).toBe(5);
    const old = JSON.parse(stringifyRecords(r)) as { easy: Record<string, unknown> };
    delete old.easy.bestBefore;
    expect(parseRecords(JSON.stringify(old)).easy.bestBefore).toBe(0);
  });

  it('UC4: 最高到達 5 のあとに 3 社目で答えても、5 のまま', () => {
    const r = answer(answer(emptyRecords(), { round: 4 }), { round: 2 });
    expect(r.easy.best).toBe(5);
  });

  it('UC5: 「異変あり」と正しく判定した問題の異変の種類だけが集合に入る (同じ ID は 1 つ)', () => {
    let r = answer(emptyRecords(), { problem: anomaly, answer: 'anomaly', correct: true });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: anomaly2, answer: 'normal', correct: false });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: normal, answer: 'anomaly', correct: false });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: anomaly, answer: 'anomaly', correct: true });
    expect(r.easy.kinds).toEqual(['k-calc']);
  });

  it('UC6: 答えた問題 ID の履歴は難易度ごとに古い順。再び答えると末尾に移る (重複しない)', () => {
    let r = answer(emptyRecords(), { problem: anomaly });
    r = answer(r, { problem: normal });
    r = answer(r, { problem: anomaly });
    expect(r.easy.history).toEqual(['n1', 'a1']);
    expect(r.hard.history).toEqual([]);
  });

  it('UC7: 壊れた JSON・形の違う値は空の記録 (例外にならない)', () => {
    for (const raw of ['{not json', '42', 'null', JSON.stringify({ version: 999 }), JSON.stringify({ version: 1, easy: 'x' }), null]) {
      expect(parseRecords(raw), String(raw)).toEqual(emptyRecords());
    }
  });

  it('UC7: 往復する', () => {
    const r = answer(emptyRecords(), { problem: anomaly, answer: 'anomaly', correct: true, round: 3 });
    expect(parseRecords(stringifyRecords(r))).toEqual(r);
  });

  it('UC8: reading → revealed の遷移 1 回につき記録は 1 回分だけ増える。ほかの遷移・同じ状態では増えない', () => {
    const pool = makePool({ difficulty: 'easy', companies: 12 });
    const eight = draw(pool, { difficulty: 'easy', rng: mulberry32(1) });
    const reading = reduce(reduce(initialState, { type: 'START' }), { type: 'PICK', difficulty: 'easy', problems: eight });
    const revealed = reduce(reading, { type: 'ANSWER', answer: 'anomaly' });
    const once = recordTransition(emptyRecords(), reading, revealed);
    expect(once.easy.history).toHaveLength(1);
    expect(once.easy.best).toBe(1);
    const viewed = reduce(revealed, { type: 'VIEW', view: { doc: 'ir', screen: 'outlook' } });
    expect(recordTransition(once, revealed, viewed)).toBe(once);
    const same: GameState = revealed;
    expect(recordTransition(once, same, same)).toBe(once);
  });

  it('UC9: 見本の済は難易度ごとに数える。壊れた値は両方未', () => {
    const r = markSampleSeen(emptyRecords(), 'easy');
    expect(r.sampleSeen).toEqual({ easy: true, hard: false });
    expect(parseRecords(stringifyRecords(r)).sampleSeen).toEqual({ easy: true, hard: false });
    expect(parseRecords('{not json').sampleSeen).toEqual({ easy: false, hard: false });
  });

  it('保存先の失敗: 読み出しは空の記録、書き込みは失敗を返す (例外にならない)', () => {
    const broken: KeyValueStore = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
    };
    expect(loadRecords(broken)).toEqual(emptyRecords());
    expect(saveRecords(broken, emptyRecords())).toBe(false);
  });
});
