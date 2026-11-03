// 最初へ戻る (SC6)・クリア (SC7)。
import { ROUNDS_TO_CLEAR } from '../domain/config';
import type { Cleared, Revealed } from '../domain/game';
import type { Ctx } from './context';
import { button, h } from './dom';
import { MESSAGES as M } from './messages';
import { applyCompanyColors } from './company-style';
import { MORNING_LABEL, timeLabel } from './stage';

export function restartScreen(ctx: Ctx): HTMLElement {
  const run = ctx.state as Revealed;
  const reached = run.round + 1;
  return h('section', { class: 'screen stack', 'data-screen': 'restart' },
    h('div', { class: 'slip-card rewind', 'data-testid': 'rewind' },
      h('h1', {}, M.restart.reached(reached)),
      reached > ctx.records[run.difficulty].bestBefore && h('strong', { 'data-testid': 'new-best' }, M.restart.best),
      h('p', {}, M.restart.bestIs(ctx.records[run.difficulty].best)),
      h('p', {}, `${M.restart.rewind} (${timeLabel(0)})`)),
    h('div', { class: 'row' },
      button(M.button.again, () => ctx.restart(), { class: 'btn btn--primary', 'data-autofocus': true }),
      button(M.button.reselect, () => ctx.dispatch({ type: 'TO_DIFFICULTY' }), { class: 'btn' })),
    ctx.titleLink());
}

export function clearedScreen(ctx: Ctx): HTMLElement {
  const run = ctx.state as Cleared;
  const rec = ctx.records[run.difficulty];
  return h('section', { class: 'screen stack', 'data-screen': 'cleared' },
    h('h1', {}, M.cleared.heading),
    h('div', { class: 'slip-card slip', 'data-testid': 'completion-slip' },
      h('strong', {}, M.cleared.slip),
      h('ul', { class: 'slip-list' }, ...run.problems.map((problem, i) => {
        const company = ctx.companyOf(problem);
        return applyCompanyColors(h('li', { 'data-testid': 'slip-company' },
          `${i + 1} / ${ROUNDS_TO_CLEAR} 社目 ${timeLabel(i)} `, h('span', { class: 'emblem', 'aria-hidden': 'true' }, company?.emblem ?? ''), ` ${company?.name ?? problem.tanshin.header.companyName} ✓`), company);
      })),
      h('p', { 'data-testid': 'morning' }, MORNING_LABEL)),
    h('div', { class: 'card', 'data-testid': 'record' }, h('strong', {}, M.record.heading), h('p', {}, M.cleared.clears(rec.clears)), h('p', {}, M.cleared.kinds(rec.kinds.length))),
    h('div', { class: 'row' },
      button(M.button.again, () => ctx.restart(), { class: 'btn btn--primary', 'data-autofocus': true }),
      button(M.button.otherDifficulty, () => ctx.dispatch({ type: 'TO_DIFFICULTY' }), { class: 'btn' }),
      button(M.button.toTitle, () => ctx.dispatch({ type: 'TO_TITLE' }), { class: 'btn' })));
}
