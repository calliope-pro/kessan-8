// やさしいの異変の問題を作る道具 (Sub-task #168。設計表 docs/plans/problems-easy-v3.md・ケース表 docs/test-cases/problems-easy-v3.md)。
// 基の正常な問題の 1 か所だけを変え (1 つの異変 = 1 つの変更)、anomaly (場所・答え合わせの文・期待集合・基・差のセル) を書く。
// 期待集合は、検証器に実際にかけて落ちた hard の規則 (手書きしない)。生成物は src/data/problems/easy/*.json で、JSON が唯一の出所。
import { deriveCards } from '../../src/domain/cards.ts';
import type { Card } from '../../src/domain/cards.ts';
import { LABELS } from '../../src/domain/labels.ts';
import type { AnomalyPlace, CardEdit, Company, Problem } from '../../src/domain/types.ts';
import { verifyProblem } from '../../src/verifier/index.ts';
import { changedCells } from '../../src/verifier/path.ts';

/** spec-v3.json の異変 1 件 (docs/plans/problems-easy/make-spec-v3.py の出力)。 */
export interface SpecEntry {
  id: string;
  company: string;
  fiscalYear: number;
  kind: string;
  tier: 1 | 2 | 3;
  base: string;
  edit: Record<string, unknown>;
}

// ---- 純関数 (ケース表 U 群) ----

/** 年を years だけずらし、ずらした年のその月の末日にする (2024-02-29 +1 年 = 2025-02-28。日付は文字列で扱い、Date で整形しない)。 */
export function shiftYearEnd(iso: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (m === null) throw new RangeError(`日付 ${iso} が YYYY-MM-DD でない`);
  const [y, mo] = [Number(m[1]) + years, Number(m[2])];
  return `${y}-${String(mo).padStart(2, '0')}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** 表示した数字のうち、first・middle・last の数字の字の添字 (カンマ・符号は飛ばして、数字だけを数える)。middle は ⌊数字の数 ÷ 2⌋ 番目。 */
export function glyphIndex(text: string, which: 'first' | 'middle' | 'last'): number {
  const at = [...text].flatMap((c, i) => (/\d/.test(c) ? [i] : []));
  if (at.length === 0) throw new RangeError(`数字の無い表示 ${JSON.stringify(text)} に字を当てられない`);
  return at[which === 'first' ? 0 : which === 'last' ? at.length - 1 : Math.floor(at.length / 2)] as number;
}

/** 表示した数字の整数部の桁数 (カンマ・符号・小数点以下を数えない)。 */
export function digitsOf(text: string): number {
  return (text.replace(/[^\d.]/g, '').split('.')[0] ?? '').length;
}

/** 売上高を営業利益の ratio 倍にする (10 の倍数。E-24)。 */
export function salesBelowOperating(op: number, ratio: number): number {
  return Math.round((op * ratio) / 10) * 10;
}

/** 営業利益率を factor 倍にする (小数第 1 位。E-12)。 */
export function scaleMargin(margin: number, factor: number): number {
  return Math.round(margin * factor * 10) / 10;
}

/** 営業利益を 10 倍・1/10 にする (E-02。再計算しない)。 */
export function scaleOperating(op: number, dir: 'up' | 'down'): number {
  return dir === 'up' ? op * 10 : op / 10;
}

/** 会社ごとの口調 (docs/plans/problems-easy/gen.py の TONE と同じ語)。(増の語, 減の語)。 */
const TONE: Record<string, readonly [string, string]> = {
  c01: ['上回った', '下回った'],
  c02: ['上回りました', '下回りました'],
  c03: ['増', '減'],
  c04: ['伸びた', '縮んだ'],
  c05: ['上回った', '下回った'],
  c06: ['増加', '減少'],
  c07: ['上回った', '下回った'],
  c08: ['上回りました', '下回りました'],
  c09: ['上回りました', '下回りました'],
  c10: ['増加', '減少'],
};

/** IR の文の、営業利益を述べる文 (「。」で区切った 1 文) だけの向きの語を、to の向きに替える。売上高の文は変えない。 */
export function flipOperatingText(text: string, to: 'up' | 'down', companyId: string): string {
  const tone = TONE[companyId];
  if (tone === undefined) throw new RangeError(`会社 ${companyId} の口調が無い`);
  const [up, down] = tone;
  const [from, word] = to === 'down' ? [up, down] : [down, up];
  let hit = false;
  const out = text.split('。').map((sentence) => {
    if (hit || !sentence.includes('営業利益') || !sentence.includes(from)) return sentence;
    hit = true;
    const i = sentence.lastIndexOf(from);
    return sentence.slice(0, i) + word + sentence.slice(i + from.length);
  });
  if (!hit) throw new RangeError(`営業利益の文に ${from} が無い: ${text}`);
  return out.join('。');
}

// ---- 答え合わせの文 (ケース表 A4: 2 文まで・1 文 60 字以内・比べる 2 つの値を表示のとおりに含む) ----

export interface ExplainCtx {
  /** 異変の問題 (編集後) とそのカード (cardEdits・labelOverrides を当てたもの)。 */
  p: Problem;
  card: Card;
  /** 基の正常な問題のカード。 */
  baseCard: Card;
  edit: Record<string, unknown>;
}

const nameOf = (label: string): string => label.replace(/ \(.*\)$/, '');
const text = (card: Card, key: string): string => card.slots.find((s) => s.key === key)?.text ?? '';
const label = (card: Card, key: string): string => card.slots.find((s) => s.key === key)?.label ?? '';

/** 種類ごとの答え合わせの文 (K1・K6・K7 の型を短くしたもの)。台帳に無い種類は RangeError。 */
const EXPLAINED = ['E-17', 'E-02', 'E-24', 'E-12', 'E-04', 'E-03', 'E-05', 'E-19', 'E-22', 'E-21', 'E-25', 'E-26', 'E-27', 'E-23', 'E-28'];
export function explanationFor(kind: string, c: ExplainCtx): string {
  if (!EXPLAINED.includes(kind)) throw new RangeError(`台帳に無い種類 ${kind}`);
  const { card, baseCard: bc, edit: e } = c;
  const [prev, cur, sales] = [text(card, 'opPrev'), text(card, 'opCurr'), text(card, 'sales')];
  const slot = String(e.slot);
  switch (kind) {
    case 'E-17': {
      const grew = Number(c.p.tanshin.incomeStatement.current.operatingIncome) > Number(c.p.tanshin.incomeStatement.previous.operatingIncome);
      return `見出しは「${card.headline?.word}」ですが、営業利益は前期 ${prev} から当期 ${cur} へ${grew ? '増えて' : '減って'}います。見出しと数字の向きが逆です。`;
    }
    case 'E-02':
      return `営業利益 (当期) が ${cur} で、前期の ${prev} から桁が 1 つ${e.factor === 10 ? '増えて' : '減って'}います。`;
    case 'E-24':
      return `売上高 ${sales} が、営業利益 ${cur} より小さくなっています。売上高は営業利益より大きいはずです。`;
    case 'E-12':
      return `営業利益率は ${text(card, 'margin')}% と書かれていますが、営業利益 ÷ 売上高では ${text(bc, 'margin')}% です。`;
    case 'E-04':
      return `表題は ${card.frame.periodLabel} ですが、足元の期末日は ${card.footer?.periodEnd} です。期末日は、その期の末日のはずです。`;
    case 'E-03':
      return `「${nameOf(label(card, slot))}」だけ単位が「億円」で、ほかの欄は「百万円」です。`;
    case 'E-05':
      return `科目名が「${String(e.word)}」になっています。正しくは「${LABELS[String(e.itemKey)]}」です。`;
    case 'E-19':
      return `「${label(bc, slot)}」の欄がありません。どのカードにも、この欄があるはずです。`;
    case 'E-22':
      return slot === 'headline' ? `見出し「${card.headline?.word}」が 2 回出ています。見出しは 1 つのはずです。` : `「${nameOf(label(card, slot))}」の欄が 2 回出ています。同じ欄は 1 つのはずです。`;
    case 'E-21':
      return `${nameOf(label(card, slot))}の数字が ${text(card, slot)} と書かれています。正しくは ${text(bc, slot)} です。`;
    case 'E-25':
      return `売上高が ${sales} と、マイナスで書かれています。売上高はマイナスになりません。`;
    case 'E-26':
      return `「${label(card, slot)}」の行が 2 つあり、${prev} と ${cur} が入っています。同じ期の数字が 2 つあるはずはありません。`;
    case 'E-27':
      return `${text(card, slot)} の数字に「X」が混じっています。数字の欄に、数字以外の字は入りません。`;
    case 'E-23':
      return `見出しが「${String(e.word)}」ですが、このカードの見出しは「${bc.headline?.word}」のように、もうけで書きます。営業利益は前期 ${prev} から当期 ${cur} で、向きは合っています。`;
    case 'E-28': {
      const m = /(\d+)月/.exec(card.footer?.periodEnd ?? '');
      return `期末日が ${card.footer?.periodEnd} と、存在しない日付になっています。${m?.[1] ?? ''}月に 32 日はありません。`;
    }
    default:
      throw new RangeError(`台帳に無い種類 ${kind}`);
  }
}

// ---- 異変の問題を作る ----

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const cellsOf = (cells: Record<string, string>) => cells;
const CELL = cellsOf({ sales: 'incomeStatement.current.netSales', op: 'incomeStatement.current.operatingIncome', margin: 'summary.operatingMargin', date: 'columnDates.incomeStatement.current' });
const card = (slot: string): AnomalyPlace => ({ doc: 'card', card: 0, slot });

/** 基の正常な問題から、spec の異変 1 件の問題を作る。 */
export function inject(base: Problem, company: Company, entry: SpecEntry): Problem {
  if (base.anomaly !== null) throw new RangeError(`基 ${base.id} が異変の問題`);
  const e = entry.edit;
  const q = clone(base);
  let places: AnomalyPlace[] = [];
  let cardEdit: CardEdit | undefined;
  const IS = q.tanshin.incomeStatement;
  const baseCard = deriveCards(base, company, 'easy');
  switch (entry.kind) {
    case 'E-17': {
      const index = q.ir.statements.findIndex((s) => s.claims.some((cl) => cl.metric === 'operatingIncome'));
      const st = q.ir.statements[index];
      if (st === undefined) throw new RangeError(`${base.id}: 営業利益の主張が無い`);
      st.claims.find((cl) => cl.metric === 'operatingIncome')!.direction = e.to as 'up' | 'down';
      st.text = flipOperatingText(st.text, e.to as 'up' | 'down', base.companyId);
      places = [{ doc: 'ir', path: `statements.${index}` }];
      break;
    }
    case 'E-02':
      IS.current.operatingIncome = scaleOperating(IS.current.operatingIncome, e.factor === 10 ? 'up' : 'down');
      places = [{ doc: 'tanshin', path: CELL.op as string }];
      break;
    case 'E-24':
      IS.current.netSales = salesBelowOperating(IS.current.operatingIncome, e.ratio as number);
      places = [{ doc: 'tanshin', path: CELL.sales as string }, { doc: 'tanshin', path: CELL.op as string }];
      break;
    case 'E-12':
      q.tanshin.summary.operatingMargin = scaleMargin(q.tanshin.summary.operatingMargin, e.factor as number);
      places = [{ doc: 'tanshin', path: CELL.margin as string }];
      break;
    case 'E-04':
      q.tanshin.columnDates.incomeStatement.current = shiftYearEnd(q.tanshin.columnDates.incomeStatement.current, e.years as number);
      places = [{ doc: 'tanshin', path: CELL.date as string }, { doc: 'tanshin', path: 'header.periodLabel' }];
      break;
    case 'E-05':
      q.labelOverrides = { [String(e.itemKey)]: String(e.word) };
      places = [{ doc: 'tanshin', itemKey: String(e.itemKey) }];
      break;
    case 'E-03':
      cardEdit = { card: 0, slot: String(e.slot), op: 'unit', unit: String(e.unit) };
      break;
    case 'E-19':
      cardEdit = { card: 0, slot: String(e.slot), op: 'drop' };
      break;
    case 'E-22':
      cardEdit = { card: 0, slot: String(e.slot), op: 'dup' };
      break;
    case 'E-21':
      cardEdit = { card: 0, slot: String(e.slot), op: 'format', style: e.style as 'no-comma' | 'comma-shift' };
      break;
    case 'E-25':
      cardEdit = { card: 0, slot: 'sales', op: 'sign' };
      break;
    case 'E-26':
      cardEdit = { card: 0, slot: e.slot as 'opPrev' | 'opCurr', op: 'suffix', word: e.word as '前期' | '当期' };
      break;
    case 'E-27':
      cardEdit = { card: 0, slot: String(e.slot), op: 'glyph', at: glyphIndex(baseCard.slots.find((s) => s.key === e.slot)?.text ?? '', e.digit as 'first' | 'middle' | 'last') };
      break;
    case 'E-23':
      cardEdit = { card: 0, op: 'headline', word: String(e.word) };
      places = [card('headline')];
      break;
    case 'E-28':
      cardEdit = { card: 0, slot: 'period', op: 'day', day: 32 };
      places = [card('period')];
      break;
    default:
      throw new RangeError(`台帳に無い種類 ${entry.kind}`);
  }
  if (cardEdit !== undefined) {
    q.cardEdits = [cardEdit];
    if (places.length === 0) places = [card('slot' in cardEdit ? cardEdit.slot : 'headline')];
  }
  const edited = deriveCards(q, company, 'easy');
  const expectedRules = [...new Set(verifyProblem(q, company).hard.map((v) => v.rule))].sort();
  const explanation = explanationFor(entry.kind, { p: q, card: edited, baseCard, edit: e });
  const anomaly = { kind: entry.kind, places, explanation, expectedRules, base: base.id, changed: changedCells(base, q) };
  // キーの並びは、正常な問題と同じ (id・difficulty・companyId・fiscalYear・tier・tanshin・ir)。cardEdits・labelOverrides・anomaly は最後
  return {
    id: entry.id,
    difficulty: 'easy',
    companyId: q.companyId,
    fiscalYear: q.fiscalYear,
    tier: entry.tier,
    tanshin: q.tanshin,
    ir: q.ir,
    ...(q.labelOverrides === undefined ? {} : { labelOverrides: q.labelOverrides }),
    ...(q.cardEdits === undefined ? {} : { cardEdits: q.cardEdits }),
    anomaly,
  };
}
