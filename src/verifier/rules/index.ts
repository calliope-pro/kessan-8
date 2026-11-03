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
export { SOFT_RULES };

export const HARD_RULE_IDS: string[] = HARD_RULES.map((r) => r.id);
export const SOFT_RULE_IDS: string[] = SOFT_RULES.map((r) => r.id);

export function runRules(rules: Rule[], ctx: Ctx): Violation[] {
  return rules.flatMap((r) => r.check(ctx));
}
