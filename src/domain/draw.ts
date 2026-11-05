// 出題 v2 (docs/design-v2.md §1.5 R-S1〜S3・§3.4。ケース表 docs/test-cases/domain-v2.md §1)。
// 枠ごとに形を先に引き (異変の有無を見ない別の乱数の流れ)、次に異変の有無を引き、その形で見える問題だけを候補にして、
// 1 社目の枠から順に重複しない会社を割り当てる。乱数は引数で受ける (純粋)。
import { shapesOf } from './cards';
import { ROUNDS_TO_CLEAR, TIER_BY_ROUND, anomalyRatio as defaultRatio } from './config';
import { mulberry32 } from './rng';
import type { Difficulty, Problem, Round, ShapeId } from './types';

export interface DrawOptions {
  difficulty: Difficulty;
  rng: () => number;
  /**
   * 問題が見える形 (R-S4)。正常な問題は難易度の全形、異変の問題は V1・V2 を満たす形。本番は `src/data/visible.ts` の `makeVisible`。
   * 1 回の `draw`・`canDraw` で、各問題に高々 1 回しか呼ばない (検証器を回すので重い)。
   */
  visible: (problem: Problem) => readonly ShapeId[];
  /** 難易度ごとの、答えた問題 ID を出た順 (古い順) に並べたもの (P3)。プールに無い ID は無視する。 */
  history?: readonly string[];
  /** 見つけた異変の種類 ID (`records` の `kinds`)。その種類の問題は後回しにする (除外はしない)。プールに無い ID は無視する。 */
  foundKinds?: readonly string[];
  /** 異変ありにする枠の確率。省略 = 設定値。 */
  anomalyRatio?: number;
}

type TierSet = ReadonlySet<number> | null;

const ofDifficulty = (pool: readonly Problem[], difficulty: Difficulty): Problem[] => pool.filter((p) => p.difficulty === difficulty);

/** 問題ごとに `visible` を 1 回だけ呼んで引く表を作る。 */
function visibleTable(problems: readonly Problem[], visible: DrawOptions['visible']): Map<Problem, readonly ShapeId[]> {
  return new Map(problems.map((p) => [p, visible(p)]));
}

/**
 * その難易度で、どんな枠の並びになっても `draw` が例外にならないか (十分条件。R-S5 (a))。
 * 難易度のどの形についても、その形で見える異変の問題を持つ会社が 8 社以上あり、正常な問題を持つ会社も 8 社以上ある。
 * 同じ会社が両方を持つ必要は無い (会社ごとの両方は検証器の R-S5 (b))。画面は、できない難易度の選択を無効にして「準備中」を出す。
 */
export function canDraw(pool: readonly Problem[], difficulty: Difficulty, visible: DrawOptions['visible']): boolean {
  const problems = ofDifficulty(pool, difficulty);
  const table = visibleTable(problems, visible);
  return shapesOf(difficulty).every((shape) =>
    [true, false].every((anomaly) => {
      const companies = new Set(problems.filter((p) => (p.anomaly !== null) === anomaly && table.get(p)?.includes(shape)).map((p) => p.companyId));
      return companies.size >= ROUNDS_TO_CLEAR;
    }),
  );
}

/** 8 枠を引く。重複しない会社を割り当てられないときは例外 (黙って重複させない。公開版では `canDraw` が true なので起きない)。 */
export function draw(pool: readonly Problem[], opts: DrawOptions): Round[] {
  const { rng } = opts;
  const ratio = opts.anomalyRatio ?? defaultRatio;
  const problems = ofDifficulty(pool, opts.difficulty);
  const shapesOfProblem = visibleTable(problems, opts.visible);

  // R-S1: 形は、異変の有無を見ずに、枠ごとに難易度の形から一様に引く。rng の最初の 1 値から作る別の流れ (同じ種から作る) だけを使うので、
  // 異変の比・プール・履歴・見つけた種類に依らず、同じ種なら同じ並びになる
  const shapeRng = mulberry32(Math.floor(rng() * 4294967296));
  const shapeChoices = shapesOf(opts.difficulty);
  const roundShapes = Array.from({ length: ROUNDS_TO_CLEAR }, () => shapeChoices[Math.floor(shapeRng() * shapeChoices.length)]!);
  // R-S2: 次に異変の有無を引く
  const flags = Array.from({ length: ROUNDS_TO_CLEAR }, () => rng() < ratio);

  const byCompany = new Map<string, Problem[]>();
  for (const p of problems) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);

  // 優先: (見つけた種類の問題か → 答えていない問題が先・答えた問題は古い方が先 → 乱数)。履歴の順位: 答えていない問題 = -1
  const rank = new Map<string, number>();
  (opts.history ?? []).forEach((id, i) => rank.set(id, i));
  const found = new Set(opts.foundKinds ?? []);
  const foundOf = (p: Problem): number => (p.anomaly !== null && found.has(p.anomaly.kind) ? 1 : 0);
  const rankOf = (p: Problem): number => rank.get(p.id) ?? -1;
  const tieOfCompany = new Map<string, number>();
  const tieOfProblem = new Map<string, number>();
  for (const [id, ps] of byCompany) {
    tieOfCompany.set(id, rng());
    for (const p of ps) tieOfProblem.set(p.id, rng());
  }
  const order = (a: Problem, b: Problem): number =>
    foundOf(a) - foundOf(b) || rankOf(a) - rankOf(b) || (tieOfProblem.get(a.id) ?? 0) - (tieOfProblem.get(b.id) ?? 0);

  const tierSets = (slot: number): TierSet[] => {
    const target = TIER_BY_ROUND[slot] ?? 3;
    return [new Set([target]), new Set([target - 1, target, target + 1]), null];
  };
  // R-S3: 候補 = 枠の異変の有無に合い、枠の形で見える問題 (正常な問題はどの形でも見える)
  const matching = (companyId: string, slot: number, tiers: TierSet): Problem[] =>
    (byCompany.get(companyId) ?? []).filter(
      (p) =>
        (p.anomaly !== null) === flags[slot] &&
        shapesOfProblem.get(p)?.includes(roundShapes[slot]!) === true &&
        (tiers === null || p.tier === undefined || tiers.has(p.tier)),
    );
  const best = (ps: Problem[]): Problem => [...ps].sort(order)[0]!;
  const candidates = (slot: number, tiers: TierSet): string[] =>
    [...byCompany.keys()]
      .filter((id) => matching(id, slot, tiers).length > 0)
      .sort((a, b) => order(best(matching(a, slot, tiers)), best(matching(b, slot, tiers))) || (tieOfCompany.get(a) ?? 0) - (tieOfCompany.get(b) ?? 0));

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
    return { problem: best(matching(id, slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null)), shape: roundShapes[slot]! };
  });
}
