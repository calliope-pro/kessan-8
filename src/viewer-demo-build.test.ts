// docs/test-cases/viewer.md §6.1 (G1・G2): E2E 用のページ (viewer-demo.html) は、VIEWER_DEMO=1 のビルドだけに入り、公開の dist には載らない。
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';

const dirs: string[] = [];
afterEach(() => {
  delete process.env.VIEWER_DEMO;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function buildTo(env?: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), 'kessan-dist-'));
  dirs.push(outDir);
  if (env) process.env.VIEWER_DEMO = env;
  await build({ configFile: 'vite.config.ts', logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  return outDir;
}

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

describe('E2E 用ページのビルド', () => {
  it('G1: VIEWER_DEMO なしの dist に viewer-demo.html もデモのコード・基準問題も無い', async () => {
    const out = await buildTo();
    const files = walk(out);
    expect(files.some((f) => f.endsWith('viewer-demo.html'))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, 'utf-8');
      expect(text, f).not.toContain('第七試作電機株式会社');
      expect(text, f).not.toContain('__viewerDemo');
    }
  }, 60_000);

  it('G2: VIEWER_DEMO=1 のビルドには viewer-demo.html がある', async () => {
    const out = await buildTo('1');
    expect(walk(out).some((f) => f.endsWith('viewer-demo.html'))).toBe(true);
  }, 60_000);
});
