// U9〜U9e (docs/test-cases/scaffold.md): 予算確認スクリプトを一時ディレクトリで確かめる。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./check-dist-size.mjs', import.meta.url));
const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(`${tmpdir()}/dist-size-`);
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const run = (...args: string[]) => {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf-8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const totalOf = (out: string) => Number(/合計 (\d+) B/.exec(out)?.[1]);

describe('scripts/check-dist-size.mjs', () => {
  it('U9: 小さい dist は成功し、合計のバイト数を出す', () => {
    const d = tempDir();
    writeFileSync(`${d}/index.html`, '<p>hello</p>');
    const r = run(d);
    expect(r.code).toBe(0);
    expect(totalOf(r.out)).toBeGreaterThan(0);
  });

  it('U9b: gzip 後に予算を超える dist は失敗し、超過が分かる', () => {
    const d = tempDir();
    writeFileSync(`${d}/big.bin`, randomBytes(1_200_000));
    const r = run(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('超過');
  });

  it('U9c: 合計ちょうどの予算は失敗 (未満)、合計 + 1 は成功', () => {
    const d = tempDir();
    writeFileSync(`${d}/index.html`, '<p>hello</p>');
    const total = totalOf(run(d).out);
    expect(run(d, '--budget', String(total)).code).toBe(1);
    expect(run(d, '--budget', String(total + 1)).code).toBe(0);
  });

  it('U9d: 存在しないディレクトリは失敗し、読めないことが分かる', () => {
    const r = run(`${tmpdir()}/dist-size-none-${Date.now()}`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('読めません');
  });

  it('U9e: サブディレクトリを含み、gzip 後の長さで数える', () => {
    const d = tempDir();
    mkdirSync(`${d}/assets`);
    writeFileSync(`${d}/assets/zeros.txt`, Buffer.alloc(2_000_000)); // gzip 前は 2 MB、後は約 2 KB
    const r = run(d);
    expect(r.code).toBe(0);
    expect(totalOf(r.out)).toBeLessThan(10_000);
    const flat = tempDir();
    writeFileSync(`${flat}/zeros.txt`, Buffer.alloc(2_000_000));
    expect(totalOf(run(flat).out)).toBe(totalOf(r.out));
  });
});
