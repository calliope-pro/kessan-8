// UA1〜UA8 (docs/test-cases/flow.md §1.3)
import { describe, expect, it } from 'vitest';
import { TEST_KINDS, makeProblem } from '../testing/fixtures';
import { judge } from './answer';
import type { AnomalyPlace } from './types';

const normal = makeProblem({ id: 'p-n', difficulty: 'easy', companyId: 'c01' });
const anomalous = makeProblem({ id: 'p-a', difficulty: 'easy', companyId: 'c02', kind: 'k-calc' });

describe('判定 judge', () => {
  it('UA1: 異変あり答え × 異変ありの問題、異変なし答え × 異変なしの問題は正解', () => {
    expect(judge(anomalous, 'anomaly', TEST_KINDS).correct).toBe(true);
    expect(judge(normal, 'normal', TEST_KINDS).correct).toBe(true);
  });

  it('UA2: 食い違う組み合わせは不正解', () => {
    expect(judge(normal, 'anomaly', TEST_KINDS).correct).toBe(false);
    expect(judge(anomalous, 'normal', TEST_KINDS).correct).toBe(false);
  });

  it('UA3: 異変ありの問題は、正解でも不正解でも、場所・説明・種類の名前を返す', () => {
    for (const answer of ['anomaly', 'normal'] as const) {
      const j = judge(anomalous, answer, TEST_KINDS);
      expect(j.places).toEqual(anomalous.anomaly!.places);
      expect(j.explanation).toBe(anomalous.anomaly!.explanation);
      expect(j.kindName).toBe('合計の計算違い');
    }
  });

  it('UA4: 異変なしの問題の答え合わせは、強調する場所が空で、異変が無かったことを示す', () => {
    const j = judge(normal, 'anomaly', TEST_KINDS);
    expect(j.hasAnomaly).toBe(false);
    expect(j.places).toEqual([]);
    expect(j.explanation).toBeUndefined();
    expect(j.kindName).toBeUndefined();
  });
});
