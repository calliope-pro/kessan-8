// 形のずれの規則 (ケース表 docs/test-cases/cards.md §3。設計 docs/design-v2.md §1.6・§2.8)。問題データからカードを導いて (cardEdits を当てて)、標準のカードと比べる。
// 違反の paths は、食い違った欄の場所 `card.<形>.<カードの番号>.<欄の key>` (見出し語は headline)。card-period だけは、列見出しと期の表記のセル。
import { deriveCards, headlineWords, shapesOf, standardText, templateKeys } from '../../domain/cards.ts';
import type { Card, CardSlot } from '../../domain/cards.ts';
import type { Problem, ShapeId } from '../../domain/types.ts';
import { rule } from './dsl.ts';
import type { Ctx, Each, Rule } from './dsl.ts';
import { isoDate } from './nonnumeric.ts';

/** 問題の難易度の形ごとのカード (cardEdits を当てたもの)。不正な編集 (形に無い欄など) は導けないので null (anomalyIssues が拾う)。 */
function cardsOf(p: Problem, c: Ctx['c'], shape: ShapeId, applyEdits = true): Card[] | null {
  try {
    return deriveCards(p, c, shape, { applyEdits });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** 画面ごとの単位の差し替え (第 1 版の見た目の異変) は unit-consistency の仕事。card-unit は cardEdits の unit の編集だけを見る。 */
const withoutUnitOverrides = (p: Problem): Problem => {
  const { unitOverrides: _ignored, ...rest } = p;
  return rest;
};

const here = (shape: ShapeId, card: number, key: string): string => `card.${shape}.${card}.${key}`;

/** 形ごと・カードごとに、食い違った欄の場所を返す規則。find が空を返せば満たす。 */
function perCard(id: string, find: (card: Card, shape: ShapeId, ci: number, ctx: Ctx) => { keys: string[]; message: string } | null, view: (p: Problem) => Problem = (p) => p): Rule {
  return rule(id, (each, ctx) => {
    for (const shape of shapesOf(ctx.p.difficulty)) {
      (cardsOf(view(ctx.p), ctx.c, shape) ?? []).forEach((card, ci) => {
        const found = find(card, shape, ci, ctx);
        if (found === null) return;
        each((r) => {
          r.used.push(...[...new Set(found.keys)].sort().map((k) => here(shape, ci, k)));
          return found.message;
        });
      });
    }
  });
}

const slotsRule = rule('card-slots', (each: Each, ctx) => {
  for (const shape of shapesOf(ctx.p.difficulty)) {
    const edited = cardsOf(ctx.p, ctx.c, shape);
    const template = templateKeys(shape);
    (edited ?? []).forEach((card, ci) => {
      const tk = template[ci] ?? [];
      const ek = card.slots.map((s) => s.key);
      const missing = tk.filter((k) => !ek.includes(k));
      const dup = ek.filter((k, i) => ek.indexOf(k) !== i);
      const moved = missing.length === 0 && dup.length === 0 ? ek.filter((k, i) => tk[i] !== k) : [];
      const keys = [...missing, ...dup, ...moved];
      if (keys.length === 0) return;
      each((r) => {
        r.used.push(...[...new Set(keys)].sort().map((k) => here(shape, ci, k)));
        return `${shape} のカード ${ci} の欄が形と違う (欠け: ${missing.join('・') || 'なし'}、重複: ${dup.join('・') || 'なし'}、並び: ${moved.join('・') || 'なし'})`;
      });
    });
  }
});

export const CARD_RULES: Rule[] = [
  slotsRule,
  perCard('card-unit', (card, _shape, _ci, ctx) => {
    // 標準の単位 = 比率は %、金額はその資料の header.unit (header.unit そのものの誤りは header-unit の仕事)
    const standard = (s: CardSlot) => (s.measure === 'percent' ? '%' : ctx.p[s.reads[0]?.startsWith('ir.') ? 'ir' : 'tanshin'].header.unit);
    const keys = card.slots.filter((s) => s.kind === 'number' && s.unit !== standard(s)).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `金額・比率の単位の語が標準と違う欄: ${keys.join('・')}` };
  }, withoutUnitOverrides),
  perCard('card-format', (card, _shape, _ci, ctx) => {
    const keys = card.slots.filter((s) => s.kind === 'number' && s.text !== standardText(s, ctx.c)).map((s) => s.key);
    return keys.length === 0 ? null : { keys, message: `数字の書式が標準と違う欄: ${keys.join('・')}` };
  }),
  perCard('card-headline', (card, shape, ci) => {
    const words = headlineWords(shape, ci);
    if (words === null || card.headline === undefined || words.includes(card.headline.word)) return null;
    return { keys: ['headline'], message: `見出し語 ${card.headline.word} が、この形が見せる量の組 (${words.join('・')}) にない` };
  }),
  // カードの枠の期 (header.periodLabel。例 2027年3月期) と、表の当期の列見出しの期末日が合うか。期の表記そのものの誤りは header-period-label の仕事
  rule('card-period', (each, ctx) => {
    for (const screen of ['balanceSheet', 'incomeStatement', 'cashFlow']) {
      each((r) => {
        const actual = r.raw('tanshin', `columnDates.${screen}.current`);
        const label = String(r.raw('tanshin', 'header.periodLabel'));
        const m = /^(\d{4})年(\d{1,2})月期$/.exec(label);
        const expected = m === null ? null : isoDate(Number(m[1]), Number(m[2]));
        return expected !== null && actual === expected ? null : `${screen} の当期の列見出し ${String(actual)} が、期 ${label} の期末日 ${expected ?? '(期の表記が読めない)'} と合わない`;
      });
    }
  }),
];
