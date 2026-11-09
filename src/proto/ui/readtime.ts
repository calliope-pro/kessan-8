// 1 社を読む時間を測る画面 (?mode=read&difficulty=hard)。カードを出してから、札を押すまでの秒数を記録する (設計 §3.2 #141-2)。
// 遊びの本体と同じ伝票・答え合わせを使う。間違えても 0 社目に戻らず、8 枚を最後まで見せる (8 社ぶんの秒数を全部測るため)。
import type { Company, Problem } from '../../domain/types';
import { locate, type Difficulty } from '../cards';
import { drawRun } from '../draw';
import { isCorrect, type Answer } from '../flow';
import { parseReading, readingRecord, summaryLines, type Reading, type ReadingRound } from '../readtime';
import { arm, h, scrollMarksIntoView, screenHeading, seal } from './dom';
import { cardOf, checks, feedback } from './game';
import { renderSlip, slipOf } from './slip';
import { deriveCards } from '../cards';

export interface ReadEnv {
  normals: readonly Problem[];
  companies: readonly Company[];
  sample: Problem;
  seed: number;
  difficulty: Difficulty;
  pid: string;
}

export function mountReadtime(root: HTMLElement, env: ReadEnv): void {
  const deck = drawRun(env.seed, env.normals, { difficulty: env.difficulty });
  const rounds: ReadingRound[] = [];
  let index = -1;
  let phase: 'intro' | 'sample' | 'reading' | 'revealed' | 'done' = 'intro';
  let shownAt = 0;
  const view = h('div', { class: 'stage' });
  root.replaceChildren(view);

  const answer = (a: Answer) => {
    const r = deck[index]!;
    rounds.push({ hasAnomaly: r.anomaly !== null, said: a, seconds: (performance.now() - shownAt) / 1000 });
    phase = 'revealed';
    render(a);
  };
  const next = () => {
    if (index + 1 >= deck.length) phase = 'done';
    else { index++; phase = 'reading'; shownAt = performance.now(); }
    render();
  };

  function render(pressed?: Answer): void {
    const desk = h('main', { class: 'desk wide', tabindex: '-1' });
    const actions = h('footer', { class: 'actions' });
    let head: HTMLElement;
    if (phase === 'intro') {
      head = checks('読む時間', -1, 0);
      desk.append(
        h('p', { class: 'lead' }, h('strong', {}, `${env.difficulty === 'hard' ? 'むずかしい' : 'やさしい'}の決算カードを 8 社ぶん、続けて見ます。`), '1 社ごとに、見終わったら「いつも通り」か「異変あり」を 1 回押してください。急がず、いつもの読み方で。'),
        h('p', { class: 'lead' }, 'カードが出てから、押すまでの時間を測ります。'),
      );
      actions.classList.add('single');
      actions.append(seal('見本を見る', null, 'primary', () => { phase = 'sample'; render(); }));
    } else if (phase === 'sample') {
      head = checks('0 社目 (見本)', -1, 0);
      desk.append(h('p', { class: 'lead' }, h('strong', {}, 'これが「いつも通り」。'), 'ここからずれたら、異変です。'), renderSlip(deriveCards(env.sample, env.companies.find((c) => c.id === env.sample.companyId)!, env.difficulty), { example: true }));
      actions.classList.add('single');
      actions.append(seal('1 社目へ', null, 'primary', next));
    } else if (phase === 'reading' || phase === 'revealed') {
      const r = deck[index]!;
      const card = cardOf(env, r);
      head = checks(`${index + 1} 社目`, index, index);
      const revealed = phase === 'revealed';
      const sheet = renderSlip(card, { marks: revealed && r.anomaly ? locate(card, r.anomaly.places) : [] });
      if (revealed && pressed) slipOf(sheet).append(h('span', { class: 'stamp', 'aria-hidden': 'true' }, pressed === 'normal' ? '確認' : '訂正'));
      desk.append(sheet);
      if (!revealed) {
        actions.append(seal('いつも通り', null, '', () => answer('normal'), '確'), seal('異変あり', null, '', () => answer('anomaly'), '訂'));
      } else {
        actions.classList.add('single', 'with-feedback');
        actions.append(feedback(isCorrect(r, pressed!), r.anomaly ? r.anomaly.explanation : null), seal(index + 1 >= deck.length ? '記録を見る' : '次へ', null, 'primary', next));
      }
    } else {
      head = checks('記録', -1, 8);
      const reading: Reading = { pid: env.pid || '(未記入)', difficulty: env.difficulty, seed: env.seed, rounds };
      const text = readingRecord(reading);
      const area = h('textarea', { class: 'record', readonly: true, 'aria-label': '読む時間の記録', rows: 12 }, text);
      desk.append(h('p', { class: 'verdict' }, '8 社ぶんの秒数を記録しました。'), h('pre', { class: 'record out' }, summaryLines([reading]).join('\n')), area);
      actions.classList.add('single');
      actions.append(seal('記録をコピー', null, 'primary', () => { area.select(); navigator.clipboard?.writeText(text).catch(() => undefined); }));
    }
    view.replaceChildren(head, desk, actions);
    arm(actions);
    head.querySelector<HTMLElement>('h1')!.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    scrollMarksIntoView(actions);
  }
  render();
}

/** 記録を貼って集計する (?mode=read-summary)。 */
export function mountReadSummary(root: HTMLElement): void {
  const input = h('textarea', { class: 'record', 'aria-label': '貼る記録', rows: 10, placeholder: '参加者の「記録をコピー」の文を、続けて貼る' });
  const out = h('pre', { class: 'record out', 'aria-live': 'polite' });
  const run = h('button', { type: 'button', class: 'seal primary' }, h('span', {}, '集計する'));
  run.addEventListener('click', () => {
    const parts = input.value.split('８期連続 試作 読む時間の記録').slice(1).map((t) => parseReading(`８期連続 試作 読む時間の記録${t}`));
    const ok = parts.filter((r): r is Reading => r !== null);
    out.textContent = ok.length === 0 ? '記録が読めません。' : [...summaryLines(ok), parts.length > ok.length ? `読めなかった記録: ${parts.length - ok.length} 件` : ''].filter(Boolean).join('\n');
  });
  root.replaceChildren(h('div', { class: 'stage' }, h('header', { class: 'checks' }, screenHeading('読む時間の集計')), h('main', { class: 'desk' }, h('p', { class: 'lead' }, '目安は 1 社 60 秒以内。参加者ごとの記録を貼ってください。'), input, out), h('footer', { class: 'actions single' }, run)));
}
