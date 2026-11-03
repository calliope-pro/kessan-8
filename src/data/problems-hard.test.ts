// むずかしい 32 問の設計表 (docs/plans/problems-hard.md §4) が、条件 (§2) を満たすことの確かめ (Sub-task #73)。
// 問題の JSON が着いたあとの確かめ (表との一致) は、同じファイルの下の describe に足す (#76)。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import companies from './companies.json';
import kinds from './anomaly-kinds.json';
import { FAMILY_DIFFICULTY } from '../domain/types';
import type { AnomalyFamily } from '../domain/types';
import { ANOMALY_RATIO_PLACEHOLDER } from './problems-hard.constants';

interface Row {
  id: string;
  company: string;
  fiscalYear: number;
  tier: number;
  kind: string | null;
  /** 正常の行の要素 (G・X・D・N・C・P・E)。異変の行は空。 */
  elements: string[];
}

/** 設計表の行を読む。「| hard-001 | c04 名前 | 2026 | 1 | H-22 名前 | notes | ... |」 */
function designRows(): Row[] {
  const md = readFileSync(new URL('../../docs/plans/problems-hard.md', import.meta.url), 'utf-8');
  const rows: Row[] = [];
  for (const m of md.matchAll(/^\| (hard-\d{3}) \| (c\d\d) [^|]*\| (\d{4}) \| ([123]) \| ([^|]+?) \| [^|]+ \| ([^|]+?) \|$/gm)) {
    const kind = /^[EH]-\d\d/.exec(m[5] as string)?.[0] ?? null;
    const last = (m[6] as string).trim();
    const elements = kind === null && last !== '0 個' ? last.split('・') : [];
    rows.push({ id: m[1] as string, company: m[2] as string, fiscalYear: Number(m[3]), tier: Number(m[4]), kind, elements });
  }
  return rows;
}

const rows = designRows();
const anomalies = rows.filter((r) => r.kind !== null);
const normals = rows.filter((r) => r.kind === null);
const kindOf = (id: string) => kinds.find((k) => k.id === id);

describe('むずかしいの設計表 (problems-hard.md)', () => {
  it('P1: 32 問で、問題 ID は hard-001〜hard-032 の連番 (25 問以上)', () => {
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 32 }, (_, i) => `hard-${String(i + 1).padStart(3, '0')}`));
    expect(rows.length).toBeGreaterThanOrEqual(25);
  });

  it('P2: 異変あり 16・なし 16。比 0.5 × 問題数の ±3 の内側 (design.md §4.3)', () => {
    expect(anomalies.length).toBe(16);
    expect(normals.length).toBe(16);
    expect(Math.abs(anomalies.length - ANOMALY_RATIO_PLACEHOLDER * rows.length)).toBeLessThanOrEqual(3);
  });

  it('P3: 段は 14 : 12 : 6 で、11 : 9 : 5 を 32 問に換算した値 (14.08 : 11.52 : 6.4) との差が ±1 以内', () => {
    const count = (t: number) => rows.filter((r) => r.tier === t).length;
    expect([count(1), count(2), count(3)]).toEqual([14, 12, 6]);
    [11, 9, 5].forEach((base, i) => expect(Math.abs(count(i + 1) - (base / 25) * rows.length)).toBeLessThanOrEqual(1));
  });

  it('P4: どの段にも、異変あり・なしの両方が同数ずつある', () => {
    for (const t of [1, 2, 3]) {
      const a = anomalies.filter((r) => r.tier === t).length;
      const n = normals.filter((r) => r.tier === t).length;
      expect(a).toBeGreaterThan(0);
      expect(a).toBe(n);
    }
  });

  it('P5: 異変の種類は anomaly-kinds.json にあり、むずかしいの系統。同じ種類は 2 度出ない', () => {
    const ids = anomalies.map((r) => r.kind as string);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      const k = kindOf(id);
      expect(k, id).toBeDefined();
      expect(FAMILY_DIFFICULTY[(k as { family: AnomalyFamily }).family]).toBe('hard');
    });
  });

  it('P6: 会計 + 資料間の異変が 6 割以上 (受け入れ条件 6、design.md §4.5)', () => {
    const main = anomalies.filter((r) => ['accounting', 'cross-document'].includes((kindOf(r.kind as string) as { family: string }).family));
    expect(main.length / anomalies.length).toBeGreaterThanOrEqual(0.6);
  });

  it('P7: 会社は 10 社すべて。異変あり・なしの両方を持つ会社が 8 社以上 (design.md §4.3)', () => {
    expect(new Set(rows.map((r) => r.company))).toEqual(new Set(companies.map((c) => c.id)));
    const both = companies.filter((c) => anomalies.some((r) => r.company === c.id) && normals.some((r) => r.company === c.id));
    expect(both.length).toBeGreaterThanOrEqual(8);
  });

  it('P8: 同じ会社・同じ期の問題は無い。期はすべて 2019〜2022 年で、会社ごとに連続し、最後の期は 2022 年 (発表日が公開より前。やさしいの 2023〜2025 年と重ならない)', () => {
    const keys = rows.map((r) => `${r.company}:${r.fiscalYear}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of companies) {
      const years = rows.filter((r) => r.company === c.id).map((r) => r.fiscalYear).sort();
      expect(years.at(-1), c.id).toBe(2022);
      years.forEach((y, i) => expect(y, c.id).toBe(2022 - (years.length - 1 - i)));
      expect(years[0], c.id).toBeGreaterThanOrEqual(2019);
    }
  });

  it('P10: 正常な問題の段は、疑わしく見える要素の数で決まる (0 個 = 段 1、1〜2 個 = 段 2、3 個以上 = 段 3)。常に無配の c04・c07 は D を使わず、N は 1 問だけ (最後の期)', () => {
    normals.forEach((r) => {
      expect(r.tier, r.id).toBe(r.elements.length === 0 ? 1 : r.elements.length <= 2 ? 2 : 3);
      r.elements.forEach((e) => expect('GXDNCPE'.includes(e), `${r.id} ${e}`).toBe(true));
      if (r.company === 'c04' || r.company === 'c07') expect(r.elements, r.id).not.toContain('D');
    });
    const withN = normals.filter((r) => r.elements.includes('N'));
    withN.forEach((r) => expect(r.fiscalYear).toBe(2022));
  });

  it('P9: 種類と会社の適合 (anomalies.md §5 の「適する会社」): H-17 は億円の会社、H-19 は 3 セグメントの会社、H-21 は配当のある会社、H-05 は売上債権が目立つ会社、H-06 は棚卸資産のある会社', () => {
    const company = (id: string) => companies.find((c) => c.id === id) as (typeof companies)[number];
    const of = (kind: string) => anomalies.filter((r) => r.kind === kind).map((r) => company(r.company));
    of('H-17').forEach((c) => expect(c.irUnit).toBe('億円'));
    of('H-19').forEach((c) => expect(c.segmentNames.length).toBe(3));
    of('H-21').forEach((c) => expect(['c01', 'c02', 'c03', 'c05', 'c06', 'c08', 'c09', 'c10']).toContain(c.id));
    of('H-05').forEach((c) => expect(['c01', 'c02', 'c04', 'c05', 'c06', 'c07', 'c10']).toContain(c.id));
    of('H-06').forEach((c) => expect(['c01', 'c02', 'c03', 'c05', 'c06', 'c10']).toContain(c.id));
  });
});
