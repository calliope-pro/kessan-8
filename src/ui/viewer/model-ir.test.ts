// docs/test-cases/viewer.md §2 (B0 の IR 分)・§4 (C1〜C8): IR スライド 5 画面の中身 (DOM を使わない buildScreen)。
import { describe, expect, it } from 'vitest';
import { itemKey, LABELS } from '../../domain/labels';
import { IR_SLIDES, type DocKind, type IrSlideId, type Problem } from '../../domain/types';
import { buildScreen, SCREEN_ORDER, type ViewCell, type ViewScreen } from './model';
import { fullProblem, leaves, normalProblem, okuProblem, valueAt } from './testing';

const ir = (p: Problem, id: IrSlideId) => buildScreen(p, 'ir', id);
const cellsOf = (s: ViewScreen): ViewCell[] => {
  const h = s.header;
  return [
    h.companyName, h.securitiesCode, h.periodLabel, h.unit, ...(h.extra ?? []),
    ...s.sections.flatMap((sec) => [
      ...(sec.titleCell ? [sec.titleCell] : []),
      ...sec.columns.flatMap((c) => (c.cell ? [c.cell] : [])),
      ...sec.rows.flatMap((r) => r.cells.flatMap((c) => (c ? [c] : []))),
    ]),
    ...s.charts.flatMap((c) => [c.axisMin, ...c.bars.map((b) => b.cell)]),
    ...s.sentences,
  ];
};
/** 行の名前の要素の項目キー (グラフの題・軸の下端の見出しを含む)。 */
const nameKeys = (s: ViewScreen) => [
  ...s.sections.flatMap((sec) => sec.rows.map((r) => r.itemKey)),
  ...s.charts.flatMap((c) => [c.itemKey, c.axisItemKey]),
];
const row = (s: ViewScreen, key: string) => s.sections.flatMap((sec) => sec.rows).find((r) => r.itemKey === key);
const texts = (s: ViewScreen, key: string) => row(s, key)?.cells.map((c) => c?.text ?? null);

describe('B0 (IR): 共通', () => {
  it('B0-3: 見出しは IR のもの (単位は IR の単位)', () => {
    for (const id of IR_SLIDES) {
      const h = ir(normalProblem(), id).header;
      expect([h.companyName.path, h.companyName.text]).toEqual(['ir.header.companyName', '第七試作電機株式会社']);
      expect([h.unit.path, h.unit.text]).toEqual(['ir.header.unit', '百万円']);
    }
    expect(ir(okuProblem(), 'results').header.unit.text).toBe('億円');
  });

  const full = fullProblem();
  const screens = IR_SLIDES.map((id) => ir(full, id));

  it('B0-4: 数値のセルの value は path で引いた問題の値のまま (文章は text)', () => {
    for (const s of screens) {
      for (const c of cellsOf(s)) {
        if (c.path.endsWith('.unit')) continue;
        if (/^ir\.statements\.\d+$/.test(c.path)) {
          expect(c.value, c.path).toBe(valueAt(full, `${c.path}.text`));
          continue;
        }
        const v = valueAt(full, c.path);
        expect(c.value, c.path).toEqual(v === undefined ? null : v);
      }
    }
  });

  it('B0-5: セルの項目キーは itemKey(doc, path)。行の名前の文字は LABELS[項目キー]', () => {
    for (const s of screens) {
      for (const c of cellsOf(s)) {
        const [doc, ...rest] = c.path.split('.') as [DocKind, ...string[]];
        expect(c.itemKey, c.path).toBe(itemKey(doc, rest.join('.')));
      }
      for (const r of s.sections.flatMap((x) => x.rows)) expect(r.label, r.itemKey).toBe(LABELS[r.itemKey]);
      for (const c of s.charts) {
        expect(c.label).toBe(LABELS[c.itemKey]);
        expect(c.axisLabel).toBe(LABELS[c.axisItemKey]);
      }
    }
  });

  it('B0-6: IR の葉は、葉の path かその祖先がどれかの画面のセルの path にある (漏れが無い)', () => {
    const cellPaths = new Set(screens.flatMap(cellsOf).map((c) => c.path));
    const covered = (path: string) => {
      const segs = path.split('.');
      return segs.some((_, i) => cellPaths.has(segs.slice(0, segs.length - i).join('.')));
    };
    const missing = leaves('ir', full.ir).filter((l) => !covered(`ir.${l.path}`)).map((l) => l.path);
    expect(missing).toEqual([]);
  });

  it('B0-7・B0-8: 同じ画面で同じ path のセルは無い。行の名前は空でなく、行はセルを持つ', () => {
    for (const s of screens) {
      const paths = cellsOf(s).map((c) => c.path);
      expect(paths.filter((p, i) => paths.indexOf(p) !== i), s.id).toEqual([]);
      for (const r of s.sections.flatMap((x) => x.rows)) {
        expect(r.label, r.itemKey).not.toBe('');
        expect(r.cells.some((c) => c !== null), r.itemKey).toBe(true);
      }
    }
  });

  it('B0-9〜B0-12: 上書き (項目名・単位・負の記号)。IR にも効く', () => {
    const p = normalProblem();
    p.labelOverrides = { 'ir.results.operatingIncome': '営業利金' };
    p.unitOverrides = { 'ir.results': '千円' };
    p.signOverrides = { 'ir.segments.adjustment.current': '▲' };
    const r = ir(p, 'results');
    expect(row(r, 'ir.results.operatingIncome')?.label).toBe('営業利金');
    expect([r.header.unit.path, r.header.unit.text]).toEqual(['ir.results.unit', '千円']);
    expect(ir(p, 'highlights').header.unit.path).toBe('ir.header.unit');
    expect(texts(ir(p, 'segments'), 'ir.segments.adjustment')).toEqual(['△110', '▲110']);
  });

  it('B0-13: 異変の有無は表示に出ない', () => {
    const a = normalProblem();
    const b = normalProblem();
    b.anomaly = { kind: 'k', places: [{ doc: 'ir', path: 'results.netSales.current' }], explanation: 'x', expectedRules: [] };
    for (const id of IR_SLIDES) expect(ir(b, id)).toEqual(ir(a, id));
  });

  it('B0-14: 全部入りの 10 画面の行の名前の要素の項目キーは、Object.keys(LABELS) と集合として等しい', () => {
    const tanshin = SCREEN_ORDER.filter((r) => r.doc === 'tanshin').map((r) => buildScreen(full, 'tanshin', r.screen as never));
    const keys = new Set([...tanshin, ...screens].flatMap(nameKeys));
    expect([...keys].sort()).toEqual(Object.keys(LABELS).sort());
  });
});

describe('C1: ハイライト', () => {
  const s = ir(normalProblem(), 'highlights');
  it('金額と前期比、配当・配当性向、文章', () => {
    expect(s.sections[0]!.columns.map((c) => c.label)).toEqual(['金額', '前期比']);
    expect(texts(s, 'ir.highlights.netSales')).toEqual(['12,400', '5.1%']);
    expect(texts(s, 'ir.highlights.operatingIncome')).toEqual(['1,240', '10.7%']);
    expect(texts(s, 'ir.highlights.ordinaryIncome')).toEqual(['1,310', '11.0%']);
    expect(texts(s, 'ir.highlights.netIncomeParent')).toEqual(['860', '13.2%']);
    expect(texts(s, 'ir.highlights.annualDividend')).toEqual(['30.00円']);
    expect(texts(s, 'ir.highlights.payoutRatio')).toEqual(['30.0%']);
    expect(row(s, 'ir.highlights.netSales')!.cells.map((c) => c?.path)).toEqual(['ir.highlights.netSales.amount', 'ir.highlights.netSales.changeRate']);
    expect(s.sentences.map((c) => [c.path, c.text, c.kind])).toEqual([['ir.statements.0', '売上高・営業利益ともに前期を上回った。', 'text']]);
  });
});

describe('C2: 業績', () => {
  const s = ir(normalProblem(), 'results');
  it('表 (前期・当期)', () => {
    expect(s.sections[0]!.columns.map((c) => c.label)).toEqual(['前期', '当期']);
    expect(texts(s, 'ir.results.netSales')).toEqual(['11,800', '12,400']);
    expect(texts(s, 'ir.results.grossProfit')).toEqual(['3,422', '3,720']);
    expect(texts(s, 'ir.results.grossMargin')).toEqual(['29.0%', '30.0%']);
    expect(texts(s, 'ir.results.operatingIncome')).toEqual(['1,120', '1,240']);
    expect(texts(s, 'ir.results.operatingMargin')).toEqual(['9.5%', '10.0%']);
  });
  it('グラフ 2 つ (題・棒 2 本・軸の下端の見出しと値)', () => {
    expect(s.charts.map((c) => [c.itemKey, c.label, c.axisItemKey, c.axisLabel])).toEqual([
      ['ir.results.chart.netSales', LABELS['ir.results.chart.netSales'], 'ir.results.chart.netSales.axisMin', LABELS['ir.results.chart.netSales.axisMin']],
      ['ir.results.chart.operatingIncome', LABELS['ir.results.chart.operatingIncome'], 'ir.results.chart.operatingIncome.axisMin', LABELS['ir.results.chart.operatingIncome.axisMin']],
    ]);
    const c = s.charts[0]!;
    expect([c.axisMin.path, c.axisMin.text]).toEqual(['ir.results.chart.netSales.axisMin', '0']);
    expect(c.bars.map((b) => [b.stage, b.cell.path, b.cell.text])).toEqual([
      ['previous', 'ir.results.chart.netSales.previous', '11,800'],
      ['current', 'ir.results.chart.netSales.current', '12,400'],
    ]);
  });
  const frac = (p: Problem) => ir(p, 'results').charts[0]!.bars.map((b) => b.fraction);
  it('C2-1: 軸の下端 0 → 大きい方が 1、前期は 0.9516', () => {
    expect(frac(normalProblem())).toEqual([0.9516, 1]);
  });
  it('C2-2: 軸の下端 10,000 → 前期 0.75・当期 1', () => {
    const p = normalProblem();
    p.ir.results.chart.netSales.axisMin = 10000;
    expect(frac(p)).toEqual([0.75, 1]);
  });
  it('C2-3: 前期 = 当期 → どちらも 1。大きい方 ≤ 下端 → どちらも 0。下端を下回る棒は 0', () => {
    const same = normalProblem();
    same.ir.results.chart.netSales.previous = 12400;
    expect(frac(same)).toEqual([1, 1]);
    const flat = normalProblem();
    flat.ir.results.chart.netSales.axisMin = 20000;
    expect(frac(flat)).toEqual([0, 0]);
    const below = normalProblem();
    below.ir.results.chart.netSales.axisMin = 12000;
    below.ir.results.chart.netSales.previous = 11800;
    expect(frac(below)).toEqual([0, 1]);
  });
});

describe('C3: セグメント別', () => {
  it('セグメントごとの節と全社の節', () => {
    const s = ir(normalProblem(), 'segments');
    const segs = s.sections.filter((x) => x.titleCell);
    expect(segs).toHaveLength(2);
    expect([segs[0]!.titleCell!.path, segs[0]!.titleCell!.text]).toEqual(['ir.segments.items.0.name', '電機部品事業']);
    expect(segs[0]!.columns.map((c) => c.label)).toEqual(['前期', '当期', '前期比']);
    expect(texts(s, 'ir.segments.items.0.netSales')).toEqual(['7,500', '7,900', '5.3%']);
    expect(texts(s, 'ir.segments.items.0.profit')).toEqual(['820', '900', '9.8%']);
    expect(texts(s, 'ir.segments.items.0.salesShare')).toEqual([null, '63.7%', null]);
    expect(segs[1]!.titleCell!.text).toBe('産業機器事業');
    expect(texts(s, 'ir.segments.items.1.netSales')).toEqual(['4,300', '4,500', '4.7%']);
    expect(texts(s, 'ir.segments.items.1.profit')).toEqual(['410', '450', '9.8%']);
    expect(texts(s, 'ir.segments.items.1.salesShare')).toEqual([null, '36.3%', null]);
    expect(texts(s, 'ir.segments.adjustment')).toEqual(['△110', '△110']);
    expect(texts(s, 'ir.segments.consolidatedOperatingIncome')).toEqual(['1,120', '1,240']);
  });
  it('B6: 全部入りは 3 つの節', () => {
    expect(ir(fullProblem(), 'segments').sections.filter((x) => x.titleCell)).toHaveLength(3);
  });
});

describe('C4: 見通し', () => {
  const s = ir(normalProblem(), 'outlook');
  it('次期予想と当期実績。前期比は独立の行 (行の名前の要素を持つ)', () => {
    expect(s.sections[0]!.columns.map((c) => c.label)).toEqual(['次期予想', '当期実績']);
    expect(texts(s, 'ir.outlook.netSales')).toEqual(['13,000', '12,400']);
    expect(texts(s, 'ir.outlook.netSalesChangeRate')).toEqual(['4.8%', null]);
    expect(texts(s, 'ir.outlook.operatingIncome')).toEqual(['1,320', '1,240']);
    expect(texts(s, 'ir.outlook.operatingIncomeChangeRate')).toEqual(['6.5%', null]);
    expect(texts(s, 'ir.outlook.capex')).toEqual(['900', '850']);
    expect(texts(s, 'ir.outlook.depreciation')).toEqual(['720', '700']);
    expect(texts(s, 'ir.outlook.annualDividend')).toEqual(['30.00円', null]);
    expect(row(s, 'ir.outlook.netSales')!.cells.map((c) => [c?.path, c?.stage])).toEqual([['ir.outlook.forecast.netSales', 'forecast'], ['ir.outlook.actual.netSales', 'actual']]);
  });
  it('期末後の出来事: null は 該当なし (セルは出す)、文があればその文', () => {
    const none = row(s, 'ir.outlook.subsequentEvent')!.cells[0]!;
    expect([none.path, none.text, none.value]).toEqual(['ir.outlook.subsequentEvent', '該当なし', null]);
    const some = row(ir(fullProblem(), 'outlook'), 'ir.outlook.subsequentEvent')!.cells[0]!;
    expect(some.text).toBe('期末後に重要な出来事があった。');
  });
  it('文章 (ir.statements.1)', () => {
    expect(s.sentences.map((c) => [c.path, c.text])).toEqual([['ir.statements.1', '次期は増収増益を見込む。']]);
  });
});

describe('C5: 補足', () => {
  const s = ir(normalProblem(), 'supplement');
  it('前期の設備投資・減価償却費は null → －', () => {
    expect(texts(s, 'ir.supplement.capex')).toEqual(['－', '850']);
    expect(texts(s, 'ir.supplement.depreciation')).toEqual(['－', '700']);
    expect(texts(s, 'ir.supplement.interestBearingDebt')).toEqual(['4,834', '4,692']);
    expect(texts(s, 'ir.supplement.cash')).toEqual(['2,100', '2,300']);
    expect(texts(s, 'ir.supplement.netDebt')).toEqual(['2,734', '2,392']);
    expect(texts(s, 'ir.supplement.equityRatio')).toEqual([null, '54.0%']);
    expect(s.sentences.map((c) => [c.path, c.text])).toEqual([['ir.statements.2', '営業キャッシュ・フローは堅調であった。']]);
    expect(row(s, 'ir.supplement.capex')!.cells[0]).toMatchObject({ value: null, kind: 'money' });
  });
  it('前期の設備投資が数字なら数字', () => {
    expect(texts(ir(fullProblem(), 'supplement'), 'ir.supplement.capex')).toEqual(['800', '850']);
  });
});

describe('C6: 文章は slide の画面にだけ出る', () => {
  it('順は statements の順。文章の無い画面は空', () => {
    const p = normalProblem();
    p.ir.statements.push({ slide: 'highlights', text: '二つ目の文。', claims: [] });
    expect(ir(p, 'highlights').sentences.map((c) => [c.path, c.text])).toEqual([['ir.statements.0', '売上高・営業利益ともに前期を上回った。'], ['ir.statements.3', '二つ目の文。']]);
    expect(ir(p, 'results').sentences).toEqual([]);
    expect(ir(p, 'segments').sentences).toEqual([]);
  });
});

describe('C7: 億円版', () => {
  const p = okuProblem();
  it('IR の金額は小数第一位、比率はそのまま、単位は 億円。短信は百万円のまま', () => {
    const r = ir(p, 'results');
    expect(r.header.unit.text).toBe('億円');
    expect(texts(r, 'ir.results.netSales')).toEqual(['118.0', '124.0']);
    expect(texts(r, 'ir.results.grossMargin')).toEqual(['29.0%', '30.0%']);
    expect(row(r, 'ir.results.netSales')!.cells[0]).toMatchObject({ kind: 'money', unit: '億円' });
    expect(buildScreen(p, 'tanshin', 'summary').header.unit.text).toBe('百万円');
    expect(texts(buildScreen(p, 'tanshin', 'summary'), 'tanshin.summary.netSales')).toEqual(['11,800', '12,400', '5.1%']);
    expect(texts(ir(p, 'highlights'), 'ir.highlights.netSales')).toEqual(['124.0', '5.1%']);
  });
  it('負の億円は △ と小数第一位', () => {
    const q = okuProblem();
    q.ir.supplement.netDebt.current = -30.2;
    expect(texts(ir(q, 'supplement'), 'ir.supplement.netDebt')).toEqual(['27.3', '△30.2']);
  });
});

describe('C8: 全部入りの IR', () => {
  it('どの画面も doc と id を返す', () => {
    for (const id of IR_SLIDES) expect(ir(fullProblem(), id)).toMatchObject({ doc: 'ir', id });
  });
});
