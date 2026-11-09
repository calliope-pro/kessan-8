// 状態遷移 (docs/design-v2.md §3.1・§3.2。v3 で枠は問題だけ: docs/design-v3.md §3.1 の表 21)。DOM に触らない純粋な関数。
// 受け付けない action と phase の組み合わせは、状態を変えずに同じ値を返す。ケース表: docs/test-cases/domain-v3.md §2。
import type { Answer } from './answer';
import { ROUNDS_TO_CLEAR } from './config';
import type { Difficulty, Round } from './types';

/** 保存する・描くのに足りる共通の項目。`draws` は出題の回数 (`PICK`・`RESTART` のたびに 1 増える。`?seed=N` の続き)。 */
export interface Base {
  draws: number;
}
export interface Title extends Base {
  phase: 'title';
}
export interface PickDifficulty extends Base {
  phase: 'difficulty';
}
/** 0 社目 (見本)。毎周の最初に出る。間違えたあとは、間違えた枠 (`missed`) を持つ (「さっきの異変」を出す材料)。 */
export interface Sample extends Base {
  phase: 'sample';
  difficulty: Difficulty;
  /** この周の出題 (8 枠)。 */
  rounds: Round[];
  missed?: Round;
}
export interface Run extends Base {
  difficulty: Difficulty;
  /** 出題 (8 枠)。 */
  rounds: Round[];
  /** 何社目か (0〜7)。 */
  round: number;
}
export interface Reading extends Run {
  phase: 'reading';
}
export interface Revealed extends Run {
  phase: 'revealed';
  answer: Answer;
  correct: boolean;
}
export interface Cleared extends Base {
  phase: 'cleared';
  difficulty: Difficulty;
  /** 遊んだ 8 枠 (完了票に 8 社の社章・社名を出す)。 */
  rounds: Round[];
}
export type GameState = Title | PickDifficulty | Sample | Reading | Revealed | Cleared;

export type Action =
  | { type: 'START' }
  | { type: 'PICK'; difficulty: Difficulty; rounds: Round[] }
  | { type: 'BEGIN' }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'NEXT' }
  | { type: 'RESTART'; rounds: Round[] }
  | { type: 'TO_DIFFICULTY' }
  | { type: 'TO_TITLE' };

export const initialState: GameState = { phase: 'title', draws: 0 };

/** 0 社目 (見本) から始める。出題のたびに `draws` が 1 増える。 */
function startSample(difficulty: Difficulty, rounds: Round[], draws: number, missed?: Round): Sample {
  return missed === undefined ? { phase: 'sample', draws: draws + 1, difficulty, rounds } : { phase: 'sample', draws: draws + 1, difficulty, rounds, missed };
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return state.phase === 'title' ? { phase: 'difficulty', draws: state.draws } : state;
    case 'PICK':
      if (state.phase === 'difficulty') return startSample(action.difficulty, action.rounds, state.draws);
      // cleared からは「もう一度」: 難易度は cleared が持つものと同じ
      if (state.phase === 'cleared') return startSample(state.difficulty, action.rounds, state.draws);
      return state;
    case 'BEGIN':
      return state.phase === 'sample' ? { phase: 'reading', draws: state.draws, difficulty: state.difficulty, rounds: state.rounds, round: 0 } : state;
    case 'ANSWER': {
      if (state.phase !== 'reading') return state;
      const round = state.rounds[state.round];
      if (!round) return state;
      const hasAnomaly = round.problem.anomaly !== null;
      return { phase: 'revealed', draws: state.draws, difficulty: state.difficulty, rounds: state.rounds, round: state.round, answer: action.answer, correct: (action.answer === 'anomaly') === hasAnomaly };
    }
    case 'NEXT': {
      if (state.phase !== 'revealed' || !state.correct) return state;
      if (state.round + 1 >= ROUNDS_TO_CLEAR) return { phase: 'cleared', draws: state.draws, difficulty: state.difficulty, rounds: state.rounds };
      return { phase: 'reading', draws: state.draws, difficulty: state.difficulty, rounds: state.rounds, round: state.round + 1 };
    }
    case 'RESTART': {
      if (state.phase !== 'revealed' || state.correct) return state;
      const missed = state.rounds[state.round];
      return startSample(state.difficulty, action.rounds, state.draws, missed);
    }
    case 'TO_DIFFICULTY':
      if ((state.phase === 'revealed' && !state.correct) || state.phase === 'cleared') return { phase: 'difficulty', draws: state.draws };
      return state;
    case 'TO_TITLE':
      return state.phase === 'title' ? state : { phase: 'title', draws: state.draws };
    default:
      // 消えた action (VIEW・TOGGLE_MARK など。型の外から渡されたもの) は受け付けない
      return state;
  }
}
