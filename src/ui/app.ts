// 画面の組み立て。状態 (domain/game.ts の reduce) と、画面だけの状態 (context.ts の Local) から DOM を作り、操作を action にして返す。
// 状態が変わるたびに、走行を保存し (sessionStorage)、判定の書き込みのときだけ記録を更新する (localStorage)。docs/design.md §5.4。
import { draw } from '../domain/draw';
import { FIRST_VIEW, type Action, type GameState, initialState, reduce } from '../domain/game';
import { markSampleSeen, loadRecords, recordTransition, saveRecords } from '../domain/records';
import { mulberry32 } from '../domain/rng';
import type { ScreenRef } from '../domain/screen';
import { loadState, saveState } from '../domain/session';
import type { Difficulty, Problem } from '../domain/types';
import type { AppDeps, Ctx, Local } from './context';
import { button, h } from './dom';
import { MESSAGES as M } from './messages';
import { clearedScreen, restartScreen } from './screens-end';
import { difficultyScreen, helpScreen, sampleScreen, titleScreen } from './screens-entry';
import { introScreen, readingScreen, revealScreen } from './screens-play';
import type { Viewer, ViewerProps } from './viewer-port';

export function mountApp(root: HTMLElement, deps: AppDeps): void {
  let state: GameState = loadState(deps.session, deps.pools.byId) ?? initialState;
  let records = loadRecords(deps.local);
  const local: Local = { screen: 'main', sampleMode: 'browse', sampleFrom: 'difficulty', pending: undefined, sampleView: FIRST_VIEW, confirm: false, panel: false, placeIndex: 0, bestBefore: 0 };

  // 出題できるか (プールが、両方を持つ会社 8 社以上の条件を満たすか)。問題が置かれるまでは「準備中」
  const availability = new Map<Difficulty, boolean>();
  const available = (d: Difficulty): boolean => {
    if (!availability.has(d)) {
      try {
        draw(deps.pools.byDifficulty[d], { difficulty: d, rng: mulberry32(1) });
        availability.set(d, true);
      } catch {
        availability.set(d, false);
      }
    }
    return availability.get(d)!;
  };
  const drawRun = (d: Difficulty): Problem[] | undefined => {
    try {
      const rng = deps.seed !== undefined ? mulberry32(deps.seed + state.draws) : Math.random;
      return draw(deps.pools.byDifficulty[d], { difficulty: d, rng, history: records[d].history });
    } catch {
      return undefined;
    }
  };

  // 資料束の表示は、同じ要素を使い回して更新する (印のスイッチ・検算の選択など、表示側の状態を保つ)
  const viewerHost = h('div', { class: 'viewer-host' });
  let viewer: Viewer | undefined;
  let usedViewer = false;
  let lastProps: ViewerProps | undefined;
  let onViewNow: (ref: ScreenRef) => void = () => undefined;

  function dispatch(action: Action): void {
    const prev = state;
    const next = reduce(prev, action);
    if (next === prev) return;
    if (prev.phase === 'reading' && next.phase === 'revealed') local.bestBefore = records[prev.difficulty].best;
    const nextRecords = recordTransition(records, prev, next);
    if (nextRecords !== records) {
      records = nextRecords;
      saveRecords(deps.local, records);
    }
    state = next;
    saveState(deps.session, state);
    switch (action.type) {
      case 'START': case 'TO_TITLE': case 'TO_DIFFICULTY':
        Object.assign(local, { screen: 'main', confirm: false, panel: false, pending: undefined, placeIndex: 0 });
        break;
      case 'PICK': case 'RESTART': case 'NEXT':
        Object.assign(local, { screen: 'intro', confirm: false, panel: false, pending: undefined, placeIndex: 0 });
        break;
      case 'ANSWER':
        Object.assign(local, { screen: 'main', confirm: false, panel: false, placeIndex: 0 });
        break;
      default:
        break;
    }
    // 読んでいる最中の印・ページ送りは、画面を作り直さずに表示だけ更新する (スクロールと表示側の状態を保つ)
    if ((action.type === 'TOGGLE_MARK' || action.type === 'VIEW') && next.phase === 'reading' && viewer && lastProps) {
      lastProps = { ...lastProps, view: next.view, marks: next.marks };
      viewer.update(lastProps);
      return;
    }
    render();
  }

  function patch(change: Partial<Local>): void {
    Object.assign(local, change);
    render();
  }

  const ctx = (): Ctx => ({
    state, local, records, deps, dispatch, patch, available,
    choose(d) {
      if (!available(d)) return;
      if (deps.sample && !records.sampleSeen[d]) patch({ screen: 'sample', sampleMode: 'pre', pending: d, sampleView: FIRST_VIEW });
      else this.begin(d);
    },
    begin(d) {
      records = markSampleSeen(records, d);
      saveRecords(deps.local, records);
      const problems = drawRun(d);
      if (problems) dispatch({ type: 'PICK', difficulty: d, problems });
    },
    restart() {
      if (state.phase === 'cleared') {
        const problems = drawRun(state.difficulty);
        if (problems) dispatch({ type: 'PICK', difficulty: state.difficulty, problems });
      } else if (state.phase === 'revealed') {
        const problems = drawRun(state.difficulty);
        if (problems) dispatch({ type: 'RESTART', problems });
      }
    },
    closeSample: () => patch({ screen: local.sampleFrom === 'help' ? 'help' : 'main', pending: undefined }),
    companyOf: (problem) => deps.companies.find((c) => c.id === problem.companyId),
    viewer(props, onView) {
      onViewNow = onView;
      if (!viewer) viewer = deps.createViewer(viewerHost, { onView: (ref) => onViewNow(ref), onToggleMark: (key) => dispatch({ type: 'TOGGLE_MARK', key }) });
      lastProps = props;
      viewer.update(props);
      usedViewer = true;
      return viewerHost;
    },
    titleLink() {
      const running = state.phase === 'reading' || state.phase === 'revealed';
      if (!local.confirm) return button(M.button.toTitle, () => (running ? patch({ confirm: true }) : dispatch({ type: 'TO_TITLE' })), { class: 'btn btn--link', 'data-testid': 'to-title' });
      return h('div', { class: 'confirm stack', role: 'alertdialog', 'aria-label': M.confirm.heading, 'data-testid': 'confirm' },
        h('strong', {}, M.confirm.heading), h('p', {}, M.confirm.body),
        h('div', { class: 'row' },
          button(M.button.toTitleConfirm, () => dispatch({ type: 'TO_TITLE' }), { class: 'btn btn--danger' }),
          button(M.button.keepPlaying, () => patch({ confirm: false }), { class: 'btn', 'data-autofocus': true })));
    },
  });

  function screenFor(c: Ctx): HTMLElement {
    if (state.phase === 'title') return local.screen === 'help' ? helpScreen(c) : local.screen === 'sample' && deps.sample ? sampleScreen(c) : titleScreen(c);
    if (state.phase === 'difficulty') return local.screen === 'sample' && deps.sample ? sampleScreen(c) : difficultyScreen(c);
    if (state.phase === 'reading') return local.screen === 'intro' ? introScreen(c) : readingScreen(c);
    if (state.phase === 'revealed') return local.screen === 'restart' && !state.correct ? restartScreen(c) : revealScreen(c);
    return clearedScreen(c);
  }

  function stageOf(screen: string): string {
    if (state.phase === 'cleared') return 'morning';
    if ((state.phase === 'reading' || state.phase === 'revealed') && screen !== 'restart') return String(state.round);
    return '0';
  }

  function render(): void {
    const previous = root.firstElementChild?.getAttribute('data-screen') ?? '';
    const y = window.scrollY;
    usedViewer = false;
    const section = screenFor(ctx());
    if (!usedViewer && viewer) {
      viewer.destroy();
      viewer = undefined;
      lastProps = undefined;
    }
    const screen = section.getAttribute('data-screen') ?? '';
    const run = state.phase === 'reading' || state.phase === 'revealed' ? state : undefined;
    const app = h('div', {
      class: 'app', 'data-testid': 'app', 'data-phase': state.phase, 'data-screen': screen, 'data-stage': stageOf(screen),
      'data-problem-id': run?.problems[run.round]?.id, 'data-round': run ? run.round + 1 : undefined, 'data-difficulty': run?.difficulty ?? (state.phase === 'cleared' ? state.difficulty : undefined),
    }, section);
    root.replaceChildren(app);
    if (screen === previous) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      app.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  }

  render();
}
