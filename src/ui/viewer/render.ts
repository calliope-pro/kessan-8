// ViewScreen (buildScreen の出力) → DOM。資料の本体は全社・全問で同じ書式 (docs/test-cases/viewer.md F13)。
import { h } from './dom';
import type { ViewCell, ViewColumn, ViewRow, ViewScreen, ViewSection } from './types';

/** セル 1 つの要素。data-path が印・強調・検算の単位。 */
export function cellEl(cell: ViewCell, tag: 'td' | 'span' | 'p' = 'span', extraClass = ''): HTMLElement {
  return h(tag, { class: `cell cell-${cell.kind} ${extraClass}`.trim(), 'data-path': cell.path, 'data-kind': cell.kind, 'data-stage': cell.stage ?? undefined }, cell.text);
}

function headEl(col: ViewColumn): HTMLElement {
  const th = h('th', { scope: 'col', class: 'col-head' }, h('span', { class: 'col-label' }, col.label));
  if (col.cell) th.append(' ', cellEl(col.cell, 'span', 'col-cell'));
  return th;
}

function rowEl(row: ViewRow, width: number): HTMLElement {
  const tr = h('tr', { class: row.emphasis ? 'row emph' : 'row' });
  tr.append(h('th', { scope: 'row', class: 'row-label', 'data-item-key': row.itemKey }, row.label));
  for (let i = 0; i < width; i++) {
    const cell = row.cells[i] ?? null;
    tr.append(cell ? cellEl(cell, 'td') : h('td', { class: 'cell cell-empty' }));
  }
  return tr;
}

function sectionEl(sec: ViewSection): HTMLElement {
  const width = sec.columns.length;
  const el = h('section', { class: 'sec' });
  if (sec.title !== null || sec.titleCell) {
    const title = h('h3', { class: 'sec-title' }, sec.title);
    if (sec.titleCell) title.append(sec.title ? ' ' : '', cellEl(sec.titleCell, 'span', 'sec-name'));
    el.append(title);
  }
  const table = h('table', { class: 'tbl' });
  const showHead = sec.columns.some((c) => c.label !== '' || c.cell);
  if (showHead) table.append(h('thead', {}, h('tr', {}, h('td', { class: 'corner' }), ...sec.columns.map(headEl))));
  table.append(h('tbody', {}, ...sec.rows.map((r) => rowEl(r, width))));
  el.append(table);
  return el;
}

export function renderScreen(screen: ViewScreen): HTMLElement {
  const { header } = screen;
  const head = h('div', { class: 'doc-head' },
    h('p', { class: 'doc-company' }, cellEl(header.companyName), ' ', h('span', { class: 'doc-code' }, '(', cellEl(header.securitiesCode), ')')),
    h('p', { class: 'doc-meta' }, cellEl(header.periodLabel), h('span', { class: 'doc-unit' }, '単位: ', cellEl(header.unit))),
  );
  for (const extra of header.extra ?? []) head.append(h('p', { class: 'doc-extra' }, '前期末 ', cellEl(extra)));
  const article = h('article', { class: `screen screen-${screen.doc}`, 'data-doc': screen.doc, 'data-screen': screen.id }, head);
  article.append(...screen.sections.map(sectionEl));
  if (screen.sentences.length) {
    article.append(h('ul', { class: 'statements' }, ...screen.sentences.map((s) => h('li', {}, cellEl(s, 'p', 'statement')))));
  }
  return article;
}
