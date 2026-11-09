// 受け入れ条件 3・4 の不正解 (S10a〜S10c)。ケース表 docs/test-cases/screens-v3.md §2.3。
import { expect, test } from '@playwright/test';
import { answerRound, correct, findSeed, recordsOf, REJECT_WAIT, roundsFor, start } from './support';

test('S10a: 異変のある枠に「いつも通り」(見逃し)。差し戻しの間に場所が朱で強調され、0 社目に「さっきの異変」が残る', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  const miss = rounds.findIndex((r) => correct(r)); // 最初の異変の枠
  expect(miss).toBeGreaterThanOrEqual(0);
  await start(page, SEED);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < miss; i++) {
    await answerRound(page, rounds[i]!);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
  }
  await answerRound(page, rounds[miss]!, false); // 異変のある枠に「いつも通り」
  await expect(page.getByTestId('verdict')).toHaveText('不正解');
  await expect(page.getByTestId('card')).toHaveClass(/rejected/);
  expect(await page.locator('.marked').count()).toBeGreaterThan(0); // 差し戻しの間に場所が強調される
  await expect(page.getByTestId('note')).toHaveCount(0); // 内容の文はここでは出さない
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await expect(page.getByTestId('note')).toContainText(`さっきの異変: ${rounds[miss]!.problem.anomaly!.explanation}`);
  await expect(page.getByTestId('card')).toHaveCount(1); // さっきのカードは出ない (見本だけ)
  await page.getByRole('button', { name: '1 社目へ' }).click(); // 1 タップで再開
  await expect(page.getByTestId('progress')).toContainText('1 社目');
  const rec = await recordsOf(page);
  const next = roundsFor(SEED, 'easy', 1, { ...rec, easy: { ...rec.easy } });
  expect(next).toHaveLength(8); // 出題は新しくなる (draws が進んだ)
});

test('S10b: 異変の無い枠に「異変あり」(誤警報)。強調なし・「さっきは異変がありませんでした」', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  const miss = rounds.findIndex((r) => !correct(r));
  await start(page, SEED);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < miss; i++) {
    await answerRound(page, rounds[i]!);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
  }
  await answerRound(page, rounds[miss]!, false);
  await expect(page.getByTestId('verdict')).toHaveText('不正解');
  await expect(page.locator('.marked')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await expect(page.getByTestId('note')).toContainText('さっきは異変がありませんでした');
});

test('S10c: 3 社目で間違えて 0 社目へ戻る → 「最高 3 社目」(到達した社)。初めて 1 社目で間違えたら「最高 1 社目」', async ({ page }) => {
  const { seed } = findSeed('E-19');
  const rounds = roundsFor(seed, 'easy', 0);
  await start(page, seed);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 2; i++) {
    await answerRound(page, rounds[i]!);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
  }
  await answerRound(page, rounds[2]!, false);
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await expect(page.getByText('最高 3 社目')).toBeVisible();
  // 初めての人が 1 社目でいきなり間違える
  const ctx = await page.context().browser()!.newContext();
  const p2 = await ctx.newPage();
  await start(p2, seed);
  await p2.getByRole('button', { name: '1 社目へ' }).click();
  await answerRound(p2, rounds[0]!, false);
  await expect(p2.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await expect(p2.getByText('最高 1 社目')).toBeVisible();
  await ctx.close();
});
