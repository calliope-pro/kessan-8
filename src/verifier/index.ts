// 会計の整合の検証器 (Task #23)。入口は docs/test-cases/validator.md §0。
import type { Company, Problem } from '../domain/types.ts';
import { HARD_RULES, IR_DISPLAY_RULES, SOFT_RULES, runRules } from './rules/index.ts';
import type { Violation } from './rules/index.ts';

export { HARD_RULE_IDS, SOFT_RULE_IDS } from './rules/index.ts';
export type { Violation } from './rules/index.ts';
export { dividendAmount, roundHalfAway, scaled10, toIrUnit } from './math.ts';
export { getPath, numericCells } from './path.ts';

export interface VerifyResult {
  hard: Violation[];
  soft: Violation[];
}

/** 問題 1 件に、必須の規則 (hard) と参考の規則 (soft) を当てる。 */
export function verifyProblem(problem: Problem, company: Company): VerifyResult {
  const ctx = { p: problem, c: company };
  return { hard: runRules(HARD_RULES, ctx), soft: runRules(SOFT_RULES, ctx) };
}

/** 正常な問題だけに当てる: IR の比率が、IR の表示金額から検算した値にも一致するか (空 = 一致)。 */
export function verifyIrDisplay(problem: Problem, company: Company): Violation[] {
  return runRules(IR_DISPLAY_RULES, { p: problem, c: company });
}

export { checkAnomaly } from './anomaly.ts';
export { shapeErrors } from './shape.ts';
export { verifyDataset } from './dataset.ts';
export type { DatasetInput, DatasetResult, Entry } from './dataset.ts';
