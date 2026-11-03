// R1〜R8 (docs/test-cases/validator.md §2.1): 丸めと換算。
import { describe, expect, it } from 'vitest';
import { dividendAmount, roundHalfAway, scaled10, toIrUnit } from './math.ts';

describe('roundHalfAway (0.5 は絶対値の大きい側へ)', () => {
  it('R1: 5/2 = 3、−5/2 = −3', () => {
    expect(roundHalfAway(5, 2)).toBe(3);
    expect(roundHalfAway(-5, 2)).toBe(-3);
  });
  it('R2: 4/2 = 2、7/3 = 2、−7/3 = −2、1/3 = 0', () => {
    expect(roundHalfAway(4, 2)).toBe(2);
    expect(roundHalfAway(7, 3)).toBe(2);
    expect(roundHalfAway(-7, 3)).toBe(-2);
    expect(roundHalfAway(1, 3)).toBe(0);
  });
  it('R3: 0/5 = 0、1/2 = 1、−1/2 = −1', () => {
    expect(roundHalfAway(0, 5)).toBe(0);
    expect(roundHalfAway(1, 2)).toBe(1);
    expect(roundHalfAway(-1, 2)).toBe(-1);
  });
  it('R4: 0 で割ると例外', () => {
    expect(() => roundHalfAway(1, 0)).toThrow();
  });
});

describe('toIrUnit (IR の単位への換算)', () => {
  it('R5: 億円は ÷100 を小数第一位まで。百万円はそのまま', () => {
    expect(toIrUnit(12456, '億円')).toBe(124.6);
    expect(toIrUnit(12450, '億円')).toBe(124.5);
    expect(toIrUnit(-12450, '億円')).toBe(-124.5);
    expect(toIrUnit(12456, '百万円')).toBe(12456);
  });
  it('R6: 小数第二位の 5 は切り上げ', () => {
    expect(toIrUnit(12449, '億円')).toBe(124.5);
    expect(toIrUnit(12455, '億円')).toBe(124.6);
  });
});

describe('scaled10 と dividendAmount', () => {
  it('R7: 10 倍した整数にすると浮動小数の誤差に左右されない', () => {
    expect(124.6 - 30.2).not.toBe(94.4); // 素の引き算は 94.39999999999999
    expect(scaled10(124.6) - scaled10(30.2)).toBe(scaled10(94.4));
    expect(scaled10(94.4)).toBe(944);
    expect(scaled10(0.1 + 0.2)).toBe(3);
  });
  it('R8: 配当金総額は百万円未満切捨て', () => {
    expect(dividendAmount(25, 8630)).toBe(215);
    expect(dividendAmount(30, 8600)).toBe(258);
    expect(dividendAmount(0, 8600)).toBe(0);
  });
});
