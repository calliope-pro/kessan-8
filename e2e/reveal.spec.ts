// 受け入れ条件 4 (S12〜S14)。ケース表 docs/test-cases/screens-v3.md §2.4。
import { expect, test } from '@playwright/test';
import { answerRound, correct, findSeed, playTo, roundsFor, start, tap } from './support';

/** kind が出る種で、その社 (index) まで進めて答える (正しく)。 */
async function reachKind(page: import('@playwright/test').Page, kind: string) {
  const { seed, index } = findSeed(kind);
  const rounds = roundsFor(seed, 'easy', 0);
  await start(page, seed);
  await playTo(page, rounds, index);
  return { rounds, index, round: rounds[index - 1]! };
}

test('S12・S13: 押印の字は押した札と同じ言葉。異変は朱で囲み内容を出す。正常は「異変はありませんでした」', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await start(page, SEED);
  await tap(page, '1 社目へ');
  let sawAnomaly = false, sawNormal = false;
  for (let i = 0; i < 8; i++) {
    const r = rounds[i]!;
    await answerRound(page, r);
    await expect(page.getByTestId('stamp')).toHaveText(correct(r) ? '異変あり' : 'いつも通り');
    if (correct(r)) {
      sawAnomaly = true;
      expect(await page.locator('.marked').count()).toBeGreaterThan(0);
      await expect(page.getByTestId('note')).toContainText(r.problem.anomaly!.explanation);
      const limit = (await page.locator('footer').boundingBox())!.y;
      for (const m of await page.locator('.marked').all()) expect((await m.boundingBox())!.y + (await m.boundingBox())!.height).toBeLessThanOrEqual(limit + 1); // 札の帯に隠れない
    } else {
      sawNormal = true;
      await expect(page.locator('.marked')).toHaveCount(0);
      await expect(page.getByText('異変はありませんでした')).toBeVisible();
    }
    await tap(page, i === 7 ? '完了票へ' : '次へ');
  }
  expect(sawAnomaly && sawNormal).toBe(true);
});

test('S14 E-19: 欄が無く、答えたあと「ここに○○の欄があるはずです」が欠けた位置に出る', async ({ page }) => {
  const { round } = await reachKind(page, 'E-19');
  await expect(page.getByTestId('card').locator('[data-slot="margin"]')).toHaveCount(0);
  await answerRound(page, round);
  await expect(page.getByTestId('card')).toContainText('ここに「売上高営業利益率」の欄があるはずです');
});

test('S14 E-21・E-25・E-27: 桁マスの見え方 (カンマが無い・△・X)', async ({ page }) => {
  for (const [kind, slot, check] of [
    ['E-21', 'sales', (t: string) => !t.includes(',') && /^\d+$/.test(t)],
    ['E-25', 'sales', (t: string) => t.startsWith('△')],
    ['E-27', 'opCurr', (t: string) => t.includes('X')],
  ] as const) {
    await reachKind(page, kind);
    const t = await page.getByTestId('card').locator(`[data-slot="${slot}"] .field`).first().evaluate((f) => [...f.children].map((c) => c.textContent ?? '').join(''));
    expect(check(t), `${kind}: ${t}`).toBe(true);
  }
});

test('S14 E-22・E-26: 欄が 2 回 (数字 5 つ)・「営業利益 (前期)」が 2 つ', async ({ page }) => {
  await reachKind(page, 'E-22');
  await expect(page.getByTestId('card').locator('[data-slot]')).toHaveCount(5);
  await reachKind(page, 'E-26');
  await expect(page.getByTestId('card').getByText('営業利益 (前期)')).toHaveCount(2);
});

test('S14 E-28・E-04: 期末が 32 日・表題の期と足元が合わない (答えたあと両方が朱で囲まれる)', async ({ page }) => {
  const a = await reachKind(page, 'E-28');
  await expect(page.getByTestId('card')).toContainText('32日');
  expect(a.round.problem.anomaly!.kind).toBe('E-28');
  const b = await reachKind(page, 'E-04');
  await answerRound(page, b.round);
  const marked = await page.locator('.marked').allInnerTexts();
  expect(marked.some((t) => t.includes('2027年3月期')) && marked.some((t) => t.includes('期末'))).toBe(true);
});
