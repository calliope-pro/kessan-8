// docs/test-cases/viewer.md §2・§3 (B0・B1〜B7): 画面の中身 (DOM を使わない純粋な関数 buildScreen)。IR の画面は #64。
import { describe, expect, it } from 'vitest';
import { itemKey, LABELS } from '../../domain/labels';
import { TANSHIN_SCREENS, type DocKind, type Problem } from '../../domain/types';
import { buildScreen, screenTitle, SCREEN_ORDER, tabLabel, type ViewCell, type ViewScreen } from './model';
import { fullProblem, leaves, normalProblem, valueAt } from './testing';

const tanshin = (p: Problem, id: (typeof TANSHIN_SCREENS)[number]) => buildScreen(p, 'tanshin', id);
const allCells = (s: ViewScreen): ViewCell[] => {
  const h = s.header;
  return [
    h.companyName, h.securitiesCode, h.periodLabel, h.unit, ...(h.extra ?? []),
    ...s.sections.flatMap((sec) => [
      ...(sec.titleCell ? [sec.titleCell] : []),
      ...sec.columns.flatMap((c) => (c.cell ? [c.cell] : [])),
      ...sec.rows.flatMap((r) => r.cells.flatMap((c) => (c ? [c] : []))),
    ]),
    ...s.sentences,
  ];
};
/** 行の名前の要素の (項目キー, 文字)。 */
const rowNames = (s: ViewScreen) => s.sections.flatMap((sec) => sec.rows.map((r) => [r.itemKey, r.label] as const));
const row = (s: ViewScreen, key: string) => s.sections.flatMap((sec) => sec.rows).find((r) => r.itemKey === key);
const texts = (s: ViewScreen, key: string) => row(s, key)?.cells.map((c) => c?.text ?? null);

describe('B0: 共通', () => {
  it('B0-1: 10 画面の通し順 (短信 5 → IR 5)', () => {
    expect(SCREEN_ORDER).toEqual([
      { doc: 'tanshin', screen: 'summary' }, { doc: 'tanshin', screen: 'balanceSheet' }, { doc: 'tanshin', screen: 'incomeStatement' },
      { doc: 'tanshin', screen: 'cashFlow' }, { doc: 'tanshin', screen: 'notes' },
      { doc: 'ir', screen: 'highlights' }, { doc: 'ir', screen: 'results' }, { doc: 'ir', screen: 'segments' },
      { doc: 'ir', screen: 'outlook' }, { doc: 'ir', screen: 'supplement' },
    ]);
  });

  it('B0-2: ページ名とタブの名前 (タブは 5 文字以内)', () => {
    expect(SCREEN_ORDER.map((r) => screenTitle(r))).toEqual([
      'サマリー', '連結貸借対照表', '連結損益計算書', '連結キャッシュ・フロー計算書', '注記',
      'ハイライト', '業績', 'セグメント別の状況', '今後の見通し', '補足資料',
    ]);
    expect(SCREEN_ORDER.map((r) => tabLabel(r))).toEqual(['サマリー', '貸借', '損益', 'CF', '注記', '要点', '業績', '事業別', '見通し', '補足']);
    for (const r of SCREEN_ORDER) expect(tabLabel(r).length).toBeLessThanOrEqual(5);
  });

  it('B0-3: 見出しに社名・証券コード・期の表記・単位 (値は problem.<doc>.header のまま)', () => {
    const p = normalProblem();
    for (const id of TANSHIN_SCREENS) {
      const h = tanshin(p, id).header;
      expect([h.companyName.path, h.companyName.text]).toEqual(['tanshin.header.companyName', '第七試作電機株式会社']);
      expect([h.securitiesCode.path, h.securitiesCode.text]).toEqual(['tanshin.header.securitiesCode', '0899']);
      expect([h.periodLabel.path, h.periodLabel.text]).toEqual(['tanshin.header.periodLabel', '2027年3月期']);
      expect([h.unit.path, h.unit.text]).toEqual(['tanshin.header.unit', '百万円']);
    }
  });

  const screens = TANSHIN_SCREENS.map((id) => tanshin(fullProblem(), id));

  it('B0-4: 数値のセルの value は path で引いた問題の値のまま。text は書式関数が value から作る', () => {
    const p = fullProblem();
    for (const s of screens) {
      for (const c of allCells(s)) {
        const v = valueAt(p, c.path);
        if (c.path.endsWith('.unit')) continue; // 単位の表示 (§B0-10)
        expect(c.value, c.path).toEqual(v === undefined ? null : v);
        if (typeof v === 'number') expect(c.text, c.path).not.toBe('');
      }
    }
  });

  it('B0-5: セルの項目キーは itemKey(doc, path)。行の名前の文字は LABELS[項目キー]', () => {
    for (const s of screens) {
      for (const c of allCells(s)) {
        const [doc, ...rest] = c.path.split('.') as [DocKind, ...string[]];
        expect(c.itemKey, c.path).toBe(itemKey(doc, rest.join('.')));
      }
      for (const [key, label] of rowNames(s)) expect(label, key).toBe(LABELS[key]);
    }
  });

  it('B0-6: 短信の葉は、葉の path かその祖先がどれかの画面のセルの path にある (漏れが無い)', () => {
    const p = fullProblem();
    const cellPaths = new Set(screens.flatMap(allCells).map((c) => c.path));
    const covered = (path: string) => {
      const segs = path.split('.');
      return segs.some((_, i) => cellPaths.has(segs.slice(0, segs.length - i).join('.')));
    };
    const missing = leaves('tanshin', p.tanshin).filter((l) => !covered(`tanshin.${l.path}`)).map((l) => l.path);
    expect(missing).toEqual([]);
  });

  it('B0-7: 同じ画面の中で、同じ path のセルは 2 つ無い', () => {
    for (const s of screens) {
      const paths = allCells(s).map((c) => c.path);
      expect(paths.filter((p, i) => paths.indexOf(p) !== i), s.id).toEqual([]);
    }
  });

  it('B0-8: 行の名前は空でなく、行はセルを 1 つ以上持つ', () => {
    for (const s of screens) {
      for (const sec of s.sections) for (const r of sec.rows) {
        expect(r.label, r.itemKey).not.toBe('');
        expect(r.cells.some((c) => c !== null), r.itemKey).toBe(true);
      }
    }
  });

  it('B0-9: labelOverrides は、その行の名前の文字だけを変える (項目キーは同じ。キーが別の行は標準のまま)', () => {
    const p = normalProblem();
    p.labelOverrides = { 'tanshin.incomeStatement.operatingIncome': '営業利金' };
    const pl = tanshin(p, 'incomeStatement');
    expect(row(pl, 'tanshin.incomeStatement.operatingIncome')?.label).toBe('営業利金');
    expect(row(pl, 'tanshin.incomeStatement.ordinaryIncome')?.label).toBe('経常利益');
    expect(row(tanshin(p, 'summary'), 'tanshin.summary.operatingIncome')?.label).toBe('営業利益');
  });

  it('B0-10: unitOverrides は、その画面の単位の表示だけを変える', () => {
    const p = normalProblem();
    p.unitOverrides = { 'tanshin.balanceSheet': '千円' };
    const bs = tanshin(p, 'balanceSheet').header.unit;
    expect([bs.path, bs.text]).toEqual(['tanshin.balanceSheet.unit', '千円']);
    const pl = tanshin(p, 'incomeStatement').header.unit;
    expect([pl.path, pl.text]).toEqual(['tanshin.header.unit', '百万円']);
  });

  it('B0-11: signOverrides は、そのセルだけの負の記号を変える', () => {
    const p = normalProblem();
    p.signOverrides = { 'tanshin.cashFlow.interestDividendIncome': '▲' };
    const cf = tanshin(p, 'cashFlow');
    expect(texts(cf, 'tanshin.cashFlow.interestDividendIncome')).toEqual(['▲90']);
    expect(texts(cf, 'tanshin.cashFlow.interestPaid')).toEqual(['△20']);
  });

  it('B0-12: 上書きが無い問題は標準 (header.unit・△・LABELS)', () => {
    const cf = tanshin(normalProblem(), 'cashFlow');
    expect(cf.header.unit.path).toBe('tanshin.header.unit');
    expect(texts(cf, 'tanshin.cashFlow.interestPaid')).toEqual(['△20']);
  });

  it('B0-13: 異変の有無・場所は表示に出ない (anomaly を読まない)', () => {
    const a = normalProblem();
    const b = normalProblem();
    b.anomaly = { kind: 'k', places: [{ doc: 'tanshin', path: 'incomeStatement.current.ordinaryIncome' }], explanation: 'x', expectedRules: [] };
    for (const id of TANSHIN_SCREENS) expect(tanshin(b, id)).toEqual(tanshin(a, id));
  });
});

describe('B1: サマリー', () => {
  const s = tanshin(normalProblem(), 'summary');
  it('経営成績の節 (前期・当期・前期比)', () => {
    const sec = s.sections.find((x) => x.title === '経営成績')!;
    expect(sec.columns.map((c) => c.label)).toEqual(['前期', '当期', '前期比']);
    expect(texts(s, 'tanshin.summary.netSales')).toEqual(['11,800', '12,400', '5.1%']);
    expect(texts(s, 'tanshin.summary.operatingIncome')).toEqual(['1,120', '1,240', '10.7%']);
    expect(texts(s, 'tanshin.summary.ordinaryIncome')).toEqual(['1,180', '1,310', '11.0%']);
    expect(texts(s, 'tanshin.summary.netIncomeParent')).toEqual(['760', '860', '13.2%']);
    expect(sec.rows.map((r) => r.itemKey)).toEqual(['netSales', 'operatingIncome', 'ordinaryIncome', 'netIncomeParent'].map((k) => `tanshin.summary.${k}`));
  });
  it('指標・配当・方針・日程・注意書き', () => {
    const one = (k: string) => texts(s, `tanshin.summary.${k}`);
    expect(one('operatingMargin')).toEqual(['10.0%']);
    expect(one('roe')).toEqual(['10.9%']);
    expect(one('eps')).toEqual(['100.00円']);
    expect(one('totalAssets')).toEqual(['15,200']);
    expect(one('netAssets')).toEqual(['8,208']);
    expect(one('equity')).toEqual(['8,208']);
    expect(one('equityRatio')).toEqual(['54.0%']);
    expect(one('bps')).toEqual(['954.42円']);
    expect(one('annualDividend')).toEqual(['30.00円']);
    expect(one('interimDividend')).toEqual(['0.00円']);
    expect(one('annualDividendPrevious')).toEqual(['30.00円']);
    expect(one('interimDividendPrevious')).toEqual(['0.00円']);
    expect(one('dividendTotal')).toEqual(['258']);
    expect(one('payoutRatio')).toEqual(['30.0%']);
    expect(one('accountingPolicyChange')).toEqual(['なし']);
    expect(texts(s, 'tanshin.dates.periodEnd')).toEqual(['2027年3月31日']);
    expect(texts(s, 'tanshin.dates.previousPeriodEnd')).toEqual(['2026年3月31日']);
    expect(texts(s, 'tanshin.dates.disclosure')).toEqual(['2027年5月14日']);
    expect(texts(s, 'tanshin.dates.shareholdersMeeting')).toEqual(['2027年6月26日']);
    expect(one('auditNote')).toEqual(['決算短信は公認会計士又は監査法人の監査の対象外です']);
  });
  it('セルの種別・段・path', () => {
    const c = row(s, 'tanshin.summary.netSales')!.cells;
    expect(c.map((x) => [x?.path, x?.kind, x?.stage])).toEqual([
      ['tanshin.summary.netSales.previous', 'money', 'previous'],
      ['tanshin.summary.netSales.current', 'money', 'current'],
      ['tanshin.summary.netSales.changeRate', 'percent', null],
    ]);
    expect(row(s, 'tanshin.summary.eps')!.cells[0]).toMatchObject({ path: 'tanshin.summary.eps', kind: 'perShare', unit: '円' });
    expect(row(s, 'tanshin.dates.periodEnd')!.cells[0]).toMatchObject({ kind: 'date', unit: null });
    expect(row(s, 'tanshin.summary.accountingPolicyChange')!.cells[0]).toMatchObject({ kind: 'flag', value: false });
  });
});

describe('B2: 貸借対照表', () => {
  const s = tanshin(normalProblem(), 'balanceSheet');
  it('列見出し (日付のセルつき)・4 つの節 (9・7・6・1)・23 行', () => {
    const cols = s.sections[0]!.columns;
    expect(cols.map((c) => [c.label, c.cell?.path, c.cell?.text])).toEqual([
      ['前期', 'tanshin.columnDates.balanceSheet.previous', '2026年3月31日'],
      ['当期', 'tanshin.columnDates.balanceSheet.current', '2027年3月31日'],
    ]);
    expect(s.sections.map((x) => x.rows.length)).toEqual([9, 7, 6, 1]);
    expect(s.sections.map((x) => x.title)).toEqual(['資産の部', '負債の部', '純資産の部', null]);
  });
  it('行は型の順、各行 2 列 (前期・当期)', () => {
    const keys = s.sections.flatMap((x) => x.rows.map((r) => r.itemKey));
    expect(keys[0]).toBe('tanshin.balanceSheet.cash');
    expect(keys[8]).toBe('tanshin.balanceSheet.totalAssets');
    expect(keys[9]).toBe('tanshin.balanceSheet.payables');
    expect(keys[15]).toBe('tanshin.balanceSheet.totalLiabilities');
    expect(keys[16]).toBe('tanshin.balanceSheet.capitalStock');
    expect(keys[21]).toBe('tanshin.balanceSheet.totalNetAssets');
    expect(keys[22]).toBe('tanshin.balanceSheet.totalLiabilitiesAndNetAssets');
    expect(texts(s, 'tanshin.balanceSheet.cash')).toEqual(['2,100', '2,300']);
    expect(texts(s, 'tanshin.balanceSheet.totalAssets')).toEqual(['14,640', '15,200']);
    expect(texts(s, 'tanshin.balanceSheet.totalLiabilitiesAndNetAssets')).toEqual(['14,640', '15,200']);
    expect(row(s, 'tanshin.balanceSheet.cash')!.cells.map((c) => c?.path)).toEqual(['tanshin.balanceSheet.previous.cash', 'tanshin.balanceSheet.current.cash']);
  });
  it('合計の行は強調、ほかは強調でない', () => {
    const emph = s.sections.flatMap((x) => x.rows).filter((r) => r.emphasis).map((r) => r.itemKey.split('.').pop());
    expect(emph).toEqual(['totalCurrentAssets', 'totalFixedAssets', 'totalAssets', 'totalCurrentLiabilities', 'totalLiabilities', 'totalShareholdersEquity', 'totalNetAssets', 'totalLiabilitiesAndNetAssets']);
  });
});

describe('B3: 損益計算書', () => {
  const s = tanshin(normalProblem(), 'incomeStatement');
  it('15 行を 1 つの節で、前期・当期 (日付つき)', () => {
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]!.rows).toHaveLength(15);
    expect(s.sections[0]!.columns.map((c) => c.cell?.path)).toEqual(['tanshin.columnDates.incomeStatement.previous', 'tanshin.columnDates.incomeStatement.current']);
    expect(texts(s, 'tanshin.incomeStatement.netSales')).toEqual(['11,800', '12,400']);
    expect(texts(s, 'tanshin.incomeStatement.operatingIncome')).toEqual(['1,120', '1,240']);
    expect(texts(s, 'tanshin.incomeStatement.extraordinaryLoss')).toEqual(['20', '60']);
    expect(texts(s, 'tanshin.incomeStatement.netIncomeParent')).toEqual(['760', '860']);
  });
  it('損益の合計の行は強調', () => {
    const emph = s.sections[0]!.rows.filter((r) => r.emphasis).map((r) => r.itemKey.split('.').pop());
    expect(emph).toEqual(['grossProfit', 'operatingIncome', 'ordinaryIncome', 'incomeBeforeTax', 'netIncome', 'netIncomeParent']);
  });
});

describe('B4: キャッシュ・フロー計算書', () => {
  const s = tanshin(normalProblem(), 'cashFlow');
  it('26 行を 1 つの節で、当期の 1 列 (当期末と前期末の日付のセル)', () => {
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]!.rows).toHaveLength(26);
    const cols = s.sections[0]!.columns;
    expect(cols).toHaveLength(1);
    expect([cols[0]!.label, cols[0]!.cell?.path, cols[0]!.cell?.text]).toEqual(['当期', 'tanshin.columnDates.cashFlow.current', '2027年3月31日']);
    const prev = s.header.extra;
    expect(prev?.map((c) => [c.path, c.text])).toEqual([['tanshin.columnDates.cashFlow.previous', '2026年3月31日']]);
  });
  it('例の行 (負は △)', () => {
    expect(texts(s, 'tanshin.cashFlow.incomeBeforeTax')).toEqual(['1,250']);
    expect(texts(s, 'tanshin.cashFlow.interestDividendIncome')).toEqual(['△90']);
    expect(texts(s, 'tanshin.cashFlow.operatingCashFlow')).toEqual(['1,500']);
    expect(texts(s, 'tanshin.cashFlow.longTermBorrowings')).toEqual(['200']);
    expect(texts(s, 'tanshin.cashFlow.longTermRepayments')).toEqual(['△300']);
    expect(texts(s, 'tanshin.cashFlow.cashEnding')).toEqual(['2,300']);
  });
  it('小計・活動の計・期首残高・期末残高・増減額は強調', () => {
    const emph = s.sections[0]!.rows.filter((r) => r.emphasis).map((r) => r.itemKey.split('.').pop());
    expect(emph).toEqual(['subtotal', 'operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'netChangeInCash', 'cashBeginning', 'cashEnding']);
  });
});

describe('B5・B6: 注記', () => {
  const s = tanshin(normalProblem(), 'notes');
  it('文字列の行', () => {
    expect(texts(s, 'tanshin.notes.goingConcern')).toEqual(['該当事項はありません。']);
    expect(texts(s, 'tanshin.notes.cashScope')).toEqual(['現金及び預金']);
    expect(texts(s, 'tanshin.notes.subsequentEvents')).toEqual(['該当事項はありません。']);
    expect(texts(s, 'tanshin.notes.accountingPolicyNote')).toEqual(['該当事項はありません。']);
  });
  it('セグメントごとの節 (列見出しにセグメント名のセル)・行は売上高とセグメント利益', () => {
    const segs = s.sections.filter((x) => x.columns.some((c) => c.cell?.path.includes('.name')));
    expect(segs).toHaveLength(2);
    expect(segs[0]!.columns.map((c) => [c.label, c.cell?.path, c.cell?.text])).toEqual([
      ['前期', 'tanshin.notes.segments.previous.segments.0.name', '電機部品事業'],
      ['当期', 'tanshin.notes.segments.current.segments.0.name', '電機部品事業'],
    ]);
    expect(segs[0]!.rows.map((r) => [r.itemKey, r.cells.map((c) => c?.text)])).toEqual([
      ['tanshin.notes.segments.segments.0.netSales', ['7,500', '7,900']],
      ['tanshin.notes.segments.segments.0.profit', ['820', '900']],
    ]);
    expect(segs[1]!.columns[1]!.cell?.text).toBe('産業機器事業');
    expect(segs[1]!.rows.map((r) => r.cells.map((c) => c?.text))).toEqual([['4,300', '4,500'], ['410', '450']]);
  });
  it('全社の節・1 株当たり情報', () => {
    expect(texts(s, 'tanshin.notes.segments.adjustment')).toEqual(['△110', '△110']);
    expect(texts(s, 'tanshin.notes.segments.consolidatedNetSales')).toEqual(['11,800', '12,400']);
    expect(texts(s, 'tanshin.notes.segments.consolidatedOperatingIncome')).toEqual(['1,120', '1,240']);
    expect(texts(s, 'tanshin.notes.averageSharesThousand')).toEqual(['8,600']);
    expect(texts(s, 'tanshin.notes.bps')).toEqual(['954.42円']);
    expect(texts(s, 'tanshin.notes.eps')).toEqual(['100.00円']);
    expect(row(s, 'tanshin.notes.averageSharesThousand')!.cells[0]).toMatchObject({ kind: 'shares', unit: '千株' });
  });
  it('B6: 3 セグメントなら節が 3 つ。前期と当期でセグメントの数が違っても落ちず、足りない側は空のセル', () => {
    const full = tanshin(fullProblem(), 'notes');
    expect(full.sections.filter((x) => x.columns.some((c) => c.cell?.path.includes('.name')))).toHaveLength(3);
    const odd = fullProblem();
    odd.tanshin.notes.segments.previous.segments.pop();
    const sec = tanshin(odd, 'notes').sections.filter((x) => x.columns.some((c) => c.cell?.path.includes('.name')))[2]!;
    expect(sec.columns[0]!.cell).toBeNull();
    expect(sec.rows[0]!.cells[0]).toBeNull();
    expect(sec.rows[0]!.cells[1]?.text).toBe('100');
  });
});

describe('B7: 画面の ID', () => {
  it('どの画面も doc と id を返す', () => {
    for (const id of TANSHIN_SCREENS) expect(tanshin(normalProblem(), id)).toMatchObject({ doc: 'tanshin', id });
  });
});
