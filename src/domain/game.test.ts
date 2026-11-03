// UG1〜UG18 (docs/test-cases/flow.md §1.4)
import { describe, expect, it } from 'vitest';
import { makePool } from '../testing/fixtures';
import { screenOf } from './answer';
import { draw } from './draw';
import { type Action, type GameState, initialState, reduce } from './game';
import { mulberry32 } from './rng';
import type { Problem } from './types';

const pool = makePool({ difficulty: 'easy', companies: 12 });
const eight = (seed: number): Problem[] => draw(pool, { difficulty: 'easy', rng: mulberry32(seed) });
const eightHard = (seed: number): Problem[] => draw(makePool({ difficulty: 'hard', companies: 12 }), { difficulty: 'hard', rng: mulberry32(seed) });

const apply = (s: GameState, ...actions: Action[]): GameState => actions.reduce(reduce, s);
const reading = (seed = 1): GameState => apply(initialState, { type: 'START' }, { type: 'PICK', difficulty: 'easy', problems: eight(seed) });
const answerOf = (s: GameState, correct: boolean) => {
  if (s.phase !== 'reading') throw new Error('reading ではない');
  const hasAnomaly = s.problems[s.round]!.anomaly !== null;
  return { type: 'ANSWER', answer: hasAnomaly === correct ? 'anomaly' : 'normal' } as const;
};
const revealedCorrect = (s = reading()) => reduce(s, answerOf(s, true));
const revealedWrong = (s = reading()) => reduce(s, answerOf(s, false));
const cleared = (): GameState => {
  let s = reading();
  for (let i = 0; i < 8; i++) s = reduce(revealedCorrect(s), { type: 'NEXT' });
  return s;
};

const otherView = { doc: 'ir', screen: 'outlook' } as const;
const everyAction = (): Action[] => [
  { type: 'START' },
  { type: 'PICK', difficulty: 'hard', problems: eightHard(9) },
  { type: 'VIEW', view: otherView },
  { type: 'ANSWER', answer: 'anomaly' },
  { type: 'NEXT' },
  { type: 'RESTART', problems: eight(9) },
  { type: 'TO_DIFFICULTY' },
  { type: 'TO_TITLE' },
  { type: 'TOGGLE_MARK', key: 'tanshin.summary.netSales.current' },
];

// action × phase の受け付ける組み合わせ (docs/design.md §5.2 の表。TOGGLE_MARK は印の状態)
const accepted: [string, GameState, string[]][] = [
  ['title', initialState, ['START']],
  ['difficulty', reduce(initialState, { type: 'START' }), ['PICK', 'TO_TITLE']],
  ['reading', reading(), ['VIEW', 'ANSWER', 'TO_TITLE', 'TOGGLE_MARK']],
  ['revealed(正解)', revealedCorrect(), ['VIEW', 'NEXT', 'TO_TITLE']],
  ['revealed(不正解)', revealedWrong(), ['VIEW', 'RESTART', 'TO_DIFFICULTY', 'TO_TITLE']],
  ['cleared', cleared(), ['PICK', 'TO_DIFFICULTY', 'TO_TITLE']],
];

describe('状態遷移 reduce', () => {
  it('UG1: 受け付ける action × phase だけが変わり、ほかは状態を変えずに返す', () => {
    for (const [name, state, ok] of accepted) {
      for (const action of everyAction()) {
        const next = reduce(state, action);
        if (ok.includes(action.type)) expect(next, `${name} × ${action.type} は受け付ける`).not.toBe(state);
        else expect(next, `${name} × ${action.type} は ignored`).toBe(state);
      }
    }
  });

  it('UG2: title に START で difficulty', () => {
    expect(reduce(initialState, { type: 'START' }).phase).toBe('difficulty');
  });

  it('UG3: PICK で reading の 1 社目 (短信の 1 画面目・印は空・draws + 1)', () => {
    const problems = eight(1);
    const s = apply(initialState, { type: 'START' }, { type: 'PICK', difficulty: 'easy', problems });
    expect(s).toMatchObject({ phase: 'reading', difficulty: 'easy', round: 0, marks: [], view: { doc: 'tanshin', screen: 'summary' }, draws: 1 });
    expect((s as { problems: Problem[] }).problems).toEqual(problems);
  });

  it('UG4: cleared からの PICK は、cleared が持つ難易度のまま・draws + 1', () => {
    const c = cleared();
    const s = reduce(c, { type: 'PICK', difficulty: 'hard', problems: eight(3) });
    expect(s).toMatchObject({ phase: 'reading', difficulty: 'easy', round: 0, draws: (c as { draws: number }).draws + 1 });
  });

  it('UG5: VIEW は見る画面だけを変える (revealed でも答え・正誤・印は変わらない)', () => {
    const r = reduce(reading(), { type: 'VIEW', view: otherView });
    expect(r).toMatchObject({ phase: 'reading', view: otherView });
    const rv = revealedWrong();
    const moved = reduce(rv, { type: 'VIEW', view: otherView });
    expect(moved).toMatchObject({ phase: 'revealed', view: otherView });
    expect(moved).toMatchObject({ answer: (rv as { answer: string }).answer, correct: false });
  });

  it('UG6: ANSWER で revealed。答え・正誤は judge と同じ。異変のある問題は 1 つ目の場所の画面、ない問題は見ていた画面のまま。印は持ち越し', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s0 = reduce(reading(seed), { type: 'TOGGLE_MARK', key: 'k1' });
      const r0 = s0 as Extract<GameState, { phase: 'reading' }>;
      const problem = r0.problems[0]!;
      const s = reduce(s0, { type: 'ANSWER', answer: 'anomaly' }) as Extract<GameState, { phase: 'revealed' }>;
      expect(s.phase).toBe('revealed');
      expect(s.answer).toBe('anomaly');
      expect(s.correct).toBe(problem.anomaly !== null);
      expect(s.marks).toEqual(['k1']);
      if (problem.anomaly) expect(s.view).toEqual(screenOf(problem.anomaly.places[0]!));
      else expect(s.view).toEqual(r0.view);
    }
  });

  it('UG7: revealed で ANSWER は ignored (判定をやり直せない)', () => {
    const s = revealedWrong();
    expect(reduce(s, { type: 'ANSWER', answer: 'normal' })).toBe(s);
    expect(reduce(s, { type: 'ANSWER', answer: 'anomaly' })).toBe(s);
  });

  it('UG8: 正解のあと 1〜7 社目の NEXT で、次の社 (印は空・短信の 1 画面目・draws は同じ)', () => {
    let s = reading();
    for (let round = 0; round < 7; round++) {
      const rv = revealedCorrect(s);
      s = reduce(rv, { type: 'NEXT' });
      expect(s).toMatchObject({ phase: 'reading', round: round + 1, marks: [], view: { doc: 'tanshin', screen: 'summary' }, draws: (rv as { draws: number }).draws });
    }
  });

  it('UG9: 8 社目の NEXT で cleared (難易度と、遊んだ 8 問を持つ)', () => {
    expect(cleared()).toMatchObject({ phase: 'cleared', difficulty: 'easy', problems: eight(1) });
  });

  it('UG10: 不正解のあとの NEXT は ignored', () => {
    const s = revealedWrong();
    expect(reduce(s, { type: 'NEXT' })).toBe(s);
  });

  it('UG11: 不正解のあとの RESTART で、新しい 8 問の 1 社目 (印は空・draws + 1)', () => {
    const rv = revealedWrong(reduce(reading(), { type: 'TOGGLE_MARK', key: 'k1' }));
    const problems = eight(2);
    const s = reduce(rv, { type: 'RESTART', problems });
    expect(s).toMatchObject({ phase: 'reading', round: 0, marks: [], draws: (rv as { draws: number }).draws + 1, difficulty: 'easy' });
    expect((s as { problems: Problem[] }).problems).toEqual(problems);
  });

  it('UG12: 正解のあとの RESTART は ignored', () => {
    const s = revealedCorrect();
    expect(reduce(s, { type: 'RESTART', problems: eight(2) })).toBe(s);
  });

  it('UG13: 不正解の revealed と cleared で TO_DIFFICULTY は difficulty。正解の revealed と reading は ignored', () => {
    expect(reduce(revealedWrong(), { type: 'TO_DIFFICULTY' }).phase).toBe('difficulty');
    expect(reduce(cleared(), { type: 'TO_DIFFICULTY' }).phase).toBe('difficulty');
    const rc = revealedCorrect();
    expect(reduce(rc, { type: 'TO_DIFFICULTY' })).toBe(rc);
    const r = reading();
    expect(reduce(r, { type: 'TO_DIFFICULTY' })).toBe(r);
  });

  it('UG14: TO_TITLE は走行を捨てる (問題・印・答えを持たない)。draws は残る', () => {
    for (const s of [reduce(initialState, { type: 'START' }), reading(), revealedCorrect(), revealedWrong(), cleared()]) {
      const t = reduce(s, { type: 'TO_TITLE' });
      expect(t).toEqual({ phase: 'title', draws: (s as { draws: number }).draws });
    }
    expect(reduce(initialState, { type: 'TO_TITLE' })).toBe(initialState);
  });

  it('UG15: TOGGLE_MARK は付け外し。付けた順に並ぶ。reading のほかでは ignored', () => {
    const k1 = { type: 'TOGGLE_MARK', key: 'a' } as const;
    const k2 = { type: 'TOGGLE_MARK', key: 'b' } as const;
    const s = apply(reading(), k1, k2);
    expect((s as { marks: string[] }).marks).toEqual(['a', 'b']);
    expect((reduce(s, k1) as { marks: string[] }).marks).toEqual(['b']);
    const rv = revealedWrong();
    expect(reduce(rv, k1)).toBe(rv);
  });

  it('UG16: 印は revealed に持ち越され、NEXT・RESTART のあとは空', () => {
    const marked = reduce(reading(), { type: 'TOGGLE_MARK', key: 'a' });
    const rc = revealedCorrect(marked);
    expect((rc as { marks: string[] }).marks).toEqual(['a']);
    expect((reduce(rc, { type: 'NEXT' }) as { marks: string[] }).marks).toEqual([]);
    const rw = revealedWrong(marked);
    expect((rw as { marks: string[] }).marks).toEqual(['a']);
    expect((reduce(rw, { type: 'RESTART', problems: eight(2) }) as { marks: string[] }).marks).toEqual([]);
  });

  it('UG17: 毎回正解の 8 社連続で、途中は reading の round が 0 → 7、最後の NEXT で cleared', () => {
    let s = reading();
    for (let i = 0; i < 7; i++) {
      expect((s as { round: number }).round).toBe(i);
      s = reduce(revealedCorrect(s), { type: 'NEXT' });
    }
    expect((s as { round: number }).round).toBe(7);
    expect(reduce(revealedCorrect(s), { type: 'NEXT' }).phase).toBe('cleared');
  });

  it('UG18: 4 社目で不正解のあと RESTART で 1 社目・draws が 1 増える', () => {
    let s = reading();
    for (let i = 0; i < 3; i++) s = reduce(revealedCorrect(s), { type: 'NEXT' });
    const rw = revealedWrong(s);
    const next = reduce(rw, { type: 'RESTART', problems: eight(5) });
    expect(next).toMatchObject({ phase: 'reading', round: 0, draws: (rw as { draws: number }).draws + 1 });
  });
});
