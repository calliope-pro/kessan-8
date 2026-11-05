// ケース表 docs/proto/test-cases.md の C (カードの導出)。
import { describe, expect, it } from 'vitest';
import { deriveCard, fmtAmount, locate, SHAPES, type CardEdit, type EditBody, type ShapeId } from './cards';
import { companyOf, NORMALS } from './testing';

const edit = (shape: ShapeId, e: EditBody): CardEdit => ({ shape, card: 0, ...e });
const sample = NORMALS.find((p) => p.id === 'easy-017')!;
const card = (shape: ShapeId, edits: CardEdit[] = [], p = sample) => deriveCard(p, companyOf(p), shape, edits);
const get = (obj: unknown, path: string): number => path.split('.').reduce<any>((o, k) => o[k], obj);

describe('C1 正常な問題から 3 形のカードが作れる', () => {
  it('正常 12 問 × 3 形。欄の数が決まりどおり', () => {
    expect(NORMALS).toHaveLength(12);
    for (const p of NORMALS) {
      expect(card('E1', [], p).slots).toHaveLength(4);
      const e2 = card('E2', [], p);
      expect(e2.slots).toHaveLength(2);
      expect(e2.bars).not.toBeNull();
      expect(card('E3', [], p).slots).toHaveLength(3);
    }
  });
  it('数字の数 (欄 + 棒 2 本) は 4 つまで', () => {
    for (const p of NORMALS) for (const s of SHAPES) {
      const c = card(s, [], p);
      expect(c.slots.length + (c.bars ? 2 : 0)).toBeLessThanOrEqual(4);
    }
  });
});

describe('C2・C3 純関数', () => {
  it('C2 同じ入力は同じカード', () => {
    expect(card('E1')).toEqual(card('E1'));
  });
  it('C3 問題データを書き換えない', () => {
    const before = JSON.stringify(sample);
    for (const s of SHAPES) card(s, [edit(s, { op: 'headline', word: '増収' })]);
    expect(JSON.stringify(sample)).toBe(before);
  });
});

describe('C4 見出し語は ir.statements の主張から作る (R-D5)', () => {
  it('E1 は営業利益、E2 は売上高の向きと一致。E3 は無い', () => {
    for (const p of NORMALS) {
      const t = p.tanshin.incomeStatement;
      const op = t.current.operatingIncome >= t.previous.operatingIncome ? '増益' : '減益';
      const sales = t.current.netSales >= t.previous.netSales ? '増収' : '減収';
      expect(card('E1', [], p).headline?.text).toBe(op);
      expect(card('E2', [], p).headline?.text).toBe(sales);
      expect(card('E3', [], p).headline).toBeNull();
    }
  });
  it('見出し語の reads は ir.statements.<N> で、N の文が実在する', () => {
    const h = card('E1').headline!;
    expect(h.reads).toHaveLength(1);
    const n = Number(h.reads[0]!.split('.').pop());
    expect(sample.ir.statements[n]).toBeDefined();
  });
});

describe('C5・C6 正常のカードの数字は整合する', () => {
  it('C5 営業利益率 = 当期の営業利益 ÷ 売上高 (小数第 1 位)', () => {
    for (const p of NORMALS) {
      const c = card('E1', [], p);
      const by = Object.fromEntries(c.slots.map((s) => [s.key, s.value]));
      expect(by.margin).toBeCloseTo(Math.round((by.opCurr! / by.sales!) * 1000) / 10, 1);
    }
  });
  it('C6 総資産 = 流動資産 + 固定資産', () => {
    for (const p of NORMALS) {
      const by = Object.fromEntries(card('E3', [], p).slots.map((s) => [s.key, s.value]));
      expect(by.total).toBe(by.current! + by.fixed!);
    }
  });
});

describe('C7 表示', () => {
  it('3 桁ごとのカンマ', () => {
    expect(fmtAmount(96930)).toBe('96,930');
    expect(fmtAmount(969300)).toBe('969,300');
    expect(fmtAmount(4920)).toBe('4,920');
    expect(fmtAmount(920)).toBe('920');
    expect(fmtAmount(-1890)).toBe('-1,890');
  });
  it('金額の欄は百万円 (短信の単位)、比率は % と小数第 1 位', () => {
    const c = card('E1');
    expect(c.slots[0]).toMatchObject({ key: 'sales', text: '96,930', unit: '百万円' });
    expect(c.slots[3]).toMatchObject({ key: 'margin', text: '5.1', unit: '%' });
  });
});

describe('C8 reads は実在するセルを指す', () => {
  it('全欄・全形・全問', () => {
    for (const p of NORMALS) for (const s of SHAPES) {
      const c = card(s, [], p);
      for (const sl of c.slots) {
        expect(sl.reads.length).toBeGreaterThan(0);
        for (const r of sl.reads) expect(typeof get(p, r)).toBe('number');
      }
      for (const r of c.bars?.reads ?? []) expect(get(p, r + '.current')).toBeTypeOf('number');
    }
  });
});

describe('C9〜C14 cardEdits', () => {
  it('C9 drop: 欄が無くなり dropped に位置つきで残る', () => {
    const c = card('E1', [edit('E1', { op: 'drop', slot: 'margin' })]);
    expect(c.slots.map((s) => s.key)).toEqual(['sales', 'opPrev', 'opCurr']);
    expect(c.dropped).toEqual([{ key: 'margin', label: '営業利益率', index: 3 }]);
  });
  it('C10 swap: 2 欄の順が入れ替わる', () => {
    const c = card('E1', [edit('E1', { op: 'swap', slots: ['sales', 'margin'] })]);
    expect(c.slots.map((s) => s.key)).toEqual(['margin', 'opPrev', 'opCurr', 'sales']);
  });
  it('C11 format: 桁区切りの位置だけが変わる (値は同じ)', () => {
    const a = card('E1', [edit('E1', { op: 'format', slot: 'sales', style: 'no-comma' })]).slots[0]!;
    const b = card('E1', [edit('E1', { op: 'format', slot: 'sales', style: 'comma-shift' })]).slots[0]!;
    expect(a.text).toBe('96930');
    expect(b.text).toBe('9,6930');
    expect(a.value).toBe(96930);
    expect(b.value).toBe(96930);
  });
  it('C12 unit: 指定した欄の単位だけが変わる', () => {
    const c = card('E1', [edit('E1', { op: 'unit', slot: 'opCurr', unit: '億円' })]);
    expect(c.slots.map((s) => s.unit)).toEqual(['百万円', '百万円', '億円', '%']);
  });
  it('C13 dup: 同じ欄が 2 回並ぶ', () => {
    const c = card('E1', [edit('E1', { op: 'dup', slot: 'margin' })]);
    expect(c.slots.map((s) => s.key)).toEqual(['sales', 'opPrev', 'opCurr', 'margin', 'margin#2']);
  });
  it('C14 headline: 見出し語が差し替わる', () => {
    const c = card('E1', [edit('E1', { op: 'headline', word: '増収' })]);
    expect(c.headline?.text).toBe('増収');
  });
  it('別の形の編集は無視する', () => {
    expect(card('E1', [edit('E3', { op: 'drop', slot: 'fixed' })])).toEqual(card('E1'));
  });
});

describe('C15 labelOverrides', () => {
  it('指定した項目キーの科目名だけが変わる (同じ項目キーの前期・当期の行は両方変わる)', () => {
    const p = { ...sample, labelOverrides: { 'tanshin.incomeStatement.operatingIncome': '営業和益' } };
    const c = card('E1', [], p);
    expect(c.slots.map((s) => s.label)).toEqual(['売上高', '営業和益 (前期)', '営業和益 (当期)', '営業利益率']);
  });
});

describe('locate (R-D3 答え合わせの場所)', () => {
  it('セルのパスは reads に当てる。接頭辞でも当たる', () => {
    const c = card('E2');
    expect(locate(c, ['tanshin.incomeStatement.current.netSales'])).toEqual([{ type: 'slot', key: 'salesCurr' }]);
    expect(locate(c, ['ir.results.chart.netSales.axisMin'])).toEqual([{ type: 'bars' }]);
    expect(locate(c, [c.headline!.reads[0]!])).toEqual([{ type: 'headline' }]);
  });
  it('slot: は欄のキー。drop した欄は dropped に当たる', () => {
    const c = card('E1', [edit('E1', { op: 'drop', slot: 'margin' })]);
    expect(locate(c, ['slot:margin'])).toEqual([{ type: 'dropped', key: 'margin' }]);
    expect(locate(c, ['slot:sales'])).toEqual([{ type: 'slot', key: 'sales' }]);
  });
  it('当たらない場所は空 (V1 の検査に使う)', () => {
    expect(locate(card('E1'), ['tanshin.cashFlow.cashEnding'])).toEqual([]);
  });
});
