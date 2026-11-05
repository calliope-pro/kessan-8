// 確かめの画面 (?mode=test): plans.md §8.1 の「① の測り方」。1 人 8 枚 (異変 4 + 正常 4) を続けて見せ、記録を出す。
// 遊びの本体と同じ伝票・押印・答え合わせを使う。違い: 間違えても 0 社目に戻らず、8 枚を最後まで見せる (8 枚の答えを全部記録するため)。
import type { Company, Problem } from '../../domain/types';
import { deriveCard, locate, type ShapeId } from '../cards';
import { isCorrect, type Answer } from '../flow';
import { buildDeck, scoreSession, type Response } from '../playtest';
import { cardOf, checks, feedback } from './game';
import { arm, h, scrollMarksIntoView, seal } from './dom';
import { renderSlip, slipOf } from './slip';

export interface TestEnv {
  normals: readonly Problem[];
  companies: readonly Company[];
  sample: Problem;
  seed: number;
  shape: ShapeId;
  withSample: boolean;
  pid: string;
}

export function recordText(env: TestEnv, deck: ReturnType<typeof buildDeck>, rs: Response[], ms: number[]): string {
  const sc = scoreSession(rs);
  const lines = [
    '８期連続 試作 確かめ記録',
    `参加者: ${env.pid || '(未記入)'}`,
    `条件: 形=${env.shape} 0社目=${env.withSample ? 'あり' : 'なし'} 種=${env.seed}`,
    `結果: 異変 ${sc.found}/${sc.anomalies} を見つけた / 正常 ${sc.falseAlarms}/${sc.normals} を異変と答えた → ${sc.pass ? '合格' : '不合格'} (基準: 見つけ 3 以上かつ誤り 1 以下)`,
    '',
  ];
  rs.forEach((r, i) => {
    const d = deck[i]!;
    const truth = d.anomaly ? `異変あり(${d.anomaly.kind} ${d.anomaly.name})` : '正常';
    lines.push(`${i + 1}枚目 ${d.problem.companyId}: 正解=${truth} / 答え=${r.said === 'anomaly' ? '異変あり' : 'いつも通り'} ${isCorrect(d, r.said) ? '○' : '×'} ${(ms[i]! / 1000).toFixed(1)}秒`);
  });
  return lines.join('\n');
}

export function mountPlaytest(root: HTMLElement, env: TestEnv): void {
  const deck = buildDeck(env.seed, env.shape, env.normals, { sample: env.sample, companies: env.companies });
  const responses: Response[] = [];
  const times: number[] = [];
  let index = -1; // -1 = はじめの画面、0.. = n 枚目
  let phase: 'intro' | 'sample' | 'reading' | 'revealed' | 'done' = 'intro';
  let shownAt = 0;
  const view = h('div', { class: 'stage' });
  root.replaceChildren(view);

  const answer = (a: Answer) => {
    const r = deck[index]!;
    times.push(performance.now() - shownAt);
    responses.push({ index, hasAnomaly: r.anomaly !== null, said: a });
    phase = 'revealed';
    render(a);
  };
  const next = () => {
    if (index + 1 >= deck.length) phase = 'done';
    else { index++; phase = 'reading'; shownAt = performance.now(); }
    render();
  };

  function render(pressed?: Answer): void {
    const desk = h('main', { class: 'desk', tabindex: '-1' });
    const actions = h('footer', { class: 'actions' });
    let head: HTMLElement;
    if (phase === 'intro') {
      head = checks('確かめ', -1, 0);
      desk.append(
        h('p', { class: 'lead' }, h('strong', {}, '伝票を 8 枚、続けて見ます。'), '1 枚ごとに、「いつも通り」か「異変あり」を 1 回だけ押してください。'),
        h('p', { class: 'lead' }, env.withSample ? 'まず、いつも通りの見本を見ます。' : 'このまま始めます。'),
      );
      actions.classList.add('single');
      actions.append(seal(env.withSample ? '見本を見る' : '1 枚目へ', null, 'primary', () => {
        if (env.withSample) { phase = 'sample'; render(); } else next();
      }));
    } else if (phase === 'sample') {
      head = checks('0 社目 (見本)', -1, 0);
      desk.append(
        h('p', { class: 'lead' }, h('strong', {}, 'これが「いつも通り」。'), 'ここからずれたら、異変です。'),
        renderSlip(deriveCard(env.sample, env.companies.find((c) => c.id === env.sample.companyId)!, env.shape), { example: true }),
      );
      actions.classList.add('single');
      actions.append(seal('1 枚目へ', null, 'primary', next));
    } else if (phase === 'reading' || phase === 'revealed') {
      const r = deck[index]!;
      const card = cardOf(env, r);
      head = checks(`${index + 1} 枚目`, index, index);
      const revealed = phase === 'revealed';
      const sheet = renderSlip(card, { marks: revealed && r.anomaly ? locate(card, r.anomaly.places) : [] });
      if (revealed && pressed) {
        slipOf(sheet).append(h('span', { class: 'stamp', 'aria-hidden': 'true' }, pressed === 'normal' ? '確認' : '訂正'));
        slipOf(sheet).classList.add('sink');
      }
      desk.append(sheet);
      if (!revealed) {
        actions.append(
          seal('いつも通り', '確認印を押す', '', () => answer('normal'), '確'),
          seal('異変あり', '訂正印を押す', '', () => answer('anomaly'), '訂'),
        );
      } else {
        const ok = isCorrect(r, pressed!);
        actions.classList.add('single', 'with-feedback');
        actions.append(feedback(ok, r.anomaly ? r.anomaly.explanation : null), seal(index + 1 >= deck.length ? '記録を見る' : '次へ', null, 'primary', next));
      }
    } else {
      head = checks('記録', -1, 8);
      const sc = scoreSession(responses);
      const text = recordText(env, deck, responses, times);
      const area = h('textarea', { class: 'record', readonly: true, 'aria-label': '確かめの記録', rows: 14 }, text);
      desk.append(
        h('p', { class: 'verdict' }, `異変 ${sc.found}/${sc.anomalies} を見つけ、正常 ${sc.falseAlarms}/${sc.normals} を異変と答えました。`),
        h('p', { class: 'lead' }, sc.pass ? '合格の基準を満たしました。' : '合格の基準 (見つけ 3 以上かつ誤り 1 以下) には届きませんでした。'),
        area,
      );
      actions.classList.add('single');
      const copy = seal('記録をコピー', null, 'primary', () => {
        area.select();
        navigator.clipboard?.writeText(text).catch(() => undefined);
      });
      actions.append(copy);
    }
    view.replaceChildren(head, desk, actions);
    arm(actions);
    head.querySelector<HTMLElement>('h1')!.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    scrollMarksIntoView(actions);
  }
  render();
}
