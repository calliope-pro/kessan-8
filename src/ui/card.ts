// 決算カード (docs/design-v3.md §1.2・§1.3・DESIGN.md)。`deriveCards` の Card を DOM にする。金額は桁マスに記入する。
// むずかしいは、伝票の下に資料 1 (決算短信のまとめ)・資料 2 (IR のひとこと) を縦に並べる (スマホも縦に流す。docs/proto/measurements.md v3-1)。
import { type Card, type CardSlot, type SectionId } from '../domain/cards';
import { h } from './dom';
import { fill, MESSAGES } from './messages';

/** 金額欄の桁マスの数 (最大 7 桁)。資料の数字 (compact) は 6。 */
export const AMOUNT_CELLS = 7;

/** 桁マスの 1 つ。sep = 桁区切り (カンマの字と太い縦罫)。 */
export interface Cell {
  kind: 'digit' | 'empty' | 'sep' | 'point' | 'neg';
  text: string;
}

/**
 * 表示の数字 (`96,930`・`△96,930`・`969.3`・`4,9X0`・`96930`) を桁マスの並びにする。左の空きマスは桁数の目印。
 * 桁区切りはカンマの字として並ぶ (位置がずれたり無かったりすると見える。E-21)。
 */
export function amountCells(text: string, total = AMOUNT_CELLS, ratio = false): Cell[] {
  if (ratio) {
    const [int = '', dec = ''] = text.split('.');
    const n = Math.max(2, int.length);
    const out: Cell[] = [];
    for (let i = 0; i < n; i++) out.push({ kind: 'digit', text: int[i - (n - int.length)] ?? '' });
    out.push({ kind: 'point', text: '.' }, { kind: 'digit', text: dec });
    return out;
  }
  const neg = text.startsWith('△');
  const [intText = '', dec] = (neg ? text.slice(1) : text).split('.');
  const digits: { d: string; sep: boolean }[] = [];
  let comma = false;
  for (const ch of intText) {
    if (ch === ',') comma = true;
    else { digits.push({ d: ch, sep: comma }); comma = false; }
  }
  const used = digits.length + (neg ? 1 : 0);
  const out: Cell[] = Array.from({ length: Math.max(0, total - used) }, () => ({ kind: 'empty' as const, text: '' }));
  if (neg) out.push({ kind: 'neg', text: '△' });
  for (const { d, sep } of digits) {
    if (sep) out.push({ kind: 'sep', text: ',' });
    out.push({ kind: 'digit', text: d });
  }
  if (dec !== undefined) {
    out.push({ kind: 'point', text: '.' });
    for (const d of dec) out.push({ kind: 'digit', text: d });
  }
  return out;
}

function field(slot: CardSlot, compact: boolean): HTMLElement {
  const ratio = slot.measure === 'percent';
  const el = h('span', { class: `field field-${ratio ? 'ratio' : 'amount'}${compact ? ' compact' : ''}`, 'aria-hidden': 'true' });
  for (const c of amountCells(slot.text, compact ? 6 : AMOUNT_CELLS, ratio)) {
    el.append(c.kind === 'sep' ? h('span', { class: 'sep' }, c.text) : h('span', { class: `cell ${c.kind === 'empty' ? 'empty' : c.kind === 'point' ? 'point' : c.kind === 'neg' ? 'neg' : ''}`.trim() }, c.text));
  }
  return el;
}

export interface CardView {
  /** 答え合わせで朱で囲む場所 (欄の key・headline・frame・frame.period・period・irHead)。 */
  marks?: ReadonlySet<string>;
  /** 見本の「記入例」。 */
  example?: boolean;
  /** 欄が欠けたときの位置 (テンプレートのカード。答え合わせの「ここに○○の欄があるはず」)。 */
  template?: Card;
}

const tag = () => h('span', { class: 'tag' }, MESSAGES.result.tag);

/** やさしいのカードにだけ添える言い換え (要件 7。むずかしいには添えない)。 */
function glossOf(card: Card, slot: CardSlot): string | undefined {
  if (card.difficulty !== 'easy') return undefined;
  return (MESSAGES.gloss as Record<string, unknown>)[slot.key] as string | undefined;
}

function row(card: Card, s: CardSlot, marked: boolean, compact: boolean): HTMLElement {
  const gloss = glossOf(card, s);
  const label = h('div', { class: 'row-label' }, h('span', { class: 'label' }, s.label), gloss ? h('span', { class: 'gloss' }, gloss) : null, marked ? tag() : null);
  const spoken = s.kind === 'text' ? s.text : `${s.text} ${s.unit}`;
  const body = s.kind === 'text'
    ? h('p', { class: 'sentence' }, h('span', { class: 'sr' }, spoken), h('span', { 'aria-hidden': 'true' }, s.text))
    : h('div', { class: 'amount' }, h('span', { class: 'sr' }, spoken), field(s, compact), h('span', { class: 'unit', 'aria-hidden': 'true' }, s.unit));
  return h('div', { class: `row${s.kind === 'text' ? ' row-text' : ''}${marked ? ' marked' : ''}`, 'data-slot': s.key }, label, body);
}

const ghost = (label: string): HTMLElement => h('div', { class: 'row ghost marked' }, fill(MESSAGES.ghost, { label }));

/** 1 区画の行。欠けた欄は、テンプレートの位置に「ここに○○の欄があるはず」を挟む (朱で囲むとき)。 */
function sectionRows(card: Card, section: SectionId, view: CardView, compact: boolean): HTMLElement[] {
  const marks = view.marks ?? new Set<string>();
  const out: HTMLElement[] = [];
  const seen = new Set<string>(); // 欄の key ごとに 1 回 (欄の重複 E-22 は、同じ key の欄が続く。`have` が全部を出す)
  const tmpl = (view.template?.slots ?? card.slots).filter((s) => s.section === section && !seen.has(s.key) && !!seen.add(s.key));
  const have = card.slots.filter((s) => s.section === section);
  let last: string | undefined;
  const push = (s: CardSlot) => {
    if (s.heading && s.heading !== last) out.push(h('p', { class: 'group' }, s.heading));
    last = s.heading;
    out.push(row(card, s, marks.has(s.key), compact));
  };
  for (const t of tmpl) {
    const mine = have.filter((s) => s.key === t.key);
    if (mine.length === 0) { if (marks.has(t.key)) out.push(ghost(t.label)); } else mine.forEach(push);
  }
  return out;
}

function companyName(name: string, marked: boolean): HTMLElement {
  const m = /^(.*?)(株式会社)$/.exec(name);
  const el = h('h2', { class: `company${marked ? ' marked' : ''}`, 'data-place': 'frame' });
  if (!m) { el.append(h('span', { class: 'co-name' }, name)); return el; }
  el.append(h('span', { class: 'co-name' }, m[1]), h('span', { class: 'co-type' }, m[2]));
  return el;
}

function docOf(card: Card, part: 1 | 2, view: CardView): HTMLElement {
  const sections: SectionId[] = part === 1 ? ['pl', 'bs', 'cf', 'notes'] : ['ir'];
  const title = part === 1 ? MESSAGES.card.docs1 : MESSAGES.card.docs2;
  const marks = view.marks ?? new Set<string>();
  const doc = h('section', { class: `doc doc-${part}`, 'aria-label': title.replace('　', ' ') }, h('h3', { class: 'doc-title' }, title));
  if (part === 2 && card.irFrame) {
    const m = marks.has('irHead');
    doc.append(h('p', { class: `ir-head${m ? ' marked' : ''}`, 'data-place': 'irHead' }, `${card.irFrame.companyName} ${card.irFrame.periodLabel}`, m ? tag() : null));
  }
  for (const id of sections) {
    const rows = sectionRows(card, id, view, true);
    if (rows.length === 0) continue;
    doc.append(h('div', { class: `block block-${id}` }, h('h4', { class: 'block-title' }, MESSAGES.blocks[id as keyof typeof MESSAGES.blocks]), ...rows));
  }
  return doc;
}

/** カード 1 枚 (やさしい = 伝票だけ、むずかしい = 伝票 + 資料 1・2)。伝票 (`.slip`) は data-testid="card"。 */
export function renderCard(card: Card, companyId: string, view: CardView = {}): HTMLElement {
  const marks = view.marks ?? new Set<string>();
  const slip = h('article', { class: `slip co-${companyId} difficulty-${card.difficulty}`, 'data-testid': 'card', 'data-difficulty': card.difficulty, 'aria-label': fill(MESSAGES.card.label, { name: card.frame.companyName }) });
  const periodMarked = marks.has('frame.period');
  slip.append(
    h('header', { class: 'slip-head' },
      h('span', { class: 'kakuin', 'aria-hidden': 'true' }, card.frame.emblem),
      h('div', { class: 'who' },
        companyName(card.frame.companyName, marks.has('frame')),
        h('p', { class: `period${periodMarked ? ' marked' : ''}`, 'data-place': 'frame.period' }, card.frame.periodLabel, periodMarked ? tag() : null))),
  );
  if (card.headline) {
    const m = marks.has('headline');
    for (let i = 1; i <= card.headline.repeat; i++) {
      const gloss = card.difficulty === 'easy' ? MESSAGES.gloss.headline[card.headline.word] : undefined;
      slip.append(h('p', { class: `headline${m ? ' marked' : ''}`, 'data-place': 'headline' }, `【${card.headline.word}】`, gloss ? h('span', { class: 'gloss' }, gloss) : null, m && i === card.headline.repeat ? tag() : null));
    }
  }
  slip.append(h('div', { class: 'rows' }, ...sectionRows(card, 'card', view, false)));
  const footMarked = marks.has('period') || periodMarked;
  slip.append(
    h('div', { class: 'slip-foot' },
      card.footer
        ? h('p', { class: `period-end${footMarked ? ' marked' : ''}`, 'data-place': 'period' }, fill(MESSAGES.periodEnd, { date: card.footer.periodEnd }), footMarked ? tag() : null)
        : marks.has('period') ? ghost('期末日') : h('span'),
      view.example ? h('span', { class: 'example-stamp', 'aria-hidden': 'true' }, MESSAGES.sample.example) : null),
  );
  const sheet = h('div', { class: 'sheet' }, slip);
  if (card.difficulty === 'easy') return sheet;
  return h('div', { class: 'card-set' }, sheet, h('div', { class: 'docs', 'data-testid': 'docs' }, docOf(card, 1, view), docOf(card, 2, view)));
}
