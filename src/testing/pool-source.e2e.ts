// E2E (`npm run build:e2e`) 用の問題の取り込み。src/data/pool-source.ts の代わりに、vite.config.ts が差し替える。本番のバンドルには入れない。
import type { Sample } from '../domain/sample';
import type { AnomalyKind, Company, Problem } from '../domain/types';
import { FORM_KINDS, TEST_KINDS, makeCompanies, makeFormProblems, makePool, makeProblem } from './fixtures';

// `?e2ePool=thin` (E2E のビルドだけ): むずかしいの会社を 5 社にして、出題できない (canDraw が false) 難易度を作る (S22)。`none` は両方を 5 社にする (両方が準備中)
const pooled = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('e2ePool') : null;
const thin = pooled === 'thin' || pooled === 'none';
const easyCompanies = pooled === 'none' ? 5 : 12;
export const problems: Problem[] = [
  makePool({ difficulty: 'easy', companies: easyCompanies }),
  makeFormProblems('easy'),
  makePool({ difficulty: 'hard', companies: thin ? 5 : 12 }),
].flat();
export const companies: Company[] = makeCompanies(12);
export const kinds: AnomalyKind[] = [...TEST_KINDS, ...FORM_KINDS];
export const sample: Sample = { problem: makeProblem({ id: 'sample', difficulty: 'easy', companyId: 'c01' }) };
