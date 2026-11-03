// 統合したゲーム (app.css を読む本番に近いビルド) で、資料の表が崩れず、紙面に余計な余白が無いこと (Sub-task #100。包括レビューの再確認 B2・N4)。
// ビューアの E2E (viewer.spec.ts) は app.css を読まない viewer-demo で回るので、class 名の衝突は見えない。ここは本物のアプリで確かめる。
import { expect, test } from '@playwright/test';
import { startGame } from './support';

for (const width of [320, 375, 414, 1280]) {
  test(`V1: 幅 ${width}px: 資料の表の行は table-row、列見出し・セルは table-cell (app.css の flex が当たらない)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await startGame(page, 7);
    await page.getByRole('tab', { name: /損益/ }).click();
    const info = await page.locator('.v-viewer table tbody tr').evaluateAll((trs) =>
      trs.map((tr) => ({ tr: getComputedStyle(tr).display, cells: [...tr.children].map((c) => getComputedStyle(c).display) })),
    );
    expect(info.length).toBeGreaterThan(10);
    for (const r of info) {
      expect(r.tr).toBe('table-row');
      for (const c of r.cells) expect(c).toBe('table-cell');
    }
    // 行の名前と数字が横に並ぶ (縦に積まれない): 1 行の高さが小さい
    const heights = await page.locator('.v-viewer table tbody tr').evaluateAll((trs) => trs.map((tr) => tr.getBoundingClientRect().height));
    for (const h of heights.slice(0, 5)) expect(h).toBeLessThan(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`V2: 幅 ${width}px: 紙面に余計な余白 (app.css の .v-screen の padding) が無く、見出しの大きさが変わらない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await startGame(page, 7);
    const pad = await page.locator('.v-viewer article[data-doc]').evaluate((el) => {
      const c = getComputedStyle(el);
      return { l: c.paddingLeft, r: c.paddingRight, t: c.paddingTop, b: c.paddingBottom, maxWidth: c.maxWidth };
    });
    expect(pad).toEqual({ l: '0px', r: '0px', t: '0px', b: '0px', maxWidth: 'none' });
    // 紙面 (.viewer) の幅いっぱいに表が広がる: 表の幅 = 紙面の幅 − 左右の余白 16px
    const { table, viewer } = await page.evaluate(() => ({
      table: document.querySelector('.v-viewer table')!.getBoundingClientRect().width,
      viewer: document.querySelector('.v-viewer')!.getBoundingClientRect().width,
    }));
    expect(table).toBeGreaterThanOrEqual(viewer - 20);
    // ページ名の見出しは app.css の h2 の値に変わらない (ビューアの 16px)
    expect(await page.locator('.v-viewer h2').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  });
}
