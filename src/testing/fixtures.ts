// 試験用の問題・会社・異変の種類 (遊びの流れの確かめ用。会計の整合は保証しない)。本番のバンドルには入れない。
import type { AnomalyKind, Company, Difficulty, Problem } from '../domain/types';
import base from './base-problem.json';

export type Tier = 1 | 2 | 3;

export const TEST_KINDS: AnomalyKind[] = [
  { id: 'k-calc', family: 'calculation', name: '合計の計算違い', primaryRules: ['r1'], allowedRules: ['r1'] },
  { id: 'k-cross', family: 'cross-document', name: '資料間の食い違い', primaryRules: ['r2'], allowedRules: ['r2'] },
];

export function companyIdOf(index: number): string {
  return `c${String(index).padStart(2, '0')}`;
}

/** 試験用の会社 (架空)。index は 1 から。 */
export function makeCompanies(count: number): Company[] {
  const marks = ['◆', '●', '■', '▲', '▼', '★'];
  return Array.from({ length: count }, (_, i) => ({
    id: companyIdOf(i + 1),
    name: `第${i + 1}試作電機株式会社`,
    securitiesCode: `08${String(i + 1).padStart(2, '0')}`,
    industry: '電機部品',
    segmentNames: ['電機部品事業', '産業機器事業'],
    fiscalYearEndMonth: 3,
    irUnit: '百万円' as const,
    emblem: marks[i % marks.length] ?? '◆',
    colors: { main: '#1F4E79', light: '#E6EEF5' },
    business: '電機部品を作る会社です。',
  }));
}

export interface MakeProblemOptions {
  id: string;
  difficulty: Difficulty;
  companyId: string;
  /** 異変の種類 ID。省略 = 異変なし (正常)。 */
  kind?: string;
  tier?: Tier;
  /** 異変の場所。省略 = 種類に合わせた既定。 */
  places?: NonNullable<Problem['anomaly']>['places'];
}

/** 基準問題から 1 問を作る (JSON の深いコピー)。 */
export function makeProblem(o: MakeProblemOptions): Problem {
  const p = JSON.parse(JSON.stringify(base)) as Problem;
  p.id = o.id;
  p.difficulty = o.difficulty;
  p.companyId = o.companyId;
  if (o.tier !== undefined) p.tier = o.tier;
  if (o.kind === undefined) {
    p.anomaly = null;
  } else {
    const places =
      o.places ??
      (o.kind === 'k-cross'
        ? [
            { doc: 'tanshin' as const, path: 'balanceSheet.current.cash' },
            { doc: 'ir' as const, path: 'supplement.cash.current' },
          ]
        : [{ doc: 'tanshin' as const, path: 'incomeStatement.current.ordinaryIncome' }]);
    p.anomaly = { kind: o.kind, places, explanation: `${o.id}: 数字が食い違っています。`, expectedRules: ['r1'] };
  }
  return p;
}

export interface PoolSpec {
  difficulty: Difficulty;
  /** 会社の数 (c01 から)。 */
  companies: number;
  /** 段 (省略 = 段 1・2・3 の全部。null = 段の項目を付けない)。 */
  tiers?: Tier[] | null;
  /** 異変あり・なしのうち、どちらを持つか (会社の番号 → 持つ側)。省略 = 全社が両方。 */
  sides?: (companyIndex: number) => ('normal' | 'anomaly')[];
}

/** 会社 × {異変なし, 異変あり} × 段 の問題のプール。ID は `<難易度>-<会社番号>-<n|a>-<段>`。 */
export function makePool(spec: PoolSpec): Problem[] {
  const tiers: (Tier | undefined)[] = spec.tiers === null ? [undefined] : (spec.tiers ?? [1, 2, 3]);
  const out: Problem[] = [];
  for (let c = 1; c <= spec.companies; c++) {
    const sides = spec.sides ? spec.sides(c) : (['normal', 'anomaly'] as const);
    for (const side of sides) {
      for (const tier of tiers) {
        const kind = side === 'anomaly' ? (out.length % 2 === 0 ? 'k-calc' : 'k-cross') : undefined;
        out.push(
          makeProblem({
            id: `${spec.difficulty}-${c}-${side === 'anomaly' ? 'a' : 'n'}-${tier ?? 0}`,
            difficulty: spec.difficulty,
            companyId: companyIdOf(c),
            kind,
            tier,
          }),
        );
      }
    }
  }
  return out;
}
