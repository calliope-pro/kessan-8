// 試作の出題 (docs/design-v3.md §1.5 R-S2・R-S3)。形は難易度で 1 つなので、形は引かない。異変の有無 → 問題 → 種類の順に、別々の乱数の流れで引く。
import { mulberry32 } from '../domain/rng';
import type { Problem } from '../domain/types';
import { buildAnomaly, kindsFor, applicable } from './anomalies';
import type { CardEdit, Difficulty } from './cards';

export const ROUNDS_TO_CLEAR = 8;
export const ANOMALY_RATIO = 0.5;

export interface RoundAnomaly {
  kind: string;
  name: string;
  places: string[];
  explanation: string;
}

/** 1 枠: 遊び手が見る 1 枚。異変の有無は anomaly で決まる (問題データから)。 */
export interface Round {
  problem: Problem;
  /** 元の正常な問題の ID。 */
  baseId: string;
  edits: CardEdit[];
  anomaly: RoundAnomaly | null;
}

export interface DrawOptions {
  anomalyRatio?: number;
  /** 見つけた異変の種類。あるものは、ほかに選べるかぎり選ばない (要件・設計 §2.7)。 */
  history?: ReadonlySet<string>;
  difficulty?: Difficulty;
}

const FLAG_STREAM = (seed: number) => mulberry32((seed ^ 0x9e3779b9) >>> 0);
const PICK_STREAM = (seed: number) => mulberry32((seed ^ 0x85ebca6b) >>> 0);
const pickOf = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;

export function drawRun(seed: number, normals: readonly Problem[], opt: DrawOptions = {}): Round[] {
  const ratio = opt.anomalyRatio ?? ANOMALY_RATIO;
  const history = opt.history ?? new Set<string>();
  const difficulty = opt.difficulty ?? 'easy';
  const pool = normals.filter((p) => p.difficulty === difficulty && p.anomaly === null);
  const flagRng = FLAG_STREAM(seed);
  const pickRng = PICK_STREAM(seed);
  const usedCompanies = new Set<string>();
  const usedKinds = new Set<string>();
  const rounds: Round[] = [];

  for (let i = 0; i < ROUNDS_TO_CLEAR; i++) {
    const wantAnomaly = flagRng() < ratio;
    const candidates = pool.filter((p) => !usedCompanies.has(p.companyId));
    if (candidates.length === 0) throw new Error('出題できません: 会社が尽きました');
    const base = pickOf(pickRng, candidates);
    usedCompanies.add(base.companyId);

    if (!wantAnomaly) {
      rounds.push({ problem: base, baseId: base.id, edits: [], anomaly: null });
      continue;
    }
    const kinds = kindsFor(difficulty).filter((k) => applicable(k.id, base)).map((k) => k.id);
    // 履歴にない種類 → (なければ) 履歴にあっても今の周で未使用の種類 → 全部
    const tiers = [
      kinds.filter((k) => !history.has(k) && !usedKinds.has(k)),
      kinds.filter((k) => !history.has(k)),
      kinds.filter((k) => !usedKinds.has(k)),
      kinds,
    ];
    const kind = pickOf(pickRng, tiers.find((t) => t.length > 0)!);
    usedKinds.add(kind);
    const built = buildAnomaly(kind, base, pickRng);
    rounds.push({
      problem: built.problem,
      baseId: base.id,
      edits: built.edits,
      anomaly: { kind, name: built.name, places: built.places, explanation: built.explanation },
    });
  }
  return rounds;
}
