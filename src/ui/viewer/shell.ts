// 資料の切替・タブ・ページ送り (SC4-2・SC4-3)。状態は持たず、見る画面は props.view のとおり。
// 同じ DOM を使い回して update する (読み済は内部の状態)。docs/test-cases/viewer.md F1〜F4・F16。
import type { ScreenRef } from '../../domain/screen';
import type { Viewer, ViewerEvents, ViewerProps } from '../viewer-port';
import { h } from './dom';
import { placeHitsElement } from './highlight';
import { itemMarkKey } from './keys';
import { buildScreen, SCREEN_ORDER, screenTitle, tabLabel } from './model';
import { renderScreen } from './render';
import { createToolbar } from './toolbar';
import './viewer.css';

const DOCS = [
  { doc: 'tanshin', label: '決算短信' },
  { doc: 'ir', label: 'IR スライド' },
] as const;

const same = (a: ScreenRef, b: ScreenRef) => a.doc === b.doc && a.screen === b.screen;
const indexOf = (ref: ScreenRef) => SCREEN_ORDER.findIndex((r) => same(r, ref));

export function createViewer(host: HTMLElement, events: ViewerEvents): Viewer {
  const root = h('div', { class: 'viewer', 'data-mode': 'read' });
  const docTabs = h('div', { class: 'tabs tabs-doc', role: 'tablist', 'aria-label': '資料' });
  const screenTabs = h('div', { class: 'tabs tabs-screen', role: 'tablist', 'aria-label': '画面' });
  const title = h('h2', { class: 'page-title' });
  const prev = h('button', { type: 'button', class: 'pager-btn', 'data-dir': 'prev' }, '前へ');
  const next = h('button', { type: 'button', class: 'pager-btn', 'data-dir': 'next' }, '次へ');
  const body = h('div', { class: 'viewer-body' });
  const toolbar = createToolbar();
  const top = h('header', { class: 'viewer-top' }, docTabs, screenTabs);
  root.append(top, h('div', { class: 'page-bar' }, prev, title, next), body, toolbar.el);
  host.append(root);

  let props: ViewerProps | null = null;
  let shownProblem: ViewerProps['problem'] | null = null;
  let shownView: ScreenRef | null = null;
  const visited = new Set<string>();
  const lastOf: Record<string, ScreenRef> = {};

  const go = (ref: ScreenRef | undefined) => {
    if (ref) events.onView(ref);
  };
  prev.addEventListener('click', () => go(props ? SCREEN_ORDER[indexOf(props.view) - 1] : undefined));
  next.addEventListener('click', () => go(props ? SCREEN_ORDER[indexOf(props.view) + 1] : undefined));
  docTabs.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-doc-tab]');
    if (!t || !props) return;
    const doc = t.dataset.docTab as ScreenRef['doc'];
    go(lastOf[doc] ?? SCREEN_ORDER.find((r) => r.doc === doc));
  });
  screenTabs.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-screen-tab]');
    if (!t || !props) return;
    go(SCREEN_ORDER.find((r) => r.doc === props!.view.doc && r.screen === t.dataset.screenTab));
  });
  const onKey = (e: KeyboardEvent) => {
    if (!props || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'ArrowLeft') go(SCREEN_ORDER[indexOf(props.view) - 1]);
    else if (e.key === 'ArrowRight') go(SCREEN_ORDER[indexOf(props.view) + 1]);
  };
  document.addEventListener('keydown', onKey);

  function paintTabs(view: ScreenRef) {
    docTabs.replaceChildren(
      ...DOCS.map((d) => {
        const selected = d.doc === view.doc;
        return h('button', { type: 'button', role: 'tab', class: 'tab', 'data-doc-tab': d.doc, 'aria-selected': String(selected) }, d.label);
      }),
    );
    screenTabs.replaceChildren(
      ...SCREEN_ORDER.filter((r) => r.doc === view.doc).map((r) =>
        h('button', {
          type: 'button',
          role: 'tab',
          class: 'tab',
          'data-screen-tab': r.screen,
          'aria-selected': String(r.screen === view.screen),
          'data-visited': visited.has(`${r.doc}.${r.screen}`) ? 'true' : undefined,
        }, tabLabel(r)),
      ),
    );
    const i = indexOf(view);
    prev.disabled = i <= 0;
    next.disabled = i >= SCREEN_ORDER.length - 1;
  }

  /** 印を付けられる要素 (場所になりうる要素すべて): 数字・文・見出し・単位・グラフの棒 = data-path、行の名前 = data-item-key。 */
  const targets = () => [...body.querySelectorAll<HTMLElement>('[data-path],[data-item-key]')];
  const markKeyOf = (el: HTMLElement): string => {
    if (el.dataset.path) return el.dataset.path;
    const key = el.dataset.itemKey ?? '';
    return itemMarkKey(key.startsWith('ir.') ? 'ir' : 'tanshin', key);
  };
  /** 印スイッチが入っていて、押せる (read) か。 */
  const active = () => toolbar.marking && props?.mode === 'read';

  /** 印・強調・押せる要素の属性を、props のとおりにそろえる。画面の要素は作り直さない。 */
  function paint() {
    if (!props) return;
    const marks = new Set(props.marks);
    const canPress = active();
    root.dataset.marking = String(canPress);
    for (const el of targets()) {
      const marked = marks.has(markKeyOf(el));
      if (marked) el.dataset.marked = 'true';
      else delete el.dataset.marked;
      if (canPress) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-pressed', String(marked));
      } else {
        el.removeAttribute('role');
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-pressed');
      }
      const ref = el.dataset.path ? { path: el.dataset.path } : { itemKey: el.dataset.itemKey };
      if (props.highlights.some((pl) => placeHitsElement(pl, ref))) el.dataset.highlight = 'true';
      else delete el.dataset.highlight;
    }
    toolbar.el.hidden = props.mode !== 'read';
    toolbar.update(props.problem, props.marks, props.mode === 'read' ? props.toolbarEnd : undefined);
  }

  const press = (el: HTMLElement | null) => {
    if (el && active()) events.onToggleMark(markKeyOf(el));
  };
  body.addEventListener('click', (e) => press((e.target as HTMLElement).closest<HTMLElement>('[data-path],[data-item-key]')));
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-path],[data-item-key]');
    if (el && el === e.target) {
      e.preventDefault();
      press(el);
    }
  });
  // 印スイッチの切り替えで行の高さが変わるとき、見ていた行の画面上の位置を保つ (SC4-4)
  toolbar.onSwitch(() => {
    const edge = top.getBoundingClientRect().bottom;
    const anchor = [...body.querySelectorAll<HTMLElement>('tr.row')].find((r) => r.getBoundingClientRect().bottom > edge + 1);
    const before = anchor?.getBoundingClientRect().top;
    paint();
    if (anchor && before !== undefined) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
  });

  return {
    update(next_: ViewerProps) {
      props = next_;
      root.dataset.mode = next_.mode;
      const problemChanged = shownProblem !== next_.problem;
      const viewChanged = problemChanged || !shownView || !same(shownView, next_.view);
      if (!viewChanged) {
        paint();
        return;
      }
      if (problemChanged) {
        visited.clear();
        for (const k of Object.keys(lastOf)) delete lastOf[k];
      }
      visited.add(`${next_.view.doc}.${next_.view.screen}`);
      lastOf[next_.view.doc] = next_.view;
      const firstPaint = shownView === null;
      shownProblem = next_.problem;
      shownView = next_.view;
      paintTabs(next_.view);
      title.textContent = screenTitle(next_.view);
      body.replaceChildren(renderScreen(buildScreen(next_.problem, next_.view.doc, next_.view.screen)));
      paint();
      if (!firstPaint) window.scrollTo(0, 0);
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
