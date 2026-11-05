// 試作のカード導出 (docs/design-v2.md §1.2 R-D1〜R-D5・§1.6)。純関数: 問題データと形の定義だけから、表示する文字列を作る。
// 試作の範囲はやさしいの 3 形 (E1・E2・E3)。製品の `src/domain/cards.ts` (#138) が、これを手本に作り直す。
import type { Company, Problem } from '../domain/types';

export type ShapeId = 'E1' | 'E2' | 'E3';
export const SHAPES: readonly ShapeId[] = ['E1', 'E2', 'E3'];
export const SHAPE_NAMES: Record<ShapeId, string> = { E1: 'もうけ', E2: '売上の伸び', E3: '持ち物' };

/** 欄の形のずれの編集 (設計 §1.6)。`card` はやさしいでは常に 0。 */
export type CardEdit =
  | { shape: ShapeId; card: number; op: 'drop'; slot: string }
  | { shape: ShapeId; card: number; op: 'swap'; slots: [string, string] }
  | { shape: ShapeId; card: number; op: 'format'; slot: string; style: 'no-comma' | 'comma-shift' }
  | { shape: ShapeId; card: number; op: 'unit'; slot: string; unit: string }
  | { shape: ShapeId; card: number; op: 'dup'; slot: string }
  | { shape: ShapeId; card: number; op: 'headline'; word: string };

/** shape・card を除いた編集の中身 (共用体ごとに Omit する)。 */
export type EditBody = CardEdit extends infer E ? (E extends CardEdit ? Omit<E, 'shape' | 'card'> : never) : never;

export interface CardSlot {
  key: string;
  /** 科目名の項目キー (labelOverrides のキー)。 */
  itemKey: string;
  label: string;
  /** 見て分かる言い換え (1 画面に 1 つ)。 */
  gloss?: string;
  kind: 'amount' | 'ratio';
  value: number;
  /** 表示する数字。桁区切りの位置もここで決まる。 */
  text: string;
  unit: string;
  /** この欄が読むセルのパス (答え合わせが places を当てる。R-D3)。 */
  reads: string[];
}

export interface Card {
  shape: ShapeId;
  shapeName: string;
  company: { id: string; name: string; emblem: string; main: string; light: string };
  period: string;
  /** 期末日 (枠の外。列見出しの日付)。 */
  periodEnd: string;
  headline: { text: string; reads: string[] } | null;
  slots: CardSlot[];
  dropped: { key: string; label: string; index: number }[];
  bars: { axisMin: number; previous: number; current: number; reads: string[] } | null;
}

export type Location =
  | { type: 'slot'; key: string }
  | { type: 'headline' }
  | { type: 'bars' }
  | { type: 'dropped'; key: string }
  | { type: 'period' };

export const CARD_LABELS: Record<string, string> = {
  'tanshin.incomeStatement.netSales': '売上高',
  'tanshin.incomeStatement.operatingIncome': '営業利益',
  'tanshin.summary.operatingMargin': '営業利益率',
  'tanshin.balanceSheet.totalCurrentAssets': '流動資産',
  'tanshin.balanceSheet.totalFixedAssets': '固定資産',
  'tanshin.balanceSheet.totalAssets': '総資産',
};

interface SlotDef {
  key: string;
  itemKey: string;
  suffix?: string;
  gloss?: string;
  kind: 'amount' | 'ratio';
  path: string;
}

const IS = 'tanshin.incomeStatement';
const BS = 'tanshin.balanceSheet.current';
const SHAPE_SLOTS: Record<ShapeId, SlotDef[]> = {
  E1: [
    { key: 'sales', itemKey: 'tanshin.incomeStatement.netSales', kind: 'amount', path: `${IS}.current.netSales` },
    { key: 'opPrev', itemKey: 'tanshin.incomeStatement.operatingIncome', suffix: ' (前期)', kind: 'amount', path: `${IS}.previous.operatingIncome` },
    { key: 'opCurr', itemKey: 'tanshin.incomeStatement.operatingIncome', suffix: ' (当期)', kind: 'amount', path: `${IS}.current.operatingIncome` },
    { key: 'margin', itemKey: 'tanshin.summary.operatingMargin', gloss: 'もうけの割合', kind: 'ratio', path: 'tanshin.summary.operatingMargin' },
  ],
  E2: [
    { key: 'salesPrev', itemKey: 'tanshin.incomeStatement.netSales', suffix: ' (前期)', kind: 'amount', path: `${IS}.previous.netSales` },
    { key: 'salesCurr', itemKey: 'tanshin.incomeStatement.netSales', suffix: ' (当期)', gloss: '売れた金額', kind: 'amount', path: `${IS}.current.netSales` },
  ],
  E3: [
    { key: 'current', itemKey: 'tanshin.balanceSheet.totalCurrentAssets', kind: 'amount', path: `${BS}.totalCurrentAssets` },
    { key: 'fixed', itemKey: 'tanshin.balanceSheet.totalFixedAssets', kind: 'amount', path: `${BS}.totalFixedAssets` },
    { key: 'total', itemKey: 'tanshin.balanceSheet.totalAssets', gloss: '持ち物の合計', kind: 'amount', path: `${BS}.totalAssets` },
  ],
};
/** 見出し語の組は、形が見せる量 (営業利益 = 益、売上高 = 収) で決まる (設計 R-D5・台帳 E-23)。 */
const HEADLINE_METRIC: Partial<Record<ShapeId, { metric: 'operatingIncome' | 'netSales'; noun: '益' | '収' }>> = {
  E1: { metric: 'operatingIncome', noun: '益' },
  E2: { metric: 'netSales', noun: '収' },
};
const PERIOD_END_PATH = 'tanshin.columnDates.incomeStatement.current';

export function getCell(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}

export function fmtAmount(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function shiftComma(value: number): string {
  const digits = String(Math.abs(Math.round(value)));
  const normal = digits.length - 3; // 左から数えた、普通のカンマの位置
  if (normal < 1) return digits;
  const shifted = normal > 1 ? normal - 1 : normal + 1;
  return (value < 0 ? '-' : '') + digits.slice(0, shifted) + ',' + digits.slice(shifted);
}

function jpDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

export function headlineWord(direction: 'up' | 'down' | 'zero', noun: '益' | '収'): string {
  return `${direction === 'down' ? '減' : '増'}${noun}`;
}

export function deriveCard(problem: Problem, company: Company, shape: ShapeId, edits: readonly CardEdit[] = []): Card {
  const mine = edits.filter((e) => e.shape === shape);
  const overrides = problem.labelOverrides ?? {};

  const slots: CardSlot[] = SHAPE_SLOTS[shape].map((d) => {
    const value = getCell(problem, d.path) as number;
    const label = (overrides[d.itemKey] ?? CARD_LABELS[d.itemKey] ?? d.itemKey) + (d.suffix ?? '');
    return {
      key: d.key,
      itemKey: d.itemKey,
      label,
      ...(d.gloss ? { gloss: d.gloss } : {}),
      kind: d.kind,
      value,
      text: d.kind === 'ratio' ? value.toFixed(1) : fmtAmount(value),
      unit: d.kind === 'ratio' ? '%' : '百万円',
      reads: [d.path],
    };
  });

  let headline: Card['headline'] = null;
  const hm = HEADLINE_METRIC[shape];
  if (hm) {
    const n = problem.ir.statements.findIndex((s) => s.slide === 'highlights' && s.claims.some((c) => c.metric === hm.metric));
    const claim = problem.ir.statements[n]?.claims.find((c) => c.metric === hm.metric);
    if (n >= 0 && claim) headline = { text: headlineWord(claim.direction, hm.noun), reads: [`ir.statements.${n}`] };
  }

  let bars: Card['bars'] = null;
  if (shape === 'E2') {
    const b = problem.ir.results.chart.netSales;
    bars = { axisMin: b.axisMin, previous: b.previous, current: b.current, reads: ['ir.results.chart.netSales'] };
  }

  const dropped: Card['dropped'] = [];
  let list = slots;
  for (const e of mine) {
    if (e.op === 'drop') {
      const i = list.findIndex((s) => s.key === e.slot);
      if (i >= 0) {
        dropped.push({ key: e.slot, label: list[i]!.label, index: i });
        list = list.filter((s) => s.key !== e.slot);
      }
    } else if (e.op === 'swap') {
      const [a, b] = e.slots.map((k) => list.findIndex((s) => s.key === k)) as [number, number];
      if (a >= 0 && b >= 0) {
        list = [...list];
        [list[a], list[b]] = [list[b]!, list[a]!];
      }
    } else if (e.op === 'format') {
      list = list.map((s) => (s.key === e.slot ? { ...s, text: e.style === 'no-comma' ? String(s.value) : shiftComma(s.value) } : s));
    } else if (e.op === 'unit') {
      list = list.map((s) => (s.key === e.slot ? { ...s, unit: e.unit } : s));
    } else if (e.op === 'dup') {
      const i = list.findIndex((s) => s.key === e.slot);
      if (i >= 0) {
        list = [...list];
        list.splice(i + 1, 0, { ...list[i]!, key: `${e.slot}#2` });
      }
    } else if (e.op === 'headline') {
      if (headline) headline = { ...headline, text: e.word };
    }
  }

  return {
    shape,
    shapeName: SHAPE_NAMES[shape],
    company: { id: company.id, name: company.name, emblem: company.emblem, main: company.colors.main, light: company.colors.light },
    period: problem.tanshin.header.periodLabel,
    periodEnd: jpDate(getCell(problem, PERIOD_END_PATH)),
    headline,
    slots: list,
    dropped,
    bars,
  };
}

const covers = (read: string, place: string) => place === read || place.startsWith(read + '.');

/** 異変の場所 (問題データのセルのパス・`slot:<キー>`・`period`) を、カード上の場所に当てる (設計 R-D3)。 */
export function locate(card: Card, places: readonly string[]): Location[] {
  const out: Location[] = [];
  for (const place of places) {
    if (place.startsWith('slot:')) {
      const key = place.slice(5);
      if (card.slots.some((s) => s.key === key)) out.push({ type: 'slot', key });
      else if (card.dropped.some((d) => d.key === key)) out.push({ type: 'dropped', key });
      continue;
    }
    if (place === 'period' || covers(PERIOD_END_PATH, place)) {
      out.push({ type: 'period' });
      continue;
    }
    if (card.headline && (place === 'headline' || card.headline.reads.some((r) => covers(r, place)))) {
      out.push({ type: 'headline' });
      continue;
    }
    if (card.bars?.reads.some((r) => covers(r, place))) {
      out.push({ type: 'bars' });
      continue;
    }
    for (const s of card.slots) if (s.reads.some((r) => covers(r, place))) out.push({ type: 'slot', key: s.key });
  }
  return out;
}
