// 場所の取り出し (設計 §4.1 の path)。
import { IR_SLIDES, TANSHIN_SCREENS } from '../domain/types.ts';
import type { DocKind, Problem } from '../domain/types.ts';

const SCREENS: Record<DocKind, readonly string[]> = { tanshin: TANSHIN_SCREENS, ir: IR_SLIDES };

/** doc 内の path の値。`<画面>.unit` は資料の header.unit (画面ごとの単位の場所)。無ければ undefined。 */
export function getPath(problem: Problem, doc: DocKind, path: string): unknown {
  const keys = path.split('.');
  if (keys.length === 2 && keys[1] === 'unit' && SCREENS[doc].includes(keys[0] as string)) return problem[doc].header.unit;
  let node: unknown = problem[doc];
  for (const k of keys) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

/** 短信・IR の数値のセルの `<doc>.<path>` の一覧 (null と文字列は除く)。 */
export function numericCells(problem: Problem): string[] {
  const out: string[] = [];
  const walk = (node: unknown, trail: string[]): void => {
    if (typeof node === 'number') out.push(trail.join('.'));
    else if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...trail, String(i)]));
    else if (typeof node === 'object' && node !== null) {
      for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
    }
  };
  walk(problem.tanshin, ['tanshin']);
  walk(problem.ir, ['ir']);
  return out;
}

/**
 * 2 つの問題の、短信・IR のセルの違い `<doc>.<path>` (docs/design-v2.md §2.8 の changed と比べる)。リーフ (数・文・真偽・null) の違いはそのパス。
 * 配列の要素が片方にしか無い (要素の過不足) ときは、その要素のパス (`ir.segments.items.2`) 1 つで、リーフに分けない。
 */
export function changedCells(base: Problem, other: Problem): string[] {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, trail: string[]): void => {
    const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
    if (isObj(a) && isObj(b)) {
      const keys = Array.isArray(a) && Array.isArray(b) ? [...Array(Math.max(a.length, b.length)).keys()].map(String) : [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) {
        const [x, y] = [a[k], b[k]];
        if (Array.isArray(a) && Array.isArray(b) && (!(k in a) || !(k in b))) out.push([...trail, k].join('.'));
        else walk(x, y, [...trail, k]);
      }
      return;
    }
    if (a !== b) out.push(trail.join('.'));
  };
  walk(base.tanshin, other.tanshin, ['tanshin']);
  walk(base.ir, other.ir, ['ir']);
  return out;
}
