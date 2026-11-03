// EP1〜EP8 (docs/test-cases/release.md §2): 本番のビルド (試験用の問題に差し替えない。出力は dist-prod) に対して、本物の問題データで確かめる。
// 正解は表示中の data-problem-id から src/data/problems/<難易度>/<id>.json を fs で読んで知る (docs/design.md §7)。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Problem } from '../src/domain/types';
import { app, judgeWith, nextCompany, noHorizontalOverflow, problemId, startGame } from './support';

const SEED = 3;
const load = (id: string): Problem => JSON.parse(readFileSync(`src/data/problems/${id.split('-')[0]}/${id}.json`, 'utf-8')) as Problem;
const label = (p: Problem, correct: boolean) => ((p.anomaly !== null) === correct ? '異変あり' : '異変なし');
async function answerNow(page: Parameters<typeof judgeWith>[0], correct: boolean): Promise<Problem> {
  const p = load(await problemId(page));
  await judgeWith(page, label(p, correct));
  return p;
}

test('EP1: やさしい: 本物の問題 (JSON が実在する) で資料の閲覧に入る', async ({ page }) => {
  await startGame(page, SEED, 'easy');
  await expect(app(page)).toHaveAttribute('data-difficulty', 'easy');
  await expect(app(page)).toHaveAttribute('data-round', '1');
  const id = await problemId(page);
  expect(id).toMatch(/^easy-/);
  expect(existsSync(`src/data/problems/easy/${id}.json`)).toBe(true);
});

test('EP2: むずかしいでも同じ', async ({ page }) => {
  await startGame(page, SEED, 'hard');
  const id = await problemId(page);
  expect(id).toMatch(/^hard-/);
  expect(existsSync(`src/data/problems/hard/${id}.json`)).toBe(true);
});

test('EP3: 正解の答え → 正解 → 次の会社 (別の問題)', async ({ page }) => {
  await startGame(page, SEED);
  const first = await problemId(page);
  await answerNow(page, true);
  await expect(page.getByTestId('result')).toContainText('正解');
  await nextCompany(page);
  await expect(app(page)).toHaveAttribute('data-round', '2');
  expect(await problemId(page)).not.toBe(first);
});

test('EP4: 不正解 → 最初に戻る → もう一度で 1 社目', async ({ page }) => {
  await startGame(page, SEED);
  await answerNow(page, false);
  await expect(page.getByTestId('result')).toContainText('不正解');
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
});

for (const difficulty of ['easy', 'hard'] as const) {
  test(`EP5: ${difficulty}: 異変のある問題の答え合わせで、場所が強調され説明が見える`, async ({ page }) => {
    await startGame(page, SEED, difficulty);
    let p = load(await problemId(page));
    for (let i = 0; i < 7 && p.anomaly === null; i++) {
      await answerNow(page, true);
      await nextCompany(page);
      p = load(await problemId(page));
    }
    test.skip(p.anomaly === null, 'この種の 8 問に異変のある問題が無い (まれ)');
    await answerNow(page, true);
    await expect(page.getByTestId('result')).toContainText('正解');
    expect(await page.locator('[data-highlight="true"]').count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('explanation')).toHaveText(p.anomaly!.explanation);
    await expect(page.getByTestId('kind')).toBeVisible();
  });
}

for (const width of [320, 375, 414]) {
  test(`EP6: 幅 ${width}px で、本物の問題の画面が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/?seed=${SEED}`);
    await noHorizontalOverflow(page, width);
    await page.getByRole('button', { name: 'はじめる' }).click();
    await noHorizontalOverflow(page, width);
    await page.getByRole('button', { name: 'むずかしい' }).click();
    await noHorizontalOverflow(page, width); // 見本
    await page.getByRole('button', { name: '飛ばす' }).click();
    await page.getByRole('button', { name: '資料を開く' }).click();
    await noHorizontalOverflow(page, width); // 閲覧
    // 本物のビューアの 10 画面 (決算短信 5・IR スライド 5) を、資料の切替とタブで全部開く
    for (const doc of ['決算短信', 'IR スライド']) {
      await page.getByRole('tab', { name: doc, exact: true }).click();
      for (const name of doc === '決算短信' ? ['サマリー', '貸借', '損益', 'CF', '注記'] : ['要点', '業績', '事業別', '見通し', '補足']) {
        await page.getByRole('tab', { name, exact: true }).click();
        await noHorizontalOverflow(page, width);
      }
    }
    await answerNow(page, true);
    await noHorizontalOverflow(page, width); // 答え合わせ
  });
}

test('EP7: 一通りの流れで、外部への通信とコンソールのエラーが無い', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await startGame(page, SEED);
  await answerNow(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('EP8: 本番ビルドに試験用の問題が入らず、転送量が予算内', async () => {
  const assets = readdirSync('dist-prod/assets').filter((f) => f.endsWith('.js'));
  expect(assets.length).toBeGreaterThan(0);
  for (const f of assets) {
    const js = readFileSync(`dist-prod/assets/${f}`, 'utf-8');
    expect(js, f).not.toContain('k-calc');
    expect(js, f).not.toContain('数字が食い違っています');
  }
  const r = spawnSync('node', ['scripts/check-dist-size.mjs', 'dist-prod'], { encoding: 'utf-8' });
  expect(r.status, r.stdout + r.stderr).toBe(0);
});

test('EP10: 本番ビルドの静的な HTML の <title> が題名「８期連続」', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').toContain('８期連続');
});
