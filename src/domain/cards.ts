// カードの導出 (docs/design-v2.md §1・ケース表 docs/test-cases/cards.md §1)。問題データ 1 か所から、1 回の判定で見せるカードを作る純関数。
// 乱数・時刻・保存・DOM を見ない。異変のカードも、異変の問題データ (数字・文のセル・labelOverrides・unitOverrides・signOverrides・cardEdits) から同じ関数で作る (R-D2)。
import { itemKey as itemKeyOf, LABELS, SECTION_OF_ITEM } from './labels.ts';
import { SHAPE_IDS } from './types.ts';
import type { AnomalyPlace, CardEdit, ClaimMetric, Company, Difficulty, Problem, ShapeId } from './types.ts';

export { SHAPE_IDS } from './types.ts';
export type { ShapeId } from './types.ts';

/** 難易度ごとの形。 */
const SHAPES_OF: Record<Difficulty, readonly ShapeId[]> = { easy: ['E1', 'E2', 'E3'], hard: ['H1', 'H2', 'H3'] };
export const shapesOf = (difficulty: Difficulty): ShapeId[] => [...SHAPES_OF[difficulty]];
export const difficultyOfShape = (shape: ShapeId): Difficulty => (shape.startsWith('E') ? 'easy' : 'hard');

/** 文欄の 1 行の上限 (design-v2 §1.1。CJK の 1 行の幅 40 字)。 */
export const CARD_TEXT_MAX = 40;
/** 1 枚のカードに載せる数字・文欄の上限 (要件。やさしいは文欄を持たない)。 */
export const CARD_LIMITS: Record<Difficulty, { numbers: number; texts: number }> = { easy: { numbers: 4, texts: 0 }, hard: { numbers: 4, texts: 3 } };

export interface CardSlot {
  /** 欄の ID (形の中で一意)。 */
  key: string;
  kind: 'number' | 'text';
  /** 数字の種類 (金額・比率)。文欄は text。標準の単位・書式を引くのに使う (検証器の card-unit・card-format)。 */
  measure: 'money' | 'percent' | 'text';
  /** 科目名の項目キー (labels.ts)。科目名でない文欄は null。 */
  itemKey: string | null;
  label: string;
  /** 画面に出す文字列 (数字は桁区切り・符号つき)。 */
  text: string;
  /** 単位の語 (金額は百万円・億円、比率は %、文欄は空)。 */
  unit: string;
  /** 元のセルの値。 */
  raw: number | string | boolean;
  /** この欄が読むセル `<doc>.<path>`。科目名の行は空。 */
  reads: string[];
}

export interface CardBars {
  axisMin: number;
  axisReads: string[];
  items: { key: 'previous' | 'current'; value: number; reads: string[] }[];
}

export interface CardFrame {
  companyName: string;
  securitiesCode: string;
  periodLabel: string;
  /** 短信型・やさしいのカードが見せる表の列見出しの期末日。IR 型は無い。 */
  periodEnd?: string;
  reads: string[];
}

export interface Card {
  /** 形の ID。cardCells が card.<shape>.<カードの番号>.<欄の key> のセルを作るのに使う。 */
  shape: ShapeId;
  doc: 'summary' | 'tanshin' | 'ir';
  frame: CardFrame;
  headline?: { word: string; reads: string[] };
  slots: CardSlot[];
  bars?: CardBars;
  /** 別名: cell は、of (このカードが見せているセル) と正常では必ず等しいので、見えているとみなす (design-v2 §1.5 V2。E2 の棒の規則 chart-bars が読む IR の売上高)。 */
  aliases: { cell: string; of: string }[];
}

type Screen = 'balanceSheet' | 'incomeStatement' | 'cashFlow';
type Value = { raw: number | string | boolean; text?: string; reads: string[] };
interface Ctx {
  p: Problem;
  c: Company;
}
interface SlotDef {
  key: string;
  kind: 'number' | 'text';
  itemKey: string | null;
  /** 標準の名前 (LABELS の代わり)。 */
  base?: string;
  suffix?: string;
  unit?: 'money' | 'pct';
  /** 科目名の差し替えを使わない固定の名前。 */
  label?: string;
  read: (ctx: Ctx) => Value | null;
}
interface CardDef {
  doc: Card['doc'];
  /** 枠の期末日に使う列見出しの画面 (短信型・やさしいだけ)。 */
  screen?: Screen;
  headline?: { metric: ClaimMetric; up: string; down: string };
  bars?: boolean;
  aliases?: [string, string][];
  slots: SlotDef[];
}

/** `<doc>.<path>` のセルの値。 */
function cell(p: Problem, ref: string): unknown {
  const [doc, ...keys] = ref.split('.');
  let node: unknown = doc === 'ir' ? p.ir : p.tanshin;
  for (const k of keys) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

const docOf = (ref: string): 'tanshin' | 'ir' => (ref.startsWith('ir.') ? 'ir' : 'tanshin');
const pathOf = (ref: string): string => ref.slice(ref.indexOf('.') + 1);
const num = (ctx: Ctx, ref: string): Value | null => {
  const v = cell(ctx.p, ref);
  return typeof v === 'number' ? { raw: v, reads: [ref] } : null;
};

function numberSlot(key: string, ref: string, o: { base?: string; suffix?: string; unit?: 'money' | 'pct' } = {}): SlotDef {
  return { key, kind: 'number', itemKey: itemKeyOf(docOf(ref), pathOf(ref)), base: o.base, suffix: o.suffix, unit: o.unit ?? 'money', read: (ctx) => num(ctx, ref) };
}

function textCell(key: string, ref: string, o: { base?: string; fallback?: string } = {}): SlotDef {
  return {
    key,
    kind: 'text',
    itemKey: itemKeyOf(docOf(ref), pathOf(ref)),
    base: o.base,
    read: (ctx) => {
      const v = cell(ctx.p, ref);
      if (typeof v === 'string') return { raw: v, reads: [ref] };
      return v === null && o.fallback !== undefined ? { raw: o.fallback, reads: [ref] } : null;
    },
  };
}

function namesSlot(key: string, doc: 'tanshin' | 'ir'): SlotDef {
  return {
    key,
    kind: 'text',
    itemKey: null,
    label: 'セグメント',
    read: (ctx) => {
      const names =
        doc === 'tanshin' ? ctx.p.tanshin.notes.segments.current.segments.map((s) => s.name) : ctx.p.ir.segments.items.map((s) => s.name);
      const base = doc === 'tanshin' ? 'tanshin.notes.segments.current.segments' : 'ir.segments.items';
      return { raw: names.join('・'), reads: names.map((_, i) => `${base}.${i}.name`) };
    },
  };
}

/** metric の主張 (向きが up・down のもの) を持つ最初の文の添字と向き。無ければ null。見出し語と IR 型の文の欄は、同じこの文を使う (reads は 1 つの文だけ)。 */
function findClaim(p: Problem, metric: ClaimMetric): { index: number; direction: 'up' | 'down' } | null {
  for (const [index, s] of p.ir.statements.entries()) {
    const c = s.claims.find((x) => x.metric === metric && (x.direction === 'up' || x.direction === 'down'));
    if (c !== undefined) return { index, direction: c.direction as 'up' | 'down' };
  }
  return null;
}

/** IR 型の文の欄。claims (metric の主張の向き) から型で作り、ir.statements の text は使わない (docs/design-v2.md §1.2 R-D5。text と claims がずれる経路を無くす)。 */
function claimSentenceSlot(key: string, label: string, metric: ClaimMetric, sentence: (ctx: Ctx, direction: 'up' | 'down') => string): SlotDef {
  return {
    key,
    kind: 'text',
    itemKey: null,
    label,
    read: (ctx) => {
      const found = findClaim(ctx.p, metric);
      if (found === null) return null;
      const text = sentence(ctx, found.direction);
      return { raw: text, reads: [`ir.statements.${found.index}`] };
    },
  };
}

const OPERATING_CF = 'tanshin.cashFlow.operatingCashFlow';

const IS = 'tanshin.incomeStatement';
const BS = 'tanshin.balanceSheet';
const CF = 'tanshin.cashFlow';

const SECTION_WORD = { asset: '資産の部', liability: '負債の部', equity: '純資産の部', total: '' } as const;
const RECEIVABLES = 'tanshin.balanceSheet.receivables';

const SHAPE_DEFS: Record<ShapeId, CardDef[]> = {
  E1: [
    {
      doc: 'summary',
      screen: 'incomeStatement',
      headline: { metric: 'operatingIncome', up: '増益', down: '減益' },
      slots: [
        numberSlot('netSales', `${IS}.current.netSales`),
        numberSlot('opPrev', `${IS}.previous.operatingIncome`, { suffix: ' (前期)' }),
        numberSlot('opCur', `${IS}.current.operatingIncome`, { suffix: ' (当期)' }),
        numberSlot('margin', 'tanshin.summary.operatingMargin', { unit: 'pct' }),
      ],
    },
  ],
  E2: [
    {
      doc: 'summary',
      screen: 'incomeStatement',
      headline: { metric: 'netSales', up: '増収', down: '減収' },
      bars: true,
      aliases: [
        ['ir.results.netSales.previous', `${IS}.previous.netSales`],
        ['ir.results.netSales.current', `${IS}.current.netSales`],
      ],
      slots: [numberSlot('salesPrev', `${IS}.previous.netSales`, { suffix: ' (前期)' }), numberSlot('salesCur', `${IS}.current.netSales`, { suffix: ' (当期)' })],
    },
  ],
  E3: [
    {
      doc: 'summary',
      screen: 'balanceSheet',
      slots: [
        numberSlot('currentAssets', `${BS}.current.totalCurrentAssets`),
        numberSlot('fixedAssets', `${BS}.current.totalFixedAssets`),
        numberSlot('totalAssets', `${BS}.current.totalAssets`),
      ],
    },
  ],
  H1: [
    {
      doc: 'tanshin',
      screen: 'incomeStatement',
      slots: [
        numberSlot('salesPrev', `${IS}.previous.netSales`, { suffix: ' (前期)' }),
        numberSlot('salesCur', `${IS}.current.netSales`, { suffix: ' (当期)' }),
        numberSlot('totalAssets', `${BS}.current.totalAssets`),
        numberSlot('totalLiabNet', `${BS}.current.totalLiabilitiesAndNetAssets`),
      ],
    },
    {
      doc: 'ir',
      slots: [
        numberSlot('netSales', 'ir.highlights.netSales.amount'),
        claimSentenceSlot('claim', '業績の説明', 'netSales', (_ctx, d) => `売上高は前期より${d === 'up' ? '増えた' : '減った'}`),
      ],
    },
  ],
  H2: [
    {
      doc: 'tanshin',
      screen: 'cashFlow',
      slots: [
        numberSlot('recvPrev', `${BS}.previous.receivables`, { suffix: ' (前期末)' }),
        numberSlot('recvCur', `${BS}.current.receivables`, { suffix: ' (当期末)' }),
        numberSlot('recvChange', `${CF}.receivablesChange`),
        numberSlot('operatingCf', `${CF}.operatingCashFlow`),
        {
          key: 'recvRow',
          kind: 'text',
          itemKey: RECEIVABLES,
          label: '資産の科目',
          read: (ctx) => {
            const name = ctx.p.labelOverrides?.[RECEIVABLES] ?? LABELS[RECEIVABLES] ?? RECEIVABLES;
            const section = SECTION_WORD[SECTION_OF_ITEM[RECEIVABLES] ?? 'total'];
            return { raw: name, text: `${name} (${section})`, reads: [] };
          },
        },
        {
          key: 'policyChange',
          kind: 'text',
          itemKey: 'tanshin.summary.accountingPolicyChange',
          base: '会計方針の変更の有無',
          read: (ctx) => {
            const v = ctx.p.tanshin.summary.accountingPolicyChange;
            return typeof v === 'boolean' ? { raw: v, text: v ? 'あり' : 'なし', reads: ['tanshin.summary.accountingPolicyChange'] } : null;
          },
        },
        textCell('policyNote', 'tanshin.notes.accountingPolicyNote'),
      ],
    },
    {
      doc: 'ir',
      slots: [
        // 主語は labels.ts の標準の名前だけ (labelOverrides は読まない: H-30 の誤字は短信の ④ だけに出し、IR の文には写さない)。欄の名前も同じ呼び名にする
        claimSentenceSlot('claim', `${LABELS[OPERATING_CF]}の説明`, 'operatingCashFlow', (_ctx, d) => `${LABELS[OPERATING_CF]}は${d === 'up' ? 'プラス' : 'マイナス'}`),
      ],
    },
  ],
  H3: [
    {
      doc: 'tanshin',
      screen: 'cashFlow',
      slots: [
        numberSlot('cfStart', `${CF}.incomeBeforeTax`, { base: LABELS['tanshin.cashFlow.incomeBeforeTax'], suffix: ' (CF)' }),
        numberSlot('plStart', `${IS}.current.incomeBeforeTax`, { suffix: ' (損益)' }),
        numberSlot('cash', `${BS}.current.cash`),
        numberSlot('cfEnd', `${CF}.cashEnding`),
        textCell('auditNote', 'tanshin.summary.auditNote'),
        textCell('subsequent', 'tanshin.notes.subsequentEvents'),
        namesSlot('segments', 'tanshin'),
      ],
    },
    {
      doc: 'ir',
      slots: [
        numberSlot('cashCur', 'ir.supplement.cash.current', { suffix: ' (当期)' }),
        numberSlot('cashPrev', 'ir.supplement.cash.previous', { suffix: ' (前期)' }),
        numberSlot('debtPrev', 'ir.supplement.interestBearingDebt.previous', { base: '有利子負債', suffix: ' (前期)' }),
        numberSlot('netDebtPrev', 'ir.supplement.netDebt.previous', { suffix: ' (前期・有利子負債 − 現金)' }),
        textCell('subsequent', 'ir.outlook.subsequentEvent', { fallback: 'なし' }),
        namesSlot('segments', 'ir'),
      ],
    },
  ],
};

/** 形の欄の key の並び (カードごと)。検証器が、導出したカードの並びと照らす。 */
export const templateKeys = (shape: ShapeId): string[][] => SHAPE_DEFS[shape].map((d) => d.slots.map((s) => s.key));

// ---- 書式 ----

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface Fmt {
  decimals: number;
  neg: string;
}

function formatNumber(v: number, f: Fmt, style: 'standard' | 'no-comma' | 'comma-shift' = 'standard'): string {
  const [int = '', frac] = Math.abs(v).toFixed(f.decimals).split('.');
  let body: string;
  if (style === 'no-comma') body = int;
  else if (style === 'comma-shift') {
    if (int.length < 5) throw new RangeError(`桁区切りをずらせない (整数部が 5 桁未満): ${v}`);
    body = `${group(int.slice(0, -4))},${int.slice(-4)}`;
  } else body = group(int);
  return `${v < 0 ? f.neg : ''}${body}${frac === undefined ? '' : `.${frac}`}`;
}

// ---- 導出 ----

interface Built {
  slot: CardSlot;
  fmt: Fmt;
}

function frameOf(ctx: Ctx, def: CardDef): CardFrame {
  const doc = def.doc === 'ir' ? 'ir' : 'tanshin';
  const h = ctx.p[doc].header;
  const reads = [`${doc}.header.companyName`, `${doc}.header.securitiesCode`, `${doc}.header.periodLabel`];
  if (def.screen === undefined) return { companyName: h.companyName, securitiesCode: h.securitiesCode, periodLabel: h.periodLabel, reads };
  const ref = `tanshin.columnDates.${def.screen}.current`;
  return { companyName: h.companyName, securitiesCode: h.securitiesCode, periodLabel: h.periodLabel, periodEnd: String(cell(ctx.p, ref)), reads: [...reads, ref] };
}

function build(def: SlotDef, ctx: Ctx): Built | null {
  const v = def.read(ctx);
  if (v === null) return null;
  const overrides = ctx.p.labelOverrides ?? {};
  const name = def.label ?? (def.itemKey !== null ? overrides[def.itemKey] : undefined) ?? def.base ?? (def.itemKey !== null ? LABELS[def.itemKey] : undefined) ?? '';
  const label = `${name}${def.suffix ?? ''}`;
  const ref = v.reads[0] ?? '';
  const sign = ctx.p.signOverrides?.[ref] ?? '△';
  if (def.kind === 'text') {
    return { slot: { key: def.key, kind: 'text', measure: 'text', itemKey: def.itemKey, label, text: v.text ?? String(v.raw), unit: '', raw: v.raw, reads: v.reads }, fmt: { decimals: 0, neg: sign } };
  }
  const isPct = def.unit === 'pct';
  const decimals = isPct || (docOf(ref) === 'ir' && ctx.c.irUnit === '億円') ? 1 : 0;
  const fmt = { decimals, neg: sign };
  let unit = '%';
  if (!isPct) {
    const doc = docOf(ref);
    unit = ctx.p.unitOverrides?.[`${doc}.${ref.split('.')[1] ?? ''}`] ?? ctx.p[doc].header.unit;
  }
  return { slot: { key: def.key, kind: 'number', measure: isPct ? 'percent' : 'money', itemKey: def.itemKey, label, text: formatNumber(v.raw as number, fmt), unit, raw: v.raw, reads: v.reads }, fmt };
}

function headlineOf(def: CardDef, ctx: Ctx): Card['headline'] {
  if (def.headline === undefined) return undefined;
  const { metric, up, down } = def.headline;
  const found = findClaim(ctx.p, metric);
  return found === null ? undefined : { word: found.direction === 'up' ? up : down, reads: [`ir.statements.${found.index}`] };
}

function barsOf(ctx: Ctx): CardBars | undefined {
  const chart = ctx.p.ir.results.chart.netSales;
  const ref = 'ir.results.chart.netSales';
  return {
    axisMin: chart.axisMin,
    axisReads: [`${ref}.axisMin`],
    items: [
      { key: 'previous', value: chart.previous, reads: [`${ref}.previous`] },
      { key: 'current', value: chart.current, reads: [`${ref}.current`] },
    ],
  };
}

const find = (list: Built[], key: string, where: string): number => {
  const i = list.findIndex((b) => b.slot.key === key);
  if (i < 0) throw new RangeError(`${where}: 形に無い欄 ${key}`);
  return i;
};

function applyEdit(edit: CardEdit, built: Built[], card: Card, def: CardDef): void {
  const where = `cardEdits (${edit.shape} カード ${edit.card} ${edit.op})`;
  switch (edit.op) {
    case 'drop':
      built.splice(find(built, edit.slot, where), 1);
      return;
    case 'swap': {
      const [a, b] = [find(built, edit.slots[0], where), find(built, edit.slots[1], where)];
      [built[a], built[b]] = [built[b] as Built, built[a] as Built];
      return;
    }
    case 'dup': {
      const i = find(built, edit.slot, where);
      const copy = built[i] as Built;
      built.splice(i + 1, 0, { slot: { ...copy.slot, reads: [...copy.slot.reads] }, fmt: copy.fmt });
      return;
    }
    case 'format': {
      const b = built[find(built, edit.slot, where)] as Built;
      if (b.slot.kind !== 'number' || typeof b.slot.raw !== 'number') throw new RangeError(`${where}: 数字の欄でない ${edit.slot}`);
      b.slot = { ...b.slot, text: formatNumber(b.slot.raw, b.fmt, edit.style) };
      return;
    }
    case 'unit': {
      const b = built[find(built, edit.slot, where)] as Built;
      b.slot = { ...b.slot, unit: edit.unit };
      return;
    }
    case 'headline':
      if (def.headline === undefined) throw new RangeError(`${where}: この形に見出し語は無い`);
      card.headline = { word: edit.word, reads: card.headline?.reads ?? [] };
      return;
  }
}

/** 問題・会社・形 → カード (やさしい = 1 枚、むずかしい = [短信型, IR 型])。純関数。applyEdits: false は cardEdits を無視した形のとおりのカード (テンプレート)。 */
export function deriveCards(problem: Problem, company: Company, shape: ShapeId, options: { applyEdits?: boolean } = {}): Card[] {
  if (!(SHAPE_IDS as readonly string[]).includes(shape)) throw new RangeError(`形が未知: ${String(shape)}`);
  if (difficultyOfShape(shape) !== problem.difficulty) throw new RangeError(`形 ${shape} は ${difficultyOfShape(shape)} の形で、問題 ${problem.id} は ${problem.difficulty}`);
  const ctx: Ctx = { p: problem, c: company };
  const defs = SHAPE_DEFS[shape];
  const builts: Built[][] = defs.map((def) => def.slots.flatMap((s) => build(s, ctx) ?? []));
  const cards: Card[] = defs.map((def) => ({
    shape,
    doc: def.doc,
    frame: frameOf(ctx, def),
    headline: headlineOf(def, ctx),
    slots: [],
    bars: def.bars ? barsOf(ctx) : undefined,
    aliases: (def.aliases ?? []).map(([c, of]) => ({ cell: c, of })),
  }));
  if (options.applyEdits !== false) {
    for (const edit of problem.cardEdits ?? []) {
      if (edit.shape !== shape) continue;
      const card = cards[edit.card];
      const built = builts[edit.card];
      const def = defs[edit.card];
      if (card === undefined || built === undefined || def === undefined) throw new RangeError(`cardEdits: カード ${edit.card} が ${shape} に無い`);
      applyEdit(edit, built, card, def);
    }
  }
  cards.forEach((card, i) => {
    card.slots = (builts[i] ?? []).map((b) => b.slot);
    if (card.headline === undefined) delete card.headline;
    if (card.bars === undefined) delete card.bars;
  });
  return cards;
}

// ---- カードの上のセル ----

/** 枠の外を除いた数字の数 (棒 1 本も 1 つ)。 */
export const countNumbers = (card: Card): number => card.slots.filter((s) => s.kind === 'number').length + (card.bars?.items.length ?? 0);
/** 文欄の数 (見出し語は数えない)。 */
export const countTexts = (card: Card): number => card.slots.filter((s) => s.kind === 'text').length;

/** カードが見せるセルの集合: 全欄の reads・itemKey・枠・見出し語・棒・別名。 */
export function cardCells(cards: Card[]): Set<string> {
  const out = new Set<string>();
  cards.forEach((card, ci) => {
    // 形のずれの場所 (design-v2 §2.8): card.<形>.<カードの番号>.<欄の key>。見出し語は headline
    for (const s of card.slots) out.add(`card.${card.shape}.${ci}.${s.key}`);
    if (card.headline) out.add(`card.${card.shape}.${ci}.headline`);
  });
  for (const card of cards) {
    card.frame.reads.forEach((r) => out.add(r));
    card.headline?.reads.forEach((r) => out.add(r));
    for (const s of card.slots) {
      s.reads.forEach((r) => out.add(r));
      if (s.itemKey !== null) out.add(s.itemKey);
    }
    card.bars?.axisReads.forEach((r) => out.add(r));
    card.bars?.items.forEach((i) => i.reads.forEach((r) => out.add(r)));
    for (const a of card.aliases) if (out.has(a.of)) out.add(a.cell);
  }
  return out;
}

/** 場所 key が、セル read と同じ・read の子・read の入れ物 (key の下に read がある。例: 欠けたセグメントを指す ir.segments.items) のどれか。 */
const covers = (read: string, key: string): boolean => key === read || key.startsWith(`${read}.`) || read.startsWith(`${key}.`);

/** 場所 key (`<doc>.<path>` か itemKey) が、見えるセルの集合に載っているか。同じ・子・入れ物のいずれか (placeSlots と同じ決まり)。 */
export const placeVisible = (cells: Set<string>, key: string): boolean => cells.has(key) || [...cells].some((c) => covers(c, key));

/** 異変の場所を見せる欄 (R-D3)。パスの場所は reads が同じ・場所の親・場所の入れ物の下 (covers)、itemKey の場所は欄の itemKey が同じ。cardEdits の問題には applyEdits: false のカードを渡す。 */
export function placeSlots(cards: Card[], place: AnomalyPlace): { card: number; key: string }[] {
  const out: { card: number; key: string }[] = [];
  if (place.doc === 'card') {
    const card = cards[place.card];
    if (card !== undefined && card.shape === place.shape && (card.slots.some((s) => s.key === place.slot) || (place.slot === 'headline' && card.headline !== undefined))) out.push({ card: place.card, key: place.slot });
    return out;
  }
  cards.forEach((card, ci) => {
    if ('itemKey' in place) {
      for (const s of card.slots) if (s.itemKey === place.itemKey) out.push({ card: ci, key: s.key });
      return;
    }
    const key = `${place.doc}.${place.path}`;
    if (card.headline?.reads.some((r) => covers(r, key))) out.push({ card: ci, key: 'headline' });
    for (const s of card.slots) {
      const viaAlias = card.aliases.some((a) => a.cell === key && s.reads.includes(a.of));
      if (viaAlias || s.reads.some((r) => covers(r, key))) out.push({ card: ci, key: s.key });
    }
    if (card.bars && [...card.bars.axisReads, ...card.bars.items.flatMap((i) => i.reads)].some((r) => covers(r, key))) out.push({ card: ci, key: 'bars' });
    if (card.frame.reads.some((r) => covers(r, key))) out.push({ card: ci, key: 'frame' });
  });
  return out;
}

// ---- 検証器が使う、形の定義と標準 ----

/** 形・カードの見出し語の組 (増益・減益など)。見出し語の無い形は null。 */
export function headlineWords(shape: ShapeId, card: number): [string, string] | null {
  const h = SHAPE_DEFS[shape][card]?.headline;
  return h === undefined ? null : [h.up, h.down];
}

/** 数字の欄の標準の書式 (3 桁区切り・小数の桁・比率は小数第一位)。負の記号は、欄に出ている記号をそのまま使う (記号の差し替えは sign-consistency の仕事)。 */
export function standardText(slot: CardSlot, company: Company): string {
  if (typeof slot.raw !== 'number') return slot.text;
  const decimals = slot.measure === 'percent' || (slot.reads[0]?.startsWith('ir.') && company.irUnit === '億円') ? 1 : 0;
  return formatNumber(slot.raw, { decimals, neg: slot.raw < 0 ? (slot.text[0] ?? '') : '' });
}
