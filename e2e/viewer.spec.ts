// docs/test-cases/viewer.md §6 (F1〜F17) のうち、資料束 10 画面の表示・ページ送り・タブ・幅 (Sub-task #63・#64)。
// E2E 用の入口 (viewer-demo.html。VIEWER_DEMO=1 のビルドだけ) に対して回す。道具 (F6〜F12・F15・F16) は #65 で足す。
import { expect, test, type Page } from '@playwright/test';

const TANSHIN = [
  { id: 'summary', tab: 'サマリー', title: 'サマリー' },
  { id: 'balanceSheet', tab: '貸借', title: '連結貸借対照表' },
  { id: 'incomeStatement', tab: '損益', title: '連結損益計算書' },
  { id: 'cashFlow', tab: 'CF', title: '連結キャッシュ・フロー計算書' },
  { id: 'notes', tab: '注記', title: '注記' },
] as const;
const IR = [
  { id: 'highlights', tab: '要点', title: 'ハイライト' },
  { id: 'results', tab: '業績', title: '業績' },
  { id: 'segments', tab: '事業別', title: 'セグメント別の状況' },
  { id: 'outlook', tab: '見通し', title: '今後の見通し' },
  { id: 'supplement', tab: '補足', title: '補足資料' },
] as const;
const ALL = [...TANSHIN, ...IR];

const open = async (page: Page, query = '') => {
  await page.goto(`/viewer-demo.html${query}`);
  await expect(page.locator('article[data-screen]')).toHaveCount(1);
};
/** 画面へ移る: 資料の切替 → タブ。 */
const show = async (page: Page, t: (typeof ALL)[number]) => {
  const doc = IR.some((x) => x.id === t.id) ? 'IR スライド' : '決算短信';
  if ((await page.getByRole('tab', { name: doc, exact: true }).getAttribute('aria-selected')) !== 'true') await page.getByRole('tab', { name: doc, exact: true }).click();
  await page.getByRole('tab', { name: t.tab, exact: true }).click();
  expect(await screenId(page)).toBe(t.id);
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
  test('F2: 次へで短信 5 → IR 5 の 10 ページを順に通る。最初の前へと最後の次へは無効', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: '前へ' })).toBeDisabled();
    for (const t of ALL.slice(1)) {
      await page.getByRole('button', { name: '次へ' }).click();
      expect(await screenId(page)).toBe(t.id);
    }
    expect(await page.locator('article[data-screen]').getAttribute('data-doc')).toBe('ir');
    await expect(page.getByRole('button', { name: '次へ' })).toBeDisabled();
    await page.getByRole('button', { name: '前へ' }).click();
    expect(await screenId(page)).toBe('outlook');
  });

  test('F1: 資料の切替で IR スライドへ移り、短信へ戻ると最後に見た画面に戻る', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: '貸借', exact: true }).click();
    await page.getByRole('tab', { name: 'IR スライド', exact: true }).click();
    expect(await screenId(page)).toBe('highlights');
    for (const t of IR) await expect(page.getByRole('tab', { name: t.tab, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '見通し', exact: true }).click();
    await page.getByRole('tab', { name: '決算短信', exact: true }).click();
    expect(await screenId(page)).toBe('balanceSheet');
    await page.getByRole('tab', { name: 'IR スライド', exact: true }).click();
    expect(await screenId(page)).toBe('outlook');
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
      test(`F5: ${problem}・幅 ${width}px で 10 画面がはみ出さない`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, `?problem=${problem}`);
        for (const t of ALL) {
          await show(page, t);
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
      p.ir.results.netSales.current = 1234567890.5;
      p.ir.segments.items[0]!.name = 'とても長い名前の事業'.repeat(4);
      p.ir.statements[0]!.text = 'とても長い文章です。'.repeat(20);
      p.labelOverrides = { 'tanshin.cashFlow.fxEffect': '現金及び現金同等物に係る換算差額の非常に長い名前を付けた行' };
      window.__viewerDemo.set({ problem: p });
    });
    for (const t of ALL) {
      await show(page, t);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), t.id).toBeLessThanOrEqual(320);
    }
    await show(page, TANSHIN[1]);
    await expect(page.locator('[data-path="tanshin.balanceSheet.current.cash"]')).toHaveText('△1,234,567,890');
  });
});

test.describe('F13・F14: 同じ書式・通信なし', () => {
  test('F13: 問題が変わっても、画面の構造 (クラス名の集合) は同じ', async ({ page }) => {
    const classes = async (query: string, t: (typeof ALL)[number]) => {
      await open(page, query);
      await show(page, t);
      return page.locator('article.screen').evaluate((a) => [...new Set([a, ...a.querySelectorAll('*')].flatMap((e) => [...e.classList]))].sort());
    };
    for (const t of ALL) {
      const a = await classes('?problem=normal', t);
      expect(await classes('?problem=full', t), t.id).toEqual(a);
      expect(await classes('?problem=oku', t), t.id).toEqual(a);
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
    for (const t of ALL) await show(page, t);
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

test.describe('C1〜C7: IR スライドの内容', () => {
  const cell = (page: Page, path: string) => page.locator(`[data-path="${path}"]`);
  test('基準問題の IR の数字・文章・行の名前', async ({ page }) => {
    await open(page);
    await show(page, IR[0]);
    await expect(cell(page, 'ir.highlights.netSales.amount')).toHaveText('12,400');
    await expect(cell(page, 'ir.highlights.netSales.changeRate')).toHaveText('5.1%');
    await expect(cell(page, 'ir.statements.0')).toHaveText('売上高・営業利益ともに前期を上回った。');
    await expect(page.locator('[data-item-key="ir.highlights.netSales"]')).toHaveText('売上高');
    await show(page, IR[3]);
    await expect(cell(page, 'ir.outlook.subsequentEvent')).toHaveText('該当なし');
    await expect(page.locator('[data-item-key="ir.outlook.netSalesChangeRate"]')).toBeVisible();
    await show(page, IR[4]);
    await expect(cell(page, 'ir.supplement.capex.previous')).toHaveText('－');
  });

  test('グラフ: 棒の高さの割合・題・軸の下端の見出しと値', async ({ page }) => {
    await open(page);
    await show(page, IR[1]);
    const bars = page.locator('[data-path^="ir.results.chart.netSales."].bar');
    await expect(bars).toHaveCount(2);
    expect(await bars.evaluateAll((els) => els.map((e) => e.getAttribute('data-fraction')))).toEqual(['0.9516', '1']);
    const heights = await bars.locator('.bar-rect').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));
    expect(heights).toEqual([95, 100]);
    await expect(page.locator('[data-item-key="ir.results.chart.netSales"]')).toBeVisible();
    await expect(page.locator('[data-item-key="ir.results.chart.netSales.axisMin"]')).toBeVisible();
    await expect(cell(page, 'ir.results.chart.netSales.axisMin')).toHaveText('0');
    // 下端を切ると差が大きく見える (棒の高さが変わる)
    await page.evaluate(() => {
      const p = structuredClone(window.__viewerDemo.state.problem);
      p.ir.results.chart.netSales.axisMin = 10000;
      window.__viewerDemo.set({ problem: p, view: { doc: 'ir', screen: 'results' } });
    });
    expect(await bars.locator('.bar-rect').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))))).toEqual([75, 100]);
  });

  test('億円版: IR の金額は小数第一位、単位は 億円', async ({ page }) => {
    await open(page, '?problem=oku');
    await show(page, IR[1]);
    await expect(cell(page, 'ir.results.netSales.current')).toHaveText('124.0');
    await expect(cell(page, 'ir.header.unit')).toHaveText('億円');
  });

  test('セグメント: 3 セグメントは節が 3 つ。名前のセルがある', async ({ page }) => {
    await open(page, '?problem=full');
    await show(page, IR[2]);
    await expect(page.locator('.sec-name[data-path^="ir.segments.items."]')).toHaveCount(3);
  });
});

// ── 道具 (Sub-task #65): 印・検算・強調・道具バー (F6〜F12・F15・F16・E10・E11) ──
const marked = (page: Page) => page.locator('[data-marked="true"]');
const key = (page: Page, path: string) => page.locator(`[data-path="${path}"]`);
const keys = (page: Page) => page.evaluate(() => window.__viewerDemo.state.marks);
const turnOn = (page: Page) => page.getByRole('button', { name: '印', exact: true }).click();
const calcLines = (page: Page) => page.locator('.calc-line').allTextContents();

test.describe('F6・F7: 印', () => {
  test('F6: スイッチが切れている間は押しても印が付かず onToggleMark も呼ばれない', async ({ page }) => {
    await open(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await expect(marked(page)).toHaveCount(0);
    expect((await events(page)).filter((e) => e.type === 'mark')).toEqual([]);
    await expect(key(page, 'tanshin.summary.netSales.current')).not.toHaveAttribute('role', 'button');
  });

  test('F6: スイッチを入れると押せる要素 (role=button・tabindex・aria-pressed)。押すと付き、もう一度で外れる', async ({ page }) => {
    await open(page);
    await turnOn(page);
    const cell = key(page, 'tanshin.summary.netSales.current');
    await expect(cell).toHaveAttribute('role', 'button');
    await expect(cell).toHaveAttribute('tabindex', '0');
    await expect(cell).toHaveAttribute('aria-pressed', 'false');
    await cell.click();
    await expect(cell).toHaveAttribute('data-marked', 'true');
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(await keys(page)).toEqual(['tanshin.summary.netSales.current']);
    await cell.click();
    await expect(cell).not.toHaveAttribute('data-marked', 'true');
    expect(await keys(page)).toEqual([]);
  });

  test('F6: 行の名前・見出し・単位・文章・グラフの棒にも印を付けられる。行の名前のキーは <doc>.item:<項目キー>', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await page.locator('[data-item-key="tanshin.summary.netSales"]').click();
    await key(page, 'tanshin.header.companyName').click();
    await key(page, 'tanshin.header.unit').click();
    expect(await keys(page)).toEqual(['tanshin.item:tanshin.summary.netSales', 'tanshin.header.companyName', 'tanshin.header.unit']);
    await page.getByRole('button', { name: '次へ' }).click();
    await show(page, IR[0]);
    await key(page, 'ir.statements.0').click();
    await show(page, IR[1]);
    await key(page, 'ir.results.chart.netSales.current').click();
    await page.locator('[data-item-key="ir.results.chart.netSales.axisMin"]').click();
    expect((await keys(page)).slice(3)).toEqual(['ir.statements.0', 'ir.results.chart.netSales.current', 'ir.item:ir.results.chart.netSales.axisMin']);
  });

  test('F6: Enter・Space でも付け外しできる', async ({ page }) => {
    await open(page);
    await turnOn(page);
    const cell = key(page, 'tanshin.summary.netSales.current');
    await cell.focus();
    await page.keyboard.press('Enter');
    expect(await keys(page)).toEqual(['tanshin.summary.netSales.current']);
    await page.keyboard.press('Space');
    expect(await keys(page)).toEqual([]);
  });

  test('F7: スイッチを切ると印は残るが押せなくなる (role・tabindex・aria-pressed は外れる)。スイッチは aria-pressed', async ({ page }) => {
    await open(page);
    const sw = page.getByRole('button', { name: '印', exact: true });
    await expect(sw).toHaveAttribute('aria-pressed', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-pressed', 'true');
    const cell = key(page, 'tanshin.summary.netSales.current');
    await cell.click();
    await sw.click();
    await expect(sw).toHaveAttribute('aria-pressed', 'false');
    await expect(cell).toHaveAttribute('data-marked', 'true');
    await expect(cell).not.toHaveAttribute('role', 'button');
    await cell.click();
    expect(await keys(page)).toEqual(['tanshin.summary.netSales.current']);
  });

  test('印は画面を移っても残る (marks は props の持ち主が持つ)', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await show(page, TANSHIN[1]);
    await expect(marked(page)).toHaveCount(0);
    await show(page, TANSHIN[0]);
    await expect(key(page, 'tanshin.summary.netSales.current')).toHaveAttribute('data-marked', 'true');
  });
});

test.describe('F8・E10・E11: 検算', () => {
  test('E10・E11: 印が 0・1 個のとき、スイッチが入っていれば案内、切れていれば何も出ない', async ({ page }) => {
    await open(page);
    expect(await calcLines(page)).toEqual([]);
    await turnOn(page);
    expect(await calcLines(page)).toEqual(['2 つ選ぶと検算できます']);
    await key(page, 'tanshin.summary.netSales.current').click();
    expect(await calcLines(page)).toEqual(['2 つ選ぶと検算できます']);
  });

  test('F8: 印を 2 つ付けると 差・比 の 2 行 (問題の値から計算した値)', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await key(page, 'tanshin.summary.netSales.previous').click();
    expect(await calcLines(page)).toEqual(['差 600', '比 1.05']);
  });

  test('F8: 3 つ目を付けると直近の 2 つが対象 (別の画面の印も使える)', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await key(page, 'tanshin.summary.netSales.previous').click();
    await show(page, TANSHIN[2]);
    await key(page, 'tanshin.incomeStatement.current.netSales').click();
    expect(await calcLines(page)).toEqual(['差 600', '比 1.05']); // previous (11,800) と current (12,400)
    await key(page, 'tanshin.incomeStatement.current.operatingIncome').click();
    expect(await calcLines(page)).toEqual(['差 11,160', '比 10.00']); // 売上高 12,400 と 営業利益 1,240 (表示の順で売上高が A)
  });

  test('F8: 単位の違う組・数字でない組は 1 行', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await key(page, 'tanshin.summary.netSales.changeRate').click();
    expect(await calcLines(page)).toEqual(['比べられない (単位が違う)']);
    await page.locator('[data-item-key="tanshin.summary.netSales"]').click();
    expect(await calcLines(page)).toEqual(['比べられない (数字ではない)']);
  });

  test('F8: 億円と百万円は比べられない (表示の単位で決める)', async ({ page }) => {
    await open(page, '?problem=oku');
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await show(page, IR[0]);
    await key(page, 'ir.highlights.netSales.amount').click();
    expect(await calcLines(page)).toEqual(['比べられない (単位が違う)']);
  });
});

test.describe('F9・F10: 道具バー', () => {
  for (const width of [320, 360, 375, 414]) {
    test(`F9: 幅 ${width}px で道具バーは折り返さず 61px 以下。10 桁の検算でも高さが変わらず、文字が欠けない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await open(page, '?problem=full&judge=1');
      const bar = page.locator('.toolbar');
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(61);
      await turnOn(page);
      const h0 = (await bar.boundingBox())!.height;
      await page.evaluate(() => {
        const p = structuredClone(window.__viewerDemo.state.problem);
        p.tanshin.balanceSheet.current.cash = 1234567890;
        p.tanshin.balanceSheet.previous.cash = -1;
        window.__viewerDemo.set({ problem: p, view: { doc: 'tanshin', screen: 'balanceSheet' } });
      });
      await key(page, 'tanshin.balanceSheet.current.cash').click();
      await key(page, 'tanshin.balanceSheet.previous.cash').click();
      expect(await calcLines(page)).toEqual(['差 1,234,567,891', '比 △1,234,567,890.00']);
      const box = (await bar.boundingBox())!;
      expect(box.height).toBe(h0);
      expect(box.height).toBeLessThanOrEqual(61);
      for (const el of await page.locator('.calc-line').all()) expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      const sw = (await page.getByRole('button', { name: '印', exact: true }).boundingBox())!;
      expect(sw.width).toBeGreaterThanOrEqual(44);
      expect(sw.height).toBeGreaterThanOrEqual(44);
      const judge = (await page.getByRole('button', { name: '判定する' }).boundingBox())!;
      expect(judge.height).toBeGreaterThanOrEqual(44);
      expect(judge.x + judge.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeCloseTo(700, 0); // 画面の下に固定
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test('F10: 右端のボタンを押しても、ビューアは何も起こさない (渡した側のハンドラだけが動く)', async ({ page }) => {
    await open(page, '?judge=1');
    await page.getByRole('button', { name: '判定する' }).click();
    expect((await events(page)).map((e) => e.type)).toEqual(['judge']);
    expect(await screenId(page)).toBe('summary');
  });

  test('F10: toolbarEnd を渡さなければ右端は空', async ({ page }) => {
    await open(page);
    await expect(page.locator('.toolbar-end *')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '判定する' })).toHaveCount(0);
  });
});

test.describe('F11: 行の高さ', () => {
  test('F11: スイッチが切れている間は詰めた行、入れると押せる要素は 44px 以上', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await open(page);
    await show(page, TANSHIN[1]);
    const rowHeight = () => page.locator('tr.row').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(await rowHeight()).toBeLessThan(40);
    await turnOn(page);
    for (const h of await page.locator('[role="button"][data-path], [role="button"][data-item-key]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
      expect(h).toBeGreaterThanOrEqual(43.9);
    }
    expect(await rowHeight()).toBeGreaterThanOrEqual(44);
  });

  test('F11: 切り替えても、見ていた行の画面上の位置が ±2px の中で保たれる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await open(page);
    await show(page, TANSHIN[1]);
    for (const pos of [400, 700]) {
      await page.evaluate((y) => window.scrollTo(0, y), pos);
      const edge = await page.locator('.viewer-top').evaluate((e) => e.getBoundingClientRect().bottom);
      const rows = await page.locator('tr.row').evaluateAll((els, e) => els.map((el) => [el.querySelector('[data-item-key]')?.getAttribute('data-item-key'), el.getBoundingClientRect().top, el.getBoundingClientRect().bottom] as const).filter(([, , b]) => (b as number) > (e as number) + 1)[0], edge);
      const topOf = (k: string) => page.locator(`[data-item-key="${k}"]`).evaluate((e) => e.closest('tr')!.getBoundingClientRect().top);
      const before = await topOf(rows![0] as string);
      await turnOn(page);
      expect(Math.abs((await topOf(rows![0] as string)) - before)).toBeLessThanOrEqual(2);
      await turnOn(page);
      expect(Math.abs((await topOf(rows![0] as string)) - before)).toBeLessThanOrEqual(2);
    }
  });
});

test.describe('F12: 強調', () => {
  test('F12: highlights の場所の要素に data-highlight。別の画面に切り替えても、その画面の該当要素に付く。渡さなければ付かない', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(0);
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [{ doc: 'tanshin', path: 'summary.netSales.current' }, { doc: 'tanshin', path: 'incomeStatement.current.ordinaryIncome' }] }));
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(1);
    await expect(key(page, 'tanshin.summary.netSales.current')).toHaveAttribute('data-highlight', 'true');
    await show(page, TANSHIN[2]);
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(1);
    await expect(key(page, 'tanshin.incomeStatement.current.ordinaryIncome')).toHaveAttribute('data-highlight', 'true');
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [] }));
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(0);
  });

  test('F12: itemKey の場所は行の名前の要素だけ、path の途中の場所は子孫のセル全部', async ({ page }) => {
    await open(page);
    await show(page, TANSHIN[1]);
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [{ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.cash' }] }));
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(1);
    await expect(page.locator('[data-item-key="tanshin.balanceSheet.cash"]')).toHaveAttribute('data-highlight', 'true');
    await show(page, IR[2]);
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [{ doc: 'ir', path: 'segments.items.0.netSales' }] }));
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(3);
    await show(page, IR[0]);
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [{ doc: 'ir', path: 'statements.0.text' }, { doc: 'tanshin', path: 'header.companyName' }] }));
    await expect(key(page, 'ir.statements.0')).toHaveAttribute('data-highlight', 'true');
    await expect(page.locator('[data-highlight="true"]')).toHaveCount(1); // IR の画面に短信の見出しは無い
  });

  test('F12: 枠で見える (色だけでなく太い枠線)。印と強調は重なっても両方見える', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await page.evaluate(() => window.__viewerDemo.set({ highlights: [{ doc: 'tanshin', path: 'summary.netSales.current' }] }));
    const style = await key(page, 'tanshin.summary.netSales.current').evaluate((e) => {
      const c = getComputedStyle(e);
      return { outline: c.outlineWidth, outlineStyle: c.outlineStyle, shadow: c.boxShadow };
    });
    expect(style.outlineStyle).toBe('solid');
    expect(parseFloat(style.outline)).toBeGreaterThanOrEqual(3);
    expect(style.shadow).not.toBe('none');
  });
});

test.describe('F15・F16: check モードと使い回し', () => {
  test('F15: mode=check は道具バーも検算も出ない。印は表示だけで、押しても onToggleMark は呼ばれない。タブは動く', async ({ page }) => {
    await open(page);
    await turnOn(page);
    await key(page, 'tanshin.summary.netSales.current').click();
    await key(page, 'tanshin.summary.netSales.previous').click();
    await page.evaluate(() => window.__viewerDemo.set({ mode: 'check' }));
    await expect(page.locator('.toolbar')).toBeHidden();
    await expect(key(page, 'tanshin.summary.netSales.current')).toHaveAttribute('data-marked', 'true');
    await expect(key(page, 'tanshin.summary.netSales.current')).not.toHaveAttribute('role', 'button');
    const before = (await events(page)).filter((e) => e.type === 'mark').length;
    await key(page, 'tanshin.summary.netSales.current').click();
    await key(page, 'tanshin.summary.netSales.changeRate').click();
    expect((await events(page)).filter((e) => e.type === 'mark').length).toBe(before);
    await page.getByRole('tab', { name: '貸借', exact: true }).click();
    expect(await screenId(page)).toBe('balanceSheet');
    await page.evaluate(() => window.__viewerDemo.set({ mode: 'read' }));
    await expect(page.locator('.toolbar')).toBeVisible();
    expect(await calcLines(page)).toEqual(['差 600', '比 1.05']);
  });

  test('F15: ?mode=check で始めると道具バーは最初から出ない', async ({ page }) => {
    await open(page, '?mode=check&judge=1');
    await expect(page.locator('.toolbar')).toBeHidden();
    await expect(page.getByRole('button', { name: '判定する' })).toBeHidden();
  });

  test('F16: 同じ problem・view の update は画面の要素を作り直さない (スイッチ・読み済・スクロールが残る)。problem が変わると戻る', async ({ page }) => {
    await open(page);
    await show(page, TANSHIN[1]);
    await turnOn(page);
    const article = await page.locator('article.screen').elementHandle();
    await page.evaluate(() => window.__viewerDemo.set({ marks: ['tanshin.balanceSheet.current.cash'], highlights: [{ doc: 'tanshin', path: 'balanceSheet.current.cash' }] }));
    expect(await article!.evaluate((e) => e.isConnected)).toBe(true);
    await expect(page.getByRole('button', { name: '印', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('tab', { name: '貸借', exact: true })).toHaveAttribute('data-visited', 'true');
    await page.evaluate(() => window.__viewerDemo.set({ problem: structuredClone(window.__viewerDemo.state.problem) }));
    expect(await article!.evaluate((e) => e.isConnected)).toBe(false);
    await expect(page.getByRole('tab', { name: 'サマリー', exact: true })).not.toHaveAttribute('data-visited', 'true');
  });
});
