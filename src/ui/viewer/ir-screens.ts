// IR スライド 5 画面の中身 (docs/test-cases/viewer.md §4)。金額は IR の単位 (header.unit)。DOM を使わない。
import { itemKey } from '../../domain/labels';
import type { IrSlideId } from '../../domain/types';
import { col, Ctx, plain, single } from './context';
import type { ViewBar, ViewCell, ViewChart, ViewRow, ViewScreen, ViewSection } from './types';

const PREV_CUR = ['previous', 'current'] as const;
const PERIOD_COLUMNS = [col('前期'), col('当期')];

/** 棒の高さの割合: (値 − 軸の下端) ÷ (大きい方 − 軸の下端)。大きい方が下端以下なら 0。小数第 4 位に丸める。 */
export function barFraction(value: number, top: number, axisMin: number): number {
  if (top <= axisMin) return 0;
  const f = (Math.max(value, axisMin) - axisMin) / (top - axisMin);
  return Math.round(f * 10000) / 10000;
}

function highlights(c: Ctx): ViewSection[] {
  const line = (f: string) => c.row(`highlights.${f}.amount`, [c.cell(`highlights.${f}.amount`, 'money', 'current'), c.cell(`highlights.${f}.changeRate`, 'percent')]);
  const one = (f: string, kind: 'perShare' | 'percent') => c.row(`highlights.${f}`, [c.cell(`highlights.${f}`, kind, 'current')]);
  return [
    plain([col('金額'), col('前期比')], ['netSales', 'operatingIncome', 'ordinaryIncome', 'netIncomeParent'].map(line), '業績ハイライト'),
    single([one('annualDividend', 'perShare'), one('payoutRatio', 'percent')], '株主還元'),
  ];
}

function results(c: Ctx): { sections: ViewSection[]; charts: ViewChart[] } {
  const line = (f: string, kind: 'money' | 'percent') => c.row(`results.${f}.current`, PREV_CUR.map((s) => c.cell(`results.${f}.${s}`, kind, s)));
  const sections = [
    plain(PERIOD_COLUMNS, [line('netSales', 'money'), line('grossProfit', 'money'), line('grossMargin', 'percent'), line('operatingIncome', 'money'), line('operatingMargin', 'percent')], '連結業績'),
  ];
  const charts = (['netSales', 'operatingIncome'] as const).map((f): ViewChart => {
    const key = itemKey('ir', `results.chart.${f}`);
    const axisKey = `${key}.axisMin`;
    const axisMin = c.need(`results.chart.${f}.axisMin`, 'money');
    const bars = PREV_CUR.map((s) => ({ stage: s, cell: c.need(`results.chart.${f}.${s}`, 'money', s) }));
    const top = Math.max(...bars.map((b) => b.cell.value as number));
    return {
      itemKey: key,
      label: c.label(key),
      axisItemKey: axisKey,
      axisLabel: c.label(axisKey),
      axisMin,
      bars: bars.map((b): ViewBar => ({ ...b, fraction: barFraction(b.cell.value as number, top, axisMin.value as number) })),
    };
  });
  return { sections, charts };
}

function segments(c: Ctx): ViewSection[] {
  const count = (c.at('segments.items') as unknown[]).length;
  const out: ViewSection[] = [];
  for (let i = 0; i < count; i++) {
    const base = `segments.items.${i}`;
    const line = (f: 'netSales' | 'profit') =>
      c.row(`${base}.${f}.current`, [c.cell(`${base}.${f}.previous`, 'money', 'previous'), c.cell(`${base}.${f}.current`, 'money', 'current'), c.cell(`${base}.${f}.changeRate`, 'percent')]);
    const share: ViewRow = c.row(`${base}.salesShare`, [null, c.cell(`${base}.salesShare`, 'percent', 'current'), null]);
    out.push(plain([col('前期'), col('当期'), col('前期比')], [line('netSales'), line('profit'), share], null, c.cell(`${base}.name`, 'text')));
  }
  const total = (f: string) => c.row(`segments.${f}.current`, PREV_CUR.map((s) => c.cell(`segments.${f}.${s}`, 'money', s)));
  out.push(plain(PERIOD_COLUMNS, [total('adjustment'), total('consolidatedOperatingIncome')], '全社'));
  return out;
}

function outlook(c: Ctx): ViewSection[] {
  const pair = (f: string) => c.row(`outlook.forecast.${f}`, [c.cell(`outlook.forecast.${f}`, 'money', 'forecast'), c.cell(`outlook.actual.${f}`, 'money', 'actual')]);
  const rate = (f: string) => c.row(`outlook.forecast.${f}`, [c.cell(`outlook.forecast.${f}`, 'percent')]);
  return [
    plain(
      [col('次期予想'), col('当期実績')],
      [
        pair('netSales'),
        rate('netSalesChangeRate'),
        pair('operatingIncome'),
        rate('operatingIncomeChangeRate'),
        pair('capex'),
        pair('depreciation'),
        c.row('outlook.forecast.annualDividend', [c.cell('outlook.forecast.annualDividend', 'perShare', 'forecast')]),
      ],
      '次期の見通し',
    ),
    single([c.row('outlook.subsequentEvent', [c.cell('outlook.subsequentEvent', 'text', null, '該当なし')])], '期末後の出来事'),
  ];
}

function supplement(c: Ctx): ViewSection[] {
  const line = (f: string) => c.row(`supplement.${f}.current`, PREV_CUR.map((s) => c.cell(`supplement.${f}.${s}`, 'money', s)));
  const ratio = c.row('supplement.equityRatio', [null, c.cell('supplement.equityRatio', 'percent', 'current')]);
  return [plain(PERIOD_COLUMNS, [line('capex'), line('depreciation'), line('interestBearingDebt'), line('cash'), line('netDebt'), ratio], '補足')];
}

/** この画面の文章。path は `ir.statements.<i>` (検証器の claims-direction の paths と同じ)。value・text は文。 */
function sentences(c: Ctx, id: IrSlideId): ViewCell[] {
  const list = c.at('statements') as { slide: string; text: string }[];
  return list.flatMap((s, i) => {
    if (s.slide !== id) return [];
    const cell = c.cell(`statements.${i}`, 'text');
    return cell ? [{ ...cell, value: s.text, text: s.text }] : [];
  });
}

export function buildIr(c: Ctx, id: IrSlideId, title: string): ViewScreen {
  let sections: ViewSection[] = [];
  let charts: ViewChart[] = [];
  if (id === 'highlights') sections = highlights(c);
  else if (id === 'results') ({ sections, charts } = results(c));
  else if (id === 'segments') sections = segments(c);
  else if (id === 'outlook') sections = outlook(c);
  else sections = supplement(c);
  return { doc: 'ir', id, title, header: c.header(), sections, charts, sentences: sentences(c, id) };
}
