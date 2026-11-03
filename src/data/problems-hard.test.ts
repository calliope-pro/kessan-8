// むずかしい 32 問の設計表 (docs/plans/problems-hard.md §4) が、条件 (§2) を満たすことの確かめ (Sub-task #73)。
// 問題の JSON が着いたあとの確かめ (表との一致) は、同じファイルの下の describe に足す (#76)。
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import companies from './companies.json';
import kinds from './anomaly-kinds.json';
import { FAMILY_DIFFICULTY } from '../domain/types';
import type { AnomalyFamily } from '../domain/types';
import { ANOMALY_RATIO } from '../domain/config';
import { checkAnomaly, verifyDataset, verifyProblem } from '../verifier/index';
import type { AnomalyKind, Company, Problem } from '../domain/types';

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
    expect(Math.abs(anomalies.length - ANOMALY_RATIO * rows.length)).toBeLessThanOrEqual(3);
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

  it('P11: 異変の段は、実際に見える症状で付ける (包括レビュー B4): 貸借の合計が食い違うもの (H-01・H-02・H-09) と CF の期末残高が現金と食い違うもの (H-03・H-05・H-06) は段 1〜2 まで、注記・見通しを読まないと分からないもの (H-16・H-23・H-24) は段 3', () => {
    const tierOf = (kind: string) => (anomalies.find((r) => r.kind === kind) as Row).tier;
    expect(['H-22', 'H-28', 'H-19', 'H-01', 'H-13', 'H-17', 'H-21'].map(tierOf)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(['H-03', 'H-15', 'H-05', 'H-02', 'H-09', 'H-06'].map(tierOf)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(['H-16', 'H-23', 'H-24'].map(tierOf)).toEqual([3, 3, 3]);
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

// ── 問題の JSON (src/data/problems/hard/) ──────────────────────────────────────────
const dataUrl = (id: string) => new URL(`./problems/hard/${id}.json`, import.meta.url);
const load = (id: string): Problem => JSON.parse(readFileSync(dataUrl(id), 'utf-8')) as Problem;
const companyOf = (id: string): Company => companies.find((c) => c.id === id) as unknown as Company;

/** 正常な問題が持つ「正しいが疑わしく見える要素」を、データから数える (設計表 §3.2 の閾値)。 */
function elementsOf(p: Problem): string[] {
  const s = p.tanshin.summary;
  const pl = p.tanshin.incomeStatement.current;
  const cf = p.tanshin.cashFlow;
  const out: string[] = [];
  if ((['netSales', 'operatingIncome', 'ordinaryIncome', 'netIncomeParent'] as const).some((k) => Math.abs(s[k].changeRate) >= 15)) out.push('G');
  if (Math.abs(pl.extraordinaryGain - pl.extraordinaryLoss) >= 0.05 * pl.ordinaryIncome) out.push('X');
  if (s.annualDividend < s.annualDividendPrevious) out.push('D');
  if (p.tanshin.notes.segments.current.segments.some((x) => x.profit < 0)) out.push('N');
  if (-cf.capex >= 1.5 * cf.depreciation) out.push('C');
  if (s.accountingPolicyChange) out.push('P');
  if (p.ir.outlook.subsequentEvent !== null) out.push('E');
  return out;
}

describe('正常な問題の JSON (Sub-task #74)', () => {
  const normalRows = rows.filter((r) => r.kind === null);

  it('J1: 設計表の正常な 16 問が、src/data/problems/hard/ にある', () => {
    expect(normalRows.length).toBe(16);
    normalRows.forEach((r) => expect(existsSync(dataUrl(r.id)), r.id).toBe(true));
  });

  it('J2: id = ファイル名、difficulty = hard、会社・期・段が設計表と同じ。異変は null で、見た目の差し替えは無い', () => {
    normalRows.forEach((r) => {
      const p = load(r.id);
      expect([p.id, p.difficulty, p.companyId, p.fiscalYear, p.tier]).toEqual([r.id, 'hard', r.company, r.fiscalYear, r.tier]);
      expect(p.anomaly).toBeNull();
      expect(p.labelOverrides).toBeUndefined();
      expect(p.unitOverrides).toBeUndefined();
      expect(p.signOverrides).toBeUndefined();
    });
  });

  it('J3: 検証器の必須の規則 (hard) も参考の規則 (soft) も、違反が 0 件', () => {
    normalRows.forEach((r) => {
      const result = verifyProblem(load(r.id), companyOf(r.company));
      expect(result.hard.map((v) => `${v.rule}: ${v.message}`), r.id).toEqual([]);
      expect(result.soft.map((v) => `${v.rule}: ${v.message}`), r.id).toEqual([]);
    });
  });

  it('J4: 疑わしく見える要素をデータから数えると、設計表の要素と同じ (段 = 要素の数)', () => {
    normalRows.forEach((r) => expect(elementsOf(load(r.id)).sort(), r.id).toEqual([...r.elements].sort()));
  });

  it('J5: 同じ会社で期が続く 2 つの正常な問題は、前の期の当期 = 次の期の前期 (貸借・損益・配当)', () => {
    let pairs = 0;
    for (const c of companies) {
      const mine = normalRows.filter((r) => r.company === c.id).sort((a, b) => a.fiscalYear - b.fiscalYear);
      mine.slice(1).forEach((r, i) => {
        const before = mine[i] as Row;
        if (before.fiscalYear + 1 !== r.fiscalYear) return;
        const a = load(before.id);
        const b = load(r.id);
        expect(b.tanshin.balanceSheet.previous, r.id).toEqual(a.tanshin.balanceSheet.current);
        expect(b.tanshin.incomeStatement.previous, r.id).toEqual(a.tanshin.incomeStatement.current);
        expect(b.tanshin.summary.annualDividendPrevious, r.id).toBe(a.tanshin.summary.annualDividend);
        pairs++;
      });
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('J7: 億円の会社 (c03・c05・c06・c08・c10) の比率に使う金額 (売上高・売上総利益・営業利益・セグメントの売上高と利益。前期と当期) は 10 百万円の倍数 (IR の 0.1 億円の丸めで比率がずれないため。技術責任者の決定)', () => {
    normalRows.filter((r) => companyOf(r.company).irUnit === '億円').forEach((r) => {
      const t = load(r.id).tanshin;
      const amounts: number[] = [];
      for (const k of ['previous', 'current'] as const) {
        const pl = t.incomeStatement[k];
        amounts.push(pl.netSales, pl.grossProfit, pl.operatingIncome);
        t.notes.segments[k].segments.forEach((x) => amounts.push(x.netSales, x.profit));
        amounts.push(t.notes.segments[k].adjustment);
      }
      amounts.forEach((v) => expect(Math.abs(v) % 10, `${r.id} ${v}`).toBe(0));
    });
  });

  it('J8: 決算発表日と株主総会の日は平日で、公開 (2026-11) より前 (日曜の決算発表などで、正常な問題が異変に見えない)', () => {
    rows.forEach((r) => {
      if (!existsSync(dataUrl(r.id))) return;
      const d = load(r.id).tanshin.dates;
      [d.disclosure, d.shareholdersMeeting].forEach((iso) => {
        const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
        expect([0, 6].includes(day), `${r.id} ${iso}`).toBe(false);
        expect(iso < '2026-11-01', `${r.id} ${iso}`).toBe(true);
      });
    });
  });

  it('J9: I1 の文が「増益」と言うとき、I1 に出る利益 (営業・経常・親会社株主に帰属する当期純利益) の前期比が負でないか、文が最終減益に触れ claims に netIncomeParent の down がある (包括レビュー B2。同じ画面の数字と矛盾して読めない)', () => {
    rows.forEach((r) => {
      if (!existsSync(dataUrl(r.id))) return;
      const p = load(r.id);
      const h = p.ir.highlights;
      const first = p.ir.statements[0] as Problem['ir']['statements'][number];
      if (p.anomaly !== null) return;
      const rates = [h.operatingIncome.changeRate, h.ordinaryIncome.changeRate, h.netIncomeParent.changeRate];
      const mixed = rates.some((x) => x < 0) && rates.some((x) => x >= 0);
      if (!mixed && first.text.includes('増益')) expect(rates.every((x) => x >= 0), `${r.id} ${first.text}`).toBe(true);
      if (mixed) {
        expect(first.text, r.id).toContain('親会社株主に帰属する当期純利益');
        expect(first.claims, r.id).toContainEqual({ metric: 'netIncomeParent', direction: 'down' });
      }
    });
  });

  it('J10: 段 1 の正常な問題 (疑わしい要素 0) では、セグメントの売上高が前期比 ±15% を越えて振れない (包括レビュー N2)', () => {
    normalRows.filter((r) => r.tier === 1).forEach((r) => {
      const seg = load(r.id).ir.segments.items;
      seg.forEach((it) => expect(Math.abs(it.netSales.changeRate), `${r.id} ${it.name}`).toBeLessThanOrEqual(15));
    });
  });

  it('J11: 後発事象の文の 1,000 以上の金額は、桁区切りのコンマで書く (包括レビュー N3。ほかの文言と表記をそろえる)', () => {
    rows.forEach((r) => {
      if (!existsSync(dataUrl(r.id))) return;
      const p = load(r.id);
      const texts = [p.tanshin.notes.subsequentEvents, p.ir.outlook.subsequentEvent ?? '', p.anomaly?.explanation ?? ''];
      texts.forEach((t) => expect(t, r.id).not.toMatch(/(?<![\d,.])\d{4,}(?![\d,])/));
    });
  });

  it('J12: IR の文に、数字と矛盾して読める語 (おかげさまで・加速・拡大・好調・堅調・順調) を使わない (#25 の包括レビュー N1・N2 から)', () => {
    rows.forEach((r) => {
      if (!existsSync(dataUrl(r.id))) return;
      load(r.id).ir.statements.forEach((st) => expect(st.text, r.id).not.toMatch(/おかげさまで|加速|拡大|好調|堅調|順調/));
    });
  });

  it('J6: 億円の会社の IR は、短信の百万円 ÷ 100 を小数第一位に四捨五入した値 (IR の売上高)', () => {
    normalRows.forEach((r) => {
      const p = load(r.id);
      const unit = companyOf(r.company).irUnit;
      expect(p.ir.header.unit, r.id).toBe(unit);
      const s = p.tanshin.incomeStatement.current.netSales;
      expect(p.ir.highlights.netSales.amount, r.id).toBe(unit === '億円' ? Math.round(s / 10) / 10 : s);
    });
  });
});

// ── 異変の問題 (Sub-task #75・#76) ─────────────────────────────────────────────────
describe('異変の問題の JSON (Sub-task #75)', () => {
  const kindList = kinds as unknown as AnomalyKind[];
  const anomalyRows = rows.filter((r) => r.kind !== null);
  /** 数字を使う文言の種類 (答え合わせの文言に数字を含める。Anomaly.explanation の約束)。 */
  const NUMERIC_KINDS = ['H-01', 'H-02', 'H-03', 'H-05', 'H-06', 'H-09', 'H-13', 'H-15', 'H-16', 'H-17', 'H-19', 'H-21', 'H-24'];

  it('K1: 設計表の異変の 16 問が src/data/problems/hard/ にあり、id・難易度・会社・期・段・種類が設計表と同じ', () => {
    expect(anomalyRows.length).toBe(16);
    anomalyRows.forEach((r) => {
      expect(existsSync(dataUrl(r.id)), r.id).toBe(true);
      const p = load(r.id);
      expect([p.id, p.difficulty, p.companyId, p.fiscalYear, p.tier]).toEqual([r.id, 'hard', r.company, r.fiscalYear, r.tier]);
      expect(p.anomaly?.kind, r.id).toBe(r.kind);
    });
  });

  it('K2: 異変は指定したところだけが破れている: 期待集合 = 実際に落ちた規則、主な規則を含む、許容集合に収まる、場所は実在し違反と対応する (検証器の checkAnomaly)', () => {
    anomalyRows.forEach((r) => {
      const p = load(r.id);
      const result = verifyProblem(p, companyOf(r.company));
      expect(checkAnomaly(p, kindList, result), r.id).toEqual([]);
      expect(result.hard.length, r.id).toBeGreaterThan(0);
    });
  });

  it('K3: 答え合わせの文言がある。数字を使う種類では、数字を含む。場所は 1 件以上', () => {
    anomalyRows.forEach((r) => {
      const a = load(r.id).anomaly as NonNullable<Problem['anomaly']>;
      expect(a.explanation.trim().length, r.id).toBeGreaterThanOrEqual(30);
      if (NUMERIC_KINDS.includes(r.kind as string)) expect(a.explanation, r.id).toMatch(/[0-9]/);
      expect(a.places.length, r.id).toBeGreaterThan(0);
    });
  });

  it('K4: 見た目の差し替えは H-28 の項目名だけ (単位・負の記号の差し替えは無い)', () => {
    anomalyRows.forEach((r) => {
      const p = load(r.id);
      expect(p.unitOverrides, r.id).toBeUndefined();
      expect(p.signOverrides, r.id).toBeUndefined();
      if (r.kind === 'H-28') expect(p.labelOverrides).toEqual({ 'tanshin.balanceSheet.receivables': '買掛金' });
      else expect(p.labelOverrides, r.id).toBeUndefined();
    });
  });

  it('K5: 文章の異変 H-21 は、短信の別の画面を見ないと動きが分からない指標 (配当・営業 CF・有利子負債) の主張で、文は I1 (highlights) にある', () => {
    const r = anomalyRows.find((x) => x.kind === 'H-21') as Row;
    const p = load(r.id);
    const added = p.ir.statements.at(-1) as Problem['ir']['statements'][number];
    expect(added.slide).toBe('highlights');
    added.claims.forEach((c) => expect(['dividend', 'operatingCashFlow', 'interestBearingDebt']).toContain(c.metric));
  });

  it('K7: 文言が「数字の並びが入れ替わっています」と言うとき、IR の値と短信の値の数字は並べ替えの関係にある。「1 割ほど大きい」と言うとき、比は 1.05〜1.15 (文言が事実と合う)', () => {
    const digits = (v: number) => [...String(Math.round(v * 10))].sort().join('');
    const pairs: Record<string, (p: Problem, unit: string) => [number, number]> = {
      'H-13': (p, unit) => [p.ir.highlights.netSales.amount, unit === '億円' ? Math.round(p.tanshin.incomeStatement.current.netSales / 10) / 10 : p.tanshin.incomeStatement.current.netSales],
      'H-15': (p, unit) => {
        const t = p.tanshin.notes.segments.current.segments[1]?.profit as number;
        return [p.ir.segments.items[1]?.profit.current as number, unit === '億円' ? Math.round(t / 10) / 10 : t];
      },
    };
    for (const kind of Object.keys(pairs)) {
      const r = anomalyRows.find((x) => x.kind === kind) as Row;
      const p = load(r.id);
      const [ir, tanshin] = (pairs[kind] as (p: Problem, u: string) => [number, number])(p, companyOf(r.company).irUnit);
      const text = (p.anomaly as NonNullable<Problem['anomaly']>).explanation;
      expect(ir, r.id).not.toBe(tanshin);
      if (text.includes('入れ替わ')) expect(digits(ir), r.id).toBe(digits(tanshin));
      if (text.includes('1 割ほど大きい')) expect(ir / tanshin, r.id).toBeGreaterThan(1.05);
      expect(text.includes('入れ替わ') || text.includes('1 割ほど大きい'), r.id).toBe(true);
    }
  });

  it('K8: H-03 の文言は、画面にある行名 (税金等調整前当期純利益) で述べる (行名の差し替えは無い)', () => {
    const r = anomalyRows.find((x) => x.kind === 'H-03') as Row;
    const p = load(r.id);
    expect(p.labelOverrides).toBeUndefined();
    expect(p.anomaly?.explanation).toContain('税金等調整前当期純利益');
    expect(p.tanshin.cashFlow.incomeBeforeTax).toBe(p.tanshin.incomeStatement.current.netIncome);
  });

  it('K9: H-15 では、I3 の前期比を書き換えた金額から計算し直す (anomalies.md H-15。I3 の中だけで検算しても気づけない)', () => {
    const r = anomalyRows.find((x) => x.kind === 'H-15') as Row;
    const it = load(r.id).ir.segments.items[1] as Problem['ir']['segments']['items'][number];
    const cur = Math.round(it.profit.current * 10);
    const prev = Math.round(it.profit.previous * 10);
    expect(it.profit.changeRate).toBe(Math.round(((cur - prev) * 1000) / prev) / 10);
  });

  it('K10: 答え合わせの文言は、遊び手が先に気づく合計のずれにも触れる: CF の種類 (H-03・H-05・H-06) は期末残高と貸借の現金、貸借の種類 (H-02・H-09) は資産合計と負債純資産合計、H-19 は調整額 (包括レビュー N1)', () => {
    const num = (v: number) => v.toLocaleString('ja-JP');
    for (const kind of ['H-03', 'H-05', 'H-06']) {
      const p = load((anomalyRows.find((x) => x.kind === kind) as Row).id);
      const text = p.anomaly?.explanation ?? '';
      expect(text, kind).toContain('期末残高');
      expect(text, kind).toContain(num(p.tanshin.cashFlow.cashEnding));
      expect(text, kind).toContain(num(p.tanshin.balanceSheet.current.cash));
    }
    for (const kind of ['H-02', 'H-09']) {
      const p = load((anomalyRows.find((x) => x.kind === kind) as Row).id);
      const b = p.tanshin.balanceSheet.current;
      const text = p.anomaly?.explanation ?? '';
      expect(text, kind).toContain(`資産合計 ${num(b.totalAssets)}`);
      expect(text, kind).toContain(`負債純資産合計 ${num(b.totalLiabilitiesAndNetAssets)}`);
    }
    const p19 = load((anomalyRows.find((x) => x.kind === 'H-19') as Row).id);
    expect(p19.anomaly?.explanation).toContain('調整額');
  });

  it('K6: 異変の系統は、会計 + 資料間が 6 割以上 (13/16)。注記は 3 つ。系統と難易度が合う', () => {
    const fam = anomalyRows.map((r) => kindList.find((k) => k.id === r.kind)?.family);
    expect(fam.filter((f) => f === 'accounting' || f === 'cross-document').length / fam.length).toBeGreaterThanOrEqual(0.6);
    expect(fam.filter((f) => f === 'notes').length).toBe(3);
  });
});

describe('むずかしいの問題の全体 (Sub-task #76)', () => {
  const inputs = () =>
    rows.map((r) => ({ file: `src/data/problems/hard/${r.id}.json`, value: JSON.parse(readFileSync(dataUrl(r.id), 'utf-8')) as unknown }));

  it('A1: 32 問をデータ全件の検証 (verifyDataset) に通すと、致命が 0 件。むずかしいの数の不足 (問題数・両面の会社・異変の比・系統の偏り) も 0 件', () => {
    const result = verifyDataset({ companies: companies as unknown[], kinds: kinds as unknown[], problems: inputs() });
    expect(result.errors.map((e) => `${e.code} ${e.message}`)).toEqual([]);
    expect(result.shortfalls.filter((s) => s.message.startsWith('hard:')).map((s) => s.message)).toEqual([]);
    expect(result.soft.map((s) => `${s.code} ${s.message}`)).toEqual([]);
    expect(result.stats.hard).toEqual({ total: 32, anomaly: 16, normal: 16 });
  });

  it('A2: 段の数が 11 : 9 : 5 の ±1 を 32 問に換算した値 (14 : 12 : 6) になっている (JSON の tier)', () => {
    const tiers = rows.map((r) => (JSON.parse(readFileSync(dataUrl(r.id), 'utf-8')) as Problem).tier);
    expect([1, 2, 3].map((t) => tiers.filter((x) => x === t).length)).toEqual([14, 12, 6]);
  });
});
