// DW35 (docs/test-cases/domain-v3.md §1.5): 本番のプール (`src/data`) に draw・R-S6・会社から答えが漏れないことの確かめを当てる。
// 試験用の推奨のプールにしか当たらないと、データの Task (#139・#140) が作る実際のプール (期を足した構成など) で偏りや漏れが出ても CI で見えない (#155 包括レビュー N1)。
// **データ v3 の件数 (設計 v3 §1.5: やさしい 85 問・むずかしい 132 問) に達した難易度にだけ当てる**。今のデータ (v2。25 問・32 問) は R-S6 (c) を満たさない (測った: 最大 ÷ 一様 = 2.8 倍) ので、
// 満たさないことを確かめるのでなく、データ v3 が入ると自動で効き始める。
import { describe, expect, it } from 'vitest';
import { CARD_POOL_SIZE } from '../domain/config';
import { canDraw, draw } from '../domain/draw';
import { mulberry32 } from '../domain/rng';
import { checkGroups, kindsOfPool, simulate } from '../testing/rs6';
import { pools } from './index';

/** 設計 v3 §1.5 の問題の数 (config の CARD_POOL_SIZE。検証器 #138 と同じ出所)。 */
const V3_SIZE = CARD_POOL_SIZE;
const LAPS = 10_000;
const LONG = 120_000;

for (const d of ['easy', 'hard'] as const) {
  const pool = pools.byDifficulty[d];
  const ready = pool.length >= V3_SIZE[d] && canDraw(pool, d);
  const when = it.skipIf(!ready);

  describe(`本番のプール (${d}。${pool.length} 問。データ v3 = ${V3_SIZE[d]} 問以上で canDraw が true のときだけ当てる)`, () => {
    when('DW35a: 種 1〜100・比 0.5 で毎回 8 枠引け、問題も会社も重複しない', () => {
      for (let seed = 1; seed <= 100; seed++) {
        const rs = draw(pool, { difficulty: d, rng: mulberry32(seed) });
        expect(rs).toHaveLength(8);
        expect(new Set(rs.map((r) => r.problem.id)).size).toBe(8);
        expect(new Set(rs.map((r) => r.problem.companyId)).size).toBe(8);
      }
    });

    when('DW35b: R-S6 (a)(b)(c) — 異変の枠の割合 0.5 ± 1.5 ポイント・どの種類も出る・群ごとの最大の割合が一様の 1.5 倍以内で、出る ID が群の候補と同じ', () => {
      const kinds = kindsOfPool(pool, d);
      const r = simulate(pool, d, { laps: LAPS });
      expect(Math.abs(r.anomalySlots / r.slots - 0.5)).toBeLessThanOrEqual(0.015);
      expect(new Set(r.kindCounts.flatMap((m) => [...m.keys()]))).toEqual(new Set(kinds.map((k) => k.id)));
      checkGroups(r, kinds).forEach((c, gi) => {
        expect(c.sameIds, `群 ${gi}`).toBe(true);
        expect(c.maxRatio, `群 ${gi}`).toBeLessThanOrEqual(1.5);
      });
    }, LONG);

    when('DW35c: 履歴を引き継ぐ (正答率 0.85・3 万周) でも R-S6 (c) が 1.5 倍以内で、会社から答えが漏れない (前の周で正常だった会社・それ以外の P(異変) が 0.5 ± 2 ポイント)', () => {
      const kinds = kindsOfPool(pool, d);
      const r = simulate(pool, d, { laps: 30_000, carry: true, accuracy: 0.85 });
      checkGroups(r, kinds).forEach((c, gi) => expect(c.maxRatio, `群 ${gi}`).toBeLessThanOrEqual(1.5));
      const p = (b: { anomaly: number; total: number }): number => b.anomaly / b.total;
      expect(Math.abs(p(r.afterNormal) - 0.5), `前の周で正常だった会社 ${p(r.afterNormal).toFixed(3)}`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(p(r.others) - 0.5), `それ以外 ${p(r.others).toFixed(3)}`).toBeLessThanOrEqual(0.02);
    }, LONG);
  });
}
