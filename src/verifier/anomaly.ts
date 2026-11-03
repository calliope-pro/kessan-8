// 異変の問題が、指定した所だけ破れているか (ケース表 §2.6)。anomalies.md G1 の 3 条件 + 問題ごとの期待集合。
import { FAMILY_DIFFICULTY } from '../domain/types.ts';
import type { AnomalyKind, AnomalyPlace, Problem } from '../domain/types.ts';
import { LABELS } from '../domain/labels.ts';
import { getPath } from './path.ts';
import type { VerifyResult } from './index.ts';

export interface Issue {
  code: 'override-on-normal' | 'unknown-kind' | 'family-difficulty-mismatch' | 'anomaly-mismatch';
  message: string;
}

const sorted = (xs: string[]) => [...new Set(xs)].sort();
const inSet = (xs: string[], set: string[]) => xs.filter((x) => !set.includes(x));
const placeKey = (p: AnomalyPlace): string => ('itemKey' in p ? p.itemKey : `${p.doc}.${p.path}`);

/** 同じか、一方が他方の親 (セグメント境界で)。 */
const touches = (a: string, b: string): boolean => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

export function anomalyIssues(problem: Problem, kinds: AnomalyKind[], result: VerifyResult): Issue[] {
  const issues: Issue[] = [];
  const add = (code: Issue['code'], message: string) => issues.push({ code, message });
  const anomaly = problem.anomaly;

  if (anomaly === null) {
    for (const key of ['labelOverrides', 'unitOverrides', 'signOverrides'] as const) {
      if (problem[key] !== undefined) add('override-on-normal', `正常な問題に見た目の差し替え (${key})`);
    }
    return issues;
  }

  const kind = kinds.find((k) => k.id === anomaly.kind);
  if (!kind) {
    add('unknown-kind', `異変の種類が一覧に無い: ${anomaly.kind}`);
    return issues;
  }
  if (FAMILY_DIFFICULTY[kind.family] !== problem.difficulty) add('family-difficulty-mismatch', `系統と難易度が合わない: ${kind.family} は ${FAMILY_DIFFICULTY[kind.family]} の系統だが、問題は ${problem.difficulty}`);
  if (anomaly.explanation.trim() === '') add('anomaly-mismatch', '答え合わせの文言が空');

  const actual = sorted(result.hard.map((v) => v.rule));
  const expected = sorted(anomaly.expectedRules);
  if (actual.join() !== expected.join()) add('anomaly-mismatch', `期待集合が実際に落ちた規則と違う (実際: ${actual.join('、') || 'なし'}、期待: ${expected.join('、') || 'なし'})`);
  if (!kind.primaryRules.some((r) => actual.includes(r))) add('anomaly-mismatch', `主な規則のどれも落ちていない (主な規則: ${kind.primaryRules.join('、')})`);
  const outside = inSet(actual, kind.allowedRules);
  if (outside.length > 0) add('anomaly-mismatch', `許容集合の外の規則が落ちている: ${outside.join('、')}`);
  if (inSet(expected, kind.allowedRules).length > 0 || !kind.primaryRules.some((r) => expected.includes(r))) {
    add('anomaly-mismatch', `期待集合が許容集合を越えている、または主な規則を含まない (期待: ${expected.join('、')})`);
  }

  const keys = anomaly.places.map(placeKey);
  anomaly.places.forEach((place, i) => {
    const key = keys[i] as string;
    if ('itemKey' in place) {
      if (!(place.itemKey in LABELS)) add('anomaly-mismatch', `項目キーが labels に無い: ${place.itemKey}`);
    } else if (getPath(problem, place.doc, place.path) === undefined) {
      add('anomaly-mismatch', `場所が実在しない: ${key}`);
    }
    if (!result.hard.some((v) => v.paths.some((p) => touches(key, p)))) add('anomaly-mismatch', `どの違反にも触れない場所: ${key}`);
  });
  for (const v of result.hard) {
    if (!keys.some((k) => v.paths.some((p) => touches(k, p)))) add('anomaly-mismatch', `場所に触れない違反: ${v.rule}`);
  }
  return issues;
}

export function checkAnomaly(problem: Problem, kinds: AnomalyKind[], result: VerifyResult): string[] {
  return anomalyIssues(problem, kinds, result).map((i) => i.message);
}
