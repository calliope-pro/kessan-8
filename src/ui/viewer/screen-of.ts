// 異変の場所がある画面。「どの場所がどの画面に出るか」を知っているのはビューアの buildScreen だけなので、
// 画面の中身 (セル・行の名前) を引いて、placeHitsElement が当たる最初の画面を返す (single source of truth)。
// 答え合わせの最初の画面 (ANSWER)・「場所 n」のボタンが使う。docs/design.md §4.1。
import type { ScreenRef } from '../../domain/screen';
import type { AnomalyPlace, Problem } from '../../domain/types';
import { screenCells, screenNameKeys } from './elements';
import { placeHitsElement } from './highlight';
import { buildScreen, SCREEN_ORDER } from './model';

interface ScreenIndex {
  ref: ScreenRef;
  paths: string[];
  itemKeys: string[];
}

const cache = new WeakMap<Problem, ScreenIndex[]>();

function indexOf(problem: Problem): ScreenIndex[] {
  const hit = cache.get(problem);
  if (hit) return hit;
  const index = SCREEN_ORDER.map((ref) => {
    const s = buildScreen(problem, ref.doc, ref.screen);
    return { ref, paths: screenCells(s).map((c) => c.path), itemKeys: screenNameKeys(s) };
  });
  cache.set(problem, index);
  return index;
}

/**
 * place の要素 (placeHitsElement が当たるセル・行の名前) がある、通し順で最初の画面。
 * 見出しの場所は、全画面にあるので 1 画面目になる。どこにも当たらなければ、その資料の 1 画面目。
 */
export function screenOfPlace(problem: Problem, place: AnomalyPlace): ScreenRef {
  const mine = indexOf(problem).filter((s) => s.ref.doc === place.doc);
  const found = mine.find((s) => s.paths.some((path) => placeHitsElement(place, { path })) || s.itemKeys.some((itemKey) => placeHitsElement(place, { itemKey })));
  return (found ?? mine[0]!).ref;
}
