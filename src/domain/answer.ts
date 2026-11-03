// 判定と答え合わせ (docs/design.md §4.4)。`problem.anomaly` だけを見る。文言は持たない (固定の文言は ui/messages.ts)。
import { IR_SLIDES, TANSHIN_SCREENS } from './types';
import type { AnomalyKind, AnomalyPlace, DocKind, Problem } from './types';
import type { ScreenRef } from './screen';

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

function firstScreen(doc: DocKind): ScreenRef {
  return doc === 'tanshin' ? { doc, screen: TANSHIN_SCREENS[0] } : { doc, screen: IR_SLIDES[0] };
}

/** 場所がある画面。path の先頭か、項目キーの 2 番目が画面。`header` の場所は、その資料の 1 画面目 (設計 §4.1)。 */
export function screenOf(place: AnomalyPlace): ScreenRef {
  const segment = 'path' in place ? place.path.split('.')[0] : place.itemKey.split('.')[1];
  if (place.doc === 'tanshin') {
    const screen = TANSHIN_SCREENS.find((s) => s === segment);
    return screen ? { doc: 'tanshin', screen } : firstScreen('tanshin');
  }
  const screen = IR_SLIDES.find((s) => s === segment);
  return screen ? { doc: 'ir', screen } : firstScreen('ir');
}

/** 場所の並びから、重複のない画面の並び (最初に出た順)。答え合わせの画面送りに使う。 */
export function screensOf(places: readonly AnomalyPlace[]): ScreenRef[] {
  const out: ScreenRef[] = [];
  for (const place of places) {
    const ref = screenOf(place);
    if (!out.some((o) => o.doc === ref.doc && o.screen === ref.screen)) out.push(ref);
  }
  return out;
}
