// ケース表 docs/test-cases/cards.md §3 (K1〜K9): 形のずれの規則 (card-*)・xdoc-seg-names・型・anomalyIssues。§9.1 (A1〜A6)。
import { describe, expect, it } from 'vitest';
import { companies, problems } from '../data/pool-source.ts';
import { shapesOf } from '../domain/cards.ts';
import type { CardEdit, Company, Problem } from '../domain/types.ts';
import { checkAnomaly, shapeErrors, verifyProblem } from './index.ts';
import { HARD_RULE_IDS } from './rules/index.ts';
import { add, companyA, companyB, kindOf, normalA, normalB, onlyRule, set } from './test-utils.ts';

const edit = (p: Problem, e: CardEdit): Problem => ({ ...p, cardEdits: [e] });
const run = (id: string, p: Problem, c: Company = companyA()) => onlyRule(id, p, c);
const hard = (p: Problem = normalA()): Problem => ({ ...p, difficulty: 'hard' });
const NEW_RULES = ['card-slots', 'card-unit', 'card-format', 'card-headline', 'card-period', 'xdoc-seg-names'];

describe('規則の登録', () => {
  it('新しい規則 6 つが HARD_RULE_IDS にある', () => {
    for (const id of NEW_RULES) expect(HARD_RULE_IDS).toContain(id);
  });
});

describe('K1 card-slots', () => {
  it.each<[string, CardEdit, string[]]>([
    ['drop', { shape: 'E1', card: 0, slot: 'margin', op: 'drop' }, ['card.E1.0.margin']],
    ['dup', { shape: 'E1', card: 0, slot: 'margin', op: 'dup' }, ['card.E1.0.margin']],
    ['swap', { shape: 'E1', card: 0, op: 'swap', slots: ['netSales', 'margin'] }, ['card.E1.0.margin', 'card.E1.0.netSales']],
  ])('%s → 違反 1 件', (_name, e, paths) => {
    const v = run('card-slots', edit(normalA(), e));
    expect(v).toHaveLength(1);
    expect([...(v[0]?.paths ?? [])].sort()).toEqual(paths);
  });
  it('編集なし・format・unit・headline の編集 → 満たす', () => {
    expect(run('card-slots', normalA())).toEqual([]);
    for (const e of [
      { shape: 'E1', card: 0, slot: 'netSales', op: 'format', style: 'no-comma' },
      { shape: 'E1', card: 0, slot: 'netSales', op: 'unit', unit: '億円' },
      { shape: 'E1', card: 0, op: 'headline', word: '増収' },
    ] as CardEdit[]) expect(run('card-slots', edit(normalA(), e))).toEqual([]);
  });
  it('むずかしい: IR 型 (card 1) の欄の drop', () => {
    const v = run('card-slots', edit(hard(), { shape: 'H3', card: 1, slot: 'cashCur', op: 'drop' }));
    expect(v.map((x) => x.paths)).toEqual([['card.H3.1.cashCur']]);
  });
  it('不正な編集 (形に無い欄) は例外にならず、違反も出さない (K9 が拾う)', () => {
    expect(run('card-slots', edit(normalA(), { shape: 'E1', card: 0, slot: 'nope', op: 'drop' }))).toEqual([]);
  });
});

describe('K2 card-unit・K3 card-format・K4 card-headline', () => {
  it('K2: unit の編集 → 違反 1 件。正常 (A・B) → 満たす', () => {
    const v = run('card-unit', edit(normalA(), { shape: 'E1', card: 0, slot: 'netSales', op: 'unit', unit: '億円' }));
    expect(v.map((x) => x.paths)).toEqual([['card.E1.0.netSales']]);
    expect(run('card-unit', normalA())).toEqual([]);
    expect(run('card-unit', normalB(), companyB())).toEqual([]);
    expect(run('card-unit', hard(normalB()), companyB())).toEqual([]);
  });
  it('K2: 画面ごとの単位の差し替え (unitOverrides。第 1 版) は card-unit でなく unit-consistency の仕事 → card-unit は満たす', () => {
    const p = { ...normalA(), unitOverrides: { 'tanshin.incomeStatement': '億円' } };
    expect(run('card-unit', p)).toEqual([]);
    expect(run('unit-consistency', p).length).toBeGreaterThan(0);
  });
  it('K3: format の編集 → 違反 1 件。標準の書式 (△100 も) → 満たす', () => {
    for (const style of ['no-comma', 'comma-shift'] as const) {
      const v = run('card-format', edit(normalA(), { shape: 'E1', card: 0, slot: 'netSales', op: 'format', style }));
      expect(v.map((x) => x.paths)).toEqual([['card.E1.0.netSales']]);
    }
    expect(run('card-format', normalA())).toEqual([]);
    expect(run('card-format', hard())).toEqual([]); // △100 を含む
    expect(run('card-format', { ...hard(), signOverrides: { 'tanshin.cashFlow.receivablesChange': '▲' } })).toEqual([]); // 記号は sign-consistency の仕事
  });
  it('K4: headline の編集 → 違反 1 件 (E1 に増収)。E2 に増益も', () => {
    expect(run('card-headline', edit(normalA(), { shape: 'E1', card: 0, op: 'headline', word: '増収' })).map((x) => x.paths)).toEqual([['card.E1.0.headline']]);
    expect(run('card-headline', edit(normalA(), { shape: 'E2', card: 0, op: 'headline', word: '増益' })).map((x) => x.paths)).toEqual([['card.E2.0.headline']]);
    expect(run('card-headline', normalA())).toEqual([]);
    expect(run('card-headline', edit(normalA(), { shape: 'E1', card: 0, op: 'headline', word: '減益' }))).toEqual([]); // 組の中の語は、向きの逆 (claims-direction の仕事)
  });
});

describe('K5 card-period', () => {
  it('incomeStatement の当期の列をずらす → 違反 1 件 (paths = 列見出しと期の表記)。3 画面とも → 3 件。正常 → 満たす', () => {
    const p = set(normalA(), 'tanshin.columnDates.incomeStatement.current', '2028-03-31');
    expect(run('card-period', p).map((x) => x.paths)).toEqual([['tanshin.columnDates.incomeStatement.current', 'tanshin.header.periodLabel']]);
    let all = p;
    for (const s of ['balanceSheet', 'cashFlow']) all = set(all, `tanshin.columnDates.${s}.current`, '2028-03-31');
    expect(run('card-period', all)).toHaveLength(3);
    expect(run('card-period', normalA())).toEqual([]);
    expect(run('card-period', normalB(), companyB())).toEqual([]);
  });
});

describe('K6 xdoc-seg-names', () => {
  const h = () => hard();
  it('IR のセグメントが 1 つ欠ける・並びが違う・綴りが違う → 違反 1 件 (paths = 短信と IR の名前のセル全部)', () => {
    const missing = set(h(), 'ir.segments.items', h().ir.segments.items.slice(0, 1));
    const v = run('xdoc-seg-names', missing);
    expect(v).toHaveLength(1);
    expect(v[0]?.paths).toEqual(expect.arrayContaining(['tanshin.notes.segments.current.segments.0.name', 'tanshin.notes.segments.current.segments.1.name', 'ir.segments.items.0.name']));
    expect(v[0]?.paths.every((x) => x.endsWith('.name'))).toBe(true);
    const items = h().ir.segments.items;
    expect(run('xdoc-seg-names', set(h(), 'ir.segments.items', [items[1], items[0]]))).toHaveLength(1);
    expect(run('xdoc-seg-names', set(h(), 'ir.segments.items.0.name', '電機部品事'))).toHaveLength(1);
  });
  it('正常 (A・B) → 満たす', () => {
    expect(run('xdoc-seg-names', normalA())).toEqual([]);
    expect(run('xdoc-seg-names', normalB(), companyB())).toEqual([]);
  });
});

describe('K7 既存の正常な問題 28 問は、新しい規則 6 つすべてで違反 0 件', () => {
  it('src/data', () => {
    const normals = problems.filter((p) => p.anomaly === null);
    expect(normals).toHaveLength(28);
    for (const p of normals) {
      const c = companies.find((x) => x.id === p.companyId) as Company;
      const v = verifyProblem(p, c).hard.filter((x) => NEW_RULES.includes(x.rule));
      expect(v, p.id).toEqual([]);
    }
  });
  it('既存の異変の問題 (cardEdits なし) でも card-slots・card-format・card-headline は落ちない', () => {
    for (const p of problems.filter((q) => q.anomaly !== null)) {
      const c = companies.find((x) => x.id === p.companyId) as Company;
      const v = verifyProblem(p, c).hard.filter((x) => ['card-slots', 'card-headline', 'card-unit', 'card-format'].includes(x.rule));
      // unitOverrides を持つ問題だけが card-unit を落としてよい
      expect(v.filter((x) => !(p.unitOverrides && x.rule === 'card-unit')), p.id).toEqual([]);
    }
  });
});

describe('K9 anomalyIssues の cardEdits の検査・A1〜A6', () => {
  const kinds = [kindOf('k-slots', 'card-form', ['card-slots']), kindOf('k-op', 'calculation', ['ratio-operating-margin'])];
  const withAnomaly = (p: Problem, kind: string, places: NonNullable<Problem['anomaly']>['places'], extra: Record<string, unknown> = {}): Problem => {
    const actual = [...new Set(verifyProblem(p, companyA()).hard.map((v) => v.rule))].sort();
    return set(p, 'anomaly', { kind, places, explanation: '説明', expectedRules: actual, ...extra });
  };
  const messages = (p: Problem, k = kinds) => checkAnomaly(p, k, verifyProblem(p, companyA()));
  const has = (ms: string[], w: string) => ms.some((m) => m.includes(w));
  const dropOnEasy = (): Problem => withAnomaly(edit(normalA(), { shape: 'E1', card: 0, slot: 'margin', op: 'drop' }), 'k-slots', [{ doc: 'card', shape: 'E1', card: 0, slot: 'margin' }]);

  it('A5: card の場所 (drop) は、card-slots の違反に触れる → 問題なし。難易度の違う family は family-difficulty の指摘だけ', () => {
    const ms = messages(dropOnEasy());
    expect(has(ms, '場所に触れない')).toBe(false);
    expect(has(ms, 'どの違反にも触れない場所')).toBe(false);
    expect(has(ms, '場所が実在しない')).toBe(false);
  });
  it('A5: 形に無い欄・難易度の違う形・範囲外の card・存在しない見出し → 場所が実在しない', () => {
    const bad = (slot: string, shape: 'E1' | 'H1' = 'E1', card = 0) => messages(withAnomaly(edit(normalA(), { shape: 'E1', card: 0, slot: 'margin', op: 'drop' }), 'k-slots', [{ doc: 'card', shape, card, slot }]));
    expect(has(bad('nope'), '場所が実在しない')).toBe(true);
    expect(has(bad('margin', 'H1'), '場所が実在しない')).toBe(true);
    expect(has(bad('margin', 'E1', 3), '場所が実在しない')).toBe(true);
  });
  it('K9: 正常な問題に cardEdits → override-on-normal', () => {
    const p = edit(normalA(), { shape: 'E1', card: 0, slot: 'margin', op: 'drop' });
    expect(has(messages(p), '見た目の差し替え (cardEdits)')).toBe(true);
  });
  it('K9: 異変の問題の cardEdits が 2 件以上・形が難易度の形でない・欄が形に無い・card が範囲外 → anomaly-mismatch', () => {
    const base = dropOnEasy();
    const two = { ...base, cardEdits: [{ shape: 'E1', card: 0, slot: 'margin', op: 'drop' }, { shape: 'E1', card: 0, slot: 'opCur', op: 'drop' }] } as Problem;
    expect(has(messages(two), '編集が 2 件以上')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ shape: 'H1', card: 0, slot: 'salesPrev', op: 'drop' }] } as Problem), '難易度の形でない')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ shape: 'E1', card: 0, slot: 'nope', op: 'drop' }] } as Problem), '形に無い欄')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ shape: 'E1', card: 5, slot: 'margin', op: 'drop' }] } as Problem), 'カード 5')).toBe(true);
  });

  // §9.1: changed の許容集合
  const opX10 = (): Problem => set(normalA(), 'tanshin.incomeStatement.current.operatingIncome', 12400);
  const kindNarrow = kindOf('k-op', 'calculation', ['ratio-operating-margin'], ['ratio-operating-margin']);
  const op = (changed?: string[], places: NonNullable<Problem['anomaly']>['places'] = [{ doc: 'tanshin', path: 'incomeStatement.current.operatingIncome' }]) =>
    withAnomaly(opX10(), 'k-op', places, changed === undefined ? {} : { changed });
  const ms = (p: Problem) => messages(p, [kindNarrow]);

  it('A1: changed を持てば、連鎖して落ちる規則 (許容集合の外) も許される', () => {
    expect(ms(op(['tanshin.incomeStatement.current.operatingIncome']))).toEqual([]);
  });
  it('A2: changed が無い・空なら今のまま (許容集合の外・期待集合が許容集合を越える)', () => {
    for (const p of [op(), op([])]) {
      const m = ms(p);
      expect(has(m, '許容集合の外の規則が落ちている')).toBe(true);
      expect(has(m, '期待集合が許容集合を越えている')).toBe(true);
    }
  });
  it('A3: changed が別のセルなら、変えたセルを読まない規則は許されない', () => {
    expect(has(ms(op(['tanshin.summary.eps'])), '許容集合の外の規則が落ちている')).toBe(true);
  });
  it('A4: 場所に触れない違反は、changed を読むなら許す。読まないなら今のまま出る', () => {
    // places = 営業利益率 (違反 ratio-operating-margin に触れる)。pl-operating-income は営業利益を読むが places に触れない
    const readsChanged = op(['tanshin.incomeStatement.current.operatingIncome'], [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(has(ms(readsChanged), '場所に触れない違反')).toBe(false);
    const other = op(['tanshin.summary.eps'], [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(has(ms(other), '場所に触れない違反')).toBe(true);
  });
  it('A7: 要素の欠け (H-19 型) は changed = 要素のパス。入れ物を読む二次の違反 (seg-count・segment-names・ir-seg-reconcile) も、changed の入れ物なので許される', () => {
    const base = normalB();
    const missing = set({ ...base, difficulty: 'hard' as const }, 'ir.segments.items', base.ir.segments.items.slice(0, 2));
    const actual = [...new Set(verifyProblem(missing, companyB()).hard.map((v) => v.rule))].sort();
    const h19 = kindOf('k-h19', 'cross-document', ['xdoc-seg-names'], ['xdoc-seg-names']);
    const p = set(missing, 'anomaly', { kind: 'k-h19', places: [{ doc: 'tanshin', path: 'notes.segments.current.segments.2.name' }], explanation: 'x', expectedRules: actual, changed: ['ir.segments.items.2'] });
    expect(actual).toEqual(expect.arrayContaining(['seg-count', 'segment-names', 'xdoc-seg-names']));
    expect(checkAnomaly(p, [h19], verifyProblem(p, companyB()))).toEqual([]);
    // changed が無ければ、入れ物を読む違反は場所に触れない
    const noChanged = set(p, 'anomaly.changed', []);
    expect(checkAnomaly(noChanged, [h19], verifyProblem(noChanged, companyB())).some((m) => m.includes('場所に触れない違反'))).toBe(true);
  });
  it('expectedRules = 実際に落ちた集合は changed があっても求める', () => {
    const p = set(op(['tanshin.incomeStatement.current.operatingIncome']), 'anomaly.expectedRules', ['ratio-operating-margin']);
    expect(has(ms(p), '期待集合が実際に落ちた規則と違う')).toBe(true);
  });
});

describe('A6 shapeErrors: card の場所と base・changed', () => {
  const place = (value: unknown) => shapeErrors(set(normalA(), 'anomaly', { kind: 'k', places: [value], explanation: 'x', expectedRules: [] }));
  it('正しい card の場所は誤りなし', () => expect(place({ doc: 'card', shape: 'E1', card: 0, slot: 'margin' })).toEqual([]));
  it.each<[string, unknown]>([
    ['shape が未知', { doc: 'card', shape: 'E9', card: 0, slot: 'margin' }],
    ['card が整数でない', { doc: 'card', shape: 'E1', card: '0', slot: 'margin' }],
    ['slot が無い', { doc: 'card', shape: 'E1', card: 0 }],
    ['path も持つ', { doc: 'card', shape: 'E1', card: 0, slot: 'margin', path: 'x' }],
    ['未知のキー', { doc: 'card', shape: 'E1', card: 0, slot: 'margin', extra: 1 }],
  ])('誤り: %s', (_n, value) => expect(place(value).length).toBeGreaterThan(0));
  it('base・changed (任意)', () => {
    const ok = set(normalA(), 'anomaly', { kind: 'k', places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [], base: 'easy-001', changed: ['tanshin.summary.eps'] });
    expect(shapeErrors(ok)).toEqual([]);
    const bad = set(normalA(), 'anomaly', { kind: 'k', places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [], base: 1, changed: 'x' });
    expect(shapeErrors(bad).length).toBeGreaterThanOrEqual(2);
  });
});
