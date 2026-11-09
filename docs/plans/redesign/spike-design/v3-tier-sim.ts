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
const EASY: [string, number, string][] = [['E-17', 1, '向き'], ['E-12', 3, '割合'], ['E-02', 1, '桁'], ['E-24', 1, '大小'], ['E-03', 1, '単位'], ['E-05', 1, '綴り'], ['E-19', 2, '欄の有無'], ['E-22', 1, '繰り返し'], ['E-21', 1, 'カンマ'], ['E-25', 1, '符号'], ['E-23', 2, '見出し語'], ['E-04', 3, '期末日'], ['E-26', 1, '添え字'], ['E-27', 1, '数字の字'], ['E-28', 2, '日付の存在']];
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

// 種類の出方の検査 (R-S6 の置き換え。設計 v3 §2.7・§3.2 #155-3 (c)。#174 包括レビュー N1): 累積・推奨のプールで、枠の群ごとに「異変の枠で出る種類の最大の割合 ÷ 一様の割合」を、見る対象で数えた値と ID で数えた値で出す。
// 検査の定義は「一様の割合の 1.5 倍以内」。むずかしいは見る対象で数えると、等しいはずの 2 つの数字 (H-01・H-03・H-04 を 1 つにまとめる) が 3 ID 分の割合になって 1.5 倍を超えるので、ID で数える。
for (const [name, kinds, count] of [['やさしい', EASY, () => 5], ['むずかしい', HARD, (k: string) => (HARD_PRIMARY.has(k) ? 7 : 5)]] as const) {
  const obj = new Map(kinds.map(([k, , o]) => [k, o])); const pl = pool([...kinds], count);
  const byId = GROUPS.map(() => new Map<string, number>()), byObj = GROUPS.map(() => new Map<string, number>()); const tot = GROUPS.map(() => 0);
  for (let seed = 1; seed <= 10000; seed++) draw(pl, mulberry32(seed), true).forEach((p, slot) => { if (p.kind === null) return; const gi = GROUPS.findIndex(([, ss]) => ss.includes(slot)); byId[gi]!.set(p.kind, (byId[gi]!.get(p.kind) ?? 0) + 1); const o = obj.get(p.kind)!; byObj[gi]!.set(o, (byObj[gi]!.get(o) ?? 0) + 1); tot[gi]!++; });
  const line = (m: Map<string, number>, gi: number) => { const top = Math.max(...m.values()) / tot[gi]!; return `${m.size} 種で最多 ${(top * 100).toFixed(1)}% = 一様 (${(100 / m.size).toFixed(1)}%) の ${(top * m.size).toFixed(2)} 倍`; };
  GROUPS.forEach(([g], gi) => console.log(`${name} 累積 ${g}: 見る対象で数える: ${line(byObj[gi]!, gi)} / ID で数える: ${line(byId[gi]!, gi)}`));
}

if (DEBUG) { const pl = pool([...EASY], () => 5); const c = new Map<string, number>(); let tot = 0; for (let seed = 1; seed <= 10000; seed++) { const ps = draw(pl, mulberry32(seed), true); [2, 3, 4].forEach((sl) => { const p = ps[sl]!; if (p.kind) { c.set(p.kind, (c.get(p.kind) ?? 0) + 1); tot++; } }); } console.log([...c.entries()].sort().map(([k, v]) => `${k} ${(v / tot * 100).toFixed(1)}%`).join(' / ')); }

// ---- 別の道 (§3.2 #155・§3.4 の問 4 (ii)): draw を「種類を先に選ぶ」に変えて、種類ごとに 2 問・2 社 (やさしい 34 問・むずかしい 61 問) にしたとき ----
// 手順 (単純な版): 枠ごとに異変の有無を引く → 異変の枠は、段が狙い以下の種類のうち、まだ使っていない会社の問題を持つ種類を一様に選び、その種類の問題 (会社が未使用のもの) を一様に選ぶ
// → 正常の枠は、未使用の会社を一様に選ぶ。選べなければ「出題できない」。測るもの: (a) 枠の群ごとの種類の出方 (b) 出題できない率 (c) 会社ごとの「異変の問題が出る割合」(R-S5 (b) の保証: 会社から答えが漏れない)
function drawKindFirst(pool: P[], rng: () => number): P[] | null {
  const flags = Array.from({ length: ROUNDS }, () => rng() < 0.5);
  const used = new Set<string>(); const out: P[] = [];
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
  for (let slot = 0; slot < ROUNDS; slot++) {
    const target = TIER_BY_ROUND[slot]!;
    if (flags[slot]) {
      const ps = pool.filter((p) => p.kind !== null && (p.tier ?? 1) <= target && !used.has(p.companyId));
      const kinds = [...new Set(ps.map((p) => p.kind!))];
      if (kinds.length === 0) return null;
      const k = pick(kinds); const p = pick(ps.filter((x) => x.kind === k)); used.add(p.companyId); out.push(p);
    } else {
      const ps = pool.filter((p) => p.kind === null && !used.has(p.companyId));
      if (ps.length === 0) return null;
      const p = pick(ps); used.add(p.companyId); out.push(p);
    }
  }
  return out;
}
for (const [name, kinds, count, obj] of [['やさしい', EASY, 2, new Map(EASY.map(([k, , o]) => [k, o]))], ['むずかしい', HARD, 2, new Map(HARD.map(([k, , o]) => [k, o]))]] as const) {
  const pl = pool([...kinds], () => count);
  let fails = 0; const runs = 10000;
  const counts = GROUPS.map(() => new Map<string, number>()); const tot = GROUPS.map(() => 0);
  const appear = new Map<string, number>(), anom = new Map<string, number>();
  for (let seed = 1; seed <= runs; seed++) {
    const ps = drawKindFirst(pl, mulberry32(seed));
    if (ps === null) { fails++; continue; }
    ps.forEach((p, slot) => {
      appear.set(p.companyId, (appear.get(p.companyId) ?? 0) + 1);
      if (p.kind === null) return;
      anom.set(p.companyId, (anom.get(p.companyId) ?? 0) + 1);
      const gi = GROUPS.findIndex(([, ss]) => ss.includes(slot)); const o = obj.get(p.kind)!; counts[gi]!.set(o, (counts[gi]!.get(o) ?? 0) + 1); tot[gi]!++;
    });
  }
  const lines = GROUPS.map(([g], gi) => { const c = [...counts[gi]!.entries()].sort((a, b) => b[1] - a[1]); return `${g}: ${c.length} 種類・最多 ${c[0]![0]} ${(c[0]![1] / tot[gi]! * 100).toFixed(1)}%`; });
  const ratios = CO.map((c) => (anom.get(c) ?? 0) / (appear.get(c) ?? 1));
  console.log(`${name} 種類先 (種類ごとに 2 問・2 社): 出題できない ${fails}/${runs} (${(fails / runs * 100).toFixed(2)}%)\n   ${lines.join('\n   ')}\n   会社ごとの「出たとき異変の問題だった割合」 最小 ${(Math.min(...ratios) * 100).toFixed(1)}%・最大 ${(Math.max(...ratios) * 100).toFixed(1)}% (会社を先に選ぶ今の draw は、枠の異変の有無を先に引くので 50% のまま)`);
}
// 比べる: 会社を先に選ぶ今の draw (累積・5/7 問の推奨のプール) の会社ごとの割合
for (const [name, kinds, count] of [['やさしい', EASY, () => 5], ['むずかしい', HARD, (k: string) => (HARD_PRIMARY.has(k) ? 7 : 5)]] as const) {
  const pl = pool([...kinds], count); const appear = new Map<string, number>(), anom = new Map<string, number>();
  for (let seed = 1; seed <= 10000; seed++) for (const p of draw(pl, mulberry32(seed), true)) { appear.set(p.companyId, (appear.get(p.companyId) ?? 0) + 1); if (p.kind !== null) anom.set(p.companyId, (anom.get(p.companyId) ?? 0) + 1); }
  const ratios = CO.map((c) => (anom.get(c) ?? 0) / (appear.get(c) ?? 1));
  console.log(`${name} 会社先 (累積・推奨のプール): 会社ごとの「出たとき異変の問題だった割合」 最小 ${(Math.min(...ratios) * 100).toFixed(1)}%・最大 ${(Math.max(...ratios) * 100).toFixed(1)}%`);
}
