// タイトル (SC0)・遊びかた (SCH)・難易度 (SC1)・見本 (SC2)。
import { FIRST_VIEW } from '../domain/game';
import type { ScreenRef } from '../domain/screen';
import type { Difficulty } from '../domain/types';
import type { Records } from '../domain/records';
import type { Ctx } from './context';
import { button, h } from './dom';
import { MESSAGES as M } from './messages';

function recordLine(rec: Records, difficulty: Difficulty): string {
  const r = rec[difficulty];
  return r.best === 0 && r.clears === 0 ? '' : `${difficulty === 'easy' ? M.button.easy : M.button.hard}: ${M.record.best(r.best)}・${M.record.clears(r.clears)}`;
}

function footer(): HTMLElement {
  return h('footer', { class: 'note stack' },
    h('p', {}, M.footer.disclaimer),
    h('p', {}, M.footer.license, ' ', h('a', { href: M.footer.repo, rel: 'noopener noreferrer' }, 'kessan-8')));
}

export function titleScreen(ctx: Ctx): HTMLElement {
  const lines = (['easy', 'hard'] as const).map((d) => recordLine(ctx.records, d)).filter((s) => s !== '');
  return h('section', { class: 'screen stack', 'data-screen': 'title' },
    h('h1', {}, M.title),
    h('p', { class: 'lead' }, M.subtitle),
    h('p', {}, M.tagline),
    h('div', { class: 'row' },
      button(M.button.start, () => ctx.dispatch({ type: 'START' }), { class: 'btn btn--primary', 'data-autofocus': true }),
      button(M.button.help, () => ctx.patch({ screen: 'help' }), { class: 'btn' })),
    lines.length > 0 && h('div', { class: 'card', 'data-testid': 'record' }, h('strong', {}, M.record.heading), ...lines.map((l) => h('p', {}, l))),
    footer());
}

export function helpScreen(ctx: Ctx): HTMLElement {
  return h('section', { class: 'screen stack', 'data-screen': 'help' },
    h('h1', {}, M.help.heading),
    h('p', {}, M.help.rule), h('p', {}, M.help.normal), h('p', {}, M.help.tools), h('p', {}, M.help.judge),
    h('div', { class: 'row' },
      ctx.deps.sample && button(M.button.sample, () => ctx.patch({ screen: 'sample', sampleMode: 'browse', sampleFrom: 'help', sampleView: FIRST_VIEW }), { class: 'btn' }),
      button(M.button.close, () => ctx.patch({ screen: 'main' }), { class: 'btn btn--primary', 'data-autofocus': true })));
}

export function difficultyScreen(ctx: Ctx): HTMLElement {
  const card = (d: Difficulty, label: string, text: string) =>
    h('div', { class: 'card', 'data-difficulty': d },
      h('h2', {}, label), h('p', {}, text),
      !ctx.available(d) && h('p', { class: 'note' }, M.difficulty.unavailable),
      recordLine(ctx.records, d) !== '' && h('p', { class: 'note' }, recordLine(ctx.records, d)),
      button(label, () => ctx.choose(d), { class: 'btn btn--primary', disabled: !ctx.available(d), 'aria-label': label }));
  return h('section', { class: 'screen stack', 'data-screen': 'difficulty' },
    h('h1', {}, M.difficulty.heading),
    h('div', { class: 'cards' }, card('easy', M.button.easy, M.difficulty.easy), card('hard', M.button.hard, M.difficulty.hard)),
    h('div', { class: 'row' },
      ctx.deps.sample && button(M.button.sample, () => ctx.patch({ screen: 'sample', sampleMode: 'browse', sampleFrom: 'difficulty', sampleView: FIRST_VIEW }), { class: 'btn' }),
      button(M.button.back, () => ctx.dispatch({ type: 'TO_TITLE' }), { class: 'btn' })));
}

export function sampleScreen(ctx: Ctx): HTMLElement {
  const sample = ctx.deps.sample!;
  const view = ctx.local.sampleView;
  const note = sample.notes[view.screen];
  const viewer = ctx.viewer({ problem: sample.problem, view, marks: [], highlights: [], mode: 'check' }, (ref: ScreenRef) => ctx.patch({ sampleView: ref }));
  const pre = ctx.local.sampleMode === 'pre' && ctx.local.pending !== undefined;
  return h('section', { class: 'screen stack', 'data-screen': 'sample' },
    h('h1', {}, M.sample.heading),
    h('p', { class: 'lead' }, M.sample.lead),
    viewer,
    h('div', { class: 'card', 'data-testid': 'sample-note' }, note ?? M.sample.noNote),
    h('div', { class: 'row' },
      pre && button(M.button.begin, () => ctx.begin(ctx.local.pending!), { class: 'btn btn--primary', 'data-autofocus': true }),
      pre && button(M.button.skip, () => ctx.begin(ctx.local.pending!), { class: 'btn' }),
      !pre && button(M.button.close, () => ctx.closeSample(), { class: 'btn btn--primary', 'data-autofocus': true })));
}
