// ケース表 docs/test-cases/cards.md §2 (R・C)・§4 (V)・§8 (M)・§9.3 (X): カードの整合・構造・見える条件・最小のずれ・二重の食い違い (Sub-task #153)。
import { describe, expect, it } from 'vitest';
import { companies, problems } from '../data/pool-source.ts';
import { deriveCards, shapesOf } from '../domain/cards.ts';
import type { Card } from '../domain/cards.ts';
import type { AnomalyKind, Company, Problem, ShapeId } from '../domain/types.ts';
import { cardRelationIssues, cardStructureIssues, cardTextLengthIssues, deviationIssues, doubleDiscrepancies, visibleShapes } from './cards.ts';
import { add, clone, companyA, companyB, kindOf, normalA, normalB, set, shapeAnomaly } from './test-utils.ts';

const easy = (p: Problem = normalA()): Problem => p;
const hard = (p: Problem = normalA()): Problem => ({ ...p, difficulty: 'hard' });
const A = { company: companyA(), statements: normalA().ir.statements };
const cardsOf = (p: Problem, shape: ShapeId, c: Company = companyA()): Card[] => deriveCards(p, c, shape);
const relations = (p: Problem, shape: ShapeId, c: Company = companyA()) => cardRelationIssues(cardsOf(p, shape, c), shape, { company: c, statements: p.ir.statements });

/** カードの欄の raw を直接書き換えたカード (deriveCards の誤りとは独立に、関係の検査だけを見る)。 */
function tamper(cards: Card[], card: number, key: string, raw: number | string | boolean): Card[] {
  const copy = structuredClone(cards);
  const slot = copy[card]?.slots.find((s) => s.key === key);
  if (!slot) throw new Error(`欄が無い: ${key}`);
  slot.raw = raw;
  return copy;
}

describe('2.1 関係 cardRelationIssues (R1〜R6)', () => {
  it('基準問題 A・B の導出したカードは、どの形でも空', () => {
    for (const shape of shapesOf('easy')) {
      expect(relations(easy(), shape)).toEqual([]);
      expect(relations(normalB(), shape, companyB())).toEqual([]);
    }
    for (const shape of shapesOf('hard')) {
      expect(relations(hard(), shape)).toEqual([]);
      expect(relations(hard(normalB()), shape, companyB())).toEqual([]);
    }
  });

  const issues = (cards: Card[], shape: ShapeId, p: Problem = easy(), c: Company = companyA()) => cardRelationIssues(cards, shape, { company: c, statements: p.ir.statements });
  const base = (shape: ShapeId, p: Problem = easy()) => cardsOf(p, shape);

  it('R1: E1 の営業利益率・見出し語の向き', () => {
    expect(issues(tamper(base('E1'), 0, 'margin', 20), 'E1')).toHaveLength(1);
    const reversed = structuredClone(base('E1'));
    (reversed[0] as Card).headline = { word: '減益', reads: ['ir.statements.0'] };
    expect(issues(reversed, 'E1')).toHaveLength(1);
  });
  it('R1: 営業利益率の丸め (売上高 96,930・営業利益 4,920 → 5.1。売上高 2,000・営業利益 101 → 5.05 を 0.5 を遠い側へ 5.1)', () => {
    let p = set(easy(), 'tanshin.incomeStatement.current.netSales', 96930);
    p = set(p, 'tanshin.incomeStatement.current.operatingIncome', 4920);
    p = set(p, 'tanshin.incomeStatement.previous.operatingIncome', 4480);
    p = set(p, 'tanshin.summary.operatingMargin', 5.1);
    expect(relations(p, 'E1')).toEqual([]);
    let q = set(easy(), 'tanshin.incomeStatement.current.netSales', 2000);
    q = set(q, 'tanshin.incomeStatement.current.operatingIncome', 101);
    q = set(q, 'tanshin.incomeStatement.previous.operatingIncome', 100);
    expect(relations(set(q, 'tanshin.summary.operatingMargin', 5.1), 'E1')).toEqual([]);
    expect(relations(set(q, 'tanshin.summary.operatingMargin', 5.0), 'E1')).toHaveLength(1);
  });
  it('R2: E2 の棒 (軸の下端・値) と見出し語', () => {
    const cards = structuredClone(base('E2'));
    (cards[0] as Card).bars!.axisMin = 500;
    expect(issues(cards, 'E2')).toHaveLength(1);
    const bars = structuredClone(base('E2'));
    (bars[0] as Card).bars!.items[1]!.value = 8000;
    expect(issues(bars, 'E2')).toHaveLength(1);
    const word = structuredClone(base('E2'));
    (word[0] as Card).headline = { word: '減収', reads: ['ir.statements.0'] };
    expect(issues(word, 'E2')).toHaveLength(1);
    const b = normalB();
    expect(cardRelationIssues(cardsOf(b, 'E2', companyB()), 'E2', { company: companyB(), statements: b.ir.statements })).toEqual([]);
  });
  it('R3: E3 の足し算', () => {
    expect(issues(tamper(base('E3'), 0, 'totalAssets', 15300), 'E3')).toHaveLength(1);
  });
  it('R4: H1 の貸借・IR の売上高・文の向き', () => {
    const h = hard();
    expect(issues(tamper(base('H1', h), 0, 'totalLiabNet', 15300), 'H1', h)).toHaveLength(1);
    expect(issues(tamper(base('H1', h), 1, 'netSales', 12500), 'H1', h)).toHaveLength(1);
    const p = set(h, 'ir.statements.0.claims.0.direction', 'down');
    expect(relations(p, 'H1')).toHaveLength(1);
  });
  it('R5: H2 の増減・方針の有無と注記・資産の部の科目名・営業 CF の文', () => {
    const h = hard();
    expect(issues(tamper(base('H2', h), 0, 'recvChange', -90), 'H2', h)).toHaveLength(1);
    expect(issues(tamper(base('H2', h), 0, 'policyChange', true), 'H2', h)).toHaveLength(1);
    expect(relations({ ...h, labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } }, 'H2')).toHaveLength(1);
    expect(relations(set(h, 'ir.statements.2.claims.0.direction', 'down'), 'H2')).toHaveLength(1);
  });
  it('R6: H3 の CF・現金・純有利子負債・注意書き・後発事象・セグメント', () => {
    const h = hard();
    const one = (key: string, raw: number | string | boolean, card = 0) => expect(issues(tamper(base('H3', h), card, key, raw), 'H3', h), key).toHaveLength(1);
    one('cfStart', 1260);
    one('cfEnd', 2310);
    one('cashCur', 2310, 1);
    one('netDebtPrev', 2800, 1);
    one('auditNote', '決算短信は監査済みです');
    one('subsequent', '期末後に買収した。');
    one('segments', '電機部品事業', 1);
  });
  it('R6: 純有利子負債は 10 倍した整数で比べる (B の前期 48.3 − 21.0 = 27.3)', () => {
    const b = hard(normalB());
    expect(cardRelationIssues(cardsOf(b, 'H3', companyB()), 'H3', { company: companyB(), statements: b.ir.statements })).toEqual([]);
  });
});

describe('2.2 構造・文字数 (C1〜C6)', () => {
  const structure = (cards: Card[], shape: ShapeId) => cardStructureIssues(cards, shape);
  it('C1: 正常なカードは空', () => {
    for (const shape of shapesOf('easy')) expect(structure(cardsOf(easy(), shape), shape)).toEqual([]);
    for (const shape of shapesOf('hard')) expect(structure(cardsOf(hard(), shape), shape)).toEqual([]);
  });
  it('C2: 欄を削った・並びを替えた・足したカード', () => {
    const dropped = structuredClone(cardsOf(easy(), 'E1'));
    dropped[0]!.slots.pop();
    expect(structure(dropped, 'E1').length).toBeGreaterThan(0);
    const swapped = structuredClone(cardsOf(easy(), 'E1'));
    swapped[0]!.slots.reverse();
    expect(structure(swapped, 'E1').length).toBeGreaterThan(0);
    const dup = structuredClone(cardsOf(easy(), 'E1'));
    dup[0]!.slots.push(structuredClone(dup[0]!.slots[0]!));
    expect(structure(dup, 'E1').length).toBeGreaterThan(0);
  });
  it('C3: 数字 5 つ・文 4 つは上限超え', () => {
    const five = structuredClone(cardsOf(easy(), 'E1'));
    five[0]!.slots.push({ ...structuredClone(five[0]!.slots[0]!), key: 'extra' });
    expect(structure(five, 'E1').some((m) => m.includes('上限'))).toBe(true);
    const four = structuredClone(cardsOf(hard(), 'H2'));
    four[0]!.slots.push({ ...structuredClone(four[0]!.slots[4]!), key: 'extraText' });
    expect(structure(four, 'H2').some((m) => m.includes('上限'))).toBe(true);
  });
  it('C4: 見出し語の無い E1・E2', () => {
    for (const shape of ['E1', 'E2'] as const) {
      const p = set(easy(), 'ir.statements', []);
      expect(structure(cardsOf(p, shape), shape).some((m) => m.includes('見出し語'))).toBe(true);
    }
  });
  it('C5: 文欄は 40 字まで (サロゲート対は 1 字)。数字の欄は見ない', () => {
    const at = (text: string) => {
      const cards = structuredClone(cardsOf(hard(), 'H3'));
      cards[0]!.slots.find((s) => s.key === 'subsequent')!.text = text;
      return cardTextLengthIssues(cards);
    };
    expect(at('あ'.repeat(40))).toEqual([]);
    expect(at('あ'.repeat(41))).toHaveLength(1);
    expect(at('𠮷'.repeat(40))).toEqual([]);
    const num = structuredClone(cardsOf(easy(), 'E1'));
    num[0]!.slots[0]!.text = '9'.repeat(60);
    expect(cardTextLengthIssues(num)).toEqual([]);
  });
  it('C6・C8・D53: 今の正常な問題で構造の誤りは 0 件、40 字超は hard-023・024・031・032 の 4 問・6 欄だけ (型の文は 20 字以内)', () => {
    const over: string[] = [];
    for (const p of problems.filter((q) => q.anomaly === null)) {
      const company = companies.find((c) => c.id === p.companyId) as Company;
      for (const shape of shapesOf(p.difficulty)) {
        const cards = deriveCards(p, company, shape);
        expect(cardStructureIssues(cards, shape), `${p.id} ${shape}`).toEqual([]);
        over.push(...cardTextLengthIssues(cards).map((m) => `${p.id} ${m.split(':')[0]}`));
      }
    }
    expect(new Set(over.map((s) => s.split(' ')[0]))).toEqual(new Set(['hard-023', 'hard-024', 'hard-031', 'hard-032']));
    expect(over).toHaveLength(6);
  });
  it('C7: 40 字の対象は deriveCards が作る文欄すべて (型の文・セグメントの名前の並び・「なし」も)', () => {
    const cards = structuredClone(cardsOf(hard(), 'H3'));
    cards[1]!.slots.find((s) => s.key === 'segments')!.text = 'あ'.repeat(41);
    cards[1]!.slots.find((s) => s.key === 'subsequent')!.text = 'い'.repeat(41);
    expect(cardTextLengthIssues(cards)).toHaveLength(2);
    const claim = structuredClone(cardsOf(hard(), 'H1'));
    claim[1]!.slots.find((s) => s.key === 'claim')!.text = 'う'.repeat(41);
    expect(cardTextLengthIssues(claim)).toHaveLength(1);
  });
  it('R-C: 今の正常な問題の関係はすべて成り立つ (S2 の前提)', () => {
    for (const p of problems.filter((q) => q.anomaly === null)) {
      const company = companies.find((c) => c.id === p.companyId) as Company;
      for (const shape of shapesOf(p.difficulty)) {
        expect(cardRelationIssues(deriveCards(p, company, shape), shape, { company, statements: p.ir.statements }), `${p.id} ${shape}`).toEqual([]);
      }
    }
  });
});

describe('4 見える条件 visibleShapes (V1〜V27)', () => {
  const k = (id: string, primary: string[], family: AnomalyKind['family'] = 'calculation') => kindOf(id, family, primary, primary);
  /** 場所・主な規則を指定して、基準問題 A から作った異変の問題。期待集合は実際に落ちた規則。 */
  function anomalous(p: Problem, kind: AnomalyKind, places: NonNullable<Problem['anomaly']>['places']): Problem {
    const actual = [...new Set(verifyProblemRules(p))].sort();
    return set(p, 'anomaly', { kind: kind.id, places, explanation: '説明', expectedRules: actual });
  }
  const visible = (p: Problem, kind: AnomalyKind, c: Company = companyA()) => visibleShapes(p, c, [kind]);

  it('V19: 正常な問題は難易度の全形', () => {
    expect(visibleShapes(easy(), companyA(), [])).toEqual(['E1', 'E2', 'E3']);
    expect(visibleShapes(hard(), companyA(), [])).toEqual(['H1', 'H2', 'H3']);
  });

  it('V1: 営業利益率 → E1 だけ', () => {
    const kind = k('k', ['ratio-operating-margin']);
    expect(visible(anomalous(set(easy(), 'tanshin.summary.operatingMargin', 20), kind, [{ doc: 'tanshin', path: 'summary.operatingMargin' }]), kind)).toEqual(['E1']);
  });
  it('V2・V8b: 資産合計・流動資産合計 → E3 だけ', () => {
    const kind = k('k', ['bs-total-assets']);
    expect(visible(anomalous(add(easy(), 'tanshin.balanceSheet.current.totalAssets', 1600), kind, [{ doc: 'tanshin', path: 'balanceSheet.current.totalAssets' }]), kind)).toEqual(['E3']);
    expect(visible(anomalous(set(easy(), 'tanshin.balanceSheet.current.totalCurrentAssets', 77000), kind, [{ doc: 'tanshin', path: 'balanceSheet.current.totalCurrentAssets' }]), kind)).toEqual(['E3']);
  });
  it('V3・V4: 棒 → E2 だけ (別名で V2 を満たす)', () => {
    const bars = k('k', ['chart-bars']);
    expect(visible(anomalous(set(easy(), 'ir.results.chart.netSales.current', 8000), bars, [{ doc: 'ir', path: 'results.chart.netSales.current' }]), bars)).toEqual(['E2']);
    const axis = k('k', ['chart-axis-zero']);
    expect(visible(anomalous(set(easy(), 'ir.results.chart.netSales.axisMin', 5000), axis, [{ doc: 'ir', path: 'results.chart.netSales.axisMin' }]), axis)).toEqual(['E2']);
  });
  it('V5・V6: 主張の向き (売上高 → E2、営業利益 → E1)', () => {
    const kind = k('k', ['claims-direction'], 'calculation');
    const sales = set(easy(), 'ir.statements.0.claims.0.direction', 'down');
    expect(visible(anomalous(sales, kind, [{ doc: 'ir', path: 'statements.0.text' }]), kind)).toEqual(['E2']);
    const op = set(easy(), 'ir.statements.0.claims.1.direction', 'down');
    expect(visible(anomalous(op, kind, [{ doc: 'ir', path: 'statements.0.text' }]), kind)).toEqual(['E1']);
  });
  it('V7・V18e: 科目名の誤字 (itemKey) → その科目の欄がある形だけ', () => {
    const kind = k('k', ['label-spelling']);
    const p = { ...easy(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    expect(visible(anomalous(p, kind, [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }]), kind)).toEqual(['E1']);
  });
  it('V8: 売上高 当期を 10 倍 (営業利益率は変えない) → E1 だけ。places に営業利益率を足しても同じ', () => {
    const kind = k('k', ['ratio-operating-margin']);
    const p = set(easy(), 'tanshin.incomeStatement.current.netSales', 124000);
    expect(visible(anomalous(p, kind, [{ doc: 'tanshin', path: 'incomeStatement.current.netSales' }]), kind)).toEqual(['E1']);
    expect(visible(anomalous(p, kind, [{ doc: 'tanshin', path: 'incomeStatement.current.netSales' }, { doc: 'tanshin', path: 'summary.operatingMargin' }]), kind)).toEqual(['E1']);
  });
  it('V9〜V15・V21〜V27: むずかしいの種類と形', () => {
    const h = hard();
    const row = (p: Problem, primary: string, places: NonNullable<Problem['anomaly']>['places'], expected: ShapeId[], family: AnomalyKind['family'] = 'accounting', c: Company = companyA()) => {
      const kind = k('k', [primary], family);
      expect(visibleShapes(anomalous(p, kind, places), c, [kind]), primary).toEqual(expected);
    };
    row(set(h, 'tanshin.summary.auditNote', '決算短信は監査済みです'), 'audit-note', [{ doc: 'tanshin', path: 'summary.auditNote' }], ['H3'], 'notes');
    row({ ...h, labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } }, 'account-section', [{ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.receivables' }], ['H2']);
    row(add(h, 'tanshin.cashFlow.incomeBeforeTax', 100), 'link-cf-start', [{ doc: 'tanshin', path: 'cashFlow.incomeBeforeTax' }], ['H3']);
    row(add(h, 'tanshin.balanceSheet.current.totalAssets', 100), 'bs-balance', [{ doc: 'tanshin', path: 'balanceSheet.current.totalAssets' }], ['H1']);
    row(set(h, 'ir.highlights.netSales.amount', 124000), 'xdoc-hl-net-sales', [{ doc: 'ir', path: 'highlights.netSales.amount' }], ['H1'], 'cross-document');
    row(add(h, 'tanshin.cashFlow.receivablesChange', 50), 'link-cf-receivables', [{ doc: 'tanshin', path: 'cashFlow.receivablesChange' }], ['H2']);
    row(add(h, 'tanshin.cashFlow.cashEnding', 50), 'link-cf-cash-end', [{ doc: 'tanshin', path: 'cashFlow.cashEnding' }], ['H3']);
    row(add(h, 'ir.supplement.netDebt.previous', 900), 'ir-supp-net-debt', [{ doc: 'ir', path: 'supplement.netDebt.previous' }], ['H3'], 'cross-document');
    row(add(h, 'ir.supplement.netDebt.current', 900), 'ir-supp-net-debt', [{ doc: 'ir', path: 'supplement.netDebt.current' }], [], 'cross-document');
    row(set(h, 'ir.statements.0.claims.0.direction', 'down'), 'claims-direction', [{ doc: 'ir', path: 'statements.0' }], ['H1'], 'cross-document');
    row(set(h, 'ir.statements.2.claims.0.direction', 'down'), 'claims-direction', [{ doc: 'ir', path: 'statements.2' }], ['H2'], 'cross-document');
    row(set(h, 'tanshin.summary.accountingPolicyChange', true), 'accounting-policy-match', [{ doc: 'tanshin', path: 'summary.accountingPolicyChange' }], ['H2'], 'notes');
    row(set(h, 'tanshin.notes.subsequentEvents', '期末後に買収した (300 百万円)。'), 'subsequent-event-match', [{ doc: 'tanshin', path: 'notes.subsequentEvents' }, { doc: 'ir', path: 'outlook.subsequentEvent' }], ['H3'], 'notes');
    row(add(h, 'ir.supplement.cash.current', 100), 'xdoc-supp-cash', [{ doc: 'ir', path: 'supplement.cash.current' }], ['H3'], 'cross-document');
    row(add(h, 'ir.supplement.cash.previous', 100), 'xdoc-supp-cash', [{ doc: 'ir', path: 'supplement.cash.previous' }], [], 'cross-document');
  });
  it('V15: IR のセグメントが 1 つ欠ける (xdoc-seg-names) → H3 だけ。places は入れ物でも名前のセルでもよい', () => {
    const h = hard();
    const p = set(h, 'ir.segments.items', h.ir.segments.items.slice(0, 1));
    const kind = k('k', ['xdoc-seg-names'], 'cross-document');
    expect(visible(anomalous(p, kind, [{ doc: 'ir', path: 'segments.items' }]), kind)).toEqual(['H3']);
    expect(visible(anomalous(p, kind, [{ doc: 'tanshin', path: 'notes.segments.current.segments.1.name' }]), kind)).toEqual(['H3']);
  });
  it('V16: places が二次の症状 (カードの外) を含むと、どの形でも見えない', () => {
    const kind = k('k', ['link-cf-receivables']);
    const p = add(hard(), 'tanshin.cashFlow.receivablesChange', 50);
    expect(visible(anomalous(p, kind, [{ doc: 'tanshin', path: 'cashFlow.receivablesChange' }, { doc: 'tanshin', path: 'cashFlow.cashEnding' }]), kind)).toEqual([]);
  });
  it('V17: places がどの違反にも触れない・場所が実在しない → 空', () => {
    const kind = k('k', ['ratio-operating-margin']);
    expect(visible(anomalous(set(easy(), 'tanshin.summary.operatingMargin', 20), kind, [{ doc: 'tanshin', path: 'incomeStatement.current.grossProfit' }]), kind)).toEqual([]);
  });
  it('V18〜V18d: cardEdits はテンプレートのカードで見る。編集の shape だけで見える', () => {
    const drop = k('k', ['card-slots'], 'card-form');
    const withEdit = (edit: NonNullable<Problem['cardEdits']>[number], places: NonNullable<Problem['anomaly']>['places'], kind = drop) =>
      anomalous({ ...easy(), cardEdits: [edit] }, kind, places);
    expect(visible(withEdit({ shape: 'E1', card: 0, slot: 'margin', op: 'drop' }, [{ doc: 'card', shape: 'E1', card: 0, slot: 'margin' }]), drop)).toEqual(['E1']);
    expect(visible(withEdit({ shape: 'E2', card: 0, slot: 'margin', op: 'drop' }, [{ doc: 'card', shape: 'E2', card: 0, slot: 'margin' }]), drop)).toEqual([]);
    expect(visible(withEdit({ shape: 'E1', card: 0, op: 'swap', slots: ['netSales', 'margin'] }, [{ doc: 'card', shape: 'E1', card: 0, slot: 'netSales' }, { doc: 'card', shape: 'E1', card: 0, slot: 'margin' }]), drop)).toEqual(['E1']);
    const unit = k('k', ['card-unit'], 'card-form');
    expect(visible(withEdit({ shape: 'E1', card: 0, slot: 'netSales', op: 'unit', unit: '億円' }, [{ doc: 'card', shape: 'E1', card: 0, slot: 'netSales' }], unit), unit)).toEqual(['E1']);
    // 場所の shape が枠の形と違えば V1 が落ちる
    expect(visible(withEdit({ shape: 'E1', card: 0, slot: 'margin', op: 'drop' }, [{ doc: 'card', shape: 'E2', card: 0, slot: 'margin' }]), drop)).toEqual([]);
  });
  it('V18d: card-period (incomeStatement の列) → E1・E2。E3 は balanceSheet の列なので見えない', () => {
    const kind = k('k', ['card-period'], 'appearance');
    const p = set(easy(), 'tanshin.columnDates.incomeStatement.current', '2028-03-31');
    const places = [{ doc: 'tanshin' as const, path: 'columnDates.incomeStatement.current' }];
    expect(visible(anomalous(p, kind, places), kind)).toEqual(['E1', 'E2']);
  });
  it('V20: 種類が一覧に無い → 空', () => {
    const p = anomalous(set(easy(), 'tanshin.summary.operatingMargin', 20), k('x', ['ratio-operating-margin']), [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(visibleShapes(p, companyA(), [])).toEqual([]);
  });
  it('shapeAnomaly の 6 形は、それぞれその形だけで見える (S5〜S8 のテストの土台)', () => {
    for (const shape of ['E1', 'E2', 'E3', 'H1', 'H2', 'H3'] as const) {
      const { problem, kind } = shapeAnomaly(shape, `x-${shape}`, 'fixture-c01');
      expect(visibleShapes(problem, companyA(), [kind]), shape).toEqual([shape]);
    }
  });
});

// 規則の ID の一覧 (hard)。anomalous() が期待集合を作るために使う。
import { verifyProblem } from './index.ts';
function verifyProblemRules(p: Problem): string[] {
  return verifyProblem(p, companyA()).hard.map((v) => v.rule);
}

describe('9.3 二重の食い違い doubleDiscrepancies (X1〜X4)', () => {
  const kind = kindOf('k-op', 'calculation', ['ratio-operating-margin'], []);
  const withAnomaly = (p: Problem, places: NonNullable<Problem['anomaly']>['places']): Problem => {
    const actual = [...new Set(verifyProblem(p, companyA()).hard.map((v) => v.rule))].sort();
    return set(p, 'anomaly', { kind: kind.id, places, explanation: '説明', expectedRules: actual });
  };
  it('X1: 営業利益 当期を 10 倍 (向きは同じ) → E1 は空', () => {
    const p = withAnomaly(set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 12400), [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(visibleShapes(p, companyA(), [kind])).toEqual(['E1']);
    expect(doubleDiscrepancies(p, companyA(), [kind])).toEqual([]);
  });
  it('X2: 営業利益を 1/10 (向きが逆になる) → E1 に claims-direction も収まる', () => {
    const p = withAnomaly(set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 124), [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(doubleDiscrepancies(p, companyA(), [kind])).toEqual([{ shape: 'E1', rules: ['claims-direction'] }]);
  });
  it('X3・X4: 正常な問題・見える形が無い問題は空', () => {
    expect(doubleDiscrepancies(easy(), companyA(), [kind])).toEqual([]);
    const hidden = withAnomaly(add(easy(), 'tanshin.summary.ordinaryIncome.changeRate', 2), [{ doc: 'tanshin', path: 'summary.ordinaryIncome.changeRate' }]);
    expect(doubleDiscrepancies(hidden, companyA(), [kind])).toEqual([]);
  });
});

describe('8 道具なしで気づける最小のずれ deviationIssues (M1〜M8)', () => {
  const kindIs = (id: string): Problem['anomaly'] => ({ kind: id, places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [] });
  const make = (id: string, p: Problem): Problem => set(p, 'anomaly', kindIs(id));
  const dev = (p: Problem, c: Company = companyA()) => deviationIssues(p, c);

  it('M1: E-09 は総資産の 10% 以上。総資産は元のまま、流動資産の小計をずらす', () => {
    const base = (ca: number) => {
      let p = set(easy(), 'tanshin.balanceSheet.current.totalAssets', 58080);
      p = set(p, 'tanshin.balanceSheet.current.totalFixedAssets', 14720);
      return make('E-09', set(p, 'tanshin.balanceSheet.current.totalCurrentAssets', ca));
    };
    // 流動資産合計 + 固定資産合計 = ca + 14,720
    expect(dev(base(63900 - 14720))).toEqual([]);
    expect(dev(base(63888 - 14720))).toEqual([]); // 差 5,808 ちょうど
    expect(dev(base(63800 - 14720))).toHaveLength(1);
    expect(dev(base(52200 - 14720))).toEqual([]);
    expect(dev(base(52272 - 14720))).toEqual([]);
    expect(dev(base(52300 - 14720))).toHaveLength(1);
  });
  it('M2: E-12 は正確な値 c の 2 倍以上か 1/2 以下 (売上高 96,930・営業利益 4,920)', () => {
    let p = set(easy(), 'tanshin.incomeStatement.current.netSales', 96930);
    p = set(p, 'tanshin.incomeStatement.current.operatingIncome', 4920);
    const at = (m: number) => dev(make('E-12', set(p, 'tanshin.summary.operatingMargin', m)));
    expect(at(10.2)).toEqual([]);
    expect(at(2.5)).toEqual([]);
    expect(at(10.1)).toHaveLength(1);
    expect(at(2.6)).toHaveLength(1);
    expect(at(5.1)).toHaveLength(1);
  });
  it('M3: E-06 は棒の比 1.5 以上 (s = 906.6・l = 969.3)', () => {
    let p = set(easy(), 'ir.results.chart.netSales.previous', 906.6);
    p = set(p, 'ir.results.chart.netSales.current', 969.3);
    const at = (a: number) => dev(make('E-06', set(p, 'ir.results.chart.netSales.axisMin', a)));
    expect(at(782)).toEqual([]);
    expect(at(781)).toHaveLength(1);
    expect(at(906.6)).toHaveLength(1); // a ≥ s: 棒が見えない
    expect(at(0)).toHaveLength(1);
  });
  it('M4: E-07 は数字の大きい側の棒が小さい側の棒の 2/3 以下', () => {
    let p = set(easy(), 'ir.results.netSales.previous', 906.6);
    p = set(p, 'ir.results.netSales.current', 969.3);
    p = set(p, 'ir.results.chart.netSales.previous', 906.6);
    const at = (cur: number, prev = 906.6, q = p) => dev(make('E-07', set(set(q, 'ir.results.chart.netSales.current', cur), 'ir.results.chart.netSales.previous', prev)));
    expect(at(604.0)).toEqual([]);
    expect(at(605.0)).toHaveLength(1);
    expect(at(906.6, 969.3)).toHaveLength(1); // 入れ替えただけ
    // 減収の期 (数字 969.3 → 906.6) で前期の棒を下げる
    let d = set(easy(), 'ir.results.netSales.previous', 969.3);
    d = set(d, 'ir.results.netSales.current', 906.6);
    expect(at(906.6, 604.0, d)).toEqual([]);
    // 数字が等しい
    let eq = set(easy(), 'ir.results.netSales.previous', 906.6);
    eq = set(eq, 'ir.results.netSales.current', 906.6);
    expect(at(604.0, 906.6, eq)).toHaveLength(1);
  });
  it('M5: H-05 は符号逆か 20% 以上 (前期末 2,900・当期末 3,000)', () => {
    const at = (x: number, prev = 2900, cur = 3000) => dev(make('H-05', set(set(set(hard(), 'tanshin.cashFlow.receivablesChange', x), 'tanshin.balanceSheet.previous.receivables', prev), 'tanshin.balanceSheet.current.receivables', cur)));
    expect(at(100)).toEqual([]);
    expect(at(-80)).toEqual([]);
    expect(at(-120)).toEqual([]);
    expect(at(-81)).toHaveLength(1);
    expect(at(-100)).toHaveLength(1);
    expect(at(10, 2900, 2900)).toHaveLength(1); // t = 0
  });
  it('M6: H-20 は 20% 以上 (B の前期 有利子負債 48.3・現金 21.0 → 27.3)', () => {
    const b = hard(normalB());
    const at = (n: number) => dev(make('H-20', set(b, 'ir.supplement.netDebt.previous', n)), companyB());
    expect(at(33.0)).toEqual([]);
    expect(at(32.0)).toHaveLength(1);
    expect(at(27.3)).toHaveLength(1); // ずれ無し
    const zero = set(set(b, 'ir.supplement.interestBearingDebt.previous', 21.0), 'ir.supplement.netDebt.previous', 5);
    expect(dev(make('H-20', zero), companyB())).toHaveLength(1); // t = 0
  });
  it('M7: 検査の無い種類・正常な問題は空', () => {
    expect(dev(make('E-02', easy()))).toEqual([]);
    expect(dev(make('H-17', hard()))).toEqual([]);
    expect(dev(easy())).toEqual([]);
    for (const p of problems.filter((q) => q.anomaly === null)) expect(dev(p, companies.find((c) => c.id === p.companyId) as Company)).toEqual([]);
  });
  it('M8: メッセージに種類・実際のずれ・最小のずれ', () => {
    const [m] = dev(make('H-05', set(hard(), 'tanshin.cashFlow.receivablesChange', -81)));
    expect(m).toContain('H-05');
    expect(m).toContain('20%');
  });
  it('clone を使って元を壊さない', () => {
    const p = easy();
    const before = clone(p);
    dev(make('E-12', p));
    expect(p).toEqual(before);
  });
});
