// 問題の全セルを path で引く (検算が、別の画面で付けた印のセルも引けるように)。問題ごとに 1 回だけ作る。
import type { CalcCell } from '../../domain/calc';
import type { Problem } from '../../domain/types';
import { screenCells } from './elements';
import { buildScreen, SCREEN_ORDER } from './model';

const cache = new WeakMap<Problem, Map<string, CalcCell>>();

/** `<doc>.<path>` → 検算のセル。order は 10 画面を通した順。 */
export function cellLookup(problem: Problem): Map<string, CalcCell> {
  const hit = cache.get(problem);
  if (hit) return hit;
  const map = new Map<string, CalcCell>();
  SCREEN_ORDER.forEach((ref, screenIndex) => {
    const s = buildScreen(problem, ref.doc, ref.screen);
    const cells = screenCells(s);
    for (const c of cells) {
      if (!map.has(c.path)) map.set(c.path, { path: c.path, value: c.value, kind: c.kind, unit: c.unit, stage: c.stage, order: screenIndex * 100000 + c.order });
    }
  });
  cache.set(problem, map);
  return map;
}
