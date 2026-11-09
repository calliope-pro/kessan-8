// ケース表 docs/proto/test-cases.md の R (1 社を読む時間)。
import { describe, expect, it } from 'vitest';
import { deriveCards } from './cards';
import { cardChars, parseReading, readingRecord, summarizeReading, type Reading } from './readtime';
import { companyOf, HARD_NORMALS, NORMALS } from './testing';

describe('R1 カードの文字数', () => {
  it('やさしいは 100 字以下・むずかしいは 450〜750 字', () => {
    for (const p of NORMALS) expect(cardChars(deriveCards(p, companyOf(p), 'easy'))).toBeLessThanOrEqual(100);
    for (const p of HARD_NORMALS) {
      const n = cardChars(deriveCards(p, companyOf(p), 'hard'));
      expect(n).toBeGreaterThanOrEqual(450);
      expect(n).toBeLessThanOrEqual(750);
    }
  });
});

const rd = (n: number, secs: number[], anomalyEvery = 2): Reading => ({
  pid: `P${n}`, difficulty: 'hard', seed: n,
  rounds: secs.map((s, i) => ({ hasAnomaly: i % anomalyEvery === 0, said: 'normal' as const, seconds: s })),
});

describe('R2 記録の文を読み戻す', () => {
  it('参加者・難易度・種・1 社ごとの結果', () => {
    const r = rd(1, [30, 41.5, 52, 20]);
    expect(parseReading(readingRecord(r))).toEqual(r);
  });
  it('壊れた文は null', () => {
    expect(parseReading('')).toBeNull();
    expect(parseReading('８期連続 試作 読む時間の記録\n参加者: A')).toBeNull();
  });
});

describe('R3 集計', () => {
  it('中央値・最大・60 秒以内の割合・判定', () => {
    const rs = [rd(1, [30, 40, 50, 55, 20, 35, 45, 25]), rd(2, [31, 41, 51, 56, 21, 36, 46, 26])];
    const s = summarizeReading(rs).find((x) => x.difficulty === 'hard' && x.kind === 'all')!;
    expect(s.n).toBe(16);
    expect(s.median).toBeCloseTo(38, 0);
    expect(s.max).toBe(56);
    expect(s.within60).toBe(1);
    expect(s.verdict).toBe('収まる');
  });
  it('60 秒を超える社が 1 割を超えると収まらない・5 社に満たない区分は未確認', () => {
    const slow = summarizeReading([rd(1, [70, 80, 40, 50, 65, 30, 20, 25])]).find((x) => x.kind === 'all')!;
    expect(slow.verdict).toBe('超える');
    const few = summarizeReading([rd(1, [30, 40])]).find((x) => x.kind === 'all')!;
    expect(few.verdict).toBe('未確認');
  });
  it('正常・異変に分ける', () => {
    const out = summarizeReading([rd(1, [10, 20, 30, 40, 50, 60, 70, 80])]);
    expect(out.find((x) => x.kind === 'anomaly')!.n).toBe(4);
    expect(out.find((x) => x.kind === 'normal')!.n).toBe(4);
  });
});

describe('R4 外れ値', () => {
  it('0 以下・15 分超は数えない', () => {
    const s = summarizeReading([rd(1, [0, -3, 1000, 30, 40, 50, 20, 25])]).find((x) => x.kind === 'all')!;
    expect(s.n).toBe(5);
  });
});
