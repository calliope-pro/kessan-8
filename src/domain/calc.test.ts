// docs/test-cases/viewer.md §5.2 (D3〜D15) の数値の部分: 検算の差・桁・比・比べられない理由。文字にするのは ui/viewer/calc-lines.ts (書式は ui/format.ts の 1 か所)。
import { describe, expect, it } from 'vitest';
import { compareCells, type CalcCell } from './calc';

const cell = (over: Partial<CalcCell> & Pick<CalcCell, 'value'>): CalcCell => ({ path: 'x', kind: 'money', unit: '百万円', stage: null, order: 0, ...over });

describe('compareCells (数値だけを返す)', () => {
  it('D3: 差 = 当期 − 前期、比 = 当期 ÷ 前期。渡す順に依らない', () => {
    const cur = cell({ value: 12400, stage: 'current', order: 1 });
    const prev = cell({ value: 11800, stage: 'previous', order: 0 });
    for (const [a, b] of [[cur, prev], [prev, cur]] as const) {
      expect(compareCells(a, b)).toMatchObject({ comparable: true, diff: 600, digits: 0, kind: 'money', unit: '百万円' });
      expect((compareCells(a, b) as { ratio: number }).ratio).toBeCloseTo(1.0508, 4);
    }
  });
  it('D7: 億円は 10 倍した整数で引く (124.6 − 30.2 = 94.4 ちょうど)。桁は 1', () => {
    const r = compareCells(cell({ value: 124.6, unit: '億円', order: 1 }), cell({ value: 30.2, unit: '億円', order: 5 }));
    expect(r).toMatchObject({ comparable: true, diff: 94.4, digits: 1 });
  });
  it('D8・D9: 比率は桁 1、1 株当たりは桁 2。種別が結果に残る', () => {
    expect(compareCells(cell({ value: 54, kind: 'percent', unit: '%' }), cell({ value: 50, kind: 'percent', unit: '%' }))).toMatchObject({ diff: 4, digits: 1, kind: 'percent' });
    expect(compareCells(cell({ value: 954.42, kind: 'perShare', unit: '円', stage: 'current' }), cell({ value: 900, kind: 'perShare', unit: '円', stage: 'previous' }))).toMatchObject({ diff: 54.42, digits: 2, kind: 'perShare' });
  });
  it('D13: B が 0 のとき比は null (0 で割らない)', () => {
    expect(compareCells(cell({ value: 1240, order: 1 }), cell({ value: 0, order: 2 }))).toMatchObject({ comparable: true, diff: 1240, ratio: null });
  });
  it('D11・D12: 比べられない理由 (単位が違う / 数字ではない)', () => {
    expect(compareCells(cell({ value: 1 }), cell({ value: 5, kind: 'percent', unit: '%' }))).toEqual({ comparable: false, reason: 'unit' });
    expect(compareCells(cell({ value: 1, unit: '億円' }), cell({ value: 5 }))).toEqual({ comparable: false, reason: 'unit' });
    expect(compareCells(cell({ value: 1 }), cell({ value: null }))).toEqual({ comparable: false, reason: 'not-number' });
    expect(compareCells(cell({ value: 1 }), cell({ value: 'a', kind: 'text', unit: null }))).toEqual({ comparable: false, reason: 'not-number' });
  });
});
