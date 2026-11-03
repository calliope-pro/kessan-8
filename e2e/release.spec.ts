// E39・E40 (docs/test-cases/release.md §1): 画面の断り書き。試験用の問題に差し替えたビルドで回す (断り書きは問題に依らない)。
import { expect, test } from '@playwright/test';

for (const width of [320, 375, 1280]) {
  test(`E39: 幅 ${width}px で、タイトルに「架空」の断りと「助言ではありません」が見える`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const note = page.getByText('すべて架空です');
    await expect(note).toBeVisible();
    await expect(page.getByText('投資判断の助言ではありません')).toBeVisible();
    const size = await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('E40: 遊びかたの画面にも「架空」の断りがある', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '遊びかた' }).click();
  await expect(page.getByText('すべて架空です')).toBeVisible();
});
