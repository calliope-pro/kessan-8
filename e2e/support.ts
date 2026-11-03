// 遊びの流れの E2E の道具 (docs/test-cases/flow.md)。出題は `?seed=N` で固定し、正解は data-problem-id から試験用のプール (npm run build:e2e が差し替えたもの) を引いて知る。
import { type Page, expect } from '@playwright/test';
import { draw } from '../src/domain/draw';
import { mulberry32 } from '../src/domain/rng';
import type { Difficulty, Problem } from '../src/domain/types';
import { makePool } from '../src/testing/fixtures';

const pools: Record<Difficulty, Problem[]> = {
  easy: makePool({ difficulty: 'easy', companies: 12 }),
  hard: makePool({ difficulty: 'hard', companies: 12 }),
};
const byId = new Map([...pools.easy, ...pools.hard].map((p) => [p.id, p]));

export const problemOf = (id: string): Problem => byId.get(id)!;

/** 空の保存の文脈で、種 N の 1 周目に出る 8 問 (画面と同じ出題)。 */
export const planOf = (seed: number, difficulty: Difficulty = 'easy'): Problem[] => draw(pools[difficulty], { difficulty, rng: mulberry32(seed) });

/** 1 社目が条件に合う種を探す。 */
export function seedWhere(first: (p: Problem) => boolean, difficulty: Difficulty = 'easy'): number {
  for (let seed = 1; seed < 500; seed++) if (first(planOf(seed, difficulty)[0]!)) return seed;
  throw new Error('条件に合う種が無い');
}

export const app = (page: Page) => page.getByTestId('app');
export const problemId = async (page: Page) => (await app(page).getAttribute('data-problem-id'))!;
export const answerLabel = (p: Problem, correct: boolean) => ((p.anomaly !== null) === correct ? '異変あり' : '異変なし');

/** タイトル → 難易度 → (見本は飛ばす) → 導入 → 資料を開く。reading で止まる。 */
export async function startGame(page: Page, seed: number, difficulty: Difficulty = 'easy'): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: difficulty === 'easy' ? 'やさしい' : 'むずかしい' }).click();
  if ((await app(page).getAttribute('data-screen')) === 'sample') await page.getByRole('button', { name: '飛ばす' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'intro');
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'reading');
}

/** 判定する → パネルで答える。revealed で止まる。 */
export async function judgeWith(page: Page, answer: '異変あり' | '異変なし'): Promise<void> {
  await page.getByTestId('judge').click();
  await page.getByRole('button', { name: answer }).click();
  await expect(app(page)).toHaveAttribute('data-phase', 'revealed');
}

/** 今の問題に、正解 (または不正解) の答えをする。 */
export async function answer(page: Page, correct: boolean): Promise<Problem> {
  const p = problemOf(await problemId(page));
  await judgeWith(page, answerLabel(p, correct));
  return p;
}

/** 正解して次の会社の資料を開く。 */
export async function nextCompany(page: Page): Promise<void> {
  await page.getByRole('button', { name: '次の会社へ' }).click();
  await page.getByRole('button', { name: '資料を開く' }).click();
  await expect(app(page)).toHaveAttribute('data-screen', 'reading');
}

export async function noHorizontalOverflow(page: Page, width: number): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, '横にはみ出さない').toBeLessThanOrEqual(width);
}

/** 'rgb(r, g, b)' / 'rgba(r, g, b, a)' → 相対輝度 (WCAG)。 */
function luminance(css: string): number {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
