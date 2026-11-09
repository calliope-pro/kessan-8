// 共有データ (companies.json・anomaly-kinds.json) の形の約束 (Sub-task #78)。
// 規則 ID の実在 (検証器の HARD_RULE_IDS に含まれるか) は、検証器 (Task #23) が main に入ったあと、`npm run verify:data` が全件に当てる。
import { describe, expect, it } from 'vitest';
import companies from './companies.json';
import kinds from './anomaly-kinds.json';
import sample from './samples/sample.json';
import { ANOMALY_FAMILIES, FAMILY_DIFFICULTY } from '../domain/types';

/** WCAG の相対輝度とコントラスト比 (docs/plans/companies.md §4 が「計算で確かめた」とした値を、ここで再計算する)。 */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (v[0] as number) + 0.7152 * (v[1] as number) + 0.0722 * (v[2] as number);
}
const contrastWithWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

describe('companies.json (docs/plans/companies.md §5 の 10 社)', () => {
  it('K1: 10 社で、id は c01〜c10、社名・証券コード・社章は重複しない', () => {
    expect(companies.map((c) => c.id)).toEqual(['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10']);
    expect(new Set(companies.map((c) => c.name)).size).toBe(10);
    expect(new Set(companies.map((c) => c.securitiesCode)).size).toBe(10);
    expect(new Set(companies.map((c) => c.emblem)).size).toBe(10);
  });

  it('K2: 社名は「株式会社」で終わり、証券コードは架空の帯 0801〜0810 (c01 → 0801 … c10 → 0810)', () => {
    companies.forEach((c, i) => {
      expect(c.name.endsWith('株式会社')).toBe(true);
      expect(c.securitiesCode).toBe(`08${String(i + 1).padStart(2, '0')}`);
    });
  });

  it('K3: 決算期末の月は 1〜12 の整数。会社設定の値 (2・3・6・9・12 月) と一致する', () => {
    const months = Object.fromEntries(companies.map((c) => [c.id, c.fiscalYearEndMonth]));
    expect(months).toEqual({ c01: 3, c02: 3, c03: 2, c04: 9, c05: 12, c06: 3, c07: 6, c08: 12, c09: 3, c10: 3 });
  });

  it('K4: IR の単位は 百万円 か 億円。億円は c03・c05・c06・c08・c10 の 5 社', () => {
    expect(companies.every((c) => c.irUnit === '百万円' || c.irUnit === '億円')).toBe(true);
    expect(companies.filter((c) => c.irUnit === '億円').map((c) => c.id)).toEqual(['c03', 'c05', 'c06', 'c08', 'c10']);
  });

  it('K5: セグメントは 2 つか 3 つ。3 つは c01・c03・c06・c08・c10。名前は会社の中で重複しない', () => {
    expect(companies.filter((c) => c.segmentNames.length === 3).map((c) => c.id)).toEqual(['c01', 'c03', 'c06', 'c08', 'c10']);
    expect(companies.filter((c) => c.segmentNames.length === 2).map((c) => c.id)).toEqual(['c02', 'c04', 'c05', 'c07', 'c09']);
    companies.forEach((c) => expect(new Set(c.segmentNames).size).toBe(c.segmentNames.length));
  });

  it('K6: 社章は 1 文字。社色は白に対するコントラスト比 4.5 以上。淡い色は社色より明るい', () => {
    companies.forEach((c) => {
      expect(Array.from(c.emblem).length).toBe(1);
      expect(c.colors.main).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.colors.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastWithWhite(c.colors.main)).toBeGreaterThanOrEqual(4.5);
      expect(luminance(c.colors.light)).toBeGreaterThan(luminance(c.colors.main));
    });
  });

  it('K8: 社章は、十字形・三日月・星と月などの公的・宗教的な標章に見える記号でない (包括レビュー B1)', () => {
    const forbidden = Array.from('✚✙✛✜✝✞✟✠☥☦☩☪☫☬☭☮☯☸☽☾卍卐＋+†‡➕✖✕✗✘❌❎✓✿❀☀');
    companies.forEach((c) => expect(forbidden, `${c.id} の社章 ${c.emblem}`).not.toContain(c.emblem));
  });

  it('K9: 赤系 (色相 345°〜30°。朱・煉瓦色を含む) の社色の会社は、社章が塗りつぶした円盤 (● ⬤ ◉ ⚫ ⏺) でない (白地に赤の円盤・十字を作らない)', () => {
    const hue = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const reds = companies.filter((c) => hue(c.colors.main) >= 345 || hue(c.colors.main) <= 30);
    expect(reds.map((c) => c.id)).toEqual(expect.arrayContaining(['c02', 'c05'])); // 赤系の会社が実際にあること (c02 は 17°・c05 は 350°。この確かめが空振りしない)
    reds.forEach((c) => expect(['●', '⬤', '◉', '⚫', '⏺']).not.toContain(c.emblem));
  });

  it('DM1: 見本は正常な問題 1 つ (anomaly が null)。画面ごとの注釈 notes を持たない (出所は 1 つ。docs/test-cases/domain-v3.md §5)', () => {
    expect(Object.keys(sample)).toEqual(['problem']);
    expect(sample.problem.anomaly).toBeNull();
  });

  it('K7: 事業の説明は「会社」で終わる 1 文で、数字を含まず、全社で重複しない (companies.md §5.4)', () => {
    companies.forEach((c) => {
      expect(c.business.endsWith('会社')).toBe(true);
      expect(c.business).not.toMatch(/[0-9０-９。]/);
    });
    expect(new Set(companies.map((c) => c.business)).size).toBe(10);
  });

  it('K8: 業種は JPX の 33 業種区分の名前 (10 種類)', () => {
    expect(companies.map((c) => c.industry)).toEqual(['精密機器', '食料品', '小売業', '情報・通信業', '医薬品', '建設業', '陸運業', '不動産業', 'サービス業', '卸売業']);
  });
});

describe('anomaly-kinds.json (docs/plans/anomalies.md の 42 種類)', () => {
  const easy = kinds.filter((k) => k.id.startsWith('E-'));
  const hard = kinds.filter((k) => k.id.startsWith('H-'));

  it('A1: 42 種類 = やさしい 17 (E-01〜E-17) + むずかしい 25 (H-01〜H-24 と H-28)。使わない H-25〜H-27 は含まない', () => {
    expect(kinds.length).toBe(42);
    expect(easy.map((k) => k.id)).toEqual(Array.from({ length: 17 }, (_, i) => `E-${String(i + 1).padStart(2, '0')}`));
    expect(hard.map((k) => k.id)).toEqual([...Array.from({ length: 24 }, (_, i) => `H-${String(i + 1).padStart(2, '0')}`), 'H-28']);
  });

  it('A2: 系統は型の系統のどれかで、ID の接頭辞が示す難易度と FAMILY_DIFFICULTY が合う', () => {
    kinds.forEach((k) => {
      expect((ANOMALY_FAMILIES as readonly string[]).includes(k.family)).toBe(true);
      const d = FAMILY_DIFFICULTY[k.family as (typeof ANOMALY_FAMILIES)[number]];
      expect(d).toBe(k.id.startsWith('E-') ? 'easy' : 'hard');
    });
  });

  it('A3: 系統ごとの数 (anomalies.md §1: 見た目 8・計算 8・文章 1・会計 13・資料間 9・注記 4。手口は使わない)', () => {
    const count = (f: string) => kinds.filter((k) => k.family === f).length;
    expect(Object.fromEntries(ANOMALY_FAMILIES.map((f) => [f, count(f)]))).toEqual({
      appearance: 8,
      calculation: 8,
      text: 1,
      accounting: 13,
      'cross-document': 9,
      notes: 3,
      tactics: 0,
      'card-form': 0,
    });
  });

  it('A4: 名前は空でなく重複しない。主な規則は空でなく、許容集合に含まれる。規則 ID は小文字のハイフン区切り', () => {
    expect(new Set(kinds.map((k) => k.name)).size).toBe(42);
    kinds.forEach((k) => {
      expect(k.name.trim()).not.toBe('');
      expect(k.primaryRules.length).toBeGreaterThan(0);
      k.primaryRules.forEach((r) => expect(k.allowedRules).toContain(r));
      [...k.primaryRules, ...k.allowedRules].forEach((r) => expect(r).toMatch(/^[a-z]+(-[a-z0-9]+)+$/));
      expect(new Set(k.allowedRules).size).toBe(k.allowedRules.length);
    });
  });
});
