// UP3 (docs/test-cases/flow.md §2.2): 本番の取り込みは、見本を検証器 (npm run verify:data) と同じ置き場 src/data/samples/*.json から読む
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/data/pool-source.ts', 'utf-8');

describe('本番の問題・見本の取り込み', () => {
  it('UP3: 見本は samples/*.json から読み、置き場が 2 つに割れない', () => {
    expect(source).toContain("import.meta.glob<Sample>('./samples/*.json'");
    expect(source).not.toContain('./sample.json');
    expect(source).toContain("import.meta.glob<Problem>('./problems/**/*.json'");
  });

  it('UP3: 検証器 (scripts/verify-data.ts) も同じ samples/ を読む', () => {
    expect(readFileSync('scripts/verify-data.ts', 'utf-8')).toContain("join(dir, 'samples')");
  });
});
