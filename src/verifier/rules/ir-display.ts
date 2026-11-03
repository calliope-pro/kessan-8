// 正常な問題だけに当てる検査: IR の比率が「IR の表示金額から検算した値」にも一致する (#81 の B1)。
// 短信の百万円から計算した値 (ir-hl-change-* など) と、IR の表示金額 (億円は 0.1 億円に丸め) から計算した値は、丸めでずれうる。
// 遊び手は IR の金額から検算するので、正常な問題ではどちらにも一致させる (異変の問題には当てない: 答えは あり/なし だけ)。
import { roundHalfAway, scaled10, tenths } from '../math.ts';
import { eq, PERIODS, rule } from './dsl.ts';
import type { Reader, Rule } from './dsl.ts';

const growth = (cur: number, pre: number): number | null => (pre > 0 ? roundHalfAway((cur - pre) * 1000, pre) : null);
const s10 = (r: Reader, path: string): number => scaled10(r.i(path));

export const IR_DISPLAY_RULES: Rule[] = [
  ...(
    [
      ['net-sales', 'netSales'],
      ['operating-income', 'operatingIncome'],
    ] as const
  ).map(([id, m]) =>
    rule(`ir-display-hl-change-${id}`, (each) =>
      each((r) => {
        const expected = growth(s10(r, `highlights.${m}.amount`), s10(r, `results.${m}.previous`));
        return expected === null ? null : eq(`ハイライトの${m}の前期比 (IR の金額から、10 倍)`, tenths(r.i(`highlights.${m}.changeRate`)), expected);
      }),
    ),
  ),
  ...(
    [
      ['gross-margin', 'grossMargin', 'grossProfit'],
      ['operating-margin', 'operatingMargin', 'operatingIncome'],
    ] as const
  ).map(([id, m, numerator]) =>
    rule(`ir-display-results-${id}`, (each) => {
      for (const q of PERIODS) {
        each((r) => {
          const sales = s10(r, `results.netSales.${q}`);
          return sales > 0 ? eq(`${m} (${q}、IR の金額から、10 倍)`, tenths(r.i(`results.${m}.${q}`)), roundHalfAway(s10(r, `results.${numerator}.${q}`) * 1000, sales)) : null;
        });
      }
    }),
  ),
  ...(
    [
      ['sales', 'netSales'],
      ['profit', 'profit'],
    ] as const
  ).map(([id, f]) =>
    rule(`ir-display-seg-change-${id}`, (each, ctx) => {
      for (let i = 0; i < ctx.p.ir.segments.items.length; i++) {
        each((r) => {
          const expected = growth(s10(r, `segments.items.${i}.${f}.current`), s10(r, `segments.items.${i}.${f}.previous`));
          return expected === null ? null : eq(`セグメント ${i} の${f}の前期比 (IR の金額から、10 倍)`, tenths(r.i(`segments.items.${i}.${f}.changeRate`)), expected);
        });
      }
    }),
  ),
  rule('ir-display-seg-share', (each, ctx) => {
    for (let i = 0; i < ctx.p.ir.segments.items.length; i++) {
      each((r) => {
        const sales = s10(r, 'results.netSales.current');
        return sales > 0 ? eq(`セグメント ${i} の売上構成比 (IR の金額から、10 倍)`, tenths(r.i(`segments.items.${i}.salesShare`)), roundHalfAway(s10(r, `segments.items.${i}.netSales.current`) * 1000, sales)) : null;
      });
    }
  }),
];
