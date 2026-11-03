// 出題 (docs/design.md §5.3)。枠を先に決め、1 社目の枠から順に、重複しない会社を割り当てる。乱数は引数で受ける (純粋)。
import { ROUNDS_TO_CLEAR, TIER_BY_ROUND, anomalyRatio as defaultRatio } from './config';
import type { Difficulty, Problem } from './types';

export interface DrawOptions {
  difficulty: Difficulty;
  rng: () => number;
  /** 難易度ごとの、答えた問題 ID を出た順 (古い順) に並べたもの (P3)。プールに無い ID は無視する。 */
  history?: readonly string[];
  /** 異変ありにする枠の確率。省略 = 設定値。 */
  anomalyRatio?: number;
}

type TierSet = ReadonlySet<number> | null;

/** 8 問を引く。両方 (異変あり・なし) を持つ会社が ROUNDS_TO_CLEAR 社に満たないプールは例外 (黙って重複させない)。 */
export function draw(pool: readonly Problem[], opts: DrawOptions): Problem[] {
  const { rng } = opts;
  const ratio = opts.anomalyRatio ?? defaultRatio;
  const problems = pool.filter((p) => p.difficulty === opts.difficulty);

  const byCompany = new Map<string, Problem[]>();
  for (const p of problems) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);
  const bothSided = [...byCompany.values()].filter((ps) => ps.some((p) => p.anomaly) && ps.some((p) => !p.anomaly));
  if (bothSided.length < ROUNDS_TO_CLEAR) {
    throw new Error(`出題できません: 異変あり・なしの両方を持つ会社が ${bothSided.length} 社 (必要 ${ROUNDS_TO_CLEAR} 社)`);
  }

  // 履歴の順位: 答えていない問題 = -1 (いちばん優先)、答えた問題 = 履歴の位置 (古いほど小さく、優先)
  const rank = new Map<string, number>();
  (opts.history ?? []).forEach((id, i) => rank.set(id, i));
  const rankOf = (p: Problem) => rank.get(p.id) ?? -1;
  // 同じ順位のときの並びは、乱数で決める (種で再現できる)
  const flags = Array.from({ length: ROUNDS_TO_CLEAR }, () => rng() < ratio);
  const tieOfCompany = new Map<string, number>();
  const tieOfProblem = new Map<string, number>();
  for (const [id, ps] of byCompany) {
    tieOfCompany.set(id, rng());
    for (const p of ps) tieOfProblem.set(p.id, rng());
  }

  const tierSets = (slot: number): TierSet[] => {
    const target = TIER_BY_ROUND[slot] ?? 3;
    return [new Set([target]), new Set([target - 1, target, target + 1]), null];
  };
  const matching = (companyId: string, slot: number, tiers: TierSet): Problem[] =>
    (byCompany.get(companyId) ?? []).filter(
      (p) => (p.anomaly !== null) === flags[slot] && (tiers === null || p.tier === undefined || tiers.has(p.tier)),
    );
  const best = (ps: Problem[]): Problem =>
    [...ps].sort((a, b) => rankOf(a) - rankOf(b) || (tieOfProblem.get(a.id) ?? 0) - (tieOfProblem.get(b.id) ?? 0))[0]!;
  const candidates = (slot: number, tiers: TierSet): string[] =>
    [...byCompany.keys()]
      .filter((id) => matching(id, slot, tiers).length > 0)
      .sort(
        (a, b) =>
          rankOf(best(matching(a, slot, tiers))) - rankOf(best(matching(b, slot, tiers))) ||
          (tieOfCompany.get(a) ?? 0) - (tieOfCompany.get(b) ?? 0),
      );

  const slotOf = new Map<string, number>(); // 会社 → 割り当てた枠
  const levelOf: number[] = []; // 枠 → 段の指定の緩め方 (0 = 狙いの段、1 = 隣の段まで、2 = 段を無視)

  // 増加路 (枠 slot に会社を割り当てる。ふさがっていたら、その枠を別の会社へ動かせるか試す)
  const augment = (slot: number, seen: Set<string>): boolean => {
    for (const id of candidates(slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const holder = slotOf.get(id);
      if (holder === undefined || augment(holder, seen)) {
        slotOf.set(id, slot);
        return true;
      }
    }
    return false;
  };

  for (let slot = 0; slot < ROUNDS_TO_CLEAR; slot++) {
    let placed = false;
    for (let level = 0; level < 3 && !placed; level++) {
      levelOf[slot] = level;
      // 先の枠を動かさず、空いている会社のうち最も優先なものを使う。無ければ増加路で先の枠を動かす
      const free = candidates(slot, tierSets(slot)[level] ?? null).find((id) => !slotOf.has(id));
      if (free !== undefined) {
        slotOf.set(free, slot);
        placed = true;
      } else {
        placed = augment(slot, new Set());
      }
    }
    if (!placed) throw new Error('出題できません: 重複しない会社を割り当てられませんでした');
  }

  const companyOfSlot = new Map<number, string>();
  for (const [id, slot] of slotOf) companyOfSlot.set(slot, id);
  return Array.from({ length: ROUNDS_TO_CLEAR }, (_, slot) => {
    const id = companyOfSlot.get(slot)!;
    return best(matching(id, slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null));
  });
}
