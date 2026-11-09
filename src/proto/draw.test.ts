// ケース表 docs/proto/test-cases.md の D (出題)。
import { describe, expect, it } from 'vitest';
import { drawRun, shapeSequence } from './draw';
import { kindsFor } from './anomalies';
import { SHAPES } from './cards';
import { COMPANIES, NORMALS } from './testing';

const draw = (seed: number, opt: Parameters<typeof drawRun>[2] = {}) => drawRun(seed, NORMALS, opt);

describe('D1 1 周', () => {
  it('8 枠・会社の重複なし', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = draw(seed);
      expect(r).toHaveLength(8);
      expect(new Set(r.map((x) => x.problem.companyId)).size).toBe(8);
    }
  });
});

describe('D2・D3 再現と、形が異変の有無と独立', () => {
  it('D2 同じ種は同じ出題', () => {
    expect(draw(42)).toEqual(draw(42));
    expect(JSON.stringify(draw(1))).not.toBe(JSON.stringify(draw(2)));
  });
  it('D3 形の列は種だけで決まる (異変の割合を変えても同じ)', () => {
    for (const seed of [1, 2, 3, 99]) {
      const expected = shapeSequence(seed, 8);
      expect(draw(seed).map((r) => r.shape)).toEqual(expected);
      expect(draw(seed, { anomalyRatio: 0 }).map((r) => r.shape)).toEqual(expected);
      expect(draw(seed, { anomalyRatio: 1 }).map((r) => r.shape)).toEqual(expected);
    }
  });
});

describe('D4・D8 異変の枠と正常の枠', () => {
  it('D4 異変の枠は、その形で見える種類。D8 正常の枠は正常な問題', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of draw(seed)) {
        if (r.anomaly) {
          expect(kindsFor(r.shape).map((k) => k.id)).toContain(r.anomaly.kind);
          expect(r.edits.every((e) => e.shape === r.shape)).toBe(true);
        } else {
          expect(r.problem.anomaly).toBeNull();
          expect(NORMALS.map((p) => p.id)).toContain(r.problem.id);
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

describe('D5・D6 1 万周の分布 (R-S6)', () => {
  it('形の出現率は異変の枠・正常の枠のそれぞれで 1/3 ± 1.5 ポイント。異変の割合は 0.5 ± 1.5 ポイント', () => {
    const count = { anomaly: { E1: 0, E2: 0, E3: 0, n: 0 }, normal: { E1: 0, E2: 0, E3: 0, n: 0 } };
    for (let seed = 1; seed <= 10000; seed++) {
      for (const r of draw(seed)) {
        const c = r.anomaly ? count.anomaly : count.normal;
        c[r.shape]++;
        c.n++;
      }
    }
    for (const kind of ['anomaly', 'normal'] as const) {
      for (const s of SHAPES) {
        const rate = count[kind][s] / count[kind].n;
        expect(Math.abs(rate - 1 / 3), `${kind} ${s} ${rate}`).toBeLessThanOrEqual(0.015);
      }
    }
    const total = count.anomaly.n + count.normal.n;
    expect(total).toBe(80000);
    expect(Math.abs(count.anomaly.n / total - 0.5)).toBeLessThanOrEqual(0.015);
  }, 120_000);
});

describe('D7 見つけた異変は次から出にくい', () => {
  it('履歴の種類は、ほかに選べるかぎり選ばれない', () => {
    const history = new Set(['E-17', 'E-12', 'E-02']);
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of draw(seed, { anomalyRatio: 1, history })) {
        const others = kindsFor(r.shape).filter((k) => !history.has(k.id));
        if (others.length > 0) expect(history.has(r.anomaly!.kind)).toBe(false);
      }
    }
  });
  it('全部が履歴にあるときは、その中から選ぶ (出題が止まらない)', () => {
    const all = new Set(kindsFor('E3').map((k) => k.id));
    expect(() => draw(1, { anomalyRatio: 1, history: all })).not.toThrow();
  });
});

describe('材料', () => {
  it('会社は 10 社で、正常な問題は 8 社以上にまたがる', () => {
    expect(COMPANIES).toHaveLength(10);
    expect(new Set(NORMALS.map((p) => p.companyId)).size).toBeGreaterThanOrEqual(8);
  });
});
