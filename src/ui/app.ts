// 画面の流れ (docs/screens-v3.md §2・docs/design-v2.md §3.1)。状態機械 (`src/domain/game.ts`) は変えず、描いて、action を送るだけ。
// 状態 title と difficulty は、合成した 1 つのタイトルの画面で描く (難易度のボタンは START → PICK を続けて送る)。記録の画面は状態の外 (UI だけ)。
import { type Card, deriveCards, placeSlots } from '../domain/cards';
import { draw } from '../domain/draw';
import { type Action, type GameState, initialState, reduce } from '../domain/game';
import type { Pools } from '../domain/pool';
import { loadRecords, recordTransition, saveRecords, type KeyValueStore } from '../domain/records';
import { mulberry32 } from '../domain/rng';
import type { Sample } from '../domain/sample';
import { loadState, saveState } from '../domain/session';
import { ROUNDS_TO_CLEAR } from '../domain/config';
import { judge, type Answer } from '../domain/answer';
import type { AnomalyKind, Company, Difficulty, Problem, Round } from '../domain/types';
import { renderCard } from './card';
import { arm, h, scrollMarksIntoView, seal } from './dom';
import { fill, MESSAGES, progressText } from './messages';
import { drawSeed } from './seed';
import { clearSummary, kindStats, poolKinds, recordsNote, titleView } from './stats';

export interface AppEnv {
  pools: Pools;
  companies: readonly Company[];
  kinds: readonly AnomalyKind[];
  sample: Sample;
  session: KeyValueStore;
  local: KeyValueStore;
  seed: number;
}

/** 差し戻しの演出の長さ (約 1 秒。docs/design-v2.md §3.1)。 */
export const REJECT_MS = 1000;

export function mountApp(root: HTMLElement, env: AppEnv): void {
  const pool: Problem[] = [...env.pools.byDifficulty.easy, ...env.pools.byDifficulty.hard];
  let records = loadRecords(env.local);
  let storable = saveRecords(env.local, records); // 書けるかの確認も兼ねる
  let state: GameState = loadState(env.session, (id) => env.pools.byId(id)) ?? initialState;
  let view: 'records' | null = null;
  const startKinds = (d: Difficulty) => [...records[d].kinds];
  let kindsAtStart: string[] = 'difficulty' in state ? startKinds(state.difficulty) : [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stage = h('div', { class: 'stage' });
  root.replaceChildren(stage);
  document.title = MESSAGES.title;

  const company = (id: string): Company => {
    const c = env.companies.find((x) => x.id === id);
    if (!c) throw new Error(`会社がありません: ${id}`);
    return c;
  };
  const rounds = (difficulty: Difficulty): Round[] =>
    draw(pool, { difficulty, rng: mulberry32(drawSeed(env.seed, state.draws)), history: records[difficulty].history, foundKinds: records[difficulty].kinds });

  function dispatch(action: Action): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const next = reduce(state, action);
    if (next === state) return;
    const rec = recordTransition(records, state, next);
    if (rec !== records) {
      records = rec;
      storable = saveRecords(env.local, records);
    }
    if (action.type === 'PICK' && 'difficulty' in next) kindsAtStart = startKinds(next.difficulty);
    state = next;
    view = null;
    saveState(env.session, state);
    render();
  }

  const pick = (difficulty: Difficulty): void => {
    if (state.phase === 'title') dispatch({ type: 'START' });
    dispatch({ type: 'PICK', difficulty, rounds: rounds(difficulty) });
  };

  /** カードに朱で囲む場所 (欄の key)。cardEdits の問題はテンプレートのカードで場所を当てる。 */
  function marksOf(problem: Problem, difficulty: Difficulty): { marks: Set<string>; template: Card } {
    const template = deriveCards(problem, company(problem.companyId), difficulty, { applyEdits: false });
    const j = judge(problem, 'anomaly', env.kinds);
    return { marks: new Set(j.places.flatMap((p) => placeSlots(template, p))), template };
  }
  const cardOf = (problem: Problem, difficulty: Difficulty, o: { reveal?: boolean; example?: boolean } = {}): HTMLElement => {
    const c = company(problem.companyId);
    const card = deriveCards(problem, c, difficulty);
    const { marks, template } = problem.anomaly && o.reveal ? marksOf(problem, difficulty) : { marks: new Set<string>(), template: undefined };
    return renderCard(card, problem.companyId, { marks, ...(template ? { template } : {}), ...(o.example ? { example: true } : {}) });
  };
  const slipOf = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>('.slip')!;

  const header = (label: string, index: number, done: number): HTMLElement => {
    const boxes = h('ol', { class: 'boxes', 'data-testid': 'boxes', 'aria-hidden': 'true' });
    for (let i = 0; i < ROUNDS_TO_CLEAR; i++) boxes.append(h('li', { class: i < done ? 'done' : i === index ? 'now-box' : '' }));
    const left = h('div', { class: 'head-left' }, h('h1', { class: 'now', tabindex: '-1', 'data-testid': 'progress' }, label));
    return h('header', { class: 'checks' }, left, boxes);
  };

  const feedback = (ok: boolean, explanation: string | null): HTMLElement =>
    h('div', { class: 'feedback' },
      h('p', { class: `verdict ${ok ? 'ok' : 'ng'}`, 'data-testid': 'verdict' }, ok ? MESSAGES.result.ok : MESSAGES.result.ng),
      explanation !== null
        ? h('p', { class: 'note', 'data-testid': 'note' }, h('span', { class: 'note-head' }, MESSAGES.result.tag), explanation)
        : h('p', { class: 'lead' }, MESSAGES.result.none));

  function titleScreen(): [HTMLElement, HTMLElement, HTMLElement | null] {
    const v = titleView(pool, records);
    const btn = (d: Difficulty): HTMLButtonElement => {
      const t = v[d];
      const b = seal(MESSAGES.difficulty[d], 'diff primary', () => pick(d), null);
      b.querySelector('span')!.append(h('small', {}, MESSAGES.difficultyNote[d]));
      if (t.best !== null) b.querySelector('span')!.append(h('small', { class: 'best' }, fill(MESSAGES.best, { n: t.best })));
      if (!t.enabled) { b.disabled = true; b.querySelector('span')!.append(h('small', { class: 'soon' }, t.note)); }
      return b;
    };
    const main = h('main', { class: 'desk title-screen', 'data-testid': 'app', tabindex: '-1' },
      h('h1', { class: 'game-title', tabindex: '-1' }, MESSAGES.title),
      h('p', { class: 'lead' }, v.allUnavailable ? MESSAGES.allUnavailable : MESSAGES.tagline),
      h('div', { class: 'diffs' }, btn('easy'), btn('hard')));
    const actions = h('footer', { class: 'actions single' }, seal(MESSAGES.records, 'quiet', () => { view = 'records'; render(); }));
    return [h('span', { class: 'sr' }), main, actions];
  }

  function recordsScreen(): [HTMLElement, HTMLElement, HTMLElement] {
    const kindName = (id: string) => env.kinds.find((k) => k.id === id)?.name ?? id;
    const never = (['easy', 'hard'] as const).every((d) => records[d].best === 0 && records[d].clears === 0 && records[d].kinds.length === 0);
    const main = h('main', { class: 'desk', 'data-testid': 'records', tabindex: '-1' });
    if (never) main.append(h('p', { class: 'lead' }, MESSAGES.recordsScreen.never));
    else {
      for (const d of ['easy', 'hard'] as const) {
        const r = records[d];
        const s = kindStats(records, pool, d);
        const found = new Set(r.kinds);
        const list = h('ul', { class: 'kinds' });
        for (const id of poolKinds(pool, d)) list.append(h('li', { class: found.has(id) ? 'found' : '' }, found.has(id) ? kindName(id) : MESSAGES.recordsScreen.unknown));
        main.append(h('section', { class: 'rec' },
          h('h2', {}, MESSAGES.difficulty[d]),
          h('p', {}, r.best > 0 ? fill(MESSAGES.best, { n: r.best }) : '—', '・', fill(MESSAGES.recordsScreen.clears, { k: r.clears })),
          h('p', {}, fill(MESSAGES.cleared.found, { n: s.n, N: s.N })),
          list));
      }
    }
    const note = recordsNote(storable);
    if (note) main.append(h('p', { class: 'note', 'data-testid': 'not-saved' }, note));
    return [h('header', { class: 'checks' }, h('h1', { class: 'now', tabindex: '-1', 'data-testid': 'progress' }, MESSAGES.recordsScreen.heading)), main, h('footer', { class: 'actions single' }, seal(MESSAGES.back, 'primary', () => { view = null; render(); }))];
  }

  function render(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    let head: HTMLElement, desk: HTMLElement, actions: HTMLElement | null;
    if (view === 'records') [head, desk, actions] = recordsScreen();
    else if (state.phase === 'title' || state.phase === 'difficulty') [head, desk, actions] = titleScreen();
    else if (state.phase === 'sample') {
      const d = state.difficulty;
      head = header(MESSAGES.sample.heading, -1, 0);
      desk = h('main', { class: 'desk', tabindex: '-1' });
      const m = state.missed;
      if (m) {
        // 不正解のあとは、掲示の位置に「さっきの異変」の文 (さっきのカードは出さない)。自己ベストは同じ枠の中の小さな 1 語
        desk.append(h('p', { class: 'note', 'data-testid': 'note' },
          m.problem.anomaly ? fill(MESSAGES.sample.lastAnomaly, { text: m.problem.anomaly.explanation }) : MESSAGES.sample.lastNone,
          records[d].best > 0 ? h('span', { class: 'best-line' }, fill(MESSAGES.best, { n: records[d].best })) : null));
      } else desk.append(h('p', { class: 'lead' }, MESSAGES.sample.bulletin));
      desk.append(cardOf({ ...env.sample.problem, difficulty: d }, d, { example: true }));
      actions = h('footer', { class: 'actions sample-actions' }, seal(MESSAGES.change, 'quiet', () => dispatch({ type: 'TO_TITLE' })), seal(MESSAGES.sample.start, 'primary', () => dispatch({ type: 'BEGIN' })));
    } else if (state.phase === 'reading' || state.phase === 'revealed') {
      const d = state.difficulty;
      const r = state.rounds[state.round]!;
      const revealed = state.phase === 'revealed';
      head = header(progressText(state.round + 1), state.round, state.round);
      const sheet = cardOf(r.problem, d, { reveal: revealed });
      desk = h('main', { class: 'desk', tabindex: '-1' }, sheet);
      actions = h('footer', { class: 'actions' });
      if (state.phase === 'reading') {
        for (const a of ['normal', 'anomaly'] as const) actions.append(seal(MESSAGES.seal[a], '', () => dispatch({ type: 'ANSWER', answer: a as Answer })));
      } else if (state.correct) {
        slipOf(sheet).append(h('span', { class: 'stamp', 'data-testid': 'stamp', 'aria-hidden': 'true' }, MESSAGES.seal[state.answer]));
        slipOf(sheet).classList.add('sink');
        actions.classList.add('single', 'with-feedback');
        actions.append(feedback(true, r.problem.anomaly ? r.problem.anomaly.explanation : null), seal(state.round === ROUNDS_TO_CLEAR - 1 ? MESSAGES.toCleared : MESSAGES.next, 'primary', () => dispatch({ type: 'NEXT' })));
      } else {
        slipOf(sheet).append(h('span', { class: 'stamp stamp-back', 'data-testid': 'stamp', 'aria-hidden': 'true' }, MESSAGES.sentBack));
        slipOf(sheet).classList.add('rejected');
        desk.prepend(h('p', { class: 'verdict ng', 'data-testid': 'verdict' }, MESSAGES.result.ng));
        actions.classList.add('single');
        actions.append(seal(MESSAGES.quick, 'primary', () => dispatch({ type: 'RESTART', rounds: rounds(d) })));
        const d0 = state.difficulty;
        timer = setTimeout(() => dispatch({ type: 'RESTART', rounds: rounds(d0) }), REJECT_MS);
      }
    } else {
      const d = state.difficulty;
      const s = clearSummary(kindsAtStart, records[d].kinds, pool, d);
      head = h('header', { class: 'checks' }, h('h1', { class: 'now', tabindex: '-1', 'data-testid': 'progress' }, MESSAGES.cleared.heading));
      const list = h('ol', { class: 'done-list' });
      for (const r of state.rounds) {
        const c = company(r.problem.companyId);
        list.append(h('li', { class: `co-${c.id}` }, h('span', { class: 'kakuin', 'aria-hidden': 'true' }, c.emblem), c.name));
      }
      desk = h('main', { class: 'desk', 'data-testid': 'cleared', tabindex: '-1' },
        h('span', { class: 'stamp big-stamp', 'aria-hidden': 'true' }, MESSAGES.cleared.heading),
        h('p', { class: 'verdict ok' }, MESSAGES.cleared.done),
        list,
        h('p', { class: 'found-line' }, fill(MESSAGES.cleared.found, { n: s.n, N: s.N }), s.added > 0 ? h('span', { class: 'added' }, ` ${fill(MESSAGES.cleared.added, { k: s.added })}`) : null),
        d === 'easy' ? h('p', { class: 'lead' }, MESSAGES.cleared.suggestHard) : null);
      const d1 = d;
      actions = h('footer', { class: 'actions' }, seal(MESSAGES.cleared.again, 'primary', () => dispatch({ type: 'PICK', difficulty: d1, rounds: rounds(d1) })), seal(MESSAGES.cleared.other, '', () => dispatch({ type: 'TO_DIFFICULTY' })));
    }
    const kids = [head, desk, ...(actions ? [actions] : [])];
    stage.replaceChildren(...kids);
    if (actions) arm(actions);
    (head.querySelector<HTMLElement>('h1') ?? desk).focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (actions) scrollMarksIntoView(actions);
  }

  render();
}
