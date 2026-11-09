// 型の正本 (types.ts) の定数の約束 (docs/design.md §4.5)。型そのものはコンパイル時に tsc が確かめる。
import { describe, expect, it } from 'vitest';
import { ANOMALY_FAMILIES, CLAIM_METRICS, FAMILY_DIFFICULTY, RELATION_CHECKS } from './types';

describe('異変の系統と難易度の対応', () => {
  it('T1: すべての系統が難易度を持つ (系統を足して対応を忘れない)', () => {
    expect(Object.keys(FAMILY_DIFFICULTY).sort()).toEqual([...ANOMALY_FAMILIES].sort());
  });

  it('T2: やさしい = 見た目・計算・文章、むずかしい = 会計・資料間・注記・手口 (anomalies.md §5)', () => {
    const of = (d: string) => ANOMALY_FAMILIES.filter((f) => FAMILY_DIFFICULTY[f] === d).sort();
    expect(of('easy')).toEqual(['appearance', 'calculation', 'text']);
    expect(of('hard')).toEqual(['accounting', 'card-form', 'cross-document', 'notes', 'tactics']);
  });

  it('T3: 文章の主張が見る数字は重複しない', () => {
    expect(new Set(CLAIM_METRICS).size).toBe(CLAIM_METRICS.length);
  });

  it('K15: card-form (形のずれ) はむずかしいの系統。card-relation の検査の名前は 5 つ。形の ID (SHAPE_IDS) は無い', async () => {
    expect(FAMILY_DIFFICULTY['card-form']).toBe('hard');
    expect(RELATION_CHECKS).toEqual(['R-dir', 'R-margin', 'R-range', 'R-ne', 'R-lt']);
    expect('SHAPE_IDS' in (await import('./types'))).toBe(false);
  });
});
