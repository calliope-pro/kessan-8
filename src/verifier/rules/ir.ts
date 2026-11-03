// IR スライドの中の式と、短信との一致 (ケース表 §1.5)。金額は company.irUnit の単位。比率は短信の百万円から計算する。
import { irScaled, roundHalfAway, scaled10, tenths } from '../math.ts';
import { all, eq, PERIODS, rule, sum } from './dsl.ts';
import type { Ctx, Reader, Rule } from './dsl.ts';
import { growthTenths, METRICS } from './summary.ts';

const is = (q: string, k: string) => `incomeStatement.${q}.${k}`;
const bs = (q: string, k: string) => `balanceSheet.${q}.${k}`;
const nseg = (q: string, i: number, k: string) => `notes.segments.${q}.segments.${i}.${k}`;

/** IR の値 (IR の単位) = 短信の値 (百万円) を換算した値、を 10 倍した整数で比べる。 */
const xdoc = (name: string, r: Reader, irPath: string, tanshinValue: number, ctx: Ctx) =>
  eq(name, scaled10(r.i(irPath)), irScaled(tanshinValue, ctx.c.irUnit));

/** 短信と IR の両方にあるセグメントの添字 (どちらか短い方まで)。 */
const segCount = (ctx: Ctx, q: 'previous' | 'current') => Math.min(ctx.p.ir.segments.items.length, ctx.p.tanshin.notes.segments[q].segments.length);

export const IR_RULES: Rule[] = [
  ...METRICS.map(([m, id]) => rule(`xdoc-hl-${id}`, (each, ctx) => each((r) => xdoc(`ハイライトの${m}`, r, `highlights.${m}.amount`, r.t(is('current', m)), ctx)))),
  ...METRICS.map(([m, id]) =>
    rule(`ir-hl-change-${id}`, (each) =>
      each((r) => {
        const expected = growthTenths(r.t(is('current', m)), r.t(is('previous', m)));
        const shown = r.i(`highlights.${m}.changeRate`);
        return expected === null ? null : eq(`ハイライトの${m}の前期比 (10 倍)`, tenths(shown), expected);
      }),
    ),
  ),
  rule('xdoc-hl-dividend', (each) => each((r) => eq('ハイライトの年間配当金', r.i('highlights.annualDividend'), r.t('summary.annualDividend')))),
  rule('xdoc-hl-payout', (each) => each((r) => eq('ハイライトの配当性向', r.i('highlights.payoutRatio'), r.t('summary.payoutRatio')))),
  ...(
    [
      ['net-sales', 'netSales'],
      ['gross-profit', 'grossProfit'],
      ['operating-income', 'operatingIncome'],
    ] as const
  ).map(([id, m]) =>
    rule(`xdoc-results-${id}`, (each, ctx) => {
      for (const q of PERIODS) each((r) => xdoc(`業績の${m} (${q})`, r, `results.${m}.${q}`, r.t(is(q, m)), ctx));
    }),
  ),
  ...(
    [
      ['gross-margin', 'grossMargin', 'grossProfit'],
      ['operating-margin', 'operatingMargin', 'operatingIncome'],
    ] as const
  ).map(([id, m, numerator]) =>
    rule(`ir-results-${id}`, (each) => {
      for (const q of PERIODS) each((r) => eq(`${m} (${q}, 10 倍)`, tenths(r.i(`results.${m}.${q}`)), roundHalfAway(r.t(is(q, numerator)) * 1000, r.t(is(q, 'netSales')))));
    }),
  ),
  ...(
    [
      ['sales', 'netSales'],
      ['profit', 'profit'],
    ] as const
  ).map(([id, f]) =>
    rule(`xdoc-seg-${id}`, (each, ctx) => {
      for (const q of PERIODS) {
        for (let i = 0; i < segCount(ctx, q); i++) each((r) => xdoc(`セグメント ${i} の${f} (${q})`, r, `segments.items.${i}.${f}.${q}`, r.t(nseg(q, i, f)), ctx));
      }
    }),
  ),
  ...(
    [
      ['sales', 'netSales'],
      ['profit', 'profit'],
    ] as const
  ).map(([id, f]) =>
    rule(`ir-seg-change-${id}`, (each, ctx) => {
      for (let i = 0; i < segCount(ctx, 'current'); i++) {
        each((r) => {
          const expected = growthTenths(r.t(nseg('current', i, f)), r.t(nseg('previous', i, f)));
          const shown = r.i(`segments.items.${i}.${f}.changeRate`);
          return expected === null ? null : eq(`セグメント ${i} の${f}の前期比 (10 倍)`, tenths(shown), expected);
        });
      }
    }),
  ),
  rule('ir-seg-share', (each, ctx) => {
    for (let i = 0; i < segCount(ctx, 'current'); i++) {
      each((r) => eq(`セグメント ${i} の売上構成比 (10 倍)`, tenths(r.i(`segments.items.${i}.salesShare`)), roundHalfAway(r.t(nseg('current', i, 'netSales')) * 1000, r.t(is('current', 'netSales')))));
    }
  }),
  rule('ir-seg-reconcile', (each, ctx) => {
    for (const q of PERIODS) {
      each((r) => {
        const profits = Array.from({ length: ctx.p.ir.segments.items.length }, (_, i) => scaled10(r.i(`segments.items.${i}.profit.${q}`)));
        return eq(`セグメント利益 + 調整額 (${q}, 10 倍)`, sum(...profits) + scaled10(r.i(`segments.adjustment.${q}`)), scaled10(r.i(`segments.consolidatedOperatingIncome.${q}`)));
      });
    }
  }),
  rule('xdoc-seg-adjustment', (each, ctx) => {
    for (const q of PERIODS) each((r) => xdoc(`調整額 (${q})`, r, `segments.adjustment.${q}`, r.t(`notes.segments.${q}.adjustment`), ctx));
  }),
  rule('xdoc-seg-consolidated', (each, ctx) => {
    for (const q of PERIODS) each((r) => xdoc(`連結の営業利益 (${q})`, r, `segments.consolidatedOperatingIncome.${q}`, r.t(is(q, 'operatingIncome')), ctx));
  }),
  rule('xdoc-outlook-actual-results', (each, ctx) =>
    each((r) => all(xdoc('当期の実績の売上高', r, 'outlook.actual.netSales', r.t(is('current', 'netSales')), ctx), xdoc('当期の実績の営業利益', r, 'outlook.actual.operatingIncome', r.t(is('current', 'operatingIncome')), ctx))),
  ),
  rule('xdoc-outlook-actual-capex-depreciation', (each, ctx) =>
    each((r) => all(xdoc('当期の実績の設備投資', r, 'outlook.actual.capex', -r.t('cashFlow.capex'), ctx), xdoc('当期の実績の減価償却費', r, 'outlook.actual.depreciation', r.t('cashFlow.depreciation'), ctx))),
  ),
  ...(
    [
      ['net-sales', 'netSales'],
      ['operating-income', 'operatingIncome'],
    ] as const
  ).map(([id, f]) =>
    rule(`ir-outlook-change-${id}`, (each) =>
      each((r) => {
        const actual = scaled10(r.i(`outlook.actual.${f}`));
        if (!(actual > 0)) return null;
        const expected = roundHalfAway((scaled10(r.i(`outlook.forecast.${f}`)) - actual) * 1000, actual);
        return eq(`次期の予想の${f}の前期比 (10 倍)`, tenths(r.i(`outlook.forecast.${f}ChangeRate`)), expected);
      }),
    ),
  ),
  rule('xdoc-supp-capex-depreciation', (each, ctx) =>
    each((r) => all(xdoc('補足の設備投資', r, 'supplement.capex.current', -r.t('cashFlow.capex'), ctx), xdoc('補足の減価償却費', r, 'supplement.depreciation.current', r.t('cashFlow.depreciation'), ctx))),
  ),
  rule('xdoc-supp-debt', (each, ctx) => {
    for (const q of PERIODS) each((r) => xdoc(`有利子負債 (${q})`, r, `supplement.interestBearingDebt.${q}`, r.t(bs(q, 'shortTermDebt')) + r.t(bs(q, 'longTermDebt')), ctx));
  }),
  rule('xdoc-supp-cash', (each, ctx) => {
    for (const q of PERIODS) each((r) => xdoc(`現金 (${q})`, r, `supplement.cash.${q}`, r.t(bs(q, 'cash')), ctx));
  }),
  rule('ir-supp-net-debt', (each) => {
    for (const q of PERIODS) {
      each((r) => eq(`純有利子負債 (${q}, 10 倍)`, scaled10(r.i(`supplement.netDebt.${q}`)), scaled10(r.i(`supplement.interestBearingDebt.${q}`)) - scaled10(r.i(`supplement.cash.${q}`))));
    }
  }),
  rule('xdoc-supp-equity-ratio', (each) => each((r) => eq('補足の自己資本比率', r.i('supplement.equityRatio'), r.t('summary.equityRatio')))),
];
