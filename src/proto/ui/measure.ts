// 測定用の画面 (?measure=1): 320 px で 7 桁の金額が、桁マスに 18 px 以上で収まるかを測る (Sub-task #149)。
import type { Company, Problem } from '../../domain/types';
import { deriveCards } from '../cards';
import { h } from './dom';
import { renderSlip } from './slip';

export function mountMeasure(root: HTMLElement, normals: readonly Problem[], companies: readonly Company[]): void {
  // 実データで 7 桁になる金額: 売上高が最大の正常な問題に、桁ずれ (E-02) を加えたもの
  const biggest = [...normals].sort((a, b) => b.tanshin.incomeStatement.current.netSales - a.tanshin.incomeStatement.current.netSales)[0]!;
  const company = companies.find((c) => c.id === biggest.companyId)!;
  // 売上高の桁がずれた (10 倍) 実データ。7 桁になる (v3 の E-02 は営業利益を変えるので、ここでは直接 10 倍にする)
  const real = structuredClone(biggest);
  real.tanshin.incomeStatement.current.netSales *= 10;
  // 7 桁の最大 (9,999,999): 桁マスの最悪の幅
  const widest = structuredClone(biggest);
  widest.tanshin.incomeStatement.current.netSales = 9999999;
  const slips = [
    h('div', { 'data-measure': 'real' }, renderSlip(deriveCards(real, company, 'easy'))),
    h('div', { 'data-measure': 'widest' }, renderSlip(deriveCards(widest, company, 'easy'))),
  ];
  root.replaceChildren(h('main', { class: 'desk' }, h('p', { class: 'lead' }, '測定用 (7 桁の金額)'), ...slips));
}
