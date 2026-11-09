// SH1〜SH19 (docs/test-cases/validator.md §2.7): 型の形。
import { describe, expect, it } from 'vitest';
import { shapeErrors } from './index.ts';
import { kindShapeErrors } from './shape.ts';
import { clone, mutate, normalA, normalB, set } from './test-utils.ts';

const errs = (v: unknown) => shapeErrors(v);
const del = (path: string) => {
  const p = clone(normalA()) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let node = p;
  for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
  delete node[keys[keys.length - 1] as string];
  return p;
};
const anomalyOf = (extra: Record<string, unknown> = {}) => ({
  kind: 'k',
  places: [{ doc: 'tanshin', path: 'summary.eps' }],
  explanation: 'x',
  expectedRules: ['ratio-eps'],
  ...extra,
});

describe('shapeErrors', () => {
  it('SH1: 基準問題 A・B は空', () => {
    expect(errs(normalA())).toEqual([]);
    expect(errs(normalB())).toEqual([]);
  });
  it('SH2: キーが無い → 場所つきの誤り 1 件', () => {
    const e = errs(del('tanshin.cashFlow.capex'));
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('tanshin.cashFlow.capex');
  });
  it('SH3: 数値のセルが文字列', () => {
    const e = errs(set(normalA(), 'tanshin.balanceSheet.current.cash', '2300'));
    expect(e.some((m) => m.includes('tanshin.balanceSheet.current.cash'))).toBe(true);
  });
  it('SH4: NaN・Infinity', () => {
    expect(errs(set(normalA(), 'tanshin.balanceSheet.current.cash', NaN)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'tanshin.balanceSheet.current.cash', Infinity)).length).toBeGreaterThan(0);
  });
  it('SH5: 未知のキー', () => {
    const e = errs(set(normalA(), 'tanshin.summary.typo', 1));
    expect(e.some((m) => m.includes('tanshin.summary.typo'))).toBe(true);
  });
  it('SH6: IR の items が 1 要素 → 長さの誤り', () => {
    const e = errs(mutate(normalA(), 'ir.segments.items', (x) => (x as unknown[]).slice(0, 1)));
    expect(e.some((m) => m.includes('ir.segments.items'))).toBe(true);
  });
  it('SH7: previous は null も数値も可、current が null は誤り', () => {
    expect(errs(set(normalA(), 'ir.supplement.capex.previous', null))).toEqual([]);
    expect(errs(set(normalA(), 'ir.supplement.capex.previous', 7))).toEqual([]);
    expect(errs(set(normalA(), 'ir.supplement.capex.current', null)).length).toBeGreaterThan(0);
  });
  it('SH8: 任意項目は許し、tier の値は 1〜3 だけ', () => {
    expect(errs(set(normalA(), 'tier', 2))).toEqual([]);
    expect(errs(set(normalA(), 'labelOverrides', {}))).toEqual([]);
    expect(errs(set(normalA(), 'tier', 4)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'tier', '1')).length).toBeGreaterThan(0);
  });
  it('SH9: difficulty が normal', () => {
    expect(errs(set(normalA(), 'difficulty', 'normal')).length).toBeGreaterThan(0);
  });
  it('SH10: anomaly.places が空', () => {
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [] }))).length).toBeGreaterThan(0);
  });
  it('SH11: anomaly.places[0].doc が pdf', () => {
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [{ doc: 'pdf', path: 'x' }] }))).length).toBeGreaterThan(0);
  });
  it('SH12: ルートがオブジェクトでない → 1 件で止まる (例外にならない)', () => {
    for (const root of [[], null, '問題']) expect(errs(root)).toHaveLength(1);
  });
  it('SH13: セグメントは 2 か 3、4 と 1 は誤り', () => {
    const seg = { name: 'x', netSales: 0, profit: 0 };
    const withN = (n: number) => mutate(normalA(), 'tanshin.notes.segments.current.segments', (s) => [...(s as unknown[]), ...Array(Math.max(0, n - 2)).fill(seg)].slice(0, n));
    expect(errs(withN(3))).toEqual([]);
    expect(errs(withN(4)).length).toBeGreaterThan(0);
    expect(errs(withN(1)).length).toBeGreaterThan(0);
  });
  it('SH14: unitOverrides・signOverrides の値が数値', () => {
    expect(errs(set(normalA(), 'unitOverrides', { 'tanshin.balanceSheet': 1 })).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'signOverrides', { 'tanshin.cashFlow.capex': 1 })).length).toBeGreaterThan(0);
  });
  it('SH15: place は path か itemKey のどちらか 1 つだけ', () => {
    const both = anomalyOf({ places: [{ doc: 'tanshin', path: 'a', itemKey: 'b' }] });
    const none = anomalyOf({ places: [{ doc: 'tanshin' }] });
    expect(errs(set(normalA(), 'anomaly', both)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', none)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ places: [{ doc: 'tanshin', itemKey: 'tanshin.summary.eps' }] })))).toEqual([]);
  });
  it('SH16: expectedRules が無い・配列でない', () => {
    const noRules = { ...anomalyOf() } as Record<string, unknown>;
    delete noRules.expectedRules;
    expect(errs(set(normalA(), 'anomaly', noRules)).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'anomaly', anomalyOf({ expectedRules: 'ratio-eps' }))).length).toBeGreaterThan(0);
  });
  it('SH17: claims の direction・metric が未知', () => {
    expect(errs(set(normalA(), 'ir.statements.0.claims.0.direction', 'flat')).length).toBeGreaterThan(0);
    expect(errs(set(normalA(), 'ir.statements.0.claims.0.metric', 'nothing')).length).toBeGreaterThan(0);
  });
  it('SH18: statements の slide が未知', () => {
    expect(errs(set(normalA(), 'ir.statements.0.slide', 'nothing')).length).toBeGreaterThan(0);
  });
  it('SH19: 旧名の longTermDebtChange を足し、新しい 2 つを消すと欠落と未知のキーの 2 件以上', () => {
    const p = del('tanshin.cashFlow.longTermBorrowings') as unknown as Record<string, unknown>;
    const cf = (p.tanshin as Record<string, Record<string, unknown>>).cashFlow as Record<string, unknown>;
    cf.longTermDebtChange = -100;
    const e = errs(p);
    expect(e.some((m) => m.includes('longTermBorrowings'))).toBe(true);
    expect(e.some((m) => m.includes('longTermDebtChange'))).toBe(true);
  });

  // SE1〜SE3 (docs/test-cases/cards.md §8): cardEdits・card の場所・base・changed の形
  describe('SE1・SE2: cardEdits', () => {
    const withEdits = (edits: unknown) => set(normalA(), 'cardEdits', edits);
    const good = [
      { card: 0, slot: 'margin', op: 'drop' },
      { card: 0, slot: 'sales', op: 'format', style: 'no-comma' },
      { card: 0, slot: 'sales', op: 'format', style: 'comma-shift' },
      { card: 0, slot: 'sales', op: 'unit', unit: '億円' },
      { card: 0, slot: 'opCurr', op: 'dup' },
      { card: 0, slot: 'headline', op: 'dup' },
      { card: 0, slot: 'opPrev', op: 'suffix', word: '当期' },
      { card: 0, slot: 'opCurr', op: 'glyph', at: 2 },
      { card: 0, slot: 'sales', op: 'sign' },
      { card: 0, slot: 'period', op: 'day', day: 32 },
      { card: 0, op: 'headline', word: '増収' },
    ];
    it.each(good)('正しい編集は誤りなし (%j)', (edit) => expect(errs(withEdits([edit]))).toEqual([]));
    it('編集なし・空の配列は誤りなし', () => {
      expect(errs(normalA())).toEqual([]);
      expect(errs(withEdits([]))).toEqual([]);
    });
    const bad: [string, unknown][] = [
      ['op が未知', { card: 0, slot: 'margin', op: 'erase' }],
      ['swap (v2 の op。v3 には無い)', { card: 0, op: 'swap', slots: ['sales', 'margin'] }],
      ['shape を持つ (v2 の型)', { shape: 'E1', card: 0, slot: 'margin', op: 'drop' }],
      ['card が 0 でない', { card: 1, slot: 'margin', op: 'drop' }],
      ['card が数でない', { card: '0', slot: 'margin', op: 'drop' }],
      ['slot が文字列でない', { card: 0, slot: 3, op: 'drop' }],
      ['format の style が未知', { card: 0, slot: 'sales', op: 'format', style: 'rounded' }],
      ['suffix の word が前期・当期でない', { card: 0, slot: 'opPrev', op: 'suffix', word: '前期末' }],
      ['suffix の slot が opPrev・opCurr でない', { card: 0, slot: 'sales', op: 'suffix', word: '前期' }],
      ['day が 32 でない', { card: 0, slot: 'period', op: 'day', day: 31 }],
      ['day の slot が period でない', { card: 0, slot: 'sales', op: 'day', day: 32 }],
      ['glyph の at が整数でない', { card: 0, slot: 'opCurr', op: 'glyph', at: 1.5 }],
      ['drop に slot が無い', { card: 0, op: 'drop' }],
      ['未知のキー', { card: 0, slot: 'margin', op: 'drop', extra: 1 }],
      ['unit に unit が無い', { card: 0, slot: 'sales', op: 'unit' }],
      ['headline に word が無い', { card: 0, op: 'headline' }],
    ];
    it.each(bad)('誤り: %s', (_name, edit) => expect(errs(withEdits([edit])).length).toBeGreaterThan(0));
    it('cardEdits が配列でない', () => expect(errs(withEdits({ op: 'drop' })).length).toBeGreaterThan(0));
  });

  describe('SE3: card の場所と base・changed', () => {
    const place = (value: unknown) => errs(set(normalA(), 'anomaly', { kind: 'k', places: [value], explanation: 'x', expectedRules: [] }));
    it('{doc: card, card: 0, slot} は誤りなし', () => expect(place({ doc: 'card', card: 0, slot: 'margin' })).toEqual([]));
    it.each<[string, unknown]>([
      ['shape を持つ', { doc: 'card', shape: 'E1', card: 0, slot: 'margin' }],
      ['card が 0 でない', { doc: 'card', card: 1, slot: 'margin' }],
      ['card が数でない', { doc: 'card', card: '0', slot: 'margin' }],
      ['slot が無い', { doc: 'card', card: 0 }],
      ['path も持つ', { doc: 'card', card: 0, slot: 'margin', path: 'x' }],
      ['未知のキー', { doc: 'card', card: 0, slot: 'margin', extra: 1 }],
    ])('誤り: %s', (_n, value) => expect(place(value).length).toBeGreaterThan(0));
    it('base・changed (任意)', () => {
      const ok = set(normalA(), 'anomaly', { kind: 'k', places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [], base: 'easy-001', changed: ['tanshin.summary.eps'] });
      expect(errs(ok)).toEqual([]);
      const bad = set(normalA(), 'anomaly', { kind: 'k', places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [], base: 1, changed: 'x' });
      expect(errs(bad).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SE4: 種類の relationChecks・ledger', () => {
    const kind = (extra: Record<string, unknown>) => kindShapeErrors({ id: 'E-24', family: 'calculation', name: 'x', primaryRules: ['ratio-operating-margin'], allowedRules: ['ratio-operating-margin'], ...extra });
    it('どちらも無い・正しい値は誤りなし', () => {
      expect(kind({})).toEqual([]);
      expect(kind({ relationChecks: ['R-margin', 'R-lt'], ledger: 'v3' })).toEqual([]);
      expect(kind({ relationChecks: [] })).toEqual([]);
      for (const op of ['drop', 'format', 'unit', 'dup', 'suffix', 'glyph', 'sign', 'day', 'headline']) expect(kind({ editOp: op }), op).toEqual([]);
    });
    it.each<[string, Record<string, unknown>]>([
      ['relationChecks に未知の名前', { relationChecks: ['R-margin', 'R-x'] }],
      ['relationChecks が配列でない', { relationChecks: 'R-margin' }],
      ['ledger が v3 以外 (V3)', { ledger: 'V3' }],
      ['ledger が v3 以外 (v2)', { ledger: 'v2' }],
      ['ledger が真偽値', { ledger: true }],
      ['editOp が未知', { editOp: 'swap' }],
      ['editOp が配列', { editOp: ['drop'] }],
    ])('誤り: %s', (_n, extra) => expect(kind(extra).length).toBeGreaterThan(0));
  });
});
