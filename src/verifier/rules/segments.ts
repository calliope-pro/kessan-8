// 注記のセグメント・見出し・名前の式 (ケース表 §1.3 の seg-*、§1.4)。
import type { Company } from '../../domain/types.ts';
import { eq, PERIODS, rule, sum } from './dsl.ts';
import type { Ctx, Reader, Rule } from './dsl.ts';

const seg = (q: string) => `notes.segments.${q}`;
const countOf = (ctx: Ctx, q: 'previous' | 'current'): number => ctx.p.tanshin.notes.segments[q].segments.length;

const sameNames = (name: string, actual: unknown[], expected: string[]) =>
  actual.length === expected.length && actual.every((a, i) => a === expected[i]) ? null : `${name}: [${actual.join('、')}] ≠ [${expected.join('、')}]`;

function headerRule(id: string, read: (c: Company, doc: 'tanshin' | 'ir') => string, field: string): Rule {
  return rule(id, (each, ctx) => {
    for (const doc of ['tanshin', 'ir'] as const) {
      each((r) => {
        const actual = r.raw(doc, `header.${field}`);
        const expected = read(ctx.c, doc);
        return actual === expected ? null : `${doc} の ${field}: ${String(actual)} ≠ ${expected}`;
      });
    }
  });
}

export const SEGMENT_RULES: Rule[] = [
  rule('seg-sales-sum', (each, ctx) => {
    for (const q of PERIODS) each((r) => eq(`セグメント売上高の合計 (${q})`, sum(...Array.from({ length: countOf(ctx, q) }, (_, i) => r.t(`${seg(q)}.segments.${i}.netSales`))), r.t(`${seg(q)}.consolidatedNetSales`)));
  }),
  rule('seg-profit-sum', (each, ctx) => {
    for (const q of PERIODS) each((r) => eq(`セグメント利益 + 調整額 (${q})`, sum(...Array.from({ length: countOf(ctx, q) }, (_, i) => r.t(`${seg(q)}.segments.${i}.profit`))) + r.t(`${seg(q)}.adjustment`), r.t(`${seg(q)}.consolidatedOperatingIncome`)));
  }),
  rule('seg-consolidated-sales', (each) => {
    for (const q of PERIODS) each((r) => eq(`連結の売上高 (${q})`, r.t(`${seg(q)}.consolidatedNetSales`), r.t(`incomeStatement.${q}.netSales`)));
  }),
  rule('seg-consolidated-profit', (each) => {
    for (const q of PERIODS) each((r) => eq(`連結の営業利益 (${q})`, r.t(`${seg(q)}.consolidatedOperatingIncome`), r.t(`incomeStatement.${q}.operatingIncome`)));
  }),
  headerRule('header-company-name', (c) => c.name, 'companyName'),
  headerRule('header-securities-code', (c) => c.securitiesCode, 'securitiesCode'),
  rule('header-period-label', (each, ctx) => {
    for (const doc of ['tanshin', 'ir'] as const) {
      each((r) => {
        const expected = `${ctx.p.fiscalYear}年${ctx.c.fiscalYearEndMonth}月期`;
        const actual = r.raw(doc, 'header.periodLabel');
        return actual === expected ? null : `${doc} の期の表記: ${String(actual)} ≠ ${expected}`;
      });
    }
  }),
  headerRule('header-unit', (c, doc) => (doc === 'tanshin' ? '百万円' : c.irUnit), 'unit'),
  rule('segment-names', (each, ctx) => {
    const names = ctx.c.segmentNames;
    const readNames = (r: Reader, list: { doc: 'tanshin' | 'ir'; base: string; n: number; field: string }): unknown[] =>
      Array.from({ length: list.n }, (_, i) => r.raw(list.doc, `${list.base}.${i}.${list.field}`));
    for (const q of PERIODS) {
      each((r) => {
        r.used.push(`tanshin.${seg(q)}.segments`); // 入れ物の場所
        return sameNames(`短信のセグメント名 (${q})`, readNames(r, { doc: 'tanshin', base: `${seg(q)}.segments`, n: countOf(ctx, q), field: 'name' }), names);
      });
    }
    each((r) => {
      r.used.push('ir.segments.items'); // 入れ物の場所 (欠けたセグメントの異変の場所)
      return sameNames('IR のセグメント名', readNames(r, { doc: 'ir', base: 'segments.items', n: ctx.p.ir.segments.items.length, field: 'name' }), names);
    });
  }),
  rule('seg-count', (each, ctx) => {
    const n = ctx.c.segmentNames.length;
    for (const q of PERIODS) {
      each((r) => {
        r.used.push(`tanshin.${seg(q)}.segments`);
        return countOf(ctx, q) === n ? null : `短信のセグメントの数 (${q}): ${countOf(ctx, q)} ≠ ${n}`;
      });
    }
    each((r) => {
      r.used.push('ir.segments.items');
      return ctx.p.ir.segments.items.length === n ? null : `IR のセグメントの数: ${ctx.p.ir.segments.items.length} ≠ ${n}`;
    });
  }),
];
