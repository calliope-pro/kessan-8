// N・A・D・R 群 (docs/test-cases/problems-easy-v3.md §1〜§3): コミットした src/data のやさしい 85 問と見本を、設計表 (spec-v3.json) と検証器で確かめる。
// 問題データの中身は、検証器 (D 群) と、検証器が見ない約束 (N・A 群) の両方で確かめる。生成器の出力との一致は R1 (バイト単位)。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { deriveCards } from '../../src/domain/cards.ts';
import type { Card } from '../../src/domain/cards.ts';
import { LABELS } from '../../src/domain/labels.ts';
import type { AnomalyKind, AnomalyPlace, Company, Problem } from '../../src/domain/types.ts';
import { cardRelationIssues, cardStructureIssues, cardTextLengthIssues } from '../../src/verifier/cards.ts';
import { verifyDataset, verifyIrDisplay, verifyProblem } from '../../src/verifier/index.ts';
import { roundHalfAway } from '../../src/verifier/math.ts';
import { changedCells, getPath, numericCells } from '../../src/verifier/path.ts';
import { glyphIndex, salesBelowOperating, scaleMargin, scaleOperating, shiftYearEnd } from './inject.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const DATA = `${root}src/data`;
const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf-8')) as T;
const tmps: string[] = [];
afterAll(() => tmps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (): string => {
  const d = mkdtempSync(`${tmpdir()}/gen-easy-`);
  tmps.push(d);
  return d;
};

interface SpecEntry {
  id: string;
  company: string;
  fiscalYear: number;
  month: number;
  kind: string | null;
  tier: 1 | 2 | 3 | null;
  op?: 'up' | 'down';
  omRange?: [number, number];
  salesRange?: [number, number];
  opRange?: [number, number];
  base?: string;
  edit?: Record<string, unknown>;
}
const spec = read<{ sample: { company: string; fiscalYear: number }; problems: SpecEntry[] }>(`${root}docs/plans/problems-easy/spec-v3.json`);
const companies = read<Company[]>(`${DATA}/companies.json`);
const kinds = read<AnomalyKind[]>(`${DATA}/anomaly-kinds.json`);
const companyOf = (id: string): Company => companies.find((c) => c.id === id) as Company;
const files = readdirSync(`${DATA}/problems/easy`).filter((f) => f.endsWith('.json')).sort();
const problems = files.map((f) => read<Problem>(`${DATA}/problems/easy/${f}`));
const byId = new Map(problems.map((p) => [p.id, p]));
const sampleFile = read<{ problem: Problem }>(`${DATA}/samples/sample.json`);
const normalSpecs = spec.problems.filter((s) => s.kind === null);
const anomalySpecs = spec.problems.filter((s) => s.kind !== null);
const get = (id: string): Problem => byId.get(id) as Problem;
const cardOf = (p: Problem, applyEdits = true): Card => deriveCards(p, companyOf(p.companyId), 'easy', { applyEdits });
const slotOf = (card: Card, key: string) => card.slots.find((s) => s.key === key);
const IS = (p: Problem, q: 'previous' | 'current') => p.tanshin.incomeStatement[q];
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number): string => `${y}-${String(m).padStart(2, '0')}-${lastDay(y, m)}`;

describe('正常な問題 10 問と見本 (N 群。コミットした src/data)', () => {
  it('N1: spec の正常 10 問が、id・会社・期のとおりにある。正常な問題に tier・差し替え・異変が無い。見本は c09 2023 年', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      expect(p, s.id).toBeDefined();
      expect([p.companyId, p.fiscalYear, p.difficulty, p.anomaly], s.id).toEqual([s.company, s.fiscalYear, 'easy', null]);
      for (const key of ['tier', 'labelOverrides', 'unitOverrides', 'signOverrides', 'cardEdits'] as const) expect(p[key], `${s.id}.${key}`).toBeUndefined();
    }
    expect([sampleFile.problem.companyId, sampleFile.problem.fiscalYear]).toEqual([spec.sample.company, spec.sample.fiscalYear]);
  });

  it('N2・N10: 営業利益の向きが spec の op のとおり。減益は 4 社。見出し語と営業利益の主張の向きが同じ', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      const [prev, cur] = [IS(p, 'previous').operatingIncome, IS(p, 'current').operatingIncome];
      expect(cur > prev, s.id).toBe(s.op === 'up');
      expect(cardOf(p).headline?.word, s.id).toBe(s.op === 'up' ? '増益' : '減益');
      const claim = p.ir.statements.flatMap((st) => st.claims).find((c) => c.metric === 'operatingIncome');
      expect(claim?.direction, s.id).toBe(s.op);
    }
    expect(normalSpecs.filter((s) => s.op === 'down').map((s) => s.company)).toEqual(['c02', 'c05', 'c08', 'c10']);
  });

  it('N3: 営業利益の前期比は 2% 以上・0.5〜2 倍・当期 < 売上高。カードの 4 欄は正', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      const [prev, cur, sales] = [IS(p, 'previous').operatingIncome, IS(p, 'current').operatingIncome, IS(p, 'current').netSales];
      expect(Math.abs(cur / prev - 1), `${s.id} ${prev}→${cur}`).toBeGreaterThanOrEqual(0.02);
      expect(cur / prev, s.id).toBeGreaterThanOrEqual(0.5);
      expect(cur / prev, s.id).toBeLessThanOrEqual(2);
      expect(cur, s.id).toBeLessThan(sales);
      for (const v of [prev, cur, sales, p.tanshin.summary.operatingMargin]) expect(v, s.id).toBeGreaterThan(0);
    }
  });

  it('N4・N5: 営業利益率 = 営業利益 ÷ 売上高 × 100 (小数第 1 位)。spec の範囲の中。E-02 の増益の基は 10 × 営業利益 ≤ 0.8 × 売上高', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      const [op, sales] = [IS(p, 'current').operatingIncome, IS(p, 'current').netSales];
      expect(p.tanshin.summary.operatingMargin, s.id).toBe(roundHalfAway(op * 1000, sales) / 10);
      const [lo, hi] = s.omRange as [number, number];
      expect(op / sales, s.id).toBeGreaterThanOrEqual(lo - 0.0005);
      expect(op / sales, s.id).toBeLessThanOrEqual(hi + 0.0005);
      expect(sales, s.id).toBeGreaterThanOrEqual((s.salesRange as [number, number])[0]);
      expect(sales, s.id).toBeLessThanOrEqual((s.salesRange as [number, number])[1]);
      if (anomalySpecs.some((a) => a.base === s.id && a.kind === 'E-02') && s.op === 'up') expect(10 * op, s.id).toBeLessThanOrEqual(0.8 * sales);
    }
  });

  it('N6: IR は億円。短信の売上高・売上総利益・営業利益・セグメントの値 (前期・当期) は 10 の倍数', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      expect(p.ir.header.unit, s.id).toBe('億円');
      const cells = (['previous', 'current'] as const).flatMap((q) => [IS(p, q).netSales, IS(p, q).grossProfit, IS(p, q).operatingIncome, ...p.tanshin.notes.segments[q].segments.flatMap((g) => [g.netSales, g.profit])]);
      for (const v of cells) expect(v % 10, `${s.id} ${v}`).toBe(0);
    }
  });

  it('N7: 期 = ${年}年${月}期。3 画面の当期の日付はその月の末日 (c03 = 2024-02-29)。前期の日付はその 1 年前の月末', () => {
    for (const s of normalSpecs) {
      const p = get(s.id);
      expect(p.tanshin.header.periodLabel, s.id).toBe(`${s.fiscalYear}年${s.month}月期`);
      const d = p.tanshin.columnDates;
      for (const screen of [d.balanceSheet, d.incomeStatement, d.cashFlow]) {
        expect(screen.current, s.id).toBe(iso(s.fiscalYear, s.month));
        expect(screen.previous, s.id).toBe(iso(s.fiscalYear - 1, s.month));
      }
    }
    expect(get(normalSpecs.find((s) => s.company === 'c03')?.id as string).tanshin.columnDates.incomeStatement.current).toBe('2024-02-29');
  });

  it('N8・D4: 全 85 問 (異変の問題も) で、短信の数値のセル (百万円) の絶対値が 6 桁以内', () => {
    expect(problems).toHaveLength(85);
    for (const p of problems) {
      for (const path of numericCells(p).filter((c) => c.startsWith('tanshin.'))) {
        const v = getPath(p, 'tanshin', path.slice('tanshin.'.length));
        expect(Math.abs(v as number), `${p.id} ${path}`).toBeLessThan(1_000_000);
      }
    }
  });

  it('N9: 検証器の hard・soft の違反が 0 件。IR の表示の検算・カードの構造・関係・文欄の長さ・主張の数・資金の範囲も通る (正常 10 問と見本)', () => {
    const all = [...normalSpecs.map((s) => get(s.id)), { ...sampleFile.problem }];
    for (const p of all) {
      const c = companyOf(p.companyId);
      const r = verifyProblem(p, c);
      expect(r.hard.map((v) => v.rule), p.id).toEqual([]);
      expect(r.soft.map((v) => v.rule), p.id).toEqual([]);
      expect(verifyIrDisplay(p, c), p.id).toEqual([]);
      const card = cardOf(p);
      expect(cardStructureIssues(card), p.id).toEqual([]);
      expect(cardRelationIssues(card), p.id).toEqual([]);
      expect(cardTextLengthIssues(card), p.id).toEqual([]);
      for (const metric of ['operatingIncome', 'operatingCashFlow']) expect(p.ir.statements.flatMap((st) => st.claims).filter((cl) => cl.metric === metric), `${p.id} ${metric}`).toHaveLength(1);
      expect(p.tanshin.notes.cashScope, p.id).toBe(LABELS['tanshin.balanceSheet.cash']);
    }
  });

  it('N11: 見本 c09 2023 の problem の SHA-256 が、この Sub-task で決めた値のまま (生成器が変わって見本が動いたら赤)。9b9e08a のものとは、IR の見通し (次期予想) の数字だけが違う', () => {
    const sha = createHash('sha256').update(JSON.stringify(sampleFile.problem)).digest('hex');
    expect(sha).toBe('c659240da19bdb00f6fc34e9eade1ff2ee9f56e9533903648050049a9a8f822a');
  });
});

// ---- 異変 ----

const placeKey = (p: AnomalyPlace): string => (p.doc === 'card' ? `card.${p.card}.${p.slot}` : 'itemKey' in p ? p.itemKey : `${p.doc}.${p.path}`);
const edit = (s: SpecEntry) => s.edit as Record<string, unknown>;
const opStatement = (p: Problem): { index: number; claimIndex: number } => {
  const index = p.ir.statements.findIndex((st) => st.claims.some((c) => c.metric === 'operatingIncome'));
  return { index, claimIndex: p.ir.statements[index]?.claims.findIndex((c) => c.metric === 'operatingIncome') ?? -1 };
};
const CELL = { sales: 'incomeStatement.current.netSales', op: 'incomeStatement.current.operatingIncome', margin: 'summary.operatingMargin', date: 'columnDates.incomeStatement.current' };

describe('異変の問題 75 問 (A 群。コミットした src/data)', () => {
  it('A1・A2: spec どおりの id・会社・期・段・種類・基。基は同じ会社・同じ期の正常な問題。expectedRules = 実際に落ちた hard の規則。changed = 基との実際の差', () => {
    for (const s of anomalySpecs) {
      const p = get(s.id);
      expect(p, s.id).toBeDefined();
      expect([p.companyId, p.fiscalYear, p.difficulty, p.tier, p.anomaly?.kind, p.anomaly?.base], s.id).toEqual([s.company, s.fiscalYear, 'easy', s.tier, s.kind, s.base]);
      const base = get(s.base as string);
      expect(base.anomaly, s.id).toBeNull();
      expect([base.companyId, base.tanshin.header.periodLabel], s.id).toEqual([p.companyId, p.tanshin.header.periodLabel]);
      const actual = [...new Set(verifyProblem(p, companyOf(p.companyId)).hard.map((v) => v.rule))].sort();
      expect([...(p.anomaly?.expectedRules ?? [])].sort(), s.id).toEqual(actual);
      expect([...(p.anomaly?.changed ?? [])].sort(), s.id).toEqual(changedCells(base, p).sort());
    }
  });

  it('A3: 1 つの異変 = 1 つの変更。種類ごとの変えたもの (基との差・cardEdits・labelOverrides)', () => {
    for (const s of anomalySpecs) {
      const p = get(s.id);
      const base = get(s.base as string);
      const e = edit(s);
      const diff = changedCells(base, p).sort();
      const editOp = kinds.find((k) => k.id === s.kind)?.editOp;
      const t = (path: string) => `tanshin.${path}`;
      switch (s.kind) {
        case 'E-17': {
          const { index, claimIndex } = opStatement(base);
          expect(diff, s.id).toEqual([`ir.statements.${index}.claims.${claimIndex}.direction`, `ir.statements.${index}.text`].sort());
          expect(p.ir.statements[index]?.claims[claimIndex]?.direction, s.id).toBe(e.to);
          break;
        }
        case 'E-02':
          expect(diff, s.id).toEqual([t(CELL.op)]);
          expect(IS(p, 'current').operatingIncome, s.id).toBe(scaleOperating(IS(base, 'current').operatingIncome, e.factor === 10 ? 'up' : 'down'));
          break;
        case 'E-24':
          expect(diff, s.id).toEqual([t(CELL.sales)]);
          expect(IS(p, 'current').netSales, s.id).toBe(salesBelowOperating(IS(base, 'current').operatingIncome, e.ratio as number));
          break;
        case 'E-12':
          expect(diff, s.id).toEqual([t(CELL.margin)]);
          expect(p.tanshin.summary.operatingMargin, s.id).toBe(scaleMargin(base.tanshin.summary.operatingMargin, e.factor as number));
          break;
        case 'E-04':
          expect(diff, s.id).toEqual([t(CELL.date)]);
          expect(p.tanshin.columnDates.incomeStatement.current, s.id).toBe(shiftYearEnd(base.tanshin.columnDates.incomeStatement.current, e.years as number));
          break;
        default: {
          expect(diff, s.id).toEqual([]);
          if (s.kind === 'E-05') {
            expect(p.labelOverrides, s.id).toEqual({ [e.itemKey as string]: e.word });
            expect(p.cardEdits, s.id).toBeUndefined();
          } else {
            expect(p.labelOverrides, s.id).toBeUndefined();
            expect(p.cardEdits, s.id).toHaveLength(1);
            const ce = (p.cardEdits as Record<string, unknown>[])[0] as Record<string, unknown>;
            expect(ce.op, s.id).toBe(editOp);
            expect(ce.card, s.id).toBe(0);
            if (e.slot !== undefined) expect(ce.slot, s.id).toBe(e.slot);
            if (s.kind === 'E-03') expect(ce.unit, s.id).toBe('億円');
            if (s.kind === 'E-21') expect(ce.style, s.id).toBe(e.style);
            if (s.kind === 'E-26') expect(ce.word, s.id).toBe(e.word);
            if (s.kind === 'E-23') expect(ce.word, s.id).toBe(e.word);
            if (s.kind === 'E-28') expect(ce.day, s.id).toBe(32);
            if (s.kind === 'E-27') expect(ce.at, s.id).toBe(glyphIndex(slotOf(cardOf(base), e.slot as string)?.text as string, e.digit as 'first' | 'middle' | 'last'));
          }
        }
      }
      expect(p.unitOverrides, s.id).toBeUndefined();
      expect(p.signOverrides, s.id).toBeUndefined();
    }
  });

  it('A4: 答え合わせの文は 2 文まで・1 文 60 字以内・専門語なし・比べる 2 つの値を表示のとおりに含む', () => {
    const FORBIDDEN = ['検証器', '規則', 'セル', 'cardEdits', 'slot', 'tier', 'primaryRules', 'expectedRules', 'R-'];
    const nameOf = (label: string): string => label.replace(/ \(.*\)$/, '');
    for (const s of anomalySpecs) {
      const p = get(s.id);
      const base = get(s.base as string);
      const text = p.anomaly?.explanation ?? '';
      const sentences = text.split('。').filter((x) => x !== '');
      expect(text, s.id).not.toBe('');
      expect(sentences.length, `${s.id} ${text}`).toBeLessThanOrEqual(2);
      for (const sentence of sentences) expect([...sentence].length, `${s.id} ${sentence}`).toBeLessThanOrEqual(60);
      for (const w of FORBIDDEN) expect(text, `${s.id} 専門語 ${w}`).not.toContain(w);
      const card = cardOf(p);
      const bc = cardOf(base);
      const sl = (key: string) => slotOf(card, key)?.text as string;
      const e = edit(s);
      const needs: Record<string, () => string[]> = {
        'E-17': () => [card.headline?.word as string, sl('opPrev'), sl('opCurr')],
        'E-02': () => [sl('opPrev'), sl('opCurr')],
        'E-24': () => [sl('sales'), sl('opCurr')],
        'E-12': () => [sl('margin'), slotOf(bc, 'margin')?.text as string],
        'E-04': () => [card.frame.periodLabel, card.footer?.periodEnd as string],
        'E-03': () => [nameOf(slotOf(card, e.slot as string)?.label as string), '億円', '百万円'],
        'E-21': () => [sl(e.slot as string), slotOf(bc, e.slot as string)?.text as string],
        'E-25': () => [sl('sales')],
        'E-26': () => [sl('opPrev'), sl('opCurr'), e.word as string],
        'E-27': () => [sl(e.slot as string)],
        'E-28': () => [card.footer?.periodEnd as string],
        'E-05': () => [e.word as string, LABELS[e.itemKey as string] as string],
        'E-19': () => [nameOf(slotOf(bc, e.slot as string)?.label as string)],
        'E-22': () => [e.slot === 'headline' ? (card.headline?.word as string) : nameOf(slotOf(card, e.slot as string)?.label as string)],
        'E-23': () => [e.word as string, bc.headline?.word as string, sl('opPrev'), sl('opCurr')],
      };
      const need = (needs[s.kind as string] as () => string[])();
      for (const v of need) expect(text, `${s.id} (${s.kind}) に「${v}」`).toContain(v);
    }
  });

  it('A6: 答え合わせの場所 (places)', () => {
    for (const s of anomalySpecs) {
      const p = get(s.id);
      const base = get(s.base as string);
      const e = edit(s);
      const want: string[] = {
        'E-04': [`tanshin.${CELL.date}`, 'tanshin.header.periodLabel'],
        'E-17': [`ir.statements.${opStatement(base).index}`],
        'E-05': [e.itemKey as string],
        'E-02': [`tanshin.${CELL.op}`],
        'E-24': [`tanshin.${CELL.sales}`, `tanshin.${CELL.op}`],
        'E-12': [`tanshin.${CELL.margin}`],
        'E-23': ['card.0.headline'],
        'E-28': ['card.0.period'],
      }[s.kind as string] ?? [`card.0.${String(e.slot)}`];
      expect(p.anomaly?.places.map(placeKey).sort(), s.id).toEqual([...want].sort());
    }
  });

  it('D5: deriveCards が全 85 問で RangeError を投げない', () => {
    for (const p of problems) expect(() => cardOf(p), p.id).not.toThrow();
  });
});

describe('データ全体 (D 群)', () => {
  it('D3: src/data/problems/easy は easy-001〜easy-085 の 85 件だけ', () => {
    expect(files).toEqual(Array.from({ length: 85 }, (_, i) => `easy-${String(i + 1).padStart(3, '0')}.json`));
  });

  it('D1: やさしい 85 問 + 見本を verifyDataset に通すと、errors 0 件・やさしいの shortfalls 0 件', () => {
    const r = verifyDataset({
      companies,
      kinds,
      problems: files.map((f, i) => ({ file: `${DATA}/problems/easy/${f}`, value: problems[i] })),
      samples: [{ file: `${DATA}/samples/sample.json`, value: sampleFile }],
    });
    expect(r.errors.map((e) => `[${e.code}] ${e.message}`)).toEqual([]);
    expect(r.shortfalls.filter((e) => e.difficulty === 'easy').map((e) => `[${e.code}] ${e.message}`)).toEqual([]);
  });

  it('D2: やさしいだけの一時ディレクトリに verify:data --require-complete=easy --require-cards=easy → 終了コード 0', () => {
    const d = tmp();
    mkdirSync(`${d}/problems`, { recursive: true });
    cpSync(`${DATA}/problems/easy`, `${d}/problems/easy`, { recursive: true });
    cpSync(`${DATA}/samples`, `${d}/samples`, { recursive: true });
    cpSync(`${DATA}/companies.json`, `${d}/companies.json`);
    cpSync(`${DATA}/anomaly-kinds.json`, `${d}/anomaly-kinds.json`);
    const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/verify-data.ts', '--dir', d, '--require-complete=easy', '--require-cards=easy'], { cwd: root, encoding: 'utf-8' });
    expect(`${r.stdout}${r.stderr}`.split('\n').filter((l) => l.includes('致命')), r.stdout).toEqual([]);
    expect(r.status).toBe(0);
  }, 120_000);
});

// ---- 再現 (生成器の出力が、コミットした src/data と同じ) ----

const GEN = ['docs/plans/problems-easy/gen.py', '--spec', 'docs/plans/problems-easy/spec-v3.json'];
function generate(out: string): void {
  const a = spawnSync('python3', [...GEN, '--out', out], { cwd: root, encoding: 'utf-8' });
  expect(a.status, `gen.py: ${a.stderr}`).toBe(0);
  const b = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/gen-easy/run.ts', '--dir', out], { cwd: root, encoding: 'utf-8' });
  expect(b.status, `run.ts: ${b.stderr}`).toBe(0);
}
const bytes = (dir: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const f of readdirSync(`${dir}/problems/easy`).sort()) out.set(`problems/easy/${f}`, readFileSync(`${dir}/problems/easy/${f}`, 'utf-8'));
  if (existsSync(`${dir}/samples/sample.json`)) out.set('samples/sample.json', readFileSync(`${dir}/samples/sample.json`, 'utf-8'));
  return out;
};

describe('再現 (N12・A5・R1)', () => {
  it('N12・A5・R1: gen.py → run.ts を 2 回 (別のディレクトリに) 回すと全ファイルが同じ。src/data の problems/easy と samples/sample.json とバイト単位で一致する', () => {
    const [x, y] = [tmp(), tmp()];
    generate(x);
    generate(y);
    const [bx, by, committed] = [bytes(x), bytes(y), bytes(DATA)];
    expect([...bx.keys()]).toHaveLength(86);
    expect([...bx.entries()]).toEqual([...by.entries()]);
    expect([...bx.entries()]).toEqual([...committed.entries()]);
  }, 240_000);
});
