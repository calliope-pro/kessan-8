// ケース表 docs/proto/test-cases.md の P (遊び手に渡す形)。
import { describe, expect, it } from 'vitest';
import { buildDeck, FORM_KINDS, guessProbability, scoreSession, summarize, type Response } from './playtest';
import { COMPANIES, NORMALS } from './testing';

const resp = (anomalyHits: number, falseAlarms: number): Response[] => [
  ...Array.from({ length: 4 }, (_, i): Response => ({ index: i, hasAnomaly: true, said: i < anomalyHits ? 'anomaly' : 'normal' })),
  ...Array.from({ length: 4 }, (_, i): Response => ({ index: 4 + i, hasAnomaly: false, said: i < falseAlarms ? 'anomaly' : 'normal' })),
];

describe('P1〜P3 確かめの 1 組', () => {
  it('P1 8 枚 = 異変 4 + 正常 4。異変は型のずれだけ', () => {
    for (const shape of ['E1', 'E3'] as const) for (let seed = 1; seed < 50; seed++) {
      const deck = buildDeck(seed, shape, NORMALS);
      expect(deck).toHaveLength(8);
      expect(deck.filter((r) => r.anomaly).length).toBe(4);
      for (const r of deck) {
        expect(r.shape).toBe(shape);
        if (r.anomaly) expect(FORM_KINDS).toContain(r.anomaly.kind);
      }
      expect(new Set(deck.filter((r) => r.anomaly).map((r) => r.anomaly!.kind)).size).toBe(4);
    }
  });
  it('P1 異変の位置は種で散る (いつも前半に固まらない)', () => {
    const firsts = new Set<boolean>();
    for (let seed = 1; seed < 60; seed++) firsts.add(!!buildDeck(seed, 'E1', NORMALS)[0]!.anomaly);
    expect(firsts.size).toBe(2);
  });
  it('P2 同じ種・同じ形は同じ 1 組', () => {
    expect(buildDeck(5, 'E1', NORMALS)).toEqual(buildDeck(5, 'E1', NORMALS));
  });
  it('P3 同じ会社を使わない', () => {
    for (let seed = 1; seed < 50; seed++) {
      const deck = buildDeck(seed, 'E3', NORMALS);
      expect(new Set(deck.map((r) => r.problem.companyId)).size).toBe(8);
      expect(COMPANIES.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('P4・P5 採点 (plans.md §8.1 の合格の基準)', () => {
  it('P4 見つけ 3 以上かつ誤り 1 以下は合格', () => {
    expect(scoreSession(resp(3, 1)).pass).toBe(true);
    expect(scoreSession(resp(4, 0)).pass).toBe(true);
    expect(scoreSession(resp(4, 1))).toMatchObject({ found: 4, falseAlarms: 1, pass: true });
  });
  it('P5 境は不合格', () => {
    expect(scoreSession(resp(2, 0)).pass).toBe(false);
    expect(scoreSession(resp(4, 2)).pass).toBe(false);
    expect(scoreSession(resp(2, 2)).pass).toBe(false);
    expect(scoreSession(resp(0, 0))).toMatchObject({ found: 0, falseAlarms: 0, pass: false });
  });
});

describe('P6 5 人の集計', () => {
  const n = (passed: number, total: number) => summarize(Array.from({ length: total }, (_, i) => ({ pass: i < passed })));
  it('5 人以上: 5/5 = 強い合図、4/5 = 弱い合図、3 以下 = 効かない', () => {
    expect(n(5, 5).verdict).toBe('強い合図');
    expect(n(4, 5).verdict).toBe('弱い合図');
    expect(n(3, 5).verdict).toBe('効かない');
    expect(n(0, 5).verdict).toBe('効かない');
  });
  it('5 人に満たない: 全員合格なら弱い合図、それ以外は未確認 (Q17)', () => {
    expect(n(3, 3).verdict).toBe('弱い合図');
    expect(n(2, 3).verdict).toBe('未確認');
    expect(n(1, 1).verdict).toBe('未確認');
    expect(n(0, 0).verdict).toBe('未確認');
  });
  it('人数と合格を返す', () => {
    expect(n(4, 5)).toMatchObject({ passed: 4, n: 5 });
  });
});

describe('P7 偶然の合格率 (導出の再現)', () => {
  it('1 人 ≈ 9.8%、5 人中 4 人以上 ≈ 0.04%', () => {
    const { one, fourOfFive } = guessProbability();
    expect(one).toBeCloseTo(25 / 256, 6);
    expect(Math.round(one * 1000) / 10).toBe(9.8);
    expect(Math.round(fourOfFive * 100000) / 1000).toBeCloseTo(0.04, 2);
  });
});
