// E2E の支援 (docs/test-cases/screens-v3.md §0)。アプリと同じ試験用プール・同じ draw・同じ種から、「その枠が異変か」を求める。
// 画面の約束 (E2E が頼る目印): 札・ボタンは role=button の名前そのもの (「いつも通り」「異変あり」「1 社目へ」「次へ」「完了票へ」「もう一度」「別の難易度」「難易度を変える」「すぐ 0 社目へ」「戻る」「記録」「やさしい」「むずかしい」)。
//   data-testid: progress (上端の「n 社目 / あと N 社」)・boxes (点検欄。li が 8)・card (カード)・stamp (押印の字)・verdict (正解/不正解)・note (答え合わせの文・さっきの異変)・cleared (完了票)・records (記録)。
//   カードの欄は [data-slot=<key>]、答え合わせで囲んだ場所は .marked。
import type { Locator, Page } from '@playwright/test';
import { ROUNDS_TO_CLEAR } from '../src/domain/config';
import { draw } from '../src/domain/draw';
import { emptyRecords, parseRecords, type Records } from '../src/domain/records';
import { mulberry32 } from '../src/domain/rng';
import type { Difficulty, Problem, Round } from '../src/domain/types';
import { problems as pool, kinds } from '../src/testing/pool-source.e2e';
import { drawSeed } from '../src/ui/seed';

export { kinds, pool };
export const RECORDS_KEY = 'kessan8.records';
export const REJECT_WAIT = 4000;

/** 1 回目 (title/difficulty → PICK) の出題は draws = 0、不正解のあとの出題は draws = 1 …。履歴と見つけた種類は、そのときの記録から。 */
export function roundsFor(seed: number, difficulty: Difficulty, draws: number, records: Records = emptyRecords()): Round[] {
  return draw(pool, { difficulty, rng: mulberry32(drawSeed(seed, draws)), history: records[difficulty].history, foundKinds: records[difficulty].kinds });
}

export async function recordsOf(page: Page): Promise<Records> {
  return parseRecords(await page.evaluate((k) => localStorage.getItem(k), RECORDS_KEY));
}

/** 走行 (sessionStorage) を消して、タイトルを開く。走行は読み直しても残るので、新しく始めるときは消す。 */
export async function fresh(page: Page, seed: number): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/?seed=${seed}`);
}

/** 難易度のボタンを押して 0 社目に着く。 */
export async function start(page: Page, seed: number, difficulty: Difficulty = 'easy'): Promise<void> {
  await fresh(page, seed);
  await page.getByRole('button', { name: difficulty === 'easy' ? 'やさしい' : 'むずかしい' }).click();
  await page.getByTestId('progress').filter({ hasText: '0 社目' }).waitFor();
}

/** 画面が替わった直後の約 250 ms は、札・ボタンが押せない (誤タップ防止。S11b)。押せるようになってから押す。 */
export async function tap(page: Page, name: string): Promise<void> {
  await page.locator('footer.actions:not(.arming)').waitFor();
  await page.getByRole('button', { name, exact: true }).click();
}

export const seal = (page: Page, anomaly: boolean): Locator => page.getByRole('button', { name: anomaly ? '異変あり' : 'いつも通り', exact: true });
export const correct = (r: Round): boolean => r.problem.anomaly !== null;

/** 1 社ぶん答える。ok = 正しく答える。 */
export async function answerRound(page: Page, r: Round, ok = true): Promise<void> {
  await page.locator('footer.actions:not(.arming)').waitFor();
  await seal(page, ok ? correct(r) : !correct(r)).click();
}

/** 種を 1 から回して、1 回目の出題のどこかに kind の問題が出る種と、何社目 (1 始まり) かを返す。 */
export function findSeed(kind: string, difficulty: Difficulty = 'easy'): { seed: number; index: number } {
  for (let seed = 1; seed < 5000; seed++) {
    const i = roundsFor(seed, difficulty, 0).findIndex((r) => r.problem.anomaly?.kind === kind);
    if (i >= 0) return { seed, index: i + 1 };
  }
  throw new Error(`${kind} が出る種が見つからない`);
}

/** 0 社目から n 社目 (1 始まり) まで、すべて正しく答えて進める。 */
export async function playTo(page: Page, rounds: Round[], n: number): Promise<void> {
  await tap(page, '1 社目へ');
  for (let i = 1; i < n; i++) {
    await answerRound(page, rounds[i - 1]!);
    await tap(page, '次へ');
    await page.getByTestId('progress').filter({ hasText: `${i + 1} 社目` }).waitFor(); // 次の社に着いてから
  }
}
export { ROUNDS_TO_CLEAR };
export type { Problem };
