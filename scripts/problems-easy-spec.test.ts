// やさしいの設計表 v3 (Sub-task #167。docs/plans/problems-easy-v3.md) を、検証器のデータ検査の数・設計 v3 の条件で数え直す (SP1〜SP12)。
// 設計表の元データ docs/plans/problems-easy/spec-v3.json を読む。数の出所は src/domain/config.ts (検証器の定数)・設計 docs/design-v3.md §1.5・§2.2・§3.2 #139。
// このテストは設計表そのもの (成果物) を確かめる。問題データ (src/data) を確かめるのは #168 の生成のテストと verify:data。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_POOL_SIZE, CLAIM_DOWN_MIN_COMPANIES, KIND_MIN_COMPANIES, KIND_PROBLEMS, TIER_BALANCE_MAX_GAP } from '../src/domain/config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const SPEC = `${root}docs/plans/problems-easy/spec-v3.json`;
const MAKE = `${root}docs/plans/problems-easy/make-spec-v3.py`;
const DOC = `${root}docs/plans/problems-easy-v3.md`;

interface Edit {
  op: string;
  [key: string]: unknown;
}
interface Entry {
  id: string;
  company: string;
  fiscalYear: number;
  month: number;
  kind: string | null;
  tier: 1 | 2 | 3 | null;
  op?: 'up' | 'down';
  omTarget?: number;
  salesRange?: [number, number];
  opRange?: [number, number];
  omRange?: [number, number];
  base?: string;
  edit?: Edit;
}
const spec = JSON.parse(readFileSync(SPEC, 'utf-8')) as { version: number; sample: { company: string; fiscalYear: number }; problems: Entry[] };
const normals = spec.problems.filter((p) => p.kind === null);
const anomalies = spec.problems.filter((p) => p.kind !== null);
const companies = (JSON.parse(readFileSync(`${root}src/data/companies.json`, 'utf-8')) as { id: string }[]).map((c) => c.id);

/** 台帳 v3 のやさしい 15 種類と段 (設計 §2.2 の表)。 */
const TIERS: Record<string, 1 | 2 | 3> = {
  'E-17': 1, 'E-02': 1, 'E-24': 1, 'E-03': 1, 'E-05': 1, 'E-22': 1, 'E-21': 1, 'E-25': 1, 'E-26': 1, 'E-27': 1,
  'E-19': 2, 'E-23': 2, 'E-28': 2,
  'E-12': 3, 'E-04': 3,
};
const count = <T>(xs: T[], key: (x: T) => string): Map<string, number> => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>());

describe('やさしいの設計表 v3 (spec-v3.json)', () => {
  it('SP1: 問題の数 = CARD_POOL_SIZE.easy (85)。正常 10・異変 75。ID は easy-001 から欠けなく並ぶ', () => {
    expect(spec.problems).toHaveLength(CARD_POOL_SIZE.easy);
    expect(normals).toHaveLength(10);
    expect(anomalies).toHaveLength(75);
    expect(spec.problems.map((p) => p.id)).toEqual(Array.from({ length: 85 }, (_, i) => `easy-${String(i + 1).padStart(3, '0')}`));
  });

  it('SP2: 種類は台帳 v3 のやさしい 15 種類のちょうど全部。段は台帳のとおり', () => {
    const kinds = new Set(anomalies.map((p) => p.kind));
    expect([...kinds].sort()).toEqual(Object.keys(TIERS).sort());
    for (const p of anomalies) expect(p.tier, p.id).toBe(TIERS[p.kind as string]);
    // anomaly-kinds.json の台帳 v3 の印のあるやさしい種類と同じ集合 (検証器の card-kind-count が数える種類)
    const data = JSON.parse(readFileSync(`${root}src/data/anomaly-kinds.json`, 'utf-8')) as { id: string; family: string; ledger?: string }[];
    const easyLedger = data.filter((k) => k.ledger === 'v3' && ['appearance', 'calculation', 'text'].includes(k.family)).map((k) => k.id);
    expect(easyLedger.sort()).toEqual(Object.keys(TIERS).sort());
  });

  it('SP3: 種類ごとに KIND_PROBLEMS.default (5) 問・5 社 (KIND_MIN_COMPANIES) 以上 (同じ会社に同じ種類は 1 問)', () => {
    for (const [kind] of Object.entries(TIERS)) {
      const mine = anomalies.filter((p) => p.kind === kind);
      expect(mine, kind).toHaveLength(KIND_PROBLEMS.default);
      const cs = new Set(mine.map((p) => p.company));
      expect(cs.size, kind).toBeGreaterThanOrEqual(KIND_MIN_COMPANIES);
      expect(cs.size, kind).toBe(mine.length);
    }
  });

  it('SP4: 段ごとに、会社どうしの異変の問題の数の差が TIER_BALANCE_MAX_GAP (1) 以内 (0 問の会社も数える)', () => {
    for (const tier of [1, 2, 3] as const) {
      const per = companies.map((c) => anomalies.filter((p) => p.company === c && p.tier === tier).length);
      expect(Math.max(...per) - Math.min(...per), `段 ${tier}: ${per.join(',')}`).toBeLessThanOrEqual(TIER_BALANCE_MAX_GAP);
    }
  });

  it('SP5: 10 社すべてが正常 1 問・異変の問題を 1 問以上持つ (会社から答えが漏れない。R-S5 (b))。1 社 1 期 (R-S5 (d)) で、異変の問題は同じ会社・同じ期の正常な問題が基', () => {
    expect(normals.map((p) => p.company).sort()).toEqual([...companies].sort());
    const pairs = new Set(spec.problems.map((p) => `${p.company}×${p.fiscalYear}`));
    expect(pairs.size).toBe(10);
    for (const c of companies) expect(anomalies.filter((p) => p.company === c).length, c).toBeGreaterThan(0);
    for (const p of anomalies) {
      const base = normals.find((n) => n.id === p.base);
      expect(base, p.id).toBeDefined();
      expect(base?.company, p.id).toBe(p.company);
      expect(base?.fiscalYear, p.id).toBe(p.fiscalYear);
    }
  });

  it('SP6: 正常な問題に tier が無い。減益 (op: down) の会社が CLAIM_DOWN_MIN_COMPANIES.operatingIncome (3) 社以上。見出し語は両方向', () => {
    for (const p of normals) expect(p.tier, p.id).toBeNull();
    const down = normals.filter((p) => p.op === 'down').length;
    expect(down).toBeGreaterThanOrEqual(CLAIM_DOWN_MIN_COMPANIES.operatingIncome);
    expect(normals.filter((p) => p.op === 'up').length).toBeGreaterThanOrEqual(CLAIM_DOWN_MIN_COMPANIES.operatingIncome);
  });

  it('SP7: E-02 は、増益の基なら営業利益率が取りうる最大 (omRange の上限 = profiles の目安 + gen.py のゆらぎ +0.6 ポイント) でも 8% 以下 (10 倍にした営業利益が売上高の 0.8 倍以下)、減益の基なら 1/10', () => {
    for (const p of anomalies.filter((a) => a.kind === 'E-02')) {
      const base = normals.find((n) => n.id === p.base);
      if (base?.op === 'up') {
        expect(p.edit?.factor, p.id).toBe(10);
        expect(base.omRange?.[1] as number, p.id).toBeLessThanOrEqual(0.08);
      } else expect(p.edit?.factor, p.id).toBe(0.1);
    }
  });

  it('SP8: 種類ごとの edit が、設計 §1.6・§2.2 の「当ててよい欄」の中にある', () => {
    // 営業利益の整数部が必ず 4 桁以上 (opRange の下限 ≥ 1,000)・売上高の整数部が必ず 5 桁以上 (salesRange の下限 ≥ 10,000)。範囲は spec-v3.json にある (make-spec-v3.py が profiles.py の係数から導く)
    const OP4 = new Set(normals.filter((n) => (n.opRange?.[0] ?? 0) >= 1000).map((n) => n.company));
    const SALES5 = new Set(normals.filter((n) => (n.salesRange?.[0] ?? 0) >= 10000).map((n) => n.company));
    for (const p of anomalies) {
      const e = p.edit as Edit;
      const base = normals.find((n) => n.id === p.base) as Entry;
      switch (p.kind) {
        case 'E-17': expect(e).toMatchObject({ op: 'claim', metric: 'operatingIncome', to: base.op === 'up' ? 'down' : 'up' }); break;
        case 'E-02': expect(e.op).toBe('scale'); break;
        case 'E-24': expect(e.op).toBe('scale-sales'); expect(e.ratio as number).toBeLessThanOrEqual(0.8); expect(e.ratio as number).toBeGreaterThan(0); break;
        case 'E-03': expect(['sales', 'opPrev', 'opCurr']).toContain(e.slot); expect(e.unit).toBe('億円'); break;
        case 'E-05': expect(['sales', 'op', 'margin']).toContain(e.target); expect(['売上高', '営業利益', '売上高営業利益率']).not.toContain(e.word); break;
        case 'E-19': expect(['sales', 'opPrev', 'opCurr', 'margin']).toContain(e.slot); break;
        case 'E-22': expect(['sales', 'opPrev', 'opCurr', 'margin', 'headline']).toContain(e.slot); break;
        case 'E-21':
          expect(['sales', 'opPrev', 'opCurr']).toContain(e.slot);
          expect(['no-comma', 'comma-shift']).toContain(e.style);
          if (e.style === 'comma-shift') { expect(e.slot).toBe('sales'); expect(SALES5.has(p.company), p.id).toBe(true); }
          if (e.slot !== 'sales') expect(OP4.has(p.company), p.id).toBe(true);
          break;
        case 'E-25': expect(e).toMatchObject({ op: 'sign', slot: 'sales' }); break;
        case 'E-26': expect(['opPrev', 'opCurr']).toContain(e.slot); expect(e.word).toBe(e.slot === 'opPrev' ? '当期' : '前期'); break;
        case 'E-27': expect(['sales', 'opPrev', 'opCurr']).toContain(e.slot); expect(['first', 'middle', 'last']).toContain(e.digit); break;
        case 'E-23': expect(e.word).toBe(base.op === 'up' ? '増収' : '減収'); break;
        case 'E-28': expect(e).toMatchObject({ op: 'day', slot: 'period', day: 32 }); break;
        case 'E-12': expect(e.op).toBe('scale-margin'); expect((e.factor as number) >= 2 || (e.factor as number) <= 0.5).toBe(true); break;
        case 'E-04': expect(Math.abs(e.years as number)).toBe(1); break;
        default: throw new Error(`知らない種類 ${String(p.kind)}`);
      }
    }
  });

  it('SP9: 閏日 — c03 は 2024 年 2 月期 (期末 2024-02-29)。E-04 は c03 で、年をずらしたその月の末日 (+1 年 = 2025-02-28) に当てる', () => {
    const base = normals.find((p) => p.company === 'c03') as Entry;
    expect([base.fiscalYear, base.month]).toEqual([2024, 2]);
    const e04 = anomalies.find((p) => p.kind === 'E-04' && p.company === 'c03');
    expect(e04?.edit?.years).toBe(1);
  });

  it('SP10: 見本は c09 の 2023 年。プールの (会社 × 期) と重ならない', () => {
    expect(spec.sample).toEqual({ company: 'c09', fiscalYear: 2023 });
    expect(spec.problems.some((p) => p.company === 'c09' && p.fiscalYear === 2023)).toBe(false);
  });

  it('SP11: 元データは make-spec-v3.py の出力と同じ (手で直していない)・同じ入力から同じ出力 (2 回回して比べる)', () => {
    const dir = mkdtempSync(`${tmpdir()}/spec-v3-`);
    try {
      execFileSync('python3', [MAKE, '--out', `${dir}/a.json`], { cwd: root });
      execFileSync('python3', [MAKE, '--out', `${dir}/b.json`], { cwd: root });
      const [a, b, committed] = [`${dir}/a.json`, `${dir}/b.json`, SPEC].map((f) => readFileSync(f, 'utf-8'));
      expect(a).toBe(b);
      expect(committed).toBe(a);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SP12: 設計表の §3 の一覧 (docs/plans/problems-easy-v3.md) は、spec-v3.json から作った表と同じ', () => {
    const doc = readFileSync(DOC, 'utf-8');
    const m = /<!-- spec-table:begin -->\n([\s\S]*?)\n<!-- spec-table:end -->/.exec(doc);
    expect(m).not.toBeNull();
    const table = execFileSync('python3', [MAKE, '--table'], { cwd: root, encoding: 'utf-8' }).trim();
    expect((m as RegExpExecArray)[1]).toBe(table);
  });

  it('SP14: 金額は 6 桁以内 (導いた上限): 売上高の最大 < 1,000,000。E-02 の増益の基は 10 倍にした営業利益の最大も < 1,000,000。営業利益は売上高より小さい', () => {
    for (const n of normals) {
      expect(n.salesRange?.[1] as number, n.id).toBeLessThan(1_000_000);
      expect((n.opRange?.[1] as number) * 10, n.id).toBeLessThan(1_000_000);
      expect(n.opRange?.[1] as number, n.id).toBeLessThan(n.salesRange?.[0] as number);
    }
  });

  it('SP13: 種類 × 会社の表 (種類 15 × 社 10) の数が合う。1 社が持つ異変の問題は 7 か 8 問 (段 1 が 5・段 2 が 1〜2・段 3 が 1)', () => {
    const perCompany = count(anomalies, (p) => p.company);
    for (const c of companies) expect([7, 8], c).toContain(perCompany.get(c));
    expect([...perCompany.values()].reduce((a, b) => a + b, 0)).toBe(75);
  });
});
