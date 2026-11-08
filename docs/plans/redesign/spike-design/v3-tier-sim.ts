// 設計 v3 §2.7: 段の決まり (TIER_BY_ROUND) が、枠ごとに出る異変の種類を絞りすぎないかを、1 万周の出題で試算する。製品のコードではない。
// `src/domain/draw.ts` の `draw` を写して、段の決め方だけを (a) 今のとおり = 段がちょうど同じ、(b) 累積 = 段が狙い以下 に切り替えて比べる。
// 問題のプールは、§1.5・§2.7 の推奨の構成: 10 社・種類ごとに異変の問題 5 問 (むずかしいの会計・資料間の種類は 7 問。会社に段ごとに散らす)・各社に正常な問題 1 問 (段を持たない)。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/v3-tier-sim.ts
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
// 種類 → 段 (§2.2・§2.3 の表)。見る対象 (§2.4) は同じ対象の ID を 1 つにまとめて数える
const EASY: [string, number, string][] = [['E-17', 1, '向き'], ['E-12', 3, '割合'], ['E-02', 1, '桁'], ['E-24', 1, '大小'], ['E-03', 1, '単位'], ['E-05', 1, '綴り'], ['E-19', 2, '欄の有無'], ['E-22', 1, '繰り返し'], ['E-21', 1, 'カンマ'], ['E-25', 1, '符号'], ['E-23', 2, '見出し語'], ['E-04', 3, '期末日']];
const HARD: [string, number, string][] = [['H-01', 3, '等しい'], ['H-03', 3, '等しい'], ['H-04', 3, '等しい'], ['H-05', 3, '引き算'], ['H-20', 3, '引き算'], ['H-13', 2, '同じ数字'], ['H-17', 1, '桁'], ['H-19', 2, '名前の並び'], ['H-21', 2, '文と向き'], ['H-22', 1, '監査'], ['H-23', 2, '有無と注記'], ['H-24', 2, '後発事象'], ['H-28', 2, '資産の科目'], ['H-35', 1, '社名'], ['H-29', 1, '単位'], ['H-30', 1, '綴り'], ['H-31', 2, '欄の有無'], ['H-32', 1, 'カンマ'], ['H-33', 1, '繰り返し'], ['H-34', 1, '符号']];
const CO = Array.from({ length: 10 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
// 推奨のプールの構成 (設計 v3 §1.5・§2.7): 各社に正常な問題 1 問 (段を持たない)・種類ごとに異変の問題を count(kind) 問、段ごとに会社へ順に散らす
// (各社の持つ異変の問題の数が、段ごとに 1 問以内の差になる。「会社を先に選び、その会社の問題から選ぶ」出題でも、種類の出方が偏らないため)
function pool(kinds: [string, number, string][], count: (k: string) => number): P[] {
  const ps: P[] = CO.map((c) => ({ id: `n-${c}`, companyId: c, kind: null, tier: undefined }));
  for (const t of [1, 2, 3]) {
    let n = 0;
    for (const [k, kt] of kinds) { if (kt !== t) continue; for (let j = 0; j < count(k); j++, n++) ps.push({ id: `${k}-${j}`, companyId: CO[n % 10]!, kind: k, tier: t }); }
  }
  return ps;
}
const HARD_PRIMARY = new Set(['H-01', 'H-03', 'H-04', 'H-05', 'H-28', 'H-13', 'H-17', 'H-19', 'H-20', 'H-21', 'H-35']);
const DEBUG = process.env.TIER_DEBUG === '1';
const GROUPS: [string, number[]][] = [['1〜2 社目', [0, 1]], ['3〜5 社目', [2, 3, 4]], ['6〜8 社目', [5, 6, 7]]];
for (const [name, kinds, count] of [['やさしい', EASY, () => 5], ['むずかしい', HARD, (k: string) => (HARD_PRIMARY.has(k) ? 7 : 5)]] as const) {
  const obj = new Map(kinds.map(([k, , o]) => [k, o]));
  const pl = pool([...kinds], count);
  for (const cum of [false, true]) {
    const counts = GROUPS.map(() => new Map<string, number>()); const tot = GROUPS.map(() => 0);
    for (let seed = 1; seed <= 10000; seed++) {
      const ps = draw(pl, mulberry32(seed), cum);
      ps.forEach((p, slot) => { if (p.kind === null) return; const gi = GROUPS.findIndex(([, ss]) => ss.includes(slot)); const o = obj.get(p.kind)!; counts[gi]!.set(o, (counts[gi]!.get(o) ?? 0) + 1); tot[gi]!++; });
    }
    const lines = GROUPS.map(([g], gi) => { const c = [...counts[gi]!.entries()].sort((a, b) => b[1] - a[1]); const top = c[0]!; return `${g}: 異変の枠で出る見る対象 ${c.length} 種類・最多 ${top[0]} ${(top[1] / tot[gi]! * 100).toFixed(1)}%・最少 ${c.at(-1)![0]} ${(c.at(-1)![1] / tot[gi]! * 100).toFixed(1)}%`; });
    console.log(`${name} ${cum ? '累積 (段が狙い以下)' : '今のとおり (段がちょうど同じ)'}:\n   ${lines.join('\n   ')}`);
  }
}

if (DEBUG) { const pl = pool([...EASY], () => 5); const c = new Map<string, number>(); let tot = 0; for (let seed = 1; seed <= 10000; seed++) { const ps = draw(pl, mulberry32(seed), true); [2, 3, 4].forEach((sl) => { const p = ps[sl]!; if (p.kind) { c.set(p.kind, (c.get(p.kind) ?? 0) + 1); tot++; } }); } console.log([...c.entries()].sort().map(([k, v]) => `${k} ${(v / tot * 100).toFixed(1)}%`).join(' / ')); }
