// データ全件の検証 (ケース表 §2.8)。errors = 致命、shortfalls = 数が足りない (完成の段階で効く)、soft = 参考の規則。
import { ANOMALY_RATIO, ANOMALY_RATIO_TOLERANCE, FAMILY_SHARE_MIN, MIN_POOL_PER_DIFFICULTY, ROUNDS_TO_CLEAR } from '../domain/config.ts';
import { FAMILY_DIFFICULTY } from '../domain/types.ts';
import type { AnomalyKind, Company, Difficulty, Problem } from '../domain/types.ts';
import { anomalyIssues } from './anomaly.ts';
import { verifyIrDisplay, verifyProblem } from './index.ts';
import type { VerifyResult } from './index.ts';
import { HARD_RULE_IDS, SOFT_RULE_IDS } from './rules/index.ts';
import { companyShapeErrors, kindShapeErrors, shapeErrors } from './shape.ts';

export interface Entry {
  code: string;
  problem?: string;
  /** 数の不足 (shortfalls) のとき、どの難易度の不足か。 */
  difficulty?: Difficulty;
  message: string;
}

export interface DatasetInput {
  companies: unknown[];
  kinds: unknown[];
  problems: { file: string; value: unknown }[];
  /** 見本 (samples/*.json)。`{ problem, notes }`。正常な問題として検証するが、プールには入れない。 */
  samples?: { file: string; value: unknown }[];
}

export interface DatasetResult {
  errors: Entry[];
  shortfalls: Entry[];
  soft: Entry[];
  stats: Record<Difficulty, { total: number; anomaly: number; normal: number }>;
  /** 検証した見本の数。 */
  samples: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'hard'];
const PRIMARY_FAMILIES: Record<Difficulty, string[]> = { easy: ['appearance', 'calculation'], hard: ['accounting', 'cross-document'] };
const ALL_RULES = [...HARD_RULE_IDS, ...SOFT_RULE_IDS];

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false))))];
}

export function verifyDataset(input: DatasetInput, verify: (p: Problem, c: Company) => VerifyResult = verifyProblem): DatasetResult {
  const errors: Entry[] = [];
  const shortfalls: Entry[] = [];
  const soft: Entry[] = [];
  const stats = { easy: { total: 0, anomaly: 0, normal: 0 }, hard: { total: 0, anomaly: 0, normal: 0 } };

  // 会社
  const companies: Company[] = [];
  input.companies.forEach((c, i) => {
    const bad = companyShapeErrors(c);
    bad.forEach((m) => errors.push({ code: 'company-shape', message: `companies[${i}] ${m}` }));
    if (bad.length === 0) companies.push(c as Company);
  });
  duplicates(companies.map((c) => c.id)).forEach((id) => errors.push({ code: 'duplicate-company', message: `会社の id が重複: ${id}` }));

  // 異変の種類
  const kinds: AnomalyKind[] = [];
  input.kinds.forEach((k, i) => {
    const bad = kindShapeErrors(k);
    bad.forEach((m) => errors.push({ code: 'kind-shape', message: `anomaly-kinds[${i}] ${m}` }));
    if (bad.length > 0) return;
    const kind = k as AnomalyKind;
    kinds.push(kind);
    for (const rule of [...kind.primaryRules, ...kind.allowedRules]) {
      if (!ALL_RULES.includes(rule)) errors.push({ code: 'unknown-rule', message: `種類 ${kind.id} が存在しない規則 ID を参照している: ${rule}` });
    }
    if (kind.primaryRules.length === 0) errors.push({ code: 'kind-no-primary', message: `種類 ${kind.id} の primaryRules が空` });
    if (kind.primaryRules.some((r) => !kind.allowedRules.includes(r))) errors.push({ code: 'kind-primary-not-allowed', message: `種類 ${kind.id} の primaryRules が allowedRules に含まれない` });
  });
  duplicates(kinds.map((k) => k.id)).forEach((id) => errors.push({ code: 'duplicate-kind', message: `異変の種類の id が重複: ${id}` }));

  // 問題
  let sampleCount = 0;
  const valid: Problem[] = [];
  for (const { file, value } of input.problems) {
    const shape = shapeErrors(value);
    if (shape.length > 0) {
      shape.forEach((m) => errors.push({ code: 'shape', message: `${file}: ${m}` }));
      continue;
    }
    const p = value as Problem;
    const add = (code: string, message: string) => errors.push({ code, problem: p.id, message: `${file}: ${message}` });
    const stem = file.split('/').pop()?.replace(/\.json$/, '');
    if (stem !== p.id) add('id-mismatch', `ファイル名 ${stem} と id ${p.id} が違う`);
    const dir = /problems\/([^/]+)\//.exec(file)?.[1];
    if (dir !== p.difficulty) add('difficulty-mismatch', `置き場 ${dir} と difficulty ${p.difficulty} が違う`);
    valid.push(p);
    stats[p.difficulty].total++;
    stats[p.difficulty][p.anomaly ? 'anomaly' : 'normal']++;

    const company = companies.find((c) => c.id === p.companyId);
    if (!company) {
      add('unknown-company', `会社 ${p.companyId} が一覧に無い`);
      continue;
    }
    const result = verify(p, company);
    if (p.anomaly === null) {
      for (const v of result.hard) add('hard-violation', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
      for (const v of verifyIrDisplay(p, company)) add('ir-display-mismatch', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
    }
    for (const issue of anomalyIssues(p, kinds, result)) add(issue.code, issue.message);
    for (const v of result.soft) soft.push({ code: v.rule, problem: p.id, message: `${file}: ${v.message}` });
  }
  duplicates(valid.map((p) => p.id)).forEach((id) => errors.push({ code: 'duplicate-id', problem: id, message: `問題の id が重複: ${id}` }));

  // 見本: 正常な問題として検証する。プールの数には入れず、プールと同じ会社 × 期でないこと (見本が出題に混ざらない)
  const poolPairs = new Set(valid.map((p) => `${p.companyId}×${p.fiscalYear}`));
  for (const { file, value } of input.samples ?? []) {
    const sampleErrors: string[] = [];
    const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (record === null) sampleErrors.push('見本がオブジェクトでない');
    else {
      const notes = record.notes;
      if (typeof notes !== 'object' || notes === null || Array.isArray(notes) || Object.values(notes).some((v) => typeof v !== 'string')) sampleErrors.push('notes: 文字列の record でない');
      sampleErrors.push(...shapeErrors(record.problem).map((m) => `problem ${m}`));
    }
    if (sampleErrors.length > 0) {
      sampleErrors.forEach((m) => errors.push({ code: 'sample-shape', message: `${file}: ${m}` }));
      continue;
    }
    const p = (record as { problem: Problem }).problem;
    const add = (code: string, message: string) => errors.push({ code, problem: p.id, message: `${file}: ${message}` });
    if (p.anomaly !== null) add('sample-anomaly', '見本は正常な問題でなければならない (anomaly が null)');
    if (valid.some((q) => q.id === p.id)) add('duplicate-id', `見本の id ${p.id} がプールの問題と同じ`);
    if (poolPairs.has(`${p.companyId}×${p.fiscalYear}`)) add('sample-overlaps-pool', `見本の会社 × 期 (${p.companyId} × ${p.fiscalYear}) がプールの問題と同じ`);
    const company = companies.find((c) => c.id === p.companyId);
    if (!company) {
      add('unknown-company', `会社 ${p.companyId} が一覧に無い`);
      continue;
    }
    for (const v of verify(p, company).hard) add('hard-violation', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
    for (const v of verifyIrDisplay(p, company)) add('ir-display-mismatch', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
    sampleCount++;
  }

  // 数が足りない
  for (const d of DIFFICULTIES) {
    const pool = valid.filter((p) => p.difficulty === d);
    const anomalies = pool.filter((p) => p.anomaly !== null);
    if (pool.length < MIN_POOL_PER_DIFFICULTY) shortfalls.push({ code: 'pool-size', difficulty: d, message: `${d}: 問題数 ${pool.length} が ${MIN_POOL_PER_DIFFICULTY} 未満` });
    const bothCount = [...new Set(pool.map((p) => p.companyId))].filter(
      (c) => pool.some((p) => p.companyId === c && p.anomaly !== null) && pool.some((p) => p.companyId === c && p.anomaly === null),
    ).length;
    if (bothCount < ROUNDS_TO_CLEAR) shortfalls.push({ code: 'both-sided-companies', difficulty: d, message: `${d}: 異変あり・なしの両方を持つ会社が ${bothCount} 社で、${ROUNDS_TO_CLEAR} 社未満` });
    if (pool.length >= MIN_POOL_PER_DIFFICULTY && Math.abs(anomalies.length - ANOMALY_RATIO * pool.length) > ANOMALY_RATIO_TOLERANCE) {
      shortfalls.push({ code: 'anomaly-ratio', difficulty: d, message: `${d}: 異変の問題 ${anomalies.length} 件が ${ANOMALY_RATIO} × ${pool.length} の ±${ANOMALY_RATIO_TOLERANCE} の外` });
    }
    if (anomalies.length > 0) {
      const primary = anomalies.filter((p) => {
        const kind = kinds.find((k) => k.id === p.anomaly?.kind);
        return kind !== undefined && FAMILY_DIFFICULTY[kind.family] === d && PRIMARY_FAMILIES[d].includes(kind.family);
      }).length;
      if (primary / anomalies.length < FAMILY_SHARE_MIN[d]) {
        shortfalls.push({ code: 'family-balance', difficulty: d, message: `${d}: ${PRIMARY_FAMILIES[d].join('+')} の異変が ${primary}/${anomalies.length} で、${FAMILY_SHARE_MIN[d] * 100}% 未満` });
      }
    }
  }
  return { errors, shortfalls, soft, stats, samples: sampleCount };
}
