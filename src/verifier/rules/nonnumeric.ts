// 数値の等式でない規則 (ケース表 §1.6): 単位・負の記号・科目名・グラフ・日付・文章の主張・注意書きなど。
import type { ClaimMetric } from '../../domain/types.ts';
import { LABELS, SECTION_OF_ITEM } from '../../domain/labels.ts';
import { scaled10 } from '../math.ts';
import { eq, PERIODS, rule } from './dsl.ts';
import type { Reader, Rule } from './dsl.ts';

export const AUDIT_NOTE = '決算短信は公認会計士又は監査法人の監査の対象外です';
export const NONE_TEXT = '該当事項はありません。';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const lastDay = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const isoDate = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}-${String(lastDay(year, month)).padStart(2, '0')}`;
const sign = (x: number): number => Math.sign(x);

/** claims が見る数字の動き (増 = 1、減 = −1、同じ = 0)。zero は有利子負債が 0 のとき。 */
function actualDirection(r: Reader, metric: ClaimMetric): number {
  const is = (q: string, k: string) => r.t(`incomeStatement.${q}.${k}`);
  const debt = (q: string) => r.t(`balanceSheet.${q}.shortTermDebt`) + r.t(`balanceSheet.${q}.longTermDebt`);
  switch (metric) {
    case 'netSales':
    case 'operatingIncome':
    case 'ordinaryIncome':
    case 'netIncomeParent':
      return sign(is('current', metric) - is('previous', metric));
    case 'forecastNetSales':
      return sign(scaled10(r.i('outlook.forecast.netSales')) - scaled10(r.i('outlook.actual.netSales')));
    case 'forecastOperatingIncome':
      return sign(scaled10(r.i('outlook.forecast.operatingIncome')) - scaled10(r.i('outlook.actual.operatingIncome')));
    case 'dividend':
      return sign(r.t('summary.annualDividend') - r.t('summary.annualDividendPrevious'));
    case 'operatingCashFlow':
      return sign(r.t('cashFlow.operatingCashFlow'));
    case 'interestBearingDebt':
      return sign(debt('current') - debt('previous'));
  }
}

const DIRECTION = { up: 1, down: -1 } as const;

export const NONNUMERIC_RULES: Rule[] = [
  rule('unit-consistency', (each, ctx) => {
    for (const [key, value] of Object.entries(ctx.p.unitOverrides ?? {})) {
      const doc = key.startsWith('ir.') ? 'ir' : 'tanshin';
      const standard = ctx.p[doc].header.unit;
      if (value !== standard) {
        each((r) => {
          r.used.push(`${key}.unit`);
          return `画面の単位 ${value} ≠ 資料の単位 ${standard}`;
        });
      }
    }
  }),
  rule('sign-consistency', (each, ctx) => {
    for (const [key, value] of Object.entries(ctx.p.signOverrides ?? {})) {
      if (value !== '△') {
        each((r) => {
          r.used.push(key);
          return `負の記号 ${value} ≠ 標準の △`;
        });
      }
    }
  }),
  rule('label-spelling', (each, ctx) => {
    for (const [key, value] of Object.entries(ctx.p.labelOverrides ?? {})) {
      const standard = LABELS[key];
      const asOtherItem = Object.entries(LABELS).some(([k, label]) => k !== key && label === value);
      if (value !== standard && !asOtherItem) {
        each((r) => {
          r.used.push(key);
          return standard === undefined ? `項目キー ${key} が labels に無い` : `項目名 ${value} は標準の ${standard} と違う (誤字)`;
        });
      }
    }
  }),
  rule('account-section', (each, ctx) => {
    for (const [key, value] of Object.entries(ctx.p.labelOverrides ?? {})) {
      const section = SECTION_OF_ITEM[key];
      const wrong = Object.entries(SECTION_OF_ITEM).find(([k, s]) => k !== key && LABELS[k] === value && s !== section && s !== 'total' && section !== 'total');
      if (section !== undefined && wrong) {
        each((r) => {
          r.used.push(key);
          return `${value} は別の部の科目名 (${wrong[1]}) で、${section} の部に置かれている`;
        });
      }
    }
  }),
  rule('chart-axis-zero', (each) => {
    for (const m of ['netSales', 'operatingIncome']) each((r) => eq(`${m} のグラフの縦軸の下端`, r.i(`results.chart.${m}.axisMin`), 0));
  }),
  rule('chart-bars', (each) => {
    for (const m of ['netSales', 'operatingIncome']) {
      for (const q of PERIODS) each((r) => eq(`${m} の棒 (${q}) = 数字`, r.i(`results.chart.${m}.${q}`), r.i(`results.${m}.${q}`)));
    }
  }),
  rule('dates-period-end', (each, ctx) => {
    for (const [field, year] of [['periodEnd', ctx.p.fiscalYear], ['previousPeriodEnd', ctx.p.fiscalYear - 1]] as const) {
      each((r) => {
        const expected = isoDate(year, ctx.c.fiscalYearEndMonth);
        const actual = r.raw('tanshin', `dates.${field}`);
        return actual === expected ? null : `${field}: ${String(actual)} ≠ ${expected}`;
      });
    }
  }),
  rule('dates-order', (each) =>
    each((r) => {
      const [end, disclosure, meeting] = ['periodEnd', 'disclosure', 'shareholdersMeeting'].map((k) => r.raw('tanshin', `dates.${k}`));
      const dates = [end, disclosure, meeting];
      if (!dates.every((d) => typeof d === 'string' && ISO.test(d))) return `日付の形が YYYY-MM-DD でない: ${dates.join('・')}`;
      return (end as string) < (disclosure as string) && (disclosure as string) < (meeting as string) ? null : `期末日 < 発表日 < 総会の日 になっていない: ${dates.join(' / ')}`;
    }),
  ),
  rule('dates-column-headings', (each) => {
    for (const screen of ['balanceSheet', 'incomeStatement', 'cashFlow']) {
      for (const [col, field] of [['previous', 'previousPeriodEnd'], ['current', 'periodEnd']] as const) {
        each((r) => {
          const actual = r.raw('tanshin', `columnDates.${screen}.${col}`);
          const expected = r.raw('tanshin', `dates.${field}`);
          return actual === expected ? null : `${screen} の ${col} の列見出し ${String(actual)} ≠ ${String(expected)}`;
        });
      }
    }
  }),
  rule('claims-direction', (each, ctx) => {
    ctx.p.ir.statements.forEach((statement, s) => {
      statement.claims.forEach((claim) => {
        each((r) => {
          r.used.push(`ir.statements.${s}`);
          const actual = actualDirection(r, claim.metric);
          const ok = claim.direction === 'zero' ? claim.metric === 'interestBearingDebt' && r.t('balanceSheet.current.shortTermDebt') + r.t('balanceSheet.current.longTermDebt') === 0 : DIRECTION[claim.direction] === actual;
          return ok ? null : `文章の主張 ${claim.metric} ${claim.direction} が数字の動き (${actual}) と合わない`;
        });
      });
    });
  }),
  rule('audit-note', (each) =>
    each((r) => {
      const note = r.raw('tanshin', 'summary.auditNote');
      return note === AUDIT_NOTE ? null : `監査の注意書き: ${String(note)}`;
    }),
  ),
  rule('accounting-policy-match', (each) =>
    each((r) => {
      const flag = r.raw('tanshin', 'summary.accountingPolicyChange');
      const note = r.raw('tanshin', 'notes.accountingPolicyNote');
      return flag === (note !== NONE_TEXT) ? null : `会計方針の変更の有無 ${String(flag)} と注記 ${String(note)} が合わない`;
    }),
  ),
  rule('subsequent-event-match', (each) =>
    each((r) => {
      const notes = r.raw('tanshin', 'notes.subsequentEvents');
      const event = r.raw('ir', 'outlook.subsequentEvent');
      return (notes === NONE_TEXT) === (event === null) ? null : `後発事象の記載 ${String(notes)} と IR の期末後の出来事 ${String(event)} が合わない`;
    }),
  ),
];

