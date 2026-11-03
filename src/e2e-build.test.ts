// UB1 (docs/test-cases/release.md §1): 試験用の問題に差し替えた E2E 用のビルドは dist-e2e に出し、本番の dist と混ざらない (#30 の包括レビュー N4)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('E2E 用のビルドの出力先', () => {
  it('UB1: build:e2e は dist-e2e に出し、E2E の preview も dist-e2e を見る。.gitignore に dist-e2e/ がある', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['build:e2e']).toContain('--outDir dist-e2e');
    expect(pkg.scripts.build).not.toContain('E2E_POOL');
    const config = readFileSync('playwright.config.ts', 'utf-8');
    expect(config).toMatch(/build:e2e && npm run preview -- --outDir dist-e2e/);
    expect(readFileSync('.gitignore', 'utf-8')).toContain('dist-e2e/');
  });
});
