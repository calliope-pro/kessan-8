// 試作の E2E の共通部品。問題データはディスクから読み、アプリと同じ出題 (drawRun) で「正しい答え」を求める。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Company, Problem } from '../src/domain/types';

const dir = join(import.meta.dirname, '../src/data/problems/easy');
export const NORMALS: Problem[] = readdirSync(dir)
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Problem)
  .filter((p) => p.anomaly === null);

/** buildDeck の 4 つ目の引数: アプリ本体と同じ見本 (src/data/samples) と会社。 */
export const DECK_REF: { sample: Problem; companies: Company[] } = {
  sample: (JSON.parse(readFileSync(join(import.meta.dirname, '../src/data/samples/sample.json'), 'utf8')) as { problem: Problem }).problem,
  companies: JSON.parse(readFileSync(join(import.meta.dirname, '../src/data/companies.json'), 'utf8')) as Company[],
};

export const REJECT_WAIT = 4000;

/** 1 社ぶん答える: truth が異変あり (true) なら「異変あり」を押す。 */
export async function answer(page: Page, hasAnomaly: boolean): Promise<void> {
  await page.getByRole('button', { name: hasAnomaly ? /異変あり/ : /いつも通り/ }).click();
}
