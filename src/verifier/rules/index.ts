import { IR_DISPLAY_RULES } from './ir-display.ts';
import { IR_RULES } from './ir.ts';
import { LINK_RULES } from './links.ts';
import { NONNUMERIC_RULES } from './nonnumeric.ts';
import { SEGMENT_RULES } from './segments.ts';
import { SOFT_RULES } from './soft.ts';
import { STATEMENT_RULES } from './statements.ts';
import { SUMMARY_RULES } from './summary.ts';
import type { Ctx, Rule, Violation } from './dsl.ts';

export type { Ctx, Rule, Violation } from './dsl.ts';

export const HARD_RULES: Rule[] = [...STATEMENT_RULES, ...LINK_RULES, ...SUMMARY_RULES, ...SEGMENT_RULES, ...IR_RULES, ...NONNUMERIC_RULES];
export { SOFT_RULES, IR_DISPLAY_RULES };

export const HARD_RULE_IDS: string[] = HARD_RULES.map((r) => r.id);
export const SOFT_RULE_IDS: string[] = SOFT_RULES.map((r) => r.id);
/** 正常な問題だけに当てる検査の ID (anomaly の規則 ID としては使わない)。 */
export const IR_DISPLAY_RULE_IDS: string[] = IR_DISPLAY_RULES.map((r) => r.id);

export function runRules(rules: Rule[], ctx: Ctx): Violation[] {
  return rules.flatMap((r) => r.check(ctx));
}
