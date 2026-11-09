// ケース表 docs/test-cases/cards.md §1〜§2 (DE・DH・DF・DD・DX・P): カードの導出 deriveCards (Sub-task #180)。v3 = 難易度ごとに 1 つの形。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { companies, problems } from '../data/pool-source.ts';
import { clone, companyA, companyB, normalA, normalB, set, valueAt } from '../verifier/test-utils.ts';
import { cardCells, countNumbers, countTexts, deriveCards, placeSlots, templateKeys } from './cards.ts';
import type { Card, CardSlot } from './cards.ts';
import type { CardEdit, Company, Problem } from './types.ts';

const easyB = (): Problem => normalB();
const hardB = (): Problem => ({ ...normalB(), difficulty: 'hard' });
const derive = (p: Problem, c: Company = companyB()): Card => deriveCards(p, c, p.difficulty);
const slot = (card: Card, key: string): CardSlot => {
  const found = card.slots.find((s) => s.key === key);
  if (!found) throw new Error(`欄が無い: ${key}`);
  return found;
};
const keys = (card: Card): string[] => card.slots.map((s) => s.key);
const texts = (card: Card): string[] => card.slots.map((s) => s.text);
const withEdit = (p: Problem, edit: CardEdit): Problem => ({ ...p, cardEdits: [edit] });

const CARD_KEYS = ['sales', 'opPrev', 'opCurr', 'margin'];
const HARD_KEYS = [
  ...CARD_KEYS,
  'pbt',
  'cash', 'arPrev', 'arCurr', 'ta', 'tlna',
  'cfStart', 'cfAr', 'ocf', 'cfEnd',
  'audit', 'policyFlag', 'policyNote', 'subseq', 'segs',
  'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev',
  'irOcf', 'irSubseq', 'irSegs',
];

afterEach(() => vi.restoreAllMocks());

describe('1.3 やさしい (DE1〜DE3)', () => {
  it('DE1: 欄の key・数字と文の数・枠', () => {
    const card = derive(easyB());
    expect(keys(card)).toEqual(CARD_KEYS);
    expect(templateKeys('easy')).toEqual(CARD_KEYS);
    expect(countNumbers(card)).toBe(4);
    expect(countTexts(card)).toBe(0);
    expect(card.difficulty).toBe('easy');
    expect(card.headline?.word).toBe('増益');
    expect(card.irFrame).toBeUndefined();
    expect(card.footer).toBeDefined();
    expect(card.slots.some((s) => s.heading !== undefined)).toBe(false);
  });
  it('DE2: 値・単位・科目名・列・読むセル', () => {
    const card = derive(easyB());
    expect(texts(card)).toEqual(['12,400', '1,120', '1,240', '10.0']);
    expect(card.slots.map((s) => s.unit)).toEqual(['百万円', '百万円', '百万円', '%']);
    expect(card.slots.map((s) => s.label)).toEqual(['売上高', '営業利益 (前期)', '営業利益 (当期)', '売上高営業利益率']);
    expect(card.slots.map((s) => s.raw)).toEqual([12400, 1120, 1240, 10]);
    expect(card.slots.map((s) => s.measure)).toEqual(['money', 'money', 'money', 'percent']);
    expect(card.slots.map((s) => s.column)).toEqual([undefined, 'previous', 'current', undefined]);
    expect(card.slots.map((s) => s.section)).toEqual(['card', 'card', 'card', 'card']);
    expect(card.slots.map((s) => s.reads[0])).toEqual([
      'tanshin.incomeStatement.current.netSales',
      'tanshin.incomeStatement.previous.operatingIncome',
      'tanshin.incomeStatement.current.operatingIncome',
      'tanshin.summary.operatingMargin',
    ]);
    expect(card.slots.every((s) => s.kind === 'number')).toBe(true);
  });
  it('DE3: 枠 (社章・社名・期)・見出し語・足元', () => {
    const card = derive(easyB());
    const c = companyB();
    expect(card.frame).toMatchObject({ companyName: c.name, securitiesCode: c.securitiesCode, emblem: c.emblem, periodLabel: '2027年3月期' });
    expect(card.frame.reads).toEqual(['tanshin.header.companyName', 'tanshin.header.securitiesCode', 'tanshin.header.periodLabel']);
    expect(card.headline).toEqual({ word: '増益', repeat: 1, reads: ['ir.statements.0'] });
    expect(card.footer).toEqual({ periodEnd: '2027年3月31日', reads: ['tanshin.columnDates.incomeStatement.current'] });
  });
});

describe('1.3 むずかしい (DH1〜DH9)', () => {
  it('DH1: 欄の並び・数字 19・文 8・カードはやさしいと同じ', () => {
    const card = derive(hardB());
    expect(keys(card)).toEqual(HARD_KEYS);
    expect(templateKeys('hard')).toEqual(HARD_KEYS);
    expect(countNumbers(card)).toBe(19);
    expect(countTexts(card)).toBe(8);
    expect(card.irFrame).toBeDefined();
    expect(card.slots.slice(0, 4)).toEqual(derive(easyB()).slots);
    expect(card.headline).toEqual(derive(easyB()).headline);
    expect(card.footer).toEqual(derive(easyB()).footer);
  });
  it('DH2: section の並びと貸借の見出し', () => {
    const card = derive(hardB());
    expect(card.slots.map((s) => s.section)).toEqual([
      ...Array(4).fill('card'), 'pl', ...Array(5).fill('bs'), ...Array(4).fill('cf'), ...Array(5).fill('notes'), ...Array(8).fill('ir'),
    ]);
    expect(card.slots.map((s) => s.heading)).toEqual(card.slots.map((s) => ({ cash: '資産', arPrev: '資産', arCurr: '資産', ta: '資産', tlna: '負債及び純資産' } as Record<string, string>)[s.key]));
  });
  it('DH3: 値・単位・科目名 (B)', () => {
    const card = derive(hardB());
    const only = (ks: string[]) => ks.map((k) => slot(card, k).text);
    expect(only(['pbt', 'cash', 'arPrev', 'arCurr', 'ta', 'tlna', 'cfStart', 'cfAr', 'ocf', 'cfEnd'])).toEqual(['1,250', '2,300', '2,900', '3,000', '15,200', '15,200', '1,250', '△100', '1,500', '2,300']);
    expect(only(['irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev'])).toEqual(['124.0', '23.0', '21.0', '48.3', '27.3']);
    expect(['pbt', 'cash', 'ta', 'cfEnd'].map((k) => slot(card, k).unit)).toEqual(['百万円', '百万円', '百万円', '百万円']);
    expect(['irSales', 'irCashCur', 'irNetDebtPrev'].map((k) => slot(card, k).unit)).toEqual(['億円', '億円', '億円']);
    expect(only(['audit', 'policyFlag', 'policyNote', 'subseq', 'segs'])).toEqual([
      '決算短信は公認会計士又は監査法人の監査の対象外です',
      'なし',
      '該当事項はありません。',
      '該当事項はありません。',
      '電機部品事業・計測機器事業・産業機器事業',
    ]);
    expect(only(['irOcf', 'irSubseq', 'irSegs'])).toEqual(['営業活動によるキャッシュ・フローはプラス', 'なし', '電機部品事業・計測機器事業・産業機器事業']);
    expect(card.slots.filter((s) => s.kind === 'text').length).toBe(8);
    const labels = (ks: string[]) => ks.map((k) => slot(card, k).label);
    expect(labels(['pbt', 'cash', 'arPrev', 'arCurr', 'ta', 'tlna'])).toEqual(['税金等調整前当期純利益 (損益)', '現金及び預金', '売掛金 (前期末)', '売掛金 (当期末)', '資産合計', '負債純資産合計']);
    expect(labels(['cfStart', 'cfAr', 'ocf', 'cfEnd'])).toEqual(['税金等調整前当期純利益 (CF)', '売上債権 (売掛金) の増減額', '営業活動によるキャッシュ・フロー', '現金及び現金同等物の期末残高 (資金の範囲 = 現金及び預金)']);
    expect(labels(['audit', 'policyFlag', 'policyNote', 'subseq', 'segs'])).toEqual(['監査についての注意書き', '会計方針の変更の有無', '会計方針の変更', '重要な後発事象', 'セグメント']);
    expect(labels(['irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev', 'irOcf', 'irSubseq', 'irSegs'])).toEqual([
      '売上高', '現金及び預金 (当期)', '現金及び預金 (前期)', '有利子負債 (前期)', '純有利子負債 (前期・有利子負債 − 現金)', '営業活動によるキャッシュ・フローの説明', '期末後の出来事', 'セグメント',
    ]);
    expect(card.irFrame).toMatchObject({ companyName: hardB().ir.header.companyName, periodLabel: hardB().ir.header.periodLabel, reads: ['ir.header.companyName', 'ir.header.periodLabel'] });
  });
  it('DH4: 期末残高の読むセルと資金の範囲', () => {
    const card = derive(hardB());
    expect(slot(card, 'cfEnd').reads).toEqual(['tanshin.cashFlow.cashEnding', 'tanshin.notes.cashScope']);
    expect(cardCells(card).has('tanshin.notes.cashScope')).toBe(true);
    const changed = derive(set(hardB(), 'tanshin.notes.cashScope', '現金及び預金・定期預金'));
    expect(slot(changed, 'cfEnd').label).toBe('現金及び現金同等物の期末残高 (資金の範囲 = 現金及び預金・定期預金)');
    expect(countNumbers(changed)).toBe(19);
    const typo = derive({ ...hardB(), labelOverrides: { 'tanshin.cashFlow.cashEnding': '現金及び現金同等物の期末残高 ' } });
    expect(slot(typo, 'cfEnd').label.startsWith('現金及び現金同等物の期末残高 ')).toBe(true);
  });
  it('DH5: IR の営業 CF の文は claims から型で作る', () => {
    const p = hardB();
    expect(slot(derive(p), 'irOcf').reads).toEqual(['ir.statements.2']);
    const down = set(p, 'ir.statements.2.claims.0.direction', 'down');
    expect(slot(derive(down), 'irOcf').text).toBe('営業活動によるキャッシュ・フローはマイナス');
    expect([...slot(derive(down), 'irOcf').text].length).toBe(21);
    // text を書き換えてもカードは変わらない・labelOverrides は読まない (短信の ocf だけが誤字になる)
    expect(derive(set(p, 'ir.statements.2.text', '営業 CF は赤字')).slots).toEqual(derive(p).slots);
    const typo = derive({ ...p, labelOverrides: { 'tanshin.cashFlow.operatingCashFlow': '営業活動によるキャッシュ・フロ' } });
    expect(slot(typo, 'irOcf').text).toBe('営業活動によるキャッシュ・フローはプラス');
    expect(slot(typo, 'ocf').label).toBe('営業活動によるキャッシュ・フロ');
    // 主張が無い・zero → 欄が出ない (例外にしない)
    expect(keys(derive(set(p, 'ir.statements.2.claims', [])))).not.toContain('irOcf');
    expect(keys(derive(set(p, 'ir.statements.2.claims.0.direction', 'zero')))).not.toContain('irOcf');
  });
  it('DH6: 期末後の出来事', () => {
    const p = set(hardB(), 'ir.outlook.subsequentEvent', '期末後に工場を取得した。');
    expect(slot(derive(p), 'irSubseq')).toMatchObject({ text: '期末後に工場を取得した。', reads: ['ir.outlook.subsequentEvent'] });
    expect(slot(derive(hardB()), 'irSubseq').text).toBe('なし');
  });
  it('DH7: 科目名の差し替えは itemKey ごと (売掛金 → 買掛金・営業利益 → 営業和益)', () => {
    const ar = derive({ ...hardB(), labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } });
    expect(['arPrev', 'arCurr'].map((k) => slot(ar, k).label)).toEqual(['買掛金 (前期末)', '買掛金 (当期末)']);
    expect(['arPrev', 'arCurr'].map((k) => slot(ar, k).heading)).toEqual(['資産', '資産']);
    expect(slot(ar, 'cfAr').label).toBe('売上債権 (売掛金) の増減額');
    const op = derive({ ...easyB(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } });
    expect(['opPrev', 'opCurr'].map((k) => slot(op, k).label)).toEqual(['営業和益 (前期)', '営業和益 (当期)']);
  });
  it('DH8: column は前期・当期の欄だけに付き、添え字と対応する', () => {
    const card = derive(hardB());
    const cols = card.slots.filter((s) => s.column !== undefined).map((s) => [s.key, s.column]);
    expect(cols).toEqual([['opPrev', 'previous'], ['opCurr', 'current'], ['arPrev', 'previous'], ['arCurr', 'current'], ['irCashCur', 'current'], ['irCashPrev', 'previous'], ['irDebtPrev', 'previous'], ['irNetDebtPrev', 'previous']]);
    for (const s of card.slots.filter((x) => x.column !== undefined)) expect(s.label).toContain(s.column === 'previous' ? '(前期' : '(当期');
  });
  it('DH9: 見出し語は営業利益の主張だけを読む', () => {
    const p = easyB();
    expect(derive(set(p, 'ir.statements.0.claims.0.direction', 'down')).headline?.word).toBe('増益'); // netSales の主張は読まない
    expect(derive(set(p, 'ir.statements.0.claims.1.direction', 'down')).headline).toEqual({ word: '減益', repeat: 1, reads: ['ir.statements.0'] });
    expect(derive(set(p, 'ir.statements.0.claims.1.direction', 'zero')).headline).toBeUndefined();
    expect(derive(set(p, 'ir.statements', [])).headline).toBeUndefined();
    // 営業利益の主張が別の文にあれば、その文の添字
    const moved = set(set(p, 'ir.statements.0.claims', [{ metric: 'netSales', direction: 'up' }]), 'ir.statements.1.claims', [{ metric: 'operatingIncome', direction: 'down' }]);
    expect(derive(moved).headline).toEqual({ word: '減益', repeat: 1, reads: ['ir.statements.1'] });
  });
});

describe('1.4 書式 (DF1〜DF5)', () => {
  it('DF1・DF2: 3 桁区切り・0・7 桁・負の数は △', () => {
    let p = set(set(easyB(), 'tanshin.incomeStatement.current.netSales', 1234567), 'tanshin.incomeStatement.previous.operatingIncome', 0);
    expect(slot(derive(p), 'sales').text).toBe('1,234,567');
    expect(slot(derive(p), 'opPrev').text).toBe('0');
    p = set(hardB(), 'tanshin.cashFlow.receivablesChange', -100);
    expect(slot(derive(p), 'cfAr').text).toBe('△100');
  });
  it('DF3: 比率は小数第一位・単位 %', () => {
    expect(slot(derive(set(easyB(), 'tanshin.summary.operatingMargin', 5)), 'margin')).toMatchObject({ text: '5.0', unit: '%' });
  });
  it('DF4: IR の金額は会社の irUnit によらず小数第一位。unit は ir.header.unit', () => {
    const asMillion: Company = { ...companyB(), irUnit: '百万円' };
    expect(slot(deriveCards(hardB(), asMillion, 'hard'), 'irSales').text).toBe('124.0');
    const a = deriveCards({ ...normalA(), difficulty: 'hard' }, companyA(), 'hard'); // A の IR は百万円・整数 12,400 を持つ (データの課題)
    expect(slot(a, 'irSales').unit).toBe('百万円');
    expect(slot(a, 'irSales').text).toBe('12,400.0');
  });
  it('DF5: unitOverrides・signOverrides は deriveCards が読まない', () => {
    const p = { ...hardB(), unitOverrides: { 'tanshin.incomeStatement': '億円' }, signOverrides: { 'tanshin.cashFlow.receivablesChange': '▲' } };
    expect(derive(p).slots).toEqual(derive(hardB()).slots);
  });
});

describe('1.5 期末日の表示 (DD1〜DD4)', () => {
  const footer = (iso: string, edit?: CardEdit): string => {
    const p = set(easyB(), 'tanshin.columnDates.incomeStatement.current', iso);
    return derive(edit ? withEdit(p, edit) : p).footer?.periodEnd ?? '';
  };
  it('DD1〜DD3: 文字列の切り出し', () => {
    expect(footer('2024-03-31')).toBe('2024年3月31日');
    expect(footer('2025-02-28')).toBe('2025年2月28日');
    expect(footer('2024-03-05')).toBe('2024年3月5日');
    expect(footer('2024-02-29')).toBe('2024年2月29日');
  });
  it('DD4: day の編集は日を 32 にする (繰り上がらない・Date を使わない・セルは変わらない)', () => {
    const p = withEdit(easyB(), { card: 0, slot: 'period', op: 'day', day: 32 });
    const RealDate = Date;
    vi.stubGlobal('Date', class {
      constructor() {
        throw new Error('Date を使った');
      }
      static now(): number {
        throw new Error('Date.now を使った');
      }
    });
    let out: Card;
    try {
      out = derive(p);
    } finally {
      vi.stubGlobal('Date', RealDate);
    }
    expect(out.footer?.periodEnd).toBe('2027年3月32日');
    expect(p.tanshin.columnDates.incomeStatement.current).toBe('2027-03-31');
  });
});

describe('2.1 cardEdits の効果 (DX1〜DX12)', () => {
  const E = (e: CardEdit, p: Problem = easyB()): Card => derive(withEdit(p, e));
  it('DX1: drop', () => expect(keys(E({ card: 0, slot: 'margin', op: 'drop' }))).toEqual(['sales', 'opPrev', 'opCurr']));
  it('DX2: format (no-comma・comma-shift・5 桁未満は RangeError)', () => {
    const noComma = E({ card: 0, slot: 'sales', op: 'format', style: 'no-comma' });
    expect(slot(noComma, 'sales')).toMatchObject({ text: '12400', raw: 12400 });
    expect(slot(E({ card: 0, slot: 'sales', op: 'format', style: 'comma-shift' }), 'sales').text).toBe('1,2400');
    const big = set(easyB(), 'tanshin.incomeStatement.current.netSales', 96930);
    expect(slot(E({ card: 0, slot: 'sales', op: 'format', style: 'comma-shift' }, big), 'sales').text).toBe('9,6930');
    expect(() => E({ card: 0, slot: 'opCurr', op: 'format', style: 'comma-shift' })).toThrow(RangeError);
  });
  it('DX3: unit', () => {
    const c = E({ card: 0, slot: 'sales', op: 'unit', unit: '億円' });
    expect(c.slots.map((s) => s.unit)).toEqual(['億円', '百万円', '百万円', '%']);
  });
  it('DX4: dup (数字の欄・見出し語・文欄)', () => {
    const c = E({ card: 0, slot: 'opCurr', op: 'dup' });
    expect(keys(c)).toEqual(['sales', 'opPrev', 'opCurr', 'opCurr', 'margin']);
    expect(countNumbers(c)).toBe(5);
    expect(E({ card: 0, slot: 'headline', op: 'dup' }).headline?.repeat).toBe(2);
    const h = E({ card: 0, slot: 'audit', op: 'dup' }, hardB());
    expect(keys(h).filter((k) => k === 'audit')).toHaveLength(2);
    expect(keys(h).indexOf('audit') + 1).toBe(keys(h).lastIndexOf('audit'));
  });
  it('DX5: suffix', () => {
    const c = E({ card: 0, slot: 'opPrev', op: 'suffix', word: '当期' });
    expect(slot(c, 'opPrev')).toMatchObject({ label: '営業利益 (当期)', column: 'previous', text: '1,120' });
    expect(slot(E({ card: 0, slot: 'opCurr', op: 'suffix', word: '前期' }), 'opCurr').label).toBe('営業利益 (前期)');
    expect(() => E({ card: 0, slot: 'sales', op: 'suffix', word: '前期' } as unknown as CardEdit)).toThrow(RangeError);
  });
  it('DX6: glyph (at は text の文字の添字)', () => {
    expect(slot(E({ card: 0, slot: 'opCurr', op: 'glyph', at: 2 }), 'opCurr')).toMatchObject({ text: '1,X40', raw: 1240 });
    expect(slot(E({ card: 0, slot: 'opCurr', op: 'glyph', at: 3 }), 'opCurr').text).toBe('1,2X0');
    expect(slot(E({ card: 0, slot: 'margin', op: 'glyph', at: 0 }), 'margin').text).toBe('X0.0');
    expect(() => E({ card: 0, slot: 'opCurr', op: 'glyph', at: 1 })).toThrow(RangeError);
    expect(() => E({ card: 0, slot: 'opCurr', op: 'glyph', at: 5 })).toThrow(RangeError);
  });
  it('DX7: sign (値は正のまま)', () => {
    expect(slot(E({ card: 0, slot: 'sales', op: 'sign' }), 'sales')).toMatchObject({ text: '△12,400', raw: 12400 });
  });
  it('DX9: headline', () => expect(E({ card: 0, op: 'headline', word: '増収' }).headline).toEqual({ word: '増収', repeat: 1, reads: ['ir.statements.0'] }));
  it('DX10: 形に無い欄・card が 0 でない・見出し語や表題の drop → RangeError', () => {
    expect(() => E({ card: 0, slot: 'nope', op: 'drop' })).toThrow(RangeError);
    expect(() => E({ card: 0, slot: 'irSales', op: 'drop' })).toThrow(RangeError); // やさしいに無い欄
    expect(() => E({ card: 1 as 0, slot: 'margin', op: 'drop' })).toThrow(RangeError);
    expect(() => E({ card: 0, slot: 'headline', op: 'drop' })).toThrow(RangeError);
    expect(() => E({ card: 0, slot: 'frame', op: 'drop' })).toThrow(RangeError);
    expect(() => E({ card: 0, op: 'headline', word: '増収' }, set(easyB(), 'ir.statements', []))).toThrow(RangeError); // 見出し語の無い問題に headline の編集
    expect(() => E({ card: 0, slot: 'headline', op: 'dup' }, set(easyB(), 'ir.statements', []))).toThrow(RangeError);
  });
  it('DX11: applyEdits: false はテンプレートのカード', () => {
    const edits: CardEdit[] = [
      { card: 0, slot: 'margin', op: 'drop' },
      { card: 0, slot: 'sales', op: 'format', style: 'no-comma' },
      { card: 0, slot: 'sales', op: 'unit', unit: '億円' },
      { card: 0, slot: 'opCurr', op: 'dup' },
      { card: 0, slot: 'opPrev', op: 'suffix', word: '当期' },
      { card: 0, slot: 'opCurr', op: 'glyph', at: 2 },
      { card: 0, slot: 'sales', op: 'sign' },
      { card: 0, slot: 'period', op: 'day', day: 32 },
      { card: 0, op: 'headline', word: '増収' },
    ];
    for (const e of edits) {
      const p = withEdit(easyB(), e);
      expect(deriveCards(p, companyB(), 'easy', { applyEdits: false })).toEqual(derive(easyB()));
      expect(derive(p)).not.toEqual(derive(easyB()));
    }
  });
  it('DX12: むずかしいの欄の key で効く', () => {
    const h = hardB();
    expect(keys(E({ card: 0, slot: 'irSales', op: 'drop' }, h))).not.toContain('irSales');
    expect(slot(E({ card: 0, slot: 'ta', op: 'format', style: 'no-comma' }, h), 'ta').text).toBe('15200');
    expect(slot(E({ card: 0, slot: 'irSales', op: 'unit', unit: '百万円' }, h), 'irSales').unit).toBe('百万円');
    expect(slot(E({ card: 0, slot: 'ta', op: 'sign' }, h), 'ta').text).toBe('△15,200');
    expect(E({ card: 0, slot: 'period', op: 'drop' }, h).footer).toBeUndefined();
  });
});

describe('難易度・純関数・今のデータ', () => {
  it('難易度が問題と違えば RangeError', () => {
    expect(() => deriveCards(easyB(), companyB(), 'hard')).toThrow(RangeError);
    expect(() => deriveCards(hardB(), companyB(), 'easy')).toThrow(RangeError);
  });
  it('同じ入力 → 同じ出力・入力を書き換えない・乱数と時刻を見ない', () => {
    const p = hardB();
    const before = clone(p);
    const c = companyB();
    const first = derive(p, c);
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('random');
    });
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('now');
    });
    expect(derive(p, c)).toEqual(first);
    expect(p).toEqual(before);
    expect(c).toEqual(companyB());
  });
  it('今の全問 (57 問): 導ける・数字と文の数・読むセルが実在する・やさしいのカードはむずかしいのカードと同じ作り', () => {
    expect(problems.length).toBeGreaterThanOrEqual(57);
    for (const p of problems) {
      const company = companies.find((c) => c.id === p.companyId) as Company;
      // 異変の問題はテンプレートのカード (cardEdits の無い今のデータでは同じ)
      const card = deriveCards(p, company, p.difficulty, { applyEdits: false });
      expect(countNumbers(card), p.id).toBe(p.difficulty === 'easy' ? 4 : 19);
      expect(countTexts(card), p.id).toBe(p.difficulty === 'easy' ? 0 : 8);
      for (const s of card.slots) for (const r of s.reads) expect(valueAt(p, r), `${p.id} ${s.key} ${r}`).not.toBeUndefined();
      for (const r of [...card.frame.reads, ...(card.headline?.reads ?? []), ...(card.footer?.reads ?? []), ...(card.irFrame?.reads ?? [])]) expect(valueAt(p, r), `${p.id} ${r}`).not.toBeUndefined();
    }
  });
});

describe('2.3 答え合わせの場所 placeSlots (P1〜P6)', () => {
  const easy = derive(easyB());
  const hard = derive(hardB());
  it('P1: パス・itemKey・無い場所', () => {
    expect(placeSlots(easy, { doc: 'tanshin', path: 'summary.operatingMargin' })).toEqual(['margin']);
    expect(placeSlots(easy, { doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' })).toEqual(['opPrev', 'opCurr']);
    expect(placeSlots(easy, { doc: 'tanshin', path: 'balanceSheet.current.totalAssets' })).toEqual([]);
  });
  it('P2: 文章の場所は見出し語 (text の下も子として)', () => {
    expect(placeSlots(easy, { doc: 'ir', path: 'statements.0' })).toEqual(['headline']);
    expect(placeSlots(easy, { doc: 'ir', path: 'statements.0.text' })).toEqual(['headline']);
  });
  it('P3: 期と期末日', () => {
    expect(placeSlots(easy, { doc: 'tanshin', path: 'header.periodLabel' })).toEqual(['frame', 'frame.period']);
    expect(placeSlots(easy, { doc: 'tanshin', path: 'columnDates.incomeStatement.current' })).toEqual(['frame.period', 'period']);
  });
  it('P4・P5: 入れ物・IR の表題 (むずかしい)', () => {
    expect(placeSlots(hard, { doc: 'ir', path: 'segments.items' })).toEqual(['irSegs']);
    expect(placeSlots(hard, { doc: 'ir', path: 'segments.items.2' })).toEqual(['irSegs']);
    expect(placeSlots(hard, { doc: 'ir', path: 'header.companyName' })).toEqual(['irHead']);
    expect(placeSlots(easy, { doc: 'ir', path: 'header.companyName' })).toEqual([]);
  });
  it('P6: card の場所は key のとおり。形に無い key は空', () => {
    for (const k of ['margin', 'headline', 'frame', 'frame.period', 'period']) expect(placeSlots(easy, { doc: 'card', card: 0, slot: k })).toEqual([k]);
    expect(placeSlots(hard, { doc: 'card', card: 0, slot: 'irHead' })).toEqual(['irHead']);
    expect(placeSlots(easy, { doc: 'card', card: 0, slot: 'nope' })).toEqual([]);
    expect(placeSlots(easy, { doc: 'card', card: 0, slot: 'irSales' })).toEqual([]);
  });
  it('cardCells: 場所のセル card.0.<key> と読むセル', () => {
    const cells = cardCells(hard);
    for (const k of [...HARD_KEYS, 'headline', 'frame', 'frame.period', 'period', 'irHead']) expect(cells.has(`card.0.${k}`), k).toBe(true);
    expect(cells.has('tanshin.incomeStatement.current.netSales')).toBe(true);
    expect(cells.has('tanshin.incomeStatement.current.netSales') && cells.has('tanshin.columnDates.incomeStatement.current')).toBe(true);
    expect(cardCells(easy).has('card.0.irHead')).toBe(false);
    expect(cardCells(easy).has('tanshin.balanceSheet.current.totalAssets')).toBe(false);
  });
});
