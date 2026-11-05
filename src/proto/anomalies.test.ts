// ケース表 docs/proto/test-cases.md の A (異変)。
import { describe, expect, it } from 'vitest';
import { ANOMALIES, buildAnomaly, kindsFor } from './anomalies';
import { deriveCard, locate, SHAPES, type ShapeId } from './cards';
import { mulberry32 } from '../domain/rng';
import { companyOf, NORMALS } from './testing';

const pairs = ANOMALIES.flatMap((a) => a.shapes.map((s) => [a.id, s] as const));
const normalOf = (id: string) => NORMALS.find((p) => p.id === id)!;
const E017 = normalOf('easy-017');
function build(kind: string, shape: ShapeId, p = E017) {
  const res = buildAnomaly(kind, p, shape, mulberry32(7));
  const base = deriveCard(p, companyOf(p), shape);
  const card = deriveCard(res.problem, companyOf(p), shape, res.edits);
  return { res, base, card };
}
const slot = (c: ReturnType<typeof deriveCard>, k: string) => c.slots.find((s) => s.key === k)!;

describe('A1 形ごとの種類の数 (台帳 §2.2)', () => {
  it('E1 = 12・E2 = 12・E3 = 9。全体 15', () => {
    expect(kindsFor('E1')).toHaveLength(12);
    expect(kindsFor('E2')).toHaveLength(12);
    expect(kindsFor('E3')).toHaveLength(9);
    expect(ANOMALIES).toHaveLength(15);
    expect(new Set(ANOMALIES.map((a) => a.id)).size).toBe(15);
  });
});

describe('A2〜A4 全種類 × 見える形 × 正常 12 問', () => {
  it('作れる・元は変わらない・カードが正常とちがう・places がカードに載っている・説明がある (A14)', () => {
    for (const p of NORMALS) {
      const before = JSON.stringify(p);
      for (const [kind, shape] of pairs) {
        const { res, base, card } = build(kind, shape, p);
        const where = `${p.id} ${kind} ${shape}`;
        expect(card, `A3 ${where}`).not.toEqual(base);
        expect(res.places.length, `A4 ${where}`).toBeGreaterThan(0);
        for (const pl of res.places) expect(locate(card, [pl]).length, `A4 ${where} ${pl}`).toBeGreaterThan(0);
        expect(res.explanation.length, `A14 ${where}`).toBeGreaterThan(5);
      }
      expect(JSON.stringify(p), 'A2 元の問題は変わらない').toBe(before);
    }
  });
  it('A13 同じ会社・同じ期の問題から作る', () => {
    for (const [kind, shape] of pairs) {
      const { res } = build(kind, shape);
      expect(res.problem.companyId).toBe(E017.companyId);
      expect(res.problem.fiscalYear).toBe(E017.fiscalYear);
    }
  });
  it('見えない形では作らない', () => {
    expect(() => buildAnomaly('E-09', E017, 'E1', mulberry32(1))).toThrow();
    expect(() => buildAnomaly('E-07', E017, 'E3', mulberry32(1))).toThrow();
  });
});

describe('A5〜A12・A15 種類ごとの中身', () => {
  it('A5 E-17: 見出し語が数字の向きと逆', () => {
    for (const p of NORMALS) {
      const t = p.tanshin.incomeStatement;
      const up = t.current.operatingIncome >= t.previous.operatingIncome;
      expect(build('E-17', 'E1', p).card.headline?.text).toBe(up ? '減益' : '増益');
      const upS = t.current.netSales >= t.previous.netSales;
      expect(build('E-17', 'E2', p).card.headline?.text).toBe(upS ? '減収' : '増収');
    }
  });
  it('A6 E-12: 営業利益率が 2 倍以上か 1/2 以下', () => {
    for (const p of NORMALS) {
      const { base, card } = build('E-12', 'E1', p);
      const r = slot(card, 'margin').value / slot(base, 'margin').value;
      expect(r >= 2 || r <= 0.5).toBe(true);
    }
  });
  it('A7 E-02: 1 つの数字が 10 倍 (E3 は総資産を足し直す)', () => {
    const e1 = build('E-02', 'E1');
    expect(slot(e1.card, 'sales').value).toBe(slot(e1.base, 'sales').value * 10);
    const e2 = build('E-02', 'E2');
    expect(slot(e2.card, 'salesCurr').value).toBe(slot(e2.base, 'salesCurr').value * 10);
    const e3 = build('E-02', 'E3');
    expect(slot(e3.card, 'fixed').value).toBe(slot(e3.base, 'fixed').value * 10);
    expect(slot(e3.card, 'total').value).toBe(slot(e3.card, 'current').value + slot(e3.card, 'fixed').value);
  });
  it('A8 E-09: 総資産が足し算の値から 10% 以上ずれる', () => {
    for (const p of NORMALS) {
      const { card } = build('E-09', 'E3', p);
      const sum = slot(card, 'current').value + slot(card, 'fixed').value;
      expect(Math.abs(slot(card, 'total').value - sum) / sum).toBeGreaterThanOrEqual(0.1);
    }
  });
  it('A9 E-07: 数字で大きいほうの棒が、小さいほうの棒の 2/3 以下 (増収でも減収でも)', () => {
    for (const p of NORMALS) {
      const { card } = build('E-07', 'E2', p);
      const { previous, current, axisMin } = card.bars!;
      const lo = Math.min(previous, current), hi = Math.max(previous, current);
      const nums = p.tanshin.incomeStatement;
      const bigger = nums.current.netSales >= nums.previous.netSales ? 'current' : 'previous';
      expect(lo - axisMin > 0).toBe(true);
      expect(card.bars![bigger] - axisMin).toBeLessThanOrEqual(((bigger === 'current' ? previous : current) - axisMin) * (2 / 3));
      expect(hi).toBeGreaterThan(lo);
    }
  });
  it('A10 E-06: 描いた長い棒 ÷ 短い棒が 1.5 以上', () => {
    for (const p of NORMALS) {
      const { card } = build('E-06', 'E2', p);
      const { previous, current, axisMin } = card.bars!;
      const lo = Math.min(previous, current) - axisMin, hi = Math.max(previous, current) - axisMin;
      expect(lo).toBeGreaterThan(0);
      expect(hi / lo).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('A11 E-18: 売上高と当期の営業利益が入れ替わる', () => {
    const { base, card } = build('E-18', 'E1');
    expect(slot(card, 'sales').value).toBe(slot(base, 'opCurr').value);
    expect(slot(card, 'opCurr').value).toBe(slot(base, 'sales').value);
  });
  it('A12 E-23: 見出し語が別の型の語で、向きは合っている', () => {
    const e1 = build('E-23', 'E1');
    expect(['増収', '減収']).toContain(e1.card.headline?.text);
    expect(e1.card.headline?.text.slice(1)).toBe(e1.base.headline?.text.slice(1) === '益' ? '収' : '益');
    const e2 = build('E-23', 'E2');
    expect(['増益', '減益']).toContain(e2.card.headline?.text);
    expect(e2.card.headline?.text.slice(0, 1)).toBe(e2.base.headline?.text.slice(0, 1));
  });
  it('A15 E-04: 期末日の年が 1 年ずれ、期と合わない', () => {
    const { base, card } = build('E-04', 'E1');
    expect(base.periodEnd).toBe('2024年3月31日');
    expect(card.periodEnd).toBe('2023年3月31日');
    expect(card.period).toBe('2024年3月期');
  });
  it('形のずれの種類は、決まった変更をする', () => {
    expect(build('E-19', 'E1').card.slots).toHaveLength(3);
    expect(build('E-22', 'E1').card.slots).toHaveLength(5);
    expect(build('E-20', 'E3').card.slots.map((s) => s.key)).not.toEqual(build('E-20', 'E3').base.slots.map((s) => s.key));
    expect(new Set(build('E-03', 'E1').card.slots.map((s) => s.unit)).size).toBe(3);
    expect(build('E-05', 'E1').card.slots.map((s) => s.label)).not.toEqual(build('E-05', 'E1').base.slots.map((s) => s.label));
    expect(build('E-21', 'E1').card.slots[0]!.text).not.toBe(build('E-21', 'E1').base.slots[0]!.text);
  });
});

describe('形の網羅', () => {
  it('SHAPES の全形に種類がある', () => {
    for (const s of SHAPES) expect(kindsFor(s).length).toBeGreaterThanOrEqual(4);
  });
});
