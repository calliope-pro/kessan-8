// 設計表 v3 (Sub-task #167) のプールで、出題の種類の出方を 1 万周で試算する (設計 v3 §2.7 の試算を、実際に割り振った問題の表 spec-v3.json に当てる)。製品のコードではない。
// `draw` は docs/plans/redesign/spike-design/v3-tier-sim.ts のもの (src/domain/draw.ts を写して、段の指定を累積にした版。累積 = 設計 §2.7 の採用案、#155 が本体に入れる)。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/problems-easy/pool-sim.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROUNDS = 8;
const TIER_BY_ROUND = [1, 1, 2, 2, 2, 3, 3, 3];
function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
interface P { id: string; companyId: string; kind: string | null; tier: number | undefined }
type TierSet = ReadonlySet<number> | null;
function draw(pool: P[], rng: () => number, cumulative: boolean): P[] {
  const byCompany = new Map<string, P[]>();
  for (const p of pool) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);
  const flags = Array.from({ length: ROUNDS }, () => rng() < 0.5);
  const tieC = new Map<string, number>(), tieP = new Map<string, number>();
  for (const [id, ps] of byCompany) { tieC.set(id, rng()); for (const p of ps) tieP.set(p.id, rng()); }
  const tierSets = (slot: number): TierSet[] => { const t = TIER_BY_ROUND[slot] ?? 3; return cumulative ? [new Set([1, 2, 3].filter((x) => x <= t)), null, null] : [new Set([t]), new Set([t - 1, t, t + 1]), null]; };
  const matching = (cid: string, slot: number, tiers: TierSet) => (byCompany.get(cid) ?? []).filter((p) => (p.kind !== null) === flags[slot] && (tiers === null || p.tier === undefined || tiers.has(p.tier)));
  const best = (ps: P[]) => [...ps].sort((a, b) => (tieP.get(a.id) ?? 0) - (tieP.get(b.id) ?? 0))[0]!;
  const candidates = (slot: number, tiers: TierSet) => [...byCompany.keys()].filter((id) => matching(id, slot, tiers).length > 0).sort((a, b) => (tieC.get(a) ?? 0) - (tieC.get(b) ?? 0));
  const slotOf = new Map<string, number>(), levelOf: number[] = [];
  const augment = (slot: number, seen: Set<string>): boolean => {
    for (const id of candidates(slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null)) {
      if (seen.has(id)) continue; seen.add(id);
      const h = slotOf.get(id);
      if (h === undefined || augment(h, seen)) { slotOf.set(id, slot); return true; }
    }
    return false;
  };
  for (let slot = 0; slot < ROUNDS; slot++) {
    let placed = false;
    for (let level = 0; level < 3 && !placed; level++) {
      levelOf[slot] = level;
      const free = candidates(slot, tierSets(slot)[level] ?? null).find((id) => !slotOf.has(id));
      if (free !== undefined) { slotOf.set(free, slot); placed = true; } else placed = augment(slot, new Set());
    }
    if (!placed) throw new Error('出題できません');
  }
  const cos = new Map<number, string>(); for (const [id, s] of slotOf) cos.set(s, id);
  return Array.from({ length: ROUNDS }, (_, slot) => best(matching(cos.get(slot)!, slot, tierSets(slot)[levelOf[slot] ?? 0] ?? null)));
}

const spec = JSON.parse(readFileSync(fileURLToPath(new URL('./spec-v3.json', import.meta.url)), 'utf-8')) as { problems: { id: string; company: string; kind: string | null; tier: number | null }[] };
const pool: P[] = spec.problems.map((p) => ({ id: p.id, companyId: p.company, kind: p.kind, tier: p.tier ?? undefined }));
const GROUPS: [string, number[]][] = [['1〜2 社目', [0, 1]], ['3〜5 社目', [2, 3, 4]], ['6〜8 社目', [5, 6, 7]]];
const RUNS = 10000;
const byId = GROUPS.map(() => new Map<string, number>());
const tot = GROUPS.map(() => 0);
const appear = new Map<string, number>(), anom = new Map<string, number>();
let anomalyFrames = 0, frames = 0;
for (let seed = 1; seed <= RUNS; seed++) {
  draw(pool, mulberry32(seed), true).forEach((p, slot) => {
    frames++;
    appear.set(p.companyId, (appear.get(p.companyId) ?? 0) + 1);
    if (p.kind === null) return;
    anomalyFrames++;
    anom.set(p.companyId, (anom.get(p.companyId) ?? 0) + 1);
    const gi = GROUPS.findIndex(([, ss]) => ss.includes(slot));
    byId[gi]!.set(p.kind, (byId[gi]!.get(p.kind) ?? 0) + 1);
    tot[gi]!++;
  });
}
// 候補の種類 (ID) の数 = その群で出うる段の種類の数 (累積: 1〜2 社目 = 段 1、3〜5 社目 = 段 1・2、6〜8 社目 = 段 1〜3)
const candidates = (gi: number) => new Set(pool.filter((p) => p.kind !== null && p.tier! <= [1, 2, 3][gi]!).map((p) => p.kind)).size;
console.log(`異変の枠の割合: ${(anomalyFrames / frames * 100).toFixed(2)}% (${anomalyFrames}/${frames}。基準 50% ± 1.5 ポイント)`);
GROUPS.forEach(([g], gi) => {
  const m = byId[gi]!;
  const top = Math.max(...m.values()) / tot[gi]!;
  const uniform = 1 / candidates(gi);
  console.log(`${g}: 出た種類 ${m.size}/${candidates(gi)}・最多 ${(top * 100).toFixed(1)}% = 一様 (${(uniform * 100).toFixed(1)}%) の ${(top / uniform).toFixed(2)} 倍 (基準 1.5 倍以内)・最少 ${(Math.min(...m.values()) / tot[gi]! * 100).toFixed(1)}%`);
});
const ratios = [...appear.keys()].sort().map((c) => (anom.get(c) ?? 0) / (appear.get(c) ?? 1));
console.log(`会社ごとの「出たとき異変の問題だった割合」 最小 ${(Math.min(...ratios) * 100).toFixed(1)}%・最大 ${(Math.max(...ratios) * 100).toFixed(1)}% (会社から答えが漏れないか。基準は 50% の近く。今の draw は 49〜51%)`);
