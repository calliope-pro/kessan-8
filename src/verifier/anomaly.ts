// 異変の問題が、指定した所だけ破れているか (ケース表 §2.6)。anomalies.md G1 の 3 条件 + 問題ごとの期待集合。
import { shapesOf, templateKeys } from '../domain/cards.ts';
import { FAMILY_DIFFICULTY, IR_SLIDES, TANSHIN_SCREENS } from '../domain/types.ts';
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
const placeKey = (p: AnomalyPlace): string => (p.doc === 'card' ? `card.${p.shape}.${p.card}.${p.slot}` : 'itemKey' in p ? p.itemKey : `${p.doc}.${p.path}`);

/**
 * 違反が、変えたセルを読むか (docs/design-v2.md §2.8)。changed のパスと、同じ・changed の下 (changed が要素のパスのとき)・changed の入れ物
 * (違反が ir.segments.items のような入れ物を読み、changed がその要素 ir.segments.items.2 のとき。H-19 の二次の違反) のいずれか。
 */
const readsChanged = (changed: string[] | undefined, violationPaths: string[]): boolean =>
  changed !== undefined && violationPaths.some((p) => changed.some((c) => p === c || p.startsWith(`${c}.`) || c.startsWith(`${p}.`)));

/** 場所が、違反の path と同じか、その子 (違反の path が statements.0 のような入れ物のとき)。場所が親 (まとまり全体) の向きは許さない。 */
const touches = (place: string, violationPath: string): boolean => place === violationPath || place.startsWith(`${violationPath}.`);

export function anomalyIssues(problem: Problem, kinds: AnomalyKind[], result: VerifyResult): Issue[] {
  const issues: Issue[] = [];
  const add = (code: Issue['code'], message: string) => issues.push({ code, message });
  const anomaly = problem.anomaly;

  if (anomaly === null) {
    for (const key of ['labelOverrides', 'unitOverrides', 'signOverrides', 'cardEdits'] as const) {
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
  // 許容集合: kind.allowedRules に入るか、(changed があれば) 違反が変えたセルを読むこと (docs/design-v2.md §2.8 の検査 1)
  const allowedViolation = (v: { rule: string; paths: string[] }): boolean => kind.allowedRules.includes(v.rule) || readsChanged(anomaly.changed, v.paths);
  const outside = sorted(result.hard.filter((v) => !allowedViolation(v)).map((v) => v.rule));
  if (outside.length > 0) add('anomaly-mismatch', `許容集合の外の規則が落ちている: ${outside.join('、')}`);
  const expectedOutside = expected.filter((r) => !kind.allowedRules.includes(r) && !result.hard.some((v) => v.rule === r && readsChanged(anomaly.changed, v.paths)));
  if (expectedOutside.length > 0 || !kind.primaryRules.some((r) => expected.includes(r))) {
    add('anomaly-mismatch', `期待集合が許容集合を越えている、または主な規則を含まない (期待: ${expected.join('、')})`);
  }

  // cardEdits (形のずれ): 1 つの異変は 1 つの編集。形は問題の難易度の形、欄は形にあること (docs/design-v2.md §1.6)
  const edits = problem.cardEdits ?? [];
  if (edits.length > 1) add('anomaly-mismatch', `形のずれの編集が 2 件以上ある (1 つの異変は 1 つの編集): ${edits.length} 件`);
  for (const e of edits) {
    if (!shapesOf(problem.difficulty).includes(e.shape)) {
      add('anomaly-mismatch', `cardEdits の形 ${e.shape} は、問題 (${problem.difficulty}) の難易度の形でない`);
      continue;
    }
    const keys = templateKeys(e.shape)[e.card];
    if (keys === undefined) {
      add('anomaly-mismatch', `cardEdits: カード ${e.card} が ${e.shape} に無い`);
      continue;
    }
    for (const slot of e.op === 'swap' ? e.slots : e.op === 'headline' ? [] : [e.slot]) if (!keys.includes(slot)) add('anomaly-mismatch', `cardEdits: ${e.shape} のカード ${e.card} に形に無い欄 ${slot}`);
    if (e.op === 'headline' && !['E1', 'E2'].includes(e.shape)) add('anomaly-mismatch', `cardEdits: ${e.shape} に見出し語は無い`);
  }

  for (const [key, value] of Object.entries(problem.signOverrides ?? {})) {
    const [doc, ...rest] = key.split('.');
    const cell = doc === 'tanshin' || doc === 'ir' ? getPath(problem, doc, rest.join('.')) : undefined;
    if (!(typeof cell === 'number' && cell < 0)) add('anomaly-mismatch', `負の記号の差し替えが負の数のセルを指していない: ${key} (${value})`);
  }
  for (const key of Object.keys(problem.unitOverrides ?? {})) {
    const [doc, screen, ...rest] = key.split('.');
    const screens: readonly string[] = doc === 'tanshin' ? TANSHIN_SCREENS : doc === 'ir' ? IR_SLIDES : [];
    if (rest.length > 0 || !screens.includes(screen ?? '')) add('anomaly-mismatch', `単位の差し替えが画面を指していない: ${key}`);
  }

  const keys = anomaly.places.map(placeKey);
  anomaly.places.forEach((place, i) => {
    const key = keys[i] as string;
    if (place.doc === 'card') {
      const template = shapesOf(problem.difficulty).includes(place.shape) ? templateKeys(place.shape)[place.card] : undefined;
      const hasHeadline = place.slot === 'headline' && ['E1', 'E2'].includes(place.shape);
      if (template === undefined || !(template.includes(place.slot) || hasHeadline)) add('anomaly-mismatch', `場所が実在しない: ${key}`);
    } else if ('itemKey' in place) {
      if (!(place.itemKey in LABELS)) add('anomaly-mismatch', `項目キーが labels に無い: ${place.itemKey}`);
    } else {
      const value = getPath(problem, place.doc, place.path);
      const isContainer = typeof value === 'object' && value !== null;
      if (value === undefined) add('anomaly-mismatch', `場所が実在しない: ${key}`);
      else if (isContainer && !result.hard.some((v) => v.paths.includes(key))) add('anomaly-mismatch', `場所が値でなくまとまりを指している: ${key}`);
    }
    if (!result.hard.some((v) => v.paths.some((p) => touches(key, p)))) add('anomaly-mismatch', `どの違反にも触れない場所: ${key}`);
  });
  for (const v of result.hard) {
    // 二次の症状 (カードの外のセル) の違反は、変えたセルを読んでいれば、場所に触れなくてよい (docs/design-v2.md §2.8 の検査 2)
    if (!keys.some((k) => v.paths.some((p) => touches(k, p))) && !readsChanged(anomaly.changed, v.paths)) add('anomaly-mismatch', `場所に触れない違反: ${v.rule}`);
  }
  return issues;
}

export function checkAnomaly(problem: Problem, kinds: AnomalyKind[], result: VerifyResult): string[] {
  return anomalyIssues(problem, kinds, result).map((i) => i.message);
}
