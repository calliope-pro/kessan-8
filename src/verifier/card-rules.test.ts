// ケース表 docs/test-cases/cards.md §4 (K1〜K15)・§8 (SE)・§12 (A1〜A7): 形のずれの規則 (card-*)・xdoc-seg-names・型・anomalyIssues (Sub-task #180)。
import { describe, expect, it } from 'vitest';
import { companies, problems } from '../data/pool-source.ts';
import { ANOMALY_FAMILIES, FAMILY_DIFFICULTY } from '../domain/types.ts';
import type { CardEdit, Company, Problem } from '../domain/types.ts';
import { checkAnomaly, verifyProblem } from './index.ts';
import { HARD_RULE_IDS } from './rules/index.ts';
import { companyA, companyB, kindOf, normalA, normalB, onlyRule, set } from './test-utils.ts';

const edit = (p: Problem, e: CardEdit): Problem => ({ ...p, cardEdits: [e] });
const run = (id: string, p: Problem, c: Company = companyB()) => onlyRule(id, p, c);
const easy = (): Problem => normalB();
const hard = (): Problem => ({ ...normalB(), difficulty: 'hard' });
const paths = (v: { paths: string[] }[]) => v.map((x) => x.paths);
const NEW_RULES = ['card-slots', 'card-unit', 'card-format', 'card-headline', 'card-period', 'card-sign', 'card-column-suffix', 'card-digits', 'card-date-valid', 'xdoc-seg-names'];
/** 表示だけを変える 9 つの編集 (どれか 1 つの規則だけが落ちる。K1〜K10)。 */
const EDITS: Record<string, CardEdit> = {
  drop: { card: 0, slot: 'margin', op: 'drop' },
  format: { card: 0, slot: 'sales', op: 'format', style: 'no-comma' },
  unit: { card: 0, slot: 'sales', op: 'unit', unit: '億円' },
  dup: { card: 0, slot: 'opCurr', op: 'dup' },
  suffix: { card: 0, slot: 'opPrev', op: 'suffix', word: '当期' },
  glyph: { card: 0, slot: 'opCurr', op: 'glyph', at: 2 },
  sign: { card: 0, slot: 'sales', op: 'sign' },
  day: { card: 0, slot: 'period', op: 'day', day: 32 },
  headline: { card: 0, op: 'headline', word: '増収' },
};
/** 編集 → 落ちる規則 (1 つだけ) */
const OWNER: Record<string, string> = { drop: 'card-slots', dup: 'card-slots', format: 'card-format', unit: 'card-unit', suffix: 'card-column-suffix', glyph: 'card-digits', sign: 'card-sign', day: 'card-date-valid', headline: 'card-headline' };

describe('規則の登録・系統', () => {
  it('新しい規則 10 個が HARD_RULE_IDS にある', () => {
    for (const id of NEW_RULES) expect(HARD_RULE_IDS).toContain(id);
  });
  it('K15: card-form は hard の系統', () => {
    expect(ANOMALY_FAMILIES).toContain('card-form');
    expect(FAMILY_DIFFICULTY['card-form']).toBe('hard');
  });
  it('表示だけを変える 9 つの編集は、それぞれ決まった 1 つの規則だけを落とす (二重の食い違いにならない)', () => {
    for (const [name, e] of Object.entries(EDITS)) {
      const failed = NEW_RULES.filter((id) => run(id, edit(easy(), e)).length > 0);
      expect(failed, name).toEqual([OWNER[name]]);
    }
  });
});

describe('K1 card-slots', () => {
  it('drop・dup (欄・見出し語) → 違反 1 件。それ以外の編集・編集なし → 満たす', () => {
    expect(paths(run('card-slots', edit(easy(), EDITS.drop!)))).toEqual([['card.0.margin']]);
    expect(paths(run('card-slots', edit(easy(), EDITS.dup!)))).toEqual([['card.0.opCurr']]);
    expect(paths(run('card-slots', edit(easy(), { card: 0, slot: 'headline', op: 'dup' })))).toEqual([['card.0.headline']]);
    expect(run('card-slots', easy())).toEqual([]);
    for (const k of ['format', 'unit', 'suffix', 'glyph', 'sign', 'day', 'headline']) expect(run('card-slots', edit(easy(), EDITS[k]!)), k).toEqual([]);
  });
  it('むずかしい: 資料の欄・足元の drop', () => {
    expect(paths(run('card-slots', edit(hard(), { card: 0, slot: 'irSales', op: 'drop' })))).toEqual([['card.0.irSales']]);
    expect(paths(run('card-slots', edit(hard(), { card: 0, slot: 'period', op: 'drop' })))).toEqual([['card.0.period']]);
    expect(paths(run('card-slots', edit(hard(), { card: 0, slot: 'audit', op: 'dup' })))).toEqual([['card.0.audit']]);
  });
  it('不正な編集 (形に無い欄) は例外にならず、違反も出さない (K14・card-edit-op が拾う)', () => {
    expect(run('card-slots', edit(easy(), { card: 0, slot: 'nope', op: 'drop' }))).toEqual([]);
  });
});

describe('K2 card-unit・K3 card-format・K4 card-headline', () => {
  it('K2: unit の編集 → 違反 1 件 (短信・IR)。正常・IR が百万円の A → 満たす', () => {
    expect(paths(run('card-unit', edit(easy(), EDITS.unit!)))).toEqual([['card.0.sales']]);
    expect(paths(run('card-unit', edit(hard(), { card: 0, slot: 'irSales', op: 'unit', unit: '百万円' })))).toEqual([['card.0.irSales']]);
    expect(run('card-unit', easy())).toEqual([]);
    expect(run('card-unit', hard())).toEqual([]);
    expect(run('card-unit', { ...normalA(), difficulty: 'hard' }, companyA())).toEqual([]); // IR が百万円でも規則は落とさない (card-ir-unit がデータの検査)
  });
  it('K2: unitOverrides (第 1 版の画面ごとの単位の差し替え) は card-unit でなく unit-consistency の仕事', () => {
    const p = { ...easy(), unitOverrides: { 'tanshin.incomeStatement': '億円' } };
    expect(run('card-unit', p)).toEqual([]);
    expect(run('unit-consistency', p).length).toBeGreaterThan(0);
  });
  it('K3: format の編集 → 違反 1 件。標準の書式 (△100・10.0・IR 124.0) → 満たす。sign・glyph の見え方は別の規則の仕事', () => {
    for (const style of ['no-comma', 'comma-shift'] as const) expect(paths(run('card-format', edit(easy(), { card: 0, slot: 'sales', op: 'format', style }))), style).toEqual([['card.0.sales']]);
    expect(run('card-format', easy())).toEqual([]);
    expect(run('card-format', hard())).toEqual([]);
    expect(run('card-format', edit(easy(), EDITS.sign!))).toEqual([]);
    expect(run('card-format', edit(easy(), EDITS.glyph!))).toEqual([]);
    expect(run('card-format', { ...hard(), signOverrides: { 'tanshin.cashFlow.receivablesChange': '▲' } })).toEqual([]);
  });
  it('K4: 見出し語の組は 増益・減益 だけ', () => {
    expect(paths(run('card-headline', edit(easy(), EDITS.headline!)))).toEqual([['card.0.headline']]);
    expect(run('card-headline', easy())).toEqual([]);
    expect(run('card-headline', edit(easy(), { card: 0, op: 'headline', word: '減益' }))).toEqual([]); // 組の中の語は、向きの逆 (R-dir・claims-direction の仕事)
  });
});

describe('K5 card-period・K10 card-date-valid', () => {
  const at = (iso: string, label?: string): Problem => {
    const p = set(easy(), 'tanshin.columnDates.incomeStatement.current', iso);
    return label === undefined ? p : set(p, 'tanshin.header.periodLabel', label);
  };
  it('K5: 足元の期末日が期の月末日と合わない → 違反 1 件 (paths = 期末日と期の表記)。正常 → 満たす', () => {
    expect(paths(run('card-period', at('2028-03-31')))).toEqual([['tanshin.columnDates.incomeStatement.current', 'tanshin.header.periodLabel']]);
    expect(run('card-period', easy())).toEqual([]);
    expect(run('card-period', { ...normalA() }, companyA())).toEqual([]);
  });
  it('K5: 3 画面でなく incomeStatement の当期だけを見る', () => {
    expect(run('card-period', set(easy(), 'tanshin.columnDates.balanceSheet.current', '2028-03-31'))).toEqual([]);
    expect(run('card-period', set(easy(), 'tanshin.columnDates.cashFlow.current', '2028-03-31'))).toEqual([]);
  });
  it('K5: 2 月決算と閏日 (E-04 の作り方: 年をずらしたあとの月末日)', () => {
    expect(run('card-period', at('2025-02-28', '2025年2月期'))).toEqual([]);
    expect(run('card-period', at('2024-02-29', '2024年2月期'))).toEqual([]);
    expect(run('card-period', at('2024-02-28', '2024年2月期')).length).toBe(1);
    expect(run('card-period', at('2025-02-28', '2024年2月期')).length).toBe(1); // 2024-02-29 → 1 年ずらして 2025-02-28 (E-04)
    expect(run('card-period', at('2024-03-31', '決算期')).length).toBe(1); // 期の表記が読めない
  });
  it('K10: day の編集 (日 32) → 違反 1 件。実在する日 (2024年2月29日・2025年2月28日) → 満たす。2025年2月29日 → 違反', () => {
    expect(paths(run('card-date-valid', edit(easy(), EDITS.day!)))).toEqual([['card.0.period']]);
    expect(run('card-date-valid', easy())).toEqual([]);
    expect(run('card-date-valid', at('2024-02-29', '2024年2月期'))).toEqual([]);
    expect(run('card-date-valid', at('2025-02-28', '2025年2月期'))).toEqual([]);
    expect(run('card-date-valid', at('2025-02-29', '2025年2月期')).length).toBe(1);
    // 足元のセルは正しいまま、表示だけが 32 になる (card-period は落ちない)
    expect(run('card-period', edit(easy(), EDITS.day!))).toEqual([]);
    expect(run('card-date-valid', edit(hard(), { card: 0, slot: 'period', op: 'drop' }))).toEqual([]); // 足元が無い → card-slots の仕事
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
    expect(run('xdoc-seg-names', normalA(), companyA())).toEqual([]);
    expect(run('xdoc-seg-names', normalB())).toEqual([]);
  });
});

describe('K7 card-sign・K8 card-column-suffix・K9 card-digits', () => {
  it('K7: sign の編集 (売上高・総資産) → 違反 1 件。正常・対象外の欄の負・値 0 → 満たす', () => {
    expect(paths(run('card-sign', edit(easy(), EDITS.sign!)))).toEqual([['card.0.sales']]);
    expect(paths(run('card-sign', edit(hard(), { card: 0, slot: 'ta', op: 'sign' })))).toEqual([['card.0.ta']]);
    expect(run('card-sign', easy())).toEqual([]);
    expect(run('card-sign', hard())).toEqual([]); // cfAr の △100 は正常 (対象外)
    expect(run('card-sign', set(hard(), 'tanshin.incomeStatement.current.operatingIncome', -5))).toEqual([]); // 営業利益は対象外
    expect(run('card-sign', set(hard(), 'ir.supplement.netDebt.previous', -5))).toEqual([]); // 純有利子負債は対象外
    expect(run('card-sign', set(hard(), 'ir.supplement.interestBearingDebt.previous', 0))).toEqual([]); // 値 0 は落とさない
  });
  it('K7: 値が負の対象の欄は、導出した表示に △ が付くので落ちる', () => {
    expect(paths(run('card-sign', set(easy(), 'tanshin.incomeStatement.current.netSales', -5)))).toEqual([['card.0.sales']]);
  });
  it('K8: suffix の編集 → 違反 1 件。正常・科目名の誤字 → 満たす', () => {
    expect(paths(run('card-column-suffix', edit(easy(), EDITS.suffix!)))).toEqual([['card.0.opPrev']]);
    expect(paths(run('card-column-suffix', edit(easy(), { card: 0, slot: 'opCurr', op: 'suffix', word: '前期' })))).toEqual([['card.0.opCurr']]);
    expect(run('card-column-suffix', easy())).toEqual([]);
    expect(run('card-column-suffix', hard())).toEqual([]);
    expect(run('card-column-suffix', { ...easy(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } })).toEqual([]);
  });
  it('K9: glyph の編集 → 違反 1 件。正常 (小数点・カンマ・△ を含む) → 満たす。文欄は見ない', () => {
    expect(paths(run('card-digits', edit(easy(), EDITS.glyph!)))).toEqual([['card.0.opCurr']]);
    expect(run('card-digits', easy())).toEqual([]);
    expect(run('card-digits', hard())).toEqual([]);
    expect(run('card-digits', set(hard(), 'tanshin.notes.subsequentEvents', '2027 年 4 月に X 社を買収した。'))).toEqual([]);
  });
});

describe('K12 今のデータ', () => {
  it('今の正常な問題 (28 問) は、新しい規則すべてで違反 0 件 (IR が百万円の会社の問題を含む)', () => {
    const normals = problems.filter((p) => p.anomaly === null);
    expect(normals).toHaveLength(28);
    for (const p of normals) {
      const c = companies.find((x) => x.id === p.companyId) as Company;
      expect(verifyProblem(p, c).hard.filter((x) => NEW_RULES.includes(x.rule)), p.id).toEqual([]);
    }
  });
  it('今の異変の問題 (cardEdits なし) は card-period 以外の新しい規則を落とさない。card-period は E-04 だけ', () => {
    for (const p of problems.filter((q) => q.anomaly !== null)) {
      const c = companies.find((x) => x.id === p.companyId) as Company;
      const v = verifyProblem(p, c).hard.filter((x) => NEW_RULES.includes(x.rule) && x.rule !== 'xdoc-seg-names');
      expect(v.filter((x) => !(x.rule === 'card-period' && p.anomaly?.kind === 'E-04')), p.id).toEqual([]);
    }
  });
});

describe('K14 anomalyIssues の cardEdits の検査・A5', () => {
  const kinds = [kindOf('k-slots', 'card-form', ['card-slots']), kindOf('k-op', 'calculation', ['ratio-operating-margin'])];
  const withAnomaly = (p: Problem, kind: string, places: NonNullable<Problem['anomaly']>['places'], extra: Record<string, unknown> = {}): Problem => {
    const actual = [...new Set(verifyProblem(p, companyB()).hard.map((v) => v.rule))].sort();
    return set(p, 'anomaly', { kind, places, explanation: '説明', expectedRules: actual, ...extra });
  };
  const messages = (p: Problem, k = kinds) => checkAnomaly(p, k, verifyProblem(p, companyB()));
  const has = (ms: string[], w: string) => ms.some((m) => m.includes(w));
  const dropOnEasy = (): Problem => withAnomaly(edit(easy(), EDITS.drop!), 'k-slots', [{ doc: 'card', card: 0, slot: 'margin' }]);

  it('A5: card の場所 (drop) は、card-slots の違反に触れる → 場所の指摘なし', () => {
    const ms = messages(dropOnEasy());
    expect(has(ms, '場所に触れない')).toBe(false);
    expect(has(ms, 'どの違反にも触れない場所')).toBe(false);
    expect(has(ms, '場所が実在しない')).toBe(false);
  });
  it('A5: 形に無い欄 (やさしいの irSales)・card が 0 でない → 場所が実在しない。見出し語・枠・期末日の場所は実在する', () => {
    const bad = (slot: string, card = 0) => messages(withAnomaly(edit(easy(), EDITS.drop!), 'k-slots', [{ doc: 'card', card: card as 0, slot }]));
    expect(has(bad('nope'), '場所が実在しない')).toBe(true);
    expect(has(bad('irSales'), '場所が実在しない')).toBe(true);
    expect(has(bad('margin', 3), '場所が実在しない')).toBe(true);
    for (const slot of ['headline', 'frame', 'frame.period', 'period']) expect(has(bad(slot), '場所が実在しない'), slot).toBe(false);
  });
  it('K14: 正常な問題に cardEdits → override-on-normal', () => {
    expect(has(messages(edit(easy(), EDITS.drop!)), '見た目の差し替え (cardEdits)')).toBe(true);
  });
  it('K14: 異変の問題の cardEdits が 2 件以上・欄が形に無い・card が 0 でない → anomaly-mismatch。見出し語の編集・dup headline は通る', () => {
    const base = dropOnEasy();
    const two = { ...base, cardEdits: [EDITS.drop!, EDITS.dup!] } as Problem;
    expect(has(messages(two), '編集が 2 件以上')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ card: 0, slot: 'nope', op: 'drop' }] } as Problem), '形に無い欄')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ card: 0, slot: 'irSales', op: 'drop' }] } as Problem), '形に無い欄')).toBe(true);
    expect(has(messages({ ...base, cardEdits: [{ card: 5, slot: 'margin', op: 'drop' }] } as unknown as Problem), 'カード 5')).toBe(true);
    for (const e of [EDITS.headline!, { card: 0, slot: 'headline', op: 'dup' } as CardEdit]) expect(has(messages({ ...base, cardEdits: [e] } as Problem), '形に無い欄'), JSON.stringify(e)).toBe(false);
  });

  // §9.1: changed の許容集合
  const opX10 = (): Problem => set(normalB(), 'tanshin.incomeStatement.current.operatingIncome', 12400);
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
