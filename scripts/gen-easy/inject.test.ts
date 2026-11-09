// U1〜U8 (docs/test-cases/problems-easy-v3.md §4): やさしいの異変を入れる道具 (scripts/gen-easy/inject.ts) の純関数の境界値。
import { describe, expect, it } from 'vitest';
import { digitsOf, explanationFor, flipOperatingText, glyphIndex, salesBelowOperating, scaleMargin, scaleOperating, shiftYearEnd } from './inject.ts';

describe('shiftYearEnd (U1: 年をずらして、ずらした年のその月の末日にする)', () => {
  it.each([
    ['2024-02-29', 1, '2025-02-28'],
    ['2023-02-28', 1, '2024-02-29'],
    ['2025-03-31', -1, '2024-03-31'],
    ['2025-03-31', 1, '2026-03-31'],
    ['2025-09-30', -1, '2024-09-30'],
  ])('%s を %i 年 → %s', (iso, years, want) => {
    expect(shiftYearEnd(iso, years)).toBe(want);
  });
});

describe('glyphIndex (U2: 表示の数字の添字。カンマは飛ばして数字だけを数える)', () => {
  it('first・last・middle', () => {
    expect(glyphIndex('4,920', 'first')).toBe(0);
    expect(glyphIndex('4,920', 'last')).toBe(4);
    expect(glyphIndex('4,920', 'middle')).toBe(3);
    expect(glyphIndex('96,930', 'middle')).toBe(3);
  });
  it('数字の無い文字列は RangeError', () => {
    expect(() => glyphIndex('△', 'first')).toThrow(RangeError);
    expect(() => glyphIndex('', 'last')).toThrow(RangeError);
  });
});

describe('flipOperatingText (U3: 営業利益を述べる文だけ向きの語を逆にする)', () => {
  it('c01 の口調 (上回った/下回った): 売上高の文は変えない', () => {
    expect(flipOperatingText('売上高は前期を上回った。営業利益は前期を上回った。', 'down', 'c01')).toBe('売上高は前期を上回った。営業利益は前期を下回った。');
  });
  it('c03 の口調 (増/減)', () => {
    expect(flipOperatingText('売上高 前期比増。営業利益 前期比増。', 'down', 'c03')).toBe('売上高 前期比増。営業利益 前期比減。');
  });
  it('c02 (上回りました/下回りました)・c04 (伸びた/縮んだ)・c06 (増加/減少): 下 → 上', () => {
    expect(flipOperatingText('売上高は前期を上回りました。営業利益は前期を下回りました。', 'up', 'c02')).toBe('売上高は前期を上回りました。営業利益は前期を上回りました。');
    expect(flipOperatingText('売上高は前期より伸びた。営業利益は前期より縮んだ。', 'up', 'c04')).toBe('売上高は前期より伸びた。営業利益は前期より伸びた。');
    expect(flipOperatingText('売上高は前期比増加。営業利益は前期比減少。', 'up', 'c06')).toBe('売上高は前期比増加。営業利益は前期比増加。');
  });
});

describe('salesBelowOperating (U4: 営業利益 × ratio を 10 の倍数に)', () => {
  it('例と不変条件', () => {
    expect(salesBelowOperating(4920, 0.6)).toBe(2950);
    expect(salesBelowOperating(1184, 0.5)).toBe(590);
    for (const op of [787, 1184, 4920, 66110]) for (const ratio of [0.5, 0.6]) {
      const v = salesBelowOperating(op, ratio);
      expect(v * 10).toBeLessThanOrEqual(op * 8);
      expect(v).toBeGreaterThan(0);
      expect(v % 10).toBe(0);
    }
  });
});

describe('scaleMargin (U5: 営業利益率を 2.2 倍か 0.4 倍に、小数第 1 位)', () => {
  it('例', () => {
    expect(scaleMargin(5.1, 2.2)).toBe(11.2);
    expect(scaleMargin(1.4, 0.4)).toBe(0.6);
  });
  it('margin 0.8〜20 の 0.1 刻みの総当たりで、正しい値の 2 倍以上か 1/2 以下・元と違う', () => {
    for (let i = 8; i <= 200; i++) {
      const m = i / 10;
      for (const f of [2.2, 0.4]) {
        const v = scaleMargin(m, f);
        expect(v, `${m} × ${f}`).not.toBe(m);
        expect(v >= 2 * m || v <= m / 2, `${m} × ${f} = ${v}`).toBe(true);
      }
    }
  });
});

describe('scaleOperating (U6)', () => {
  it('up は 10 倍・down は 1/10', () => {
    expect(scaleOperating(4920, 'up')).toBe(49200);
    expect(scaleOperating(4920, 'down')).toBe(492);
  });
});

describe('digitsOf (U7: 表示の整数部の桁数)', () => {
  it.each([['96,930', 5], ['4,920', 4], ['492', 3], ['8,080', 4], ['11.2', 2]])('%s → %i', (text, n) => {
    expect(digitsOf(text as string)).toBe(n);
  });
});

describe('explanationFor (U8)', () => {
  it('台帳に無い種類 ID は RangeError', () => {
    expect(() => explanationFor('E-99', {} as never)).toThrow(RangeError);
  });
});
