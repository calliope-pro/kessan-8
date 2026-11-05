// 正常を覚えられるかの確かめ (docs/plans/redesign/plans.md §8.1 の「① の測り方」)。
// 1 人 8 枚 = 異変 4 + 正常 4。異変は型のずれだけ (向きの逆・桁・比率の計算違いは、0 社目が無くても見つかるので使わない)。
import { mulberry32 } from '../domain/rng';
import type { Problem } from '../domain/types';
import { buildAnomaly } from './anomalies';
import type { ShapeId } from './cards';
import type { Round } from './draw';

/** 型のずれ: 欄の欠落・並びの入れ替え・単位の語・欄の重複。 */
export const FORM_KINDS = ['E-19', 'E-20', 'E-03', 'E-22'] as const;
export const DECK_SIZE = 8;

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildDeck(seed: number, shape: ShapeId, normals: readonly Problem[]): Round[] {
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const byCompany = new Map<string, Problem[]>();
  for (const p of shuffle(normals, rng)) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);
  const picked = shuffle([...byCompany.keys()], rng).slice(0, DECK_SIZE).map((c) => byCompany.get(c)![0]!);
  if (picked.length < DECK_SIZE) throw new Error('確かめの 1 組を作れません: 会社が足りません');
  const anomalyAt = new Set(shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng).slice(0, 4));
  const kinds = shuffle(FORM_KINDS, rng);
  let k = 0;
  return picked.map((base, i): Round => {
    if (!anomalyAt.has(i)) return { problem: base, baseId: base.id, shape, edits: [], anomaly: null };
    const kind = kinds[k++]!;
    const b = buildAnomaly(kind, base, shape, rng);
    return { problem: b.problem, baseId: base.id, shape, edits: b.edits, anomaly: { kind, name: b.name, places: b.places, explanation: b.explanation } };
  });
}

export interface Response {
  index: number;
  hasAnomaly: boolean;
  said: 'normal' | 'anomaly';
}

export interface Score {
  anomalies: number;
  normals: number;
  found: number;
  falseAlarms: number;
  /** 合格の基準 (仮定): 異変 4 枚中 3 枚以上を見つけ、かつ正常 4 枚中の誤りが 1 枚以下。 */
  pass: boolean;
}

export function scoreSession(rs: readonly Response[]): Score {
  const anomalies = rs.filter((r) => r.hasAnomaly).length;
  const found = rs.filter((r) => r.hasAnomaly && r.said === 'anomaly').length;
  const falseAlarms = rs.filter((r) => !r.hasAnomaly && r.said === 'anomaly').length;
  return { anomalies, normals: rs.length - anomalies, found, falseAlarms, pass: found >= 3 && falseAlarms <= 1 };
}

export type Verdict = '強い合図' | '弱い合図' | '効かない' | '未確認';

export function summarize(sessions: readonly { pass: boolean }[]): { n: number; passed: number; verdict: Verdict } {
  const n = sessions.length;
  const passed = sessions.filter((s) => s.pass).length;
  let verdict: Verdict;
  if (n >= 5) verdict = passed === n ? '強い合図' : passed === n - 1 ? '弱い合図' : '効かない';
  else verdict = n >= 2 && passed === n ? '弱い合図' : '未確認';
  return { n, passed, verdict };
}

/** 当て推量 (どの枚も 50%) で合格する確率。plans.md §8.1: 1 人 約 9.8%、5 人中 4 人以上 約 0.04%。 */
export function guessProbability(): { one: number; fourOfFive: number } {
  const atLeast3of4 = 5 / 16; // P(Bin(4, 1/2) >= 3)
  const atMost1of4 = 5 / 16; // P(Bin(4, 1/2) <= 1)
  const one = atLeast3of4 * atMost1of4;
  return { one, fourOfFive: 5 * one ** 4 * (1 - one) + one ** 5 };
}

// ---- 確かめの集計 (?mode=summary): 参加者が「記録をコピー」した文を貼って、5 人ぶんを集計する ----

export const RECORD_HEADER = '８期連続 試作 確かめ記録';

export interface ParsedRecord {
  pid: string;
  shape: ShapeId;
  /** 0 社目 (見本) を見せた条件か。 */
  withSample: boolean;
  seed: number;
  found: number;
  anomalies: number;
  falseAlarms: number;
  normals: number;
  pass: boolean;
}

export function parseRecord(text: string): ParsedRecord | null {
  const pid = /^参加者: (.*)$/m.exec(text)?.[1];
  const cond = /^条件: 形=(E[123]) 0社目=(あり|なし) 種=(\d+)$/m.exec(text);
  const res = /^結果: 異変 (\d+)\/(\d+) を見つけた \/ 正常 (\d+)\/(\d+) を異変と答えた → (合格|不合格)/m.exec(text);
  if (pid === undefined || !cond || !res) return null;
  return {
    pid: pid.trim(),
    shape: cond[1] as ShapeId,
    withSample: cond[2] === 'あり',
    seed: Number(cond[3]),
    found: Number(res[1]),
    anomalies: Number(res[2]),
    falseAlarms: Number(res[3]),
    normals: Number(res[4]),
    pass: res[5] === '合格',
  };
}

/** 貼った文を、記録の頭の行で分ける。 */
export function splitRecords(text: string): string[] {
  return text.split(RECORD_HEADER).slice(1).map((t) => `${RECORD_HEADER}${t}`.trim());
}

export interface Aux {
  pid: string;
  foundWith: number;
  foundWithout: number;
  diff: number;
  /** 両方が全部見つかった (4/4)。正常を覚えなくても見つかる型のずれ: 「効かない」に数えない (plans.md §8.1)。 */
  ceiling: boolean;
}

export function aggregate(records: readonly ParsedRecord[]): { n: number; passed: number; verdict: Verdict; aux: Aux[] } {
  const byPid = new Map<string, ParsedRecord[]>();
  for (const r of records) byPid.set(r.pid, [...(byPid.get(r.pid) ?? []), r]);
  const primary: ParsedRecord[] = [];
  const aux: Aux[] = [];
  for (const [pid, rs] of byPid) {
    const withS = rs.find((r) => r.withSample);
    const without = rs.find((r) => !r.withSample);
    if (withS) primary.push(withS);
    if (withS && without) {
      aux.push({ pid, foundWith: withS.found, foundWithout: without.found, diff: withS.found - without.found, ceiling: withS.found === withS.anomalies && without.found === without.anomalies });
    }
  }
  return { ...summarize(primary), aux };
}
