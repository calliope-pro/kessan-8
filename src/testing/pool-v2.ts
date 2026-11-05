// 出題 v2 (draw) の試験用プール (docs/test-cases/domain-v2.md §0)。問題が見える形 (visible) は、問題とは別に持つ。会計の整合は保証しない。本番のバンドルには入れない。
import { shapesOf } from '../domain/cards';
import type { Difficulty, Problem, ShapeId } from '../domain/types';
import { companyIdOf, makeProblem, type Tier } from './fixtures';

export interface ProblemSpec {
  /** ID の末尾 (`<難易度>-<会社>-<tag>`)。 */
  tag: string;
  /** 異変の種類 ID。省略 = 正常な問題 (全形で見える)。 */
  kind?: string;
  /** 異変の問題が見える形。省略 = 難易度の全形 (正常な問題はこれ)。 */
  shapes?: ShapeId[];
  tier?: Tier;
}

export interface TestPool {
  pool: Problem[];
  /** 問題 → 見える形。数える版は `counting`。 */
  visible: (p: Problem) => readonly ShapeId[];
}

/** 会社の番号の並びと、会社ごとの問題の仕様から、プールと visible を作る。 */
export function buildPool(difficulty: Difficulty, companies: readonly number[], specsOf: (company: number) => ProblemSpec[]): TestPool {
  const shapesById = new Map<string, readonly ShapeId[]>();
  const pool: Problem[] = [];
  for (const c of companies) {
    for (const s of specsOf(c)) {
      const p = makeProblem({ id: `${difficulty}-${c}-${s.tag}`, difficulty, companyId: companyIdOf(c), kind: s.kind, tier: s.tier });
      shapesById.set(p.id, s.kind === undefined ? shapesOf(difficulty) : (s.shapes ?? shapesOf(difficulty)));
      pool.push(p);
    }
  }
  return { pool, visible: (p) => shapesById.get(p.id) ?? [] };
}

export const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export interface PoolV2Spec {
  difficulty: Difficulty;
  /** 会社の数 (c01 から)。省略 = 10。 */
  companies?: number;
  /** 段。省略 = 会社と形で 1〜3 を回す。'all' = (会社, 形) ごとに段 1・2・3。null = 段の項目を付けない。[3] = 段 3 だけ。 */
  tiers?: 'rotate' | 'all' | null | Tier[];
  /** (会社, 形) ごとの異変の種類の数。2 のとき種類 `kA`・`kB` を 1 問ずつ。省略 = 1 (種類は会社の偶奇で `kA`・`kB`)。 */
  kindsPerShape?: 1 | 2;
}

/** 1 社 = 正常 1 + 形ごとの異変 (その形だけで見える)。設計 R-S5 (d) の構成。 */
export function makePoolV2(spec: PoolV2Spec): TestPool {
  const shapes = shapesOf(spec.difficulty);
  const tiersFor = (rotate: Tier): (Tier | undefined)[] => {
    const t = spec.tiers ?? 'rotate';
    if (t === 'all') return [1, 2, 3];
    if (t === null) return [undefined];
    if (t === 'rotate') return [rotate];
    return t;
  };
  return buildPool(spec.difficulty, range(1, spec.companies ?? 10), (c) => {
    const out: ProblemSpec[] = [];
    for (const tier of tiersFor((((c % 3) + 1) as Tier))) out.push({ tag: `n${tier ?? 0}`, tier });
    shapes.forEach((shape, i) => {
      for (const tier of tiersFor((((c + i) % 3) + 1) as Tier)) {
        if (spec.kindsPerShape === 2) {
          out.push({ tag: `${shape}-A-${tier ?? 0}`, kind: 'kA', shapes: [shape], tier });
          out.push({ tag: `${shape}-B-${tier ?? 0}`, kind: 'kB', shapes: [shape], tier });
        } else {
          out.push({ tag: `${shape}-${tier ?? 0}`, kind: c % 2 === 0 ? 'kA' : 'kB', shapes: [shape], tier });
        }
      }
    });
    return out;
  });
}

/**
 * 偏ったプール (R-S6 用)。1 社 = 正常 1 + 異変 4: 形 0・1 で見える 2 問・形 0 だけの 1 問・形 2 だけの 1 問。
 * どの形も異変を持つ会社が全社あるが、問題の数は形で偏る (形 0 = 3 問/社・形 1 = 2・形 2 = 1)。
 */
export function makeSkewedPool(difficulty: Difficulty, companies = 10): TestPool {
  const [s0, s1, s2] = shapesOf(difficulty) as [ShapeId, ShapeId, ShapeId];
  return buildPool(difficulty, range(1, companies), (c) => [
    { tag: 'n', tier: (((c % 3) + 1) as Tier) },
    { tag: 'x1', kind: 'kA', shapes: [s0, s1], tier: (((c % 3) + 1) as Tier) },
    { tag: 'x2', kind: 'kB', shapes: [s0, s1], tier: ((((c + 1) % 3) + 1) as Tier) },
    { tag: 'y', kind: 'kA', shapes: [s0], tier: ((((c + 2) % 3) + 1) as Tier) },
    { tag: 'z', kind: 'kB', shapes: [s2], tier: (((c % 3) + 1) as Tier) },
  ]);
}

/** 複数の難易度のプールを 1 つにまとめる (難易度の混在)。 */
export function mergePools(...parts: TestPool[]): TestPool {
  const maps = parts.map((t) => t.visible);
  const owner = new Map<string, number>();
  parts.forEach((t, i) => t.pool.forEach((p) => owner.set(p.id, i)));
  return { pool: parts.flatMap((t) => t.pool), visible: (p) => maps[owner.get(p.id) ?? 0]!(p) };
}

/** visible を呼んだ回数を、問題 ID ごとに数える。 */
export function counting(visible: TestPool['visible']): { visible: TestPool['visible']; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  return {
    calls,
    visible: (p) => {
      calls.set(p.id, (calls.get(p.id) ?? 0) + 1);
      return visible(p);
    },
  };
}
