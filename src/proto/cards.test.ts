// ケース表 docs/proto/test-cases.md の C (カードの導出。v3)。
import { describe, expect, it } from 'vitest';
import { deriveCards, getCell, irOku, locate, type CardEdit } from './cards';
import { companyOf, HARD_NORMALS, NORMALS } from './testing';

const sample = NORMALS.find((p) => p.id === 'easy-017')!;
const easy = (edits: CardEdit[] = [], p = sample) => deriveCards(p, companyOf(p), 'easy', edits);
const hard = (edits: CardEdit[] = [], p = HARD_NORMALS[0]!) => deriveCards(p, companyOf(p), 'hard', edits);
const slot = (c: ReturnType<typeof easy>, key: string) => c.slots.find((s) => s.key === key)!;
const get = (obj: unknown, path: string): any => getCell(obj, path);

const HARD_KEYS = ['sales', 'opPrev', 'opCurr', 'margin', 'pbt', 'cash', 'arPrev', 'arCurr', 'ta', 'tlna', 'cfStart', 'cfAr', 'ocf', 'cfEnd', 'audit', 'policyFlag', 'policyNote', 'subseq', 'segs', 'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev', 'irOcf', 'irSubseq', 'irSegs'];

describe('C1 やさしいのカードは数字 4 つ・見出し語 1・資料なし', () => {
  it('正常 12 問', () => {
    expect(NORMALS).toHaveLength(12);
    for (const p of NORMALS) {
      const c = easy([], p);
      expect(c.slots.map((s) => s.key)).toEqual(['sales', 'opPrev', 'opCurr', 'margin']);
      expect(c.slots.every((s) => s.kind !== 'text')).toBe(true);
      expect(c.headline).not.toBeNull();
      expect(c.blocks.map((b) => b.id)).toEqual(['card']);
    }
  });
});

describe('C2 むずかしいのカードは カード + 資料 1・2 (27 欄。数字 19・文 8)', () => {
  it('正常 16 問', () => {
    expect(HARD_NORMALS).toHaveLength(16);
    for (const p of HARD_NORMALS) {
      const c = hard([], p);
      expect(c.slots.map((s) => s.key)).toEqual(HARD_KEYS);
      expect(c.slots.filter((s) => s.kind !== 'text')).toHaveLength(19);
      expect(c.slots.filter((s) => s.kind === 'text')).toHaveLength(8);
      expect(c.blocks.map((b) => b.id)).toEqual(['card', 'pl', 'bs', 'cf', 'notes', 'ir']);
    }
  });
  it('貸借は「資産」の下に 4 欄、「負債及び純資産」の下に 1 欄', () => {
    const bs = hard().blocks.find((b) => b.id === 'bs')!;
    expect(bs.slots.filter((s) => s.group === '資産').map((s) => s.key)).toEqual(['cash', 'arPrev', 'arCurr', 'ta']);
    expect(bs.slots.filter((s) => s.group === '負債及び純資産').map((s) => s.key)).toEqual(['tlna']);
  });
});

describe('C3 純関数', () => {
  it('同じ入力は同じカード・問題データを書き換えない', () => {
    expect(easy()).toEqual(easy());
    expect(hard()).toEqual(hard());
    const before = JSON.stringify(sample);
    easy([{ op: 'headline', word: '増収' }, { op: 'sign', slot: 'sales' }, { op: 'day', slot: 'period', day: 32 }]);
    expect(JSON.stringify(sample)).toBe(before);
  });
});

describe('C4 見出し語は ir.statements の主張から作る (R-D5)', () => {
  it('営業利益の前期→当期の向きと一致。reads の文が実在する', () => {
    for (const [d, ps] of [['easy', NORMALS], ['hard', HARD_NORMALS]] as const) for (const p of ps) {
      const t = p.tanshin.incomeStatement;
      const want = t.current.operatingIncome >= t.previous.operatingIncome ? '増益' : '減益';
      const h = deriveCards(p, companyOf(p), d).headline!;
      expect(h.text).toBe(want);
      expect(p.ir.statements[Number(h.reads[0]!.split('.').pop())]).toBeDefined();
    }
  });
});

describe('C5 正常のカードの数字は整合する (営業利益率)', () => {
  it('営業利益率 = 営業利益 ÷ 売上高 (0.05 以内)', () => {
    for (const [d, ps] of [['easy', NORMALS], ['hard', HARD_NORMALS]] as const) for (const p of ps) {
      const c = deriveCards(p, companyOf(p), d);
      expect(Math.abs(slot(c, 'margin').value! - (slot(c, 'opCurr').value! / slot(c, 'sales').value!) * 100)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('C6 むずかしい正常の資料は互いに整合する', () => {
  it('貸借・CF・IR の関係', () => {
    for (const p of HARD_NORMALS) {
      const c = hard([], p);
      const v = (k: string) => slot(c, k).value!;
      expect(v('ta')).toBe(v('tlna'));
      expect(v('cfStart')).toBe(v('pbt'));
      expect(v('cfEnd')).toBe(v('cash'));
      expect(v('cfAr')).toBe(-(v('arCurr') - v('arPrev')));
      // 表示する純有利子負債は、表示する有利子負債 − 現金と完全に一致する (読んだ遊び手が正常を異変と答えない。#184 レビュー B1)
      expect(Math.round((v('irDebtPrev') - v('irCashPrev')) * 10)).toBe(Math.round(v('irNetDebtPrev') * 10));
      expect(Math.abs(v('irNetDebtPrev') - irOku(get(p, 'ir.supplement.netDebt.previous'), companyOf(p)))).toBeLessThanOrEqual(0.15); // データのセルとも 0.15 以内
      expect(Math.abs((v('irSales') * 100) / v('sales') - 1)).toBeLessThanOrEqual(0.005);
      expect(Math.abs((v('irCashCur') * 100) / v('cash') - 1)).toBeLessThanOrEqual(0.01);
      expect(slot(c, 'irOcf').text.includes(v('ocf') >= 0 ? 'プラス' : 'マイナス')).toBe(true);
    }
  });
});

describe('C7 欄の表示 (カンマの字・単位)', () => {
  it('桁区切りはカンマの字を含む。比率・IR・単位', () => {
    const c = easy();
    expect(slot(c, 'sales').text).toBe('96,930');
    expect(slot(c, 'margin').text).toBe('5.1');
    expect([slot(c, 'sales').unit, slot(c, 'margin').unit]).toEqual(['百万円', '%']);
    for (const p of HARD_NORMALS) {
      const h = hard([], p);
      expect(slot(h, 'irSales').unit).toBe('億円');
      expect(slot(h, 'irSales').text).toMatch(/^[\d,]+\.\d$/);
      expect(slot(h, 'sales').unit).toBe('百万円');
      expect(slot(h, 'cash').unit).toBe('百万円');
    }
  });
});

describe('C8 reads は実在するセルを指す', () => {
  it('やさしい・むずかしいのすべての欄・見出し語・期末日', () => {
    for (const [d, ps] of [['easy', NORMALS], ['hard', HARD_NORMALS]] as const) for (const p of ps) {
      const c = deriveCards(p, companyOf(p), d);
      for (const s of c.slots) for (const r of s.reads) expect(get(p, r), `${p.id} ${s.key} ${r}`).not.toBeUndefined();
      for (const r of c.headline!.reads) expect(get(p, r), `${p.id} headline`).not.toBeUndefined();
      expect(get(p, 'tanshin.columnDates.incomeStatement.current')).toBeDefined();
    }
  });
});

describe('C9 言い換え (やさしい)', () => {
  it('科目名ごとに最初の 1 欄。営業利益は売上高との大小が分かる文', () => {
    const c = easy();
    expect(slot(c, 'sales').gloss).toBeTruthy();
    expect(slot(c, 'opPrev').gloss).toBe('売上高から費用を引いた残り');
    expect(slot(c, 'opCurr').gloss).toBeUndefined();
    expect(slot(c, 'margin').gloss).toBeTruthy();
    expect(c.headline!.gloss).toBe('もうけが増えた');
  });
  it('見出し語の言い換え: 減益・増収・減収', () => {
    const down = NORMALS.find((p) => p.tanshin.incomeStatement.current.operatingIncome < p.tanshin.incomeStatement.previous.operatingIncome)!;
    expect(easy([], down).headline).toMatchObject({ text: '減益', gloss: 'もうけが減った' });
  });
});

describe('C10 言い換え (むずかしい) は付けない', () => {
  it('カード・資料・見出し語のどこにも', () => {
    const c = hard();
    expect(c.slots.filter((s) => s.gloss)).toHaveLength(0);
    expect(c.headline!.gloss).toBe('');
  });
});

describe('C11 期末日の表示は文字列の切り出し', () => {
  it('2024-03-31 → 2024年3月31日。2025-02-28 → 2025年2月28日', () => {
    expect(easy().periodEnd).toBe('期末 ' + '2024年3月31日');
    const p = structuredClone(sample);
    p.tanshin.columnDates.incomeStatement.current = '2025-02-28';
    expect(easy([], p).periodEnd).toBe('期末 2025年2月28日');
  });
});

describe('C12 labelOverrides', () => {
  it('指定した項目キーだけ。営業利益は前期・当期の 2 欄とも', () => {
    const p = structuredClone(sample);
    p.labelOverrides = { 'tanshin.incomeStatement.operatingIncome': '営業和益' };
    const c = easy([], p);
    expect(slot(c, 'opPrev').label).toBe('営業和益 (前期)');
    expect(slot(c, 'opCurr').label).toBe('営業和益 (当期)');
    expect(slot(c, 'sales').label).toBe('売上高');
  });
});

describe('C13〜C20 cardEdits', () => {
  it('C13 drop: 欄が無くなり dropped に残る', () => {
    const c = easy([{ op: 'drop', slot: 'margin' }]);
    expect(c.slots.map((s) => s.key)).not.toContain('margin');
    expect(c.dropped).toEqual([{ key: 'margin', label: '営業利益率', block: 'card', index: 3 }]);
  });
  it('C14 format: 値は変わらない', () => {
    expect(slot(easy([{ op: 'format', slot: 'sales', style: 'no-comma' }]), 'sales')).toMatchObject({ text: '96930', value: 96930 });
    expect(slot(easy([{ op: 'format', slot: 'sales', style: 'comma-shift' }]), 'sales').text).toBe('9,6930');
  });
  it('C15 unit: 指定の欄だけ', () => {
    const c = easy([{ op: 'unit', slot: 'opCurr', unit: '億円' }]);
    expect(c.slots.map((s) => s.unit)).toEqual(['百万円', '百万円', '億円', '%']);
  });
  it('C16 dup: 数字は 5 つ・見出し語は 2 回', () => {
    const c = easy([{ op: 'dup', slot: 'opCurr' }]);
    expect(c.slots.map((s) => s.key)).toEqual(['sales', 'opPrev', 'opCurr', 'opCurr#2', 'margin']);
    expect(easy([{ op: 'dup', slot: 'headline' }]).headline!.count).toBe(2);
    expect(easy().headline!.count).toBe(1);
  });
  it('C17 suffix: 「営業利益 (前期)」が 2 つ並び、値は違う', () => {
    const c = easy([{ op: 'suffix', slot: 'opCurr', word: '前期' }]);
    const rows = c.slots.filter((s) => s.label === '営業利益 (前期)');
    expect(rows.map((s) => s.text)).toEqual(['4,480', '4,920']);
  });
  it('C18 glyph: 数字の at 番目が X', () => {
    const s = slot(easy([{ op: 'glyph', slot: 'opCurr', at: 2 }]), 'opCurr');
    expect(s.text).toBe('4,9X0');
    expect(s.value).toBe(4920);
  });
  it('C19 sign: 値は正のまま', () => {
    const s = slot(easy([{ op: 'sign', slot: 'sales' }]), 'sales');
    expect(s.text).toBe('△96,930');
    expect(s.value).toBe(96930);
  });
  it('C20 day: 32 になる。繰り上がらず Invalid Date にならない。データは変わらない', () => {
    const before = JSON.stringify(sample);
    const c = easy([{ op: 'day', slot: 'period', day: 32 }]);
    expect(c.periodEnd).toBe('期末 2024年3月32日');
    expect(c.periodEnd).not.toMatch(/Invalid|4月/);
    expect(JSON.stringify(sample)).toBe(before);
  });
  it('C21 headline: 語に合った言い換え', () => {
    expect(easy([{ op: 'headline', word: '増収' }]).headline).toMatchObject({ text: '増収', gloss: '売上が増えた' });
    expect(easy([{ op: 'headline', word: '減収' }]).headline).toMatchObject({ text: '減収', gloss: '売上が減った' });
  });
  it('むずかしいの欄にも当てられる (資料の欄の dup・sign・unit)', () => {
    const c = hard([{ op: 'dup', slot: 'ocf' }, { op: 'sign', slot: 'ta' }, { op: 'unit', slot: 'irSales', unit: '百万円' }]);
    expect(c.slots.map((s) => s.key).filter((k) => k.startsWith('ocf'))).toEqual(['ocf', 'ocf#2']);
    expect(slot(c, 'ta').text.startsWith('△')).toBe(true);
    expect(slot(c, 'irSales').unit).toBe('百万円');
  });
});

describe('C22 locate', () => {
  it('欄・見出し語・期末日・表題の期・欠けた欄', () => {
    const c = easy([{ op: 'drop', slot: 'margin' }]);
    expect(locate(c, ['slot:sales'])).toEqual([{ type: 'slot', key: 'sales' }]);
    expect(locate(c, ['slot:margin'])).toEqual([{ type: 'dropped', key: 'margin' }]);
    expect(locate(c, ['headline'])).toEqual([{ type: 'headline' }]);
    expect(locate(c, ['period'])).toEqual([{ type: 'period' }]);
    expect(locate(c, ['frame'])).toEqual([{ type: 'frame' }]);
    expect(locate(c, ['tanshin.incomeStatement.current.netSales'])).toEqual([{ type: 'slot', key: 'sales' }]);
    expect(locate(easy([{ op: 'dup', slot: 'opCurr' }]), ['slot:opCurr#2'])).toEqual([{ type: 'slot', key: 'opCurr#2' }]);
  });
});
