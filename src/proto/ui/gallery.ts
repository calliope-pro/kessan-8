// 見え方の確認用ページ (?mode=gallery): 設計 §3.2 #141-3 の E-21・E-22・E-24〜E-28 の見え方を、1 つの正常な問題から全部並べる。
// 初見の遊び手に見せて「おかしいと分かるか」を確かめる材料 (設計 §3.4 の未確認)。「朱書きを出す」で、答え合わせの見え方も見られる。
import type { Company, Problem } from '../../domain/types';
import { deriveCards, locate } from '../cards';
import { galleryEntries } from '../gallery';
import { h, screenHeading } from './dom';
import { renderSlip } from './slip';

export function mountGallery(root: HTMLElement, normals: readonly Problem[], companies: readonly Company[]): void {
  const base = normals.find((p) => p.id === 'easy-017') ?? normals[0]!;
  const company = (p: Problem) => companies.find((c) => c.id === p.companyId)!;
  const entries = galleryEntries(base);
  const toggle = h('input', { type: 'checkbox', id: 'show-marks' });
  const list = h('div', { class: 'gallery' });

  function render(): void {
    const marked = toggle.checked;
    const items = [
      h('section', { class: 'gallery-item', 'data-variant': '正常' },
        h('h2', { class: 'gallery-title' }, '正常 (いつも通り)'),
        h('p', { class: 'lead' }, '基準のカード。ほかの見え方は、これからずれている。'),
        renderSlip(deriveCards(base, company(base), 'easy'))),
      ...entries.map((e) => {
        const card = deriveCards(e.problem, company(e.problem), 'easy', e.edits);
        return h('section', { class: 'gallery-item', 'data-variant': e.variant },
          h('h2', { class: 'gallery-title' }, e.variant),
          h('p', { class: 'lead' }, e.explanation),
          renderSlip(card, { marks: marked ? locate(card, e.places) : [] }));
      }),
    ];
    list.replaceChildren(...items);
  }
  toggle.addEventListener('change', render);
  render();
  root.replaceChildren(
    h('div', { class: 'stage' },
      h('header', { class: 'checks' }, screenHeading('見え方の一覧 (やさしい)')),
      h('main', { class: 'desk wide' },
        h('p', { class: 'lead' }, `E-21 (カンマ)・E-22 (重複)・E-24 (売上高 < 営業利益)・E-25 (△)・E-26 (添え字)・E-27 (X)・E-28 (32 日) の見え方。会社は ${company(base).name}、期は ${base.tanshin.header.periodLabel}。`),
        h('label', { class: 'toggle', for: 'show-marks' }, toggle, '朱書き (答え合わせ) を出す'),
        list),
      h('footer', { class: 'actions single' }, h('a', { class: 'seal primary', href: '?mode=play' }, h('span', {}, '遊びへ')))),
  );
}
