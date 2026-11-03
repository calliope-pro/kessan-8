// 仮の資料表示。資料束の表示 (Task #57) が届くまで、#28 の画面を通すための最小の実装 (viewer-port.ts の約束どおり)。
// 資料束のすべての値を、`data-path` を付けた要素に出す。製品の表示 (書式・タブの名前・道具) は #57 の実物に替える (src/ui/viewer-impl.ts の import を替える)。
import { itemKey } from '../domain/labels';
import type { ScreenRef } from '../domain/screen';
import { IR_SLIDES, TANSHIN_SCREENS } from '../domain/types';
import type { AnomalyPlace, DocKind, Problem } from '../domain/types';
import { h } from './dom';
import type { CreateViewer, ViewerEvents, ViewerProps } from './viewer-port';

const DOC_NAMES: Record<DocKind, string> = { tanshin: '決算短信', ir: 'IR スライド' };
const SCREEN_NAMES: Record<string, string> = {
  summary: 'サマリー', balanceSheet: '貸借', incomeStatement: '損益', cashFlow: 'CF', notes: '注記',
  highlights: '要点', results: '業績', segments: '事業別', outlook: '見通し', supplement: '補足',
};

function leaves(value: unknown, path: string[], out: [string, string][]): void {
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leaves(v, [...path, k], out);
  } else out.push([path.join('.'), String(value)]);
}

function screenLeaves(problem: Problem, view: ScreenRef): [string, string][] {
  const doc = view.doc === 'tanshin' ? problem.tanshin : problem.ir;
  const out: [string, string][] = [];
  leaves(doc.header, ['header'], out);
  leaves((doc as unknown as Record<string, unknown>)[view.screen], [view.screen], out);
  return out;
}

function hits(place: AnomalyPlace, doc: DocKind, path: string): { cell: boolean; row: boolean } {
  if (place.doc !== doc) return { cell: false, row: false };
  if ('itemKey' in place) return { cell: false, row: itemKey(doc, path) === place.itemKey };
  const key = `${doc}.${place.path}`;
  const mine = `${doc}.${path}`;
  return { cell: mine === key || mine.startsWith(`${key}.`) || key.startsWith(`${mine}.`), row: false };
}

export const createViewer: CreateViewer = (host: HTMLElement, events: ViewerEvents) => {
  const tabs = h('div', { class: 'stub-tabs', role: 'tablist' });
  const body = h('div', { class: 'paper' });
  const bar = h('div', { class: 'stub-toolbar', hidden: true });
  host.replaceChildren(tabs, body, bar);

  function update(next: ViewerProps): void {
    const { view, problem, marks, highlights, mode } = next;
    const refs: ScreenRef[] = [
      ...TANSHIN_SCREENS.map((screen) => ({ doc: 'tanshin', screen }) as ScreenRef),
      ...IR_SLIDES.map((screen) => ({ doc: 'ir', screen }) as ScreenRef),
    ];
    tabs.replaceChildren(
      ...refs.map((ref) => {
        const selected = ref.doc === view.doc && ref.screen === view.screen;
        return h('button', {
          type: 'button', role: 'tab', class: 'btn', 'aria-selected': selected ? 'true' : 'false',
          onclick: () => events.onView(ref),
        }, `${DOC_NAMES[ref.doc]} ${SCREEN_NAMES[ref.screen] ?? ref.screen}`);
      }),
    );
    const dl = h('dl', { class: 'stub-cells' });
    for (const [path, value] of screenLeaves(problem, view)) {
      const key = `${view.doc}.${path}`;
      const rowHit = highlights.some((p) => hits(p, view.doc, path).row);
      const cellHit = highlights.some((p) => hits(p, view.doc, path).cell);
      dl.append(
        h('dt', { 'data-item-key': itemKey(view.doc, path), 'data-highlight': rowHit ? 'true' : undefined }, path),
        h('dd', {
          'data-path': key,
          'data-marked': marks.includes(key) ? 'true' : undefined,
          'data-highlight': cellHit ? 'true' : undefined,
          tabindex: mode === 'read' ? 0 : undefined,
          onclick: mode === 'read' ? () => events.onToggleMark(key) : undefined,
        }, value),
      );
    }
    body.replaceChildren(dl);
    bar.hidden = mode !== 'read';
    bar.replaceChildren(h('span', {}, `印 ${marks.length}`), ...(mode === 'read' && next.toolbarEnd ? [next.toolbarEnd] : []));
  }

  return { update, destroy: () => host.replaceChildren() };
};
