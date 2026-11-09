// ケース表 docs/proto/test-cases.md の D (出題。v3)。
import { describe, expect, it } from 'vitest';
import { drawRun } from './draw';
import { applicable, kindsFor } from './anomalies';
import { COMPANIES, HARD_NORMALS, NORMALS } from './testing';

const draw = (seed: number, opt: Parameters<typeof drawRun>[2] = {}) => drawRun(seed, [...NORMALS, ...HARD_NORMALS], opt);

describe('D1 1 周', () => {
  it('8 枠・会社の重複なし (やさしい・むずかしい)', () => {
    for (const difficulty of ['easy', 'hard'] as const) for (let seed = 1; seed <= 200; seed++) {
      const r = draw(seed, { difficulty });
      expect(r).toHaveLength(8);
      expect(new Set(r.map((x) => x.problem.companyId)).size).toBe(8);
    }
  });
});

describe('D2・D3 再現と、枠に形が無いこと', () => {
  it('D2 同じ種は同じ出題', () => {
    expect(draw(42)).toEqual(draw(42));
    expect(JSON.stringify(draw(1))).not.toBe(JSON.stringify(draw(2)));
  });
  it('D3 枠は形を持たない (難易度で 1 つに決まる)', () => {
    for (const r of draw(7)) expect(r).not.toHaveProperty('shape');
  });
});

describe('D4・D7 異変の枠と正常の枠', () => {
  it('D4 異変の枠は難易度の種類から。E-02 は基の条件を満たす問題にだけ。D7 正常の枠は正常な問題', () => {
    for (const difficulty of ['easy', 'hard'] as const) for (let seed = 1; seed <= 300; seed++) {
      for (const r of draw(seed, { difficulty })) {
        const base = [...NORMALS, ...HARD_NORMALS].find((p) => p.id === r.baseId)!;
        expect(base.difficulty).toBe(difficulty);
        if (r.anomaly) {
          expect(kindsFor(difficulty).map((k) => k.id)).toContain(r.anomaly.kind);
          expect(applicable(r.anomaly.kind, base)).toBe(true);
        } else {
          expect(r.problem.anomaly).toBeNull();
          expect(r.problem).toBe(base);
          expect(r.edits).toEqual([]);
        }
      }
    }
  });
  it('異変の問題は元の問題と同じ会社・同じ期', () => {
    for (let seed = 1; seed <= 100; seed++) for (const r of draw(seed)) {
      const base = NORMALS.find((p) => p.id === r.baseId)!;
      expect(r.problem.companyId).toBe(base.companyId);
      expect(r.problem.fiscalYear).toBe(base.fiscalYear);
    }
  });
});

describe('D5 1 万周の異変の枠の割合 (設計 §1.5 の R-S6)', () => {
  it('0.5 ± 1.5 ポイント', () => {
    let anomalies = 0, total = 0;
    for (let seed = 1; seed <= 10000; seed++) for (const r of draw(seed)) { total++; if (r.anomaly) anomalies++; }
    expect(total).toBe(80000);
    expect(Math.abs(anomalies / total - 0.5)).toBeLessThanOrEqual(0.015);
  }, 120_000);
});

describe('D6 見つけた異変は次から出にくい', () => {
  it('履歴の種類は、ほかに選べるかぎり選ばれない', () => {
    const history = new Set(['E-17', 'E-12', 'E-02']);
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of draw(seed, { anomalyRatio: 1, history })) {
        const base = NORMALS.find((p) => p.id === r.baseId)!;
        const others = kindsFor('easy').filter((k) => !history.has(k.id) && applicable(k.id, base));
        if (others.length > 0) expect(history.has(r.anomaly!.kind)).toBe(false);
      }
    }
  });
  it('全部が履歴にあるときは、その中から選ぶ (出題が止まらない)', () => {
    const all = new Set(kindsFor('easy').map((k) => k.id));
    expect(() => draw(1, { anomalyRatio: 1, history: all })).not.toThrow();
  });
});

describe('D8 むずかしい', () => {
  it('むずかしい正常な問題と、むずかしいの種類だけで作れる', () => {
    const rs = draw(3, { difficulty: 'hard', anomalyRatio: 1 });
    expect(rs.every((r) => r.problem.difficulty === 'hard' && r.anomaly!.kind.startsWith('H-'))).toBe(true);
  });
});

describe('材料', () => {
  it('会社は 10 社で、正常な問題は 8 社以上にまたがる', () => {
    expect(COMPANIES).toHaveLength(10);
    expect(new Set(NORMALS.map((p) => p.companyId)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(HARD_NORMALS.map((p) => p.companyId)).size).toBeGreaterThanOrEqual(8);
  });
});
