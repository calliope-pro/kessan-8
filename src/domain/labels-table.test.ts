// docs/test-cases/labels.md のケース (I1〜I3・L1〜L3)。
import { describe, expect, it } from 'vitest';
import normal from './fixtures/normal.problem.json';
import { itemKey, LABELS, SECTION_OF_ITEM } from './labels';
import type { DocKind, Problem } from './types';

type Leaf = { doc: DocKind; path: string; value: unknown };

/** 資料の中のすべての葉 (数値・文字列・真偽値・null) をたどる。配列は添字で入れ子にする。 */
function leaves(doc: DocKind, node: unknown, prefix: string[] = []): Leaf[] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(doc, v, [...prefix, k]));
  }
  return [{ doc, path: prefix.join('.'), value: node }];
}

/** 全部入りの資料束: 基準問題に第 3 セグメント・後発事象の文・IR の前期の設備投資と減価償却費を足す (test-cases/labels.md)。 */
function fullProblem(): Problem {
  const p = structuredClone(normal) as unknown as Problem;
  const third = { name: '第三事業', netSales: 100, profit: 10 };
  p.tanshin.notes.segments.previous.segments.push({ ...third });
  p.tanshin.notes.segments.current.segments.push({ ...third });
  p.ir.segments.items.push({
    name: '第三事業',
    netSales: { previous: 100, current: 100, changeRate: 0 },
    profit: { previous: 10, current: 10, changeRate: 0 },
    salesShare: 1,
  });
  p.ir.outlook.subsequentEvent = '期末後に重要な出来事があった。';
  p.ir.supplement.capex.previous = 800;
  p.ir.supplement.depreciation.previous = 650;
  return p;
}

function allCells(p: Problem): Leaf[] {
  return [...leaves('tanshin', p.tanshin), ...leaves('ir', p.ir)];
}

/** 行の名前を持たないセル (L2-2): 見出し・列見出し・文章・セグメントの name。 */
function hasNoRowName({ doc, path }: Leaf): boolean {
  const segs = path.split('.');
  if (segs[0] === 'header' || segs[0] === 'columnDates' || segs[0] === 'statements') return true;
  return segs[segs.length - 1] === 'name' && segs.includes(doc === 'ir' ? 'items' : 'segments');
}

describe('L1: 項目キーの文法', () => {
  it('I1: 設計 §4.1 の例', () => {
    expect(itemKey('tanshin', 'incomeStatement.current.ordinaryIncome')).toBe('tanshin.incomeStatement.ordinaryIncome');
    expect(itemKey('tanshin', 'summary.ordinaryIncome.changeRate')).toBe('tanshin.summary.ordinaryIncome');
    expect(itemKey('ir', 'segments.items.0.netSales.current')).toBe('ir.segments.items.0.netSales');
    expect(itemKey('ir', 'outlook.forecast.netSales')).toBe('ir.outlook.netSales');
    expect(itemKey('ir', 'outlook.actual.netSales')).toBe('ir.outlook.netSales');
  });

  it('L1-1: 期は行を分けない', () => {
    expect(itemKey('tanshin', 'balanceSheet.previous.cash')).toBe('tanshin.balanceSheet.cash');
    expect(itemKey('tanshin', 'balanceSheet.current.cash')).toBe('tanshin.balanceSheet.cash');
  });

  it('L1-2: サマリーの 1 行の 3 つの列は同じ項目キー', () => {
    for (const col of ['previous', 'current', 'changeRate']) {
      expect(itemKey('tanshin', `summary.netSales.${col}`)).toBe('tanshin.summary.netSales');
    }
  });

  it('L1-3: 末尾の amount・changeRate を取る', () => {
    expect(itemKey('ir', 'highlights.netSales.amount')).toBe('ir.highlights.netSales');
    expect(itemKey('ir', 'highlights.netSales.changeRate')).toBe('ir.highlights.netSales');
  });

  it('L1-4: 名前の一部に changeRate を含むだけの項目は取らない', () => {
    expect(itemKey('ir', 'outlook.forecast.netSalesChangeRate')).toBe('ir.outlook.netSalesChangeRate');
  });

  it('L1-5: 段は途中にあっても取り、添字は残す', () => {
    expect(itemKey('tanshin', 'notes.segments.current.segments.1.profit')).toBe('tanshin.notes.segments.segments.1.profit');
  });

  it('L1-6: IR の補足の前期・当期は同じ項目キー', () => {
    expect(itemKey('ir', 'supplement.capex.previous')).toBe('ir.supplement.capex');
    expect(itemKey('ir', 'supplement.capex.current')).toBe('ir.supplement.capex');
  });

  it('L1-7: グラフの軸の下端は別の行', () => {
    expect(itemKey('ir', 'results.chart.netSales.axisMin')).toBe('ir.results.chart.netSales.axisMin');
    expect(itemKey('ir', 'results.chart.netSales.current')).toBe('ir.results.chart.netSales');
  });

  it('L1-8: 段が無ければ、頭に資料の種類を付けるだけ', () => {
    expect(itemKey('tanshin', 'header.companyName')).toBe('tanshin.header.companyName');
    expect(itemKey('tanshin', 'dates.periodEnd')).toBe('tanshin.dates.periodEnd');
    expect(itemKey('tanshin', 'summary.auditNote')).toBe('tanshin.summary.auditNote');
  });

  it('L1-9: 純粋で、資料の種類が頭に付く', () => {
    expect(itemKey('tanshin', 'summary.netSales.current')).toBe(itemKey('tanshin', 'summary.netSales.current'));
    expect(itemKey('ir', 'summary.netSales.current')).toBe('ir.summary.netSales');
  });
});

describe('L2: 標準の表示名が全部ある', () => {
  const cells = allCells(fullProblem());

  it('I2: すべての数値のセルの項目キーに標準の表示名がある。貸借対照表の項目には部がある', () => {
    const numeric = cells.filter((c) => typeof c.value === 'number');
    expect(numeric.length).toBeGreaterThan(200);
    for (const c of numeric.filter((c) => !hasNoRowName(c))) {
      const key = itemKey(c.doc, c.path);
      expect(LABELS[key], `${c.doc}.${c.path} → ${key}`).toBeTruthy();
      if (key.startsWith('tanshin.balanceSheet.')) expect(SECTION_OF_ITEM[key], key).toBeDefined();
    }
  });

  it('L2-1: 数値以外のセルも、行の名前を持つものには標準の表示名がある', () => {
    const others = cells.filter((c) => typeof c.value !== 'number' && c.value !== null && !hasNoRowName(c));
    const keys = others.map((c) => itemKey(c.doc, c.path));
    for (const k of [
      'tanshin.summary.auditNote',
      'tanshin.summary.accountingPolicyChange',
      'tanshin.dates.periodEnd',
      'tanshin.notes.goingConcern',
      'tanshin.notes.subsequentEvents',
      'ir.outlook.subsequentEvent',
    ]) {
      expect(keys, k).toContain(k);
    }
    for (const c of others) expect(LABELS[itemKey(c.doc, c.path)], `${c.doc}.${c.path}`).toBeTruthy();
  });

  it('L2-2: 見出し・列見出し・文章・セグメントの name は、行の名前を持たなくてよい (数えない)', () => {
    const exempt = cells.filter(hasNoRowName).map((c) => `${c.doc}.${c.path}`);
    expect(exempt).toContain('tanshin.header.companyName');
    expect(exempt).toContain('tanshin.columnDates.balanceSheet.current');
    expect(exempt).toContain('ir.statements.0.text');
    expect(exempt).toContain('ir.segments.items.0.name');
    expect(exempt).toContain('tanshin.notes.segments.current.segments.0.name');
    // 例外は 4 種類だけ: これ以外のセルで LABELS に無いものは L2-1・I2 が落とす
    expect(cells.filter((c) => !hasNoRowName(c) && c.value !== null).every((c) => LABELS[itemKey(c.doc, c.path)])).toBe(true);
  });

  it('L2-3: LABELS の各キーは、どれかのセルの項目キーになる (打ち間違い・使われない項目が無い)', () => {
    const used = new Set(cells.filter((c) => !hasNoRowName(c)).map((c) => itemKey(c.doc, c.path)));
    const dead = Object.keys(LABELS).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  it('L2-4: セグメントの添字は 0〜2 (3 は無い)', () => {
    for (const i of [0, 1, 2]) {
      for (const f of ['netSales', 'profit']) {
        expect(LABELS[`ir.segments.items.${i}.${f}`], `ir ${i} ${f}`).toBeTruthy();
        expect(LABELS[`tanshin.notes.segments.segments.${i}.${f}`], `tanshin ${i} ${f}`).toBeTruthy();
      }
      expect(LABELS[`ir.segments.items.${i}.salesShare`]).toBeTruthy();
    }
    expect(Object.keys(LABELS).filter((k) => /\.3\./.test(k))).toEqual([]);
  });
});

describe('L3: 値の約束', () => {
  const bsKeys = Object.keys(LABELS).filter((k) => k.startsWith('tanshin.balanceSheet.'));

  it('I3: 空でなく、同じ部の中で重複しない', () => {
    for (const [k, v] of Object.entries(LABELS)) expect(v.trim(), k).not.toBe('');
    for (const section of ['asset', 'liability', 'equity']) {
      const names = bsKeys.filter((k) => SECTION_OF_ITEM[k] === section).map((k) => LABELS[k]);
      expect(new Set(names).size, section).toBe(names.length);
    }
  });

  it('L3-1: 貸借対照表の項目の値は、部をまたいでも重複しない', () => {
    const names = bsKeys.map((k) => LABELS[k]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('L3-2: SECTION_OF_ITEM は貸借対照表の項目だけを、3 つの部のどれかに分ける', () => {
    expect(Object.keys(SECTION_OF_ITEM).sort()).toEqual([...bsKeys].sort());
    for (const v of Object.values(SECTION_OF_ITEM)) expect(['asset', 'liability', 'equity', 'total']).toContain(v);
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.cash']).toBe('asset');
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.totalAssets']).toBe('asset');
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.payables']).toBe('liability');
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.totalLiabilities']).toBe('liability');
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.capitalStock']).toBe('equity');
    // 負債純資産合計は負債にも純資産にも属さない: 'total' (検証器の account-section が、この行への差し替えを部の取り違えとしない)
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.totalLiabilitiesAndNetAssets']).toBe('total');
  });

  it('L3-5: 売掛金の標準の表示名は `売掛金` (資産)、買掛金は `買掛金` (負債)。V52 (売掛金の行を `買掛金` に差し替え) が「別の部の標準の表示名」になる', () => {
    expect(LABELS['tanshin.balanceSheet.receivables']).toBe('売掛金');
    expect(LABELS['tanshin.balanceSheet.payables']).toBe('買掛金');
    expect(SECTION_OF_ITEM['tanshin.balanceSheet.receivables']).toBe('asset');
    const keysOf = (name: string) => Object.keys(LABELS).filter((k) => LABELS[k] === name);
    expect(keysOf('買掛金')).toEqual(['tanshin.balanceSheet.payables']);
    expect(SECTION_OF_ITEM[keysOf('買掛金')[0]!]).toBe('liability');
  });

  it('L3-3: サマリーと損益計算書の同じ名前の行は、別の項目キーで同じ表示名でよい', () => {
    expect(LABELS['tanshin.summary.operatingIncome']).toBe('営業利益');
    expect(LABELS['tanshin.incomeStatement.operatingIncome']).toBe('営業利益');
    expect(LABELS['tanshin.summary.ordinaryIncome']).toBe('経常利益');
    expect(LABELS['tanshin.incomeStatement.ordinaryIncome']).toBe('経常利益');
  });

  it('L3-4: キーはすべて tanshin. か ir. で始まる', () => {
    for (const k of Object.keys(LABELS)) expect(k).toMatch(/^(tanshin|ir)\./);
  });
});
