// ケース表 docs/test-cases/screens-v3.md の U1〜U3・U5 (画面の部品の純粋な関数。関数名は案で、#187 が分け方を変えてよい)。
import { describe, expect, it } from 'vitest';
import { emptyRecords, type Records } from '../domain/records';
import type { Problem } from '../domain/types';
import { makePool, makeProblem } from '../testing/fixtures';
import { clearSummary, kindStats, recordsNote, titleView } from './stats';

const withKind = (id: string, difficulty: 'easy' | 'hard', kind: string, company: number): Problem => makeProblem({ id, difficulty, companyId: `c${String(company).padStart(2, '0')}`, kind, tier: 1 });
const pool: Problem[] = [withKind('e1', 'easy', 'A', 1), withKind('e2', 'easy', 'B', 2), withKind('e3', 'easy', 'C', 3), withKind('e4', 'easy', 'A', 4), withKind('h1', 'hard', 'H1', 1)];
const rec = (easy: string[], hard: string[] = []): Records => ({ ...emptyRecords(), easy: { ...emptyRecords().easy, kinds: easy }, hard: { ...emptyRecords().hard, kinds: hard } });

describe('U1 種類の数え方 (n / N)', () => {
  it('N はプールの種類の重複なし。n は記録のうちその中にあるもの (v2 の種類は数えない)', () => {
    expect(kindStats(rec(['A', 'B', 'X']), pool, 'easy')).toEqual({ n: 2, N: 3 });
  });
  it('記録が空なら n = 0。むずかしいの種類はやさしいに混ざらない', () => {
    expect(kindStats(emptyRecords(), pool, 'easy')).toEqual({ n: 0, N: 3 });
    expect(kindStats(rec(['A'], ['H1', 'A']), pool, 'hard')).toEqual({ n: 1, N: 1 });
  });
  it('n は N を超えない', () => {
    const s = kindStats(rec(['A', 'B', 'C', 'X', 'Y', 'Z']), pool, 'easy');
    expect(s.n).toBeLessThanOrEqual(s.N);
  });
});

describe('U2 今回 + k', () => {
  it('新しい種類 (プールにあるもの) の数。0 なら 0。プールに無い種類は数えない', () => {
    expect(clearSummary(['A'], ['A', 'B', 'C'], pool, 'easy')).toEqual({ n: 3, N: 3, added: 2 });
    expect(clearSummary(['A', 'B'], ['A', 'B'], pool, 'easy').added).toBe(0);
    expect(clearSummary(['A'], ['A', 'X'], pool, 'easy').added).toBe(0);
  });
});

describe('U3 タイトルの難易度の状態', () => {
  const big = [...makePool({ difficulty: 'easy', companies: 10 }), ...makePool({ difficulty: 'hard', companies: 10 })];
  it('押せる難易度は enabled。記録が空なら best は null、遊んだら best', () => {
    const v = titleView(big, emptyRecords());
    expect(v.easy).toMatchObject({ enabled: true, best: null });
    expect(v.hard).toMatchObject({ enabled: true, best: null });
    expect(v.allUnavailable).toBe(false);
    const r = emptyRecords();
    r.easy = { ...r.easy, best: 5 };
    expect(titleView(big, r).easy.best).toBe(5);
  });
  it('canDraw が false の難易度は押せず「準備中」。両方 false なら allUnavailable', () => {
    const thin = [...makePool({ difficulty: 'easy', companies: 10 }), ...makePool({ difficulty: 'hard', companies: 5 })];
    const v = titleView(thin, emptyRecords());
    expect(v.hard).toMatchObject({ enabled: false, note: '準備中' });
    expect(v.easy.enabled).toBe(true);
    expect(titleView([], emptyRecords())).toMatchObject({ allUnavailable: true, easy: { enabled: false }, hard: { enabled: false } });
  });
});

describe('U5 記録を保存できるか', () => {
  it('できないときだけ注記を返す', () => {
    expect(recordsNote(true)).toBe('');
    expect(recordsNote(false)).toBe('この端末では記録を保存できません');
  });
});
