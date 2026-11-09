// 試験用の問題・会社・異変の種類 (遊びの流れの確かめ用。会計の整合は保証しない)。本番のバンドルには入れない。
import type { AnomalyKind, CardEdit, Company, Difficulty, Problem } from '../domain/types';
import base from '../domain/fixtures/normal.problem.json' with { type: 'json' };

export type Tier = 1 | 2 | 3;

export const TEST_KINDS: AnomalyKind[] = [
  { id: 'k-calc', family: 'calculation', name: '合計の計算違い', primaryRules: ['r1'], allowedRules: ['r1'] },
  { id: 'k-cross', family: 'cross-document', name: '資料間の食い違い', primaryRules: ['r2'], allowedRules: ['r2'] },
];

export function companyIdOf(index: number): string {
  return `c${String(index).padStart(2, '0')}`;
}

const PALETTE = [
  { main: '#1F4E79', light: '#E6EEF5' },
  { main: '#7A3E00', light: '#F7EBDD' },
  { main: '#1B5E3B', light: '#E3F1E8' },
];

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
    colors: PALETTE[i % PALETTE.length]!,
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
  /** 形のずれの異変 (cardEdits)。 */
  cardEdits?: CardEdit[];
  /** 足元の期末日 (YYYY-MM-DD。E-04 の「期と期末日が合わない」を作るため)。 */
  periodEnd?: string;
  /** 答え合わせの文 (省略 = 「<id>: 数字が食い違っています。」)。 */
  explanation?: string;
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
    p.anomaly = { kind: o.kind, places, explanation: o.explanation ?? `${o.id}: 数字が食い違っています。`, expectedRules: ['r1'] };
    if (o.cardEdits !== undefined) p.cardEdits = o.cardEdits;
    if (o.periodEnd !== undefined) p.tanshin.columnDates.incomeStatement.current = o.periodEnd;
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
        // 異変の種類は会社と段で変える (どの段にも両方の種類が出る)
        const kind = side === 'anomaly' ? ((c + (tier ?? 0)) % 2 === 0 ? 'k-calc' : 'k-cross') : undefined;
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

// ---- 形のずれの異変 (E2E の S14。docs/test-cases/screens-v3.md §0)。種類 ID は本物 (docs/design-v3.md §2.2)。会計の整合は保証しない ----
const slotPlace = (slot: string) => [{ doc: 'card' as const, card: 0 as const, slot }];
interface FormSpec {
  kind: string;
  name: string;
  editOp?: CardEdit['op'];
  edits?: CardEdit[];
  places: NonNullable<Problem['anomaly']>['places'];
  explanation: string;
  periodEnd?: string;
}
export const FORM_SPECS: FormSpec[] = [
  { kind: 'E-19', name: '欄が 1 つ足りない', editOp: 'drop', edits: [{ card: 0, slot: 'margin', op: 'drop' }], places: slotPlace('margin'), explanation: 'いつもある「営業利益率」の欄がありません。' },
  { kind: 'E-21', name: '数字の桁区切りが違う', editOp: 'format', edits: [{ card: 0, slot: 'sales', op: 'format', style: 'no-comma' }], places: slotPlace('sales'), explanation: '「売上高」の桁区切りの位置が、いつもと違います。カンマがありません。' },
  { kind: 'E-22', name: '同じ欄が 2 回出る', editOp: 'dup', edits: [{ card: 0, slot: 'opCurr', op: 'dup' }], places: slotPlace('opCurr'), explanation: '「営業利益 (当期)」の欄が 2 回出ています。' },
  { kind: 'E-25', name: 'あり得ない符号', editOp: 'sign', edits: [{ card: 0, slot: 'sales', op: 'sign' }], places: slotPlace('sales'), explanation: '売上高に △ (マイナス) が付いています。売上高がマイナスになることはありません。' },
  { kind: 'E-26', name: '添え字が取り違えられている', editOp: 'suffix', edits: [{ card: 0, slot: 'opCurr', op: 'suffix', word: '前期' }], places: [...slotPlace('opPrev'), ...slotPlace('opCurr')], explanation: '「営業利益 (前期)」の行が 2 つ並んでいて、違う数字が入っています。' },
  { kind: 'E-27', name: '数字に数字でない字が混じる', editOp: 'glyph', edits: [{ card: 0, slot: 'opCurr', op: 'glyph', at: 1 }], places: slotPlace('opCurr'), explanation: '「営業利益 (当期)」の数字に、数字でない字「X」が混じっています。' },
  { kind: 'E-28', name: '期末日が存在しない日付', editOp: 'day', edits: [{ card: 0, slot: 'period', op: 'day', day: 32 }], places: slotPlace('period'), explanation: '期末が 3月32日になっています。3月に 32 日はありません。' },
  { kind: 'E-04', name: '期と期末日が合わない', places: slotPlace('frame.period'), explanation: '2027年3月期なのに、期末日が 1 年前の日付になっています。', periodEnd: '2026-03-31' },
];

export const FORM_KINDS: AnomalyKind[] = FORM_SPECS.map((f) => ({
  id: f.kind,
  family: 'appearance',
  name: f.name,
  primaryRules: ['card-form'],
  allowedRules: ['card-form'],
  ...(f.editOp ? { editOp: f.editOp } : {}),
}));

/** 形のずれの異変の問題 (やさしい)。種類ごとに 1 問、会社をまたいで置く (c01 から順に)。段は 1 (どの枠にも出る)。 */
export function makeFormProblems(difficulty: Difficulty): Problem[] {
  return FORM_SPECS.map((f, i) =>
    makeProblem({
      id: `${difficulty}-form-${f.kind}`,
      difficulty,
      companyId: companyIdOf((i % 12) + 1),
      kind: f.kind,
      tier: 1,
      places: f.places,
      explanation: f.explanation,
      ...(f.edits ? { cardEdits: f.edits } : {}),
      ...(f.periodEnd ? { periodEnd: f.periodEnd } : {}),
    }),
  );
}
