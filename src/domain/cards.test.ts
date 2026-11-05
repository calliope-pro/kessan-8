// ケース表 docs/test-cases/cards.md §1 (D*): カードの導出 deriveCards (Sub-task #152)。
import { describe, expect, it, vi } from 'vitest';
import { clone, companyA, companyB, normalA, normalB, set } from '../verifier/test-utils.ts';
import { getPath } from '../verifier/path.ts';
import { companies, problems } from '../data/pool-source.ts';
import {
  cardCells,
  countNumbers,
  countTexts,
  deriveCards,
  difficultyOfShape,
  placeSlots,
  SHAPE_IDS,
  shapesOf,
  templateKeys,
} from './cards.ts';
import type { Card, CardSlot } from './cards.ts';
import type { CardEdit, Company, Problem, ShapeId } from './types.ts';

const easyA = (): Problem => normalA();
const hardA = (): Problem => ({ ...normalA(), difficulty: 'hard' });
const hardB = (): Problem => ({ ...normalB(), difficulty: 'hard' });
const slot = (card: Card | undefined, key: string): CardSlot => {
  const found = card?.slots.find((s) => s.key === key);
  if (!found) throw new Error(`欄が無い: ${key}`);
  return found;
};
const texts = (card: Card | undefined): string[] => (card?.slots ?? []).map((s) => s.text);
const keys = (card: Card | undefined): string[] => (card?.slots ?? []).map((s) => s.key);
const withEdit = (p: Problem, edit: CardEdit): Problem => ({ ...p, cardEdits: [edit] });
const E1 = (p: Problem, c: Company = companyA()): Card => deriveCards(p, c, 'E1')[0] as Card;

describe('1.1 形の定義', () => {
  it('shapesOf・difficultyOfShape・SHAPE_IDS', () => {
    expect(SHAPE_IDS).toEqual(['E1', 'E2', 'E3', 'H1', 'H2', 'H3']);
    expect(shapesOf('easy')).toEqual(['E1', 'E2', 'E3']);
    expect(shapesOf('hard')).toEqual(['H1', 'H2', 'H3']);
    expect(SHAPE_IDS.map(difficultyOfShape)).toEqual(['easy', 'easy', 'easy', 'hard', 'hard', 'hard']);
  });

  // [形, 問題, カードごとの doc・欄の key・数字の数・文の数]
  const table: [ShapeId, () => Problem, { doc: string; keys: string[]; n: number; t: number }[]][] = [
    ['E1', easyA, [{ doc: 'summary', keys: ['netSales', 'opPrev', 'opCur', 'margin'], n: 4, t: 0 }]],
    ['E2', easyA, [{ doc: 'summary', keys: ['salesPrev', 'salesCur'], n: 4, t: 0 }]],
    ['E3', easyA, [{ doc: 'summary', keys: ['currentAssets', 'fixedAssets', 'totalAssets'], n: 3, t: 0 }]],
    [
      'H1',
      hardA,
      [
        { doc: 'tanshin', keys: ['salesPrev', 'salesCur', 'totalAssets', 'totalLiabNet'], n: 4, t: 0 },
        { doc: 'ir', keys: ['netSales', 'claim'], n: 1, t: 1 },
      ],
    ],
    [
      'H2',
      hardA,
      [
        { doc: 'tanshin', keys: ['recvPrev', 'recvCur', 'recvChange', 'operatingCf', 'recvRow', 'policyChange', 'policyNote'], n: 4, t: 3 },
        { doc: 'ir', keys: ['claim'], n: 0, t: 1 },
      ],
    ],
    [
      'H3',
      hardA,
      [
        { doc: 'tanshin', keys: ['cfStart', 'plStart', 'cash', 'cfEnd', 'auditNote', 'subsequent', 'segments'], n: 4, t: 3 },
        { doc: 'ir', keys: ['cashCur', 'cashPrev', 'debtPrev', 'netDebtPrev', 'subsequent', 'segments'], n: 4, t: 2 },
      ],
    ],
  ];
  it.each(table)('D1〜D9: %s のカードの枚数・doc・欄の key の並び・数字と文の数', (shape, make, expected) => {
    const cards = deriveCards(make(), companyA(), shape);
    expect(cards.map((c) => c.doc)).toEqual(expected.map((e) => e.doc));
    cards.forEach((card, i) => {
      expect(keys(card)).toEqual(expected[i]?.keys);
      expect(countNumbers(card)).toBe(expected[i]?.n);
      expect(countTexts(card)).toBe(expected[i]?.t);
    });
    expect(templateKeys(shape)).toEqual(expected.map((e) => e.keys));
  });

  it('難易度の違う形は RangeError', () => {
    expect(() => deriveCards(easyA(), companyA(), 'H1')).toThrow(RangeError);
    expect(() => deriveCards(hardA(), companyA(), 'E1')).toThrow(RangeError);
  });
});

describe('1.2 値 (基準問題 A・B)', () => {
  it('D10: A の E1', () => {
    const card = E1(easyA());
    expect(card.frame).toMatchObject({ companyName: easyA().tanshin.header.companyName, securitiesCode: easyA().tanshin.header.securitiesCode, periodLabel: easyA().tanshin.header.periodLabel, periodEnd: '2027-03-31' });
    expect(card.headline).toEqual({ word: '増益', reads: ['ir.statements.0'] });
    expect(texts(card)).toEqual(['12,400', '1,120', '1,240', '10.0']);
    expect(card.slots.map((s) => s.unit)).toEqual(['百万円', '百万円', '百万円', '%']);
    expect(card.slots.map((s) => s.label)).toEqual(['売上高', '営業利益 (前期)', '営業利益 (当期)', '売上高営業利益率']);
    expect(card.slots.map((s) => s.reads)).toEqual([
      ['tanshin.incomeStatement.current.netSales'],
      ['tanshin.incomeStatement.previous.operatingIncome'],
      ['tanshin.incomeStatement.current.operatingIncome'],
      ['tanshin.summary.operatingMargin'],
    ]);
    expect(card.slots.map((s) => s.raw)).toEqual([12400, 1120, 1240, 10]);
    expect(card.slots.every((s) => s.kind === 'number')).toBe(true);
  });

  it('D11: A の E2 (headline・欄・棒)', () => {
    const card = deriveCards(easyA(), companyA(), 'E2')[0] as Card;
    expect(card.headline?.word).toBe('増収');
    expect(texts(card)).toEqual(['11,800', '12,400']);
    expect(card.slots.map((s) => s.label)).toEqual(['売上高 (前期)', '売上高 (当期)']);
    expect(card.bars).toMatchObject({ axisMin: 0, items: [{ key: 'previous', value: 11800, reads: ['ir.results.chart.netSales.previous'] }, { key: 'current', value: 12400, reads: ['ir.results.chart.netSales.current'] }] });
    expect(cardCells([card]).has('ir.results.chart.netSales.axisMin')).toBe(true);
    expect(JSON.stringify(card)).not.toContain('tick');
  });

  it('D12: B の E2 の棒は IR の単位の値のまま、欄は短信の百万円', () => {
    const card = deriveCards(normalB(), companyB(), 'E2')[0] as Card;
    expect(card.bars?.items.map((i) => i.value)).toEqual([118.0, 124.0]);
    expect(texts(card)).toEqual(['11,800', '12,400']);
  });

  it('D13: A の E3', () => {
    const card = deriveCards(easyA(), companyA(), 'E3')[0] as Card;
    expect(texts(card)).toEqual(['7,700', '7,500', '15,200']);
    expect(card.slots.map((s) => s.label)).toEqual(['流動資産合計', '固定資産合計', '資産合計']);
    expect(card.headline).toBeUndefined();
  });

  it('D14・D15: H1 (A は百万円、B は億円で IR の数字が 124.0)', () => {
    const [tan, ir] = deriveCards(hardA(), companyA(), 'H1') as [Card, Card];
    expect(texts(tan)).toEqual(['11,800', '12,400', '15,200', '15,200']);
    expect(texts(ir)).toEqual(['12,400', '売上高・営業利益ともに前期を上回った。']);
    expect(slot(ir, 'claim').reads).toEqual(['ir.statements.0']);
    const [, irB] = deriveCards(hardB(), companyB(), 'H1') as [Card, Card];
    expect(slot(irB, 'netSales')).toMatchObject({ text: '124.0', unit: '億円', raw: 124 });
    expect(slot(ir, 'netSales').unit).toBe('百万円');
  });

  it('D16: A の H2', () => {
    const [tan, ir] = deriveCards(hardA(), companyA(), 'H2') as [Card, Card];
    expect(texts(tan)).toEqual(['2,900', '3,000', '△100', '1,500', '売掛金 (資産の部)', 'なし', '該当事項はありません。']);
    expect(tan.slots.map((s) => s.kind)).toEqual(['number', 'number', 'number', 'number', 'text', 'text', 'text']);
    expect(texts(ir)).toEqual(['営業キャッシュ・フローは堅調であった。']);
    expect(slot(ir, 'claim').reads).toEqual(['ir.statements.2']);
  });

  it('D17: A の H3', () => {
    const [tan, ir] = deriveCards(hardA(), companyA(), 'H3') as [Card, Card];
    expect(texts(tan)).toEqual(['1,250', '1,250', '2,300', '2,300', '決算短信は公認会計士又は監査法人の監査の対象外です', '該当事項はありません。', '電機部品事業・産業機器事業']);
    expect(slot(tan, 'cfStart').label).toBe('税金等調整前当期純利益 (CF)');
    expect(slot(tan, 'plStart').label).toBe('税金等調整前当期純利益 (損益)');
    expect(slot(tan, 'segments').reads).toEqual(['tanshin.notes.segments.current.segments.0.name', 'tanshin.notes.segments.current.segments.1.name']);
    expect(texts(ir)).toEqual(['2,300', '2,100', '4,834', '2,734', 'なし', '電機部品事業・産業機器事業']);
    expect(slot(ir, 'netDebtPrev').label).toBe('純有利子負債 (有利子負債 − 現金)');
  });

  it('D18: B の H3 (億円)', () => {
    const [, ir] = deriveCards(hardB(), companyB(), 'H3') as [Card, Card];
    expect(texts(ir)).toEqual(['23.0', '21.0', '48.3', '27.3', 'なし', '電機部品事業・計測機器事業・産業機器事業']);
    expect(ir.slots.filter((s) => s.kind === 'number').every((s) => s.unit === '億円')).toBe(true);
  });

  it('D19: 期末後の出来事があれば IR の文がその文', () => {
    const p = set(hardA(), 'ir.outlook.subsequentEvent', '期末後に子会社を取得した (取得額 300 百万円)。');
    const ir = deriveCards(p, companyA(), 'H3')[1] as Card;
    expect(slot(ir, 'subsequent').text).toBe('期末後に子会社を取得した (取得額 300 百万円)。');
    expect(slot(ir, 'subsequent').reads).toEqual(['ir.outlook.subsequentEvent']);
  });

  it('D20: 減収・減益 (当期と前期を入れ替え、主張を down)', () => {
    let p = easyA();
    p = set(p, 'tanshin.incomeStatement.current.netSales', 11800);
    p = set(p, 'tanshin.incomeStatement.previous.netSales', 12400);
    p = set(p, 'tanshin.incomeStatement.current.operatingIncome', 1120);
    p = set(p, 'tanshin.incomeStatement.previous.operatingIncome', 1240);
    p = set(p, 'ir.statements.0.claims', [{ metric: 'netSales', direction: 'down' }, { metric: 'operatingIncome', direction: 'down' }]);
    expect(E1(p).headline?.word).toBe('減益');
    expect((deriveCards(p, companyA(), 'E2')[0] as Card).headline?.word).toBe('減収');
  });
});

describe('1.3 書式', () => {
  const fmt = (value: number, p = easyA()) => E1(set(p, 'tanshin.incomeStatement.current.netSales', value)).slots[0]?.text;
  it('D21: 3 桁区切り・0', () => {
    expect(fmt(12400)).toBe('12,400');
    expect(fmt(0)).toBe('0');
    expect(fmt(999)).toBe('999');
  });
  it('D22: 負の数は △ + 絶対値、signOverrides で記号を差し替え', () => {
    expect(fmt(-100)).toBe('△100');
    const p = { ...set(easyA(), 'tanshin.incomeStatement.current.netSales', -100), signOverrides: { 'tanshin.incomeStatement.current.netSales': '▲' } };
    expect(E1(p).slots[0]?.text).toBe('▲100');
  });
  it('D23: 比率は小数第一位・unit %', () => {
    const margin = slot(E1(set(easyA(), 'tanshin.summary.operatingMargin', 10)), 'margin');
    expect(margin).toMatchObject({ text: '10.0', unit: '%' });
    expect(slot(E1(set(easyA(), 'tanshin.summary.operatingMargin', 5.1)), 'margin').text).toBe('5.1');
  });
  it('D24: IR の金額は億円なら小数第一位、百万円なら整数', () => {
    const b = (v: number) => slot(deriveCards(set(hardB(), 'ir.highlights.netSales.amount', v), companyB(), 'H1')[1] as Card, 'netSales').text;
    expect(b(124)).toBe('124.0');
    expect(b(27.3)).toBe('27.3');
    expect(slot(deriveCards(hardA(), companyA(), 'H1')[1] as Card, 'netSales').text).toBe('12,400');
  });
  it('D25: 7 桁・小数つきの桁区切り', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    const b = slot(deriveCards(set(hardB(), 'ir.highlights.netSales.amount', 1234.5), companyB(), 'H1')[1] as Card, 'netSales').text;
    expect(b).toBe('1,234.5');
  });
});

describe('1.4 ラベルと差し替え (R-D2)', () => {
  it('D26: 科目名の誤字', () => {
    const p = { ...easyA(), labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    expect(E1(p).slots.map((s) => s.label)).toEqual(['売上高', '営業和益 (前期)', '営業和益 (当期)', '売上高営業利益率']);
  });
  it('D27: 売掛金 → 買掛金 (資産の部に置かれる)', () => {
    const p = { ...hardA(), labelOverrides: { 'tanshin.balanceSheet.receivables': '買掛金' } };
    const tan = deriveCards(p, companyA(), 'H2')[0] as Card;
    expect(slot(tan, 'recvRow').text).toBe('買掛金 (資産の部)');
    expect(slot(tan, 'recvPrev').label).toBe('買掛金 (前期末)');
    expect(slot(tan, 'recvCur').label).toBe('買掛金 (当期末)');
  });
  it('D28: unitOverrides は、その画面のセルを読む金額の欄だけに効く', () => {
    const p = { ...easyA(), unitOverrides: { 'tanshin.incomeStatement': '億円' } };
    expect(E1(p).slots.map((s) => s.unit)).toEqual(['億円', '億円', '億円', '%']);
    const e3 = deriveCards(p, companyA(), 'E3')[0] as Card;
    expect(e3.slots.map((s) => s.unit)).toEqual(['百万円', '百万円', '百万円']);
  });
  it('D29: 正常な問題の unit は短信 百万円・IR は header.unit', () => {
    expect(E1(easyA()).slots.filter((s) => s.kind === 'number' && s.unit !== '%').every((s) => s.unit === '百万円')).toBe(true);
    const [, ir] = deriveCards(hardB(), companyB(), 'H3') as [Card, Card];
    expect(slot(ir, 'cashCur').unit).toBe(hardB().ir.header.unit);
  });
});

describe('1.5 形のずれ cardEdits (§1.6)', () => {
  const base = E1(easyA());
  it('D30: drop は編集の形だけに効く', () => {
    const p = withEdit(easyA(), { shape: 'E1', card: 0, slot: 'margin', op: 'drop' });
    expect(keys(E1(p))).toEqual(['netSales', 'opPrev', 'opCur']);
    expect(keys(deriveCards(p, companyA(), 'E2')[0])).toEqual(['salesPrev', 'salesCur']);
    expect(keys(deriveCards(p, companyA(), 'E3')[0])).toEqual(['currentAssets', 'fixedAssets', 'totalAssets']);
  });
  it('D31: swap', () => {
    const p = withEdit(easyA(), { shape: 'E1', card: 0, op: 'swap', slots: ['netSales', 'margin'] });
    expect(keys(E1(p))).toEqual(['margin', 'opPrev', 'opCur', 'netSales']);
  });
  it('D32・D33: format (no-comma・comma-shift。raw は元のまま)', () => {
    const noComma = slot(E1(withEdit(easyA(), { shape: 'E1', card: 0, slot: 'netSales', op: 'format', style: 'no-comma' })), 'netSales');
    expect(noComma).toMatchObject({ text: '12400', raw: 12400 });
    const shifted = (v: number) => slot(E1(withEdit(set(easyA(), 'tanshin.incomeStatement.current.netSales', v), { shape: 'E1', card: 0, slot: 'netSales', op: 'format', style: 'comma-shift' })), 'netSales').text;
    expect(shifted(12400)).toBe('1,2400');
    expect(shifted(96930)).toBe('9,6930');
    expect(shifted(1234567)).toBe('123,4567');
    expect(() => shifted(1234)).toThrow(RangeError);
  });
  it('D34: unit', () => {
    const card = E1(withEdit(easyA(), { shape: 'E1', card: 0, slot: 'netSales', op: 'unit', unit: '億円' }));
    expect(card.slots.map((s) => s.unit)).toEqual(['億円', '百万円', '百万円', '%']);
  });
  it('D35: dup は元の欄の直後に同じ欄', () => {
    const card = E1(withEdit(easyA(), { shape: 'E1', card: 0, slot: 'margin', op: 'dup' }));
    expect(keys(card)).toEqual(['netSales', 'opPrev', 'opCur', 'margin', 'margin']);
    const mid = E1(withEdit(easyA(), { shape: 'E1', card: 0, slot: 'opPrev', op: 'dup' }));
    expect(keys(mid)).toEqual(['netSales', 'opPrev', 'opPrev', 'opCur', 'margin']);
  });
  it('D36: headline', () => {
    const card = E1(withEdit(easyA(), { shape: 'E1', card: 0, op: 'headline', word: '増収' }));
    expect(card.headline).toEqual({ word: '増収', reads: base.headline?.reads });
  });
  it('D37: 形に無い欄・範囲外のカード・見出し語の無い形への headline は RangeError', () => {
    expect(() => E1(withEdit(easyA(), { shape: 'E1', card: 0, slot: 'nope', op: 'drop' }))).toThrow(RangeError);
    expect(() => E1(withEdit(easyA(), { shape: 'E1', card: 1, slot: 'margin', op: 'drop' }))).toThrow(RangeError);
    expect(() => deriveCards(withEdit(easyA(), { shape: 'E3', card: 0, op: 'headline', word: '増益' }), companyA(), 'E3')).toThrow(RangeError);
  });
  it('D38: むずかしいの card 番号 (0 = 短信型、1 = IR 型)', () => {
    const p = withEdit(hardA(), { shape: 'H3', card: 1, slot: 'cashCur', op: 'drop' });
    const [tan, ir] = deriveCards(p, companyA(), 'H3') as [Card, Card];
    expect(keys(tan)).toEqual(templateKeys('H3')[0]);
    expect(keys(ir)).toEqual(['cashPrev', 'debtPrev', 'netDebtPrev', 'subsequent', 'segments']);
  });
  it('D39: applyEdits:false はテンプレートのカード', () => {
    const edits: CardEdit[] = [
      { shape: 'E1', card: 0, slot: 'margin', op: 'drop' },
      { shape: 'E1', card: 0, op: 'swap', slots: ['netSales', 'margin'] },
      { shape: 'E1', card: 0, slot: 'netSales', op: 'format', style: 'no-comma' },
      { shape: 'E1', card: 0, slot: 'netSales', op: 'unit', unit: '億円' },
      { shape: 'E1', card: 0, slot: 'margin', op: 'dup' },
      { shape: 'E1', card: 0, op: 'headline', word: '増収' },
    ];
    for (const edit of edits) {
      expect(deriveCards(withEdit(easyA(), edit), companyA(), 'E1', { applyEdits: false })).toEqual(deriveCards(easyA(), companyA(), 'E1'));
      expect(deriveCards(withEdit(easyA(), edit), companyA(), 'E1')).not.toEqual(deriveCards(easyA(), companyA(), 'E1'));
    }
  });
});

describe('1.6 見出し語 (R-D5)', () => {
  const claim = (metric: string, direction: string) => [{ metric, direction }];
  it('D40: 向きと語の対応', () => {
    const p = (m: string, d: string) => set(easyA(), 'ir.statements.0.claims', claim(m, d));
    expect(E1(p('operatingIncome', 'up')).headline?.word).toBe('増益');
    expect(E1(p('operatingIncome', 'down')).headline?.word).toBe('減益');
    expect((deriveCards(p('netSales', 'up'), companyA(), 'E2')[0] as Card).headline?.word).toBe('増収');
    expect((deriveCards(p('netSales', 'down'), companyA(), 'E2')[0] as Card).headline?.word).toBe('減収');
  });
  it('D41: 2 つの主張が 1 つの文にあっても metric で引く。reads はその文', () => {
    expect(E1(easyA()).headline?.reads).toEqual(['ir.statements.0']);
    expect((deriveCards(easyA(), companyA(), 'E2')[0] as Card).headline?.reads).toEqual(['ir.statements.0']);
  });
  it('D42: 主張が無ければ headline は undefined (例外にしない)', () => {
    const card = E1(set(easyA(), 'ir.statements', []));
    expect(card.headline).toBeUndefined();
    expect(keys(card)).toEqual(['netSales', 'opPrev', 'opCur', 'margin']);
  });
  it('D43: direction が zero の主張は見出し語にしない', () => {
    expect(E1(set(easyA(), 'ir.statements.0.claims', claim('operatingIncome', 'zero'))).headline).toBeUndefined();
  });
});

describe('1.7 純関数・性質', () => {
  it('D50: 同じ入力は同じ出力', () => {
    for (const shape of shapesOf('easy')) expect(deriveCards(easyA(), companyA(), shape)).toEqual(deriveCards(easyA(), companyA(), shape));
  });
  it('D51: 入力を書き換えない', () => {
    const p = hardA();
    const c = companyA();
    const [p0, c0] = [clone(p), clone(c)];
    for (const shape of shapesOf('hard')) deriveCards(p, c, shape);
    expect(p).toEqual(p0);
    expect(c).toEqual(c0);
  });
  it('D52: 乱数・時刻を見ない', () => {
    const boom = () => {
      throw new Error('使ってはいけない');
    };
    vi.spyOn(Math, 'random').mockImplementation(boom);
    vi.spyOn(Date, 'now').mockImplementation(boom);
    try {
      for (const shape of shapesOf('easy')) deriveCards(easyA(), companyA(), shape);
    } finally {
      vi.restoreAllMocks();
    }
  });

  const normals = problems.filter((p) => p.anomaly === null);
  it('D53・D54: 今の正常な問題 28 問すべてで、全形の数字・文の数が上限以内で、reads のセルが実在する', () => {
    expect(normals).toHaveLength(28);
    for (const p of normals) {
      const company = companies.find((c) => c.id === p.companyId) as Company;
      for (const shape of shapesOf(p.difficulty)) {
        for (const card of deriveCards(p, company, shape)) {
          expect(countNumbers(card), `${p.id} ${shape}`).toBeLessThanOrEqual(4);
          expect(countTexts(card), `${p.id} ${shape}`).toBeLessThanOrEqual(p.difficulty === 'easy' ? 0 : 3);
          const reads = [...card.slots.flatMap((s) => s.reads), ...(card.headline?.reads ?? []), ...(card.bars?.items.flatMap((i) => i.reads) ?? []), ...(card.bars?.axisReads ?? [])];
          for (const cell of reads) {
            const [doc, ...rest] = cell.split('.');
            expect(getPath(p, doc as 'tanshin' | 'ir', rest.join('.')), `${p.id} ${shape} ${cell}`).not.toBeUndefined();
          }
        }
      }
    }
  });

  it('D55: placeSlots', () => {
    const cards = deriveCards(easyA(), companyA(), 'E1');
    expect(placeSlots(cards, { doc: 'tanshin', path: 'summary.operatingMargin' })).toEqual([{ card: 0, key: 'margin' }]);
    expect(placeSlots(cards, { doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' })).toEqual([
      { card: 0, key: 'opPrev' },
      { card: 0, key: 'opCur' },
    ]);
    expect(placeSlots(cards, { doc: 'ir', path: 'statements.0.text' })).toEqual([{ card: 0, key: 'headline' }]);
    expect(placeSlots(cards, { doc: 'tanshin', path: 'balanceSheet.current.cash' })).toEqual([]);
    // 別名: E2 の棒の規則が読む IR の売上高は、短信の売上高の欄が見せる
    const e2 = deriveCards(easyA(), companyA(), 'E2');
    expect(placeSlots(e2, { doc: 'ir', path: 'results.netSales.current' })).toEqual([{ card: 0, key: 'salesCur' }]);
    expect(placeSlots(e2, { doc: 'ir', path: 'results.chart.netSales.current' })).toEqual([{ card: 0, key: 'bars' }]);
  });
  it('cardCells: reads・itemKey・枠・別名', () => {
    const cells = cardCells(deriveCards(easyA(), companyA(), 'E1'));
    for (const c of ['tanshin.incomeStatement.current.netSales', 'tanshin.incomeStatement.current.operatingIncome', 'tanshin.summary.operatingMargin', 'ir.statements.0', 'tanshin.header.companyName', 'tanshin.header.periodLabel', 'tanshin.header.securitiesCode', 'tanshin.columnDates.incomeStatement.current', 'tanshin.incomeStatement.operatingIncome']) {
      expect(cells.has(c), c).toBe(true);
    }
    expect(cells.has('tanshin.balanceSheet.current.totalAssets')).toBe(false);
    expect(cells.has('tanshin.incomeStatement.previous.netSales')).toBe(false);
    const e2 = cardCells(deriveCards(easyA(), companyA(), 'E2'));
    expect(e2.has('ir.results.netSales.previous') && e2.has('ir.results.netSales.current')).toBe(true);
  });
});
