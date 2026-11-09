// カードの導出 (docs/design-v3.md §1・ケース表 docs/test-cases/cards.md §1〜§2)。問題データ 1 か所から、1 回の判定で見せるカード (やさしい = カード、むずかしい = カード + 資料) を作る純関数。
// 乱数・時刻・保存・DOM を見ない。形は難易度ごとに 1 つ。異変のカードも、異変の問題データ (数字・文のセル・labelOverrides・cardEdits) から同じ関数で作る (R-D2)。
import { itemKey as itemKeyOf, LABELS } from './labels.ts';
import type { AnomalyPlace, CardEdit, ClaimMetric, Company, Difficulty, Problem } from './types.ts';

/** 文欄の 1 行の上限 (design-v2 §1.1。CJK の 1 行の幅 40 字)。 */
export const CARD_TEXT_MAX = 40;

export type SectionId = 'card' | 'pl' | 'bs' | 'cf' | 'notes' | 'ir';
/** 上限の数え方の単位。カード = card、資料 1 = pl・bs・cf・notes、資料 2 = ir (docs/design-v3.md §1.3)。 */
export type LimitGroup = 'card' | 'doc1' | 'doc2';
export const limitGroupOf = (section: SectionId): LimitGroup => (section === 'card' ? 'card' : section === 'ir' ? 'doc2' : 'doc1');
/** 数字・文欄の上限 (要件 7 と設計 §1.1・§1.3)。やさしいは文欄を持たない。 */
export const CARD_LIMITS: Record<Difficulty, Partial<Record<LimitGroup, { numbers: number; texts: number }>>> = {
  easy: { card: { numbers: 4, texts: 0 } },
  hard: { card: { numbers: 4, texts: 0 }, doc1: { numbers: 10, texts: 5 }, doc2: { numbers: 5, texts: 3 } },
};
/** 見出し語の組 (増益・減益)。 */
export const HEADLINE_WORDS = ['増益', '減益'] as const;
/** card-sign の対象 (正でなければならない金額の欄。設計 §2.3 H-34 の 11 欄。売上高は E-25 も)。 */
export const SIGN_TARGETS: readonly string[] = ['sales', 'ta', 'tlna', 'cash', 'arPrev', 'arCurr', 'cfEnd', 'irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev'];

export interface CardSlot {
  /** 欄の ID (形の中で一意)。 */
  key: string;
  kind: 'number' | 'text';
  /** 画面の区切り (カード・資料 1 の損益・貸借・CF・注記・資料 2)。 */
  section: SectionId;
  /** 貸借の見出し (資産・負債及び純資産)。貸借の欄だけ。 */
  heading?: '資産' | '負債及び純資産';
  /** 前期・当期の列 (科目名の添え字は、欄と一緒に動く)。列を持たない欄は undefined。 */
  column?: 'previous' | 'current';
  /** 数字の種類 (金額・比率)。文欄は text。 */
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
  /** この欄が読むセル `<doc>.<path>`。 */
  reads: string[];
}

export interface CardFrame {
  companyName: string;
  securitiesCode: string;
  emblem: string;
  periodLabel: string;
  reads: string[];
}

export interface Card {
  difficulty: Difficulty;
  /** 表題 (社章・社名・期)。 */
  frame: CardFrame;
  headline?: { word: string; repeat: number; reads: string[] };
  /** 足元 (期末日の表示 `2024年3月31日`)。欄の欠落 (period の drop) で無くなる。 */
  footer?: { periodEnd: string; reads: string[] };
  /** 資料 2 の表題 (むずかしいだけ。枠の外)。 */
  irFrame?: { companyName: string; periodLabel: string; reads: string[] };
  /** 表示順の全欄。 */
  slots: CardSlot[];
}

type Value = { raw: number | string | boolean; text?: string; reads: string[] };
interface Ctx {
  p: Problem;
  c: Company;
}
interface SlotDef {
  key: string;
  kind: 'number' | 'text';
  section: SectionId;
  heading?: CardSlot['heading'];
  itemKey: string | null;
  /** 標準の名前 (LABELS の代わり)。 */
  base?: string;
  suffix?: string | ((ctx: Ctx) => string);
  column?: 'previous' | 'current';
  /** 数字のセルに足して読むセル (科目名に出す語の出所。reads の 2 つ目以降)。 */
  alsoReads?: string[];
  unit?: 'money' | 'pct';
  /** 科目名の差し替えを使わない固定の名前。 */
  label?: string;
  read: (ctx: Ctx) => Value | null;
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

interface NumberOptions {
  section: SectionId;
  heading?: CardSlot['heading'];
  base?: string;
  suffix?: string | ((ctx: Ctx) => string);
  column?: 'previous' | 'current';
  alsoReads?: string[];
  unit?: 'money' | 'pct';
}
function numberSlot(key: string, ref: string, o: NumberOptions): SlotDef {
  return {
    key,
    kind: 'number',
    section: o.section,
    heading: o.heading,
    itemKey: itemKeyOf(docOf(ref), pathOf(ref)),
    base: o.base,
    suffix: o.suffix,
    column: o.column,
    unit: o.unit ?? 'money',
    read: (ctx) => {
      const v = num(ctx, ref);
      return v === null || o.alsoReads === undefined ? v : { ...v, reads: [...v.reads, ...o.alsoReads] };
    },
  };
}

function textCell(key: string, ref: string, section: SectionId, o: { base?: string; fallback?: string } = {}): SlotDef {
  return {
    key,
    kind: 'text',
    section,
    itemKey: itemKeyOf(docOf(ref), pathOf(ref)),
    base: o.base,
    read: (ctx) => {
      const v = cell(ctx.p, ref);
      if (typeof v === 'string') return { raw: v, reads: [ref] };
      return v === null && o.fallback !== undefined ? { raw: o.fallback, reads: [ref] } : null;
    },
  };
}

function namesSlot(key: string, doc: 'tanshin' | 'ir', section: SectionId): SlotDef {
  return {
    key,
    kind: 'text',
    section,
    itemKey: null,
    label: 'セグメント',
    read: (ctx) => {
      const names = doc === 'tanshin' ? ctx.p.tanshin.notes.segments.current.segments.map((s) => s.name) : ctx.p.ir.segments.items.map((s) => s.name);
      const base = doc === 'tanshin' ? 'tanshin.notes.segments.current.segments' : 'ir.segments.items';
      return { raw: names.join('・'), reads: names.map((_, i) => `${base}.${i}.name`) };
    },
  };
}

/** metric の主張 (向きが up・down のもの) を持つ最初の文の添字と向き。無ければ null。見出し語と資料 2 の文の欄は、同じこの文を使う (reads は 1 つの文だけ)。 */
function findClaim(p: Problem, metric: ClaimMetric): { index: number; direction: 'up' | 'down' } | null {
  for (const [index, s] of p.ir.statements.entries()) {
    const c = s.claims.find((x) => x.metric === metric && (x.direction === 'up' || x.direction === 'down'));
    if (c !== undefined) return { index, direction: c.direction as 'up' | 'down' };
  }
  return null;
}

const OPERATING_CF = 'tanshin.cashFlow.operatingCashFlow';
const IS = 'tanshin.incomeStatement';
const BS = 'tanshin.balanceSheet';
const CF = 'tanshin.cashFlow';

/** カード (やさしいのカード = むずかしいのカード。難易度によらず同じ作り)。 */
const CARD_SLOTS: SlotDef[] = [
  numberSlot('sales', `${IS}.current.netSales`, { section: 'card' }),
  numberSlot('opPrev', `${IS}.previous.operatingIncome`, { section: 'card', suffix: ' (前期)', column: 'previous' }),
  numberSlot('opCurr', `${IS}.current.operatingIncome`, { section: 'card', suffix: ' (当期)', column: 'current' }),
  numberSlot('margin', 'tanshin.summary.operatingMargin', { section: 'card', unit: 'pct' }),
];

/** むずかしいが、カードの下に足す資料 (資料 1: 決算短信のまとめ・資料 2: IR のひとこと。docs/design-v3.md §1.3 の表の順)。 */
const DOC_SLOTS: SlotDef[] = [
  numberSlot('pbt', `${IS}.current.incomeBeforeTax`, { section: 'pl', suffix: ' (損益)' }),
  numberSlot('cash', `${BS}.current.cash`, { section: 'bs', heading: '資産' }),
  numberSlot('arPrev', `${BS}.previous.receivables`, { section: 'bs', heading: '資産', suffix: ' (前期末)', column: 'previous' }),
  numberSlot('arCurr', `${BS}.current.receivables`, { section: 'bs', heading: '資産', suffix: ' (当期末)', column: 'current' }),
  numberSlot('ta', `${BS}.current.totalAssets`, { section: 'bs', heading: '資産' }),
  numberSlot('tlna', `${BS}.current.totalLiabilitiesAndNetAssets`, { section: 'bs', heading: '負債及び純資産' }),
  numberSlot('cfStart', `${CF}.incomeBeforeTax`, { section: 'cf', suffix: ' (CF)' }),
  numberSlot('cfAr', `${CF}.receivablesChange`, { section: 'cf' }),
  numberSlot('ocf', `${CF}.operatingCashFlow`, { section: 'cf' }),
  numberSlot('cfEnd', `${CF}.cashEnding`, {
    section: 'cf',
    // 科目名に資金の範囲を出す (H-04 の正常を一意にする。範囲の語は notes.cashScope から作る。枠の外の語)
    suffix: (ctx) => ` (資金の範囲 = ${ctx.p.tanshin.notes.cashScope})`,
    alsoReads: ['tanshin.notes.cashScope'],
  }),
  textCell('audit', 'tanshin.summary.auditNote', 'notes'),
  {
    key: 'policyFlag',
    kind: 'text',
    section: 'notes',
    itemKey: 'tanshin.summary.accountingPolicyChange',
    base: '会計方針の変更の有無',
    read: (ctx) => {
      const v = ctx.p.tanshin.summary.accountingPolicyChange;
      return typeof v === 'boolean' ? { raw: v, text: v ? 'あり' : 'なし', reads: ['tanshin.summary.accountingPolicyChange'] } : null;
    },
  },
  textCell('policyNote', 'tanshin.notes.accountingPolicyNote', 'notes'),
  textCell('subseq', 'tanshin.notes.subsequentEvents', 'notes'),
  namesSlot('segs', 'tanshin', 'notes'),
  numberSlot('irSales', 'ir.highlights.netSales.amount', { section: 'ir' }),
  numberSlot('irCashCur', 'ir.supplement.cash.current', { section: 'ir', suffix: ' (当期)', column: 'current' }),
  numberSlot('irCashPrev', 'ir.supplement.cash.previous', { section: 'ir', suffix: ' (前期)', column: 'previous' }),
  numberSlot('irDebtPrev', 'ir.supplement.interestBearingDebt.previous', { section: 'ir', base: '有利子負債', suffix: ' (前期)', column: 'previous' }),
  numberSlot('irNetDebtPrev', 'ir.supplement.netDebt.previous', { section: 'ir', suffix: ' (前期・有利子負債 − 現金)', column: 'previous' }),
  {
    // 資料 2 の営業 CF の文。claims から型で作り、ir.statements の text は使わない (R-D5)。主語は labels.ts の標準の名前だけ (labelOverrides は読まない:
    // H-30 の誤字は短信の営業 CF の欄だけに出し、IR の文には写さない)。
    key: 'irOcf',
    kind: 'text',
    section: 'ir',
    itemKey: null,
    label: `${LABELS[OPERATING_CF]}の説明`,
    read: (ctx) => {
      const found = findClaim(ctx.p, 'operatingCashFlow');
      if (found === null) return null;
      return { raw: `${LABELS[OPERATING_CF]}は${found.direction === 'up' ? 'プラス' : 'マイナス'}`, reads: [`ir.statements.${found.index}`] };
    },
  },
  textCell('irSubseq', 'ir.outlook.subsequentEvent', 'ir', { fallback: 'なし' }),
  namesSlot('irSegs', 'ir', 'ir'),
];

const defsOf = (difficulty: Difficulty): SlotDef[] => (difficulty === 'easy' ? CARD_SLOTS : [...CARD_SLOTS, ...DOC_SLOTS]);

/** 形の欄の key の並び (難易度ごと)。検証器が、導出したカードの並びと照らす。 */
export const templateKeys = (difficulty: Difficulty): string[] => defsOf(difficulty).map((d) => d.key);

// ---- 書式 ----

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const NEG = '△';

function formatNumber(v: number, decimals: number, style: 'standard' | 'no-comma' | 'comma-shift' = 'standard'): string {
  const [int = '', frac] = Math.abs(v).toFixed(decimals).split('.');
  let body: string;
  if (style === 'no-comma') body = int;
  else if (style === 'comma-shift') {
    if (int.length < 5) throw new RangeError(`桁区切りをずらせない (整数部が 5 桁未満): ${v}`);
    body = `${group(int.slice(0, -4))},${int.slice(-4)}`;
  } else body = group(int);
  return `${v < 0 ? NEG : ''}${body}${frac === undefined ? '' : `.${frac}`}`;
}

/** 数字の欄の小数の桁: 比率は 1 桁、IR の金額は会社によらず 1 桁 (R-D7)、短信の金額は 0 桁。 */
const decimalsOf = (measure: CardSlot['measure'], reads: string[]): number => (measure === 'percent' || reads[0]?.startsWith('ir.') ? 1 : 0);

/** 数字の欄の標準の書式 (3 桁区切り・小数の桁・負の数は △)。 */
export const standardText = (slot: CardSlot): string => (typeof slot.raw === 'number' ? formatNumber(slot.raw, decimalsOf(slot.measure, slot.reads)) : slot.text);

/** `YYYY-MM-DD` を、Date を使わずに文字列を切り出して `YYYY年M月D日` にする (E-28 の日 32 が Invalid Date や繰り上がりにならない。設計 §3.2 #138-8)。 */
function displayDate(iso: unknown, day?: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (m === null) return String(iso);
  return `${Number(m[1])}年${Number(m[2])}月${day ?? Number(m[3])}日`;
}

// ---- 導出 ----

interface Built {
  slot: CardSlot;
  name: string;
  decimals: number;
}

function build(def: SlotDef, ctx: Ctx): Built | null {
  const v = def.read(ctx);
  if (v === null) return null;
  const overrides = ctx.p.labelOverrides ?? {};
  const name = def.label ?? (def.itemKey !== null ? overrides[def.itemKey] : undefined) ?? def.base ?? (def.itemKey !== null ? LABELS[def.itemKey] : undefined) ?? '';
  const suffix = typeof def.suffix === 'function' ? def.suffix(ctx) : (def.suffix ?? '');
  const common = { key: def.key, section: def.section, ...(def.heading ? { heading: def.heading } : {}), itemKey: def.itemKey, label: `${name}${suffix}`, raw: v.raw, reads: v.reads };
  if (def.kind === 'text') return { name, decimals: 0, slot: { ...common, kind: 'text', measure: 'text', text: v.text ?? String(v.raw), unit: '' } };
  const isPct = def.unit === 'pct';
  const measure = isPct ? 'percent' : 'money';
  const decimals = decimalsOf(measure, v.reads);
  const ref = v.reads[0] ?? '';
  const unit = isPct ? '%' : ctx.p[docOf(ref)].header.unit;
  return { name, decimals, slot: { ...common, kind: 'number', measure, ...(def.column ? { column: def.column } : {}), text: formatNumber(v.raw as number, decimals), unit } };
}

function frameOf(ctx: Ctx): CardFrame {
  return {
    companyName: ctx.c.name,
    securitiesCode: ctx.c.securitiesCode,
    emblem: ctx.c.emblem,
    periodLabel: ctx.p.tanshin.header.periodLabel,
    reads: ['tanshin.header.companyName', 'tanshin.header.securitiesCode', 'tanshin.header.periodLabel'],
  };
}

const FOOTER_REF = 'tanshin.columnDates.incomeStatement.current';

const find = (list: Built[], key: string, where: string): number => {
  const i = list.findIndex((b) => b.slot.key === key);
  if (i < 0) throw new RangeError(`${where}: 形に無い欄 ${key}`);
  return i;
};

function applyEdit(edit: CardEdit, built: Built[], card: Card, ctx: Ctx): void {
  const where = `cardEdits (${edit.op})`;
  if (edit.card !== 0) throw new RangeError(`${where}: card は 0 だけ (${String(edit.card)})`);
  switch (edit.op) {
    case 'drop':
      if (edit.slot === 'period') {
        if (card.footer === undefined) throw new RangeError(`${where}: 足元が無い`);
        delete card.footer;
        return;
      }
      built.splice(find(built, edit.slot, where), 1);
      return;
    case 'dup': {
      if (edit.slot === 'headline') {
        if (card.headline === undefined) throw new RangeError(`${where}: 見出し語が無い`);
        card.headline = { ...card.headline, repeat: 2 };
        return;
      }
      const i = find(built, edit.slot, where);
      const copy = built[i] as Built;
      built.splice(i + 1, 0, { ...copy, slot: { ...copy.slot, reads: [...copy.slot.reads] } });
      return;
    }
    case 'format': {
      const b = built[find(built, edit.slot, where)] as Built;
      if (b.slot.kind !== 'number' || typeof b.slot.raw !== 'number') throw new RangeError(`${where}: 数字の欄でない ${edit.slot}`);
      b.slot = { ...b.slot, text: formatNumber(b.slot.raw, b.decimals, edit.style) };
      return;
    }
    case 'unit': {
      const b = built[find(built, edit.slot, where)] as Built;
      b.slot = { ...b.slot, unit: edit.unit };
      return;
    }
    case 'suffix': {
      if (edit.slot !== 'opPrev' && edit.slot !== 'opCurr') throw new RangeError(`${where}: 添え字を取り違えられるのは opPrev・opCurr だけ (${String(edit.slot)})`);
      const b = built[find(built, edit.slot, where)] as Built;
      b.slot = { ...b.slot, label: `${b.name} (${edit.word})` };
      return;
    }
    case 'glyph': {
      const b = built[find(built, edit.slot, where)] as Built;
      const chars = [...b.slot.text];
      if (!Number.isInteger(edit.at) || !/^\d$/.test(chars[edit.at] ?? '')) throw new RangeError(`${where}: ${edit.slot} の表示 ${b.slot.text} の添字 ${edit.at} は数字の文字でない`);
      chars[edit.at] = 'X';
      b.slot = { ...b.slot, text: chars.join('') };
      return;
    }
    case 'sign': {
      const b = built[find(built, edit.slot, where)] as Built;
      if (b.slot.kind !== 'number') throw new RangeError(`${where}: 数字の欄でない ${edit.slot}`);
      b.slot = { ...b.slot, text: `${NEG}${b.slot.text}` };
      return;
    }
    case 'day':
      if (card.footer === undefined) throw new RangeError(`${where}: 足元が無い`);
      card.footer = { ...card.footer, periodEnd: displayDate(cell(ctx.p, FOOTER_REF), edit.day) };
      return;
    case 'headline':
      card.headline = { word: edit.word, repeat: 1, reads: card.headline?.reads ?? [] };
      return;
  }
}

/** 問題・会社・難易度 → カード (やさしい = カード、むずかしい = カード + 資料。1 つの欄の並び)。純関数。applyEdits: false は cardEdits を無視した形のとおりのカード (テンプレート)。 */
export function deriveCards(problem: Problem, company: Company, difficulty: Difficulty, options: { applyEdits?: boolean } = {}): Card {
  if (difficulty !== 'easy' && difficulty !== 'hard') throw new RangeError(`難易度が未知: ${String(difficulty)}`);
  if (difficulty !== problem.difficulty) throw new RangeError(`難易度 ${difficulty} の形を、${problem.difficulty} の問題 ${problem.id} から作れない`);
  const ctx: Ctx = { p: problem, c: company };
  const built = defsOf(difficulty).flatMap((def) => build(def, ctx) ?? []);
  const found = findClaim(problem, 'operatingIncome');
  const card: Card = {
    difficulty,
    frame: frameOf(ctx),
    ...(found === null ? {} : { headline: { word: found.direction === 'up' ? HEADLINE_WORDS[0] : HEADLINE_WORDS[1], repeat: 1, reads: [`ir.statements.${found.index}`] } }),
    footer: { periodEnd: displayDate(cell(problem, FOOTER_REF)), reads: [FOOTER_REF] },
    ...(difficulty === 'hard' ? { irFrame: { companyName: problem.ir.header.companyName, periodLabel: problem.ir.header.periodLabel, reads: ['ir.header.companyName', 'ir.header.periodLabel'] } } : {}),
    slots: [],
  };
  if (options.applyEdits !== false) for (const edit of problem.cardEdits ?? []) applyEdit(edit, built, card, ctx);
  card.slots = built.map((b) => b.slot);
  return card;
}

// ---- カードの上のセル ----

/** 枠の外を除いた数字の欄の数。 */
export const countNumbers = (card: Card): number => card.slots.filter((s) => s.kind === 'number').length;
/** 文欄の数 (見出し語・表題・足元は数えない)。 */
export const countTexts = (card: Card): number => card.slots.filter((s) => s.kind === 'text').length;

const PERIOD_LABEL_REF = 'tanshin.header.periodLabel';
/** 場所の key (frame.period = 表題の期と足元の期末日)。 */
const framePeriodReads = (card: Card): string[] => (card.footer === undefined ? [PERIOD_LABEL_REF] : [PERIOD_LABEL_REF, ...card.footer.reads]);

/** カードが見せるセルの集合: 全欄の reads・itemKey・枠・見出し語・足元・資料 2 の表題と、場所のセル card.0.<key>。 */
export function cardCells(card: Card): Set<string> {
  const out = new Set<string>();
  for (const s of card.slots) {
    out.add(`card.0.${s.key}`);
    s.reads.forEach((r) => out.add(r));
    if (s.itemKey !== null) out.add(s.itemKey);
  }
  card.frame.reads.forEach((r) => out.add(r));
  for (const k of ['frame', 'frame.period']) out.add(`card.0.${k}`);
  if (card.headline) {
    out.add('card.0.headline');
    card.headline.reads.forEach((r) => out.add(r));
  }
  if (card.footer) {
    out.add('card.0.period');
    card.footer.reads.forEach((r) => out.add(r));
  }
  if (card.irFrame) {
    out.add('card.0.irHead');
    card.irFrame.reads.forEach((r) => out.add(r));
  }
  return out;
}

/** 場所 key が、セル read と同じ・read の子・read の入れ物 (key の下に read がある。例: 欠けたセグメントを指す ir.segments.items) のどれか。 */
const covers = (read: string, key: string): boolean => key === read || key.startsWith(`${read}.`) || read.startsWith(`${key}.`);

/** 場所 key (`<doc>.<path>` か itemKey) が、見えるセルの集合に載っているか。同じ・子・入れ物のいずれか (placeSlots と同じ決まり)。 */
export const placeVisible = (cells: Set<string>, key: string): boolean => cells.has(key) || [...cells].some((c) => covers(c, key));

/** 異変の場所を見せる欄の key (R-D3)。パスの場所は reads が同じ・場所の親・場所の入れ物の下 (covers)、itemKey の場所は欄の itemKey が同じ。cardEdits の問題にはテンプレートのカードを渡す。 */
export function placeSlots(card: Card, place: AnomalyPlace): string[] {
  if (place.doc === 'card') {
    if (place.card !== 0) return [];
    const k = place.slot;
    const exists = card.slots.some((s) => s.key === k) || (k === 'headline' && card.headline !== undefined) || k === 'frame' || k === 'frame.period' || (k === 'period' && card.footer !== undefined) || (k === 'irHead' && card.irFrame !== undefined);
    return exists ? [k] : [];
  }
  if ('itemKey' in place) return card.slots.filter((s) => s.itemKey === place.itemKey).map((s) => s.key);
  const key = `${place.doc}.${place.path}`;
  const out: string[] = [];
  if (card.headline?.reads.some((r) => covers(r, key))) out.push('headline');
  for (const s of card.slots) if (s.reads.some((r) => covers(r, key))) out.push(s.key);
  if (card.frame.reads.some((r) => covers(r, key))) out.push('frame');
  if (framePeriodReads(card).some((r) => covers(r, key))) out.push('frame.period');
  if (card.footer?.reads.some((r) => covers(r, key))) out.push('period');
  if (card.irFrame?.reads.some((r) => covers(r, key))) out.push('irHead');
  return out;
}
