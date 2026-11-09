// むずかしい 132 問の設計表 (docs/plans/problems-hard.md §4) が、ケース表 docs/test-cases/problems-hard.md §1 (P1〜P17) を満たすことの確かめ (Sub-task #170)。
// 問題の JSON の確かめ (表との一致・検証器) は、#171 のテスト (problems-hard.test.ts) に足す。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import companies from './companies.json';
import kinds from './anomaly-kinds.json';
import { CLAIM_DOWN_MIN_COMPANIES, FAMILY_SHARE_MIN, KIND_MIN_COMPANIES, KIND_PROBLEMS, TIER_BALANCE_MAX_GAP } from '../domain/config';
import { FAMILY_DIFFICULTY } from '../domain/types';
import type { AnomalyFamily } from '../domain/types';

interface Row {
  line: string;
  id: string;
  company: string;
  fiscalYear: number;
  /** 異変の問題だけ。正常は null。 */
  tier: number | null;
  kind: string | null;
  last: string;
}

const doc = readFileSync(new URL('../../docs/plans/problems-hard.md', import.meta.url), 'utf-8');

/** 設計表の行を読む。「| hard-011 | c06 トラウネ建設 | 2022 | 1 | H-17 名前 | cross-document | 倍率=×10 |」。 */
function designRows(): Row[] {
  const rows: Row[] = [];
  for (const m of doc.matchAll(/^\| (hard-\d{3}) \| (c\d\d) [^|]*\| (\d{4}) \| ([123]|-) \| ([^|]+?) \| [^|]+ \| ([^|]+?) \|$/gm)) {
    rows.push({
      line: m[0],
      id: m[1] as string,
      company: m[2] as string,
      fiscalYear: Number(m[3]),
      tier: m[4] === '-' ? null : Number(m[4]),
      kind: /^[EH]-\d\d/.exec(m[5] as string)?.[0] ?? null,
      last: (m[6] as string).trim(),
    });
  }
  return rows;
}

const rows = designRows();
const anomalies = rows.filter((r) => r.kind !== null);
const normals = rows.filter((r) => r.kind === null);
const kindDef = (id: string) => kinds.find((k) => k.id === id) as { id: string; family: AnomalyFamily; ledger?: string };
const companyIds = companies.map((c) => c.id);
const kindIds = [...new Set(anomalies.map((r) => r.kind as string))];
const HEAVY: string[] = ['accounting', 'cross-document'];
const slotOf = (form: string) => /^欄=([A-Za-z]+)/.exec(form)?.[1];

/** 正常の「要素」の列を記号の配列に ('0 個' は空)。 */
const elementsOf = (r: Row) => (r.last === '0 個' ? [] : r.last.split('・'));

describe('むずかしいの設計表 v3 (problems-hard.md §4) — 数と構成', () => {
  it('P1: 132 問で、問題 ID は hard-001〜hard-132 の連番。正常 10・異変 122', () => {
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 132 }, (_, i) => `hard-${String(i + 1).padStart(3, '0')}`));
    expect(normals.length).toBe(10);
    expect(anomalies.length).toBe(122);
    expect(rows.length).toBeGreaterThanOrEqual(25);
  });

  it('P2: 各社に正常がちょうど 1 問。期は全問 2022 で、(会社, 期) は 10 通り・どの組にも正常と異変がある', () => {
    expect(normals.map((r) => r.company).sort()).toEqual([...companyIds].sort());
    expect(new Set(rows.map((r) => r.fiscalYear))).toEqual(new Set([2022]));
    const pairs = new Set(rows.map((r) => `${r.company}×${r.fiscalYear}`));
    expect(pairs.size).toBe(10);
    for (const pair of pairs) {
      const members = rows.filter((r) => `${r.company}×${r.fiscalYear}` === pair);
      expect(members.some((r) => r.kind === null), pair).toBe(true);
      expect(members.some((r) => r.kind !== null), pair).toBe(true);
    }
  });

  it('P3: 異変の種類は設計 v3 §2.3 の 20 種類ちょうど。anomaly-kinds.json の台帳 v3 のむずかしいの種類と同じ集合', () => {
    const expected = ['H-01', 'H-03', 'H-04', 'H-05', 'H-13', 'H-17', 'H-19', 'H-20', 'H-21', 'H-22', 'H-23', 'H-24', 'H-28', 'H-29', 'H-30', 'H-31', 'H-32', 'H-33', 'H-34', 'H-35'];
    expect([...kindIds].sort()).toEqual(expected);
    const ledgerHard = kinds.filter((k) => (k as { ledger?: string }).ledger === 'v3' && FAMILY_DIFFICULTY[k.family as AnomalyFamily] === 'hard').map((k) => k.id);
    expect([...ledgerHard].sort()).toEqual(expected);
  });

  it('P4: 種類ごとの問題の数は、会計・資料間の 11 種類 = 7 問、注記・表記の 9 種類 = 5 問 (合計 122)', () => {
    let total = 0;
    for (const id of kindIds) {
      const n = anomalies.filter((r) => r.kind === id).length;
      expect(n, id).toBe(HEAVY.includes(kindDef(id).family) ? KIND_PROBLEMS.heavy : KIND_PROBLEMS.default);
      total += n;
    }
    expect(kindIds.filter((id) => HEAVY.includes(kindDef(id).family)).length).toBe(11);
    expect(total).toBe(122);
  });

  it('P5: 同じ種類は、すべて別の会社 (7 問は 7 社・5 問は 5 社)。種類ごとに 5 社以上', () => {
    for (const id of kindIds) {
      const mine = anomalies.filter((r) => r.kind === id).map((r) => r.company);
      expect(new Set(mine).size, id).toBe(mine.length);
      expect(new Set(mine).size, id).toBeGreaterThanOrEqual(KIND_MIN_COMPANIES);
    }
  });
});

describe('むずかしいの設計表 v3 — 段・系統・出題の確実さ', () => {
  const TIER_OF: Record<string, number> = {
    'H-17': 1, 'H-22': 1, 'H-29': 1, 'H-30': 1, 'H-32': 1, 'H-33': 1, 'H-34': 1, 'H-35': 1,
    'H-13': 2, 'H-19': 2, 'H-21': 2, 'H-23': 2, 'H-24': 2, 'H-28': 2, 'H-31': 2,
    'H-01': 3, 'H-03': 3, 'H-04': 3, 'H-05': 3, 'H-20': 3,
  };

  it('P6: 段は種類で決まる (設計 v3 §2.3)。異変の段別の問題の数は 44・43・35。正常は段を持たない', () => {
    anomalies.forEach((r) => expect(r.tier, `${r.id} ${r.kind}`).toBe(TIER_OF[r.kind as string]));
    normals.forEach((r) => expect(r.tier, r.id).toBeNull());
    expect([1, 2, 3].map((t) => anomalies.filter((r) => r.tier === t).length)).toEqual([44, 43, 35]);
    expect([1, 2, 3].map((t) => new Set(anomalies.filter((r) => r.tier === t).map((r) => r.kind)).size)).toEqual([8, 7, 5]);
  });

  it('P7: tier-balance — 段ごとに、会社どうしが持つ異変の問題の数の差が 1 以内。会社ごとの異変の合計は 12 か 13', () => {
    for (const tier of [1, 2, 3]) {
      const counts = companyIds.map((c) => anomalies.filter((r) => r.company === c && r.tier === tier).length);
      expect(Math.max(...counts) - Math.min(...counts), `段 ${tier}: ${counts.join(',')}`).toBeLessThanOrEqual(TIER_BALANCE_MAX_GAP);
    }
    companyIds.forEach((c) => expect([12, 13], c).toContain(anomalies.filter((r) => r.company === c).length));
  });

  it('P8: 会計 + 資料間が異変の 6 割以上。種類数は 会計 5・資料間 6・注記 3・表記 (card-form) 6', () => {
    const heavy = anomalies.filter((r) => HEAVY.includes(kindDef(r.kind as string).family)).length;
    expect(heavy).toBe(77);
    expect(heavy / anomalies.length).toBeGreaterThanOrEqual(FAMILY_SHARE_MIN.hard);
    const count = (f: string) => kindIds.filter((id) => kindDef(id).family === f).length;
    expect([count('accounting'), count('cross-document'), count('notes'), count('card-form')]).toEqual([5, 6, 3, 6]);
  });

  it('P9: R-S5 (b)(d) — 全 10 社が、正常な問題と異変の問題の両方を持つ。正常 1・異変 12〜13', () => {
    companyIds.forEach((c) => {
      expect(normals.filter((r) => r.company === c).length, c).toBe(1);
      expect(anomalies.filter((r) => r.company === c).length, c).toBeGreaterThan(0);
    });
  });

  it('P10: R-S5 (f) — 正常に、営業利益が減る会社 (DN) が 3 社以上・営業 CF がマイナスの会社 (CN) が 1 社以上', () => {
    const has = (el: string) => normals.filter((r) => elementsOf(r).includes(el)).length;
    expect(has('DN')).toBeGreaterThanOrEqual(CLAIM_DOWN_MIN_COMPANIES.operatingIncome);
    expect(has('CN')).toBeGreaterThanOrEqual(CLAIM_DOWN_MIN_COMPANIES.operatingCashFlow);
  });

  it('P11: 正常の要素は決まった記号だけ。無配の c04・c07 は D を使わない。DN と G は同時に持たない', () => {
    expect(normals.length).toBe(10);
    normals.forEach((r) => {
      const els = elementsOf(r);
      els.forEach((e) => expect(['G', 'X', 'D', 'N', 'C', 'P', 'E', 'DN', 'CN'], `${r.id} ${e}`).toContain(e));
      expect(new Set(els).size, r.id).toBe(els.length);
      if (r.company === 'c04' || r.company === 'c07') expect(els, r.id).not.toContain('D');
      expect(els.includes('DN') && els.includes('G'), r.id).toBe(false);
    });
  });
});

describe('むずかしいの設計表 v3 — 形と、種類と会社の適合', () => {
  const FORM: Record<string, RegExp> = {
    'H-13': /^欄=(irSales|irCashCur)$/,
    'H-17': /^倍率=(×10|÷10)$/,
    'H-22': /^文言=[123]$/,
    'H-23': /^反転=(flag|note)$/,
    'H-28': /^科目名=(買掛金|短期借入金)$/,
    'H-35': /^社名=c\d\d$/,
    'H-05': /^作り方=(符号を逆に|20% ずらす)$/,
    'H-29': /^欄=[A-Za-z]+$/,
    'H-30': /^欄=[A-Za-z]+$/,
    'H-31': /^欄=[A-Za-z]+$/,
    'H-32': /^欄=[A-Za-z]+:(no-comma|comma-shift)$/,
    'H-33': /^欄=[A-Za-z]+$/,
    'H-34': /^欄=[A-Za-z]+$/,
  };

  it('P12: 形の書き方が、種類ごとの決まりに合う。決まりの無い種類は「定型」。正常の行は要素の列', () => {
    anomalies.forEach((r) => expect(r.last, `${r.id} ${r.kind}`).toMatch(FORM[r.kind as string] ?? /^定型$/));
    normals.forEach((r) => expect(r.last, r.id).not.toMatch(/=/));
  });

  it('P13: H-35 の社名は別の会社 (自分の会社の id でなく、実在する会社)', () => {
    expect(anomalies.filter((r) => r.kind === 'H-35').length).toBe(7);
    anomalies.filter((r) => r.kind === 'H-35').forEach((r) => {
      const other = /^社名=(c\d\d)$/.exec(r.last)?.[1] as string;
      expect(other, r.id).not.toBe(r.company);
      expect(companyIds, r.id).toContain(other);
    });
  });

  it('P14: H-34 の欄は対象 11 欄の内。対象外 (opPrev・opCurr・margin・pbt・cfStart・ocf・cfAr・irNetDebtPrev) は使わず、c04 に irDebtPrev を当てない', () => {
    const TARGET = ['sales', 'ta', 'tlna', 'cash', 'arPrev', 'arCurr', 'cfEnd', 'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev'];
    expect(anomalies.filter((r) => r.kind === 'H-34').length).toBe(5);
    anomalies.filter((r) => r.kind === 'H-34').forEach((r) => {
      expect(TARGET, r.id).toContain(slotOf(r.last));
      if (r.company === 'c04') expect(slotOf(r.last), r.id).not.toBe('irDebtPrev');
    });
  });

  it('P15: H-29 は金額の欄・H-32 は整数部 4 桁以上の金額の欄 (comma-shift は c09 以外の売上高だけ)・H-31/H-33 に表題 (frame) の欠落・重複は無い。H-31 に見出し語 (headline) の欠落は無い', () => {
    const MONEY = ['sales', 'opPrev', 'opCurr', 'pbt', 'cash', 'arPrev', 'arCurr', 'ta', 'tlna', 'cfStart', 'cfAr', 'ocf', 'cfEnd', 'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev'];
    for (const [kind, n] of [['H-29', 5], ['H-32', 5], ['H-31', 5], ['H-33', 5]] as const) expect(anomalies.filter((r) => r.kind === kind).length, kind).toBe(n);
    anomalies.filter((r) => r.kind === 'H-29').forEach((r) => expect(MONEY, r.id).toContain(slotOf(r.last)));
    anomalies.filter((r) => r.kind === 'H-32').forEach((r) => {
      const [slot, style] = (r.last.replace('欄=', '') as string).split(':');
      // 整数部が 4 桁以上になる欄 (c09 の受取債権などは 3 桁なので除く)
      expect(['sales', 'ta', 'tlna', 'cash'], r.id).toContain(slot);
      if (style === 'comma-shift') {
        expect(slot, r.id).toBe('sales');
        expect(r.company, r.id).not.toBe('c09');
      }
    });
    anomalies.filter((r) => r.kind === 'H-31' || r.kind === 'H-33').forEach((r) => expect(['frame', 'period'], r.id).not.toContain(slotOf(r.last)));
    anomalies.filter((r) => r.kind === 'H-31').forEach((r) => expect(slotOf(r.last), r.id).not.toBe('headline'));
  });

  it('P16: H-24 は、後発事象 (E) を持つ正常の会社に当てない', () => {
    const withE = normals.filter((r) => elementsOf(r).includes('E')).map((r) => r.company);
    expect(withE.length).toBeGreaterThan(0);
    expect(anomalies.filter((r) => r.kind === 'H-24').length).toBe(5);
    anomalies.filter((r) => r.kind === 'H-24').forEach((r) => expect(withE, r.id).not.toContain(r.company));
  });
});

describe('むずかしいの設計表 v3 — 文書の表と道具 (scripts/gen-hard/plan.ts) の一致', () => {
  it('P17: 文書の §4 の行 = renderRows(plan()) の行 (表を変えるときは plan.ts を直して貼り直す)', async () => {
    const { plan, renderRows } = await import('../../scripts/gen-hard/plan.ts');
    const names = {
      company: (id: string) => (companies.find((c) => c.id === id)?.name ?? '').replace('株式会社', ''),
      kind: (id: string) => ({ name: kinds.find((k) => k.id === id)?.name ?? '', family: kinds.find((k) => k.id === id)?.family ?? '' }),
    };
    expect(rows.map((r) => r.line)).toEqual(renderRows(plan(), names));
  });
});
