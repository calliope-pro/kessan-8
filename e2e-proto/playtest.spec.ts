// 確かめの画面 (?mode=test。plans.md §8.1): 1 人 8 枚を最後まで通し、記録が出る。
import { expect, test } from '@playwright/test';
import { buildDeck } from '../src/proto/playtest';
import { answer, NORMALS } from './support';

for (const sample of ['on', 'off'] as const) {
  test(`確かめ (0 社目 ${sample}): 8 枚を通すと記録が出る`, async ({ page }) => {
    const seed = 5;
    const deck = buildDeck(seed, 'E1', NORMALS);
    await page.goto(`/proto.html?mode=test&shape=E1&seed=${seed}&sample=${sample}&pid=T1`);
    await page.getByRole('button', { name: sample === 'on' ? '見本を見る' : '1 枚目へ' }).click();
    if (sample === 'on') {
      await expect(page.locator('.slip .example-stamp')).toHaveCount(1);
      await page.getByRole('button', { name: '1 枚目へ' }).click();
    } else await expect(page.locator('.example-stamp')).toHaveCount(0);
    // 異変を全部見つけ、正常は 1 枚だけ異変と答える → 見つけ 4・誤り 1 = 合格
    let falseAlarmUsed = false;
    for (let i = 0; i < 8; i++) {
      const hasAnomaly = deck[i]!.anomaly !== null;
      const says = hasAnomaly || (!falseAlarmUsed && (falseAlarmUsed = true));
      await answer(page, says);
      await page.getByRole('button', { name: i === 7 ? '記録を見る' : '次へ' }).click();
    }
    const text = await page.getByLabel('確かめの記録').inputValue();
    expect(text).toContain('参加者: T1');
    expect(text).toContain(`0社目=${sample === 'on' ? 'あり' : 'なし'}`);
    expect(text).toContain('異変 4/4 を見つけた / 正常 1/4 を異変と答えた → 合格');
  });
}

test('確かめでは、間違えても 0 社目に戻らず、8 枚を最後まで見せる', async ({ page }) => {
  const deck = buildDeck(7, 'E3', NORMALS);
  await page.goto('/proto.html?mode=test&shape=E3&seed=7&sample=off');
  await page.getByRole('button', { name: '1 枚目へ' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.locator('.checks .now')).toContainText(`${i + 1} 枚目`);
    await answer(page, deck[i]!.anomaly === null); // 全部わざと間違える
    await expect(page.locator('.verdict.ng')).toHaveText('不正解');
    await page.getByRole('button', { name: i === 7 ? '記録を見る' : '次へ' }).click();
  }
  const text = await page.getByLabel('確かめの記録').inputValue();
  expect(text).toContain('→ 不合格');
});
