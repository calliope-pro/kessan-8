// DC1〜DC10 (docs/test-cases/domain-v3.md §4): 記録 (P5)・答えた問題の履歴・見つけた種類。見本の済は持たない。
import { describe, expect, it } from 'vitest';
import { makeProblem } from '../testing/fixtures';
import { makeSmallPool } from '../testing/pool-v3';
import { draw } from './draw';
import { type GameState, initialState, reduce } from './game';
import { mulberry32 } from './rng';
import { RECORDS_VERSION, type KeyValueStore, emptyRecords, loadRecords, parseRecords, recordAnswer, recordTransition, saveRecords, stringifyRecords } from './records';

const anomaly = makeProblem({ id: 'a1', difficulty: 'easy', companyId: 'c01', kind: 'k-calc' });
const anomaly2 = makeProblem({ id: 'a2', difficulty: 'easy', companyId: 'c02', kind: 'k-cross' });
const normal = makeProblem({ id: 'n1', difficulty: 'easy', companyId: 'c03' });

const answer = (rec = emptyRecords(), o: Partial<Parameters<typeof recordAnswer>[1]> = {}) =>
  recordAnswer(rec, { difficulty: 'easy', round: 0, problem: normal, answer: 'normal', correct: true, ...o });

describe('記録', () => {
  it('DC1: 空の記録は難易度ごとに最高 0・bestBefore 0・クリア 0・種類は空・履歴は空。見本の済 (sampleSeen) は持たない', () => {
    for (const d of ['easy', 'hard'] as const) expect(emptyRecords()[d]).toEqual({ best: 0, bestBefore: 0, clears: 0, kinds: [], history: [] });
    expect(Object.keys(emptyRecords()).sort()).toEqual(['easy', 'hard']);
  });

  it('DC2: やさしいの 3 社目 (round 2) で答えると、やさしいの最高到達が 3。むずかしいは変わらない', () => {
    const r = answer(emptyRecords(), { round: 2 });
    expect(r.easy.best).toBe(3);
    expect(r.hard).toEqual(emptyRecords().hard);
  });

  it('DC3: 8 社目 (round 7) に正解すると、クリア回数 + 1・最高到達 8。7 社目までの正解や不正解では増えない', () => {
    const r = answer(emptyRecords(), { round: 7, correct: true });
    expect(r.easy.clears).toBe(1);
    expect(r.easy.best).toBe(8);
    expect(answer(emptyRecords(), { round: 7, correct: false }).easy.clears).toBe(0);
    expect(answer(emptyRecords(), { round: 6, correct: true }).easy.clears).toBe(0);
  });

  it('DC4: 最高到達 5 のあとに 3 社目で答えても、5 のまま。bestBefore は 5。往復し、無い古い値は 0', () => {
    const r = answer(answer(emptyRecords(), { round: 4 }), { round: 2 });
    expect(r.easy).toMatchObject({ best: 5, bestBefore: 5 });
    expect(answer(emptyRecords(), { round: 2 }).easy).toMatchObject({ best: 3, bestBefore: 0 });
    expect(parseRecords(stringifyRecords(r)).easy.bestBefore).toBe(5);
    const old = JSON.parse(stringifyRecords(r)) as { easy: Record<string, unknown> };
    delete old.easy.bestBefore;
    expect(parseRecords(JSON.stringify(old)).easy.bestBefore).toBe(0);
  });

  it('DC5: 「異変あり」と正しく判定した問題の異変の種類だけが集合に入る (同じ ID は 1 つ)', () => {
    let r = answer(emptyRecords(), { problem: anomaly, answer: 'anomaly', correct: true });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: anomaly2, answer: 'normal', correct: false });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: normal, answer: 'anomaly', correct: false });
    expect(r.easy.kinds).toEqual(['k-calc']);
    r = answer(r, { problem: anomaly, answer: 'anomaly', correct: true });
    expect(r.easy.kinds).toEqual(['k-calc']);
  });

  it('DC6: 答えた問題 ID の履歴は難易度ごとに古い順。再び答えると末尾に移る (重複しない)', () => {
    let r = answer(emptyRecords(), { problem: anomaly });
    r = answer(r, { problem: normal });
    r = answer(r, { problem: anomaly });
    expect(r.easy.history).toEqual(['n1', 'a1']);
    expect(r.hard.history).toEqual([]);
  });

  it('DC7: recordTransition は reading → revealed の 1 回につき 1 回分だけ増える (prev.rounds[round].problem で)。ほかの組は同じ値 (参照も同じ)', () => {
    const pool = makeSmallPool('easy', 12);
    const rounds = draw(pool, { difficulty: 'easy', rng: mulberry32(1) });
    const sample = reduce(reduce(initialState, { type: 'START' }), { type: 'PICK', difficulty: 'easy', rounds });
    const reading = reduce(sample, { type: 'BEGIN' });
    const truth = rounds[0]!.problem.anomaly !== null ? 'anomaly' : 'normal';
    const revealed = reduce(reading, { type: 'ANSWER', answer: truth }); // 正解 (NEXT で進める)
    const once = recordTransition(emptyRecords(), reading, revealed);
    expect(once.easy.history).toEqual([rounds[0]!.problem.id]);
    expect(once.easy.best).toBe(1);
    // 2 社目の判定は、2 社目の問題で数える
    const next = reduce(reduce(revealed, { type: 'NEXT' }), { type: 'ANSWER', answer: 'normal' });
    const reading2 = reduce(revealed, { type: 'NEXT' });
    expect(recordTransition(once, reading2, next).easy.history).toEqual([rounds[0]!.problem.id, rounds[1]!.problem.id]);
    // reading → revealed 以外の全組は同じ値
    const wrong = reduce(reading, { type: 'ANSWER', answer: truth === 'anomaly' ? 'normal' : 'anomaly' });
    const states: GameState[] = [initialState, reduce(initialState, { type: 'START' }), sample, reading, revealed, wrong, reduce(wrong, { type: 'RESTART', rounds }), reduce(wrong, { type: 'TO_TITLE' })];
    for (const a of states) {
      for (const b of states) {
        if (a.phase === 'reading' && b.phase === 'revealed') continue;
        expect(recordTransition(once, a, b), `${a.phase} → ${b.phase}`).toBe(once);
      }
    }
  });

  it('DC8: 記録の保存・読み出しの往復は元と同じ。保存する形に sampleSeen は無い', () => {
    const r = answer(emptyRecords(), { problem: anomaly, answer: 'anomaly', correct: true, round: 3 });
    expect(parseRecords(stringifyRecords(r))).toEqual(r);
    expect(stringifyRecords(r)).not.toContain('sampleSeen');
    expect(RECORDS_VERSION).toBe(2);
  });

  it('DC9: 壊れた JSON・形の違う値・版 1 (今の版。sampleSeen を持つ)・null は空の記録 (例外にならない)', () => {
    // 空でない版 1 の記録 (best・clears・kinds・history がある): 「捨てる」と「読む」を区別できるように
    const filled = { best: 5, bestBefore: 3, clears: 1, kinds: ['E-06'], history: ['easy-001'] };
    const v1 = { version: 1, easy: filled, hard: filled, sampleSeen: { easy: true, hard: false } };
    for (const raw of ['{not json', '42', 'null', JSON.stringify({ version: 999 }), JSON.stringify({ version: 2, easy: 'x' }), JSON.stringify(v1), null]) {
      expect(parseRecords(raw), String(raw)).toEqual(emptyRecords());
    }
  });

  it('DC10: 保存先が例外を投げても、読み出しは空の記録・書き込みは失敗を返す (例外にならない)', () => {
    const broken: KeyValueStore = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
    };
    expect(loadRecords(broken)).toEqual(emptyRecords());
    expect(saveRecords(broken, emptyRecords())).toBe(false);
  });
});
