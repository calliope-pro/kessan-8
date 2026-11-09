// 公開できる形 (docs/proto/playtest-guide.md §2): dist-proto がそのまま 1 つの静的サイトになっている。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const dist = join(import.meta.dirname, '../dist-proto');

test('dist-proto は index.html・proto.html・assets・vercel.json (ヘッダだけ) を持ち、むずかしいの問題を束に入れない', () => {
  for (const f of ['index.html', 'proto.html', 'vercel.json']) expect(existsSync(join(dist, f)), f).toBe(true);
  expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(readFileSync(join(dist, 'proto.html'), 'utf8'));
  const cfg = JSON.parse(readFileSync(join(dist, 'vercel.json'), 'utf8'));
  expect(Object.keys(cfg).sort()).toEqual(['$schema', 'headers']); // ビルド・出力先の指定を持たない
  const root = JSON.parse(readFileSync(join(import.meta.dirname, '../vercel.json'), 'utf8'));
  expect(cfg.headers).toEqual(root.headers); // 本体の公開と同じヘッダ (出所は 1 か所)
  const html = readFileSync(join(dist, 'proto.html'), 'utf8');
  expect(html).toContain('name="robots" content="noindex"');
  const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('');
  expect(js).toContain('easy-001');
  expect(js).not.toContain('hard-001'); // やさしいの問題だけ
});

test('根と /proto.html の両方が開け、CSP などのヘッダが付き、外部の資源を読まない', async ({ page, request }) => {
  for (const path of ['/', '/proto.html']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const h = res.headers();
    expect(h['content-security-policy'], path).toContain("default-src 'self'");
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['referrer-policy'], path).toBe('no-referrer');
  }
  const bad: string[] = [];
  page.on('console', (m) => m.type() === 'error' && bad.push(m.text())); // CSP 違反は console の error に出る
  await page.goto('/?seed=21');
  await expect(page.locator('.checks .now')).toContainText('0 社目');
  expect(bad).toEqual([]);
});
