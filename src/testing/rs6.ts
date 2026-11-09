// R-S6 (種類の出方) の数え方 (docs/test-cases/domain-v3.md §1.4。設計 v3 §2.7・§3.2 #155-3)。試験用。数え方を 1 か所にまとめ、プールを変えて当てる。
import { ROUNDS_TO_CLEAR, TIER_BY_ROUND } from '../domain/config';
import { draw } from '../domain/draw';
import { mulberry32 } from '../domain/rng';
import { emptyRecords, recordAnswer } from '../domain/records';
import type { Difficulty, Problem } from '../domain/types';
import type { KindSpec } from './pool-v3';

/** 枠の群 (1〜2・3〜5・6〜8 社目。`TIER_BY_ROUND` の狙いの段が同じ枠。0 始まり)。 */
export const GROUPS: readonly (readonly number[])[] = [1, 2, 3].map((t) => TIER_BY_ROUND.flatMap((x, slot) => (x === t ? [slot] : [])));

export interface SimOptions {
  laps: number;
  /** 履歴と見つけた種類を、周をまたいで `recordAnswer` で引き継ぐ。 */
  carry?: boolean;
  /** 各答えが正解する確率 (省略 = 1。全問正解)。不正解の周はそこで終わり、遊び手が見た枠だけを数える。 */
  accuracy?: number;
}

export interface SimResult {
  /** 数えた枠の数 (全問正解なら laps × 8)。 */
  slots: number;
  anomalySlots: number;
  /** 群ごとの、異変の枠で出た種類 ID の数。 */
  kindCounts: Map<string, number>[];
  /**
   * 会社から答えが漏れないことの数え方 (B1)。遊び手が見た枠だけを、その会社が**前の周で正常な問題として出ていたか**で分け、
   * それぞれで異変の枠だった数を数える。履歴を引き継ぐときだけ意味を持つ (引き継がなくても数える)。
   */
  afterNormal: { anomaly: number; total: number };
  others: { anomaly: number; total: number };
}

/** 種 1〜laps で出題する。 */
export function simulate(pool: Problem[], difficulty: Difficulty, o: SimOptions): SimResult {
  const accuracy = o.accuracy ?? 1;
  const player = mulberry32(2026);
  let rec = emptyRecords();
  const kindCounts = GROUPS.map(() => new Map<string, number>());
  let slots = 0;
  let anomalySlots = 0;
  const afterNormal = { anomaly: 0, total: 0 };
  const others = { anomaly: 0, total: 0 };
  let prevNormal = new Set<string>();
  for (let seed = 1; seed <= o.laps; seed++) {
    const rounds = draw(pool, { difficulty, rng: mulberry32(seed), history: o.carry ? rec[difficulty].history : undefined, foundKinds: o.carry ? rec[difficulty].kinds : undefined });
    const normalThisLap = new Set<string>();
    for (let slot = 0; slot < ROUNDS_TO_CLEAR; slot++) {
      const problem = rounds[slot]!.problem;
      slots++;
      const bucket = prevNormal.has(problem.companyId) ? afterNormal : others;
      bucket.total++;
      if (problem.anomaly !== null) bucket.anomaly++;
      else normalThisLap.add(problem.companyId);
      if (problem.anomaly !== null) {
        anomalySlots++;
        const counts = kindCounts[GROUPS.findIndex((g) => g.includes(slot))]!;
        counts.set(problem.anomaly.kind, (counts.get(problem.anomaly.kind) ?? 0) + 1);
      }
      const ok = accuracy >= 1 || player() < accuracy;
      if (o.carry) rec = recordAnswer(rec, { difficulty, round: slot, problem, answer: (problem.anomaly !== null) === ok ? 'anomaly' : 'normal', correct: ok });
      if (!ok) break;
    }
    prevNormal = normalThisLap;
  }
  return { slots, anomalySlots, kindCounts, afterNormal, others };
}

export interface GroupCheck {
  /** 群の候補の ID = 段が狙い以下 (累積) の種類 ID。 */
  candidateIds: string[];
  /** 異変の枠で実際に出た ID。 */
  seenIds: string[];
  /** 出た ID の集合が候補の集合と同じか (DW28 (ii))。 */
  sameIds: boolean;
  /** 最大の割合 ÷ 一様の割合 (1 ÷ 候補の ID の数)。 */
  maxRatio: number;
}

/** 枠の群ごとの、種類の出方 (ID で数える)。 */
export function checkGroups(result: SimResult, kinds: readonly KindSpec[]): GroupCheck[] {
  return GROUPS.map((group, gi) => {
    const target = TIER_BY_ROUND[group[0]!]!;
    const candidateIds = kinds.filter((k) => k.tier <= target).map((k) => k.id).sort();
    const counts = result.kindCounts[gi]!;
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const seenIds = [...counts.keys()].sort();
    const top = Math.max(0, ...counts.values());
    return {
      candidateIds,
      seenIds,
      sameIds: JSON.stringify(seenIds) === JSON.stringify(candidateIds),
      maxRatio: total === 0 ? Infinity : (top / total) * candidateIds.length,
    };
  });
}
