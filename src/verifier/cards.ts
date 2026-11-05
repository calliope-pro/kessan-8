// カードの整合・構造・見える条件・二重の食い違い・最小のずれ (ケース表 docs/test-cases/cards.md §2・§4・§8・§9.3。設計 docs/design-v2.md §1.5・§2.7・§2.8)。
import { CARD_LIMITS, CARD_TEXT_MAX, cardCells, deriveCards, difficultyOfShape, headlineWords, placeVisible, shapesOf, templateKeys } from '../domain/cards.ts';
import type { Card } from '../domain/cards.ts';
import { LABELS, SECTION_OF_ITEM } from '../domain/labels.ts';
import type { AnomalyKind, AnomalyPlace, Company, IrStatement, Problem, ShapeId } from '../domain/types.ts';
import { verifyProblem } from './index.ts';
import type { VerifyResult } from './index.ts';
import { irScaled, roundHalfAway, scaled10 } from './math.ts';
import { getPath } from './path.ts';
import { AUDIT_NOTE, NONE_TEXT } from './rules/nonnumeric.ts';

// ---- 構造・文字数 ----

/** 欄の並びが形の定義と違う・数字や文の数が上限を超える・見出し語が出ていない、の文 (空 = 構造は正しい)。 */
export function cardStructureIssues(cards: Card[], shape: ShapeId): string[] {
  const out: string[] = [];
  const template = templateKeys(shape);
  if (cards.length !== template.length) out.push(`${shape}: カードが ${cards.length} 枚 (形は ${template.length} 枚)`);
  const limits = CARD_LIMITS[difficultyOfShape(shape)];
  cards.forEach((card, ci) => {
    const keys = card.slots.map((s) => s.key);
    const want = template[ci] ?? [];
    if (keys.join() !== want.join()) out.push(`${shape} のカード ${ci}: 欄の並びが形と違う (形: ${want.join('・')}、実際: ${keys.join('・')})`);
    const numbers = card.slots.filter((s) => s.kind === 'number').length + (card.bars?.items.length ?? 0);
    const texts = card.slots.filter((s) => s.kind === 'text').length;
    if (numbers > limits.numbers) out.push(`${shape} のカード ${ci}: 数字が ${numbers} 個 (上限 ${limits.numbers})`);
    if (texts > limits.texts) out.push(`${shape} のカード ${ci}: 文欄が ${texts} 個 (上限 ${limits.texts})`);
    if (headlineWords(shape, ci) !== null && card.headline === undefined) out.push(`${shape} のカード ${ci}: 見出し語が出ていない (IR の文章に主張が無い)`);
  });
  return out;
}

/** 文欄の text が 40 字 (CARD_TEXT_MAX) を超える欄の文。文字数は [...text].length (サロゲート対を 1 字)。 */
export function cardTextLengthIssues(cards: Card[]): string[] {
  const out: string[] = [];
  cards.forEach((card, ci) => {
    for (const s of card.slots) {
      const n = [...s.text].length;
      if (s.kind === 'text' && n > CARD_TEXT_MAX) out.push(`card.${card.shape}.${ci}.${s.key}: ${n} 字 (上限 ${CARD_TEXT_MAX})`);
    }
  });
  return out;
}

// ---- 関係 ----

export interface RelationContext {
  company: Company;
  statements: IrStatement[];
}

const sign = (x: number): number => Math.sign(x);
const num = (card: Card | undefined, key: string): number => {
  const raw = card?.slots.find((s) => s.key === key)?.raw;
  return typeof raw === 'number' ? raw : Number.NaN;
};
const val = (card: Card | undefined, key: string): number | string | boolean | undefined => card?.slots.find((s) => s.key === key)?.raw;

/** 文の主張の向き (その文が持つ metric の direction)。文が引けないときは undefined。 */
function claimDirection(card: Card | undefined, key: string, metric: string, statements: IrStatement[]): string | undefined {
  const ref = card?.slots.find((s) => s.key === key)?.reads[0] ?? '';
  const n = /^ir\.statements\.(\d+)$/.exec(ref)?.[1];
  return n === undefined ? undefined : statements[Number(n)]?.claims.find((c) => c.metric === metric)?.direction;
}

function headlineIssue(card: Card | undefined, change: number, up: string, down: string, shape: string): string[] {
  const word = card?.headline?.word;
  if (word === undefined) return [];
  const expected = change > 0 ? up : change < 0 ? down : undefined;
  return word === expected ? [] : [`${shape}: 見出し語 ${word} が数字の向き (${change > 0 ? '増' : change < 0 ? '減' : '同じ'}) と合わない`];
}

/** 導出したカードの数字・文の関係。カードの raw から独立に再計算する (空 = 整合)。 */
export function cardRelationIssues(cards: Card[], shape: ShapeId, ctx: RelationContext): string[] {
  const out: string[] = [];
  const bad = (cond: boolean, message: string) => {
    if (!cond) out.push(`${shape}: ${message}`);
  };
  const [c0, c1] = cards;
  const unit = ctx.company.irUnit;
  switch (shape) {
    case 'E1': {
      const [prev, cur, sales] = [num(c0, 'opPrev'), num(c0, 'opCur'), num(c0, 'netSales')];
      out.push(...headlineIssue(c0, cur - prev, '増益', '減益', shape));
      bad(sales !== 0 && Math.round(num(c0, 'margin') * 10) === roundHalfAway(cur * 1000, sales), `営業利益率 ${num(c0, 'margin')} が 営業利益 ÷ 売上高 (${cur} ÷ ${sales}) と合わない`);
      break;
    }
    case 'E2': {
      const [prev, cur] = [num(c0, 'salesPrev'), num(c0, 'salesCur')];
      out.push(...headlineIssue(c0, cur - prev, '増収', '減収', shape));
      bad(c0?.bars?.axisMin === 0, `棒の軸の下端 ${c0?.bars?.axisMin} が 0 でない`);
      for (const [key, millions] of [['previous', prev], ['current', cur]] as const) {
        const value = c0?.bars?.items.find((i) => i.key === key)?.value ?? Number.NaN;
        bad(scaled10(value) === irScaled(millions, unit), `棒 (${key}) ${value} が売上高 ${millions} (IR の単位) と合わない`);
      }
      break;
    }
    case 'E3':
      bad(num(c0, 'totalAssets') === num(c0, 'currentAssets') + num(c0, 'fixedAssets'), '資産合計が 流動資産合計 + 固定資産合計 と合わない');
      break;
    case 'H1': {
      bad(num(c0, 'totalAssets') === num(c0, 'totalLiabNet'), '資産合計 ≠ 負債純資産合計');
      bad(scaled10(num(c1, 'netSales')) === irScaled(num(c0, 'salesCur'), unit), 'IR の売上高が短信の売上高 (当期) と合わない');
      const direction = claimDirection(c1, 'claim', 'netSales', ctx.statements);
      const change = sign(num(c0, 'salesCur') - num(c0, 'salesPrev'));
      bad(direction === undefined || (direction === 'up' ? change > 0 : direction === 'down' ? change < 0 : true), `IR の文の売上高の向き (${direction}) が数字と合わない`);
      break;
    }
    case 'H2': {
      bad(num(c0, 'recvChange') + (num(c0, 'recvCur') - num(c0, 'recvPrev')) === 0, '売上債権の増減が 前期末と当期末の差と合わない');
      bad(val(c0, 'policyChange') === (val(c0, 'policyNote') !== NONE_TEXT), '会計方針の変更の有無と注記が合わない');
      const name = String(val(c0, 'recvRow') ?? '');
      const sections = Object.entries(LABELS).filter(([k, label]) => label === name && k in SECTION_OF_ITEM).map(([k]) => SECTION_OF_ITEM[k]);
      bad(sections.every((s) => s === 'asset'), `資産の部の行に資産でない科目名 ${name} がある`);
      const direction = claimDirection(c1, 'claim', 'operatingCashFlow', ctx.statements);
      const cf = num(c0, 'operatingCf');
      bad(direction === undefined || (direction === 'up' ? cf > 0 : direction === 'down' ? cf < 0 : true), `IR の文の営業 CF の向き (${direction}) が数字と合わない`);
      break;
    }
    case 'H3': {
      bad(num(c0, 'cfStart') === num(c0, 'plStart'), 'CF の税引前利益 ≠ 損益の税引前利益');
      bad(num(c0, 'cfEnd') === num(c0, 'cash'), 'CF の期末残高 ≠ 貸借の現金');
      bad(scaled10(num(c1, 'cashCur')) === irScaled(num(c0, 'cash'), unit), 'IR の現金 (当期) が貸借の現金と合わない');
      bad(scaled10(num(c1, 'netDebtPrev')) === scaled10(num(c1, 'debtPrev')) - scaled10(num(c1, 'cashPrev')), '純有利子負債 (前期) ≠ 有利子負債 − 現金');
      bad(val(c0, 'auditNote') === AUDIT_NOTE, '監査の注意書きが標準の文と違う');
      bad((val(c0, 'subsequent') === NONE_TEXT) === (val(c1, 'subsequent') === 'なし'), '後発事象の有無が短信と IR で合わない');
      bad(val(c0, 'segments') === val(c1, 'segments'), 'セグメントの名前の並びが短信と IR で合わない');
      break;
    }
  }
  return out;
}

// ---- 見える条件 (R-S4 の V1・V2) ----

export interface ShapeCheck {
  shape: ShapeId;
  /** V1 を満たさない場所 (カードに載らない)。 */
  missingPlaces: string[];
  /** V2: 主な規則の違反で、paths がすべてカードに載るものがあるか。 */
  v2: boolean;
}

const placeKey = (p: AnomalyPlace): string => (p.doc === 'card' ? `card.${p.shape}.${p.card}.${p.slot}` : 'itemKey' in p ? p.itemKey : `${p.doc}.${p.path}`);

/** 異変の問題の、難易度の形ごとの V1・V2 (cardEdits の問題はテンプレートのカードで判定する)。 */
export function shapeChecks(problem: Problem, company: Company, kinds: AnomalyKind[], result: VerifyResult = verifyProblem(problem, company)): ShapeCheck[] {
  const anomaly = problem.anomaly;
  const kind = kinds.find((k) => k.id === anomaly?.kind);
  if (anomaly === null || kind === undefined) return [];
  return shapesOf(problem.difficulty).map((shape) => {
    const cells = cardCells(deriveCards(problem, company, shape, { applyEdits: false }));
    const missingPlaces = anomaly.places.filter((p) => !(p.doc === 'card' || 'itemKey' in p ? cells.has(placeKey(p)) : placeVisible(cells, placeKey(p)))).map(placeKey);
    const v2 = [...result.hard, ...result.soft].some((v) => kind.primaryRules.includes(v.rule) && v.paths.length > 0 && v.paths.every((path) => cells.has(path)));
    return { shape, missingPlaces, v2 };
  });
}

/** 異変の問題が見える形 (V1 かつ V2)。正常な問題は難易度の全形。種類が引けない異変は空。 */
export function visibleShapes(problem: Problem, company: Company, kinds: AnomalyKind[], result?: VerifyResult): ShapeId[] {
  if (problem.anomaly === null) return shapesOf(problem.difficulty);
  return shapeChecks(problem, company, kinds, result)
    .filter((c) => c.missingPlaces.length === 0 && c.v2)
    .map((c) => c.shape);
}

/** 二重の食い違い (§2.8 の検査 4): 見える形ごとに、paths がカードに収まる hard の違反のうち、種類の primaryRules の外の規則。 */
export function doubleDiscrepancies(problem: Problem, company: Company, kinds: AnomalyKind[], result: VerifyResult = verifyProblem(problem, company)): { shape: ShapeId; rules: string[] }[] {
  const kind = kinds.find((k) => k.id === problem.anomaly?.kind);
  if (kind === undefined) return [];
  const out: { shape: ShapeId; rules: string[] }[] = [];
  for (const shape of visibleShapes(problem, company, kinds, result)) {
    const cells = cardCells(deriveCards(problem, company, shape, { applyEdits: false }));
    const onCard = result.hard.filter((v) => v.paths.length > 0 && v.paths.every((p) => cells.has(p)));
    const rules = [...new Set(onCard.map((v) => v.rule).filter((r) => !kind.primaryRules.includes(r)))].sort();
    if (rules.length > 0) out.push({ shape, rules });
  }
  return out;
}

// ---- 道具なしで気づける最小のずれ (§2.7) ----

type Deviation = (p: Problem, c: Company) => string[];
const cell = (p: Problem, doc: 'tanshin' | 'ir', path: string): number => {
  const v = getPath(p, doc, path);
  return typeof v === 'number' ? v : Number.NaN;
};
const PERIODS = ['previous', 'current'] as const;

const DEVIATIONS: Record<string, Deviation> = {
  // 総資産は元のまま、流動資産の小計をずらす。流動資産合計 + 固定資産合計 と総資産の差が、総資産の 10% 以上
  'E-09': (p) => {
    const out: string[] = [];
    for (const q of PERIODS) {
      const b = `balanceSheet.${q}.`;
      const [ca, fa, total] = [cell(p, 'tanshin', `${b}totalCurrentAssets`), cell(p, 'tanshin', `${b}totalFixedAssets`), cell(p, 'tanshin', `${b}totalAssets`)];
      const diff = Math.abs(ca + fa - total);
      if (diff === 0) continue;
      if (!(10 * diff >= total)) out.push(`E-09 (${q}): 足し算のずれ ${diff} が最小のずれ (総資産 ${total} の 10% = ${total / 10}) に足りない`);
    }
    return out.length > 0 || PERIODS.some((q) => cell(p, 'tanshin', `balanceSheet.${q}.totalAssets`) !== cell(p, 'tanshin', `balanceSheet.${q}.totalCurrentAssets`) + cell(p, 'tanshin', `balanceSheet.${q}.totalFixedAssets`)) ? out : ['E-09: 足し算が合っていない期が無い'];
  },
  // 営業利益率が、正確な値 c = 営業利益 ÷ 売上高 × 100 の 2 倍以上か 1/2 以下
  'E-12': (p) => {
    const [sales, op, m] = [cell(p, 'tanshin', 'incomeStatement.current.netSales'), cell(p, 'tanshin', 'incomeStatement.current.operatingIncome'), scaled10(cell(p, 'tanshin', 'summary.operatingMargin'))];
    const ok = m * sales >= 2 * op * 1000 || 2 * m * sales <= op * 1000;
    return ok ? [] : [`E-12: 営業利益率 ${m / 10}% が正確な値 (${((op / sales) * 100).toFixed(3)}%) の 2 倍以上か 1/2 以下でない (最小のずれ: 2 倍・1/2)`];
  },
  // 描いた長い棒 ÷ 短い棒 が 1.5 以上 (軸の下端 a が 短い数字より小さく、l − a ≥ 1.5 (s − a))
  'E-06': (p) => {
    const chart = (k: 'previous' | 'current') => scaled10(cell(p, 'ir', `results.chart.netSales.${k}`));
    const [s, l] = [Math.min(chart('previous'), chart('current')), Math.max(chart('previous'), chart('current'))];
    const a = scaled10(cell(p, 'ir', 'results.chart.netSales.axisMin'));
    const ok = s > a && 2 * (l - a) >= 3 * (s - a);
    return ok ? [] : [`E-06: 棒の軸の下端 ${a / 10} では、描いた比が最小のずれ (1.5 倍) に足りない、または棒が見えない`];
  },
  // 数字で大きい側の棒が、小さい側の棒の 2/3 以下
  'E-07': (p) => {
    const num10 = (k: 'previous' | 'current') => scaled10(cell(p, 'ir', `results.netSales.${k}`));
    const bar = (k: 'previous' | 'current') => scaled10(cell(p, 'ir', `results.chart.netSales.${k}`));
    if (num10('previous') === num10('current')) return ['E-07: 数字が前期と当期で等しく、棒の向きが決まらない'];
    const [big, small] = num10('current') > num10('previous') ? (['current', 'previous'] as const) : (['previous', 'current'] as const);
    return 3 * bar(big) <= 2 * bar(small) ? [] : [`E-07: 数字の大きい側の棒 ${bar(big) / 10} が、小さい側の棒 ${bar(small) / 10} の 2/3 以下でない (最小のずれ: 2/3)`];
  },
  // 売上債権の増減が、真の値 −(当期末 − 前期末) と、符号が逆か 20% 以上ずれる
  'H-05': (p) => {
    const t = -(cell(p, 'tanshin', 'balanceSheet.current.receivables') - cell(p, 'tanshin', 'balanceSheet.previous.receivables'));
    const x = cell(p, 'tanshin', 'cashFlow.receivablesChange');
    if (t === 0) return ['H-05: 売上債権が前期末と当期末で同じで、ずれの基準が決まらない'];
    return x * t < 0 || 5 * Math.abs(x - t) >= Math.abs(t) ? [] : [`H-05: 売上債権の増減 ${x} が真の値 ${t} と、符号が逆でも 20% 以上でもない (最小のずれ: 20%)`];
  },
  // 純有利子負債が、有利子負債 − 現金 と 20% 以上ずれる (10 倍した整数で比べる)
  'H-20': (p) => {
    const out: string[] = [];
    let any = false;
    for (const q of PERIODS) {
      const t = scaled10(cell(p, 'ir', `supplement.interestBearingDebt.${q}`)) - scaled10(cell(p, 'ir', `supplement.cash.${q}`));
      const n = scaled10(cell(p, 'ir', `supplement.netDebt.${q}`));
      if (n === t) continue;
      any = true;
      if (t === 0) out.push(`H-20 (${q}): 有利子負債 − 現金が 0 で、ずれの基準が決まらない`);
      else if (!(5 * Math.abs(n - t) >= Math.abs(t))) out.push(`H-20 (${q}): 純有利子負債 ${n / 10} が 有利子負債 − 現金 (${t / 10}) と 20% 以上ずれていない (最小のずれ: 20%)`);
    }
    return any ? out : ['H-20: 純有利子負債がずれている期が無い'];
  },
};

/** 異変の問題の種類ごとの最小のずれ (道具なしで気づける大きさ。docs/design-v2.md §2.7)。検査の無い種類・正常な問題は空。 */
export function deviationIssues(problem: Problem, company: Company): string[] {
  const kind = problem.anomaly?.kind;
  const check = kind === undefined ? undefined : DEVIATIONS[kind];
  return check === undefined ? [] : check(problem, company);
}
