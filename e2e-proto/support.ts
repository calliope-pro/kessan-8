// 試作の E2E の共通部品。問題データはディスクから読み、アプリと同じ出題 (drawRun) で「正しい答え」を求める。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Problem } from '../src/domain/types';

const dir = join(import.meta.dirname, '../src/data/problems/easy');
export const NORMALS: Problem[] = readdirSync(dir)
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Problem)
  .filter((p) => p.anomaly === null);

export const REJECT_WAIT = 4000;

/** 1 社ぶん答える: truth が異変あり (true) なら「異変あり」を押す。 */
export async function answer(page: Page, hasAnomaly: boolean): Promise<void> {
  await page.getByRole('button', { name: hasAnomaly ? /異変あり/ : /いつも通り/ }).click();
}
