// 遊びの画面 (docs/design-v2.md §3.1): 0 社目 (見本) → n 社目 → 答え合わせ → 間違えたら 0 社目へ自動で戻る / 8 社連続でクリア。
import type { Company, Problem } from '../../domain/types';
import { deriveCard, locate, SHAPES, type ShapeId } from '../cards';
import { drawRun, ROUNDS_TO_CLEAR, type Round } from '../draw';
import { initial, reduce, type Action, type Answer, type State } from '../flow';
import { arm, h, scrollMarksIntoView, screenHeading, seal, setVar } from './dom';
import { renderSlip, slipOf } from './slip';

export interface GameEnv {
  normals: readonly Problem[];
  companies: readonly Company[];
  sample: Problem;
  seed: number;
}

/** 不正解の演出の長さ (約 1 秒。docs/design-v2.md §3.1)。 */
export const REJECT_MS = 1000;
const STAMP_WORD: Record<Answer, string> = { normal: '確認', anomaly: '訂正' };

export function companyOf(env: Pick<GameEnv, 'companies'>, p: Problem): Company {
  const c = env.companies.find((x) => x.id === p.companyId);
  if (!c) throw new Error(`会社がありません: ${p.companyId}`);
  return c;
}

export function cardOf(env: Pick<GameEnv, 'companies'>, r: Round) {
  return deriveCard(r.problem, companyOf(env, r.problem), r.shape, r.edits);
}

export function checks(label: string, index: number, doneCount: number): HTMLElement {
  const boxes = h('ol', { class: 'boxes', 'aria-hidden': 'true' });
  for (let i = 0; i < ROUNDS_TO_CLEAR; i++) boxes.append(h('li', { class: i < doneCount ? 'done' : i === index ? 'now-box' : '' }));
  return h('header', { class: 'checks' }, screenHeading(label), boxes);
}

export function mountGame(root: HTMLElement, env: GameEnv): void {
  const history = new Set<string>();
  const live = h('p', { class: 'sr', role: 'status' });
  const view = h('div', { class: 'stage' });
  root.replaceChildren(view, live);
  let state = initial(drawRun(env.seed, env.normals, { history }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pressed: Answer | null = null;

  const redraw = () => drawRun(env.seed + state.draws * 7919, env.normals, { history });

  function dispatch(a: Action): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const before = state;
    state = reduce(state, a);
    if (state === before) return;
    if (a.type === 'ANSWER') {
      pressed = a.answer;
      const r = state.rounds[state.index]!;
      if (state.lastCorrect && r.anomaly) history.add(r.anomaly.kind);
      live.textContent = state.lastCorrect ? '正解です' : '不正解です。0 社目に戻ります';
    } else pressed = null;
    render();
    if (state.phase === 'revealed' && state.lastCorrect === false) timer = setTimeout(() => dispatch({ type: 'RESTART', rounds: redraw() }), REJECT_MS);
  }

  function render(): void {
    const desk = h('main', { class: 'desk', tabindex: '-1' });
    const actions = h('footer', { class: 'actions' });
    let head: HTMLElement;

    if (state.phase === 'sample') {
      head = checks('0 社目 (見本)', -1, 0);
      const m = state.missed;
      if (m) {
        const card = cardOf(env, m);
        desk.append(
          h('p', { class: 'note' }, h('span', { class: 'note-head' }, 'さっきの異変'), m.anomaly ? m.anomaly.explanation : 'さっきの伝票には、異変はありませんでした。'),
        );
        if (m.anomaly) desk.append(renderSlip(card, { marks: locate(card, m.anomaly.places) }));
      }
      desk.append(h('p', { class: 'lead' }, h('strong', {}, 'これが「いつも通り」。'), 'ここからずれたら、異変です。'));
      for (const shape of SHAPES) desk.append(renderSlip(deriveCard(env.sample, companyOf(env, env.sample), shape), { example: true }));
      actions.classList.add('single');
      actions.append(seal('1 社目へ', null, 'primary', () => dispatch({ type: 'BEGIN' })));
    } else if (state.phase === 'reading' || state.phase === 'revealed') {
      const r = state.rounds[state.index]!;
      const card = cardOf(env, r);
      const revealed = state.phase === 'revealed';
      head = checks(`${state.index + 1} 社目`, state.index, state.index);
      const showMarks = revealed && r.anomaly ? locate(card, r.anomaly.places) : [];
      const sheet = renderSlip(card, { marks: showMarks });
      if (revealed && pressed) {
        // 正解: 押した印 (確認・訂正) が伝票の右上に落ちる。不正解: 「差戻」の印が重く落ちて、伝票が差し戻される
        slipOf(sheet).append(h('span', { class: `stamp${state.lastCorrect ? '' : ' stamp-back'}`, 'aria-hidden': 'true' }, state.lastCorrect ? STAMP_WORD[pressed] : '差戻'));
        slipOf(sheet).classList.add(state.lastCorrect ? 'sink' : 'rejected');
      }
      desk.append(sheet);
      if (!revealed) {
        actions.append(
          seal('いつも通り', '確認印を押す', '', () => dispatch({ type: 'ANSWER', answer: 'normal' }), '確'),
          seal('異変あり', '訂正印を押す', '', () => dispatch({ type: 'ANSWER', answer: 'anomaly' }), '訂'),
        );
      } else if (state.lastCorrect) {
        desk.prepend(
          h('p', { class: 'verdict ok' }, '正解'),
          r.anomaly ? h('p', { class: 'note' }, h('span', { class: 'note-head' }, '異変'), r.anomaly.explanation) : h('p', { class: 'lead' }, '異変はありませんでした。'),
        );
        actions.classList.add('single');
        const last = state.index === ROUNDS_TO_CLEAR - 1;
        actions.append(seal(last ? '完了票へ' : '次へ', null, 'primary', () => dispatch({ type: 'NEXT' })));
      } else {
        desk.prepend(h('p', { class: 'verdict ng' }, '不正解'), h('p', { class: 'sentback' }, '差し戻し'));
        actions.classList.add('single');
        actions.append(seal('すぐ 0 社目へ', null, 'primary', () => dispatch({ type: 'RESTART', rounds: redraw() })));
      }
    } else {
      head = checks('完了', -1, ROUNDS_TO_CLEAR);
      desk.append(
        h('span', { class: 'stamp big-stamp', 'aria-hidden': 'true' }, '完了'),
        h('p', { class: 'verdict ok' }, `${ROUNDS_TO_CLEAR} 社連続で、点検を通りました。`),
        h('ol', { class: 'done-list' }, ...state.rounds.map((r) => {
          const c = companyOf(env, r.problem);
          const li = h('li', {}, h('span', { class: 'kakuin', 'aria-hidden': 'true' }, c.emblem), c.name);
          setVar(li, '--company', c.colors.main);
          setVar(li, '--company-light', c.colors.light);
          return li;
        })),
      );
      actions.classList.add('single');
      actions.append(seal('もう一度', null, 'primary', () => dispatch({ type: 'PLAY_AGAIN', rounds: redraw() })));
    }
    view.replaceChildren(head, desk, actions);
    arm(actions);
    head.querySelector<HTMLElement>('h1')!.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    scrollMarksIntoView(actions);
  }

  render();
}
