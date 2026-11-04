// E1〜E28 (docs/test-cases/flow.md §2): 遊びの流れ。ビルドした成果物 (npm run build:e2e の試験用の問題) に対して回す。
import { expect, test } from '@playwright/test';
import { answer, answerLabel, app, contrastRatio, judgeWith, nextCompany, noHorizontalOverflow, planOf, problemId, problemOf, seedWhere, startGame } from './support';

const SEED = 1;
const isAnomaly = (kind?: string) => (p: { anomaly: { kind: string } | null }) => (kind ? p.anomaly?.kind === kind : p.anomaly !== null);
const isNormal = (p: { anomaly: unknown }) => p.anomaly === null;

test('E1: タイトル → 難易度 (やさしい) → 導入 → 資料の閲覧', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await expect(app(page)).toHaveAttribute('data-screen', 'title');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'やさしい' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'むずかしい' })).toBeVisible();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample'); // 初回の見本
  await page.getByRole('button', { name: '飛ばす' }).click();
  await expect(page.getByText('1 / 8 社目').first()).toBeVisible();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
  await expect(app(page)).toHaveAttribute('data-difficulty', 'easy');
  await expect(app(page)).toHaveAttribute('data-round', '1');
  expect(await problemId(page)).toMatch(/^easy-/);
});

test('E2: むずかしいでも同じ流れ', async ({ page }) => {
  await startGame(page, SEED, 'hard');
  await expect(app(page)).toHaveAttribute('data-difficulty', 'hard');
  expect(await problemId(page)).toMatch(/^hard-/);
});

test('E3: 正解の答え → 正解 → 次の会社 (2 社目の別の問題)', async ({ page }) => {
  await startGame(page, SEED);
  const first = await problemId(page);
  await answer(page, true);
  await expect(page.getByTestId('result')).toContainText('正解');
  await nextCompany(page);
  await expect(app(page)).toHaveAttribute('data-round', '2');
  expect(await problemId(page)).not.toBe(first);
});

test('E4: 判定するだけでは確定しない (素早い 2 回押し・読みに戻る)', async ({ page }) => {
  await startGame(page, SEED);
  await page.getByTestId('judge').dblclick();
  await page.waitForTimeout(600);
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
  await page.getByRole('button', { name: '読みに戻る' }).click();
  // パネルが開いた直後 (短い間) は、答えのボタンを押しても確定しない
  await page.getByTestId('judge').click();
  await page.getByRole('button', { name: '異変あり' }).click({ force: true });
  await page.getByRole('button', { name: '異変なし' }).click({ force: true });
  await page.waitForTimeout(250);
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
  await page.getByRole('button', { name: '読みに戻る' }).click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
});

test('E5: 1 社目で不正解 → 最初に戻る → もう一度 (新しい出題の 1 社目)', async ({ page }) => {
  await startGame(page, SEED);
  const first = await problemId(page);
  await answer(page, false);
  await expect(page.getByTestId('result')).toContainText('不正解');
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'restart');
  await expect(page.getByText('1 社目まで進みました')).toBeVisible();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
  expect(await problemId(page)).not.toBe(first);
});

test('E6: 4 社目で不正解 → 4 社目まで進みました → 難易度を選び直す', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 3; i++) {
    await answer(page, true);
    await nextCompany(page);
  }
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByText('4 社目まで進みました')).toBeVisible();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'difficulty');
});

test('E7・E20: 8 社連続で正解するとクリア (完了票・朝)。もう一度・別の難易度', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 8; i++) {
    await answer(page, true);
    if (i < 7) await nextCompany(page);
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(app(page)).toHaveAttribute('data-phase', 'cleared');
  await expect(page.getByTestId('completion-slip')).toBeVisible();
  await expect(page.getByTestId('morning')).toHaveText('翌朝 6:00'); // 「翌朝 翌朝 6:00」と重ならない (#30 の包括レビュー X1)
  await expect(page.getByTestId('completion-slip').locator('ol')).toHaveCount(0); // 番号の二重 (「1. 1 / 8 社目」) を避ける
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
});

test('E7b: クリアのあと別の難易度で難易度の画面', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 8; i++) {
    await answer(page, true);
    if (i < 7) await nextCompany(page);
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  await page.getByRole('button', { name: '別の難易度' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'difficulty');
});

test('E8: 異変のある問題の答え合わせ: 場所が強調され、説明と種類が見える', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  const p = problemOf(await problemId(page));
  await answer(page, true);
  await expect(page.locator(`[data-path="tanshin.${p.anomaly!.places[0] && 'path' in p.anomaly!.places[0] ? p.anomaly!.places[0].path : ''}"][data-highlight="true"]`)).toBeVisible();
  await expect(page.getByTestId('explanation')).toHaveText(p.anomaly!.explanation);
  await expect(page.getByTestId('kind')).toHaveText('合計の計算違い');
});

test('E9: 異変のある問題に「異変なし」(不正解) でも、場所・説明・種類が同じ', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  await answer(page, false);
  await expect(page.getByTestId('result')).toContainText('不正解');
  await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();
  await expect(page.getByTestId('explanation')).toBeVisible();
  await expect(page.getByTestId('kind')).toBeVisible();
});

test('E10: 異変のない問題に「異変あり」(不正解) は、強調が無く「異変はありませんでした」', async ({ page }) => {
  const seed = seedWhere(isNormal);
  await startGame(page, seed);
  await answer(page, false);
  await expect(page.getByTestId('no-anomaly')).toBeVisible();
  await expect(page.locator('[data-highlight="true"]')).toHaveCount(0);
});

test('E11: 資料間の異変: 場所 1 / 2・2 / 2 で各画面に移り強調される。判定は変わらない', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-cross'));
  await startGame(page, seed);
  await answer(page, true);
  await expect(page.getByRole('button', { name: '場所 1 / 2' })).toBeVisible();
  await expect(page.locator('[data-path="tanshin.balanceSheet.current.cash"][data-highlight="true"]')).toBeVisible();
  await page.getByRole('button', { name: '場所 2 / 2' }).click();
  await expect(page.locator('[data-path="ir.supplement.cash.current"][data-highlight="true"]')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('正解');
  await expect(app(page)).toHaveAttribute('data-phase', 'revealed');
});

test('E12: 不正解の答え合わせで再読み込みしても、判定をやり直せない', async ({ page }) => {
  await startGame(page, SEED);
  const id = await problemId(page);
  await answer(page, false);
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-phase', 'revealed');
  await expect(page.getByTestId('result')).toContainText('不正解');
  expect(await problemId(page)).toBe(id);
  await expect(page.getByTestId('judge')).toHaveCount(0);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
});

test('E13: 正解の答え合わせで再読み込み → 同じ答え合わせ。次の会社へ進める', async ({ page }) => {
  await startGame(page, SEED);
  const id = await problemId(page);
  await answer(page, true);
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-phase', 'revealed');
  await expect(page.getByTestId('result')).toContainText('正解');
  expect(await problemId(page)).toBe(id);
  await expect(page.getByTestId('judge')).toHaveCount(0);
  await nextCompany(page);
  await expect(app(page)).toHaveAttribute('data-round', '2');
});

test('E14: 読んでいる途中の再読み込みで、同じ問題・社数・印', async ({ page }) => {
  await startGame(page, SEED);
  const id = await problemId(page);
  await page.getByRole('button', { name: '印', exact: true }).click();
  const cell = page.locator('td[data-path]').first();
  const path = (await cell.getAttribute('data-path'))!;
  await cell.click();
  await expect(page.locator(`[data-path="${path}"][data-marked="true"]`)).toBeVisible();
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
  expect(await problemId(page)).toBe(id);
  await expect(page.locator(`[data-path="${path}"][data-marked="true"]`)).toBeVisible();
});

test('E15: 見本・遊びかたで再読み込みすると、難易度の画面・タイトルに戻る', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-screen', 'difficulty');
  await page.getByRole('button', { name: '戻る' }).click();
  await page.getByRole('button', { name: '遊びかた' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'help');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-screen', 'title'); // 遊びかたは保存しない。保存された phase (title) の画面に戻る
});

test('E16: 走行中の「タイトルへ」は確認を挟む。続けると続きから、戻るとタイトル', async ({ page }) => {
  await startGame(page, SEED);
  const id = await problemId(page);
  await page.getByTestId('to-title').click();
  await expect(page.getByTestId('confirm')).toBeVisible();
  await page.getByRole('button', { name: '続ける' }).click();
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
  expect(await problemId(page)).toBe(id);
  await page.getByTestId('to-title').click();
  await page.getByRole('button', { name: 'タイトルへ戻る' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'title');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-round', '1');
});

test('E17: 見本は難易度ごとに 1 回。遊びかたから開いた見本は始められず、閉じると遊びかたに戻る', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByRole('button', { name: '遊びかた' }).click();
  await page.getByRole('button', { name: '見本を見る' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample');
  await expect(page.getByRole('button', { name: '始める' })).toHaveCount(0);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'help');
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample');
  await expect(page.getByRole('button', { name: '始める' })).toBeVisible();
  await page.getByRole('button', { name: '始める' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click(); // 2 回目: 見本なしで導入
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
});

test('E17b: むずかしいを初めて選ぶと、やさしいで見たあとでも見本が出る', async ({ page }) => {
  await startGame(page, SEED); // やさしいの見本は飛ばした
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: 'むずかしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample');
  await page.getByRole('button', { name: '始める' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
  await expect(app(page)).toHaveAttribute('data-difficulty', 'hard');
});

test('E18: 新しい文脈 2 つで、同じ ?seed・同じ操作なら、1 周目も「もう一度」のあとも同じ 1 社目', async ({ browser }) => {
  const ids: string[][] = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await startGame(page, 7);
    const run: string[] = [await problemId(page)];
    await answer(page, false);
    await page.getByRole('button', { name: '最初に戻る' }).click();
    await page.getByRole('button', { name: 'もう一度' }).click();
    await page.getByRole('button', { name: '資料を開く' }).click();
    run.push(await problemId(page));
    ids.push(run);
    await context.close();
  }
  expect(ids[0]).toEqual(ids[1]);
  expect(ids[0]![0]).not.toBe(ids[0]![1]);
});

test('E19: 社が進むと時刻と段が進み、不正解で最初に戻ると 18:00', async ({ page }) => {
  await startGame(page, SEED);
  const times = ['18:00', '19:00', '20:00'];
  for (let i = 0; i < 3; i++) {
    await expect(app(page)).toHaveAttribute('data-stage', String(i));
    await expect(page.getByTestId('time')).toHaveText(times[i]!);
    await answer(page, true);
    if (i < 2) await nextCompany(page);
  }
  await nextCompany(page);
  await expect(app(page)).toHaveAttribute('data-stage', '3');
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByTestId('rewind')).toContainText('18:00');
  // 時刻は 1 回だけ (「時刻は 18:00 に戻ります。 (18:00)」と二重に出さない。包括レビュー n5)
  expect(((await page.getByTestId('rewind').innerText()).match(/18:00/g) ?? []).length).toBe(1);
  await expect(app(page)).toHaveAttribute('data-stage', '0');
});

test('E21: 印の照合: 異変の場所に付けた印は「当たり」', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  const p = problemOf(await problemId(page));
  const place = p.anomaly!.places[0]!;
  await page.getByRole('tab', { name: /損益/ }).click();
  await page.getByRole('button', { name: '印', exact: true }).click();
  await page.locator(`[data-path="tanshin.${'path' in place ? place.path : ''}"]`).click();
  await judgeWith(page, '異変あり');
  await expect(page.getByTestId('marks-match')).toContainText('当たり 1・外れ 0・見逃し 0');
});

test('E22: 記録: 3 社目で不正解のあと、最高到達 3 社目が残る (再読み込みしても)', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 2; i++) {
    await answer(page, true);
    await nextCompany(page);
  }
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByText('3 社目まで進みました')).toBeVisible();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.getByTestId('record')).toContainText('最高到達 3 社目');
  await page.reload();
  await expect(page.getByTestId('record')).toContainText('最高到達 3 社目');
});

test('E23: ← → は判定にならない', async ({ page }) => {
  await startGame(page, SEED);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(app(page)).toHaveAttribute('data-phase', 'reading');
});

for (const width of [320, 375, 414]) {
  test(`E24: 幅 ${width}px で、どの画面も横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const fit = () => noHorizontalOverflow(page, width);
    await page.goto(`/?seed=${SEED}`);
    await fit();
    await page.getByRole('button', { name: '遊びかた' }).click();
    await fit();
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.getByRole('button', { name: 'はじめる' }).click();
    await fit();
    await page.getByRole('button', { name: 'やさしい' }).click();
    await fit(); // 見本
    await page.getByRole('button', { name: '始める' }).click();
    await fit(); // 導入
    await page.getByRole('button', { name: '資料を開く' }).click();
    await fit(); // 閲覧
    await page.getByTestId('judge').click();
    await fit(); // パネル
    await page.getByRole('button', { name: '読みに戻る' }).click();
    await answer(page, false);
    await fit(); // 答え合わせ
    await page.getByRole('button', { name: '最初に戻る' }).click();
    await fit(); // 最初へ戻る
    await page.getByRole('button', { name: 'もう一度' }).click();
    await page.getByRole('button', { name: '資料を開く' }).click();
    for (let i = 0; i < 8; i++) {
      await answer(page, true);
      if (i < 7) await nextCompany(page);
    }
    await page.getByRole('button', { name: '結果を見る' }).click();
    await fit(); // クリア
  });
}

test('E25: 一通りの流れで、外部への通信とコンソールのエラーが無い', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await startGame(page, SEED);
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('E26: 動きを減らす設定では、最初へ戻る・スタンプのアニメーションが止まる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page, SEED);
  await answer(page, false);
  expect(await page.locator('.stamp').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button', { name: '最初に戻る' }).click();
  expect(await page.getByTestId('rewind').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('E27: 保存が使えない環境でも遊べる。再読み込みするとタイトルに戻る', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = () => { throw new DOMException('denied', 'SecurityError'); };
    for (const name of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, name, { value: fail });
    }
  });
  await startGame(page, SEED);
  await answer(page, true);
  await nextCompany(page);
  await expect(app(page)).toHaveAttribute('data-round', '2');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-screen', 'title');
});

test('E28: 答え合わせの結果は aria-live で通知される', async ({ page }) => {
  await startGame(page, SEED);
  await answer(page, true);
  await expect(page.getByTestId('result')).toHaveAttribute('aria-live', 'polite');
  expect(answerLabel(planOf(SEED)[0]!, true)).toMatch(/異変/);
});

test('E29: 遊ぶ前の見本・会社の導入・最初へ戻る にも「タイトルへ」がある。遊ぶ前の見本から戻れる', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample');
  await expect(page.getByTestId('to-title')).toBeVisible();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'difficulty');
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'sample'); // 見たことになっていない
  await page.getByTestId('to-title').click(); // 難易度の選択なので確認なし
  await expect(app(page)).toHaveAttribute('data-screen', 'title');
  await startGame(page, SEED);
  await answer(page, true);
  await page.getByRole('button', { name: '次の会社へ' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
  await page.getByTestId('to-title').click();
  await expect(page.getByTestId('confirm')).toBeVisible();
  await page.getByRole('button', { name: '続ける' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'restart');
  await page.getByTestId('to-title').click();
  await expect(page.getByTestId('confirm')).toBeVisible();
});

test('E30: 帯の社色・淡い色で、8 段すべてで読める。社が変わると社色が変わる。CSP のエラーが無い', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await startGame(page, SEED);
  const mains = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const band = page.getByTestId('band');
    const css = await band.evaluate((el) => {
      const emblem = el.querySelector('.emblem')!;
      return {
        emblemColor: getComputedStyle(emblem).color, emblemBg: getComputedStyle(emblem).backgroundColor,
        bandColor: getComputedStyle(el).color, bandBg: getComputedStyle(el).backgroundColor,
        main: getComputedStyle(el).getPropertyValue('--company-main').trim(),
      };
    });
    expect(contrastRatio(css.emblemColor, css.emblemBg), `社章 ${i + 1} 社目`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(css.bandColor, css.bandBg), `帯 ${i + 1} 社目`).toBeGreaterThanOrEqual(4.5);
    expect(css.main).not.toBe('');
    mains.add(css.main);
    await answer(page, true);
    if (i < 7) await nextCompany(page);
  }
  expect(mains.size).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('E31: 資料の紙面は社が変わっても同じ。机の面に質感 (グラデーション)・紙面に影', async ({ page }) => {
  await startGame(page, SEED);
  const read = () => page.locator('.v-viewer').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, shadow: getComputedStyle(el).boxShadow }));
  const first = await read();
  expect(first.shadow).not.toBe('none');
  expect(await page.locator('.app').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  for (let i = 0; i < 7; i++) {
    await answer(page, true);
    await nextCompany(page);
  }
  const last = await read();
  expect(last.bg).toBe(first.bg);
  expect(last.fg).toBe(first.fg);
});

// ---- #85 (docs/test-cases/flow.md §2.2): #28 の包括レビュー N1〜N5 と責任者の決定

test('E32: 最高到達 5 の記録で 1 社目を間違え、答え合わせで再読み込みしても「自己ベスト」は出ない', async ({ page }) => {
  await startGame(page, SEED);
  for (let i = 0; i < 4; i++) {
    await answer(page, true);
    await nextCompany(page);
  }
  await answer(page, false); // 5 社目で不正解 → 最高到達 5
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await answer(page, false); // 1 社目で不正解
  await page.reload();
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByText('1 社目まで進みました')).toBeVisible();
  await expect(page.getByText('最高到達: 5 社目')).toBeVisible();
  await expect(page.getByTestId('new-best')).toHaveCount(0);
});

test('E33: クリアの完了票に、遊んだ 8 社の社名と社章が出る (再読み込みしても)', async ({ page }) => {
  await startGame(page, SEED);
  const names: string[] = [];
  for (let i = 0; i < 8; i++) {
    names.push((await page.getByTestId('band').innerText()).split('\n').pop()!.trim());
    await answer(page, true);
    if (i < 7) await nextCompany(page);
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  const slip = page.getByTestId('completion-slip');
  await expect(slip.getByTestId('slip-company')).toHaveCount(8);
  await expect(slip.locator('.emblem')).toHaveCount(8);
  expect(await slip.getByTestId('slip-company').allInnerTexts()).toEqual(names.map((n) => expect.stringContaining(n)));
  await page.reload();
  await expect(page.getByTestId('completion-slip').getByTestId('slip-company')).toHaveCount(8);
});

test('E34: タイトルに舞台の説明と入口の背景。導入のカードの見出しは「閲覧票」', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await expect(page.getByText('資料室')).toBeVisible();
  await expect(page.getByText('閲覧票').first()).toBeVisible();
  await expect(page.getByTestId('entrance')).toBeVisible();
  await expect(page.getByText('決算書と IR の異変を探して、8 社連続で見抜け')).toBeVisible();
  await startGame(page, SEED + 1);
  await page.getByTestId('to-title').click();
  await page.getByRole('button', { name: 'タイトルへ戻る' }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
  await expect(page.getByTestId('intro-slip').getByRole('heading', { name: '閲覧票' })).toBeVisible();
});

test('E35: 見本は 2 つの難易度で同じ内容。2 回目の「むずかしい」では出ない', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: 'やさしい' }).click();
  const easyNote = await page.getByTestId('sample-note').innerText();
  await page.getByRole('button', { name: '始める' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: 'むずかしい' }).click();
  expect(await page.getByTestId('sample-note').innerText()).toBe(easyNote);
  await page.getByRole('button', { name: '始める' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await answer(page, false);
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await page.getByRole('button', { name: '難易度を選び直す' }).click();
  await page.getByRole('button', { name: 'むずかしい' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
});

test('E36: 8 社目まで段と時刻が進み (18:00〜翌 1:00)、8 社目で不正解のあと最初へ戻ると 18:00', async ({ page }) => {
  await startGame(page, SEED);
  const times = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '翌 0:00', '翌 1:00'];
  for (let i = 0; i < 8; i++) {
    await expect(app(page)).toHaveAttribute('data-stage', String(i));
    await expect(page.getByTestId('time')).toHaveText(times[i]!);
    await answer(page, i < 7);
    if (i < 7) await nextCompany(page);
  }
  await page.getByRole('button', { name: '最初に戻る' }).click();
  await expect(page.getByText('8 社目まで進みました')).toBeVisible();
  await expect(page.getByTestId('rewind')).toContainText('18:00');
  await expect(app(page)).toHaveAttribute('data-stage', '0');
});

test('E37a: 印の照合: 印なしは見逃しだけ', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  await judgeWith(page, '異変あり');
  await expect(page.getByTestId('marks-match')).toContainText('当たり 0・外れ 0・見逃し 1');
});

test('E37b: 印の照合: 場所以外の印は外れ + 見逃し', async ({ page }) => {
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  await page.getByRole('button', { name: '印', exact: true }).click();
  await page.locator('[data-path="tanshin.header.companyName"]').click();
  await judgeWith(page, '異変あり');
  await expect(page.getByTestId('marks-match')).toContainText('当たり 0・外れ 1・見逃し 1');
});

test('E38: クリアのあと「クリア 1 回」。動きを減らす設定では遷移の長さが 0s', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page, SEED);
  for (let i = 0; i < 8; i++) {
    await answer(page, true);
    if (i < 7) await nextCompany(page);
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page.getByTestId('record')).toContainText('クリア 1 回');
  expect(await page.locator('.screen').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

// ---- #98・#101 (docs/test-cases/release.md §3)

for (const width of [320, 375, 1280]) {
  test(`E41: 幅 ${width}px・高さ 400 で一番下までスクロールしても、閲覧票の帯と資料のタブが上に見え続ける`, async ({ page }) => {
    await page.setViewportSize({ width, height: 400 });
    await startGame(page, SEED);
    const check = async (where: string) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const r = await page.evaluate(() => {
        const band = document.querySelector('[data-testid="band"]')!.getBoundingClientRect();
        const top = document.querySelector('.v-viewer-top')!.getBoundingClientRect();
        return { scrolled: window.scrollY, bandTop: band.top, bandBottom: band.bottom, tabsTop: top.top };
      });
      expect(r.scrolled, `${where}: スクロールできる高さがある`).toBeGreaterThan(50);
      expect(Math.abs(r.bandTop), `${where}: 帯が上端`).toBeLessThanOrEqual(1);
      if (width <= 414) expect(r.bandBottom - r.bandTop, `${where}: スマホの帯は 1 行 (44 px 以下)`).toBeLessThanOrEqual(44);
      expect(Math.abs(r.tabsTop - r.bandBottom), `${where}: タブが帯の真下`).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('band')).toBeInViewport();
      await expect(page.locator('.v-viewer-top')).toBeInViewport();
    };
    await check('閲覧');
    await page.evaluate(() => window.scrollTo(0, 0));
    await answer(page, true);
    await check('答え合わせ');
  });
}

test('E42・E43: 幅 320 × 高さ 700 で判定すると、答え合わせの頭が見える (スクロールしない)。フォーカスは次へのボタン', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const seed = seedWhere(isAnomaly('k-calc'));
  await startGame(page, seed);
  await answer(page, true);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(100);
  await expect(page.getByTestId('result')).toBeInViewport();
  await expect(page.getByTestId('explanation')).toBeInViewport();
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('次の会社へ');
});
