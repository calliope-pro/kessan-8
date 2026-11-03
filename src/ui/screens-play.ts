// 会社の導入 (SC3)・資料の閲覧 + 判定 (SC4)・答え合わせ (SC5)。
import { judge, screenOf } from '../domain/answer';
import { ROUNDS_TO_CLEAR } from '../domain/config';
import type { Reading, Revealed } from '../domain/game';
import { matchMarks } from '../domain/marks';
import type { Ctx } from './context';
import { button, h } from './dom';
import { MESSAGES as M } from './messages';
import { applyCompanyColors } from './company-style';
import { timeLabel } from './stage';

const pips = (round: number) =>
  h('span', { class: 'pips', 'aria-hidden': 'true' },
    ...Array.from({ length: ROUNDS_TO_CLEAR }, (_, i) => h('span', { class: 'pip', 'data-state': i < round ? 'done' : i === round ? 'now' : 'todo' })));

function band(ctx: Ctx, run: Reading | Revealed): HTMLElement {
  const problem = run.problems[run.round]!;
  const company = ctx.companyOf(problem);
  return applyCompanyColors(h('div', { class: 'band', 'data-testid': 'band' },
    h('strong', {}, M.reading.band(run.round + 1, ROUNDS_TO_CLEAR)), pips(run.round),
    h('span', { 'data-testid': 'time' }, timeLabel(run.round)),
    h('span', { class: 'emblem', 'aria-hidden': 'true' }, company?.emblem ?? ''),
    h('span', {}, company?.name ?? problem.tanshin.header.companyName)), company);
}

export function introScreen(ctx: Ctx): HTMLElement {
  const run = ctx.state as Reading;
  const problem = run.problems[run.round]!;
  const company = ctx.companyOf(problem);
  return h('section', { class: 'screen stack', 'data-screen': 'intro' },
    applyCompanyColors(h('div', { class: 'slip-card', 'data-testid': 'intro-slip' },
      h('strong', {}, M.intro.roundOf(run.round + 1, ROUNDS_TO_CLEAR)), pips(run.round),
      h('span', {}, `${M.intro.time} ${timeLabel(run.round)}`),
      h('h1', {}, h('span', { class: 'emblem', 'aria-hidden': 'true' }, company?.emblem ?? ''), ' ', company?.name ?? problem.tanshin.header.companyName),
      company?.industry && h('p', {}, company.industry),
      company?.business && h('p', {}, company.business)), company),
    h('div', { class: 'row' },
      button(M.button.openDocs, () => ctx.patch({ screen: 'main' }), { class: 'btn btn--primary', 'data-autofocus': true })),
    ctx.titleLink());
}

/** 判定のパネル (SC4-10)。開いてから短い間は入力を受けない (「判定する」の素早い 2 回押しで確定しないため)。 */
function sheet(ctx: Ctx): HTMLElement[] {
  const choose = (answer: 'anomaly' | 'normal') => () => ctx.dispatch({ type: 'ANSWER', answer });
  const buttons = [
    button(M.button.backToReading, () => ctx.patch({ panel: false }), { class: 'btn' }),
    button(M.button.normal, choose('normal'), { class: 'btn btn--primary' }),
    button(M.button.anomaly, choose('anomaly'), { class: 'btn btn--primary' }),
  ];
  for (const b of buttons) b.disabled = true;
  setTimeout(() => buttons.forEach((b) => (b.disabled = false)), 350);
  return [
    h('div', { class: 'sheet-backdrop' }),
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': M.reading.panelHeading, 'data-testid': 'sheet' },
      h('h2', {}, M.reading.panelHeading), h('p', { class: 'note' }, M.reading.panelHint), h('div', { class: 'row' }, ...buttons)),
  ];
}

export function readingScreen(ctx: Ctx): HTMLElement {
  const run = ctx.state as Reading;
  const judgeButton = button(M.button.judge, () => ctx.patch({ panel: true }), { class: 'btn btn--primary', 'data-testid': 'judge' });
  const viewer = ctx.viewer(
    { problem: run.problems[run.round]!, view: run.view, marks: run.marks, highlights: [], mode: 'read', toolbarEnd: judgeButton },
    (ref) => ctx.dispatch({ type: 'VIEW', view: ref }),
  );
  return h('section', { class: 'screen stack', 'data-screen': 'reading' }, band(ctx, run), viewer, ...(ctx.local.panel ? sheet(ctx) : []), ctx.titleLink());
}

export function revealScreen(ctx: Ctx): HTMLElement {
  const run = ctx.state as Revealed;
  const problem = run.problems[run.round]!;
  const j = judge(problem, run.answer, ctx.deps.kinds);
  const answerText = (a: 'anomaly' | 'normal') => (a === 'anomaly' ? M.reveal.answerAnomaly : M.reveal.answerNormal);
  const rightAnswer = j.hasAnomaly ? 'anomaly' : 'normal';
  const places = j.places;
  const match = j.hasAnomaly ? matchMarks(run.marks, places) : undefined;
  const last = run.round + 1 >= ROUNDS_TO_CLEAR;
  const viewer = ctx.viewer(
    { problem, view: run.view, marks: run.marks, highlights: places, mode: 'check' },
    (ref) => ctx.dispatch({ type: 'VIEW', view: ref }),
  );
  return h('section', { class: 'screen stack', 'data-screen': 'reveal' },
    band(ctx, run),
    h('div', { class: 'result', role: 'status', 'aria-live': 'polite', 'data-testid': 'result' },
      h('span', { class: 'stamp', 'data-result': run.correct ? 'correct' : 'wrong' }, run.correct ? M.reveal.correct : M.reveal.wrong)),
    h('p', { 'data-testid': 'judged' }, `${M.reveal.yourAnswer}: ${answerText(run.answer)} / ${M.reveal.rightAnswer}: ${answerText(rightAnswer)}`),
    j.hasAnomaly ? h('div', { class: 'card' },
      j.kindName && h('p', {}, h('strong', {}, `${M.reveal.kind}: `), h('span', { 'data-testid': 'kind' }, j.kindName)),
      h('p', { 'data-testid': 'explanation' }, j.explanation)) : h('p', { 'data-testid': 'no-anomaly' }, M.reveal.noAnomaly),
    places.length > 1 && h('div', { class: 'places', 'data-testid': 'places' },
      ...places.map((place, i) => button(M.reveal.place(i + 1, places.length), () => { ctx.patch({ placeIndex: i }); ctx.dispatch({ type: 'VIEW', view: screenOf(place) }); },
        { class: 'btn', 'aria-pressed': ctx.local.placeIndex === i ? 'true' : 'false' }))),
    match && h('p', { 'data-testid': 'marks-match' }, `${M.reveal.marks}: ${M.reveal.marksHit(match.hits.length)}・${M.reveal.marksMiss(match.misses.length)}・${M.reveal.marksMissed(match.missed.length)}`),
    viewer,
    h('div', { class: 'row' },
      run.correct
        ? button(last ? M.button.result : M.button.next, () => ctx.dispatch({ type: 'NEXT' }), { class: 'btn btn--primary', 'data-autofocus': true })
        : button(M.button.restartRun, () => ctx.patch({ screen: 'restart' }), { class: 'btn btn--danger', 'data-autofocus': true })),
    ctx.titleLink());
}
