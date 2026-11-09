// E1〜E4 (docs/test-cases/scaffold.md): ビルドした成果物 (vite preview) の足場の確かめ。
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf-8'));
const vercelCsp: string = vercel.headers
  .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
  .find((h: { key: string }) => h.key === 'Content-Security-Policy').value;

test('E1: 開くと日本語のページに app が見える', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('app')).toBeVisible();
  expect(await page.title()).not.toBe('');
});

test('E2: 同じ生成元以外へ通信せず、コンソールにエラーが無い', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 375, 414]) {
  test(`E3: 幅 ${width}px で横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('app')).toBeVisible();
    // innerWidth ではなく、指定した幅と比べる (スマホの project は、はみ出すと表示幅 (innerWidth) のほうが広がって、差が 0 に見えるため)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}

test('E4: レスポンスの CSP が vercel.json と同じ', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(vercelCsp);
});
