// A1〜A18 (docs/test-cases/validator.md §2.6): 異変の指定どおりにだけ破れているか。
import { describe, expect, it } from 'vitest';
import type { Anomaly, AnomalyKind, AnomalyPlace, Problem } from '../domain/types.ts';
import { checkAnomaly, verifyProblem } from './index.ts';
import { add, companyA, mutate, normalA, set } from './test-utils.ts';

const kind = (id: string, family: AnomalyKind['family'], primary: string[], allowed = primary): AnomalyKind => ({
  id,
  family,
  name: id,
  primaryRules: primary,
  allowedRules: allowed,
});
const KINDS: AnomalyKind[] = [
  kind('k-rate', 'calculation', ['sum-change-ordinary-income']),
  kind('k-balance', 'accounting', ['bs-balance'], ['bs-total-assets', 'bs-balance', 'sum-total-assets', 'ratio-equity-ratio']),
  kind('k-balance-narrow', 'accounting', ['bs-balance'], ['bs-total-assets', 'bs-balance', 'sum-total-assets']),
  kind('k-company', 'appearance', ['header-company-name']),
  kind('k-typo', 'appearance', ['label-spelling']),
  kind('k-unit', 'appearance', ['unit-consistency']),
];

const v7 = () => add(normalA(), 'tanshin.summary.ordinaryIncome.changeRate', 2);
const v1 = () => set(add(normalA(), 'tanshin.balanceSheet.current.totalAssets', 100), 'difficulty', 'hard'); // accounting はむずかしいの系統
const V1_RULES = ['bs-balance', 'bs-total-assets', 'ratio-equity-ratio', 'sum-total-assets'];

const place = (path: string, doc: 'tanshin' | 'ir' = 'tanshin'): AnomalyPlace => ({ doc, path });
const withAnomaly = (p: Problem, a: Partial<Anomaly> & { kind: string }): Problem =>
  set(p, 'anomaly', { places: [place('summary.ordinaryIncome.changeRate')], explanation: '説明', expectedRules: [], ...a });

const messages = (p: Problem): string[] => checkAnomaly(p, KINDS, verifyProblem(p, companyA()));
const has = (ms: string[], word: string) => ms.some((m) => m.includes(word));

describe('checkAnomaly', () => {
  it('A1: 指定どおりなら 0 件', () => {
    const p = withAnomaly(v7(), { kind: 'k-rate', expectedRules: ['sum-change-ordinary-income'] });
    expect(messages(p)).toEqual([]);
  });

  it('A2: 期待集合が実際と違う', () => {
    const p = withAnomaly(v7(), { kind: 'k-rate', expectedRules: ['sum-change-net-sales'] });
    expect(has(messages(p), '期待集合が実際に落ちた規則と違う')).toBe(true);
  });

  it('A3: 種類の主な規則のどれも落ちていない', () => {
    const p = withAnomaly(v7(), { kind: 'k-balance', expectedRules: ['sum-change-ordinary-income'] });
    expect(has(messages(p), '主な規則のどれも落ちていない')).toBe(true);
  });

  it('A4: 許容集合の外の規則が落ちている', () => {
    const p = withAnomaly(v1(), { kind: 'k-balance-narrow', expectedRules: V1_RULES, places: [place('balanceSheet.current.totalAssets')] });
    expect(has(messages(p), '許容集合の外')).toBe(true);
  });

  it('A5: 期待集合が許容集合を越えている', () => {
    const p = withAnomaly(v1(), { kind: 'k-balance', expectedRules: [...V1_RULES, 'link-cf-start'], places: [place('balanceSheet.current.totalAssets')] });
    const ms = messages(p);
    expect(has(ms, '期待集合が許容集合を越えている')).toBe(true);
    expect(has(ms, '期待集合が実際に落ちた規則と違う')).toBe(true);
  });

  it('A6: 場所が違反に触れていれば 0 件', () => {
    const p = withAnomaly(v1(), { kind: 'k-balance', expectedRules: V1_RULES, places: [place('balanceSheet.current.totalAssets')] });
    expect(messages(p)).toEqual([]);
  });

  it('A7: 違反に関わらないセルを指すと、場所と違反の両方を指摘する', () => {
    const p = withAnomaly(v1(), { kind: 'k-balance', expectedRules: V1_RULES, places: [place('balanceSheet.current.cash')] });
    const ms = messages(p);
    expect(has(ms, 'どの違反にも触れない場所')).toBe(true);
    expect(has(ms, '場所に触れない違反')).toBe(true);
  });

  it('A8: 場所を 2 つ (うち 1 つが無関係) にすると、違反に触れない場所だけを指摘', () => {
    const p = withAnomaly(v1(), { kind: 'k-balance', expectedRules: V1_RULES, places: [place('balanceSheet.current.totalAssets'), place('balanceSheet.current.cash')] });
    const ms = messages(p);
    expect(has(ms, 'どの違反にも触れない場所')).toBe(true);
    expect(has(ms, '場所に触れない違反')).toBe(false);
  });

  it('A9: 存在しない場所', () => {
    const p = withAnomaly(v7(), { kind: 'k-rate', expectedRules: ['sum-change-ordinary-income'], places: [place('summary.nothing')] });
    expect(has(messages(p), '場所が実在しない')).toBe(true);
  });

  it('A10: IR の社名の誤植 (場所は IR の見出し)', () => {
    const p = withAnomaly(set(normalA(), 'ir.header.companyName', '第七試作電機株式会杜'), {
      kind: 'k-company',
      expectedRules: ['header-company-name'],
      places: [place('header.companyName', 'ir')],
    });
    expect(messages(p)).toEqual([]);
  });

  it('A11: 式が破れていないのに異変を付けると、期待集合が実際 (なし) と違う', () => {
    const p = withAnomaly(normalA(), { kind: 'k-rate', expectedRules: ['sum-change-ordinary-income'] });
    expect(has(messages(p), '期待集合が実際に落ちた規則')).toBe(true);
  });

  it('A12: 項目名の誤字の場所は itemKey で指す', () => {
    const p0 = set(normalA(), 'labelOverrides', { 'tanshin.incomeStatement.operatingIncome': '営業利金' });
    const p = withAnomaly(p0, {
      kind: 'k-typo',
      expectedRules: ['label-spelling'],
      places: [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }],
    });
    expect(messages(p)).toEqual([]);
  });

  it('A13: labels に無い項目キー', () => {
    const p0 = set(normalA(), 'labelOverrides', { 'tanshin.incomeStatement.operatingIncome': '営業利金' });
    const p = withAnomaly(p0, {
      kind: 'k-typo',
      expectedRules: ['label-spelling'],
      places: [{ doc: 'tanshin', itemKey: 'tanshin.nothing.nothing' }],
    });
    const ms = messages(p);
    expect(has(ms, '項目キーが labels に無い')).toBe(true);
    expect(has(ms, '場所に触れない違反')).toBe(true);
  });

  it('A14: 画面の単位の場所 (<画面>.unit) は実在する', () => {
    const p0 = set(normalA(), 'unitOverrides', { 'tanshin.balanceSheet': '千円' });
    const p = withAnomaly(p0, { kind: 'k-unit', expectedRules: ['unit-consistency'], places: [place('balanceSheet.unit')] });
    expect(messages(p)).toEqual([]);
  });

  it('A15: 答え合わせの文言が空', () => {
    const p = withAnomaly(v7(), { kind: 'k-rate', expectedRules: ['sum-change-ordinary-income'], explanation: '' });
    expect(has(messages(p), '答え合わせの文言が空')).toBe(true);
  });

  it('A16: 正常な問題に見た目の差し替え (3 通り)', () => {
    for (const key of ['labelOverrides', 'unitOverrides', 'signOverrides']) {
      const p = set(normalA(), key, { 'tanshin.balanceSheet.cash': '現金' });
      expect(has(messages(p), '正常な問題に見た目の差し替え'), key).toBe(true);
    }
  });

  it('A17: 異変の種類が一覧に無い', () => {
    const p = withAnomaly(v7(), { kind: 'k-unknown', expectedRules: ['sum-change-ordinary-income'] });
    expect(has(messages(p), '異変の種類が一覧に無い')).toBe(true);
  });

  it('A18: 系統と難易度が合わない (calculation はやさしいの系統)', () => {
    const p = withAnomaly(mutate(v7(), 'difficulty', () => 'hard'), { kind: 'k-rate', expectedRules: ['sum-change-ordinary-income'] });
    expect(has(messages(p), '系統と難易度が合わない')).toBe(true);
  });

  // ---- #48 レビュー 1 回目の B1・B2: 場所の検査の穴 (赤から) ----
  describe('場所は、変えたセルを正確に指す', () => {
    const v1Hard = (places: AnomalyPlace[]) => withAnomaly(v1(), { kind: 'k-balance', expectedRules: V1_RULES, places });

    it('A19: 画面全体 (balanceSheet) を指す場所は通らない', () => {
      const ms = messages(v1Hard([place('balanceSheet')]));
      expect(has(ms, '値でなくまとまりを指している')).toBe(true);
      expect(has(ms, '場所に触れない違反')).toBe(true);
    });

    it('A20: 期のまとまり (balanceSheet.current) を指す場所は通らない', () => {
      const ms = messages(v1Hard([place('balanceSheet.current')]));
      expect(has(ms, '値でなくまとまりを指している')).toBe(true);
    });

    it('A21: 前期を変えたのに、場所を当期にすると通らない (変えていないセルが強調されるため)', () => {
      const p = withAnomaly(add(normalA(), 'tanshin.summary.netSales.previous', 100), {
        kind: 'k-sales',
        expectedRules: ['sum-net-sales', 'sum-change-net-sales'],
        places: [place('summary.netSales.current')],
      });
      const result = verifyProblem(p, companyA());
      const ms = checkAnomaly(p, [...KINDS, kind('k-sales', 'calculation', ['sum-net-sales'], ['sum-net-sales', 'sum-change-net-sales'])], result);
      expect(has(ms, '場所に触れない違反')).toBe(true);
      // 場所を前期にすれば通る
      const ok = withAnomaly(p, { kind: 'k-sales', expectedRules: ['sum-net-sales', 'sum-change-net-sales'], places: [place('summary.netSales.previous')] });
      expect(checkAnomaly(ok, [...KINDS, kind('k-sales', 'calculation', ['sum-net-sales'], ['sum-net-sales', 'sum-change-net-sales'])], verifyProblem(ok, companyA()))).toEqual([]);
    });

    it('A22: signOverrides のキーが正の数のセルを指す', () => {
      const p = withAnomaly(set(normalA(), 'signOverrides', { 'tanshin.balanceSheet.current.cash': '-' }), { kind: 'k-sign', expectedRules: ['sign-consistency'], places: [place('balanceSheet.current.cash')] });
      const ms = checkAnomaly(p, [...KINDS, kind('k-sign', 'appearance', ['sign-consistency'])], verifyProblem(p, companyA()));
      expect(has(ms, '負の数のセルを指していない')).toBe(true);
    });

    it('A23: signOverrides のキーが画面全体を指す', () => {
      const p = withAnomaly(set(normalA(), 'signOverrides', { 'tanshin.cashFlow': '-' }), { kind: 'k-sign', expectedRules: ['sign-consistency'], places: [place('cashFlow')] });
      const ms = checkAnomaly(p, [...KINDS, kind('k-sign', 'appearance', ['sign-consistency'])], verifyProblem(p, companyA()));
      expect(has(ms, '負の数のセルを指していない')).toBe(true);
    });

    it('A24: signOverrides が負の数のセルを指していれば通る / unitOverrides のキーが画面でない', () => {
      const good = withAnomaly(set(normalA(), 'signOverrides', { 'tanshin.cashFlow.capex': '-' }), { kind: 'k-sign', expectedRules: ['sign-consistency'], places: [place('cashFlow.capex')] });
      expect(checkAnomaly(good, [...KINDS, kind('k-sign', 'appearance', ['sign-consistency'])], verifyProblem(good, companyA()))).toEqual([]);
      const bad = withAnomaly(set(normalA(), 'unitOverrides', { 'tanshin.cashFlow.capex': '千円' }), { kind: 'k-unit', expectedRules: ['unit-consistency'], places: [place('balanceSheet.unit')] });
      expect(has(messages(bad), '画面を指していない')).toBe(true);
    });
  });
});
