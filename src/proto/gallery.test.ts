// ケース表 docs/proto/test-cases.md の G (見え方の確認用ページの中身)。
import { describe, expect, it } from 'vitest';
import { deriveCards, locate } from './cards';
import { galleryEntries } from './gallery';
import { companyOf, NORMALS } from './testing';

const base = NORMALS.find((p) => p.id === 'easy-017')!;
const entries = galleryEntries(base);
const normal = deriveCards(base, companyOf(base), 'easy');

describe('G1 全部の見え方を並べる', () => {
  it('E-21・E-22・E-24〜E-28 の変種', () => {
    expect(entries.map((e) => e.variant)).toEqual([
      'E-21 no-comma', 'E-21 comma-shift', 'E-21 no-comma 営業利益 (前期)', 'E-21 no-comma 営業利益 (当期)', 'E-22 数字の欄', 'E-22 見出し語', 'E-24', 'E-25',
      'E-26 当期の欄を前期に', 'E-26 前期の欄を当期に', 'E-27 売上高', 'E-27 営業利益 (前期)', 'E-27 営業利益 (当期)', 'E-28',
    ]);
  });
});

describe('G2 各見え方は正常と違い、場所と説明がある', () => {
  for (const e of entries) {
    it(e.variant, () => {
      const c = deriveCards(e.problem, companyOf(e.problem), 'easy', e.edits);
      expect(c).not.toEqual(normal);
      expect(locate(c, e.places).length).toBeGreaterThan(0);
      expect(e.explanation.length).toBeGreaterThan(8);
      expect(e.problem.companyId).toBe(base.companyId);
    });
  }
});

describe('G3 E-22 の数字の重複は数字 5 つ', () => {
  it('カードの数字の欄が 5', () => {
    const e = entries.find((x) => x.variant === 'E-22 数字の欄')!;
    expect(deriveCards(e.problem, companyOf(e.problem), 'easy', e.edits).slots).toHaveLength(5);
  });
});
