// 判定と答え合わせ (docs/design.md §4.4)。`problem.anomaly` だけを見る。文言は持たない (固定の文言は ui/messages.ts)。
import type { AnomalyKind, AnomalyPlace, Problem } from './types';

export type Answer = 'anomaly' | 'normal';

export interface Judgement {
  /** 答えが正しかったか。 */
  correct: boolean;
  /** 問題に異変があったか。 */
  hasAnomaly: boolean;
  /** 強調する場所 (異変の無い問題は空)。 */
  places: AnomalyPlace[];
  explanation?: string;
  /** 異変の種類の名前 (`anomaly-kinds` の name)。 */
  kindName?: string;
}

export function judge(problem: Problem, answer: Answer, kinds: readonly AnomalyKind[]): Judgement {
  const anomaly = problem.anomaly;
  const correct = (answer === 'anomaly') === (anomaly !== null);
  if (anomaly === null) return { correct, hasAnomaly: false, places: [] };
  return {
    correct,
    hasAnomaly: true,
    places: anomaly.places,
    explanation: anomaly.explanation,
    kindName: kinds.find((k) => k.id === anomaly.kind)?.name,
  };
}
