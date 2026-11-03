// サマリー・比率・注記の式 (ケース表 §1.3)。
import { dividendAmount, hundredths, roundHalfAway, tenths } from '../math.ts';
import { eq, rule } from './dsl.ts';
import type { Reader, Rule } from './dsl.ts';

/** 株数 (千株) がこれ以上の会社は、EPS・BPS に株数を掛ける検算が丸めの誤差で合わないので、その規則を当てない (ケース表 §1.3)。 */
const MAX_SHARES_FOR_PRODUCT_CHECK = 100_000;

export const METRICS = [
  ['netSales', 'net-sales'],
  ['operatingIncome', 'operating-income'],
  ['ordinaryIncome', 'ordinary-income'],
  ['netIncomeParent', 'net-income-parent'],
] as const;

const is = (q: string, k: string) => `incomeStatement.${q}.${k}`;
const bs = (q: string, k: string) => `balanceSheet.${q}.${k}`;

/** 増減率 (% を 10 倍した整数)。分母が 0 以下なら null (規則に当たらない)。 */
export function growthTenths(cur: number, pre: number): number | null {
  return pre > 0 ? roundHalfAway((cur - pre) * 1000, pre) : null;
}

/** 純資産合計 − 非支配株主持分 (自己資本)。 */
export const equityOf = (r: Reader, q: 'previous' | 'current'): number => r.t(bs(q, 'totalNetAssets')) - r.t(bs(q, 'nonControllingInterests'));

export const SUMMARY_RULES: Rule[] = [
  ...METRICS.map(([m, id]) =>
    rule(`sum-${id}`, (each) => {
      for (const q of ['current', 'previous'] as const) each((r) => eq(`${m} (${q})`, r.t(`summary.${m}.${q}`), r.t(is(q, m))));
    }),
  ),
  rule('sum-total-assets', (each) => each((r) => eq('総資産', r.t('summary.totalAssets'), r.t(bs('current', 'totalAssets'))))),
  rule('sum-net-assets', (each) => each((r) => eq('純資産', r.t('summary.netAssets'), r.t(bs('current', 'totalNetAssets'))))),
  rule('sum-equity', (each) => each((r) => eq('自己資本', r.t('summary.equity'), equityOf(r, 'current')))),
  ...METRICS.map(([m, id]) =>
    rule(`sum-change-${id}`, (each) =>
      each((r) => {
        const cur = r.t(`summary.${m}.current`);
        const pre = r.t(`summary.${m}.previous`);
        const rate = r.t(`summary.${m}.changeRate`);
        const expected = growthTenths(cur, pre);
        return expected === null ? null : eq(`${m} の増減率 (10 倍)`, tenths(rate), expected);
      }),
    ),
  ),
  rule('ratio-eps', (each) =>
    each((r) => eq('1株当たり当期純利益 (100 倍)', hundredths(r.t('summary.eps')), roundHalfAway(r.t(is('current', 'netIncomeParent')) * 100000, r.t('notes.averageSharesThousand')))),
  ),
  rule('ratio-equity-ratio', (each) =>
    each((r) => eq('自己資本比率 (10 倍)', tenths(r.t('summary.equityRatio')), roundHalfAway(equityOf(r, 'current') * 1000, r.t(bs('current', 'totalAssets'))))),
  ),
  rule('ratio-bps', (each) =>
    each((r) => eq('1株当たり純資産 (100 倍)', hundredths(r.t('summary.bps')), roundHalfAway(equityOf(r, 'current') * 100000, r.t('notes.averageSharesThousand')))),
  ),
  rule('ratio-payout', (each) =>
    each((r) => {
      const eps = hundredths(r.t('summary.eps'));
      if (!(eps > 0)) return null;
      return eq('配当性向 (10 倍)', tenths(r.t('summary.payoutRatio')), roundHalfAway(hundredths(r.t('summary.annualDividend')) * 1000, eps));
    }),
  ),
  rule('ratio-dividend-total', (each) =>
    each((r) => eq('配当金総額', r.t('summary.dividendTotal'), dividendAmount(r.t('summary.annualDividend'), r.t('notes.averageSharesThousand')))),
  ),
  rule('ratio-operating-margin', (each) =>
    each((r) => eq('売上高営業利益率 (10 倍)', tenths(r.t('summary.operatingMargin')), roundHalfAway(r.t(is('current', 'operatingIncome')) * 1000, r.t(is('current', 'netSales'))))),
  ),
  rule('ratio-roe', (each) =>
    each((r) => eq('自己資本当期純利益率 (10 倍)', tenths(r.t('summary.roe')), roundHalfAway(r.t(is('current', 'netIncomeParent')) * 2000, equityOf(r, 'previous') + equityOf(r, 'current')))),
  ),
  rule('check-eps-product', (each) =>
    each((r) => r.t('notes.averageSharesThousand') >= MAX_SHARES_FOR_PRODUCT_CHECK ? null : eq('EPS × 株数 = 純利益', roundHalfAway(hundredths(r.t('summary.eps')) * r.t('notes.averageSharesThousand'), 100000), r.t(is('current', 'netIncomeParent')))),
  ),
  rule('check-bps-product', (each) =>
    each((r) => r.t('notes.averageSharesThousand') >= MAX_SHARES_FOR_PRODUCT_CHECK ? null : eq('BPS × 株数 = 自己資本', roundHalfAway(hundredths(r.t('summary.bps')) * r.t('notes.averageSharesThousand'), 100000), r.t('summary.equity'))),
  ),
  rule('notes-per-share', (each) => {
    each((r) => eq('注記の EPS', r.t('notes.eps'), r.t('summary.eps')));
    each((r) => eq('注記の BPS', r.t('notes.bps'), r.t('summary.bps')));
  }),
];
