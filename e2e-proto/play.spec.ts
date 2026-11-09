// 受け入れ条件 2・3・4 (docs/requirements.md): 0 社目 → 8 枚 → 判定 → 答え合わせ → 間違えたら 0 社目 → 1 タップで再開。
import { expect, test } from '@playwright/test';
import { drawRun } from '../src/proto/draw';
import { answer, HARD_NORMALS, NORMALS, REJECT_WAIT } from './support';

const SEED = 21;

test('0 社目 (見本) が毎周の最初に出る: 1 枚の記入例と、8 つの点検欄', async ({ page }) => {
  await page.goto(`/proto.html?seed=${SEED}`);
  await expect(page.locator('.checks .now')).toContainText('0 社目');
  await expect(page.locator('.boxes li')).toHaveCount(8);
  await expect(page.locator('.slip')).toHaveCount(1);
  await expect(page.locator('.slip .example-stamp')).toHaveCount(1);
  await expect(page.locator('.slip')).toHaveAttribute('data-difficulty', 'easy');
  await expect(page.locator('.doc')).toHaveCount(0);
  // 見本は押せる札が無く、「1 社目へ」だけ (飛ばせない見本。判定の札は無い)
  await expect(page.getByRole('button', { name: /いつも通り|異変あり/ })).toHaveCount(0);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await expect(page.locator('.checks .now')).toContainText('1 社目');
  await expect(page.getByRole('button', { name: /いつも通り/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /異変あり/ })).toBeVisible();
});

test('8 社連続で正しく答えるとクリア。答え合わせで、異変があった問題は場所と内容が出る', async ({ page }) => {
  const rounds = drawRun(SEED, NORMALS);
  await page.goto(`/proto.html?seed=${SEED}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    const r = rounds[i]!;
    await expect(page.locator('.checks .now')).toContainText(`${i + 1} 社目`);
    await expect(page.locator('.slip')).toHaveAttribute('data-difficulty', 'easy');
    await answer(page, r.anomaly !== null);
    await expect(page.locator('.verdict.ok')).toHaveText('正解');
    await expect(page.locator('.slip .stamp')).toHaveText(r.anomaly ? '訂正' : '確認');
    if (r.anomaly) {
      await expect(page.locator('.note')).toContainText(r.anomaly.explanation);
      expect(await page.locator('.slip .marked').count(), `${r.anomaly.kind} の場所が朱書きされる`).toBeGreaterThan(0);
    } else {
      await expect(page.getByText('異変はありませんでした。')).toBeVisible();
      await expect(page.locator('.slip .marked')).toHaveCount(0);
    }
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ' }).click();
  }
  await expect(page.locator('.checks .now')).toHaveText('完了');
  await expect(page.locator('.done-list li')).toHaveCount(8);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('.checks .now')).toContainText('0 社目');
});

test('間違えると、ひと呼吸の演出のあと自動で 0 社目に戻り、1 タップで再開できる (さっきの異変が残る)', async ({ page }) => {
  const first = drawRun(SEED, NORMALS);
  const next = drawRun(SEED + 1 * 7919, NORMALS);
  await page.goto(`/proto.html?seed=${SEED}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  // 1 社目を正解して、2 社目でわざと間違える
  await answer(page, first[0]!.anomaly !== null);
  await page.getByRole('button', { name: '次へ' }).click();
  const miss = first[1]!;
  await answer(page, miss.anomaly === null); // 逆を押す
  await expect(page.locator('.verdict.ng')).toHaveText('不正解');
  await expect(page.locator('.slip.rejected')).toHaveCount(1);
  await expect(page.getByText('差し戻し')).toBeVisible();
  // 演出のあと自動で 0 社目へ
  await expect(page.locator('.checks .now')).toContainText('0 社目', { timeout: REJECT_WAIT });
  await expect(page.locator('.note')).toContainText(miss.anomaly ? miss.anomaly.explanation : 'さっきの伝票には、異変はありませんでした。');
  // 1 タップで 1 社目へ。出題は新しくなる
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await expect(page.locator('.checks .now')).toContainText('1 社目');
  await expect(page.locator('.slip')).toHaveAttribute('data-difficulty', 'easy');
  await expect(page.locator('.slip .row').first()).toBeVisible();
  void next;
});

test('「すぐ 0 社目へ」で演出を飛ばせる', async ({ page }) => {
  const rounds = drawRun(SEED, NORMALS);
  await page.goto(`/proto.html?seed=${SEED}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await answer(page, rounds[0]!.anomaly === null);
  await page.getByRole('button', { name: 'すぐ 0 社目へ' }).click();
  await expect(page.locator('.checks .now')).toContainText('0 社目');
});

test('動きを減らす設定: 押印・差し戻しの動きは無く、同じ流れで 0 社目に戻る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rounds = drawRun(SEED, NORMALS);
  await page.goto(`/proto.html?seed=${SEED}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  await answer(page, rounds[0]!.anomaly === null);
  expect(await page.locator('.slip.rejected').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  expect(await page.locator('.stamp').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await expect(page.locator('.checks .now')).toContainText('0 社目', { timeout: REJECT_WAIT });
});

test('外部への通信をしない', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname !== '127.0.0.1') external.push(req.url());
  });
  await page.goto(`/proto.html?seed=${SEED}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  expect(external).toEqual([]);
});

test('むずかしい: 見本はカード + 資料 1・2。8 社連続で正しく答えるとクリアできる', async ({ page }) => {
  const rounds = drawRun(SEED, HARD_NORMALS, { difficulty: 'hard' });
  await page.goto(`/proto.html?seed=${SEED}&difficulty=hard`);
  await expect(page.locator('.slip')).toHaveCount(1);
  await expect(page.locator('.slip')).toHaveAttribute('data-difficulty', 'hard');
  await expect(page.locator('.doc')).toHaveCount(2);
  await expect(page.locator('.doc .row')).toHaveCount(23); // 資料: 数字 15 + 文 8 (カードの 4 欄は伝票の側)
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    const r = rounds[i]!;
    await expect(page.locator('.checks .now')).toContainText(`${i + 1} 社目`);
    await expect(page.locator('.doc')).toHaveCount(2);
    await answer(page, r.anomaly !== null);
    await expect(page.locator('.verdict.ok')).toHaveText('正解');
    if (r.anomaly) {
      await expect(page.locator('.note')).toContainText(r.anomaly.explanation);
      expect(await page.locator('.slip .marked, .doc .marked').count(), `${r.anomaly.kind} の場所が朱書きされる`).toBeGreaterThan(0);
    }
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ' }).click();
  }
  await expect(page.locator('.checks .now')).toHaveText('完了');
});

test('見え方の一覧 (?mode=gallery): E-21・E-22・E-24〜E-28 の全部が並び、朱書きを出せる。横にはみ出さない', async ({ page }) => {
  await page.goto('/proto.html?mode=gallery');
  await expect(page.locator('.gallery-item')).toHaveCount(13); // 正常 1 + 12 の見え方
  for (const v of ['E-21 no-comma', 'E-21 comma-shift', 'E-22 数字の欄', 'E-22 見出し語', 'E-24', 'E-25', 'E-26 当期の欄を前期に', 'E-26 前期の欄を当期に', 'E-27 売上高', 'E-27 営業利益 (前期)', 'E-27 営業利益 (当期)', 'E-28']) {
    await expect(page.locator(`.gallery-item[data-variant="${v}"]`)).toHaveCount(1);
  }
  await expect(page.locator('.gallery-item[data-variant="E-22 数字の欄"] .row')).toHaveCount(5);
  await expect(page.locator('.gallery-item[data-variant="E-25"] .row').first().locator('.cell.neg')).toHaveText('△');
  await expect(page.locator('.gallery-item[data-variant="E-28"] .period-end')).toContainText('32日');
  await expect(page.locator('.slip .marked')).toHaveCount(0);
  await page.getByLabel('朱書き (答え合わせ) を出す').check();
  expect(await page.locator('.slip .marked').count()).toBeGreaterThanOrEqual(12);
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth }));
  expect(w.doc).toBeLessThanOrEqual(w.view);
});

test('桁区切りはカンマの字で出る (96,930)。E-21 no-comma はカンマが無い', async ({ page }) => {
  await page.goto('/proto.html?mode=gallery');
  const sales = (variant: string) => page.locator(`.gallery-item[data-variant="${variant}"] .row[data-slot="sales"] .field`).first().evaluate((f) => [...f.children].map((c) => c.textContent).join(''));
  expect(await sales('正常')).toBe('96,930');
  expect(await sales('E-21 no-comma')).toBe('96930');
  expect(await sales('E-21 comma-shift')).toBe('9,6930');
});

test('読む時間 (?mode=read): むずかしい 8 社を通すと、秒数つきの記録と集計が出る', async ({ page }) => {
  const rounds = drawRun(5, HARD_NORMALS, { difficulty: 'hard' });
  await page.goto('/proto.html?mode=read&difficulty=hard&seed=5&pid=T1');
  await page.getByRole('button', { name: '見本を見る' }).click();
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.locator('.checks .now')).toContainText(`${i + 1} 社目`);
    await answer(page, rounds[i]!.anomaly !== null);
    await page.getByRole('button', { name: i === 7 ? '記録を見る' : '次へ' }).click();
  }
  const text = await page.getByLabel('読む時間の記録').inputValue();
  expect(text).toContain('参加者: T1');
  expect(text).toContain('難易度: むずかしい');
  expect(text.split('\n').filter((l) => /^\d+: (有|無) (normal|anomaly) [\d.]+$/.test(l))).toHaveLength(8);
  await expect(page.locator('.record.out')).toContainText('むずかしい 全部: 8 社');
});
