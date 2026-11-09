// 出題 v3 (docs/design-v3.md §1.5 R-S2・R-S3・§2.7。ケース表 docs/test-cases/domain-v3.md §1)。
// 形は難易度ごとに 1 つなので、形を引かない。枠ごとに異変の有無を引き、重複しない会社を 1 社目の枠から順に割り当てる。
// 段は累積 (狙いの段以下)・履歴は直近 HISTORY_WINDOW 件・見つけた種類は後回し。乱数は引数で受ける (純粋)。
import { HISTORY_WINDOW, ROUNDS_TO_CLEAR, TIER_BY_ROUND, anomalyRatio as defaultRatio } from './config';
import type { Difficulty, Problem, Round } from './types';

export interface DrawOptions {
  difficulty: Difficulty;
  rng: () => number;
  /** 答えた問題 ID を出た順 (古い順) に並べたもの (P3)。末尾の `HISTORY_WINDOW` 件だけを「答えた」と数える。プールに無い ID は無視する。 */
  history?: readonly string[];
  /** 見つけた異変の種類 ID (`records` の `kinds`)。その種類の問題は後回しにする (除外はしない)。プールに無い ID は無視する。 */
  foundKinds?: readonly string[];
  /** 異変ありにする枠の確率。省略 = 設定値。 */
  anomalyRatio?: number;
}

/** 段の指定。null = 段を無視する (全部)。 */
type TierSet = ReadonlySet<number> | null;

const ofDifficulty = (pool: readonly Problem[], difficulty: Difficulty): Problem[] => pool.filter((p) => p.difficulty === difficulty);

/**
 * その難易度で、どんな枠の並びになっても `draw` が例外にならないか (十分条件)。
 * 正常な問題を持つ会社が 8 社以上あり、異変の問題を持つ会社も 8 社以上ある。同じ会社が両方を持つ必要は無い (会社ごとの両方は検証器の R-S5 (b))。
 * 十分な理由: 第 s 枠を割り当てるとき、先の枠が使った会社は高々 7 社で、その枠の異変の有無に合う問題を持つ会社は 8 社以上あるので、
 * 段を無視する最後の候補に、まだ使っていない会社が必ず残る。画面は、できない難易度の選択を無効にして「準備中」を出す。
 */
export function canDraw(pool: readonly Problem[], difficulty: Difficulty): boolean {
  const problems = ofDifficulty(pool, difficulty);
  return [true, false].every((anomaly) => new Set(problems.filter((p) => (p.anomaly !== null) === anomaly).map((p) => p.companyId)).size >= ROUNDS_TO_CLEAR);
}

/** 8 枠を引く。重複しない会社を割り当てられないときは例外 (黙って重複させない。公開版では `canDraw` が true なので起きない)。 */
export function draw(pool: readonly Problem[], opts: DrawOptions): Round[] {
  const { rng } = opts;
  const ratio = opts.anomalyRatio ?? defaultRatio;
  const problems = ofDifficulty(pool, opts.difficulty);

  // R-S2: 枠ごとに異変の有無を引く (R-S1 の形の抽選は無い)
  const flags = Array.from({ length: ROUNDS_TO_CLEAR }, () => rng() < ratio);

  const byCompany = new Map<string, Problem[]>();
  for (const p of problems) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);

  // 優先: (見つけた種類の問題か → 答えていない問題が先・答えた問題は古い方が先 → 乱数)。
  // 履歴は直近 HISTORY_WINDOW 件だけを「答えた」と数える (それより古いものは答えていない扱い。履歴の順位: 答えていない問題 = -1)
  const rank = new Map<string, number>();
  (opts.history ?? []).slice(-HISTORY_WINDOW).forEach((id, i) => rank.set(id, i));
  const found = new Set(opts.foundKinds ?? []);
  const foundOf = (p: Problem): number => (p.anomaly !== null && found.has(p.anomaly.kind) ? 1 : 0);
  const rankOf = (p: Problem): number => rank.get(p.id) ?? -1;
  const tieOfCompany = new Map<string, number>();
  const tieOfProblem = new Map<string, number>();
  for (const [id, ps] of byCompany) {
    tieOfCompany.set(id, rng());
    for (const p of ps) tieOfProblem.set(p.id, rng());
  }
  const order = (a: Problem, b: Problem): number => foundOf(a) - foundOf(b) || rankOf(a) - rankOf(b) || (tieOfProblem.get(a.id) ?? 0) - (tieOfProblem.get(b.id) ?? 0);

  // 段は累積: 第 1 候補 = 狙いの段以下。第 1 候補で割り当てられない枠は、段を無視する (全部)。正常な問題は段を持たず、どちらでも通る
  const tierSets = (slot: number): TierSet[] => {
    const target = TIER_BY_ROUND[slot] ?? 3;
    return [new Set(Array.from({ length: target }, (_, i) => i + 1)), null];
  };
  // R-S3: 候補 = 枠の異変の有無に合う問題 (正常は全部・異変は全部。段の指定だけで絞る)
  const matching = (companyId: string, slot: number, tiers: TierSet): Problem[] =>
    (byCompany.get(companyId) ?? []).filter((p) => (p.anomaly !== null) === flags[slot] && (tiers === null || p.tier === undefined || tiers.has(p.tier)));
  const best = (ps: Problem[]): Problem => [...ps].sort(order)[0]!;
  // 会社の並び: (その会社の最優先の問題が見つけた種類か → その問題の履歴の順位 → 会社の乱数)。問題の乱数では並べない (種類の出方が偏る。ケース表 §0)
  const candidates = (slot: number, tiers: TierSet): string[] => {
    const top = new Map<string, Problem>();
    for (const id of byCompany.keys()) {
      const ps = matching(id, slot, tiers);
      if (ps.length > 0) top.set(id, best(ps));
    }
    return [...top.keys()].sort((a, b) => {
      const pa = top.get(a)!;
      const pb = top.get(b)!;
      return foundOf(pa) - foundOf(pb) || rankOf(pa) - rankOf(pb) || (tieOfCompany.get(a) ?? 0) - (tieOfCompany.get(b) ?? 0);
    });
  };

  const slotOf = new Map<string, number>(); // 会社 → 割り当てた枠
  const levelOf: number[] = []; // 枠 → 段の指定の緩め方 (0 = 狙いの段以下、1 = 段を無視)

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
    for (let level = 0; level < 2 && !placed; level++) {
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
    return { problem: best(matching(id, slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null)) };
  });
}
