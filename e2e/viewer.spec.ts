// docs/test-cases/viewer.md §6 (F1〜F17) のうち、決算短信の 5 画面の表示・ページ送り・タブ・幅 (Sub-task #63)。
// E2E 用の入口 (viewer-demo.html。VIEWER_DEMO=1 のビルドだけ) に対して回す。IR の画面は #64、道具は #65 で足す。
import { expect, test, type Page } from '@playwright/test';

const TANSHIN = [
  { id: 'summary', tab: 'サマリー', title: 'サマリー' },
  { id: 'balanceSheet', tab: '貸借', title: '連結貸借対照表' },
  { id: 'incomeStatement', tab: '損益', title: '連結損益計算書' },
  { id: 'cashFlow', tab: 'CF', title: '連結キャッシュ・フロー計算書' },
  { id: 'notes', tab: '注記', title: '注記' },
] as const;

const open = async (page: Page, query = '') => {
  await page.goto(`/viewer-demo.html${query}`);
  await expect(page.locator('article[data-screen]')).toHaveCount(1);
};
const screenId = (page: Page) => page.locator('article[data-screen]').getAttribute('data-screen');
const events = (page: Page) => page.evaluate(() => window.__viewerDemo.events.map((e) => ({ ...e })));

test.describe('F1・F4: 資料の切替・タブ・ページ名', () => {
  test('F1: 資料の切替と 5 つのタブ。初めは短信のサマリー。見えている画面は 1 つ', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('tab', { name: '決算短信' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'IR スライド' })).toHaveAttribute('aria-selected', 'false');
    for (const t of TANSHIN) await expect(page.getByRole('tab', { name: t.tab, exact: true })).toBeVisible();
    expect(await screenId(page)).toBe('summary');
    await expect(page.locator('article[data-doc]')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('サマリー');
  });

  test('F1: タブを押すと onView が呼ばれ、渡された view の画面に切り替わる', async ({ page }) => {
    await open(page);
    for (const t of TANSHIN) {
      await page.getByRole('tab', { name: t.tab, exact: true }).click();
      expect(await screenId(page)).toBe(t.id);
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(t.title);
    }
    const views = (await events(page)).filter((e) => e.type === 'view').map((e) => (e.value as { doc: string; screen: string }).screen);
    expect(views).toEqual(TANSHIN.map((t) => t.id));
  });

  test('F1: update しなければ画面は変わらない (状態を持たない)。タブを押すと onView が積まれるだけで、set({ view }) で初めて変わる', async ({ page }) => {
    await open(page, '?manual=1');
    await page.getByRole('tab', { name: '貸借', exact: true }).click();
    expect(await screenId(page)).toBe('summary');
    await expect(page.getByRole('tab', { name: 'サマリー', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect((await events(page)).map((e) => [e.type, (e.value as { screen: string }).screen])).toEqual([['view', 'balanceSheet']]);
    await page.getByRole('button', { name: '次へ' }).click();
    await page.keyboard.press('ArrowRight');
    expect(await screenId(page)).toBe('summary');
    expect((await events(page)).map((e) => (e.value as { screen: string }).screen)).toEqual(['balanceSheet', 'balanceSheet', 'balanceSheet']);
    await page.evaluate(() => window.__viewerDemo.set({ view: { doc: 'tanshin', screen: 'cashFlow' } }));
    expect(await screenId(page)).toBe('cashFlow');
  });

  test('F4: 今のタブは aria-selected、一度見た画面のタブは data-visited。問題が変わると読み済は消える', async ({ page }) => {
    await open(page);
    const tab = (name: string) => page.getByRole('tab', { name, exact: true });
    await expect(tab('サマリー')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('貸借')).toHaveAttribute('aria-selected', 'false');
    await expect(tab('貸借')).not.toHaveAttribute('data-visited', 'true');
    await tab('貸借').click();
    await tab('損益').click();
    await expect(tab('損益')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('サマリー')).toHaveAttribute('data-visited', 'true');
    await expect(tab('貸借')).toHaveAttribute('data-visited', 'true');
    await expect(tab('CF')).not.toHaveAttribute('data-visited', 'true');
    await page.evaluate(() => window.__viewerDemo.set({ problem: structuredClone(window.__viewerDemo.state.problem) }));
    await expect(tab('貸借')).not.toHaveAttribute('data-visited', 'true');
  });
});

test.describe('F2・F3: 前へ・次へ・キー', () => {
  test('F2: 次へで短信の 5 画面を順に通り、最初の前へは無効', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: '前へ' })).toBeDisabled();
    for (const t of TANSHIN.slice(1)) {
      await page.getByRole('button', { name: '次へ' }).click();
      expect(await screenId(page)).toBe(t.id);
    }
    await page.getByRole('button', { name: '前へ' }).click();
    expect(await screenId(page)).toBe('cashFlow');
  });

  test('F3: ← → で前後へ移る', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ArrowRight');
    expect(await screenId(page)).toBe('balanceSheet');
    await page.keyboard.press('ArrowRight');
    expect(await screenId(page)).toBe('incomeStatement');
    await page.keyboard.press('ArrowLeft');
    expect(await screenId(page)).toBe('balanceSheet');
  });
});

test.describe('F17: 上の固定領域', () => {
  for (const width of [320, 360, 375, 414]) {
    test(`F17: 幅 ${width}px で、資料の切替とタブは各 1 行・44px。縦にスクロールしても上に見える`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await open(page, '?problem=full');
      await page.getByRole('tab', { name: '貸借', exact: true }).click();
      const docBar = await page.locator('.tabs-doc').boundingBox();
      const screenBar = await page.locator('.tabs-screen').boundingBox();
      expect(docBar!.height).toBe(44);
      expect(screenBar!.height).toBe(44);
      const tops = await page.locator('.tabs-screen .tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
      for (const h of await page.locator('.tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo(0, 600));
      const top = await page.locator('.viewer-top').evaluate((e) => e.getBoundingClientRect().top);
      expect(top).toBe(0);
    });
  }
});

test.describe('F5: 横にはみ出さない (受け入れ条件 9)', () => {
  for (const problem of ['normal', 'full', 'oku']) {
    for (const width of [320, 375, 414, 1280]) {
      test(`F5: ${problem}・幅 ${width}px で短信の 5 画面がはみ出さない`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, `?problem=${problem}`);
        for (const t of TANSHIN) {
          await page.getByRole('tab', { name: t.tab, exact: true }).click();
          expect(await screenId(page)).toBe(t.id);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), t.id).toBeLessThanOrEqual(width);
        }
      });
    }
  }

  test('F5: 長い社名・長い項目名・10 桁の数字でもはみ出さない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, '?problem=full');
    await page.evaluate(() => {
      const p = structuredClone(window.__viewerDemo.state.problem);
      p.tanshin.header.companyName = 'とても長い名前の架空の株式会社'.repeat(3);
      p.tanshin.balanceSheet.current.cash = -1234567890;
      p.tanshin.balanceSheet.previous.cash = 1234567890;
      p.tanshin.cashFlow.operatingCashFlow = -1234567890;
      p.labelOverrides = { 'tanshin.cashFlow.fxEffect': '現金及び現金同等物に係る換算差額の非常に長い名前を付けた行' };
      window.__viewerDemo.set({ problem: p });
    });
    for (const t of TANSHIN) {
      await page.getByRole('tab', { name: t.tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), t.id).toBeLessThanOrEqual(320);
    }
    await page.getByRole('tab', { name: '貸借', exact: true }).click();
    await expect(page.locator('[data-path="tanshin.balanceSheet.current.cash"]')).toHaveText('△1,234,567,890');
  });
});

test.describe('F13・F14: 同じ書式・通信なし', () => {
  test('F13: 問題が変わっても、画面の構造 (クラス名の集合) は同じ', async ({ page }) => {
    const classes = async (query: string, tab: string) => {
      await open(page, query);
      await page.getByRole('tab', { name: tab, exact: true }).click();
      return page.locator('article.screen').evaluate((a) => [...new Set([a, ...a.querySelectorAll('*')].flatMap((e) => [...e.classList]))].sort());
    };
    for (const t of TANSHIN) {
      const a = await classes('?problem=normal', t.tab);
      expect(await classes('?problem=full', t.tab), t.id).toEqual(a);
      expect(await classes('?problem=oku', t.tab), t.id).toEqual(a);
    }
  });

  test('F14: 外部への通信・コンソールのエラー・CSP の違反が無い', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const foreign: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url());
    });
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, '?problem=full');
    for (const t of TANSHIN) await page.getByRole('tab', { name: t.tab, exact: true }).click();
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test('表示の内容: 基準問題の短信の数字が画面に出る (data-path のセル)', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-path="tanshin.header.companyName"]')).toHaveText('第七試作電機株式会社');
  await expect(page.locator('[data-path="tanshin.summary.netSales.current"]')).toHaveText('12,400');
  await expect(page.locator('[data-path="tanshin.summary.netSales.changeRate"]')).toHaveText('5.1%');
  await page.getByRole('tab', { name: 'CF', exact: true }).click();
  await expect(page.locator('[data-path="tanshin.cashFlow.interestDividendIncome"]')).toHaveText('△90');
  await expect(page.locator('[data-item-key="tanshin.cashFlow.interestDividendIncome"]')).toHaveText('受取利息及び配当金');
});
