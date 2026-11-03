// U1・U1b (docs/test-cases/scaffold.md): 型の正本 (types.ts) と設計書 §4.2 の写しが一字違わず同じ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const design = readFileSync(`${root}docs/design.md`, 'utf-8');

function typeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /<!-- types:start -->\n```ts\n([\s\S]*?)```\n<!-- types:end -->/g;
  for (let m = re.exec(markdown); m; m = re.exec(markdown)) blocks.push(m[1] ?? '');
  return blocks;
}

describe('設計書の型と src/domain/types.ts', () => {
  it('U1b: 設計書に型のブロックがちょうど 1 つある', () => {
    expect(typeBlocks(design)).toHaveLength(1);
  });

  it('U1: 設計書 §4.2 のコードブロックが types.ts と一字違わず同じ', () => {
    const source = readFileSync(`${root}src/domain/types.ts`, 'utf-8');
    expect(typeBlocks(design)[0]).toBe(source);
  });
});
