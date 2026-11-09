// 試作の状態遷移 (docs/design-v2.md §3.2 の、title・difficulty を除いたもの)。`reduce` は全域: 受け付けない組み合わせは同じ状態を返す。
import type { Round } from './draw';
import { ROUNDS_TO_CLEAR } from './draw';

export type Phase = 'sample' | 'reading' | 'revealed' | 'cleared';
export type Answer = 'normal' | 'anomaly';

export interface State {
  phase: Phase;
  /** 今の周の 8 枠。 */
  rounds: Round[];
  /** 何枠目か (0〜7 = 1〜8 社目)。 */
  index: number;
  /** 不正解で 0 社目に戻ったときの、間違えた枠 (0 社目の「さっきの異変」の出所)。 */
  missed: Round | null;
  lastCorrect: boolean | null;
  lastAnswer: Answer | null;
  /** 出題の回数 (1 から)。 */
  draws: number;
}

export type Action =
  | { type: 'BEGIN' }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'NEXT' }
  | { type: 'RESTART'; rounds: Round[] }
  | { type: 'PLAY_AGAIN'; rounds: Round[] };

export function initial(rounds: Round[]): State {
  return { phase: 'sample', rounds, index: 0, missed: null, lastCorrect: null, lastAnswer: null, draws: 1 };
}

export function isCorrect(round: Round, answer: Answer): boolean {
  return (answer === 'anomaly') === (round.anomaly !== null);
}

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'BEGIN':
      return s.phase === 'sample' ? { ...s, phase: 'reading', index: 0, missed: null, lastCorrect: null, lastAnswer: null } : s;
    case 'ANSWER': {
      if (s.phase !== 'reading') return s;
      return { ...s, phase: 'revealed', lastCorrect: isCorrect(s.rounds[s.index]!, a.answer), lastAnswer: a.answer };
    }
    case 'NEXT': {
      if (s.phase !== 'revealed' || s.lastCorrect !== true) return s;
      const next = s.index + 1;
      return next >= ROUNDS_TO_CLEAR
        ? { ...s, phase: 'cleared', lastCorrect: null, lastAnswer: null }
        : { ...s, phase: 'reading', index: next, lastCorrect: null, lastAnswer: null };
    }
    case 'RESTART':
      if (s.phase !== 'revealed' || s.lastCorrect !== false) return s;
      return { ...s, phase: 'sample', rounds: a.rounds, index: 0, missed: s.rounds[s.index]!, lastCorrect: null, lastAnswer: null, draws: s.draws + 1 };
    case 'PLAY_AGAIN':
      if (s.phase !== 'cleared') return s;
      return { ...s, phase: 'sample', rounds: a.rounds, index: 0, missed: null, lastCorrect: null, lastAnswer: null, draws: s.draws + 1 };
  }
}
