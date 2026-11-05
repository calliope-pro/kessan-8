// 本番の `visible` (出題の「その問題が見える形」。ケース表 docs/test-cases/domain-v2.md §1.5)。
// 検証器の `visibleShapes` (R-S4) を、会社と異変の種類を束ねて `draw`・`canDraw` に渡せる形にする。出所は検証器の 1 か所。
import type { AnomalyKind, Company, Problem, ShapeId } from '../domain/types';
import { visibleShapes } from '../verifier/cards';

/** 問題ごとに結果を覚える (検証器は 1 問 0.2 ms ほどかかるので、出題のたびに回さない)。一覧に無い会社の問題は例外 (データの誤りを黙って通さない)。 */
export function makeVisible(companies: readonly Company[], kinds: readonly AnomalyKind[]): (problem: Problem) => readonly ShapeId[] {
  const companyOf = new Map(companies.map((c) => [c.id, c]));
  const kindList = [...kinds];
  const memo = new WeakMap<Problem, ShapeId[]>();
  return (problem) => {
    const known = memo.get(problem);
    if (known !== undefined) return known;
    const company = companyOf.get(problem.companyId);
    if (company === undefined) throw new Error(`会社が見つかりません: ${problem.companyId} (問題 ${problem.id})`);
    const shapes = visibleShapes(problem, company, kindList);
    memo.set(problem, shapes);
    return shapes;
  };
}
