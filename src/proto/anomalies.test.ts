// ケース表 docs/proto/test-cases.md の A (異変。v3)。
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../domain/rng';
import { ANOMALIES, buildAnomaly, kindsFor, applicable, type AnomalyResult } from './anomalies';
import { deriveCards, getCell, locate, type Difficulty } from './cards';
import { companyOf, HARD_NORMALS, NORMALS } from './testing';

const EASY_KINDS = ['E-17', 'E-12', 'E-02', 'E-24', 'E-03', 'E-05', 'E-19', 'E-22', 'E-21', 'E-25', 'E-23', 'E-04', 'E-26', 'E-27', 'E-28'];
const HARD_KINDS = ['H-01', 'H-04', 'H-13', 'H-21', 'H-33'];
const pool = (d: Difficulty) => (d === 'easy' ? NORMALS : HARD_NORMALS);
const card = (r: Pick<AnomalyResult, 'problem' | 'edits'>, d: Difficulty) => deriveCards(r.problem, companyOf(r.problem), d, r.edits);
const normalCard = (p: (typeof NORMALS)[number], d: Difficulty) => deriveCards(p, companyOf(p), d);
const diffOf = (id: string): Difficulty => (id.startsWith('H') ? 'hard' : 'easy');
const slotOf = (c: ReturnType<typeof deriveCards>, k: string) => c.slots.find((s) => s.key === k)!;
const each = (kind: string, fn: (r: AnomalyResult, base: (typeof NORMALS)[number], d: Difficulty) => void) => {
  const d = diffOf(kind);
  const bases = pool(d).filter((p) => applicable(kind, p));
  expect(bases.length).toBeGreaterThan(0);
  bases.forEach((p, i) => fn(buildAnomaly(kind, p, mulberry32(i + 1)), p, d));
};

describe('A1 種類', () => {
  it('やさしい 15・むずかしい 5。欠番は無い', () => {
    expect(kindsFor('easy').map((k) => k.id).sort()).toEqual([...EASY_KINDS].sort());
    expect(kindsFor('hard').map((k) => k.id).sort()).toEqual([...HARD_KINDS].sort());
    for (const gone of ['E-18', 'E-20', 'E-06', 'E-07', 'E-09']) expect(ANOMALIES.map((a) => a.id)).not.toContain(gone);
  });
});

describe('A2 作れる・元の問題は変わらない・同じ会社と期', () => {
  it('全種類 × 当てられる正常', () => {
    for (const kind of [...EASY_KINDS, ...HARD_KINDS]) {
      const d = diffOf(kind);
      for (const p of pool(d).filter((x) => applicable(kind, x))) {
        const before = JSON.stringify(p);
        const r = buildAnomaly(kind, p, mulberry32(7));
        expect(JSON.stringify(p), kind).toBe(before);
        expect([r.problem.companyId, r.problem.tanshin.header.periodLabel], kind).toEqual([p.companyId, p.tanshin.header.periodLabel]);
      }
    }
  });
  it('E-02 を当てられる正常は 12 問のうち 8 (増益 6・減益 2)。ほかの種類は 12 問すべて', () => {
    const e02 = NORMALS.filter((p) => applicable('E-02', p));
    expect(e02).toHaveLength(8);
    const up = e02.filter((p) => p.tanshin.incomeStatement.current.operatingIncome > p.tanshin.incomeStatement.previous.operatingIncome);
    expect([up.length, e02.length - up.length]).toEqual([6, 2]);
    for (const k of EASY_KINDS.filter((x) => x !== 'E-02')) expect(NORMALS.filter((p) => applicable(k, p)), k).toHaveLength(12);
  });
});

describe('A3・A4 見える・場所がカードの上にある', () => {
  for (const kind of [...EASY_KINDS, ...HARD_KINDS]) {
    it(kind, () => {
      each(kind, (r, base, d) => {
        expect(card(r, d), `${kind} ${base.id}`).not.toEqual(normalCard(base, d));
        const c = card(r, d);
        expect(r.places.length).toBeGreaterThan(0);
        expect(locate(c, r.places).length, `${kind} places`).toBeGreaterThanOrEqual(r.places.length);
      });
    });
  }
});

describe('A5〜A8 中身の異変', () => {
  it('A5 E-17: 見出し語が数字の向きと逆', () => {
    each('E-17', (r, base) => {
      const t = base.tanshin.incomeStatement;
      const real = t.current.operatingIncome >= t.previous.operatingIncome ? '増益' : '減益';
      expect(card(r, 'easy').headline!.text).toBe(real === '増益' ? '減益' : '増益');
    });
  });
  it('A6 E-12: 営業利益率が 2 倍以上か 1/2 以下', () => {
    each('E-12', (r, base) => {
      const ratio = r.problem.tanshin.summary.operatingMargin / base.tanshin.summary.operatingMargin;
      expect(ratio >= 2 || ratio <= 0.5).toBe(true);
    });
  });
  it('A7 E-02: 増益は 10 倍・減益は 1/10。営業利益率は元のまま。増益は 10 倍でも売上高の 0.8 倍以下', () => {
    each('E-02', (r, base) => {
      const b = base.tanshin.incomeStatement, a = r.problem.tanshin.incomeStatement;
      const up = b.current.operatingIncome > b.previous.operatingIncome;
      expect(Math.abs(a.current.operatingIncome - (up ? b.current.operatingIncome * 10 : b.current.operatingIncome / 10))).toBeLessThanOrEqual(0.5); // 1/10 は整数に丸める
      expect(r.problem.tanshin.summary.operatingMargin).toBe(base.tanshin.summary.operatingMargin);
      if (up) expect(a.current.operatingIncome).toBeLessThanOrEqual(0.8 * a.current.netSales);
      // 向きが変わらない
      expect(a.current.operatingIncome > a.previous.operatingIncome).toBe(up);
    });
  });
  it('A8 E-24: 売上高が営業利益の 0.8 倍以下。営業利益・営業利益率は元のまま', () => {
    each('E-24', (r, base) => {
      const a = r.problem.tanshin.incomeStatement.current;
      expect(a.netSales).toBeLessThanOrEqual(0.8 * a.operatingIncome);
      expect(a.operatingIncome).toBe(base.tanshin.incomeStatement.current.operatingIncome);
      expect(r.problem.tanshin.summary.operatingMargin).toBe(base.tanshin.summary.operatingMargin);
    });
  });
});

describe('A9〜A14・A26〜28 表記の異変', () => {
  it('A9 E-21: 金額の欄の桁区切りだけが違う (no-comma は 4 桁以上の欄ならどれでも・comma-shift は売上高)', () => {
    const seen = new Set<string>();
    NORMALS.forEach((base, i) => {
      for (let k = 1; k <= 6; k++) {
        const r = buildAnomaly('E-21', base, mulberry32(i * 10 + k));
        const c = card(r, 'easy'), o = normalCard(base, 'easy');
        const diff = c.slots.filter((s, n) => s.text !== o.slots[n]!.text);
        expect(diff, base.id).toHaveLength(1);
        expect(diff[0]!.text.replace(/,/g, '')).toBe(o.slots.find((s) => s.key === diff[0]!.key)!.text.replace(/,/g, ''));
        expect(diff[0]!.kind).toBe('amount');
        seen.add(`${r.edits[0]!.op === 'format' ? r.edits[0]!.style : ''}:${diff[0]!.key}`);
      }
    });
    expect(seen.has('comma-shift:sales')).toBe(true);
    expect(seen.has('no-comma:opPrev') && seen.has('no-comma:opCurr') && seen.has('no-comma:sales')).toBe(true);
    expect([...seen].filter((x) => x.startsWith('comma-shift')).every((x) => x === 'comma-shift:sales')).toBe(true);
  });
  it('A10 E-22: 数字 5 つか、見出し語 2 回', () => {
    each('E-22', (r) => {
      const c = card(r, 'easy');
      expect(c.slots.length === 5 || c.headline!.count === 2).toBe(true);
    });
    const kinds = new Set(NORMALS.map((p, i) => { const c = card(buildAnomaly('E-22', p, mulberry32(i + 1)), 'easy'); return c.headline!.count; }));
    expect(kinds.size).toBeGreaterThanOrEqual(1);
  });
  it('A11 E-25: 売上高の表示に △。データは負にならない', () => {
    each('E-25', (r, base) => {
      expect(slotOf(card(r, 'easy'), 'sales').text.startsWith('△')).toBe(true);
      expect(JSON.stringify(r.problem)).toBe(JSON.stringify(base));
    });
  });
  it('A12 E-26: 同じ科目名・同じ添え字の欄が 2 つ並び、値が違う', () => {
    each('E-26', (r) => {
      const c = card(r, 'easy');
      const labels = c.slots.map((s) => s.label);
      const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
      expect(dup).toHaveLength(1);
      const same = c.slots.filter((s) => s.label === dup[0]);
      expect(new Set(same.map((s) => s.text)).size).toBe(2);
    });
  });
  it('A13 E-27: 金額の欄に X が 1 字。ほかは数字とカンマだけ', () => {
    each('E-27', (r) => {
      const xs = card(r, 'easy').slots.filter((s) => s.kind === 'amount' && s.text.includes('X'));
      expect(xs).toHaveLength(1);
      expect(xs[0]!.text).toMatch(/^[\d,]*X[\d,]*$/);
      expect(xs[0]!.text.split('X')).toHaveLength(2);
    });
  });
  it('A14 E-28: 期末日の日が 32。データは正しいまま', () => {
    each('E-28', (r, base) => {
      expect(card(r, 'easy').periodEnd).toMatch(/32日$/);
      expect(r.problem.tanshin.columnDates).toEqual(base.tanshin.columnDates);
    });
  });
  it('A15 E-04: 期末日の年が 1 年ずれ、その月の末日 (2 月は閏年なら 29 日)', () => {
    each('E-04', (r, base) => {
      const was = getCell(base, 'tanshin.columnDates.incomeStatement.current') as string;
      const now = getCell(r.problem, 'tanshin.columnDates.incomeStatement.current') as string;
      const [y, m, d] = now.split('-').map(Number) as [number, number, number];
      expect(y).toBe(Number(was.split('-')[0]) - 1);
      expect(m).toBe(Number(was.split('-')[1]));
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      expect(d).toBe(last);
    });
    // 2 月の例 (2024 → 2023 は 28 日。2025 → 2024 は 29 日)
    const feb = structuredClone(NORMALS[0]!);
    feb.tanshin.columnDates.incomeStatement.current = '2025-02-28';
    const r = buildAnomaly('E-04', feb, mulberry32(1));
    expect(getCell(r.problem, 'tanshin.columnDates.incomeStatement.current')).toBe('2024-02-29');
  });
});

describe('A16 そのほかのやさしい', () => {
  it('E-19: 欄の欠落', () => each('E-19', (r) => expect(card(r, 'easy').dropped).toHaveLength(1)));
  it('E-03: 単位が 1 つだけ億円', () => each('E-03', (r) => {
    const units = card(r, 'easy').slots.map((s) => s.unit);
    expect(units.filter((u) => u === '億円')).toHaveLength(1);
  }));
  it('E-05: 営業和益', () => each('E-05', (r) => expect(card(r, 'easy').slots.some((s) => s.label.startsWith('営業和益'))).toBe(true)));
  it('E-23: 別の型の語 (向きは合っている)', () => each('E-23', (r, base) => {
    const t = base.tanshin.incomeStatement;
    const word = card(r, 'easy').headline!.text;
    expect(word).toBe(t.current.operatingIncome >= t.previous.operatingIncome ? '増収' : '減収');
  }));
});

describe('A17 むずかしい', () => {
  const v = (r: AnomalyResult, k: string) => slotOf(card(r, 'hard'), k);
  it('H-01: 総資産と負債及び純資産合計が違う', () => each('H-01', (r) => expect(v(r, 'ta').value).not.toBe(v(r, 'tlna').value)));
  it('H-04: CF の期末残高と現金が違う', () => each('H-04', (r) => expect(v(r, 'cfEnd').value).not.toBe(v(r, 'cash').value)));
  it('H-13: IR の売上高が 5% ずれる', () => each('H-13', (r) => {
    const gap = Math.abs((v(r, 'irSales').value! * 100) / v(r, 'sales').value! - 1);
    expect(gap).toBeGreaterThan(0.03);
  }));
  it('H-21: IR の営業 CF の語が数字と逆', () => each('H-21', (r) => {
    const ocf = v(r, 'ocf').value!;
    expect(v(r, 'irOcf').text.includes(ocf >= 0 ? 'マイナス' : 'プラス')).toBe(true);
  }));
  it('H-33: 欄の重複', () => each('H-33', (r) => expect(card(r, 'hard').slots.length).toBe(28)));
});

describe('A18 答え合わせの文', () => {
  it('全種類が説明文を持つ。E-26・E-27・E-28 は具体的', () => {
    for (const kind of [...EASY_KINDS, ...HARD_KINDS]) each(kind, (r) => expect(r.explanation.length, kind).toBeGreaterThan(8));
    each('E-26', (r) => expect(r.explanation).toMatch(/前期|当期/));
    each('E-27', (r) => expect(r.explanation).toContain('X'));
    each('E-28', (r) => expect(r.explanation).toContain('32'));
  });
});
