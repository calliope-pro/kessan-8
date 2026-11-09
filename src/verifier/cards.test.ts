// ケース表 docs/test-cases/cards.md §3 (ST)・§2.2 (K11)・§5 (V)・§6 (RC・AL・X)・§9 (M): カードの整合・構造・許容集合・見える条件・最小のずれ・二重の食い違い (Sub-task #180)。
import { describe, expect, it } from 'vitest';
import { companies, kinds as dataKinds, problems, sample } from '../data/pool-source.ts';
import { deriveCards } from '../domain/cards.ts';
import type { Card } from '../domain/cards.ts';
import type { AnomalyKind, AnomalyPlace, CardEdit, Company, Problem, RelationCheck } from '../domain/types.ts';
import { cardEditIssues, cardLimitIssues, cardRelationIssues, cardStructureIssues, cardTextLengthIssues, cardVisibility, deviationIssues, displayChanges, doubleDiscrepancies, isVisible, relationAllowed } from './cards.ts';
import { verifyProblem } from './index.ts';
import { clone, companyB, kindOf, normalB, set } from './test-utils.ts';

const easy = (): Problem => normalB();
const hard = (): Problem => ({ ...normalB(), difficulty: 'hard' });
const C = companyB();
const cardOf = (p: Problem): Card => deriveCards(p, C, p.difficulty);
const companyOf = (p: Problem): Company => companies.find((c) => c.id === p.companyId) as Company;
const withEdit = (p: Problem, e: CardEdit): Problem => ({ ...p, cardEdits: [e] });
const checks = (p: Problem): RelationCheck[] => cardRelationIssues(cardOf(p)).map((i) => i.check).sort();

/** カードの欄の raw だけを書き換えたカード (deriveCards の誤りとは独立に、関係の検査だけを見る。text は触らない)。 */
function tamper(card: Card, key: string, raw: number | string): Card {
  const copy = structuredClone(card);
  const slot = copy.slots.find((s) => s.key === key);
  if (!slot) throw new Error(`欄が無い: ${key}`);
  slot.raw = raw;
  return copy;
}
/** ② ③ ① と営業利益率 (既定は ③ ÷ ① の四捨五入)・見出し語 (既定は向きどおり) を決めたやさしいのカード。 */
function mk(o: { sales: number; prev: number; cur: number; margin?: number; word?: string }): Card {
  let card = cardOf(easy());
  card = tamper(card, 'sales', o.sales);
  card = tamper(card, 'opPrev', o.prev);
  card = tamper(card, 'opCurr', o.cur);
  card = tamper(card, 'margin', o.margin ?? Math.round((o.cur * 1000) / o.sales) / 10);
  card.headline = { word: o.word ?? (o.cur > o.prev ? '増益' : '減益'), repeat: 1, reads: ['ir.statements.0'] };
  return card;
}
const issues = (card: Card): string[] => cardRelationIssues(card).map((i) => i.check).sort();

describe('6.1 card-relation の 5 検査 (RC1〜RC8)', () => {
  it('B・やさしい・むずかしいは空 (RC7)', () => {
    expect(checks(easy())).toEqual([]);
    expect(checks(hard())).toEqual([]);
  });
  it('RC1 R-dir: 見出し語の向き', () => {
    expect(issues(mk({ sales: 12400, prev: 1120, cur: 1240, word: '減益' }))).toEqual(['R-dir']);
    expect(issues(mk({ sales: 12400, prev: 1120, cur: 1240, word: '増収' }))).toEqual(['R-dir']);
    expect(issues(mk({ sales: 12400, prev: 1240, cur: 1120, word: '増益' }))).toEqual(['R-dir']);
    expect(issues(mk({ sales: 12400, prev: 1240, cur: 1120 }))).toEqual([]); // 減益
  });
  it('RC2 R-margin: 四捨五入 (小数第 1 位)。売上高 0', () => {
    expect(issues(mk({ sales: 96930, prev: 4480, cur: 4920, margin: 5.1 }))).toEqual([]);
    expect(issues(mk({ sales: 96930, prev: 4480, cur: 4920, margin: 5.0 }))).toEqual(['R-margin']);
    expect(issues(mk({ sales: 2000, prev: 100, cur: 101, margin: 5.1 }))).toEqual([]); // 5.05 → 0.5 を遠い側へ
    expect(issues(mk({ sales: 2000, prev: 100, cur: 101, margin: 5.0 }))).toEqual(['R-margin']);
    expect(issues(mk({ sales: 12400, prev: 1120, cur: 1240, margin: 20 }))).toEqual(['R-margin']);
    expect(issues(mk({ sales: 0, prev: 1120, cur: 1240, margin: 10 }))).toEqual(['R-lt', 'R-margin']);
  });
  it('RC3 R-range: 0.5 ≤ ③ ÷ ② ≤ 2', () => {
    expect(issues(mk({ sales: 20000, prev: 2000, cur: 1000 }))).toEqual([]); // 0.5 ちょうど
    expect(issues(mk({ sales: 20000, prev: 1000, cur: 2000 }))).toEqual([]); // 2 ちょうど
    expect(issues(mk({ sales: 120000, prev: 1000, cur: 10000 }))).toEqual(['R-range']);
    expect(issues(mk({ sales: 20000, prev: 10000, cur: 1000 }))).toEqual(['R-range']);
    expect(issues(mk({ sales: 20000, prev: 2000, cur: 980 }))).toEqual(['R-range']); // 0.49
    expect(issues(mk({ sales: 20000, prev: 1000, cur: 2010 }))).toEqual(['R-range']); // 2.01
  });
  it('RC4 R-ne: ③ = ② (R-dir も落ちる)', () => {
    expect(issues(mk({ sales: 12400, prev: 1120, cur: 1120 }))).toEqual(['R-dir', 'R-ne']);
  });
  it('RC5 R-lt: ③ < ① (等しいも落ちる)', () => {
    expect(issues(mk({ sales: 1240, prev: 1120, cur: 1240 }))).toEqual(['R-lt']);
    expect(issues(mk({ sales: 1000, prev: 1120, cur: 1240 }))).toEqual(['R-lt']);
  });
  it('RC6 欄が無い: その欄を読む検査だけが落ちる', () => {
    const dropped = (slot: string) => checks(withEdit(easy(), { card: 0, slot, op: 'drop' }));
    expect(dropped('margin')).toEqual(['R-margin']);
    expect(dropped('sales')).toEqual(['R-lt', 'R-margin']);
    expect(dropped('opCurr')).toEqual(['R-dir', 'R-lt', 'R-margin', 'R-ne', 'R-range']);
    expect(dropped('opPrev')).toEqual(['R-dir', 'R-ne', 'R-range']);
  });
  it('RC7 今の正常な問題・見本はどれも 5 検査すべてが落ちない', () => {
    for (const p of problems.filter((q) => q.anomaly === null)) expect(cardRelationIssues(deriveCards(p, companyOf(p), p.difficulty)), p.id).toEqual([]);
    const s = (sample as unknown as { problem: Problem }).problem ?? (sample as unknown as Problem);
    for (const difficulty of ['easy', 'hard'] as const) expect(cardRelationIssues(deriveCards({ ...s, difficulty }, companyOf(s), difficulty)), difficulty).toEqual([]);
  });
  it('RC8 落ちた検査には名前とメッセージがある', () => {
    const [i] = cardRelationIssues(mk({ sales: 12400, prev: 1120, cur: 1240, margin: 20 }));
    expect(i?.check).toBe('R-margin');
    expect(i?.message).toContain('営業利益率');
  });
  it('R-dir は表示の語を、R-margin 以下は raw (データの値) を読む。表示の文字列を数にして読まない', () => {
    const signed = cardOf(withEdit(easy(), { card: 0, slot: 'sales', op: 'sign' }));
    expect(signed.slots[0]?.text).toBe('△12,400');
    expect(cardRelationIssues(signed)).toEqual([]);
    const glyph = cardOf(withEdit(easy(), { card: 0, slot: 'opCurr', op: 'glyph', at: 2 }));
    expect(glyph.slots[2]?.text).toBe('1,X40');
    expect(cardRelationIssues(glyph)).toEqual([]);
  });
});

describe('6.2 異変の問題に許す検査 (AL1〜AL11)', () => {
  const k = (id: string, relationChecks?: RelationCheck[]): AnomalyKind => ({ ...kindOf(id, 'appearance', ['x']), ...(relationChecks ? { relationChecks } : {}) });
  const E02 = k('E-02', ['R-margin', 'R-range']);
  const E24 = k('E-24', ['R-margin', 'R-lt']);
  const E12 = k('E-12', ['R-margin']);
  const E17 = k('E-17', ['R-dir']);
  const E23 = k('E-23', ['R-dir']);
  const bare = k('E-99');
  const dropKind: AnomalyKind = { ...k('E-19'), editOp: 'drop' };
  const dupKind: AnomalyKind = { ...k('E-22'), editOp: 'dup' };
  const extra = (p: Problem, kind: AnomalyKind): string[] => checks(p).filter((c) => !relationAllowed(p, kind).includes(c));
  const big = (): Problem => set(set(easy(), 'tanshin.incomeStatement.current.netSales', 20000), 'tanshin.summary.operatingMargin', 6.2); // 1,240 ÷ 20,000

  it('AL1 E-02 (増益) で ③ ≥ ① → R-lt が許す外', () => {
    const p = set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 12400); // 10 × 1,240 = ① (12,400)
    expect(checks(p)).toEqual(['R-lt', 'R-margin', 'R-range']);
    expect(extra(p, E02)).toEqual(['R-lt']);
  });
  it('AL2 E-02 (採用の基: 10 × ③ ≤ 0.8 × ①) → R-margin・R-range だけ', () => {
    const p = set(big(), 'tanshin.incomeStatement.current.operatingIncome', 12400);
    expect(checks(p)).toEqual(['R-margin', 'R-range']);
    expect(extra(p, E02)).toEqual([]);
  });
  it('AL3 E-02 (減益 1/10)', () => {
    let base = set(set(easy(), 'tanshin.incomeStatement.previous.operatingIncome', 1240), 'tanshin.incomeStatement.current.operatingIncome', 1120);
    base = set(set(base, 'tanshin.summary.operatingMargin', 9), 'ir.statements.0.claims.1.direction', 'down');
    expect(checks(base)).toEqual([]);
    const p = set(base, 'tanshin.incomeStatement.current.operatingIncome', 112);
    expect(checks(p)).toEqual(['R-margin', 'R-range']);
    expect(extra(p, E02)).toEqual([]);
  });
  it('AL4 E-24 (売上高 ≤ 営業利益の 0.8 倍・再計算しない)', () => {
    const p = set(easy(), 'tanshin.incomeStatement.current.netSales', 744);
    expect(checks(p)).toEqual(['R-lt', 'R-margin']);
    expect(extra(p, E24)).toEqual([]);
    expect(extra(p, E02)).toEqual(['R-lt']);
  });
  it('AL5 E-12 (営業利益率を 2.2 倍)', () => {
    const p = set(easy(), 'tanshin.summary.operatingMargin', 22);
    expect(checks(p)).toEqual(['R-margin']);
    expect(extra(p, E12)).toEqual([]);
  });
  it('AL6 E-17 (主張の向きを逆)・E-23 (見出し語を増収に)', () => {
    const p17 = set(easy(), 'ir.statements.0.claims.1.direction', 'down');
    expect(checks(p17)).toEqual(['R-dir']);
    expect(extra(p17, E17)).toEqual([]);
    const p23 = withEdit(easy(), { card: 0, op: 'headline', word: '増収' });
    expect(checks(p23)).toEqual(['R-dir']);
    expect(extra(p23, E23)).toEqual([]);
  });
  it('AL7 E-19 (drop): 落とした欄を読む検査だけを許す', () => {
    for (const [slot, want] of [
      ['margin', ['R-margin']],
      ['sales', ['R-lt', 'R-margin']],
      ['opCurr', ['R-dir', 'R-lt', 'R-margin', 'R-ne', 'R-range']],
      ['opPrev', ['R-dir', 'R-ne', 'R-range']],
    ] as const) {
      const p = withEdit(easy(), { card: 0, slot, op: 'drop' });
      expect([...relationAllowed(p, dropKind)].sort(), slot).toEqual([...want]);
      expect(extra(p, dropKind), slot).toEqual([]);
      // 欄の drop を許すのは drop の種類だけ (dup の種類・editOp の無い種類に drop の問題が来ても、落とした欄を読む検査は許さない)
      expect(relationAllowed(p, dupKind), slot).toEqual([]);
      expect(relationAllowed(p, bare), slot).toEqual([]);
      expect(extra(p, dupKind).length, slot).toBeGreaterThan(0);
    }
  });
  it('AL8 H-31 (むずかしいの drop): 5 検査は落ちず、許す検査は空', () => {
    for (const slot of ['pbt', 'audit', 'irSales', 'period'])  {
      const p = withEdit(hard(), { card: 0, slot, op: 'drop' });
      expect(checks(p), slot).toEqual([]);
      expect(relationAllowed(p, { ...dropKind, id: 'H-31' }), slot).toEqual([]);
    }
  });
  it('AL9 上のほかのすべての種類は 5 検査が落ちない (表示だけを変える・カードの外を変える)', () => {
    const edits: [string, Problem][] = [
      ['E-25 sign sales', withEdit(easy(), { card: 0, slot: 'sales', op: 'sign' })],
      ['E-27 glyph opCurr', withEdit(easy(), { card: 0, slot: 'opCurr', op: 'glyph', at: 2 })],
      ['E-21 no-comma', withEdit(easy(), { card: 0, slot: 'sales', op: 'format', style: 'no-comma' })],
      ['E-03 unit', withEdit(easy(), { card: 0, slot: 'sales', op: 'unit', unit: '億円' })],
      ['E-22 dup opCurr', withEdit(easy(), { card: 0, slot: 'opCurr', op: 'dup' })],
      ['E-22 dup headline', withEdit(easy(), { card: 0, slot: 'headline', op: 'dup' })],
      ['E-26 suffix', withEdit(easy(), { card: 0, slot: 'opPrev', op: 'suffix', word: '当期' })],
      ['E-28 day', withEdit(easy(), { card: 0, slot: 'period', op: 'day', day: 32 })],
      ['E-04 期末日のずれ', set(easy(), 'tanshin.columnDates.incomeStatement.current', '2026-03-31')],
      ['E-05 誤字', { ...easy(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } }],
      ['H-01', set(hard(), 'tanshin.balanceSheet.current.totalAssets', 15300)],
      ['H-03', set(hard(), 'tanshin.cashFlow.incomeBeforeTax', 1300)],
      ['H-04', set(hard(), 'tanshin.cashFlow.cashEnding', 2415)],
      ['H-05', set(hard(), 'tanshin.cashFlow.receivablesChange', 100)],
      ['H-13/H-17', set(hard(), 'ir.highlights.netSales.amount', 1240)],
      ['H-19', set(hard(), 'ir.segments.items', hard().ir.segments.items.slice(0, 2))],
      ['H-21', set(hard(), 'ir.statements.2.claims.0.direction', 'down')],
      ['H-22', set(hard(), 'tanshin.summary.auditNote', '決算短信は監査済みです')],
      ['H-23', set(hard(), 'tanshin.summary.accountingPolicyChange', true)],
      ['H-24', set(hard(), 'tanshin.notes.subsequentEvents', '重要な後発事象あり。')],
      ['H-28 売掛金 → 買掛金', { ...hard(), labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } }],
      ['H-29 unit', withEdit(hard(), { card: 0, slot: 'irSales', op: 'unit', unit: '百万円' })],
      ['H-30 誤字', { ...hard(), labelOverrides: { 'tanshin.cashFlow.operatingCashFlow': '営業活動によるキャッシュ・フロ' } }],
      ['H-32 format', withEdit(hard(), { card: 0, slot: 'ta', op: 'format', style: 'no-comma' })],
      ['H-33 dup', withEdit(hard(), { card: 0, slot: 'audit', op: 'dup' })],
      ['H-34 sign', withEdit(hard(), { card: 0, slot: 'ta', op: 'sign' })],
      ['H-35 社名', set(hard(), 'ir.header.companyName', '別会社株式会社')],
    ];
    for (const [name, p] of edits) expect(checks(p), name).toEqual([]);
  });
  it('AL10 relationChecks を持たない種類は、落ちた検査がすべて許す外', () => {
    const p = set(easy(), 'tanshin.summary.operatingMargin', 22);
    expect(relationAllowed(p, bare)).toEqual([]);
    expect(extra(p, bare)).toEqual(['R-margin']);
    expect(relationAllowed(p, E12)).toEqual(['R-margin']);
  });
  it('AL11 正常な問題は 5 検査すべてが落ちない', () => {
    expect(checks(easy())).toEqual([]);
  });
});

describe('3 構造・文字数 (ST1〜ST6)', () => {
  it('ST1: 導出したカードは空 (やさしい・むずかしい)', () => {
    expect(cardStructureIssues(cardOf(easy()))).toEqual([]);
    expect(cardStructureIssues(cardOf(hard()))).toEqual([]);
  });
  it('ST2: 欄を削った・並びを替えた・同じ欄を足したカード', () => {
    const dropped = structuredClone(cardOf(easy()));
    dropped.slots.pop();
    expect(cardStructureIssues(dropped).length).toBeGreaterThan(0);
    const reversed = structuredClone(cardOf(easy()));
    reversed.slots.reverse();
    expect(cardStructureIssues(reversed).length).toBeGreaterThan(0);
    const dup = structuredClone(cardOf(hard()));
    dup.slots.splice(5, 0, structuredClone(dup.slots[5]!));
    expect(cardStructureIssues(dup).length).toBeGreaterThan(0);
  });
  it('ST3: 見出し語が無いカード (主張が無い問題)', () => {
    for (const p of [easy(), hard()]) {
      const card = cardOf(set(p, 'ir.statements', []));
      expect(cardStructureIssues(card).some((m) => m.includes('見出し語'))).toBe(true);
    }
  });
  it('ST4: 上限 (やさしい 数字 4・文 0 / むずかしい 数字 19・文 8)。dup を持つ異変は +1', () => {
    const extraNumber = (card: Card, section: string): Card => {
      const copy = structuredClone(card);
      const last = copy.slots.filter((s) => s.kind === 'number' && s.section === section).pop()!;
      copy.slots.splice(copy.slots.indexOf(last) + 1, 0, { ...structuredClone(last), key: `${last.key}2` });
      return copy;
    };
    const five = extraNumber(cardOf(easy()), 'card');
    expect(cardLimitIssues(five).some((m) => m.includes('上限'))).toBe(true);
    expect(cardLimitIssues(five, 1)).toEqual([]);
    expect(cardLimitIssues(extraNumber(five, 'card'), 1).length).toBeGreaterThan(0);
    const irSix = extraNumber(cardOf(hard()), 'ir');
    expect(cardLimitIssues(irSix).length).toBeGreaterThan(0);
    expect(cardLimitIssues(irSix, 1)).toEqual([]);
    const notes = structuredClone(cardOf(hard()));
    const lastNote = notes.slots.filter((s) => s.section === 'notes').pop()!;
    notes.slots.splice(notes.slots.indexOf(lastNote) + 1, 0, { ...structuredClone(lastNote), key: 'extraText' });
    expect(cardLimitIssues(notes).length).toBeGreaterThan(0);
    // 資料 1 の数字は 10 まで (pl 1 + bs 5 + cf 4)・資料 2 の文は 3 まで
    expect(cardLimitIssues(cardOf(hard()))).toEqual([]);
  });
  it('ST5: 文欄は 40 字まで (サロゲート対は 1 字)。数字の欄は見ない', () => {
    const at = (text: string) => {
      const card = structuredClone(cardOf(hard()));
      card.slots.find((s) => s.key === 'subseq')!.text = text;
      return cardTextLengthIssues(card);
    };
    expect(at('あ'.repeat(40))).toEqual([]);
    expect(at('あ'.repeat(41))).toHaveLength(1);
    expect(at('𠮷'.repeat(40))).toEqual([]);
    const num = structuredClone(cardOf(easy()));
    num.slots[0]!.text = '9'.repeat(60);
    expect(cardTextLengthIssues(num)).toEqual([]);
    const claim = structuredClone(cardOf(hard()));
    claim.slots.find((s) => s.key === 'irOcf')!.text = 'う'.repeat(41);
    expect(cardTextLengthIssues(claim)).toHaveLength(1);
  });
  it('ST6: 今の全問の構造は空。文欄が 40 字を超える問題は、正常にも異変にも見本にも無い (v3 のデータは 40 字以内で作る。データを作り直しても、問題の数に依らない)', () => {
    const over = (ps: Problem[]) => ps.flatMap((p) => cardTextLengthIssues(deriveCards(p, companyOf(p), p.difficulty, { applyEdits: false })).map((m) => `${p.id} ${m.split(':')[0]}`));
    for (const p of problems.filter((q) => q.anomaly === null)) expect(cardStructureIssues(deriveCards(p, companyOf(p), p.difficulty)), p.id).toEqual([]);
    expect(over(problems.filter((q) => q.anomaly === null))).toEqual([]);
    expect(over(problems)).toEqual([]);
    expect(problems.filter((q) => q.difficulty === 'easy').flatMap((p) => over([p]))).toEqual([]);
    const s = (sample as unknown as { problem: Problem }).problem ?? (sample as unknown as Problem);
    expect(over([{ ...s, difficulty: 'hard' }])).toEqual([]);
  });
});

describe('2.2 cardEditIssues (K11a〜K11j。op ごとに当ててよい欄)', () => {
  const at = (p: Problem, e: CardEdit): string[] => cardEditIssues(withEdit(p, e), C);
  it('K11a unit: 金額の欄だけ・その欄の正常の語以外', () => {
    expect(at(easy(), { card: 0, slot: 'sales', op: 'unit', unit: '億円' })).toEqual([]);
    expect(at(easy(), { card: 0, slot: 'margin', op: 'unit', unit: '億円' }).length).toBe(1);
    expect(at(hard(), { card: 0, slot: 'audit', op: 'unit', unit: '億円' }).length).toBe(1);
    expect(at(easy(), { card: 0, slot: 'sales', op: 'unit', unit: '百万円' }).length).toBe(1); // K11j: 正常の語と同じ
    expect(at(hard(), { card: 0, slot: 'irSales', op: 'unit', unit: '億円' }).length).toBe(1);
    expect(at(hard(), { card: 0, slot: 'irSales', op: 'unit', unit: '百万円' })).toEqual([]);
  });
  it('K11b format: no-comma は整数部 4 桁以上・comma-shift は 5 桁以上の金額の欄', () => {
    for (const slot of ['sales', 'opPrev', 'opCurr']) expect(at(easy(), { card: 0, slot, op: 'format', style: 'no-comma' }), slot).toEqual([]);
    expect(at(easy(), { card: 0, slot: 'margin', op: 'format', style: 'no-comma' }).length).toBe(1);
    expect(at(hard(), { card: 0, slot: 'audit', op: 'format', style: 'no-comma' }).length).toBe(1);
    expect(at(hard(), { card: 0, slot: 'cfAr', op: 'format', style: 'no-comma' }).length).toBe(1); // △100
    expect(at(easy(), { card: 0, slot: 'sales', op: 'format', style: 'comma-shift' })).toEqual([]);
    expect(at(easy(), { card: 0, slot: 'opCurr', op: 'format', style: 'comma-shift' }).length).toBe(1);
  });
  it('K11c dup: どれでもよい', () => {
    for (const [p, slot] of [[easy(), 'opCurr'], [easy(), 'headline'], [hard(), 'audit'], [hard(), 'irSales']] as const) expect(at(p, { card: 0, slot, op: 'dup' }), slot).toEqual([]);
  });
  it('K11d suffix: opPrev・opCurr だけ', () => {
    expect(at(easy(), { card: 0, slot: 'opPrev', op: 'suffix', word: '当期' })).toEqual([]);
    expect(at(easy(), { card: 0, slot: 'sales', op: 'suffix', word: '当期' } as unknown as CardEdit).length).toBe(1);
  });
  it('K11e glyph: 数字を含む欄・at は数字の文字 (cardEditIssues と deriveCards の両方が弾く)', () => {
    expect(at(easy(), { card: 0, slot: 'opCurr', op: 'glyph', at: 2 })).toEqual([]);
    for (const e of [
      { card: 0, slot: 'opCurr', op: 'glyph', at: 1 },
      { card: 0, slot: 'opCurr', op: 'glyph', at: 5 },
    ] as CardEdit[]) {
      expect(at(easy(), e).length, JSON.stringify(e)).toBe(1);
      expect(() => deriveCards(withEdit(easy(), e), C, 'easy')).toThrow(RangeError);
    }
    expect(at(hard(), { card: 0, slot: 'audit', op: 'glyph', at: 0 }).length).toBe(1); // 文欄 (数字を含まない)
    expect(at(easy(), { card: 0, slot: 'opCurr', op: 'format', style: 'comma-shift' }).length).toBe(1);
    expect(() => deriveCards(withEdit(easy(), { card: 0, slot: 'opCurr', op: 'format', style: 'comma-shift' }), C, 'easy')).toThrow(RangeError);
  });
  it('K11f sign: 値が正で、card-sign の対象の 11 欄だけ', () => {
    for (const slot of ['sales', 'ta', 'tlna', 'cash', 'arPrev', 'arCurr', 'cfEnd', 'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev']) expect(at(hard(), { card: 0, slot, op: 'sign' }), slot).toEqual([]);
    for (const slot of ['opPrev', 'opCurr', 'margin', 'pbt', 'cfStart', 'ocf', 'cfAr', 'irNetDebtPrev']) expect(at(hard(), { card: 0, slot, op: 'sign' }).length, slot).toBe(1);
    expect(at(set(hard(), 'ir.supplement.interestBearingDebt.previous', 0), { card: 0, slot: 'irDebtPrev', op: 'sign' }).length).toBe(1); // 無借金 (値 0)
    expect(at(set(easy(), 'tanshin.incomeStatement.current.netSales', -5), { card: 0, slot: 'sales', op: 'sign' }).length).toBe(1); // 値が負
  });
  it('K11g day・K11h headline・K11i drop', () => {
    expect(at(easy(), { card: 0, slot: 'period', op: 'day', day: 32 })).toEqual([]);
    // 見出し語の編集は、向きを変えない語だけ (増益 → 増収、減益 → 減収)。向きが逆の語は E-17 と同時に見える (設計 §2.2 E-23。包括レビュー B1)
    expect(at(easy(), { card: 0, op: 'headline', word: '増収' })).toEqual([]);
    expect(at(easy(), { card: 0, op: 'headline', word: '減収' }).length).toBe(1); // 増益のカードに減収
    const down = set(easy(), 'ir.statements.0.claims.1.direction', 'down'); // 減益のカード
    expect(at(down, { card: 0, op: 'headline', word: '減収' })).toEqual([]);
    expect(at(down, { card: 0, op: 'headline', word: '増収' }).length).toBe(1); // 減益のカードに増収
    expect(at(easy(), { card: 0, op: 'headline', word: '減益' }).length).toBe(1);
    expect(at(easy(), { card: 0, op: 'headline', word: '増益' }).length).toBe(1);
    expect(at(set(easy(), 'ir.statements', []), { card: 0, op: 'headline', word: '増収' }).length).toBe(1); // 見出し語が無い
    for (const [p, slot] of [[easy(), 'margin'], [hard(), 'audit'], [hard(), 'period'], [hard(), 'irSales']] as const) expect(at(p, { card: 0, slot, op: 'drop' }), slot).toEqual([]);
    for (const slot of ['headline', 'frame']) expect(at(easy(), { card: 0, slot, op: 'drop' }).length, slot).toBe(1);
  });
  it('編集が無い問題は空・形に無い欄の編集は例外にならない', () => {
    expect(cardEditIssues(easy(), C)).toEqual([]);
    expect(() => at(easy(), { card: 0, slot: 'nope', op: 'drop' })).not.toThrow();
  });
});

describe('2.2 種類と cardEdits の op の対応 (K11k。包括レビュー N1)', () => {
  const kind = (id: string, editOp?: CardEdit['op']): AnomalyKind => ({ ...kindOf(id, 'appearance', ['card-slots']), ...(editOp ? { editOp } : {}) });
  const drop = withEdit(easy(), { card: 0, slot: 'margin', op: 'drop' });
  const dup = withEdit(easy(), { card: 0, slot: 'opCurr', op: 'dup' });
  it('種類の editOp と編集の op が同じなら誤りなし。違えば card-edit-op の文 (E-19 に dup・E-22 に drop)', () => {
    expect(cardEditIssues(drop, C, [kind('E-19', 'drop')])).toEqual([]);
    expect(cardEditIssues(dup, C, [kind('E-22', 'dup')])).toEqual([]);
    expect(cardEditIssues({ ...dup, anomaly: { kind: 'E-19', places: [], explanation: 'x', expectedRules: [] } }, C, [kind('E-19', 'drop')]).length).toBe(1);
    expect(cardEditIssues({ ...drop, anomaly: { kind: 'E-22', places: [], explanation: 'x', expectedRules: [] } }, C, [kind('E-22', 'dup')]).length).toBe(1);
  });
  it('編集を持つ異変の種類が editOp を持たない・種類が引けない → 文。kinds を渡さなければ見ない。編集が無ければ見ない', () => {
    const anomalous = (p: Problem, id: string): Problem => ({ ...p, anomaly: { kind: id, places: [], explanation: 'x', expectedRules: [] } });
    expect(cardEditIssues(anomalous(drop, 'E-99'), C, [kind('E-99')]).length).toBe(1);
    expect(cardEditIssues(anomalous(drop, 'E-00'), C, [kind('E-99', 'drop')]).length).toBe(1);
    expect(cardEditIssues(anomalous(drop, 'E-99'), C)).toEqual([]);
    expect(cardEditIssues(anomalous(easy(), 'E-19'), C, [kind('E-19', 'drop')])).toEqual([]);
  });
});

describe('5 見える条件 (V1〜V27)', () => {
  /** 異変の問題にして cardVisibility にかける。種類は primaryRules を持つダミー。 */
  const vis = (p: Problem, primary: string[], places: AnomalyPlace[], opts: { base?: Problem; known?: boolean } = {}) => {
    const result = verifyProblem(p, C);
    const actual = [...new Set(result.hard.map((v) => v.rule))].sort();
    const kind = kindOf('k', 'appearance', primary, actual);
    const q = set(p, 'anomaly', { kind: 'k', places, explanation: '説明', expectedRules: actual });
    return { ...cardVisibility(q, C, opts.known === false ? [] : [kind], result, opts.base), visible: isVisible(q, C, opts.known === false ? [] : [kind], result, opts.base) };
  };
  const T = (path: string): AnomalyPlace => ({ doc: 'tanshin', path });
  const I = (path: string): AnomalyPlace => ({ doc: 'ir', path });

  it.each<[string, () => Problem, string[], AnomalyPlace[], boolean]>([
    ['V1 営業利益率 20.0', () => set(easy(), 'tanshin.summary.operatingMargin', 20), ['ratio-operating-margin'], [T('summary.operatingMargin')], true],
    ['V2 営業利益 当期を 10 倍 (E-02)', () => set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 12400), ['ratio-operating-margin'], [T('incomeStatement.current.operatingIncome')], true],
    ['V2b 同じで places に営業利益率を足す', () => set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 12400), ['ratio-operating-margin'], [T('incomeStatement.current.operatingIncome'), T('summary.operatingMargin')], true],
    ['V3 売上高を営業利益の 0.6 倍 (E-24)', () => set(easy(), 'tanshin.incomeStatement.current.netSales', 744), ['ratio-operating-margin'], [T('incomeStatement.current.netSales')], true],
    ['V4 営業利益の主張の向きを逆 (E-17)', () => set(easy(), 'ir.statements.0.claims.1.direction', 'down'), ['claims-direction'], [I('statements.0')], true],
    ['V5 営業利益の科目名の誤字 (itemKey)', () => ({ ...easy(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } }), ['label-spelling'], [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }], true],
    ['V6 総資産のずれ: やさしいでは見えない', () => set(easy(), 'tanshin.balanceSheet.current.totalAssets', 15300), ['bs-balance'], [T('balanceSheet.current.totalAssets')], false],
    ['V6b 総資産のずれ: むずかしいでは見える', () => set(hard(), 'tanshin.balanceSheet.current.totalAssets', 15300), ['bs-balance'], [T('balanceSheet.current.totalAssets')], true],
    ['V6c IR の売上高 10 倍: やさしいでは見えない', () => set(easy(), 'ir.highlights.netSales.amount', 1240), ['xdoc-hl-net-sales'], [I('highlights.netSales.amount')], false],
    ['V7 監査済み (H-22)', () => set(hard(), 'tanshin.summary.auditNote', '決算短信は監査済みです'), ['audit-note'], [T('summary.auditNote')], true],
    ['V8 売掛金 → 買掛金 (H-28)', () => ({ ...hard(), labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } }), ['account-section'], [{ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.receivables' }], true],
    ['V9 CF の最初の行 (H-03)', () => set(hard(), 'tanshin.cashFlow.incomeBeforeTax', 1300), ['link-cf-start'], [T('cashFlow.incomeBeforeTax')], true],
    ['V10 貸借 (H-01)', () => set(hard(), 'tanshin.balanceSheet.current.totalAssets', 15300), ['bs-balance'], [T('balanceSheet.current.totalAssets')], true],
    ['V11 IR の売上高 10 倍 (H-17)', () => set(hard(), 'ir.highlights.netSales.amount', 1240), ['xdoc-hl-net-sales'], [I('highlights.netSales.amount')], true],
    ['V12 売上債権の増減 (H-05)', () => set(hard(), 'tanshin.cashFlow.receivablesChange', 100), ['link-cf-receivables'], [T('cashFlow.receivablesChange')], true],
    ['V13 IR のセグメントが欠ける (H-19)', () => set(hard(), 'ir.segments.items', hard().ir.segments.items.slice(0, 2)), ['xdoc-seg-names'], [I('segments.items')], true],
    ['V14 CF の期末残高 (H-04)', () => set(hard(), 'tanshin.cashFlow.cashEnding', 2415), ['link-cf-cash-end'], [T('cashFlow.cashEnding')], true],
    ['V15 純有利子負債 前期 (H-20)', () => set(hard(), 'ir.supplement.netDebt.previous', 32.8), ['ir-supp-net-debt'], [I('supplement.netDebt.previous')], true],
    ['V15b 純有利子負債 当期は形に無い', () => set(hard(), 'ir.supplement.netDebt.current', 99), ['ir-supp-net-debt'], [I('supplement.netDebt.current')], false],
    ['V16 営業 CF の主張の向き (H-21)', () => set(hard(), 'ir.statements.2.claims.0.direction', 'down'), ['claims-direction'], [I('statements.2')], true],
    ['V17 会計方針の有無 (H-23)', () => set(hard(), 'tanshin.summary.accountingPolicyChange', true), ['accounting-policy-match'], [T('summary.accountingPolicyChange')], true],
    ['V18 後発事象 (H-24)', () => set(hard(), 'tanshin.notes.subsequentEvents', '重要な後発事象あり。'), ['subsequent-event-match'], [T('notes.subsequentEvents')], true],
    ['V19 IR の現金 当期 (H-13)', () => set(hard(), 'ir.supplement.cash.current', 24), ['xdoc-supp-cash'], [I('supplement.cash.current')], true],
    ['V19b IR の現金 前期は短信の前期の現金が形に無い', () => set(hard(), 'ir.supplement.cash.previous', 22), ['xdoc-supp-cash'], [I('supplement.cash.previous')], false],
    ['V20 IR の社名 (H-35)', () => set(hard(), 'ir.header.companyName', '別会社株式会社'), ['header-company-name'], [I('header.companyName')], true],
    ['V21 places が二次の症状 (カードの外のセル) を含む', () => set(hard(), 'tanshin.cashFlow.receivablesChange', 100), ['link-cf-receivables'], [T('cashFlow.receivablesChange'), T('balanceSheet.previous.cash')], false],
    ['V22 主な規則が落ちていない', () => set(easy(), 'tanshin.summary.operatingMargin', 20), ['bs-balance'], [T('summary.operatingMargin')], false],
    ['V25 期末日のずれ (E-04)', () => set(easy(), 'tanshin.columnDates.incomeStatement.current', '2028-03-31'), ['card-period'], [T('columnDates.incomeStatement.current'), T('header.periodLabel')], true],
    ['V31 IR の結果の別の数字だけ (別名は無い)', () => set(easy(), 'ir.results.netSales.current', 99), ['xdoc-results-net-sales'], [I('results.netSales.current')], false],
  ])('%s', (_name, make, primary, places, expected) => {
    expect(vis(make(), primary, places).visible).toBe(expected);
  });
  it('V23 cardEdits の drop はテンプレートのカードで見る', () => {
    const p = withEdit(easy(), { card: 0, slot: 'margin', op: 'drop' });
    expect(vis(p, ['card-slots'], [{ doc: 'card', card: 0, slot: 'margin' }]).visible).toBe(true);
  });
  it('V24 形に無い欄の編集 (やさしいの irSales) は見えない・例外にならない', () => {
    const p = withEdit(easy(), { card: 0, slot: 'irSales', op: 'drop' });
    expect(vis(p, ['card-slots'], [{ doc: 'card', card: 0, slot: 'irSales' }]).visible).toBe(false);
  });
  it('V26・V27 正常な問題は見える・種類が引けない異変は見えない', () => {
    expect(isVisible(easy(), C, [])).toBe(true);
    expect(vis(set(easy(), 'tanshin.summary.operatingMargin', 20), ['ratio-operating-margin'], [T('summary.operatingMargin')], { known: false }).visible).toBe(false);
  });
  it('V1・V2・V3 の内訳 (missingPlaces・v2・v3)', () => {
    const r = vis(set(hard(), 'tanshin.cashFlow.receivablesChange', 100), ['link-cf-receivables'], [T('cashFlow.receivablesChange'), T('balanceSheet.previous.cash')]);
    expect(r.missingPlaces).toEqual(['tanshin.balanceSheet.previous.cash']);
    expect(r.v2).toBe(true);
    expect(r.v3).toBeNull();
  });
});

describe('5.2 検査 5 (表示が実際に変わる。V28〜V32)', () => {
  const placed = (p: Problem, places: AnomalyPlace[]): Problem => set(p, 'anomaly', { kind: 'k', places, explanation: '説明', expectedRules: [] });
  const changes = (base: Problem, p: Problem, places: AnomalyPlace[]): boolean => displayChanges(placed(p, places), base, C);
  const slotPlace = (slot: string): AnomalyPlace[] => [{ doc: 'card', card: 0, slot }];
  it('V28: 数値・format・unit・drop・dup・headline・suffix・glyph・sign・day は表示が変わる', () => {
    expect(changes(easy(), set(easy(), 'tanshin.summary.operatingMargin', 20), [{ doc: 'tanshin', path: 'summary.operatingMargin' }])).toBe(true);
    const edits: [CardEdit, string][] = [
      [{ card: 0, slot: 'sales', op: 'format', style: 'no-comma' }, 'sales'],
      [{ card: 0, slot: 'sales', op: 'unit', unit: '億円' }, 'sales'],
      [{ card: 0, slot: 'margin', op: 'drop' }, 'margin'],
      [{ card: 0, slot: 'opCurr', op: 'dup' }, 'opCurr'],
      [{ card: 0, slot: 'headline', op: 'dup' }, 'headline'],
      [{ card: 0, op: 'headline', word: '増収' }, 'headline'],
      [{ card: 0, slot: 'opPrev', op: 'suffix', word: '当期' }, 'opPrev'],
      [{ card: 0, slot: 'opCurr', op: 'glyph', at: 2 }, 'opCurr'],
      [{ card: 0, slot: 'sales', op: 'sign' }, 'sales'],
      [{ card: 0, slot: 'period', op: 'day', day: 32 }, 'period'],
    ];
    for (const [e, slot] of edits) expect(changes(easy(), withEdit(easy(), e), slotPlace(slot)), JSON.stringify(e)).toBe(true);
  });
  it('V29: 科目名だけが変わる異変も、表示が変わる (見える)', () => {
    const typo = { ...easy(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    expect(changes(easy(), typo, [{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }])).toBe(true);
    const ocf = { ...hard(), labelOverrides: { 'tanshin.cashFlow.operatingCashFlow': '営業活動によるキャッシュ・フロ' } };
    expect(changes(hard(), ocf, [{ doc: 'tanshin', itemKey: 'tanshin.cashFlow.operatingCashFlow' }])).toBe(true);
    const end = { ...hard(), labelOverrides: { 'tanshin.cashFlow.cashEnding': '現金及び現金同等物の期末残' } };
    expect(changes(hard(), end, [{ doc: 'tanshin', itemKey: 'tanshin.cashFlow.cashEnding' }])).toBe(true);
  });
  it('V30: 表示が変わらない編集 (cfAr の no-comma・同じ語の suffix・同じ単位) は変わらない', () => {
    expect(changes(hard(), withEdit(hard(), { card: 0, slot: 'cfAr', op: 'format', style: 'no-comma' }), slotPlace('cfAr'))).toBe(false);
    expect(changes(easy(), withEdit(easy(), { card: 0, slot: 'opPrev', op: 'suffix', word: '前期' }), slotPlace('opPrev'))).toBe(false);
    expect(changes(easy(), withEdit(easy(), { card: 0, slot: 'sales', op: 'unit', unit: '百万円' }), slotPlace('sales'))).toBe(false);
  });
  it('V32: base が無い・基の難易度が違っても導ける。base を渡さなければ v3 は null', () => {
    const q = placed(set(easy(), 'tanshin.summary.operatingMargin', 20), [{ doc: 'tanshin', path: 'summary.operatingMargin' }]);
    expect(cardVisibility(q, C, [kindOf('k', 'appearance', ['ratio-operating-margin'])]).v3).toBeNull();
    expect(cardVisibility(q, C, [kindOf('k', 'appearance', ['ratio-operating-margin'])], undefined, easy()).v3).toBe(true);
  });
});

describe('6.3 二重の食い違い doubleDiscrepancies (X1〜X4)', () => {
  const doubles = (p: Problem, primary: string[], places: AnomalyPlace[]) => {
    const result = verifyProblem(p, C);
    const actual = [...new Set(result.hard.map((v) => v.rule))].sort();
    const kind = kindOf('k', 'appearance', primary, actual);
    const q = set(p, 'anomaly', { kind: 'k', places, explanation: '説明', expectedRules: actual });
    return doubleDiscrepancies(q, C, [kind], result);
  };
  const T = (path: string): AnomalyPlace => ({ doc: 'tanshin', path });
  it('X1: 営業利益 当期を 10 倍 (向きは同じ) → 空', () => {
    expect(doubles(set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 12400), ['ratio-operating-margin'], [T('incomeStatement.current.operatingIncome')])).toEqual([]);
  });
  it('X2: 営業利益を 1/10 (向きが逆になる) → claims-direction も収まる', () => {
    expect(doubles(set(easy(), 'tanshin.incomeStatement.current.operatingIncome', 124), ['ratio-operating-margin'], [T('incomeStatement.current.operatingIncome')])).toEqual(['claims-direction']);
  });
  it('X3: むずかしい: 売上債権の増減を変えて期末残高も変える (再計算) → link-cf-cash-end が同時に収まる', () => {
    const p = set(set(hard(), 'tanshin.cashFlow.receivablesChange', 100), 'tanshin.cashFlow.cashEnding', 2500);
    expect(doubles(p, ['link-cf-receivables'], [T('cashFlow.receivablesChange')])).toEqual(['link-cf-cash-end']);
  });
  it('X4: 正常な問題・見えない問題は空', () => {
    expect(doubleDiscrepancies(easy(), C, [])).toEqual([]);
    expect(doubles(set(easy(), 'tanshin.balanceSheet.current.totalAssets', 15300), ['bs-balance'], [T('balanceSheet.current.totalAssets')])).toEqual([]);
  });
});

describe('9 道具なしで気づける最小のずれ deviationIssues (M1〜M10)', () => {
  const kindIs = (id: string): Problem['anomaly'] => ({ kind: id, places: [{ doc: 'tanshin', path: 'summary.eps' }], explanation: 'x', expectedRules: [] });
  const make = (id: string, p: Problem): Problem => set(p, 'anomaly', kindIs(id));
  const dev = (p: Problem, c: Company = C) => deviationIssues(p, c);

  it('M1: E-09 は総資産の 10% 以上。総資産は元のまま、流動資産の小計をずらす', () => {
    const base = (ca: number) => {
      let p = set(easy(), 'tanshin.balanceSheet.current.totalAssets', 58080);
      p = set(p, 'tanshin.balanceSheet.current.totalFixedAssets', 14720);
      return make('E-09', set(p, 'tanshin.balanceSheet.current.totalCurrentAssets', ca));
    };
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
    expect(at(906.6)).toHaveLength(1);
    expect(at(0)).toHaveLength(1);
  });
  it('M4: E-07 は数字の大きい側の棒が小さい側の棒の 2/3 以下', () => {
    let p = set(easy(), 'ir.results.netSales.previous', 906.6);
    p = set(p, 'ir.results.netSales.current', 969.3);
    p = set(p, 'ir.results.chart.netSales.previous', 906.6);
    const at = (cur: number, prev = 906.6, q = p) => dev(make('E-07', set(set(q, 'ir.results.chart.netSales.current', cur), 'ir.results.chart.netSales.previous', prev)));
    expect(at(604.0)).toEqual([]);
    expect(at(605.0)).toHaveLength(1);
    expect(at(906.6, 969.3)).toHaveLength(1);
    let d = set(easy(), 'ir.results.netSales.previous', 969.3);
    d = set(d, 'ir.results.netSales.current', 906.6);
    expect(at(906.6, 604.0, d)).toEqual([]);
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
    expect(at(10, 2900, 2900)).toHaveLength(1);
  });
  it('M6: H-20 は 20% 以上 (B の前期 有利子負債 48.3・現金 21.0 → 27.3)', () => {
    const at = (n: number) => dev(make('H-20', set(hard(), 'ir.supplement.netDebt.previous', n)));
    expect(at(33.0)).toEqual([]);
    expect(at(32.0)).toHaveLength(1);
    expect(at(27.3)).toHaveLength(1);
    const zero = set(set(hard(), 'ir.supplement.interestBearingDebt.previous', 21.0), 'ir.supplement.netDebt.previous', 5);
    expect(dev(make('H-20', zero))).toHaveLength(1);
  });
  it('M9: E-24 は売上高が営業利益の 0.8 倍以下', () => {
    const at = (sales: number, op = 4920) => dev(make('E-24', set(set(easy(), 'tanshin.incomeStatement.current.netSales', sales), 'tanshin.incomeStatement.current.operatingIncome', op)));
    expect(at(2950)).toEqual([]); // 0.60
    expect(at(3936)).toEqual([]); // 0.8 ちょうど
    expect(at(3937)).toHaveLength(1); // 0.81
    expect(at(5000)).toHaveLength(1); // 売上高 > 営業利益
  });
  it('M10: E-02 は ③ ÷ ② が 10 以上 (増益)・0.1 以下 (減益)', () => {
    const at = (prev: number, cur: number) => dev(make('E-02', set(set(easy(), 'tanshin.incomeStatement.previous.operatingIncome', prev), 'tanshin.incomeStatement.current.operatingIncome', cur)));
    expect(at(4480, 49200)).toEqual([]); // 10.98
    expect(at(4480, 448)).toEqual([]); // 0.1 ちょうど
    expect(at(4480, 40000)).toHaveLength(1); // 8.9
    expect(at(4480, 4500)).toHaveLength(1);
  });
  it('M7: 検査の無い種類・正常な問題は空 (今の正常な問題も)', () => {
    expect(dev(make('E-17', easy()))).toEqual([]);
    expect(dev(make('H-17', hard()))).toEqual([]);
    expect(dev(easy())).toEqual([]);
    for (const p of problems.filter((q) => q.anomaly === null)) expect(dev(p, companyOf(p))).toEqual([]);
  });
  it('M8: メッセージに種類・実際のずれ・最小のずれ', () => {
    const [m] = dev(make('H-05', set(hard(), 'tanshin.cashFlow.receivablesChange', -81)));
    expect(m).toContain('H-05');
    expect(m).toContain('20%');
    const [e24] = dev(make('E-24', set(easy(), 'tanshin.incomeStatement.current.netSales', 5000)));
    expect(e24).toContain('E-24');
  });
  it('clone を使って元を壊さない', () => {
    const p = easy();
    const before = clone(p);
    dev(make('E-12', p));
    expect(p).toEqual(before);
    expect(dataKinds.length).toBeGreaterThan(0);
  });
});
