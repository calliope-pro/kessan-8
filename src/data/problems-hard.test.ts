// むずかしいの問題データ 132 問 (src/data/problems/hard/) が、ケース表 docs/test-cases/problems-hard.md §2 (J1〜J10・K1〜K6・A1〜A4) を満たすことの確かめ (Sub-task #171)。
// 設計表そのものの約束は problems-hard-table.test.ts (#170)。中身の本物の確かめは検証器 (verifyDataset)。ここは、検証器が見ない約束と、設計表と JSON の対応。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import companies from './companies.json';
import kinds from './anomaly-kinds.json';
import sample from './samples/sample.json';
import { LABELS } from '../domain/labels';
import type { AnomalyKind, Company, Problem } from '../domain/types';
import { changedCells } from '../verifier/path';
import { verifyDataset, verifyProblem } from '../verifier/index';
import { anomalyIssues } from '../verifier/anomaly';
import { plan } from '../../scripts/gen-hard/plan';
import type { PlanRow } from '../../scripts/gen-hard/plan';

const dir = new URL('./problems/hard/', import.meta.url);
const file = (id: string) => new URL(`${id}.json`, dir);
const rows = plan();
const load = (id: string): Problem => JSON.parse(readFileSync(file(id), 'utf-8')) as Problem;
const have = (id: string) => existsSync(file(id));
const all = () => rows.filter((r) => have(r.id)).map((r) => ({ row: r, p: load(r.id) }));
const companyOf = (id: string) => companies.find((c) => c.id === id) as unknown as Company;
const kindList = kinds as unknown as AnomalyKind[];
const normals = rows.filter((r) => r.kind === null);
const anomalyRows = rows.filter((r) => r.kind !== null);
const baseOf = (r: PlanRow): Problem => load((normals.find((n) => n.company === r.company) as PlanRow).id);

/** 四捨五入 (0 から遠い方へ)。 */
const roundHalfAway = (x: number) => Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
const round1 = (x: number) => roundHalfAway(x * 10) / 10;

describe('J: 正常な 10 問', () => {
  const normalProblems = () => normals.filter((r) => have(r.id)).map((r) => ({ row: r, p: load(r.id) }));

  it('J1: 132 ファイルが hard-001〜132 の連番で置き場にそれだけある。id・difficulty・会社・期・段が設計表と同じ。正常は tier を持たない', () => {
    const names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    expect(names).toEqual(Array.from({ length: 132 }, (_, i) => `hard-${String(i + 1).padStart(3, '0')}.json`));
    for (const { row, p } of all()) {
      expect([p.id, p.difficulty, p.companyId, p.fiscalYear], row.id).toEqual([row.id, 'hard', row.company, 2022]);
      if (row.tier === null) expect(p.tier, row.id).toBeUndefined();
      else expect(p.tier, row.id).toBe(row.tier);
    }
  });

  it('J2: 正常は anomaly が null で、labelOverrides・unitOverrides・signOverrides・cardEdits が無い', () => {
    expect(normalProblems().length).toBe(10);
    normalProblems().forEach(({ p }) => {
      expect(p.anomaly, p.id).toBeNull();
      for (const k of ['labelOverrides', 'unitOverrides', 'signOverrides', 'cardEdits'] as const) expect(p[k], `${p.id} ${k}`).toBeUndefined();
    });
  });

  it('J3: 正常の検証器の hard・soft の違反が 0 件 (営業 CF がマイナスの c06 も)', () => {
    expect(normalProblems().length).toBe(10);
    normalProblems().forEach(({ p, row }) => {
      const r = verifyProblem(p, companyOf(row.company));
      expect(r.hard.map((v) => `${v.rule}: ${v.message}`), p.id).toEqual([]);
      expect(r.soft.map((v) => `${v.rule}: ${v.message}`), p.id).toEqual([]);
    });
  });

  /** 正常の要素 (設計表 §3)。データから数える。 */
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
    if (pl.operatingIncome < p.tanshin.incomeStatement.previous.operatingIncome) out.push('DN');
    if (cf.operatingCashFlow < 0) out.push('CN');
    return out;
  }

  it('J4: 正常の要素をデータから数えると、設計表と同じ (DN = 営業利益が減る・CN = 営業 CF がマイナス)', () => {
    expect(normalProblems().length).toBe(10);
    normalProblems().forEach(({ p, row }) => expect(elementsOf(p).sort(), row.id).toEqual([...row.elements].sort()));
  });

  it('J5: 正常の条件 — 営業利益率は四捨五入・前期比 0.5〜2 かつ ≠ かつ 2% 以上・③ < 売上高・カードの 4 欄と H-34 の対象欄は 0 以上・営業利益の前期は正', () => {
    expect(normalProblems().length).toBe(10);
    normalProblems().forEach(({ p }) => {
      const t = p.tanshin;
      const cur = t.incomeStatement.current;
      const prev = t.incomeStatement.previous;
      expect(t.summary.operatingMargin, p.id).toBe(round1((cur.operatingIncome / cur.netSales) * 100));
      const ratio = cur.operatingIncome / prev.operatingIncome;
      expect(ratio, p.id).toBeGreaterThanOrEqual(0.5);
      expect(ratio, p.id).toBeLessThanOrEqual(2);
      expect(Math.abs(ratio - 1), p.id).toBeGreaterThanOrEqual(0.02);
      expect(cur.operatingIncome, p.id).toBeLessThan(cur.netSales);
      expect(prev.operatingIncome, p.id).toBeGreaterThan(0);
      const nonNegative = [
        cur.netSales, prev.operatingIncome, cur.operatingIncome, t.summary.operatingMargin,
        t.balanceSheet.current.totalAssets, t.balanceSheet.current.totalLiabilitiesAndNetAssets, t.balanceSheet.current.cash,
        t.balanceSheet.previous.receivables, t.balanceSheet.current.receivables, t.cashFlow.cashEnding,
        p.ir.highlights.netSales.amount, p.ir.supplement.cash.current, p.ir.supplement.cash.previous, p.ir.supplement.interestBearingDebt.previous,
      ];
      nonNegative.forEach((v) => expect(v, p.id).toBeGreaterThanOrEqual(0));
    });
  });

  it('J6: IR は全社 億円・小数第 1 位。IR の売上高 = 短信の売上高 ÷ 100 の四捨五入。比率に使う短信の金額は 10 百万円の倍数。IR の純有利子負債 = 丸めたあとの有利子負債 − 丸めたあとの現金', () => {
    expect(normalProblems().length).toBe(10);
    normalProblems().forEach(({ p }) => {
      expect(p.ir.header.unit, p.id).toBe('億円');
      expect(p.ir.highlights.netSales.amount, p.id).toBe(round1(p.tanshin.incomeStatement.current.netSales / 100));
      const t = p.tanshin;
      const amounts: number[] = [];
      for (const k of ['previous', 'current'] as const) {
        const pl = t.incomeStatement[k];
        amounts.push(pl.netSales, pl.grossProfit, pl.operatingIncome);
        t.notes.segments[k].segments.forEach((x) => amounts.push(x.netSales, x.profit));
        amounts.push(t.notes.segments[k].adjustment);
      }
      amounts.forEach((v) => expect(Math.abs(v) % 10, `${p.id} ${v}`).toBe(0));
      const s = p.ir.supplement;
      for (const q of ['previous', 'current'] as const) {
        expect(Math.round(s.netDebt[q] * 10), `${p.id} ${q}`).toBe(Math.round(s.interestBearingDebt[q] * 10) - Math.round(s.cash[q] * 10));
      }
    });
  });

  it('J7: 金額は 6 桁以内 — 全 132 問の短信の数値の絶対値が 1,000,000 未満', () => {
    expect(all().length).toBe(132);
    const numbers = (x: unknown, out: number[] = []): number[] => {
      if (typeof x === 'number') out.push(x);
      else if (Array.isArray(x)) x.forEach((y) => numbers(y, out));
      else if (typeof x === 'object' && x !== null) Object.values(x).forEach((y) => numbers(y, out));
      return out;
    };
    all().forEach(({ p }) => expect(Math.max(...numbers(p.tanshin).map(Math.abs)), p.id).toBeLessThan(1_000_000));
  });

  it('J8: 決算発表日と株主総会の日は平日で、公開 (2026-11) より前 (全 132 問)', () => {
    expect(all().length).toBe(132);
    all().forEach(({ p }) => {
      const d = p.tanshin.dates;
      [d.disclosure, d.shareholdersMeeting].forEach((iso) => {
        expect([0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay()), `${p.id} ${iso}`).toBe(false);
        expect(iso < '2026-11-01', `${p.id} ${iso}`).toBe(true);
      });
    });
  });

  it('J9: IR の営業 CF の文は主張の向きと合う (プラス / マイナス)。営業利益の主張・営業 CF の主張はそれぞれちょうど 1 つ (全 132 問。異変の問題の H-21 は文が主張と食い違う作りの対象外なので、向きの一致は正常だけ)', () => {
    expect(all().length).toBe(132);
    all().forEach(({ p }) => {
      const count = (metric: string) => p.ir.statements.reduce((n, s) => n + s.claims.filter((c) => c.metric === metric).length, 0);
      expect(count('operatingIncome'), p.id).toBe(1);
      expect(count('operatingCashFlow'), p.id).toBe(1);
    });
    normalProblems().forEach(({ p }) => {
      const st = p.ir.statements.find((s) => s.claims.some((c) => c.metric === 'operatingCashFlow')) as Problem['ir']['statements'][number];
      const dir = (st.claims.find((c) => c.metric === 'operatingCashFlow') as { direction: string }).direction;
      expect(st.text, p.id).toContain(dir === 'up' ? 'プラス' : 'マイナス');
      expect(st.text, p.id).not.toContain(dir === 'up' ? 'マイナス' : 'プラス');
      expect(dir, p.id).toBe(p.tanshin.cashFlow.operatingCashFlow > 0 ? 'up' : 'down');
    });
  });

  it('J10: 文に、数字と矛盾して読める語 (おかげさまで・加速・拡大・好調・堅調・順調) を使わない。後発事象の文の 1,000 以上の金額は桁区切りのコンマで書く', () => {
    expect(all().length).toBe(132);
    all().forEach(({ p }) => {
      p.ir.statements.forEach((st) => expect(st.text, p.id).not.toMatch(/おかげさまで|加速|拡大|好調|堅調|順調/));
      [p.tanshin.notes.subsequentEvents, p.ir.outlook.subsequentEvent ?? ''].forEach((t) => expect(t, p.id).not.toMatch(/(?<![\d,.])\d{4,}(?![\d,])/));
    });
  });
});

describe('K: 異変の問題 122 問', () => {
  const NUMERIC = ['H-01', 'H-03', 'H-04', 'H-05', 'H-13', 'H-17', 'H-19', 'H-20', 'H-21', 'H-24'];
  const entries = () => anomalyRows.filter((r) => have(r.id)).map((r) => ({ row: r, p: load(r.id), base: baseOf(r) }));
  const IR_SLOTS = ['irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev'];
  const ITEM_KEY: Record<string, string> = {
    ocf: 'tanshin.cashFlow.operatingCashFlow', ta: 'tanshin.balanceSheet.totalAssets', pbt: 'tanshin.incomeStatement.incomeBeforeTax',
    cash: 'tanshin.balanceSheet.cash', cfEnd: 'tanshin.cashFlow.cashEnding',
  };
  const WORDING = ['決算短信は監査済みです', '決算短信は公認会計士の監査を受けています', '決算短信は監査法人の監査済みです'];

  it('K1: id・会社・期・段・種類が設計表と同じ。base = その会社の正常な問題。changed = 基との実際の差 (cardEdits・labelOverrides だけで表す種類は空)', () => {
    expect(entries().length).toBe(122);
    entries().forEach(({ row, p, base }) => {
      expect([p.id, p.companyId, p.fiscalYear, p.tier, p.anomaly?.kind], row.id).toEqual([row.id, row.company, 2022, row.tier, row.kind]);
      expect(p.anomaly?.base, row.id).toBe(base.id);
      expect([...(p.anomaly?.changed ?? [])].sort(), row.id).toEqual(changedCells(base, p).sort());
      if (['H-28', 'H-29', 'H-30', 'H-31', 'H-32', 'H-33', 'H-34'].includes(row.kind as string)) expect(p.anomaly?.changed, row.id).toEqual([]);
    });
  });

  it('K2: 指定した 1 つだけが破れている — anomalyIssues が空で、hard の違反がある', () => {
    expect(entries().length).toBe(122);
    entries().forEach(({ row, p }) => {
      const result = verifyProblem(p, companyOf(row.company));
      expect(anomalyIssues(p, kindList, result).map((i) => i.message), row.id).toEqual([]);
      expect(result.hard.length, row.id).toBeGreaterThan(0);
    });
  });

  it('K3: 答え合わせの文言は 30 字以上 (数字を使う種類は数字を含む)。場所は 1 件以上で、ir.statements.<N>.text を指さない', () => {
    expect(entries().length).toBe(122);
    entries().forEach(({ row, p }) => {
      const a = p.anomaly as NonNullable<Problem['anomaly']>;
      expect(a.explanation.trim().length, row.id).toBeGreaterThanOrEqual(30);
      if (NUMERIC.includes(row.kind as string)) expect(a.explanation, row.id).toMatch(/[0-9]/);
      expect(a.places.length, row.id).toBeGreaterThan(0);
      a.places.forEach((pl) => {
        if ('path' in pl) expect(pl.path, row.id).not.toMatch(/^statements\.\d+\.text$/);
      });
    });
  });

  it('K4: 形が設計表のとおりに作られている (種類ごと)', () => {
    expect(entries().length).toBe(122);
    for (const { row, p, base } of entries()) {
      const id = row.id;
      const f = row.form;
      const slot = /^欄=([A-Za-z]+)/.exec(f)?.[1] as string;
      const chg = changedCells(base, p);
      const bt = base.tanshin;
      const t = p.tanshin;
      switch (row.kind) {
        case 'H-01': {
          const d = Math.max(20, Math.round((bt.balanceSheet.current.payables * 0.1) / 10) * 10);
          expect(t.balanceSheet.current.payables - bt.balanceSheet.current.payables, id).toBe(d);
          expect(t.balanceSheet.current.totalAssets, id).toBe(bt.balanceSheet.current.totalAssets);
          expect(t.balanceSheet.current.totalLiabilitiesAndNetAssets - bt.balanceSheet.current.totalLiabilitiesAndNetAssets, id).toBe(d);
          expect(chg.every((c) => /^tanshin\.balanceSheet\.current\.(payables|totalCurrentLiabilities|totalLiabilities|totalLiabilitiesAndNetAssets)$/.test(c)), `${id} ${chg}`).toBe(true);
          break;
        }
        case 'H-03':
          expect(chg, id).toEqual(['tanshin.cashFlow.incomeBeforeTax']);
          expect(t.cashFlow.incomeBeforeTax, id).toBe(t.incomeStatement.current.netIncome);
          break;
        case 'H-04':
          expect(chg, id).toEqual(['tanshin.cashFlow.cashEnding']);
          expect(t.cashFlow.cashEnding / bt.cashFlow.cashEnding, id).toBeGreaterThan(1.04);
          expect(t.cashFlow.cashEnding / bt.cashFlow.cashEnding, id).toBeLessThan(1.06);
          break;
        case 'H-05': {
          expect(chg, id).toEqual(['tanshin.cashFlow.receivablesChange']);
          const was = bt.cashFlow.receivablesChange;
          const now = t.cashFlow.receivablesChange;
          if (f === '作り方=符号を逆に') expect(now, id).toBe(-was);
          else {
            expect(Math.sign(now), id).toBe(Math.sign(was));
            expect(Math.abs(now - was), id).toBeGreaterThanOrEqual(Math.max(5, 0.2 * Math.abs(was)));
          }
          break;
        }
        case 'H-13': {
          const path = slot === 'irSales' ? 'ir.highlights.netSales.amount' : 'ir.supplement.cash.current';
          expect(chg, id).toEqual([path]);
          const get = (q: Problem) => (slot === 'irSales' ? q.ir.highlights.netSales.amount : q.ir.supplement.cash.current);
          expect(Math.abs(get(p) / get(base) - 1.05), id).toBeLessThanOrEqual(0.1 / get(base) + 1e-9);
          break;
        }
        case 'H-17': {
          expect(chg, id).toEqual(['ir.highlights.netSales.amount']);
          const k = f === '倍率=×10' ? 10 : 0.1;
          // IR の値は小数第 1 位に丸める (誤差 0.05) ので、基との比は k から 0.05 ÷ 基 以内
          expect(Math.abs(p.ir.highlights.netSales.amount / base.ir.highlights.netSales.amount - k), id).toBeLessThanOrEqual(0.05 / base.ir.highlights.netSales.amount + 1e-9);
          break;
        }
        case 'H-19': {
          const missing = Number(/欠け=(\d)/.exec(f)?.[1]) - 1; // 欠けるセグメントの添字 (最後 = 3・真ん中 = 2)
          expect(p.ir.segments.items.length, id).toBe(base.ir.segments.items.length - 1);
          expect(p.ir.segments.items.map((x) => x.name), id).toEqual(base.ir.segments.items.filter((_, k) => k !== missing).map((x) => x.name));
          expect(chg.every((c) => c.startsWith('ir.segments.items.') || c.startsWith('ir.segments.adjustment.')), `${id} ${chg}`).toBe(true);
          break;
        }
        case 'H-20': {
          expect(chg, id).toEqual(['ir.supplement.netDebt.previous']);
          const was = base.ir.supplement.netDebt.previous;
          expect(Math.abs((p.ir.supplement.netDebt.previous - was) / was - 0.2), id).toBeLessThanOrEqual(0.02);
          break;
        }
        case 'H-21': {
          const idx = base.ir.statements.findIndex((s) => s.claims.some((c) => c.metric === 'operatingCashFlow'));
          const was = (base.ir.statements[idx] as Problem['ir']['statements'][number]).claims.find((c) => c.metric === 'operatingCashFlow') as { direction: string };
          const now = (p.ir.statements[idx] as Problem['ir']['statements'][number]).claims.find((c) => c.metric === 'operatingCashFlow') as { direction: string };
          expect(now.direction, id).toBe(was.direction === 'up' ? 'down' : 'up');
          expect(chg.every((c) => c.startsWith(`ir.statements.${idx}.`)), `${id} ${chg}`).toBe(true);
          expect(t, id).toEqual(bt);
          break;
        }
        case 'H-22':
          expect(chg, id).toEqual(['tanshin.summary.auditNote']);
          expect(t.summary.auditNote, id).toBe(WORDING[Number(/=(\d)/.exec(f)?.[1]) - 1]);
          break;
        case 'H-23':
          if (f === '反転=flag') {
            expect(chg, id).toEqual(['tanshin.summary.accountingPolicyChange']);
            expect(t.summary.accountingPolicyChange, id).toBe(!bt.summary.accountingPolicyChange);
          } else {
            expect(chg, id).toEqual(['tanshin.notes.accountingPolicyNote']);
            expect(t.notes.accountingPolicyNote === '該当事項はありません。', id).toBe(bt.notes.accountingPolicyNote !== '該当事項はありません。');
          }
          break;
        case 'H-24':
          expect(base.ir.outlook.subsequentEvent, id).toBeNull();
          expect(bt.notes.subsequentEvents, id).toBe('該当事項はありません。');
          expect(chg, id).toEqual(['ir.outlook.subsequentEvent']);
          expect(p.ir.outlook.subsequentEvent, id).toMatch(/\d/);
          break;
        case 'H-28':
          expect(p.labelOverrides, id).toEqual({ 'tanshin.balanceSheet.receivables': /^科目名=(.+)$/.exec(f)?.[1] });
          expect(p.cardEdits, id).toBeUndefined();
          break;
        case 'H-29':
          expect(p.cardEdits, id).toEqual([{ card: 0, slot, op: 'unit', unit: IR_SLOTS.includes(slot) ? '百万円' : '億円' }]);
          break;
        case 'H-30': {
          const standard = LABELS[ITEM_KEY[slot] as string] as string;
          expect(p.labelOverrides, id).toEqual({ [ITEM_KEY[slot] as string]: standard.slice(0, -1) });
          expect(p.cardEdits, id).toBeUndefined();
          break;
        }
        case 'H-31':
          expect(p.cardEdits, id).toEqual([{ card: 0, slot, op: 'drop' }]);
          break;
        case 'H-32':
          expect(p.cardEdits, id).toEqual([{ card: 0, slot: /^欄=([A-Za-z]+):/.exec(f)?.[1], op: 'format', style: /:(no-comma|comma-shift)$/.exec(f)?.[1] }]);
          break;
        case 'H-33':
          expect(p.cardEdits, id).toEqual([{ card: 0, slot, op: 'dup' }]);
          break;
        case 'H-34':
          expect(p.cardEdits, id).toEqual([{ card: 0, slot, op: 'sign' }]);
          break;
        case 'H-35': {
          const other = companyOf(/^社名=(c\d\d)$/.exec(f)?.[1] as string);
          expect(chg, id).toEqual(['ir.header.companyName']);
          expect(p.ir.header.companyName, id).toBe(other.name);
          break;
        }
        default:
          throw new Error(`未知の種類 ${row.kind}`);
      }
    }
  });

  it('K5: G3 — 短信の金額のずれは 5 百万円以上かつ 1% 以上、IR の億円のずれは 0.3 億円以上かつ 1% 以上 (変えた項目の変更前の値に対して)', () => {
    expect(entries().length).toBe(122);
    const check = (id: string, was: number, now: number, min: number) => {
      expect(Math.abs(now - was), `${id} 絶対`).toBeGreaterThanOrEqual(min - 1e-9);
      expect(Math.abs(now - was), `${id} 割合`).toBeGreaterThanOrEqual(0.01 * Math.abs(was) - 1e-9);
    };
    for (const { row, p, base } of entries()) {
      const [bt, t] = [base.tanshin, p.tanshin];
      switch (row.kind) {
        case 'H-01': check(row.id, bt.balanceSheet.current.payables, t.balanceSheet.current.payables, 5); break;
        case 'H-03': check(row.id, bt.cashFlow.incomeBeforeTax, t.cashFlow.incomeBeforeTax, 5); break;
        case 'H-04': check(row.id, bt.cashFlow.cashEnding, t.cashFlow.cashEnding, 5); break;
        case 'H-05': check(row.id, bt.cashFlow.receivablesChange, t.cashFlow.receivablesChange, 5); break;
        case 'H-13':
          if (row.form === '欄=irSales') check(row.id, base.ir.highlights.netSales.amount, p.ir.highlights.netSales.amount, 0.3);
          else check(row.id, base.ir.supplement.cash.current, p.ir.supplement.cash.current, 0.3);
          break;
        case 'H-17': check(row.id, base.ir.highlights.netSales.amount, p.ir.highlights.netSales.amount, 0.3); break;
        case 'H-20': check(row.id, base.ir.supplement.netDebt.previous, p.ir.supplement.netDebt.previous, 0.3); break;
        default: break;
      }
    }
  });

  it('K6: H-24 の基 (正常) は、短信も IR も後発事象が「該当なし」', () => {
    const h24 = entries().filter(({ row }) => row.kind === 'H-24');
    expect(h24.length).toBe(5);
    h24.forEach(({ row, base }) => {
      expect(base.ir.outlook.subsequentEvent, row.id).toBeNull();
      expect(base.tanshin.notes.subsequentEvents, row.id).toBe('該当事項はありません。');
    });
  });
});

describe('A: 全体', () => {
  const inputs = () => rows.filter((r) => have(r.id)).map((r) => ({ file: `src/data/problems/hard/${r.id}.json`, value: JSON.parse(readFileSync(file(r.id), 'utf-8')) as unknown }));

  it('A1: verifyDataset — errors 0・むずかしいの shortfalls 0 (card-* と anomaly-min-deviation を含む)・参考の規則 0。stats.hard = 132・122・10', () => {
    const result = verifyDataset({
      companies: companies as unknown[],
      kinds: kinds as unknown[],
      problems: inputs(),
      samples: [{ file: 'src/data/samples/sample.json', value: sample as unknown }],
    });
    expect(result.errors.map((e) => `${e.code} ${e.message}`)).toEqual([]);
    expect(result.shortfalls.filter((s) => s.difficulty === 'hard').map((s) => `${s.code} ${s.message}`)).toEqual([]);
    expect(result.soft.filter((s) => s.problem?.startsWith('hard-')).map((s) => `${s.code} ${s.message}`)).toEqual([]);
    expect(result.stats.hard).toEqual({ total: 132, anomaly: 122, normal: 10 });
  });

  it('A2: 段別の異変の問題の数が 44・43・35。会社どうしの差が段ごとに 1 以内 (JSON から数え直す)', () => {
    const anomalies = all().filter(({ p }) => p.anomaly !== null).map(({ p }) => p);
    expect([1, 2, 3].map((t) => anomalies.filter((p) => p.tier === t).length)).toEqual([44, 43, 35]);
    for (const tier of [1, 2, 3]) {
      const counts = companies.map((c) => anomalies.filter((p) => p.companyId === c.id && p.tier === tier).length);
      expect(Math.max(...counts) - Math.min(...counts), `段 ${tier}`).toBeLessThanOrEqual(1);
    }
  });

  it('A3: 転送量 — 132 問の JSON を 1 つにして gzip した長さが 150,000 B 未満 (測った: 127,737 B。charter の初回 1 MB 未満・設計 v3 §3.2 の見積もり 217 問で 206〜220 KB のむずかしいの分)', () => {
    const joined = JSON.stringify(all().map(({ p }) => p));
    expect(all().length).toBe(132);
    expect(gzipSync(joined, { level: 9 }).length).toBeLessThan(150_000);
  });

  it('A4: JSON は生成器の出力と同じ。同じ入力で生成器を 2 回回すと同じ', async () => {
    const { buildAll } = await import('../../scripts/gen-hard/build.ts');
    const a = buildAll() as Problem[];
    const b = buildAll() as Problem[];
    expect(a).toEqual(b);
    expect(a.length).toBe(132);
    a.forEach((p) => expect(load(p.id), p.id).toEqual(p));
  });
});
