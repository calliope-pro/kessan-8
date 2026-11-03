// UA1〜UA8 (docs/test-cases/flow.md §1.3)
import { describe, expect, it } from 'vitest';
import { TEST_KINDS, makeProblem } from '../testing/fixtures';
import { judge, screenOf, screensOf } from './answer';
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

describe('場所の画面 screenOf・screensOf', () => {
  it('UA5: path の先頭が画面', () => {
    expect(screenOf({ doc: 'tanshin', path: 'incomeStatement.current.ordinaryIncome' })).toEqual({ doc: 'tanshin', screen: 'incomeStatement' });
    expect(screenOf({ doc: 'ir', path: 'segments.items.0.netSales.current' })).toEqual({ doc: 'ir', screen: 'segments' });
  });

  it('UA6: header の場所は、その資料の 1 画面目', () => {
    expect(screenOf({ doc: 'tanshin', path: 'header.companyName' })).toEqual({ doc: 'tanshin', screen: 'summary' });
    expect(screenOf({ doc: 'ir', path: 'header.companyName' })).toEqual({ doc: 'ir', screen: 'highlights' });
  });

  it('UA7: itemKey の場所は、項目キーの 2 番目が画面', () => {
    expect(screenOf({ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.cash' })).toEqual({ doc: 'tanshin', screen: 'balanceSheet' });
    expect(screenOf({ doc: 'ir', itemKey: 'ir.outlook.netSales' })).toEqual({ doc: 'ir', screen: 'outlook' });
  });

  it('UA8: 複数の場所の画面は、場所の並びの順で重複なし', () => {
    const places: AnomalyPlace[] = [
      { doc: 'tanshin', path: 'balanceSheet.current.cash' },
      { doc: 'tanshin', path: 'incomeStatement.current.netSales' },
      { doc: 'tanshin', path: 'balanceSheet.previous.cash' },
      { doc: 'ir', path: 'segments.items.0.netSales.current' },
    ];
    expect(screensOf(places)).toEqual([
      { doc: 'tanshin', screen: 'balanceSheet' },
      { doc: 'tanshin', screen: 'incomeStatement' },
      { doc: 'ir', screen: 'segments' },
    ]);
  });
});
