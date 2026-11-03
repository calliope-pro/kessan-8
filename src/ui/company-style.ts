// V3: 会社ごとの社色・淡い色を、閲覧票 (資料の外) に当てる。CSP の style-src 'self' は style 属性 (setAttribute('style')) を止めるが、
// CSSOM の custom property の設定 (el.style.setProperty) は止めない (docs/plans/ux-tech-assessment.md §5.4。E25 のコンソールのエラー 0 件が確かめ)。
import type { Company } from '../domain/types';

export function applyCompanyColors(el: HTMLElement, company: Company | undefined): HTMLElement {
  if (company) {
    el.style.setProperty('--company-main', company.colors.main);
    el.style.setProperty('--company-light', company.colors.light);
  }
  return el;
}
