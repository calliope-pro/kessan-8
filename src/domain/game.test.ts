// DT1〜DT19 (docs/test-cases/domain-v3.md §2): 状態遷移 reduce。0 社目 (sample)・BEGIN・枠は問題だけ・間違えたら 0 社目へ。
import { describe, expect, it } from 'vitest';
import { makeSmallPool } from '../testing/pool-v3';
import { draw } from './draw';
import { type Action, type GameState, initialState, reduce } from './game';
import { mulberry32 } from './rng';
import type { Difficulty, Round } from './types';

const pools: Record<Difficulty, ReturnType<typeof makeSmallPool>> = { easy: makeSmallPool('easy', 12), hard: makeSmallPool('hard', 12) };
const eight = (seed: number, d: Difficulty = 'easy'): Round[] => draw(pools[d], { difficulty: d, rng: mulberry32(seed) });

type Of<P extends GameState['phase']> = Extract<GameState, { phase: P }>;
const apply = (s: GameState, ...actions: Action[]): GameState => actions.reduce(reduce, s);
const difficulty = (): GameState => reduce(initialState, { type: 'START' });
/** sample (0 社目。missed なし)。 */
const sample = (seed = 1): GameState => reduce(difficulty(), { type: 'PICK', difficulty: 'easy', rounds: eight(seed) });
const reading = (seed = 1): GameState => reduce(sample(seed), { type: 'BEGIN' });
const answerOf = (s: GameState, correct: boolean): Action => {
  if (s.phase !== 'reading') throw new Error('reading ではない');
  const hasAnomaly = s.rounds[s.round]!.problem.anomaly !== null;
  return { type: 'ANSWER', answer: hasAnomaly === correct ? 'anomaly' : 'normal' };
};
const revealedCorrect = (s: GameState = reading()): GameState => reduce(s, answerOf(s, true));
const revealedWrong = (s: GameState = reading()): GameState => reduce(s, answerOf(s, false));
/** round 番目 (0 始まり) の reading。 */
const readingAt = (round: number, seed = 1): GameState => {
  let s = reading(seed);
  for (let i = 0; i < round; i++) s = reduce(revealedCorrect(s), { type: 'NEXT' });
  return s;
};
const cleared = (): GameState => reduce(revealedCorrect(readingAt(7)), { type: 'NEXT' });
/** 不正解のあと RESTART した 0 社目 (missed あり)。 */
const sampleWithMissed = (): GameState => reduce(revealedWrong(readingAt(2)), { type: 'RESTART', rounds: eight(2) });

const everyAction = (): Action[] => [
  { type: 'START' },
  { type: 'PICK', difficulty: 'hard', rounds: eight(9, 'hard') },
  { type: 'BEGIN' },
  { type: 'ANSWER', answer: 'anomaly' },
  { type: 'NEXT' },
  { type: 'RESTART', rounds: eight(9) },
  { type: 'TO_DIFFICULTY' },
  { type: 'TO_TITLE' },
  // 消えた action (型の外から渡す)
  { type: 'VIEW', view: { doc: 'ir', screen: 'outlook' } } as unknown as Action,
  { type: 'TOGGLE_MARK', key: 'tanshin.summary.netSales.current' } as unknown as Action,
];

// action × phase の受け付ける組み合わせ (docs/design-v2.md §3.2 の表)
const accepted: [string, GameState, string[]][] = [
  ['title', initialState, ['START']],
  ['difficulty', difficulty(), ['PICK', 'TO_TITLE']],
  ['sample (missed なし)', sample(), ['BEGIN', 'TO_TITLE']],
  ['sample (missed あり)', sampleWithMissed(), ['BEGIN', 'TO_TITLE']],
  ['reading', reading(), ['ANSWER', 'TO_TITLE']],
  ['revealed(正解)', revealedCorrect(), ['NEXT', 'TO_TITLE']],
  ['revealed(不正解)', revealedWrong(), ['RESTART', 'TO_DIFFICULTY', 'TO_TITLE']],
  ['cleared', cleared(), ['PICK', 'TO_DIFFICULTY', 'TO_TITLE']],
];

describe('状態遷移 reduce', () => {
  it('DT1: 受け付ける action × phase だけが変わり、ほかは状態を変えずに返す。VIEW・TOGGLE_MARK はどの phase でも ignored', () => {
    for (const [name, state, ok] of accepted) {
      for (const action of everyAction()) {
        const next = reduce(state, action);
        if (ok.includes(action.type)) expect(next, `${name} × ${action.type} は受け付ける`).not.toBe(state);
        else expect(next, `${name} × ${action.type} は ignored`).toBe(state);
      }
    }
  });

  it('DT2: title に START で difficulty (draws はそのまま)', () => {
    expect(reduce(initialState, { type: 'START' })).toEqual({ phase: 'difficulty', draws: 0 });
  });

  it('DT3: difficulty に PICK で sample (0 社目): 難易度・8 枠・draws + 1・missed なし', () => {
    const rounds = eight(1);
    const s = reduce(difficulty(), { type: 'PICK', difficulty: 'easy', rounds });
    expect(s).toEqual({ phase: 'sample', difficulty: 'easy', rounds, draws: 1 });
    expect('missed' in s).toBe(false);
  });

  it('DT4: cleared からの PICK は sample。難易度は cleared が持つものと同じ (action の難易度を使わない)・draws + 1・missed なし', () => {
    const c = cleared() as Of<'cleared'>;
    const s = reduce(c, { type: 'PICK', difficulty: 'hard', rounds: eight(3) });
    expect(s).toMatchObject({ phase: 'sample', difficulty: 'easy', draws: c.draws + 1 });
    expect('missed' in s).toBe(false);
  });

  it('DT5: sample (missed なし・あり) に BEGIN で reading の 1 社目 (同じ難易度・同じ rounds・draws は同じ・missed は持たない)', () => {
    for (const s of [sample() as Of<'sample'>, sampleWithMissed() as Of<'sample'>]) {
      const r = reduce(s, { type: 'BEGIN' });
      expect(r).toEqual({ phase: 'reading', difficulty: s.difficulty, rounds: s.rounds, round: 0, draws: s.draws });
      expect('missed' in r).toBe(false);
    }
  });

  it('DT6: reading に ANSWER で revealed (答え・正誤は problem.anomaly だけで決まる・round・rounds・draws は同じ)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = reading(seed) as Of<'reading'>;
      const hasAnomaly = r.rounds[0]!.problem.anomaly !== null;
      for (const answer of ['anomaly', 'normal'] as const) {
        const s = reduce(r, { type: 'ANSWER', answer });
        expect(s).toEqual({ phase: 'revealed', difficulty: 'easy', rounds: r.rounds, round: 0, draws: r.draws, answer, correct: (answer === 'anomaly') === hasAnomaly });
      }
    }
    // 異変のある枠・ない枠の 4 通りがすべて出ている
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => (reading(i + 1) as Of<'reading'>).rounds[0]!.problem.anomaly !== null));
    expect(kinds).toEqual(new Set([true, false]));
  });

  it('DT7: revealed に ANSWER は ignored (判定をやり直せない)', () => {
    for (const s of [revealedCorrect(), revealedWrong()]) {
      expect(reduce(s, { type: 'ANSWER', answer: 'normal' })).toBe(s);
      expect(reduce(s, { type: 'ANSWER', answer: 'anomaly' })).toBe(s);
    }
  });

  it('DT8: 正解のあと 1〜7 社目の NEXT で、次の社 (round + 1・draws は同じ)', () => {
    let s = reading();
    for (let round = 0; round < 7; round++) {
      const rv = revealedCorrect(s) as Of<'revealed'>;
      s = reduce(rv, { type: 'NEXT' });
      expect(s).toMatchObject({ phase: 'reading', round: round + 1, draws: rv.draws, rounds: rv.rounds });
    }
  });

  it('DT9: 8 社目の NEXT で cleared (難易度と、遊んだ 8 枠 (rounds)・draws)', () => {
    const rounds = eight(1);
    expect(cleared()).toEqual({ phase: 'cleared', difficulty: 'easy', rounds, draws: 1 });
  });

  it('DT10: 不正解の revealed に NEXT は ignored', () => {
    const s = revealedWrong();
    expect(reduce(s, { type: 'NEXT' })).toBe(s);
  });

  it('DT11: 1 社目・4 社目・8 社目で不正解のあと RESTART で sample: 新しい rounds・draws + 1・同じ難易度・missed = 間違えた枠 (元の rounds[round])', () => {
    for (const round of [0, 3, 7]) {
      const rv = revealedWrong(readingAt(round)) as Of<'revealed'>;
      const rounds = eight(2);
      const s = reduce(rv, { type: 'RESTART', rounds });
      expect(s).toEqual({ phase: 'sample', difficulty: 'easy', rounds, draws: rv.draws + 1, missed: rv.rounds[round] });
    }
  });

  it('DT12: 正解の revealed に RESTART は ignored', () => {
    const s = revealedCorrect();
    expect(reduce(s, { type: 'RESTART', rounds: eight(2) })).toBe(s);
  });

  it('DT13: 不正解の revealed と cleared で TO_DIFFICULTY は difficulty (draws はそのまま)。正解の revealed・reading・sample では ignored', () => {
    for (const s of [revealedWrong(), cleared()]) expect(reduce(s, { type: 'TO_DIFFICULTY' })).toEqual({ phase: 'difficulty', draws: (s as { draws: number }).draws });
    for (const s of [revealedCorrect(), reading(), sample(), sampleWithMissed()]) expect(reduce(s, { type: 'TO_DIFFICULTY' })).toBe(s);
  });

  it('DT14: TO_TITLE は走行を捨てる (rounds・答え・missed を持たない)。draws は残る。title では ignored', () => {
    for (const s of [difficulty(), sample(), sampleWithMissed(), reading(), revealedCorrect(), revealedWrong(), cleared()]) {
      expect(reduce(s, { type: 'TO_TITLE' })).toEqual({ phase: 'title', draws: (s as { draws: number }).draws });
    }
    expect(reduce(initialState, { type: 'TO_TITLE' })).toBe(initialState);
  });

  it('DT15: 1 社目から 8 社目まで毎回正解で、reading の round が 0 → 7 と進み、最後の NEXT で cleared', () => {
    let s = reading();
    for (let i = 0; i < 7; i++) {
      expect((s as Of<'reading'>).round).toBe(i);
      s = reduce(revealedCorrect(s), { type: 'NEXT' });
    }
    expect((s as Of<'reading'>).round).toBe(7);
    expect(reduce(revealedCorrect(s), { type: 'NEXT' }).phase).toBe('cleared');
  });

  it('DT16: 4 社目で不正解 → RESTART → BEGIN: sample (missed あり) → reading の 1 社目。draws は RESTART で 1 増え、BEGIN では増えない。reading は missed を持たない', () => {
    const rv = revealedWrong(readingAt(3)) as Of<'revealed'>;
    const s = reduce(rv, { type: 'RESTART', rounds: eight(5) }) as Of<'sample'>;
    expect(s.phase).toBe('sample');
    expect(s.missed).toEqual(rv.rounds[3]);
    expect(s.draws).toBe(rv.draws + 1);
    const r = reduce(s, { type: 'BEGIN' }) as Of<'reading'>;
    expect(r).toMatchObject({ phase: 'reading', round: 0, draws: s.draws });
    expect('missed' in r).toBe(false);
  });

  it('DT17: reading・revealed の状態は view・marks を持たない (印・検算・画面の参照は無い)', () => {
    for (const s of [reading(), revealedCorrect(), revealedWrong()]) {
      expect('view' in s).toBe(false);
      expect('marks' in s).toBe(false);
    }
  });

  it('DT18: どの遷移も、渡した状態・rounds・action の rounds を書き換えない (深い凍結をかけても例外にならず、結果は同じ)', () => {
    const freeze = <T>(x: T): T => {
      if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
        Object.freeze(x);
        Object.values(x).forEach(freeze);
      }
      return x;
    };
    for (const [name, state] of accepted) {
      for (const action of everyAction()) {
        const expected = reduce(structuredClone(state), structuredClone(action));
        expect(() => reduce(freeze(structuredClone(state)), freeze(structuredClone(action))), `${name} × ${action.type}`).not.toThrow();
        expect(reduce(freeze(structuredClone(state)), freeze(structuredClone(action)))).toEqual(expected);
      }
    }
  });

  it('DT19: 枠 (rounds の要素) と missed は problem だけを持つ (shape が無い)', () => {
    const states = [sample(), sampleWithMissed(), reading(), revealedWrong(), cleared()] as { rounds: Round[]; missed?: Round }[];
    for (const s of states) {
      for (const r of s.rounds) expect(Object.keys(r)).toEqual(['problem']);
      if (s.missed) expect(Object.keys(s.missed)).toEqual(['problem']);
    }
    expect((sampleWithMissed() as Of<'sample'>).missed).toBeDefined();
  });
});
