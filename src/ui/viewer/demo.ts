// E2E 用の入口 (VIEWER_DEMO=1 のビルドだけ。公開の dist には入らない。docs/test-cases/viewer.md §6・§6.1)。
// createViewer に渡す状態 (view・marks・highlights・mode) を、このページの小さな状態で持つ。#61 が本物の画面の通しの E2E を作ったら外す。
import type { ScreenRef } from '../../domain/screen';
import type { AnomalyPlace, Problem } from '../../domain/types';
import type { ViewerProps } from '../viewer-port';
import { createViewer } from './index';
import { fullProblem, normalProblem, okuProblem } from './testing';

const PROBLEMS: Record<string, () => Problem> = { normal: normalProblem, full: fullProblem, oku: okuProblem };

const q = new URLSearchParams(location.search);
const problem = (PROBLEMS[q.get('problem') ?? 'normal'] ?? normalProblem)();
const state: ViewerProps = {
  problem,
  view: { doc: 'tanshin', screen: 'summary' } as ScreenRef,
  marks: [],
  highlights: [],
  mode: q.get('mode') === 'check' ? 'check' : 'read',
};

// ?manual=1: onView で update しない (見る画面の持ち主が #28 の状態で、ビューアはひとりでに画面を替えない確認用)
const manual = q.get('manual') === '1';
const events: { type: 'view' | 'mark'; value: unknown }[] = [];
const host = document.getElementById('root')!;
const viewer = createViewer(host, {
  onView(ref) {
    events.push({ type: 'view', value: ref });
    if (manual) return;
    state.view = ref;
    viewer.update({ ...state });
  },
  onToggleMark(key) {
    events.push({ type: 'mark', value: key });
    state.marks = state.marks.includes(key) ? state.marks.filter((k) => k !== key) : [...state.marks, key];
    viewer.update({ ...state });
  },
});
viewer.update({ ...state });

declare global {
  interface Window {
    __viewerDemo: {
      events: typeof events;
      state: ViewerProps;
      set(patch: Partial<ViewerProps> & { highlights?: AnomalyPlace[] }): void;
    };
  }
}
window.__viewerDemo = {
  events,
  state,
  set(patch) {
    Object.assign(state, patch);
    viewer.update({ ...state });
  },
};
