// 受け入れ条件 7・9 (S15〜S17b)。ケース表 docs/test-cases/screens-v3.md §2.5・§2.6。
import { expect, test, type Page } from '@playwright/test';
import { answerRound, correct, findSeed, fresh, REJECT_WAIT, roundsFor, start, tap } from './support';

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
  await fresh(page, SEED);
  expect(await small(page, 18), 'タイトル').toEqual([]);
  await page.getByRole('button', { name: 'やさしい' }).click();
  expect(await small(page, 18), '0 社目').toEqual([]);
  await tap(page, '1 社目へ');
  for (let i = 0; i < 8; i++) {
    expect(await small(page, 18), `${i + 1} 社目`).toEqual([]);
    await answerRound(page, rounds[i]!);
    expect(await small(page, 18), `${i + 1} 社目の答え合わせ`).toEqual([]);
    await tap(page, i === 7 ? '完了票へ' : '次へ');
  }
  expect(await small(page, 18), 'クリア').toEqual([]);
  await fresh(page, 1);
  await tap(page, '記録');
  expect(await small(page, 18), '記録').toEqual([]);
  await start(page, SEED, 'hard');
  await tap(page, '1 社目へ');
  await expect(page.getByTestId('card')).not.toContainText('もうけ');
  expect(await small(page, 16, '[data-testid="docs"]'), '資料は 16 px 以上').toEqual([]);
});

test('S16: 320・375・414・1280 px で、どの画面も横にはみ出さない (押印の動きのあとも)', async ({ page }) => {
  test.setTimeout(150_000);
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  for (const width of [320, 375, 414, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 640 : 800 });
    const check = async (label: string) => {
      await page.waitForTimeout(350);
      const w = await overflow(page);
      expect(w.doc, `${width}px ${label}`).toBeLessThanOrEqual(w.view);
    };
    await fresh(page, SEED);
    await check('タイトル');
    await page.getByRole('button', { name: 'やさしい' }).click();
    await check('0 社目');
    await tap(page, '1 社目へ');
    for (let i = 0; i < 3; i++) {
      await check(`${i + 1} 社目`);
      await answerRound(page, rounds[i]!);
      await check(`${i + 1} 社目の答え合わせ`);
      await tap(page, '次へ');
    }
    await answerRound(page, rounds[3]!, false);
    await check('差し戻し');
    await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
    await check('さっきの異変');
    await start(page, SEED, 'hard');
    await tap(page, '1 社目へ');
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
  await tap(page, '1 社目へ');
  for (let i = 0; i < 8; i++) {
    await btn('いつも通り');
    await btn('異変あり');
    const foot = await page.locator('footer').boundingBox();
    const slipFoot = await page.getByTestId('card').locator('[data-place="period"], .slip-foot').first().boundingBox();
    expect(slipFoot!.y + slipFoot!.height, `${i + 1} 社目の足元`).toBeLessThanOrEqual(foot!.y + 1 + 200); // 長ければ送れる。札は常に見える
    await answerRound(page, rounds[i]!);
    await tap(page, i === 7 ? '完了票へ' : '次へ');
  }
  await expect(page.getByTestId('cleared')).toBeVisible();
  await btn('もう一度');
  await start(page, seed, 'hard');
  await btn('1 社目へ');
});

test('S17b (320×640): やさしいの 0 社目 (最初と、間違えたあと) の足元の下端が、固定した帯の上端より上', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  // 間違えたあとの文が 3 行になるよう、説明文の長い E-25 (「…売上高がマイナスになることはありません。」) を見逃す
  const { seed, index } = findSeed('E-25');
  const rounds = roundsFor(seed, 'easy', 0);
  expect(rounds[index - 1]!.problem.anomaly!.explanation.length).toBeGreaterThanOrEqual(40);
  await start(page, seed);
  const fits = async (label: string) => {
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ foot: document.querySelector('.slip-foot')!.getBoundingClientRect().bottom, bar: document.querySelector('footer')!.getBoundingClientRect().top, lines: Math.round((document.querySelector('[data-testid="note"]')?.getBoundingClientRect().height ?? 0) / 27) }));
    expect(m.foot, `${label}: 足元 ${m.foot} / 帯 ${m.bar} (文 ${m.lines} 行ぶん)`).toBeLessThanOrEqual(m.bar);
  };
  await fits('最初の 0 社目');
  await tap(page, '1 社目へ');
  for (let i = 0; i < index - 1; i++) {
    await answerRound(page, rounds[i]!);
    await tap(page, '次へ');
    await page.getByTestId('progress').filter({ hasText: `${i + 2} 社目` }).waitFor();
  }
  await answerRound(page, rounds[index - 1]!, false);
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  expect(await page.getByTestId('note').innerText()).toContain('マイナス');
  await fits('間違えたあとの 0 社目 (文が 3 行)');
});
