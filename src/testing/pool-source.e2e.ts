// E2E (`npm run build:e2e`) 用の問題の取り込み。src/data/pool-source.ts の代わりに、vite.config.ts が差し替える。本番のバンドルには入れない。
import type { Sample } from '../domain/sample';
import type { AnomalyKind, Company, Problem } from '../domain/types';
import { TEST_KINDS, makeCompanies, makePool, makeProblem } from './fixtures';

export const problems: Problem[] = [makePool({ difficulty: 'easy', companies: 12 }), makePool({ difficulty: 'hard', companies: 12 })].flat();
export const companies: Company[] = makeCompanies(12);
export const kinds: AnomalyKind[] = TEST_KINDS;
export const sample: Sample = { problem: makeProblem({ id: 'sample', difficulty: 'easy', companyId: 'sample' }) };
