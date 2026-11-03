// U2〜U8 (docs/test-cases/scaffold.md): 足場の約束。設定ファイルを外から読んで確かめる。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name: string) => readFileSync(`${root}${name}`, 'utf-8');
const json = (name: string) => JSON.parse(read(name));

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
const vercel = json('vercel.json');
const headerValue = (key: string): string | undefined =>
  (vercel.headers as HeaderRule[]).flatMap((h) => h.headers).find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe('vercel.json', () => {
  it('U2: 出力は dist、ビルドは npm run build', () => {
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.buildCommand).toBe('npm run build');
  });

  it('U2b: 静的 (サーバ機能のキーを持たない)', () => {
    for (const key of ['functions', 'rewrites', 'redirects', 'routes']) expect(vercel).not.toHaveProperty(key);
  });

  it('U2c: CSP は同じ生成元だけ。nosniff がある', () => {
    const csp = headerValue('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/https?:/);
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('LICENSE', () => {
  it('U3: MIT', () => {
    const text = read('LICENSE');
    expect(text.split('\n')[0]).toBe('MIT License');
    expect(text).toContain('Permission is hereby granted, free of charge');
    expect(text).toMatch(/^Copyright \(c\) 2026 \S+/m);
  });
});

describe('package.json', () => {
  const pkg = json('package.json');

  it('U4: 非公開・実行時の依存なし・開発用の依存は設計 §2.1 の 5 件だけ・Node の版', () => {
    expect(pkg.private).toBe(true);
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(['@playwright/test', '@types/node', 'typescript', 'vite', 'vitest']);
    expect(pkg.engines.node).toBe('>=22.12');
    expect(pkg.devDependencies['@types/node']).toMatch(/^\^22\./); // CI の Node 22 に型を合わせる
  });

  it('U4b: 決まった名前のスクリプトがある', () => {
    for (const name of ['dev', 'build', 'preview', 'typecheck', 'test', 'test:e2e', 'check:size']) {
      expect(pkg.scripts, name).toHaveProperty(name);
    }
  });

  it('U4c: package-lock.json がある', () => {
    expect(existsSync(`${root}package-lock.json`)).toBe(true);
  });
});

describe('秘密を置かない', () => {
  it('U5: .gitignore が node_modules・dist・.env を除く', () => {
    const lines = read('.gitignore').split('\n').map((l) => l.trim());
    for (const line of ['node_modules/', 'dist/', '.env', '.env.*']) expect(lines, line).toContain(line);
  });

  it('U5b: コミットされたファイルに、どの階層にも .env で始まる名前が無い', () => {
    const r = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const names = r.stdout.split('\n').filter(Boolean).map((f) => f.split('/').pop() ?? '');
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => n.startsWith('.env'))).toEqual([]);
  });
});

describe('入口と設定', () => {
  it('U6: index.html は日本語・viewport つきで、外部の参照を持たない', () => {
    const html = read('index.html');
    expect(html).toMatch(/<html[^>]*\slang="ja"/);
    expect(html).toMatch(/<meta[^>]*name="viewport"/);
    expect(html).not.toMatch(/(?:src|href)="https?:/);
  });

  it('U7: tsconfig は strict', () => {
    expect(read('tsconfig.json')).toMatch(/"strict":\s*true/);
  });

  it('U10: npm test は e2e/ のファイルを回さない (Playwright の test() を Vitest が読まない)', () => {
    expect(viteConfig.test?.exclude).toContain('e2e/**');
  });

  it('U8: プレビューのヘッダは vercel.json と同じ (出所は 1 か所)', () => {
    const expected = Object.fromEntries((vercel.headers as HeaderRule[]).flatMap((h) => h.headers).map((h) => [h.key, h.value]));
    expect(viteConfig.preview?.headers).toEqual(expected);
  });
});
