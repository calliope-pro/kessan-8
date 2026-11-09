// S19〜S21・S23。ケース表 docs/test-cases/screens-v3.md §2.7。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { answerRound, recordsOf, roundsFor, start, tap } from './support';

test('S19: 1 周遊んでから「記録」。最高の到達・クリア回数・見つけた異変 n / N。完了票と同じ数', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await start(page, SEED);
  await tap(page, '1 社目へ');
  for (let i = 0; i < 8; i++) {
    await answerRound(page, rounds[i]!);
    await tap(page, i === 7 ? '完了票へ' : '次へ');
  }
  const fromCleared = (await page.getByTestId('cleared').innerText()).match(/見つけた異変 (\d+ \/ \d+)/)![1];
  await page.goto(`/?seed=${SEED}`); // 完了票が復元される。別の難易度でタイトルへ
  await tap(page, '別の難易度');
  await tap(page, '記録');
  const rec = page.getByTestId('records');
  await expect(rec).toContainText('クリア 1 回');
  await expect(rec).toContainText('8 社目');
  await expect(rec).toContainText(`見つけた異変 ${fromCleared}`);
  await expect(rec).toContainText('？');
  expect((await recordsOf(page)).easy.best).toBe(8);
});

test('S20: 8 社通す途中でページを読み直すと、同じ画面・同じカードに戻る', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await start(page, SEED);
  await tap(page, '1 社目へ');
  for (let i = 0; i < 2; i++) {
    await answerRound(page, rounds[i]!);
    await tap(page, '次へ');
  }
  const label = await page.getByTestId('card').getAttribute('aria-label');
  await page.reload();
  await expect(page.getByTestId('progress')).toHaveText('3 社目 / あと 6 社');
  expect(await page.getByTestId('card').getAttribute('aria-label')).toBe(label);
  await page.goto(`/?seed=${SEED}`);
  await expect(page.getByTestId('progress')).toContainText('3 社目');
});

test('S21: localStorage を使えなくても遊べて、記録の画面に「保存できません」が出る', async ({ page }) => {
  const SEED = 21;
  const rounds = roundsFor(SEED, 'easy', 0);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED);
  await tap(page, '1 社目へ');
  await answerRound(page, rounds[0]!);
  await expect(page.getByTestId('verdict')).toHaveText('正解');
  expect(errors).toEqual([]);
  await tap(page, '次へ');
  await expect(page.getByTestId('progress')).toContainText('2 社目');
});

test('S21b: 保存できないとき、記録の画面に 1 行の注記', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await page.goto('/?seed=1');
  await tap(page, '記録');
  await expect(page.getByTestId('records')).toContainText('この端末では記録を保存できません');
});

test('S23: 通信は同じ origin だけ。console にエラーが無い (CSP の違反を含む)・style 属性を使わない', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 21);
  await tap(page, '1 社目へ');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.locator('[style]').count()).toBe(0);
  const csp = JSON.parse(readFileSync('vercel.json', 'utf-8')).headers.flatMap((h: { headers: { key: string; value: string }[] }) => h.headers).find((h: { key: string }) => h.key === 'Content-Security-Policy').value as string;
  expect(csp).toContain("style-src 'self'");
});
