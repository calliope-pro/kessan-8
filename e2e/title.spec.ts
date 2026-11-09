// 受け入れ条件 1 (S1〜S3)・S18・S22・S24。ケース表 docs/test-cases/screens-v3.md §2.1・§2.7。
import { expect, test } from '@playwright/test';
import { findSeed, roundsFor, start } from './support';

test('S1〜S3: 開くとタイトル。難易度のボタンを 1 回押すと 0 社目。「難易度を変える」で戻れる', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.getByRole('heading', { name: '８期連続' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'やさしい' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'むずかしい' })).toBeVisible();
  await expect(page.getByRole('button', { name: '記録' })).toBeVisible();
  await expect(page.locator('main p')).toHaveCount(1); // 掲示 1 行だけ。説明の段落が無い
  await expect(page.getByText('最高')).toHaveCount(0); // 初めて
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(page.getByTestId('progress')).toContainText('0 社目');
  await expect(page.getByTestId('boxes').locator('li')).toHaveCount(8);
  await page.getByRole('button', { name: '難易度を変える' }).click();
  await expect(page.getByRole('button', { name: 'むずかしい' })).toBeVisible();
  await page.getByRole('button', { name: 'むずかしい' }).click();
  await expect(page.getByTestId('progress')).toContainText('0 社目');
  await expect(page.locator('[data-testid="card"] ~ *, [data-testid="docs"]').first()).toBeVisible(); // むずかしいはカードの下に資料
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await expect(page.getByRole('button', { name: '難易度を変える' })).toHaveCount(0); // n 社目には無い
});

test('S18: 初めて開く → 記録。「まだ遊んでいません」。戻るでタイトル', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '記録', exact: true }).click();
  await expect(page.getByTestId('records')).toContainText('まだ遊んでいません。8 社連続で正解するとクリアです');
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.getByRole('button', { name: 'やさしい' })).toBeVisible();
});

test('S22: 出題できない難易度は押せず「準備中」。もう一方は遊べる', async ({ page }) => {
  await page.goto('/?seed=1&e2ePool=thin');
  await expect(page.getByRole('button', { name: /むずかしい/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /むずかしい/ })).toContainText('準備中');
  await expect(page.getByRole('button', { name: /やさしい/ })).toBeEnabled();
});

test('S24: 同じ種は同じ出題 (同じ会社の並び)', async ({ browser }) => {
  const names: string[][] = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await start(page, 7);
    await page.getByRole('button', { name: '1 社目へ' }).click();
    names.push([await page.getByTestId('card').getAttribute('aria-label').then((x) => x ?? '')]);
    await ctx.close();
  }
  expect(names[0]).toEqual(names[1]);
  const expected = roundsFor(7, 'easy', 0)[0]!.problem.companyId;
  expect(findSeed).toBeDefined();
  expect(names[0]![0]).toContain(expected === 'c01' ? '第1試作電機' : '試作電機');
});
