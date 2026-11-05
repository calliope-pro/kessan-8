// 仕訳伝票 1 枚 (docs/design-v2.md §4・DESIGN.md)。カード (cards.ts の Card) を DOM にする。金額は桁マスに記入する。
import type { Card, CardSlot, Location } from '../cards';
import { h, setVar } from './dom';

/** 金額欄の桁マスの数 (最大 7 桁)。 */
export const AMOUNT_CELLS = 7;

/**
 * 数字の文字列 (`96,930`) を桁マスにする。左の空きマスは、桁数の目印 (桁のずれが空きとして見える)。
 * カンマは文字でなく、そこに太い縦罫 (`.sep`) として出る: 桁区切りの位置がずれると罫の位置がずれる (E-21)。
 */
export function amountField(text: string, kind: CardSlot['kind']): HTMLElement {
  const field = h('span', { class: `field field-${kind}`, 'aria-hidden': 'true' });
  if (kind === 'ratio') {
    const [int = '', dec = ''] = text.split('.');
    const intCells = Math.max(2, int.length);
    for (let i = 0; i < intCells; i++) field.append(h('span', { class: 'cell' }, int[i - (intCells - int.length)] ?? ''));
    field.append(h('span', { class: 'cell point' }, '.'));
    field.append(h('span', { class: 'cell' }, dec));
    return field;
  }
  // 右から並べる。カンマの直前の桁に「右に太罫」を付ける。
  const chars = [...text];
  const digits: { d: string; ruleAfter: boolean }[] = [];
  for (const ch of chars) {
    if (ch === ',') digits[digits.length - 1]!.ruleAfter = true;
    else digits.push({ d: ch, ruleAfter: false });
  }
  const total = Math.max(AMOUNT_CELLS, digits.length);
  for (let i = 0; i < total - digits.length; i++) field.append(h('span', { class: 'cell empty' }));
  for (const { d, ruleAfter } of digits) {
    field.append(h('span', { class: 'cell' }, d));
    if (ruleAfter) field.append(h('span', { class: 'sep' })); // 桁区切りの太罫 (カンマの代わり)
  }
  return field;
}

function spoken(s: CardSlot): string {
  return `${s.label} ${s.text}${s.unit}`;
}

function bars(card: NonNullable<Card['bars']>, marked: boolean): HTMLElement {
  const { axisMin, previous, current } = card;
  const top = Math.max(previous, current) - axisMin;
  const bar = (label: string, v: number) => {
    const col = h('div', { class: 'bar-col' });
    const b = h('span', { class: 'bar' });
    setVar(b, '--h', `${Math.max(0, ((v - axisMin) / top) * 100).toFixed(1)}%`);
    col.append(h('span', { class: 'bar-track' }, b), h('span', { class: 'bar-label' }, label));
    return col;
  };
  const wrap = h('div', { class: `bars${marked ? ' marked' : ''}`, role: 'img', 'aria-label': '売上高の棒グラフ (前期と当期)', 'data-place': 'bars' }, bar('前期', previous), bar('当期', current));
  if (marked) wrap.append(h('span', { class: 'tag' }, '異変'));
  return wrap;
}

export interface SlipOptions {
  /** 答え合わせで朱書きする場所。 */
  marks?: Location[];
  /** 見本の朱印「記入例」。 */
  example?: boolean;
  /** 見出しの id (aria-labelledby 用)。 */
  id?: string;
}

/** 会社名を「名前」と「株式会社」に分ける (狭い幅で、会社の種類の語の前で折り返すため)。 */
function companyName(name: string): HTMLElement {
  const m = /^(.*?)(株式会社)$/.exec(name);
  const el = h('h2', { class: 'company' });
  if (!m) return el.appendChild(h('span', { class: 'co-name' }, name)).parentElement!;
  el.append(h('span', { class: 'co-name' }, m[1]), h('span', { class: 'co-type' }, m[2]));
  return el;
}

/** 伝票の外側 (複写の 2 枚目が重なる)。中の `.slip` が 1 枚目。 */
export function slipOf(sheet: HTMLElement): HTMLElement {
  return sheet.querySelector<HTMLElement>('.slip')!;
}

export function renderSlip(card: Card, opt: SlipOptions = {}): HTMLElement {
  const marks = opt.marks ?? [];
  const isMarked = (t: Location['type'], key?: string) => marks.some((m) => m.type === t && (key === undefined || ('key' in m && m.key === key)));
  const slip = h('article', { class: `slip shape-${card.shape}`, 'data-shape': card.shape, 'aria-label': `${card.company.name} ${card.shapeName}の伝票` });
  setVar(slip, '--company', card.company.main);
  setVar(slip, '--company-light', card.company.light);

  const periodMarked = isMarked('period');
  slip.append(
    h('header', { class: 'slip-head' },
      h('span', { class: 'kakuin', 'aria-hidden': 'true' }, card.company.emblem),
      h('div', { class: 'who' },
        companyName(card.company.name),
        h('p', { class: 'period' }, card.period)),
    ),
  );
  if (card.headline) {
    const m = isMarked('headline');
    slip.append(h('p', { class: `headline${m ? ' marked' : ''}`, 'data-place': 'headline' }, `【${card.headline.text}】`, m && h('span', { class: 'tag' }, '異変')));
  }

  const rows = h('div', { class: 'rows' });
  const ghostAt = new Map(card.dropped.map((d) => [d.index, d]));
  card.slots.forEach((s, i) => {
    const ghost = ghostAt.get(i);
    if (ghost && isMarked('dropped', ghost.key)) rows.append(h('div', { class: 'row ghost marked', 'data-place': `dropped:${ghost.key}` }, `ここに「${ghost.label}」の欄があるはずです`));
    const m = isMarked('slot', s.key);
    rows.append(
      h('div', { class: `row${m ? ' marked' : ''}`, 'data-slot': s.key, 'data-place': `slot:${s.key}` },
        h('div', { class: 'row-label' },
          h('span', { class: 'label' }, s.label), s.gloss && h('span', { class: 'gloss' }, s.gloss), m && h('span', { class: 'tag' }, '異変')),
        h('div', { class: 'amount' },
          h('span', { class: 'sr' }, spoken(s)), amountField(s.text, s.kind), h('span', { class: 'unit', 'aria-hidden': 'true' }, s.unit))),
    );
  });
  card.dropped.filter((d) => d.index >= card.slots.length && isMarked('dropped', d.key)).forEach((d) => rows.append(h('div', { class: 'row ghost marked', 'data-place': `dropped:${d.key}` }, `ここに「${d.label}」の欄があるはずです`)));
  slip.append(rows);
  if (card.bars) slip.append(bars(card.bars, isMarked('bars')));
  // 確認欄: 押した印がここに落ちる。見本は「記入例」の朱印がもう押してある
  slip.append(
    h('div', { class: 'slip-foot' },
      h('p', { class: `period-end${periodMarked ? ' marked' : ''}`, 'data-place': 'period' }, `期末 ${card.periodEnd}`, periodMarked && h('span', { class: 'tag' }, '異変')),
      h('span', { class: 'slot', 'aria-hidden': 'true' }, opt.example ? h('span', { class: 'example-stamp' }, '記入例') : null)),
  );
  return h('div', { class: 'sheet' }, slip);
}
