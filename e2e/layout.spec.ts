// 受け入れ条件 7・9 (S15〜S17b)。ケース表 docs/test-cases/screens-v3.md §2.5・§2.6。
import { expect, test, type Page } from '@playwright/test';
import { answerRound, correct, findSeed, REJECT_WAIT, roundsFor, start } from './support';

const overflow = (page: Page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth }));
/** 文字を持つ要素の computed font-size が min 未満のもの (読み上げ専用 .sr は除く)。 */
const small = (page: Page, min: number, scope = 'body') =>
  page.evaluate(([m, sel]) => {
    const out: string[] = [];
    const root = document.querySelector(sel as string)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest('.sr')) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < (m as number)) out.push(`${size}px ${t}`);
    }
    return out;
  }, [min, scope] as const);

test('S15: やさしいの全画面で、文字は 18 px 以上。言い換えはやさしいのカードにだけ', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await page.goto(`/?seed=${SEED}`);
  expect(await small(page, 18), 'タイトル').toEqual([]);
  await page.getByRole('button', { name: 'やさしい' }).click();
  expect(await small(page, 18), '0 社目').toEqual([]);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    expect(await small(page, 18), `${i + 1} 社目`).toEqual([]);
    await answerRound(page, rounds[i]!);
    expect(await small(page, 18), `${i + 1} 社目の答え合わせ`).toEqual([]);
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ', exact: true }).click();
  }
  expect(await small(page, 18), 'クリア').toEqual([]);
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '記録', exact: true }).click();
  expect(await small(page, 18), '記録').toEqual([]);
  await start(page, SEED, 'hard');
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await expect(page.getByTestId('card')).not.toContainText('もうけ');
  expect(await small(page, 16, '[data-testid="docs"]'), '資料は 16 px 以上').toEqual([]);
});

test('S16: 320・375・414・1280 px で、どの画面も横にはみ出さない (押印の動きのあとも)', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  for (const width of [320, 375, 414, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 640 : 800 });
    const check = async (label: string) => {
      await page.waitForTimeout(350);
      const w = await overflow(page);
      expect(w.doc, `${width}px ${label}`).toBeLessThanOrEqual(w.view);
    };
    await page.goto(`/?seed=${SEED}`);
    await check('タイトル');
    await page.getByRole('button', { name: 'やさしい' }).click();
    await check('0 社目');
    await page.getByRole('button', { name: '1 社目へ' }).click();
    for (let i = 0; i < 3; i++) {
      await check(`${i + 1} 社目`);
      await answerRound(page, rounds[i]!);
      await check(`${i + 1} 社目の答え合わせ`);
      await page.getByRole('button', { name: '次へ', exact: true }).click();
    }
    await answerRound(page, rounds[3]!, false);
    await check('差し戻し');
    await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
    await check('さっきの異変');
    await page.getByRole('button', { name: '記録' }).click().catch(() => undefined);
    await start(page, SEED, 'hard');
    await page.getByRole('button', { name: '1 社目へ' }).click();
    await check('むずかしい');
  }
});

test('S17 (375): やさしいを通し、間違い、クリアまで。札・ボタンは画面内で 44 px 以上。足元は札の帯に隠れない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { seed } = findSeed('E-19');
  const rounds = roundsFor(seed, 'easy', 0);
  await start(page, seed);
  const btn = async (name: string) => {
    const b = page.getByRole('button', { name, exact: true });
    await expect(b).toBeInViewport();
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  };
  await btn('1 社目へ');
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    await btn('いつも通り');
    await btn('異変あり');
    const foot = await page.locator('footer').boundingBox();
    const slipFoot = await page.getByTestId('card').locator('[data-place="period"], .slip-foot').first().boundingBox();
    expect(slipFoot!.y + slipFoot!.height, `${i + 1} 社目の足元`).toBeLessThanOrEqual(foot!.y + 1 + 200); // 長ければ送れる。札は常に見える
    await answerRound(page, rounds[i]!);
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ', exact: true }).click();
  }
  await expect(page.getByTestId('cleared')).toBeVisible();
  await btn('もう一度');
  await start(page, seed, 'hard');
  await btn('1 社目へ');
});

test('S17b (320×640): やさしいの 0 社目 (最初と、間違えたあと) の足元の下端が、固定した帯の上端より上', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await start(page, SEED);
  const fits = async (label: string) => {
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ foot: document.querySelector('.slip-foot')!.getBoundingClientRect().bottom, bar: document.querySelector('footer')!.getBoundingClientRect().top }));
    expect(m.foot, `${label}: 足元 ${m.foot} / 帯 ${m.bar}`).toBeLessThanOrEqual(m.bar);
  };
  await fits('最初の 0 社目');
  await page.getByRole('button', { name: '1 社目へ' }).click();
  const miss = rounds.findIndex((r) => correct(r));
  for (let i = 0; i < miss; i++) {
    await answerRound(page, rounds[i]!);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
  }
  await answerRound(page, rounds[miss]!, false);
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await fits('間違えたあとの 0 社目');
});
