// 印と異変の場所の照合 (R3。experience.md §3.4・SC5-7)。
// 印のキー: 数字・文のセル = `<doc>.<path>` (data-path と同じ)、行の名前 = `<doc>.item:<itemKey>` (src/ui/viewer-port.ts)。
import { itemKey } from './labels';
import type { AnomalyPlace } from './types';

export interface MarkMatch {
  /** 場所に当たった印。 */
  hits: string[];
  /** どの場所にも当たらなかった印 (外れ)。 */
  misses: string[];
  /** 印が当たらなかった場所 (見逃し)。 */
  missed: AnomalyPlace[];
}

function markHitsPlace(mark: string, place: AnomalyPlace): boolean {
  if ('path' in place) {
    // 同じキー・祖先・子孫 (. 区切りの前方一致) で当たり。行の名前の印は当たりにしない (#57 の強調 data-highlight と同じ規則)
    const key = `${place.doc}.${place.path}`;
    if (mark.startsWith(`${place.doc}.item:`)) return false;
    return mark === key || mark.startsWith(`${key}.`) || key.startsWith(`${mark}.`);
  }
  // itemKey の場所: 行の名前の印か、同じ行の数字の印で当たり (experience.md R3)
  if (mark === `${place.doc}.item:${place.itemKey}`) return true;
  const prefix = `${place.doc}.`;
  return mark.startsWith(prefix) && !mark.startsWith(`${prefix}item:`) && itemKey(place.doc, mark.slice(prefix.length)) === place.itemKey;
}

export function matchMarks(marks: readonly string[], places: readonly AnomalyPlace[]): MarkMatch {
  const hits: string[] = [];
  const misses: string[] = [];
  for (const mark of marks) (places.some((p) => markHitsPlace(mark, p)) ? hits : misses).push(mark);
  const missed = places.filter((p) => !marks.some((m) => markHitsPlace(m, p)));
  return { hits, misses, missed };
}
