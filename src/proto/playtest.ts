// 正常を覚えられるかの確かめ (docs/plans/redesign/plans.md §8.1 の「① の測り方」)。
// 1 人 8 枚 = 異変 4 + 正常 4。異変は型のずれだけ (向きの逆・桁・比率の計算違いは、0 社目が無くても見つかるので使わない)。
import { mulberry32 } from '../domain/rng';
import type { Problem } from '../domain/types';
import { buildAnomaly } from './anomalies';
import type { ShapeId } from './cards';
import type { Round } from './draw';

/** 型のずれ: 欄の欠落・並びの入れ替え・単位の語・欄の重複。 */
export const FORM_KINDS = ['E-19', 'E-20', 'E-03', 'E-22'] as const;
export const DECK_SIZE = 8;

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildDeck(seed: number, shape: ShapeId, normals: readonly Problem[]): Round[] {
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const byCompany = new Map<string, Problem[]>();
  for (const p of shuffle(normals, rng)) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);
  const picked = shuffle([...byCompany.keys()], rng).slice(0, DECK_SIZE).map((c) => byCompany.get(c)![0]!);
  if (picked.length < DECK_SIZE) throw new Error('確かめの 1 組を作れません: 会社が足りません');
  const anomalyAt = new Set(shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng).slice(0, 4));
  const kinds = shuffle(FORM_KINDS, rng);
  let k = 0;
  return picked.map((base, i): Round => {
    if (!anomalyAt.has(i)) return { problem: base, baseId: base.id, shape, edits: [], anomaly: null };
    const kind = kinds[k++]!;
    const b = buildAnomaly(kind, base, shape, rng);
    return { problem: b.problem, baseId: base.id, shape, edits: b.edits, anomaly: { kind, name: b.name, places: b.places, explanation: b.explanation } };
  });
}

export interface Response {
  index: number;
  hasAnomaly: boolean;
  said: 'normal' | 'anomaly';
}

export interface Score {
  anomalies: number;
  normals: number;
  found: number;
  falseAlarms: number;
  /** 合格の基準 (仮定): 異変 4 枚中 3 枚以上を見つけ、かつ正常 4 枚中の誤りが 1 枚以下。 */
  pass: boolean;
}

export function scoreSession(rs: readonly Response[]): Score {
  const anomalies = rs.filter((r) => r.hasAnomaly).length;
  const found = rs.filter((r) => r.hasAnomaly && r.said === 'anomaly').length;
  const falseAlarms = rs.filter((r) => !r.hasAnomaly && r.said === 'anomaly').length;
  return { anomalies, normals: rs.length - anomalies, found, falseAlarms, pass: found >= 3 && falseAlarms <= 1 };
}

export type Verdict = '強い合図' | '弱い合図' | '効かない' | '未確認';

export function summarize(sessions: readonly { pass: boolean }[]): { n: number; passed: number; verdict: Verdict } {
  const n = sessions.length;
  const passed = sessions.filter((s) => s.pass).length;
  let verdict: Verdict;
  if (n >= 5) verdict = passed === n ? '強い合図' : passed === n - 1 ? '弱い合図' : '効かない';
  else verdict = n >= 2 && passed === n ? '弱い合図' : '未確認';
  return { n, passed, verdict };
}

/** 当て推量 (どの枚も 50%) で合格する確率。plans.md §8.1: 1 人 約 9.8%、5 人中 4 人以上 約 0.04%。 */
export function guessProbability(): { one: number; fourOfFive: number } {
  const atLeast3of4 = 5 / 16; // P(Bin(4, 1/2) >= 3)
  const atMost1of4 = 5 / 16; // P(Bin(4, 1/2) <= 1)
  const one = atLeast3of4 * atMost1of4;
  return { one, fourOfFive: 5 * one ** 4 * (1 - one) + one ** 5 };
}
