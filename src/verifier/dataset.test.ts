// D1〜D25 (docs/test-cases/validator.md §2.8): データ全件。
import { describe, expect, it } from 'vitest';
import type { Company } from '../domain/types.ts';
import { verifyDataset } from './index.ts';
import { roundedSalesNormal, add, anomalyVariant, companyA, companyB, completePool, DATA_KINDS, fileOf, kindOf, normalVariant, set, softOnly, type DatasetInput } from './test-utils.ts';

const base = (): DatasetInput => {
  const p = normalVariant('easy-001', 'easy', 'fixture-c01');
  return { companies: [companyA()], kinds: DATA_KINDS, problems: [{ file: fileOf(p), value: p }] };
};
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);
const shortCodes = (r: { shortfalls: { code: string }[] }) => r.shortfalls.map((e) => e.code);
const withProblem = (input: DatasetInput, p: unknown, file?: string): DatasetInput => {
  const q = p as { difficulty: string; id: string };
  return { ...input, problems: [{ file: file ?? `problems/${q.difficulty}/${q.id}.json`, value: p }] };
};

describe('verifyDataset', () => {
  it('D1: 基準問題 1 件・会社 1 社 → errors 空。stats に難易度ごとの数と異変の数', () => {
    const r = verifyDataset(base());
    expect(r.errors).toEqual([]);
    expect(r.stats.easy).toEqual({ total: 1, anomaly: 0, normal: 1 });
    expect(r.stats.hard).toEqual({ total: 0, anomaly: 0, normal: 0 });
  });

  it('D2: id とファイル名が違う', () => {
    const i = base();
    i.problems[0]!.file = 'problems/easy/easy-002.json';
    expect(codes(verifyDataset(i))).toContain('id-mismatch');
  });

  it('D3: 置き場と難易度が違う', () => {
    const i = base();
    i.problems[0]!.file = 'problems/hard/easy-001.json';
    expect(codes(verifyDataset(i))).toContain('difficulty-mismatch');
  });

  it('D4: 会社が一覧に無い', () => {
    const i = withProblem(base(), normalVariant('easy-001', 'easy', 'nobody'));
    expect(codes(verifyDataset(i))).toContain('unknown-company');
  });

  it('D5: 同じ id が 2 ファイル', () => {
    const i = base();
    i.problems.push({ file: 'problems/easy/copy/easy-001.json', value: i.problems[0]!.value });
    expect(codes(verifyDataset(i))).toContain('duplicate-id');
  });

  it('D6: 異変の種類が一覧に無い', () => {
    const p = set(anomalyVariant('easy-001', 'easy', 'fixture-c01'), 'anomaly.kind', 'k-nothing');
    expect(codes(verifyDataset(withProblem(base(), p)))).toContain('unknown-kind');
  });

  it('D7: 正常な問題が hard を破る → hard-violation (規則 ID と問題 ID)', () => {
    const p = add(normalVariant('easy-001', 'easy', 'fixture-c01'), 'tanshin.balanceSheet.current.totalAssets', 100);
    const r = verifyDataset(withProblem(base(), p));
    const e = r.errors.find((x) => x.code === 'hard-violation');
    expect(e?.problem).toBe('easy-001');
    expect(e?.message).toContain('bs-total-assets');
  });

  it('D8: 異変の問題が種類の指定と違う → anomaly-mismatch', () => {
    const p = set(anomalyVariant('easy-001', 'easy', 'fixture-c01'), 'anomaly.expectedRules', ['sum-change-net-sales']);
    expect(codes(verifyDataset(withProblem(base(), p)))).toContain('anomaly-mismatch');
  });

  it('D9: 型の形が誤りなら shape だけで、規則の検証はしない (例外にならない)', () => {
    const p = normalVariant('easy-001', 'easy', 'fixture-c01') as unknown as Record<string, Record<string, Record<string, unknown>>>;
    delete p.tanshin!.cashFlow!.capex;
    const r = verifyDataset(withProblem(base(), p, 'problems/easy/easy-001.json'));
    expect(codes(r)).toEqual(['shape']);
  });

  it('D10: 種類の規則 ID が存在しない → unknown-rule', () => {
    const i = { ...base(), kinds: [kindOf('k-bad', 'calculation', ['bs-nothing'])] };
    const r = verifyDataset(i);
    expect(r.errors.some((e) => e.code === 'unknown-rule' && e.message.includes('k-bad'))).toBe(true);
  });

  it('D11: 会社・種類の id の重複', () => {
    const i = base();
    i.companies.push(companyA());
    i.kinds = [...DATA_KINDS, DATA_KINDS[0]!];
    const c = codes(verifyDataset(i));
    expect(c).toContain('duplicate-company');
    expect(c).toContain('duplicate-kind');
  });

  it('D12: soft だけが破れる問題 (株数 8,630 千株で配当性向の別経路だけがずれる) → errors 空、soft に出る', () => {
    const r = verifyDataset(withProblem(base(), softOnly('easy-001')));
    expect(r.errors).toEqual([]);
    expect(r.soft.map((x) => x.code)).toEqual(['soft-payout-cross-path']);
  });

  it('D13: 難易度ごとの問題数が 25 未満 → shortfalls に pool-size (easy・hard)', () => {
    const r = verifyDataset(base());
    expect(r.shortfalls.filter((s) => s.code === 'pool-size').length).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it('D14: 両面の会社が 8 社未満 → both-sided-companies', () => {
    expect(shortCodes(verifyDataset(base()))).toContain('both-sided-companies');
  });

  it('D15: 満たすデータ (各難易度 25 件・両面の会社 8 社・異変 12) は shortfalls も errors も空', () => {
    const r = verifyDataset(completePool());
    expect(r.errors).toEqual([]);
    expect(r.shortfalls).toEqual([]);
    expect(r.stats.easy).toEqual({ total: 25, anomaly: 12, normal: 13 });
  });

  it('D16: 0 件 → errors 空、shortfalls に pool-size と both-sided-companies', () => {
    const r = verifyDataset({ companies: [], kinds: [], problems: [] });
    expect(r.errors).toEqual([]);
    expect(shortCodes(r)).toEqual(expect.arrayContaining(['pool-size', 'both-sided-companies']));
  });

  it('D17: 系統の偏り (やさしいの異変の見た目 + 計算が 8 割未満) → family-balance', () => {
    const r = verifyDataset(completePool(4));
    expect(r.errors).toEqual([]);
    expect(r.shortfalls.some((s) => s.code === 'family-balance' && s.message.includes('easy'))).toBe(true);
  });

  it('D18: 異変の数が比の外 (5 件) → anomaly-ratio', () => {
    const input = completePool();
    let kept = 0;
    input.problems = input.problems.map((p) => {
      const q = p.value as ReturnType<typeof normalVariant>;
      if (q.difficulty === 'easy' && q.anomaly && ++kept > 5) return { file: p.file, value: normalVariant(q.id, 'easy', q.companyId) };
      return p;
    });
    expect(shortCodes(verifyDataset(input))).toContain('anomaly-ratio');
  });

  it('D19: primaryRules が空 → kind-no-primary', () => {
    const i = { ...base(), kinds: [kindOf('k-empty', 'calculation', [], ['bs-balance'])] };
    expect(codes(verifyDataset(i))).toContain('kind-no-primary');
  });

  it('D20: primaryRules が allowedRules に含まれない → kind-primary-not-allowed', () => {
    const i = { ...base(), kinds: [kindOf('k-x', 'calculation', ['bs-balance'], ['bs-total-assets'])] };
    expect(codes(verifyDataset(i))).toContain('kind-primary-not-allowed');
  });

  it('D21: 系統が未知 / 難易度が系統と合わない', () => {
    const bad = { ...kindOf('k-y', 'calculation', ['bs-balance']), family: 'nothing' } as unknown as ReturnType<typeof kindOf>;
    expect(codes(verifyDataset({ ...base(), kinds: [bad] }))).toContain('kind-shape');
    const p = set(anomalyVariant('hard-001', 'hard', 'fixture-c01', 'rate'), 'difficulty', 'hard');
    const r = verifyDataset({ ...base(), problems: [{ file: 'problems/hard/hard-001.json', value: p }] });
    expect(codes(r)).toContain('family-difficulty-mismatch');
  });

  it('D22: 会社の形の誤り (4 通り)', () => {
    const c = companyA() as unknown as Record<string, unknown>;
    const bads: Record<string, unknown>[] = [
      { ...c, irUnit: '千円' },
      { ...c, segmentNames: ['a', 'b', 'c', 'd'] },
      (({ colors: _colors, ...rest }) => rest)(c),
      (({ securitiesCode: _s, ...rest }) => rest)(c),
    ];
    for (const bad of bads) {
      const r = verifyDataset({ companies: [bad as unknown as Company], kinds: [], problems: [] });
      expect(codes(r)).toContain('company-shape');
    }
  });

  it('D22b: 任意項目 (business・tip) の型の誤り', () => {
    const c = { ...companyA(), business: 1 } as unknown as Company;
    expect(codes(verifyDataset({ companies: [c], kinds: [], problems: [] }))).toContain('company-shape');
    const k = { ...kindOf('k-tip', 'calculation', ['bs-balance']), tip: 1 } as unknown as ReturnType<typeof kindOf>;
    expect(codes(verifyDataset({ companies: [], kinds: [k], problems: [] }))).toContain('kind-shape');
  });

  it('D23: 期の表記が会社と違う → hard-violation (header-period-label)', () => {
    const p = set(normalVariant('easy-001', 'easy', 'fixture-c01'), 'fiscalYear', 2030);
    expect(verifyDataset(withProblem(base(), p)).errors.some((e) => e.code === 'hard-violation' && e.message.includes('header-period-label'))).toBe(true);
  });

  it('D24: 会社が 3 セグメントで問題が 2 → seg-count', () => {
    const c = { ...companyA(), segmentNames: ['電機部品事業', '産業機器事業', '保守サービス事業'] };
    const r = verifyDataset({ ...base(), companies: [c] });
    expect(r.errors.some((e) => e.message.includes('seg-count'))).toBe(true);
  });

  it('D25: 正常な問題に labelOverrides (値が標準と同じでも) → override-on-normal', () => {
    const p = set(normalVariant('easy-001', 'easy', 'fixture-c01'), 'labelOverrides', { 'tanshin.balanceSheet.cash': '現金及び預金' });
    expect(codes(verifyDataset(withProblem(base(), p)))).toContain('override-on-normal');
  });

  it('D26: 正常な問題で、IR の比率が IR の表示金額からの検算と食い違う → ir-display-mismatch (致命)', () => {
    const company = { ...companyB(), id: 'fixture-c01' };
    const p = roundedSalesNormal();
    const r = verifyDataset({ companies: [company], kinds: DATA_KINDS, problems: [{ file: `problems/easy/${p.id}.json`, value: p }] });
    expect(r.errors.some((e) => e.code === 'ir-display-mismatch' && e.message.includes('ir-display-hl-change-net-sales'))).toBe(true);
  });

  it('D27: 異変の問題には当てない (同じ食い違いがあっても ir-display-mismatch は出ない)', () => {
    const company = { ...companyB(), id: 'fixture-c01' };
    const p = roundedSalesNormal();
    const anomaly = { kind: 'k-rate', places: [{ doc: 'tanshin', path: 'summary.ordinaryIncome.changeRate' }], explanation: '説明', expectedRules: [] };
    const r = verifyDataset({ companies: [company], kinds: DATA_KINDS, problems: [{ file: `problems/easy/${p.id}.json`, value: { ...p, anomaly } }] });
    expect(r.errors.some((e) => e.code === 'ir-display-mismatch')).toBe(false);
  });

  // ---- 見本 (samples/*.json、#86): 正常な問題として検証する。プールには入れない ----
  describe('見本 (samples)', () => {
    // 見本は基準問題と同じ期 (2027) の別会社で作る (期の表記を合わせたまま、プールと会社 × 期が重ならない)
    const sampleCompany = { ...companyA(), id: 'c-sample' };
    const withSample = (value: unknown, extra: Partial<DatasetInput> = {}): DatasetInput => ({
      ...base(),
      companies: [companyA(), sampleCompany],
      samples: [{ file: 'samples/sample.json', value }],
      ...extra,
    });
    const goodSample = () => ({ problem: normalVariant('sample', 'easy', 'c-sample'), notes: { summary: 'これが正常です' } });

    it('D28: 正常な見本は errors 空で、プールの数には入らない', () => {
      const r = verifyDataset(withSample(goodSample()));
      expect(r.errors).toEqual([]);
      expect(r.stats.easy.total).toBe(1);
    });

    it('D29: 見本が hard を破る (V1 の変更) → hard-violation (見本のファイルと規則 ID)', () => {
      const g = goodSample();
      const r = verifyDataset(withSample({ ...g, problem: add(g.problem, 'tanshin.balanceSheet.current.totalAssets', 100) }));
      const e = r.errors.find((x) => x.code === 'hard-violation');
      expect(e?.message).toContain('samples/sample.json');
      expect(e?.message).toContain('bs-total-assets');
    });

    it('D30: 見本の IR の比率が IR の表示金額からの検算と食い違う → ir-display-mismatch', () => {
      const p = roundedSalesNormal();
      const r = verifyDataset({
        ...base(),
        companies: [{ ...companyB(), id: 'c-sample' }, companyA()],
        samples: [{ file: 'samples/sample.json', value: { problem: { ...p, id: 'sample', companyId: 'c-sample' }, notes: {} } }],
      });
      expect(r.errors.some((e) => e.code === 'ir-display-mismatch')).toBe(true);
    });

    it('D31: 見本が異変の問題 → sample-anomaly', () => {
      const a = anomalyVariant('sample', 'easy', 'c-sample');
      expect(codes(verifyDataset(withSample({ problem: a, notes: {} })))).toContain('sample-anomaly');
    });

    it('D32: 見本がプールの問題と同じ会社 × 期 → sample-overlaps-pool', () => {
      // 基準問題 (easy-001) は fixture-c01 × 2027。見本を同じ会社 × 期にする
      const p = normalVariant('sample', 'easy', 'fixture-c01');
      const r = verifyDataset(withSample({ problem: p, notes: {} }));
      expect(codes(r)).toContain('sample-overlaps-pool');
    });

    it('D33: 見本の形の誤り (problem が無い・notes が文字列の record でない・問題の形の誤り) → sample-shape', () => {
      expect(codes(verifyDataset(withSample({ notes: {} })))).toContain('sample-shape');
      expect(codes(verifyDataset(withSample({ problem: goodSample().problem, notes: { summary: 1 } })))).toContain('sample-shape');
      const broken = goodSample().problem as unknown as Record<string, Record<string, unknown>>;
      delete broken.tanshin!.cashFlow;
      expect(codes(verifyDataset(withSample({ problem: broken, notes: {} })))).toContain('sample-shape');
    });

    it('D34: 見本の会社が一覧に無い → unknown-company。見本の id がプールの id と同じ → duplicate-id', () => {
      const p = normalVariant('sample', 'easy', 'nobody');
      expect(codes(verifyDataset(withSample({ problem: p, notes: {} })))).toContain('unknown-company');
      const dup = { problem: normalVariant('easy-001', 'easy', 'c-sample'), notes: {} };
      expect(codes(verifyDataset(withSample(dup)))).toContain('duplicate-id');
    });
  });
});
