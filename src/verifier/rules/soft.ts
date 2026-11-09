// 参考の規則 (soft。ケース表 §1.7): 遊び手に正常と見えるための範囲。破れても異変ではない。数字の範囲は試作 (gen-measure.md) の仮定。
import { roundHalfAway, tenths } from '../math.ts';
import { rule } from './dsl.ts';
import type { Rule } from './dsl.ts';
import { METRICS } from './summary.ts';

const within = (x: number, lo: number, hi: number) => x >= lo && x <= hi;
const bs = (k: string, q = 'current') => `balanceSheet.${q}.${k}`;
const is = (k: string, q = 'current') => `incomeStatement.${q}.${k}`;

export const SOFT_RULES: Rule[] = [
  rule('soft-nonnegative-bs', (each) =>
    each((r) => {
      const negatives: string[] = [];
      for (const q of ['previous', 'current'] as const) {
        const node = r.ctx.p.tanshin.balanceSheet[q] as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(node)) {
          if (k !== 'retainedEarnings' && v < 0) negatives.push(`${q}.${k}`);
        }
      }
      negatives.forEach((n) => r.used.push(`tanshin.balanceSheet.${n}`));
      return negatives.length === 0 ? null : `貸借対照表に負の値: ${negatives.join('、')}`;
    }),
  ),
  rule('soft-current-ratio', (each) =>
    each((r) => {
      const ratio = r.t(bs('totalCurrentAssets')) / Math.max(r.t(bs('totalCurrentLiabilities')), 1);
      return within(ratio, 0.8, 4) ? null : `流動比率 ${ratio.toFixed(2)} が 0.8〜4 の外`;
    }),
  ),
  rule('soft-equity-ratio-range', (each) =>
    each((r) => {
      const x = r.t('summary.equityRatio');
      return within(x, 20, 80) ? null : `自己資本比率 ${x}% が 20〜80% の外`;
    }),
  ),
  rule('soft-operating-margin-range', (each) =>
    each((r) => {
      const x = (r.t(is('operatingIncome')) / r.t(is('netSales'))) * 100;
      return within(x, -5, 25) ? null : `営業利益率 ${x.toFixed(1)}% が −5〜25% の外`;
    }),
  ),
  rule('soft-sales-growth-range', (each) =>
    each((r) => {
      const x = r.t('summary.netSales.changeRate');
      return Math.abs(x) <= 20 ? null : `売上高増減率 ${x}% が ±20% の外`;
    }),
  ),
  rule('soft-operating-profit-positive', (each) => each((r) => (r.t(is('operatingIncome')) > 0 ? null : '営業利益が 0 以下'))),
  rule('soft-tax-rate-range', (each) =>
    each((r) => {
      const before = r.t(is('incomeBeforeTax'));
      if (!(before > 0)) return null;
      const x = (r.t(is('incomeTaxes')) / before) * 100;
      return within(x, 25, 40) ? null : `実効税率 ${x.toFixed(1)}% が 25〜40% の外`;
    }),
  ),
  rule('soft-ocf-vs-operating-income', (each, ctx) =>
    each((r) => {
      const oi = r.t(is('operatingIncome'));
      const x = r.t('cashFlow.operatingCashFlow') / oi;
      // 営業 CF の主張が down (マイナス) の問題は、下限 0.3 を外す: 営業利益が正で営業 CF がマイナスの会社は、正常にも要る (R-S5 (f)。設計 v3 §1.5。責任者の決定 2026-11-09)
      const cfDown = ctx.p.ir.statements.some((s) => s.claims.some((c) => c.metric === 'operatingCashFlow' && c.direction === 'down'));
      return oi > 0 && (cfDown ? x <= 3 : within(x, 0.3, 3)) ? null : `営業 CF ÷ 営業利益 ${x.toFixed(2)} が ${cfDown ? '3 以下' : '0.3〜3'} の外`;
    }),
  ),
  rule('soft-cash-vs-sales', (each) =>
    each((r) => {
      const x = r.t(bs('cash')) / r.t(is('netSales'));
      return within(x, 0.03, 0.4) ? null : `現金 ÷ 売上高 ${(x * 100).toFixed(1)}% が 3〜40% の外`;
    }),
  ),
  rule('soft-payout-max', (each) =>
    each((r) => {
      const x = r.t('summary.payoutRatio');
      return x <= 100 ? null : `配当性向 ${x}% が 100% を超える`;
    }),
  ),
  rule('soft-rates-expressible', (each) =>
    each((r) => {
      const bad: string[] = [];
      for (const [m] of METRICS) if (!(r.t(`summary.${m}.previous`) > 0)) bad.push(`summary.${m}.previous`);
      if (!(r.t('summary.eps') > 0)) bad.push('summary.eps');
      if (!(r.i('outlook.actual.netSales') > 0)) bad.push('outlook.actual.netSales');
      if (!(r.i('outlook.actual.operatingIncome') > 0)) bad.push('outlook.actual.operatingIncome');
      return bad.length === 0 ? null : `増減率・配当性向の分母が 0 以下: ${bad.join('、')}`;
    }),
  ),
  rule('soft-payout-cross-path', (each) =>
    each((r) => {
      const parent = r.t(is('netIncomeParent'));
      if (!(parent > 0)) return null;
      const viaTotal = roundHalfAway(r.t('summary.dividendTotal') * 1000, parent);
      const shown = tenths(r.t('summary.payoutRatio'));
      return shown === viaTotal ? null : `配当性向 ${shown / 10}% と 配当金総額 ÷ 純利益 ${viaTotal / 10}% がずれる`;
    }),
  ),
];
