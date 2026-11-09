// 画面の部品の純粋な関数 (docs/test-cases/screens-v3.md U1〜U3・U5。関数名は案)。
import { canDraw } from '../domain/draw';
import type { Records } from '../domain/records';
import type { Difficulty, Problem } from '../domain/types';
import { MESSAGES } from './messages';

/** その難易度の出題のプールに出る異変の種類 (問題の `anomaly.kind` の重複なし)。 */
export function poolKinds(pool: readonly Problem[], difficulty: Difficulty): Set<string> {
  return new Set(pool.filter((p) => p.difficulty === difficulty && p.anomaly !== null).map((p) => p.anomaly!.kind));
}

/** 見つけた異変の種類 n / N。n は記録の種類のうち、プールにあるもの (前の版の種類は数えない)。 */
export function kindStats(records: Records, pool: readonly Problem[], difficulty: Difficulty): { n: number; N: number } {
  const all = poolKinds(pool, difficulty);
  return { n: new Set(records[difficulty].kinds.filter((k) => all.has(k))).size, N: all.size };
}

/** 周の前後の種類から、今回新しく見つけた数 k。 */
export function clearSummary(before: readonly string[], after: readonly string[], pool: readonly Problem[], difficulty: Difficulty): { n: number; N: number; added: number } {
  const all = poolKinds(pool, difficulty);
  const had = new Set(before);
  const now = new Set(after.filter((k) => all.has(k)));
  return { n: now.size, N: all.size, added: [...now].filter((k) => !had.has(k)).length };
}

export interface TitleDifficulty {
  enabled: boolean;
  /** 遊んだことがあるときだけ (最高の到達社数)。 */
  best: number | null;
  /** 押せないときの言葉 (準備中)。 */
  note: string;
}
export interface TitleView {
  easy: TitleDifficulty;
  hard: TitleDifficulty;
  allUnavailable: boolean;
}

export function titleView(pool: readonly Problem[], records: Records): TitleView {
  const one = (d: Difficulty): TitleDifficulty => {
    const enabled = canDraw(pool, d);
    return { enabled, best: records[d].best > 0 ? records[d].best : null, note: enabled ? '' : MESSAGES.unavailable };
  };
  const easy = one('easy'), hard = one('hard');
  return { easy, hard, allUnavailable: !easy.enabled && !hard.enabled };
}

export const recordsNote = (storable: boolean): string => (storable ? '' : MESSAGES.notSaved);
