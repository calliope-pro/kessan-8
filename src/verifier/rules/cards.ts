// 形のずれの規則 (ケース表 docs/test-cases/cards.md §4。設計 docs/design-v3.md §1.6・§2.9)。問題データからカードを導いて (cardEdits を当てて)、標準のカードと比べる。
// 違反の paths は、食い違った欄の場所 `card.0.<欄の key>` (見出し語は headline、足元は period)。card-period だけは、期のセルと期末日のセル。
import { HEADLINE_WORDS, SIGN_TARGETS, deriveCards, standardText, templateKeys } from '../../domain/cards.ts';
import type { Card, CardSlot } from '../../domain/cards.ts';
import type { Problem } from '../../domain/types.ts';
import { rule } from './dsl.ts';
import type { Ctx, Each, Rule } from './dsl.ts';
import { isoDate } from './nonnumeric.ts';

/** 問題の難易度のカード (cardEdits を当てたもの)。不正な編集 (形に無い欄など) は導けないので null (card-edit-op・anomalyIssues が拾う)。 */
function cardOf(p: Problem, c: Ctx['c']): Card | null {
  try {
    return deriveCards(p, c, p.difficulty);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

const here = (key: string): string => `card.0.${key}`;

/** カードごとに、食い違った欄の場所を返す規則。find が null を返せば満たす。 */
function perCard(id: string, find: (card: Card, ctx: Ctx) => { keys: string[]; message: string } | null): Rule {
  return rule(id, (each: Each, ctx) => {
    const card = cardOf(ctx.p, ctx.c);
    const found = card === null ? null : find(card, ctx);
    if (found === null) return;
    each((r) => {
      r.used.push(...[...new Set(found.keys)].sort().map(here));
      return found.message;
    });
  });
}

const slotsRule = rule('card-slots', (each: Each, ctx) => {
  const card = cardOf(ctx.p, ctx.c);
  if (card === null) return;
  const want = templateKeys(card.difficulty);
  const have = card.slots.map((s) => s.key);
  const missing = want.filter((k) => !have.includes(k));
  const dup = have.filter((k, i) => have.indexOf(k) !== i);
  if (card.footer === undefined) missing.push('period');
  if ((card.headline?.repeat ?? 1) > 1) dup.push('headline');
  const keys = [...missing, ...dup];
  if (keys.length === 0) return;
  each((r) => {
    r.used.push(...[...new Set(keys)].sort().map(here));
    return `カードの欄が形と違う (欠け: ${missing.join('・') || 'なし'}、重複: ${dup.join('・') || 'なし'})`;
  });
});

const NEGATIVE = /^[△▲−-]/;
/** 数字の欄の表示を、符号と数字でない文字を除いて標準の書式と比べる (符号は card-sign、数字でない字は card-digits の仕事)。 */
const bodyOf = (text: string): string => text.replace(NEGATIVE, '');
const isDigitsOnly = (text: string): boolean => /^[0-9,.]+$/.test(bodyOf(text));

export const CARD_RULES: Rule[] = [
  slotsRule,
  perCard('card-unit', (card, ctx) => {
    // 標準の単位 = 比率は %、金額はその資料の header.unit (header.unit そのものの誤りは header-unit の仕事。IR が億円であることはデータの検査 card-ir-unit)
    const standard = (s: CardSlot) => (s.measure === 'percent' ? '%' : ctx.p[s.reads[0]?.startsWith('ir.') ? 'ir' : 'tanshin'].header.unit);
    const keys = card.slots.filter((s) => s.kind === 'number' && s.unit !== standard(s)).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `金額・比率の単位の語が標準と違う欄: ${keys.join('・')}` };
  }),
  perCard('card-format', (card) => {
    const keys = card.slots.filter((s) => s.kind === 'number' && isDigitsOnly(s.text) && bodyOf(s.text) !== bodyOf(standardText(s))).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `数字の書式が標準と違う欄: ${keys.join('・')}` };
  }),
  perCard('card-headline', (card) => {
    const word = card.headline?.word;
    if (word === undefined || (HEADLINE_WORDS as readonly string[]).includes(word)) return null;
    return { keys: ['headline'], message: `見出し語 ${word} が、この形が見せる量の組 (${HEADLINE_WORDS.join('・')}) にない` };
  }),
  // 足元の期末日 (損益の当期の列見出し) が、表題の期 (header.periodLabel。例 2027年3月期) の月末日と合うか。期の表記そのものの誤りは header-period-label の仕事。ほかの 2 画面の列見出しは dates-column-headings が見る
  rule('card-period', (each) => {
    each((r) => {
      const actual = r.raw('tanshin', 'columnDates.incomeStatement.current');
      const label = String(r.raw('tanshin', 'header.periodLabel'));
      const m = /^(\d{4})年(\d{1,2})月期$/.exec(label);
      const expected = m === null ? null : isoDate(Number(m[1]), Number(m[2]));
      return expected !== null && actual === expected ? null : `足元の期末日 ${String(actual)} が、期 ${label} の期末日 ${expected ?? '(期の表記が読めない)'} と合わない`;
    });
  }),
  perCard('card-sign', (card) => {
    const keys = card.slots.filter((s) => SIGN_TARGETS.includes(s.key) && s.raw !== 0 && NEGATIVE.test(s.text)).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `正でなければならない欄の表示に負の記号が付いている: ${keys.join('・')}` };
  }),
  perCard('card-column-suffix', (card) => {
    const keys = card.slots
      .filter((s) => {
        if (s.column === undefined) return false;
        const word = s.column === 'previous' ? '前期' : '当期';
        return !s.label.includes(`(${word}`);
      })
      .map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `科目名の添え字が列 (前期・当期) と合わない欄: ${keys.join('・')}` };
  }),
  perCard('card-digits', (card) => {
    const keys = card.slots.filter((s) => s.kind === 'number' && !isDigitsOnly(s.text)).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `数字の欄の表示に数字・カンマ・小数点以外の字がある: ${keys.join('・')}` };
  }),
  perCard('card-date-valid', (card) => {
    const m = /^(\d+)年(\d+)月(\d+)日$/.exec(card.footer?.periodEnd ?? '');
    if (m === null) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return d >= 1 && d <= last ? null : { keys: ['period'], message: `足元の期末日 ${card.footer?.periodEnd} は、実在しない日付` };
  }),
];
