// ケース表 docs/proto/test-cases.md の F (流れ)。
import { describe, expect, it } from 'vitest';
import { drawRun } from './draw';
import { initial, reduce, type Action, type State } from './flow';
import type { Round } from './draw';
import { NORMALS } from './testing';

const rounds = (seed: number) => drawRun(seed, NORMALS);
const correctAnswer = (r: Round): Action => ({ type: 'ANSWER', answer: r.anomaly ? 'anomaly' : 'normal' });
const wrongAnswer = (r: Round): Action => ({ type: 'ANSWER', answer: r.anomaly ? 'normal' : 'anomaly' });
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s);
const reading = (seed = 1) => run(initial(rounds(seed)), { type: 'BEGIN' });

describe('F1〜F3', () => {
  it('F1 sample で BEGIN → reading・枠 0', () => {
    const s = initial(rounds(1));
    expect(s.phase).toBe('sample');
    expect(reduce(s, { type: 'BEGIN' })).toMatchObject({ phase: 'reading', index: 0 });
  });
  it('F2 正しい ANSWER → revealed・正解', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = reading(seed);
      expect(reduce(s, correctAnswer(s.rounds[0]!))).toMatchObject({ phase: 'revealed', lastCorrect: true });
    }
  });
  it('F3 誤った ANSWER → revealed・不正解', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = reading(seed);
      expect(reduce(s, wrongAnswer(s.rounds[0]!))).toMatchObject({ phase: 'revealed', lastCorrect: false });
    }
  });
});

describe('F4・F5・F9 進む・クリア', () => {
  it('F4 正解の revealed で NEXT → 次の枠', () => {
    const s0 = reading(3);
    const s1 = run(s0, correctAnswer(s0.rounds[0]!), { type: 'NEXT' });
    expect(s1).toMatchObject({ phase: 'reading', index: 1 });
  });
  it('F5・F9 8 社連続で正解 → cleared', () => {
    let s = reading(5);
    for (let i = 0; i < 8; i++) {
      expect(s.phase).toBe('reading');
      expect(s.index).toBe(i);
      s = run(s, correctAnswer(s.rounds[i]!), { type: 'NEXT' });
    }
    expect(s.phase).toBe('cleared');
  });
  it('F9 1 回でも間違えれば cleared に行けない', () => {
    let s = reading(5);
    for (let i = 0; i < 3; i++) s = run(s, correctAnswer(s.rounds[i]!), { type: 'NEXT' });
    s = reduce(s, wrongAnswer(s.rounds[3]!));
    expect(reduce(s, { type: 'NEXT' })).toBe(s);
    expect(s.phase).toBe('revealed');
  });
});

describe('F6・F7 0 社目に戻る', () => {
  it('F6 不正解の revealed で RESTART → sample。missed に間違えた枠・枠は 0・出題が替わる', () => {
    let s = reading(7);
    s = run(s, correctAnswer(s.rounds[0]!), { type: 'NEXT' });
    const wrong = s.rounds[1]!;
    s = reduce(s, wrongAnswer(wrong));
    const fresh = rounds(8);
    const back = reduce(s, { type: 'RESTART', rounds: fresh });
    expect(back).toMatchObject({ phase: 'sample', index: 0, rounds: fresh, missed: wrong, draws: s.draws + 1 });
  });
  it('F7 cleared で PLAY_AGAIN → sample (missed なし)', () => {
    let s = reading(9);
    for (let i = 0; i < 8; i++) s = run(s, correctAnswer(s.rounds[i]!), { type: 'NEXT' });
    const back = reduce(s, { type: 'PLAY_AGAIN', rounds: rounds(10) });
    expect(back).toMatchObject({ phase: 'sample', index: 0, missed: null });
  });
  it('sample から BEGIN すると missed は消える (reading の中に前の失敗を持ち越さない)', () => {
    let s = reading(7);
    s = reduce(s, wrongAnswer(s.rounds[0]!));
    s = reduce(s, { type: 'RESTART', rounds: rounds(8) });
    expect(reduce(s, { type: 'BEGIN' }).missed).toBeNull();
  });
});

describe('F8 受け付けない組み合わせは状態を変えない', () => {
  it('同じ参照を返す', () => {
    const smp = initial(rounds(1));
    const rd = reading(1);
    const wrong = reduce(rd, wrongAnswer(rd.rounds[0]!));
    const cases: [State, Action][] = [
      [rd, { type: 'NEXT' }],
      [rd, { type: 'BEGIN' }],
      [rd, { type: 'RESTART', rounds: rounds(2) }],
      [wrong, { type: 'ANSWER', answer: 'normal' }],
      [wrong, { type: 'NEXT' }],
      [smp, { type: 'ANSWER', answer: 'normal' }],
      [smp, { type: 'NEXT' }],
      [smp, { type: 'PLAY_AGAIN', rounds: rounds(2) }],
    ];
    for (const [s, a] of cases) expect(reduce(s, a), `${s.phase} ${a.type}`).toBe(s);
  });
  it('正解の revealed では RESTART を受け付けない', () => {
    const rd = reading(1);
    const ok = reduce(rd, correctAnswer(rd.rounds[0]!));
    expect(reduce(ok, { type: 'RESTART', rounds: rounds(2) })).toBe(ok);
  });
});
