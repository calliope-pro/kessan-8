// ケース表 docs/proto/test-cases.md の P (遊び手に渡す形)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveCard } from './cards';
import { aggregate, buildDeck, FORM_KINDS, guessProbability, parseRecord, scoreSession, splitRecords, summarize, type Response } from './playtest';
import { recordText } from './ui/playtest';
import { COMPANIES, NORMALS, SAMPLE } from './testing';

const REF = { sample: SAMPLE, companies: COMPANIES };
const headlineOf = (r: ReturnType<typeof buildDeck>[number]) => deriveCard(r.problem, COMPANIES.find((c) => c.id === r.problem.companyId)!, r.shape, r.edits).headline?.text;

const resp = (anomalyHits: number, falseAlarms: number): Response[] => [
  ...Array.from({ length: 4 }, (_, i): Response => ({ index: i, hasAnomaly: true, said: i < anomalyHits ? 'anomaly' : 'normal' })),
  ...Array.from({ length: 4 }, (_, i): Response => ({ index: 4 + i, hasAnomaly: false, said: i < falseAlarms ? 'anomaly' : 'normal' })),
];

describe('P1〜P3 確かめの 1 組', () => {
  it('P1 8 枚 = 異変 4 + 正常 4。異変は型のずれだけ', () => {
    for (const shape of ['E1', 'E3'] as const) for (let seed = 1; seed < 50; seed++) {
      const deck = buildDeck(seed, shape, NORMALS, REF);
      expect(deck).toHaveLength(8);
      expect(deck.filter((r) => r.anomaly).length).toBe(4);
      for (const r of deck) {
        expect(r.shape).toBe(shape);
        if (r.anomaly) expect(FORM_KINDS).toContain(r.anomaly.kind);
      }
      expect(new Set(deck.filter((r) => r.anomaly).map((r) => r.anomaly!.kind)).size).toBe(4);
    }
  });
  it('P1 異変の位置は種で散る (いつも前半に固まらない)', () => {
    const firsts = new Set<boolean>();
    for (let seed = 1; seed < 60; seed++) firsts.add(!!buildDeck(seed, 'E1', NORMALS, REF)[0]!.anomaly);
    expect(firsts.size).toBe(2);
  });
  it('P2 同じ種・同じ形は同じ 1 組', () => {
    expect(buildDeck(5, 'E1', NORMALS, REF)).toEqual(buildDeck(5, 'E1', NORMALS, REF));
  });
  it('P3 同じ会社を使わない', () => {
    for (let seed = 1; seed < 50; seed++) {
      const deck = buildDeck(seed, 'E3', NORMALS, REF);
      expect(new Set(deck.map((r) => r.problem.companyId)).size).toBe(8);
      expect(COMPANIES.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('P12〜P14 確かめの組は見本と同じ見出し語 (包括レビュー B1)', () => {
  const sampleHead = headlineOf({ problem: SAMPLE, baseId: SAMPLE.id, shape: 'E1', edits: [], anomaly: null });
  it('見本の見出しは【増益】 (前提)', () => expect(sampleHead).toBe('増益'));
  it('P12 E1 の 8 枚は、正常も異変も、見出し語が見本と同じ', () => {
    for (let seed = 1; seed <= 400; seed++) for (const r of buildDeck(seed, 'E1', NORMALS, REF)) expect(headlineOf(r)).toBe(sampleHead);
  });
  it('P12 E3 (見出し語なし) は絞らない: 減益の会社も出る', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) for (const r of buildDeck(seed, 'E3', NORMALS, REF)) used.add(r.problem.companyId);
    expect(used.has('c04') || used.has('c09')).toBe(true);
  });
  it('P13 E1 は、見本と同じ見出し語の 8 社のちょうど全部。並びだけが種で変わる', () => {
    const want = ['c01', 'c02', 'c03', 'c05', 'c06', 'c07', 'c08', 'c10'];
    const orders = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const ids = buildDeck(seed, 'E1', NORMALS, REF).map((r) => r.problem.companyId);
      expect([...ids].sort()).toEqual(want);
      orders.add(ids.join());
    }
    expect(orders.size).toBeGreaterThan(50);
  });
  it('P13 条件に合う会社が 8 社に満たない見本のときは、組を作れずに例外', () => {
    const down = NORMALS.find((p) => p.companyId === 'c04')!;
    expect(() => buildDeck(1, 'E1', NORMALS, { sample: down, companies: COMPANIES })).toThrow('会社が足りません');
  });
  it('P14 台本の種の表の 10 個の種が、P12 を満たす。A の 5 つは異変の並びが互いに違う', () => {
    const guide = readFileSync(new URL('../../docs/proto/playtest-guide.md', import.meta.url), 'utf8');
    const rows = [...guide.matchAll(/^\| \d 人目 \| P\d \| (\d+) \| (\d+) \| A → B \|$/gm)].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(rows).toHaveLength(5);
    const patterns = new Set<string>();
    for (const [a, b] of rows) {
      const da = buildDeck(a, 'E1', NORMALS, REF);
      for (const r of da) expect(headlineOf(r)).toBe(sampleHead);
      for (const r of buildDeck(b, 'E3', NORMALS, REF)) expect(r.shape).toBe('E3');
      patterns.add(da.map((r) => (r.anomaly ? 'x' : '.')).join(''));
    }
    expect(patterns.size).toBe(5);
  });
});

describe('P4・P5 採点 (plans.md §8.1 の合格の基準)', () => {
  it('P4 見つけ 3 以上かつ誤り 1 以下は合格', () => {
    expect(scoreSession(resp(3, 1)).pass).toBe(true);
    expect(scoreSession(resp(4, 0)).pass).toBe(true);
    expect(scoreSession(resp(4, 1))).toMatchObject({ found: 4, falseAlarms: 1, pass: true });
  });
  it('P5 境は不合格', () => {
    expect(scoreSession(resp(2, 0)).pass).toBe(false);
    expect(scoreSession(resp(4, 2)).pass).toBe(false);
    expect(scoreSession(resp(2, 2)).pass).toBe(false);
    expect(scoreSession(resp(0, 0))).toMatchObject({ found: 0, falseAlarms: 0, pass: false });
  });
});

describe('P6 5 人の集計', () => {
  const n = (passed: number, total: number) => summarize(Array.from({ length: total }, (_, i) => ({ pass: i < passed })));
  it('5 人以上: 5/5 = 強い合図、4/5 = 弱い合図、3 以下 = 効かない', () => {
    expect(n(5, 5).verdict).toBe('強い合図');
    expect(n(4, 5).verdict).toBe('弱い合図');
    expect(n(3, 5).verdict).toBe('効かない');
    expect(n(0, 5).verdict).toBe('効かない');
  });
  it('5 人に満たない: 全員合格なら弱い合図、それ以外は未確認 (Q17)', () => {
    expect(n(3, 3).verdict).toBe('弱い合図');
    expect(n(2, 3).verdict).toBe('未確認');
    expect(n(1, 1).verdict).toBe('未確認');
    expect(n(0, 0).verdict).toBe('未確認');
  });
  it('人数と合格を返す', () => {
    expect(n(4, 5)).toMatchObject({ passed: 4, n: 5 });
  });
});

describe('P7 偶然の合格率 (導出の再現)', () => {
  it('1 人 ≈ 9.8%、5 人中 4 人以上 ≈ 0.04%', () => {
    const { one, fourOfFive } = guessProbability();
    expect(one).toBeCloseTo(25 / 256, 6);
    expect(Math.round(one * 1000) / 10).toBe(9.8);
    expect(Math.round(fourOfFive * 100000) / 1000).toBeCloseTo(0.04, 2);
  });
});

const env = (pid: string, withSample: boolean, shape: 'E1' | 'E3' = 'E1', seed = 5) => ({ normals: NORMALS, companies: COMPANIES, sample: SAMPLE, seed, shape, withSample, pid });
function record(pid: string, withSample: boolean, found: number, fa: number, shape: 'E1' | 'E3' = 'E1', seed = 5): string {
  const e = env(pid, withSample, shape, seed);
  const deck = buildDeck(seed, shape, NORMALS, REF);
  const anomalyIdx = deck.map((r, i) => (r.anomaly ? i : -1)).filter((i) => i >= 0);
  const normalIdx = deck.map((r, i) => (r.anomaly ? -1 : i)).filter((i) => i >= 0);
  const rs: Response[] = deck.map((r, i) => ({
    index: i,
    hasAnomaly: !!r.anomaly,
    said: (anomalyIdx.indexOf(i) >= 0 && anomalyIdx.indexOf(i) < found) || (normalIdx.indexOf(i) >= 0 && normalIdx.indexOf(i) < fa) ? 'anomaly' : 'normal',
  }));
  return recordText(e, deck, rs, rs.map(() => 3000));
}

describe('P8 記録の文を読み戻す', () => {
  it('参加者・形・0 社目・種・見つけ・誤り・合否', () => {
    expect(parseRecord(record('T1', true, 3, 1))).toEqual({ pid: 'T1', shape: 'E1', withSample: true, seed: 5, found: 3, anomalies: 4, falseAlarms: 1, normals: 4, pass: true });
    expect(parseRecord(record('T2', false, 2, 0, 'E3', 9))).toEqual({ pid: 'T2', shape: 'E3', withSample: false, seed: 9, found: 2, anomalies: 4, falseAlarms: 0, normals: 4, pass: false });
  });
  it('壊れた文は null', () => {
    expect(parseRecord('')).toBeNull();
    expect(parseRecord('８期連続 試作 確かめ記録\n参加者: T1')).toBeNull();
  });
});

describe('P9 複数の記録の集計', () => {
  const people = (passes: boolean[]) => passes.map((ok, i) => record(`P${i + 1}`, true, ok ? 4 : 1, 0, 'E1', 100 + i));
  it('記録の頭の行で分ける', () => {
    expect(splitRecords(people([true, true, false]).join('\n\n'))).toHaveLength(3);
    expect(splitRecords('なにもない文')).toEqual([]);
  });
  it('参加者ごとに「0 社目あり」の記録で合否を数え、P6 の言い方で返す', () => {
    expect(aggregate(people([true, true, true, true, true]).map(parseRecord) as never).verdict).toBe('強い合図');
    expect(aggregate(people([true, true, true, true, false]).map(parseRecord) as never).verdict).toBe('弱い合図');
    expect(aggregate(people([true, true, true, false, false]).map(parseRecord) as never).verdict).toBe('効かない');
    expect(aggregate(people([true, true]).map(parseRecord) as never)).toMatchObject({ n: 2, passed: 2, verdict: '弱い合図' });
    expect(aggregate(people([true, false]).map(parseRecord) as never).verdict).toBe('未確認');
  });
  it('同じ参加者の 0 社目なしの記録は、合否に数えない', () => {
    const recs = [record('A', true, 4, 0, 'E1', 1), record('A', false, 0, 0, 'E3', 2)].map(parseRecord);
    expect(aggregate(recs as never)).toMatchObject({ n: 1, passed: 1 });
  });
});

describe('P10 補助: 0 社目なしとの比較', () => {
  it('同じ人が両方を遊んだときだけ、見つけ数の差を出す', () => {
    const recs = [record('A', true, 4, 0, 'E1', 1), record('A', false, 2, 0, 'E3', 2), record('B', true, 3, 1, 'E1', 3)].map(parseRecord);
    const a = aggregate(recs as never);
    expect(a.aux).toEqual([{ pid: 'A', foundWith: 4, foundWithout: 2, diff: 2, ceiling: false }]);
  });
  it('両方が 4/4 のときは天井と添える', () => {
    const recs = [record('A', true, 4, 0, 'E1', 1), record('A', false, 4, 0, 'E3', 2)].map(parseRecord);
    expect(aggregate(recs as never).aux[0]).toMatchObject({ diff: 0, ceiling: true });
  });
});

describe('集計の文 (?mode=summary の中身)', () => {
  it('5 人ぶんの記録から、判定と表を出す', async () => {
    const { summaryText } = await import('./ui/summary');
    const text = [1, 2, 3, 4, 5].map((i) => record(`P${i}`, true, i === 5 ? 1 : 4, 0, 'E1', 200 + i)).join('\n\n');
    const out = summaryText(text);
    expect(out).toContain('判定: 弱い合図 (合格 4 / 5 人');
    expect(out).toContain('P5 | あり | E1 | 205 | 1/4 | 0/4 | 不合格');
    expect(summaryText('なにもない')).toContain('記録が読めません');
  });
  it('P15 添え書きは判定と食い違わない (包括レビュー N1)', async () => {
    const { summaryText } = await import('./ui/summary');
    const rec = (passes: boolean[]) => summaryText(passes.map((ok, i) => record(`P${i + 1}`, true, ok ? 4 : 1, 0, 'E1', 300 + i)).join('\n\n'));
    const one = rec([true]);
    expect(one).toContain('判定: 未確認 (合格 1 / 1 人');
    expect(one).not.toMatch(/(?<!2 人以上で)全員合格なら/); // 「1 人でも全員合格なら弱い合図」とは言わない
    expect(one).toContain('2 人以上');
    const two = rec([true, true]);
    expect(two).toContain('判定: 弱い合図 (合格 2 / 2 人');
    expect(two).toContain('全員合格なので「弱い合図」');
    const mixed = rec([true, false]);
    expect(mixed).toContain('判定: 未確認 (合格 1 / 2 人');
    expect(mixed).toContain('不合格が混じるので「未確認」');
    expect(rec([true, true, true, true, true])).toContain('統計的な結論ではない');
  });
});
