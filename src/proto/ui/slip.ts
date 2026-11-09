// 仕訳伝票 1 枚 (docs/design-v3.md §1.2・DESIGN.md)。カード (cards.ts の Card) を DOM にする。金額は桁マスに記入する。
// むずかしいは、伝票の下に資料 1 (決算短信のまとめ)・資料 2 (IR のひとこと) を縦に並べる (§1.3。スマホも縦に流す: 試作の決め)。
import type { Block, Card, CardSlot, Location } from '../cards';
import { h, setVar } from './dom';

/** 金額欄の桁マスの数 (最大 7 桁)。 */
export const AMOUNT_CELLS = 7;

/**
 * 数字の文字列 (`96,930`・`△96,930`・`969.3`・`4,9X0`) を桁マスにする。左の空きマスは、桁数の目印 (桁のずれが空きとして見える)。
 * 桁区切りは**カンマの字**と太い縦罫で出る (`.sep`。設計 §3.2 #141-3): 位置がずれたり、無かったりすると見える (E-21)。
 */
export function amountField(text: string, kind: CardSlot['kind'], compact = false): HTMLElement {
  const field = h('span', { class: `field field-${kind}${compact ? ' compact' : ''}`, 'aria-hidden': 'true' });
  if (kind === 'ratio') {
    const [int = '', dec = ''] = text.split('.');
    const intCells = Math.max(2, int.length);
    for (let i = 0; i < intCells; i++) field.append(h('span', { class: 'cell' }, int[i - (intCells - int.length)] ?? ''));
    field.append(h('span', { class: 'cell point' }, '.'));
    field.append(h('span', { class: 'cell' }, dec));
    return field;
  }
  const neg = text.startsWith('△');
  const [intText = '', dec] = (neg ? text.slice(1) : text).split('.');
  const digits: { d: string; commaBefore: boolean }[] = [];
  let comma = false;
  for (const ch of intText) {
    if (ch === ',') comma = true;
    else { digits.push({ d: ch, commaBefore: comma }); comma = false; }
  }
  const total = Math.max(compact ? 6 : AMOUNT_CELLS, digits.length + (neg ? 1 : 0));
  for (let i = 0; i < total - digits.length - (neg ? 1 : 0); i++) field.append(h('span', { class: 'cell empty' }));
  if (neg) field.append(h('span', { class: 'cell neg' }, '△'));
  for (const { d, commaBefore } of digits) {
    if (commaBefore) field.append(h('span', { class: 'sep' }, ','));
    field.append(h('span', { class: 'cell' }, d));
  }
  if (dec !== undefined) {
    field.append(h('span', { class: 'cell point' }, '.'));
    for (const d of dec) field.append(h('span', { class: 'cell' }, d));
  }
  return field;
}

/** 読み上げ用: 科目名は見える `.label` が読まれるので、ここは数字と単位だけ。 */
const spoken = (s: CardSlot) => (s.kind === 'text' ? s.text : `${s.text} ${s.unit}`);

export interface SlipOptions {
  /** 答え合わせで朱書きする場所。 */
  marks?: Location[];
  /** 見本の朱印「記入例」。 */
  example?: boolean;
}

/** 会社名を「名前」と「株式会社」に分ける (狭い幅で、会社の種類の語の前で折り返すため)。 */
function companyName(name: string): HTMLElement {
  const m = /^(.*?)(株式会社)$/.exec(name);
  const el = h('h2', { class: 'company' });
  if (!m) return el.appendChild(h('span', { class: 'co-name' }, name)).parentElement!;
  el.append(h('span', { class: 'co-name' }, m[1]), h('span', { class: 'co-type' }, m[2]));
  return el;
}

/** 伝票 (カード) の外側。中の `.slip` が 1 枚目。 */
export function slipOf(sheet: HTMLElement): HTMLElement {
  return sheet.querySelector<HTMLElement>('.slip')!;
}

const tag = () => h('span', { class: 'tag' }, '異変');

function rowOf(card: Card, s: CardSlot, marked: boolean, compact: boolean): HTMLElement {
  const label = h('div', { class: 'row-label' }, h('span', { class: 'label' }, s.label), s.gloss && h('span', { class: 'gloss' }, s.gloss), marked && tag());
  const body = s.kind === 'text'
    ? h('p', { class: 'sentence' }, h('span', { class: 'sr' }, spoken(s)), h('span', { 'aria-hidden': 'true' }, s.text))
    : h('div', { class: 'amount' }, h('span', { class: 'sr' }, spoken(s)), amountField(s.text, s.kind, compact), h('span', { class: 'unit', 'aria-hidden': 'true' }, s.unit));
  return h('div', { class: `row${s.kind === 'text' ? ' row-text' : ''}${marked ? ' marked' : ''}`, 'data-slot': s.key, 'data-place': `slot:${s.key}` }, label, body);
}

function ghost(d: Card['dropped'][number]): HTMLElement {
  return h('div', { class: 'row ghost marked', 'data-place': `dropped:${d.key}` }, `ここに「${d.label}」の欄があるはずです`);
}

/** 1 ブロックの行 (欠けた欄の位置に「ここに○○があるはず」を挟む)。貸借は見出しの下に分ける。 */
function blockRows(card: Card, b: Block, isMarked: (t: Location['type'], key?: string) => boolean, compact: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  const ghostAt = new Map(card.dropped.filter((d) => d.block === b.id).map((d) => [d.index, d]));
  let lastGroup: string | undefined;
  b.slots.forEach((s, i) => {
    const g = ghostAt.get(i);
    if (g && isMarked('dropped', g.key)) out.push(ghost(g));
    if (s.group && s.group !== lastGroup) out.push(h('p', { class: 'group' }, s.group));
    lastGroup = s.group;
    out.push(rowOf(card, s, isMarked('slot', s.key), compact));
  });
  card.dropped.filter((d) => d.block === b.id && d.index >= b.slots.length && isMarked('dropped', d.key)).forEach((d) => out.push(ghost(d)));
  return out;
}

function docOf(card: Card, part: 1 | 2, isMarked: (t: Location['type'], key?: string) => boolean): HTMLElement {
  const blocks = card.blocks.filter((b) => b.part === part);
  const title = part === 1 ? '資料 1　決算短信のまとめ' : '資料 2　IR のひとこと';
  const doc = h('section', { class: `doc doc-${part}`, 'aria-label': title.replace('　', ' ') }, h('h3', { class: 'doc-title' }, title));
  if (part === 2 && card.irHead) doc.append(h('p', { class: `ir-head${isMarked('irHead') ? ' marked' : ''}`, 'data-place': 'irHead' }, card.irHead.text, isMarked('irHead') && tag()));
  for (const b of blocks) {
    doc.append(h('div', { class: `block block-${b.id}` }, h('h4', { class: 'block-title' }, b.title), ...blockRows(card, b, isMarked, true)));
  }
  return doc;
}

export function renderSlip(card: Card, opt: SlipOptions = {}): HTMLElement {
  const marks = opt.marks ?? [];
  const isMarked = (t: Location['type'], key?: string) => marks.some((m) => m.type === t && (key === undefined || ('key' in m && m.key === key)));
  const slip = h('article', { class: `slip difficulty-${card.difficulty}`, 'data-difficulty': card.difficulty, 'aria-label': `${card.company.name} の決算カード` });
  setVar(slip, '--company', card.company.main);
  setVar(slip, '--company-light', card.company.light);

  const frameMarked = isMarked('frame');
  slip.append(
    h('header', { class: 'slip-head' },
      h('span', { class: 'kakuin', 'aria-hidden': 'true' }, card.company.emblem),
      h('div', { class: 'who' },
        companyName(card.company.name),
        h('p', { class: `period${frameMarked ? ' marked' : ''}`, 'data-place': 'frame' }, card.period, frameMarked && tag()))),
  );
  if (card.headline) {
    const m = isMarked('headline');
    const one = (i: number) => h('p', { class: `headline${m ? ' marked' : ''}`, 'data-place': 'headline', 'data-nth': i }, `【${card.headline!.text}】`, card.headline!.gloss && h('span', { class: 'gloss' }, card.headline!.gloss), m && i === card.headline!.count && tag());
    for (let i = 1; i <= card.headline.count; i++) slip.append(one(i));
  }
  slip.append(h('div', { class: 'rows' }, ...blockRows(card, card.blocks[0]!, isMarked, false)));
  const periodMarked = isMarked('period');
  slip.append(
    h('div', { class: 'slip-foot' },
      h('p', { class: `period-end${periodMarked ? ' marked' : ''}`, 'data-place': 'period' }, card.periodEnd, periodMarked && tag()),
      opt.example ? h('span', { class: 'example-stamp', 'aria-hidden': 'true' }, '記入例') : null),
  );
  const sheet = h('div', { class: 'sheet' }, slip);
  if (card.difficulty === 'easy') return sheet;
  return h('div', { class: 'card-set' }, sheet, h('div', { class: 'docs' }, docOf(card, 1, isMarked), docOf(card, 2, isMarked)));
}
