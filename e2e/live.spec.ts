// LV1〜LV8 (docs/test-cases/release.md §4): 公開 URL (E2E_LIVE_URL) に対する、受け入れ条件 1〜11 の通しの確認。
// `E2E_LIVE_URL=https://… npx playwright test e2e/live.spec.ts` で、幅 1280・375・320 の 3 つの project で回る。正解は data-problem-id から src/data/problems/<難易度>/<id>.json を読んで知る (公開した版と同じ main のデータ)。
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Company, Problem } from '../src/domain/types';
import { app, judgeWith, nextCompany, noHorizontalOverflow, problemId, startGame } from './support';

const SEED = 5;
const load = (id: string): Problem => JSON.parse(readFileSync(`src/data/problems/${id.split('-')[0]}/${id}.json`, 'utf-8')) as Problem;
const companyNames = new Set((JSON.parse(readFileSync('src/data/companies.json', 'utf-8')) as Company[]).map((c) => c.name));
const label = (p: Problem, correct: boolean) => ((p.anomaly !== null) === correct ? '異変あり' : '異変なし');
type Pg = Parameters<typeof judgeWith>[0];
async function answerNow(page: Pg, correct: boolean): Promise<Problem> {
  const p = load(await problemId(page));
  await judgeWith(page, label(p, correct));
  return p;
}
const width = (page: Pg) => page.viewportSize()!.width;
const fit = async (page: Pg) => noHorizontalOverflow(page, width(page));

test('LV1 (AC1・11・8・10): タイトルに題名「８期連続」・副題・断り書き (16 px 以上)・MIT。CSP のヘッダ。難易度を 2 つ選べる', async ({ page }) => {
  const response = await page.goto(`/?seed=${SEED}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(await page.title()).toBe('８期連続');
  const text = await app(page).innerText();
  expect(text).toContain('８期連続');
  expect(text).toContain('決算書と IR の異変を探して、8 社連続で見抜け');
  expect(text).not.toMatch(/[8８]番出口/);
  const note = page.getByText('すべて架空です');
  await expect(note).toBeVisible();
  expect(await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(page.getByText('MIT ライセンス')).toBeVisible();
  await fit(page);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'やさしい' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'むずかしい' })).toBeEnabled();
  await fit(page);
});

test('LV2 (AC2・9): 1 問で、資料束の 10 画面を全部開け、判定は 2 択。どの画面も横にはみ出さない', async ({ page }) => {
  await startGame(page, SEED, 'hard');
  for (const doc of ['決算短信', 'IR スライド']) {
    await page.getByRole('tab', { name: doc, exact: true }).click();
    for (const name of doc === '決算短信' ? ['サマリー', '貸借', '損益', 'CF', '注記'] : ['要点', '業績', '事業別', '見通し', '補足']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await fit(page);
    }
  }
  await page.getByTestId('judge').click();
  await expect(page.getByRole('button', { name: '異変あり' })).toBeVisible();
  await expect(page.getByRole('button', { name: '異変なし' })).toBeVisible();
  await fit(page);
});

for (const difficulty of ['easy', 'hard'] as const) {
  test(`LV3 (AC3・5・7・8): ${difficulty}: 8 社連続で正しく判定してクリア。時刻と段が進み、社名は設定の架空の会社だけ`, async ({ page }) => {
    await startGame(page, SEED, difficulty);
    const times = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '翌 0:00', '翌 1:00'];
    let anomalies = 0;
    for (let i = 0; i < 8; i++) {
      await expect(app(page)).toHaveAttribute('data-stage', String(i));
      await expect(page.getByTestId('time')).toHaveText(times[i]!);
      const name = (await page.getByTestId('band').innerText()).split('\n').pop()!.trim();
      expect(companyNames.has(name), `社名 ${name} が companies.json にある`).toBe(true);
      const p = await answerNow(page, true);
      if (p.anomaly) anomalies++;
      await fit(page);
      if (i < 7) await nextCompany(page);
    }
    await page.getByRole('button', { name: '結果を見る' }).click();
    await expect(app(page)).toHaveAttribute('data-phase', 'cleared');
    await expect(page.getByTestId('completion-slip').getByTestId('slip-company')).toHaveCount(8);
    await expect(page.getByTestId('morning')).toContainText('6:00');
    await fit(page);
    expect(anomalies).toBeGreaterThanOrEqual(0);
  });
}

test('LV4 (AC3・9): 3 社目で間違えると最初 (1 社目) に戻り、新しい出題になる', async ({ page }) => {
  await startGame(page, SEED);
  const first = await problemId(page);
  for (let i = 0; i < 2; i++) {
    await answerNow(page, true);
    await nextCompany(page);
  }
  await answerNow(page, false);
  await expect(page.getByTestId('result')).toContainText('不正解');
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByText('3 社目まで進みました')).toBeVisible();
  await fit(page);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
  expect(await problemId(page)).not.toBe(first);
});

for (const difficulty of ['easy', 'hard'] as const) {
  test(`LV5 (AC4): ${difficulty}: 異変のある問題の答え合わせで、場所が強調され、説明と種類が出る (答え合わせの頭が見える)`, async ({ page }) => {
    await startGame(page, SEED, difficulty);
    let p = load(await problemId(page));
    for (let i = 0; i < 7 && p.anomaly === null; i++) {
      await answerNow(page, true);
      await nextCompany(page);
      p = load(await problemId(page));
    }
    test.skip(p.anomaly === null, 'この種の 8 問に異変が無い (まれ)');
    await answerNow(page, true);
    expect(await page.locator('[data-highlight="true"]').count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('explanation')).toHaveText(p.anomaly!.explanation);
    await expect(page.getByTestId('kind')).toBeVisible();
    await expect(page.getByTestId('result')).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(100);
    await fit(page);
  });
}

test('LV6 (AC9): 遊びかた・見本・導入・パネル・最初へ戻るなど、遊びの流れの全画面が横にはみ出さない', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByRole('button', { name: '遊びかた' }).click();
  await fit(page);
  await page.getByRole('button', { name: '見本を見る' }).click();
  await fit(page);
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await fit(page); // 見本 (遊ぶ前)
  await page.getByRole('button', { name: '始める' }).click();
  await fit(page); // 導入
  await page.getByRole('button', { name: '資料を開く' }).click();
  await page.getByTestId('judge').click();
  await fit(page); // 判定のパネル
  await page.getByRole('button', { name: '読みに戻る' }).click();
  await answerNow(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await fit(page); // 最初へ戻る
});

test('LV7 (外部通信 0): 一通りの流れで、同じ生成元以外へのリクエストが無く、コンソールのエラーが無い', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await startGame(page, SEED);
  await answerNow(page, true);
  await nextCompany(page);
  await answerNow(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('LV8 (記録・再読み込み): 3 社目で不正解のあと、再読み込みしても判定をやり直せず、最高到達が残る', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 2; i++) {
    await answerNow(page, true);
    await nextCompany(page);
  }
  await answerNow(page, false);
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-phase', 'revealed');
  await expect(page.getByTestId('judge')).toHaveCount(0);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.getByTestId('record')).toContainText('最高到達 3 社目');
});
