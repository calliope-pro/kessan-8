// 状態遷移 (docs/design.md §5)。DOM に触らない純粋な関数。受け付けない action と phase の組み合わせは、状態を変えずに同じ値を返す。
import { screenOf } from './answer';
import type { Answer } from './answer';
import { ROUNDS_TO_CLEAR } from './config';
import { IR_SLIDES, TANSHIN_SCREENS } from './types';
import type { Difficulty, Problem } from './types';
import type { ScreenRef } from './screen';

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
export interface Run extends Base {
  difficulty: Difficulty;
  /** 出題 (8 問)。 */
  problems: Problem[];
  /** 何社目か (0〜7)。 */
  round: number;
  /** いま見ている画面。 */
  view: ScreenRef;
  /** 印を付けた場所のキー (付けた順)。中身は reduce が見ない (src/ui/viewer-port.ts)。 */
  marks: string[];
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
}
export type GameState = Title | PickDifficulty | Reading | Revealed | Cleared;

export type Action =
  | { type: 'START' }
  | { type: 'PICK'; difficulty: Difficulty; problems: Problem[] }
  | { type: 'VIEW'; view: ScreenRef }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'NEXT' }
  | { type: 'RESTART'; problems: Problem[] }
  | { type: 'TO_DIFFICULTY' }
  | { type: 'TO_TITLE' }
  | { type: 'TOGGLE_MARK'; key: string };

export const initialState: GameState = { phase: 'title', draws: 0 };

/** 各社の最初に見る画面 (決算短信の 1 画面目)。 */
export const FIRST_VIEW: ScreenRef = { doc: 'tanshin', screen: TANSHIN_SCREENS[0] };

export function isScreen(view: ScreenRef): boolean {
  return view.doc === 'tanshin' ? TANSHIN_SCREENS.includes(view.screen as never) : IR_SLIDES.includes(view.screen as never);
}

function startRun(difficulty: Difficulty, problems: Problem[], draws: number): Reading {
  return { phase: 'reading', draws: draws + 1, difficulty, problems, round: 0, view: FIRST_VIEW, marks: [] };
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return state.phase === 'title' ? { phase: 'difficulty', draws: state.draws } : state;
    case 'PICK':
      if (state.phase === 'difficulty') return startRun(action.difficulty, action.problems, state.draws);
      // cleared からは「もう一度」: 難易度は cleared が持つものと同じ
      if (state.phase === 'cleared') return startRun(state.difficulty, action.problems, state.draws);
      return state;
    case 'VIEW':
      return state.phase === 'reading' || state.phase === 'revealed' ? { ...state, view: action.view } : state;
    case 'ANSWER': {
      if (state.phase !== 'reading') return state;
      const problem = state.problems[state.round];
      if (!problem) return state;
      const hasAnomaly = problem.anomaly !== null;
      const first = problem.anomaly?.places[0];
      return {
        ...state,
        phase: 'revealed',
        answer: action.answer,
        correct: (action.answer === 'anomaly') === hasAnomaly,
        // 異変のある問題は、最初の場所の画面を最初に示す
        view: first ? screenOf(first) : state.view,
      };
    }
    case 'NEXT': {
      if (state.phase !== 'revealed' || !state.correct) return state;
      if (state.round + 1 >= ROUNDS_TO_CLEAR) return { phase: 'cleared', draws: state.draws, difficulty: state.difficulty };
      return { phase: 'reading', draws: state.draws, difficulty: state.difficulty, problems: state.problems, round: state.round + 1, view: FIRST_VIEW, marks: [] };
    }
    case 'RESTART':
      return state.phase === 'revealed' && !state.correct ? startRun(state.difficulty, action.problems, state.draws) : state;
    case 'TO_DIFFICULTY':
      if ((state.phase === 'revealed' && !state.correct) || state.phase === 'cleared') return { phase: 'difficulty', draws: state.draws };
      return state;
    case 'TO_TITLE':
      return state.phase === 'title' ? state : { phase: 'title', draws: state.draws };
    case 'TOGGLE_MARK': {
      if (state.phase !== 'reading') return state;
      const marks = state.marks.includes(action.key) ? state.marks.filter((k) => k !== action.key) : [...state.marks, action.key];
      return { ...state, marks };
    }
  }
}
