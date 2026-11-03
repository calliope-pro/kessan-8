// ViewScreen (buildScreen の出力) → DOM。資料の本体は全社・全問で同じ書式 (docs/test-cases/viewer.md F13)。
import { h } from './dom';
import type { ViewCell, ViewChart, ViewColumn, ViewRow, ViewScreen, ViewSection } from './types';

/** セル 1 つの要素。data-path が印・強調・検算の単位。 */
export function cellEl(cell: ViewCell, tag: 'td' | 'span' | 'p' = 'span', extraClass = ''): HTMLElement {
  return h(tag, { class: `v-cell cell-${cell.kind} ${extraClass}`.trim(), 'data-path': cell.path, 'data-kind': cell.kind, 'data-stage': cell.stage ?? undefined }, cell.text);
}

function headEl(col: ViewColumn): HTMLElement {
  const th = h('th', { scope: 'col', class: 'v-col-head' }, h('span', { class: 'v-col-label' }, col.label));
  if (col.cell) th.append(' ', cellEl(col.cell, 'span', 'v-col-cell'));
  return th;
}

function rowEl(row: ViewRow, width: number): HTMLElement {
  const tr = h('tr', { class: row.emphasis ? 'v-row v-emph' : 'v-row' });
  tr.append(h('th', { scope: 'row', class: 'v-row-label', 'data-item-key': row.itemKey }, row.label));
  for (let i = 0; i < width; i++) {
    const cell = row.cells[i] ?? null;
    tr.append(cell ? cellEl(cell, 'td') : h('td', { class: 'v-cell v-cell-empty' }));
  }
  return tr;
}

function sectionEl(sec: ViewSection): HTMLElement {
  const width = sec.columns.length;
  const el = h('section', { class: 'v-sec' });
  if (sec.title !== null || sec.titleCell) {
    const title = h('h3', { class: 'v-sec-title' }, sec.title);
    if (sec.titleCell) title.append(sec.title ? ' ' : '', cellEl(sec.titleCell, 'span', 'v-sec-name'));
    el.append(title);
  }
  const table = h('table', { class: 'v-tbl' });
  const showHead = sec.columns.some((c) => c.label !== '' || c.cell);
  if (showHead) table.append(h('thead', {}, h('tr', {}, h('td', { class: 'v-corner' }), ...sec.columns.map(headEl))));
  table.append(h('tbody', {}, ...sec.rows.map((r) => rowEl(r, width))));
  el.append(table);
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string>): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** グラフ: 棒の高さは fraction (大きい方 = 1) どおり。軸の下端は目盛りの値のセルで示す。SVG の属性で描く (style 属性は使わない)。 */
function chartEl(chart: ViewChart): HTMLElement {
  const bars = chart.bars.map((b) => {
    const height = Math.round(b.fraction * 100);
    const art = svg('svg', { class: 'v-bar-svg', viewBox: '0 0 48 100', preserveAspectRatio: 'none', role: 'img', 'aria-label': `${b.stage === 'previous' ? '前期' : '当期'} ${b.cell.text}` });
    art.append(svg('rect', { class: 'v-bar-rect', x: '6', width: '36', y: String(100 - height), height: String(height) }));
    const li = h('li', { class: 'v-bar v-cell v-cell-money', 'data-path': b.cell.path, 'data-kind': b.cell.kind, 'data-stage': b.stage, 'data-fraction': String(b.fraction) });
    li.append(art, h('span', { class: 'v-bar-value' }, b.cell.text), h('span', { class: 'v-bar-label' }, b.stage === 'previous' ? '前期' : '当期'));
    return li;
  });
  return h('figure', { class: 'v-chart' },
    h('figcaption', { class: 'v-chart-title', 'data-item-key': chart.itemKey }, chart.label),
    h('ul', { class: 'v-bars' }, ...bars),
    h('p', { class: 'v-axis' }, h('span', { class: 'v-axis-label', 'data-item-key': chart.axisItemKey }, chart.axisLabel), ' ', cellEl(chart.axisMin, 'span', 'v-axis-value')),
  );
}

export function renderScreen(screen: ViewScreen): HTMLElement {
  const { header } = screen;
  const head = h('div', { class: 'v-doc-head' },
    h('p', { class: 'v-doc-company' }, cellEl(header.companyName), ' ', h('span', { class: 'v-doc-code' }, '(', cellEl(header.securitiesCode), ')')),
    h('p', { class: 'v-doc-meta' }, cellEl(header.periodLabel), h('span', { class: 'v-doc-unit' }, '単位: ', cellEl(header.unit))),
  );
  for (const extra of header.extra ?? []) head.append(h('p', { class: 'v-doc-extra' }, '前期末 ', cellEl(extra)));
  const article = h('article', { class: `v-screen screen-${screen.doc}`, 'data-doc': screen.doc, 'data-screen': screen.id }, head);
  article.append(...screen.sections.map(sectionEl), ...screen.charts.map(chartEl));
  if (screen.sentences.length) {
    article.append(h('ul', { class: 'v-statements' }, ...screen.sentences.map((s) => h('li', {}, cellEl(s, 'p', 'v-statement')))));
  }
  return article;
}
