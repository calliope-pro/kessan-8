// カードの整合・構造・許容集合・見える条件・二重の食い違い・最小のずれ (ケース表 docs/test-cases/cards.md §3・§2.2・§5・§6・§9。設計 docs/design-v3.md §1.2・§1.6・§2.8・§2.9)。形は難易度ごとに 1 つ。
import { CARD_LIMITS, CARD_TEXT_MAX, HEADLINE_WORDS, SIGN_TARGETS, cardCells, deriveCards, limitGroupOf, placeSlots, placeVisible, templateKeys } from '../domain/cards.ts';
import type { Card } from '../domain/cards.ts';
import { RELATION_CHECKS } from '../domain/types.ts';
import type { AnomalyKind, AnomalyPlace, Company, Problem, RelationCheck } from '../domain/types.ts';
import { verifyProblem } from './index.ts';
import type { VerifyResult } from './index.ts';
import { roundHalfAway, scaled10 } from './math.ts';
import { getPath } from './path.ts';

// ---- 構造・文字数 ----

const GROUP_NAME = { card: 'カード', doc1: '資料 1', doc2: '資料 2' } as const;

/** 数字・文の数が上限を超える、の文。allowance = 欄の重複 (dup) を持つ異変のカードに許す +1 (責任者の決定 2026-11-08 問 1 = (b))。 */
export function cardLimitIssues(card: Card, allowance = 0): string[] {
  const out: string[] = [];
  const limits = CARD_LIMITS[card.difficulty];
  for (const g of ['card', 'doc1', 'doc2'] as const) {
    const slots = card.slots.filter((s) => limitGroupOf(s.section) === g);
    const limit = limits[g];
    if (limit === undefined) {
      if (slots.length > 0) out.push(`${GROUP_NAME[g]}: ${card.difficulty} の形に無い欄が ${slots.length} 個`);
      continue;
    }
    const numbers = slots.filter((s) => s.kind === 'number').length;
    const texts = slots.filter((s) => s.kind === 'text').length;
    if (numbers > limit.numbers + allowance) out.push(`${GROUP_NAME[g]}: 数字が ${numbers} 個 (上限 ${limit.numbers + allowance})`);
    if (texts > limit.texts + allowance) out.push(`${GROUP_NAME[g]}: 文欄が ${texts} 個 (上限 ${limit.texts + allowance})`);
  }
  return out;
}

/** 欄の並びが形の定義と違う・数字や文の数が上限を超える・見出し語が出ていない、の文 (空 = 構造は正しい)。 */
export function cardStructureIssues(card: Card): string[] {
  const out: string[] = [];
  const keys = card.slots.map((s) => s.key);
  const want = templateKeys(card.difficulty);
  if (keys.join() !== want.join()) out.push(`欄の並びが形と違う (形: ${want.join('・')}、実際: ${keys.join('・')})`);
  if (card.headline === undefined) out.push('見出し語が出ていない (IR の文章に営業利益の主張が無い)');
  return [...out, ...cardLimitIssues(card)];
}

/** 文欄の text が 40 字 (CARD_TEXT_MAX) を超える欄の文。文字数は [...text].length (サロゲート対を 1 字)。 */
export function cardTextLengthIssues(card: Card): string[] {
  const out: string[] = [];
  for (const s of card.slots) {
    const n = [...s.text].length;
    if (s.kind === 'text' && n > CARD_TEXT_MAX) out.push(`card.0.${s.key}: ${n} 字 (上限 ${CARD_TEXT_MAX})`);
  }
  return out;
}

// ---- 関係 (card-relation の 5 検査) ----

export interface RelationIssue {
  check: RelationCheck;
  message: string;
}

/** 検査が読む欄 (欄が無いと値が NaN になり、その欄を読む検査が落ちる)。 */
const RELATION_READS: Record<RelationCheck, string[]> = {
  'R-dir': ['headline', 'opPrev', 'opCurr'],
  'R-margin': ['margin', 'opCurr', 'sales'],
  'R-range': ['opPrev', 'opCurr'],
  'R-ne': ['opPrev', 'opCurr'],
  'R-lt': ['opCurr', 'sales'],
};

/** 導出したカードの関係 (R-dir・R-margin・R-range・R-ne・R-lt。設計 §1.2)。表示の文字列でなく raw (データの値) と見出し語の語を読む (空 = 整合)。 */
export function cardRelationIssues(card: Card): RelationIssue[] {
  const raw = (key: string): number => {
    const r = card.slots.find((s) => s.key === key)?.raw;
    return typeof r === 'number' ? r : Number.NaN;
  };
  const [sales, prev, cur, margin] = [raw('sales'), raw('opPrev'), raw('opCurr'), raw('margin')];
  const out: RelationIssue[] = [];
  const bad = (check: RelationCheck, message: string): void => {
    out.push({ check, message });
  };
  const word = card.headline?.word;
  if (word !== undefined) {
    const change = cur - prev;
    const expected = change > 0 ? HEADLINE_WORDS[0] : change < 0 ? HEADLINE_WORDS[1] : undefined;
    if (word !== expected) bad('R-dir', `見出し語 ${word} が営業利益の向き (${prev} → ${cur}) と合わない`);
  }
  const exact = Number.isFinite(sales) && sales !== 0 && Number.isFinite(cur) ? roundHalfAway(cur * 1000, sales) : Number.NaN;
  if (Math.round(margin * 10) !== exact) bad('R-margin', `営業利益率 ${margin} が 営業利益 ÷ 売上高 (${cur} ÷ ${sales}) の四捨五入と合わない`);
  if (!(prev > 0 && 2 * cur >= prev && cur <= 2 * prev)) bad('R-range', `営業利益 (当期) ${cur} が前期 ${prev} の 0.5〜2 倍の外`);
  if (!(Number.isFinite(prev) && Number.isFinite(cur) && cur !== prev)) bad('R-ne', `営業利益 (当期) ${cur} が前期 ${prev} と同じ`);
  if (!(cur < sales)) bad('R-lt', `営業利益 (当期) ${cur} が売上高 ${sales} 未満でない`);
  return out;
}

/** この異変の問題で、落ちてよい card-relation の検査: 種類の relationChecks + 欄の drop で落とした欄を読む検査 (設計 §1.2 の表)。 */
export function relationAllowed(problem: Problem, kind: AnomalyKind): RelationCheck[] {
  const allowed = new Set<RelationCheck>(kind.relationChecks ?? []);
  for (const e of problem.cardEdits ?? []) {
    if (e.op !== 'drop') continue;
    for (const check of RELATION_CHECKS) if (RELATION_READS[check].includes(e.slot)) allowed.add(check);
  }
  return [...allowed];
}

// ---- cardEdits の当てかた (設計 §1.6) ----

/** cardEdits が、§1.6 の op ごとに当ててよい欄に当たっているか (検査 5 とは別の検査)。形に無い欄の編集は、ここでは数えない (anomalyIssues が拾う)。 */
export function cardEditIssues(problem: Problem, company: Company): string[] {
  const edits = problem.cardEdits ?? [];
  if (edits.length === 0) return [];
  let card: Card;
  try {
    card = deriveCards(problem, company, problem.difficulty, { applyEdits: false });
  } catch (error) {
    if (error instanceof RangeError) return [];
    throw error;
  }
  const out: string[] = [];
  const intDigits = (text: string) => (text.replace(/[^\d.]/g, '').split('.')[0] ?? '').length;
  for (const e of edits) {
    const at = `cardEdits (${e.op})`;
    const find = (key: string) => card.slots.find((s) => s.key === key);
    switch (e.op) {
      case 'unit': {
        const s = find(e.slot);
        if (s === undefined) break;
        if (s.measure !== 'money') out.push(`${at}: 単位を表示する金額の欄でない (${e.slot})`);
        else if (s.unit === e.unit) out.push(`${at}: ${e.slot} の単位 ${e.unit} は正常の語と同じで、見た目が変わらない`);
        break;
      }
      case 'format': {
        const s = find(e.slot);
        if (s === undefined) break;
        const need = e.style === 'no-comma' ? 4 : 5;
        if (s.measure !== 'money') out.push(`${at}: 金額の欄でない (${e.slot})`);
        else if (intDigits(s.text) < need) out.push(`${at}: ${e.slot} の表示 ${s.text} の整数部が ${need} 桁未満で、書式を変えても見た目が変わらない`);
        break;
      }
      case 'suffix':
        if (e.slot !== 'opPrev' && e.slot !== 'opCurr') out.push(`${at}: 添え字を取り違えられるのは opPrev・opCurr だけ (${String(e.slot)})`);
        break;
      case 'glyph': {
        const s = find(e.slot);
        if (s === undefined) break;
        if (!Number.isInteger(e.at) || !/^\d$/.test([...s.text][e.at] ?? '')) out.push(`${at}: ${e.slot} の表示 ${s.text} の添字 ${e.at} は数字の文字でない`);
        break;
      }
      case 'sign': {
        const s = find(e.slot);
        if (s === undefined) break;
        if (!SIGN_TARGETS.includes(e.slot)) out.push(`${at}: ${e.slot} は符号の異変の対象外 (対象: ${SIGN_TARGETS.join('・')})`);
        else if (typeof s.raw !== 'number' || s.raw <= 0) out.push(`${at}: ${e.slot} の値 ${String(s.raw)} は正でない (値が 0 や負の欄に △ を付けても、あり得ない符号にならない)`);
        break;
      }
      case 'day':
        if (e.slot !== 'period') out.push(`${at}: 日を変えられるのは period だけ`);
        break;
      case 'headline':
        if (!['増収', '減収'].includes(e.word)) out.push(`${at}: 見出し語 ${e.word} は、元の語の組 (${HEADLINE_WORDS.join('・')}) の外 (増収・減収) でない`);
        break;
      case 'drop':
        if (e.slot === 'headline' || e.slot === 'frame') out.push(`${at}: 表題・見出し語は消さない (${e.slot})`);
        break;
      case 'dup':
        break;
    }
  }
  return out;
}

// ---- 見える条件 (R-S4 の V1・V2・検査 5) ----

/** カードの欄の「見えるもの」だけの表示モデル (検査 5)。出す文字列 (科目名・添え字・資金の範囲を含む)・数字の文字列・単位の語・見える順の位置・欄の有無・見出し語 (語と繰り返し)・表題・足元・資料 2 の表題。編集の印 (op・style)・欄の key・itemKey は入れない。 */
function viewOf(card: Card, key: string): string {
  switch (key) {
    case 'headline':
      return JSON.stringify(card.headline === undefined ? null : { w: card.headline.word, r: card.headline.repeat });
    case 'frame':
      return JSON.stringify({ n: card.frame.companyName, s: card.frame.securitiesCode, e: card.frame.emblem, p: card.frame.periodLabel });
    case 'frame.period':
      return JSON.stringify({ p: card.frame.periodLabel, e: card.footer?.periodEnd ?? null });
    case 'period':
      return JSON.stringify(card.footer?.periodEnd ?? null);
    case 'irHead':
      return JSON.stringify(card.irFrame === undefined ? null : { n: card.irFrame.companyName, p: card.irFrame.periodLabel });
    default:
      return JSON.stringify(card.slots.flatMap((s, pos) => (s.key === key ? [{ pos, label: s.label, text: s.text, unit: s.unit }] : [])));
  }
}

/** 検査 5: places の欄の表示が基の同じ欄と違うか (どれか 1 つの欄でも違えばよい)。cardEdits の問題は、場所をテンプレートのカードで引く (drop は欠けた位置)。 */
export function displayChanges(problem: Problem, base: Problem, company: Company): boolean {
  const anomaly = problem.anomaly;
  if (anomaly === null) return false;
  try {
    const template = deriveCards(problem, company, problem.difficulty, { applyEdits: false });
    const edited = deriveCards(problem, company, problem.difficulty);
    const reference = deriveCards({ ...base, difficulty: problem.difficulty }, company, problem.difficulty);
    return anomaly.places.flatMap((p) => placeSlots(template, p)).some((key) => viewOf(edited, key) !== viewOf(reference, key));
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export interface Visibility {
  /** V1 を満たさない場所 (カードに載らない)。 */
  missingPlaces: string[];
  /** V2: 主な規則の違反で、paths がすべてカードに載るものがあるか。 */
  v2: boolean;
  /** 検査 5 (基があるときだけ): places の欄の表示が基と変わるか。基が無いとき null。 */
  v3: boolean | null;
}

const placeKey = (p: AnomalyPlace): string => (p.doc === 'card' ? `card.${p.card}.${p.slot}` : 'itemKey' in p ? p.itemKey : `${p.doc}.${p.path}`);

/** 異変の問題の V1・V2・検査 5 (cardEdits の問題は V1・V2 をテンプレートのカードで判定する)。種類が引けない・導けない問題は、V1 に全部の場所を載せる。 */
export function cardVisibility(problem: Problem, company: Company, kinds: AnomalyKind[], result: VerifyResult = verifyProblem(problem, company), base?: Problem): Visibility {
  const anomaly = problem.anomaly;
  const kind = kinds.find((k) => k.id === anomaly?.kind);
  if (anomaly === null || kind === undefined) return { missingPlaces: anomaly?.places.map(placeKey) ?? [], v2: false, v3: null };
  let cells: Set<string>;
  try {
    cells = cardCells(deriveCards(problem, company, problem.difficulty, { applyEdits: false }));
  } catch (error) {
    if (error instanceof RangeError) return { missingPlaces: anomaly.places.map(placeKey), v2: false, v3: null };
    throw error;
  }
  const visible = (p: AnomalyPlace): boolean => (p.doc === 'card' || 'itemKey' in p ? cells.has(placeKey(p)) : placeVisible(cells, placeKey(p)));
  const v2 = [...result.hard, ...result.soft].some((v) => kind.primaryRules.includes(v.rule) && v.paths.length > 0 && v.paths.every((path) => cells.has(path)));
  return { missingPlaces: anomaly.places.filter((p) => !visible(p)).map(placeKey), v2, v3: base === undefined ? null : displayChanges(problem, base, company) };
}

/** 見える (V1 かつ V2 かつ検査 5 が偽でない)。正常な問題は常に見える。種類が引けない異変は見えない。 */
export function isVisible(problem: Problem, company: Company, kinds: AnomalyKind[], result?: VerifyResult, base?: Problem): boolean {
  if (problem.anomaly === null) return true;
  if (!kinds.some((k) => k.id === problem.anomaly?.kind)) return false;
  const v = cardVisibility(problem, company, kinds, result, base);
  return v.missingPlaces.length === 0 && v.v2 && v.v3 !== false;
}

/** 二重の食い違い (§2.8 の検査 4): 見える問題の、paths がカードに収まる hard の違反のうち、種類の primaryRules の外の規則。 */
export function doubleDiscrepancies(problem: Problem, company: Company, kinds: AnomalyKind[], result: VerifyResult = verifyProblem(problem, company), base?: Problem): string[] {
  const kind = kinds.find((k) => k.id === problem.anomaly?.kind);
  if (kind === undefined || !isVisible(problem, company, kinds, result, base)) return [];
  const cells = cardCells(deriveCards(problem, company, problem.difficulty, { applyEdits: false }));
  const onCard = result.hard.filter((v) => v.paths.length > 0 && v.paths.every((p) => cells.has(p)));
  return [...new Set(onCard.map((v) => v.rule).filter((r) => !kind.primaryRules.includes(r)))].sort();
}

// ---- 道具なしで気づける最小のずれ (§2.7) ----

type Deviation = (p: Problem, c: Company) => string[];
const cell = (p: Problem, doc: 'tanshin' | 'ir', path: string): number => {
  const v = getPath(p, doc, path);
  return typeof v === 'number' ? v : Number.NaN;
};
const PERIODS = ['previous', 'current'] as const;

const DEVIATIONS: Record<string, Deviation> = {
  // 売上高 (当期) が営業利益 (当期) の 0.8 倍以下 (「小さい」と一目で分かる。設計 v3 §2.8)
  'E-24': (p) => {
    const [sales, op] = [cell(p, 'tanshin', 'incomeStatement.current.netSales'), cell(p, 'tanshin', 'incomeStatement.current.operatingIncome')];
    return 10 * sales <= 8 * op ? [] : [`E-24: 売上高 ${sales} が営業利益 ${op} の 0.8 倍以下でない (最小のずれ: 0.8 倍)`];
  },
  // 営業利益 (当期) が前期の 10 倍以上 (増益) か 1/10 以下 (減益。向きを変えない方。設計 v3 §2.8)
  'E-02': (p) => {
    const [prev, cur] = [cell(p, 'tanshin', 'incomeStatement.previous.operatingIncome'), cell(p, 'tanshin', 'incomeStatement.current.operatingIncome')];
    const ok = cur > prev ? cur >= 10 * prev : 10 * cur <= prev;
    return ok ? [] : [`E-02: 営業利益 ${prev} → ${cur} が、前期の 10 倍以上か 1/10 以下でない (最小のずれ: 10 倍・1/10)`];
  },
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
