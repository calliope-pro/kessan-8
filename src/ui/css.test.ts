// UT2〜UT4 (docs/test-cases/flow.md §1.6): 舞台の段のコントラスト・紙面の配色・動きの抑制
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (name: string) => readFileSync(`src/styles/${name}.css`, 'utf-8');

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const rule = (text: string, selector: string) => {
  const m = text.match(new RegExp(`${selector.replace(/[[\]"]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m?.[1];
};
const token = (body: string | undefined, name: string) => body?.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

describe('舞台の配色 (V2)', () => {
  const stage = css('stage');
  const selectors = [...Array.from({ length: 8 }, (_, i) => `[data-stage="${i}"]`), '[data-stage="morning"]'];

  it('UT2: 8 段 + 朝のすべてに規則があり、文字と背景のコントラスト比が 4.5 以上', () => {
    for (const sel of selectors) {
      const body = rule(stage, sel);
      const bg = token(body, 'stage-bg');
      const fg = token(body, 'stage-fg');
      expect(bg, `${sel} の背景`).toBeDefined();
      expect(fg, `${sel} の文字`).toBeDefined();
      expect(contrast(bg!, fg!), `${sel}: ${bg} / ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('UT3: 資料の紙面の配色は段によらず 1 つの規則だけ (段の規則に紙面の色を入れない)', () => {
    expect(stage).not.toMatch(/--paper/);
    expect(css('app')).toMatch(/\.paper\s*\{[^}]*background/);
  });
});

describe('動きの抑制 (G-2)', () => {
  it('UT4: prefers-reduced-motion: reduce で、アニメーション・遷移を止める規則がある', () => {
    const motion = css('motion');
    const block = motion.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transition:\s*none/);
  });
});
