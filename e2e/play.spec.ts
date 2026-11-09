// 受け入れ条件 2・3 (S4〜S9b・S11・S11b)・S6・S6 の桁マス。ケース表 docs/test-cases/screens-v3.md §2.2・§2.3。
import { expect, test } from '@playwright/test';
import { answerRound, correct, recordsOf, REJECT_WAIT, roundsFor, seal, start, tap } from './support';

const SEED = 21;

test('S4・S5: 0 社目は「記入例」つきのカードと掲示 1 行。札は無く「1 社目へ」だけ。1 社目に札 2 つ・点検欄・「あと 8 社」', async ({ page }) => {
  await start(page, SEED);
  await expect(page.getByTestId('card')).toHaveCount(1);
  await expect(page.getByText('記入例')).toBeVisible();
  await expect(page.getByText('これがいつも通り')).toBeVisible();
  await expect(page.getByRole('button', { name: 'いつも通り', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '異変あり', exact: true })).toHaveCount(0);
  await tap(page, '1 社目へ');
  await expect(page.getByTestId('progress')).toHaveText('1 社目 / あと 8 社');
  await expect(page.getByTestId('boxes').locator('li')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'いつも通り', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '異変あり', exact: true })).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const w of ['印', '検算', '閲覧票', 'バグ', 'エラー']) expect(text).not.toContain(w);
});

test('S6: やさしいのカードは数字 4 つ・言い換え・桁マスにカンマの字', async ({ page }) => {
  await start(page, SEED);
  await tap(page, '1 社目へ');
  const card = page.getByTestId('card');
  await expect(card.locator('[data-slot]')).toHaveCount(4);
  await expect(card).toContainText('売上高から費用を引いた残り');
  const sales = card.locator('[data-slot="sales"] .field');
  const chars = await sales.evaluate((f) => [...f.children].map((c) => c.textContent ?? '').join(''));
  expect(chars).toMatch(/^\d{1,3}(,\d{3})+$|^\d{1,3}$/); // 左の空きマスは空の文字。残りは桁とカンマ
  expect(chars).toContain(',');
});

test('S7: むずかしいはカード + 資料 1・2。言い換えは出ない。札は画面内', async ({ page }) => {
  await start(page, SEED, 'hard');
  await tap(page, '1 社目へ');
  await expect(page.getByTestId('card').locator('[data-slot]')).toHaveCount(4);
  await expect(page.getByTestId('docs')).toBeVisible();
  await expect(page.getByTestId('docs').locator('[data-slot]').first()).toBeVisible();
  await expect(page.getByTestId('card')).not.toContainText('売上高から費用を引いた残り');
  await expect(page.getByRole('button', { name: 'いつも通り', exact: true })).toBeInViewport();
});

test('S8・S9・S9b: 8 社とも正しく答えるとクリア。進み具合の言葉。もう一度・別の難易度', async ({ page }) => {
  await start(page, SEED);
  const rounds = roundsFor(SEED, 'easy', 0);
  await tap(page, '1 社目へ');
  const want = (n: number) => (n === 8 ? '8 社目 / ラスト' : `${n} 社目 / あと ${9 - n} 社`);
  for (let i = 1; i <= 8; i++) {
    await expect(page.getByTestId('progress')).toHaveText(want(i));
    await answerRound(page, rounds[i - 1]!);
    await expect(page.getByTestId('verdict')).toHaveText('正解');
    await tap(page, i === 8 ? '完了票へ' : '次へ');
  }
  const cleared = page.getByTestId('cleared');
  await expect(cleared).toBeVisible();
  await expect(cleared.locator('li')).toHaveCount(8);
  await expect(cleared).toContainText(/見つけた異変 \d+ \/ \d+/);
  await expect(cleared).toContainText('むずかしい'); // やさしいをクリアしたときだけ、むずかしいを勧める 1 行
  const rec = await recordsOf(page);
  expect(rec.easy.clears).toBe(1);
  await tap(page, 'もう一度');
  await expect(page.getByTestId('progress')).toContainText('0 社目');
  await tap(page, '難易度を変える');
  await page.getByRole('button', { name: 'むずかしい' }).click();
  await expect(page.getByTestId('progress')).toContainText('0 社目');
});

test('S9c: 「今回 + k」は、最後の周 (BEGIN から) で新しく見つけた種類だけ。前の周で見つけた種類・読み直す前の分も、周の中なら数える', async ({ page }) => {
  const SEED = 21;
  const first = roundsFor(SEED, 'easy', 0);
  await start(page, SEED);
  await tap(page, '1 社目へ');
  // 1 周目: 1 社目を正しく答えて、2 社目でわざと間違える (1 社目の異変の種類があれば、それは前の周で見つけた種類)
  await answerRound(page, first[0]!);
  await tap(page, '次へ');
  await answerRound(page, first[1]!, false);
  await expect(page.getByTestId('progress')).toContainText('0 社目', { timeout: REJECT_WAIT });
  const before = (await recordsOf(page)).easy;
  // 2 周目: 8 社とも正しく答える。途中 (4 社目) でページを読み直す
  const second = roundsFor(SEED, 'easy', 1, { easy: before, hard: (await recordsOf(page)).hard });
  await tap(page, '1 社目へ');
  for (let i = 0; i < 8; i++) {
    if (i === 3) { await page.reload(); await expect(page.getByTestId('progress')).toContainText('4 社目'); }
    await answerRound(page, second[i]!);
    await tap(page, i === 7 ? '完了票へ' : '次へ');
  }
  const kindsOf = (rs: typeof second) => new Set(rs.flatMap((r) => (r.problem.anomaly ? [r.problem.anomaly.kind] : [])));
  const k = [...kindsOf(second)].filter((x) => !before.kinds.includes(x)).length; // 2 周目の周で、前の周までに無かった種類
  const text = await page.getByTestId('cleared').innerText();
  if (k > 0) expect(text).toContain(`今回 + ${k}`);
  else expect(text).not.toContain('今回 +');
});

test('S11: 差し戻しで「すぐ 0 社目へ」。動きを減らす設定でも同じ流れ', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page, SEED);
  const rounds = roundsFor(SEED, 'easy', 0);
  await tap(page, '1 社目へ');
  await answerRound(page, rounds[0]!, false);
  expect(await page.getByTestId('card').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await tap(page, 'すぐ 0 社目へ');
  await expect(page.getByTestId('progress')).toContainText('0 社目');
});

test('S11b: 札を続けて 2 回たたいても答えは 1 回。同じ位置の「次へ」は押されない', async ({ page }) => {
  await start(page, SEED);
  const rounds = roundsFor(SEED, 'easy', 0);
  await tap(page, '1 社目へ');
  const s = seal(page, correct(rounds[0]!));
  await s.click();
  await page.locator('footer').getByRole('button', { name: '次へ', exact: true }).click({ timeout: 50 }).catch(() => undefined); // 250 ms 以内の「次へ」は効かない
  await expect(page.getByTestId('progress')).toContainText('1 社目');
  await expect(page.getByTestId('verdict')).toHaveText('正解');
  expect((await recordsOf(page)).easy.history).toHaveLength(1);
  await page.waitForTimeout(400);
  await tap(page, '次へ');
  await expect(page.getByTestId('progress')).toContainText('2 社目');
});
