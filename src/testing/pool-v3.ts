// 出題 v3 (draw) の試験用プール (docs/test-cases/domain-v3.md §0)。形が無いので、問題の配列だけを返す。会計の整合は保証しない。本番のバンドルに入れない。
import type { Difficulty, Problem } from '../domain/types';
import { companyIdOf, makeProblem, type Tier } from './fixtures';

export interface ProblemSpec {
  /** ID の末尾 (`<難易度>-<会社>-<tag>`)。 */
  tag: string;
  /** 異変の種類 ID。省略 = 正常な問題。 */
  kind?: string;
  /** 段。正常な問題は付けない (段を持たない)。 */
  tier?: Tier;
}

export const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** 会社の番号の並びと、会社ごとの問題の仕様から、プールを作る。 */
export function buildPool(difficulty: Difficulty, companies: readonly number[], specsOf: (company: number) => ProblemSpec[]): Problem[] {
  return companies.flatMap((c) =>
    specsOf(c).map((s) => makeProblem({ id: `${difficulty}-${c}-${s.tag}`, difficulty, companyId: companyIdOf(c), kind: s.kind, tier: s.tier })),
  );
}

/** 複数のプールを 1 つにまとめる (難易度の混在)。 */
export const mergePools = (...parts: Problem[][]): Problem[] => parts.flat();

/**
 * 小プール: 1 社 = 正常 1 問 (段なし) + 異変 3 問 (段 1・2・3 を 1 問ずつ。種類は段ごとに全社同じ: 段 1 = K1・段 2 = K2・段 3 = K3)。
 */
export function makeSmallPool(difficulty: Difficulty, companies = 10): Problem[] {
  return buildPool(difficulty, range(1, companies), () => [
    { tag: 'n' },
    { tag: 't1', kind: 'K1', tier: 1 },
    { tag: 't2', kind: 'K2', tier: 2 },
    { tag: 't3', kind: 'K3', tier: 3 },
  ]);
}

/** 設計 v3 §2.2・§2.3 の表の ID と段 (docs/design-v3.md を読んで DW29c が突き合わせる)。`count` = 推奨のプールでの問題の数 (§1.5)。 */
export interface KindSpec {
  id: string;
  tier: Tier;
  count: number;
}

const EASY_TIERS: [string, Tier][] = [['E-17', 1], ['E-12', 3], ['E-02', 1], ['E-24', 1], ['E-03', 1], ['E-05', 1], ['E-19', 2], ['E-22', 1], ['E-21', 1], ['E-25', 1], ['E-23', 2], ['E-04', 3], ['E-26', 1], ['E-27', 1], ['E-28', 2]];
const HARD_TIERS: [string, Tier][] = [['H-01', 3], ['H-03', 3], ['H-04', 3], ['H-05', 3], ['H-20', 3], ['H-13', 2], ['H-17', 1], ['H-19', 2], ['H-21', 2], ['H-22', 1], ['H-23', 2], ['H-24', 2], ['H-28', 2], ['H-35', 1], ['H-29', 1], ['H-30', 1], ['H-31', 2], ['H-32', 1], ['H-33', 1], ['H-34', 1]];
/** むずかしいの会計 5 (H-01・H-03・H-04・H-05・H-28)・資料間 6 (H-13・H-17・H-19・H-20・H-21・H-35) = 7 問の 11 種類。 */
export const HARD_PRIMARY: readonly string[] = ['H-01', 'H-03', 'H-04', 'H-05', 'H-28', 'H-13', 'H-17', 'H-19', 'H-20', 'H-21', 'H-35'];

export const EASY_KINDS: readonly KindSpec[] = EASY_TIERS.map(([id, tier]) => ({ id, tier, count: 5 }));
export const HARD_KINDS: readonly KindSpec[] = HARD_TIERS.map(([id, tier]) => ({ id, tier, count: HARD_PRIMARY.includes(id) ? 7 : 5 }));
export const kindsOf = (difficulty: Difficulty): readonly KindSpec[] => (difficulty === 'easy' ? EASY_KINDS : HARD_KINDS);

const COMPANIES = 10;

/**
 * 推奨のプール (設計 v3 §1.5・§2.7・§3.2 #139-2): 会社 10 社・各社に正常 1 問 (段なし)・種類ごとに異変の問題を `count` 問。
 * 段ごとに会社へ順に散らし (種類を並べた順に通し番号を振り、段の中では 0 から数え直す)、各社が持つ異変の問題の数が段ごとに 1 問以内の差になる。
 */
export function makeRecommendedPool(difficulty: Difficulty): Problem[] {
  const specs = new Map<number, ProblemSpec[]>(range(1, COMPANIES).map((c) => [c, [{ tag: 'n' }]]));
  for (const tier of [1, 2, 3] as const) {
    let n = 0;
    for (const k of kindsOf(difficulty)) {
      if (k.tier !== tier) continue;
      for (let j = 0; j < k.count; j++, n++) specs.get((n % COMPANIES) + 1)!.push({ tag: `${k.id}-${j}`, kind: k.id, tier });
    }
  }
  return buildPool(difficulty, range(1, COMPANIES), (c) => specs.get(c)!);
}

/**
 * 偏ったプール (R-S6 の検出力の対照): 推奨のプールと種類・段は同じで、種類ごとに 2 問、通し番号で会社へ順に散らしただけ (段ごとにそろえない)。
 */
export function makeUnevenPool(difficulty: Difficulty): Problem[] {
  const specs = new Map<number, ProblemSpec[]>(range(1, COMPANIES).map((c) => [c, [{ tag: 'n' }]]));
  let n = 0;
  for (const k of kindsOf(difficulty)) {
    for (let j = 0; j < 2; j++, n++) specs.get((n % COMPANIES) + 1)!.push({ tag: `${k.id}-${j}`, kind: k.id, tier: k.tier });
  }
  return buildPool(difficulty, range(1, COMPANIES), (c) => specs.get(c)!);
}
