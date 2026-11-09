// 試作のカード導出 (docs/design-v3.md §1.2・§1.3・§1.4・§1.6)。純関数: 問題データと難易度だけから、表示する文字列を作る。
// 形は難易度ごとに 1 種類: やさしい = カード (もうけ)、むずかしい = カード + 資料 1 (決算短信のまとめ) + 資料 2 (IR のひとこと)。
// 製品の `src/domain/cards.ts` (#138・#187) が、これを手本に作り直す。
import type { Company, Problem } from '../domain/types';

export type Difficulty = 'easy' | 'hard';

/** 欄の形のずれの編集 (設計 §1.6)。`swap` は無い (並びの入れ替えは異変にしない)。形が 1 つなので `shape` も `card` も持たない (試作の決め)。 */
export type CardEdit =
  | { op: 'drop'; slot: string }
  | { op: 'format'; slot: string; style: 'no-comma' | 'comma-shift' }
  | { op: 'unit'; slot: string; unit: string }
  | { op: 'dup'; slot: string }
  | { op: 'suffix'; slot: string; word: '前期' | '当期' }
  | { op: 'glyph'; slot: string; at: number }
  | { op: 'sign'; slot: string }
  | { op: 'day'; slot: 'period'; day: number }
  | { op: 'headline'; word: string };

export type BlockId = 'card' | 'pl' | 'bs' | 'cf' | 'notes' | 'ir';

export interface CardSlot {
  key: string;
  /** 科目名の項目キー (labelOverrides のキー)。 */
  itemKey: string;
  label: string;
  /** 見て分かる言い換え (やさしいだけ)。 */
  gloss?: string;
  kind: 'amount' | 'ratio' | 'text';
  /** 数値の欄の値。文欄は null。 */
  value: number | null;
  /** 表示する数字・文。桁区切りの位置・カンマの字もここで決まる。 */
  text: string;
  unit: string;
  /** 貸借の見出し (「資産」「負債及び純資産」)。 */
  group?: string;
  /** この欄が読むセルのパス (答え合わせが places を当てる。R-D3)。 */
  reads: string[];
}

export interface Block {
  id: BlockId;
  /** 0 = カード、1 = 資料 1、2 = 資料 2。 */
  part: 0 | 1 | 2;
  title: string;
  slots: CardSlot[];
}

export interface Card {
  difficulty: Difficulty;
  company: { id: string; name: string; emblem: string; main: string; light: string };
  /** 表題の期 (2024年3月期)。 */
  period: string;
  /** 足元の期末日 (期末 2024年3月31日)。文字列の切り出しで作る。 */
  periodEnd: string;
  headline: { text: string; reads: string[]; gloss: string; count: 1 | 2 } | null;
  blocks: Block[];
  /** すべての欄 (ブロックの順)。 */
  slots: CardSlot[];
  dropped: { key: string; label: string; block: BlockId; index: number }[];
  /** 資料 2 の表題 (IR の社名・期)。枠の外。むずかしいだけ。 */
  irHead: { text: string; reads: string[] } | null;
}

export type Location =
  | { type: 'slot'; key: string }
  | { type: 'headline' }
  | { type: 'dropped'; key: string }
  | { type: 'period' }
  | { type: 'frame' }
  | { type: 'irHead' };

const IS = 'tanshin.incomeStatement';
const BS = 'tanshin.balanceSheet';
const CF = 'tanshin.cashFlow';
const PERIOD_END_PATH = 'tanshin.columnDates.incomeStatement.current';
const FRAME_PATH = 'tanshin.header.periodLabel';
const IR_HEAD_PATHS = ['ir.header.companyName', 'ir.header.periodLabel'];

export function getCell(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}

const CARD_LABELS: Record<string, string> = {
  'tanshin.incomeStatement.netSales': '売上高',
  'tanshin.incomeStatement.operatingIncome': '営業利益',
  'tanshin.summary.operatingMargin': '営業利益率',
};

/**
 * 見て分かる言い換え (要件 7。やさしいのカードにだけ添える。設計 §3.2 #141-7)。科目名ごとに、最初の 1 欄に付く。
 * 営業利益は「売上高との大小が分かる文」: E-24 (売上高が営業利益より小さい) が「もうけが多い会社」と読まれないため。
 */
const GLOSS: Record<string, string> = {
  'tanshin.incomeStatement.netSales': '売れた金額',
  'tanshin.incomeStatement.operatingIncome': '売上高から費用を引いた残り',
  'tanshin.summary.operatingMargin': 'もうけの割合',
};
const HEADLINE_GLOSS: Record<string, string> = { 増益: 'もうけが増えた', 減益: 'もうけが減った', 増収: '売上が増えた', 減収: '売上が減った' };
export const headlineGloss = (word: string): string => HEADLINE_GLOSS[word] ?? '';

export function fmtAmount(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 小数 1 桁の数 (IR の億円)。整数部に桁区切りを付ける。 */
export function fmtOku(n: number): string {
  const [i = '', d = '0'] = n.toFixed(1).split('.');
  return `${fmtAmount(Number(i))}.${d}`;
}

function shiftComma(text: string): string {
  const [int = '', dec] = text.replace(/,/g, '').split('.');
  const digits = int;
  const normal = digits.length - 3; // 左から数えた、普通のカンマの位置
  if (normal < 1) return text;
  const shifted = normal > 1 ? normal - 1 : normal + 1;
  return digits.slice(0, shifted) + ',' + digits.slice(shifted) + (dec !== undefined ? `.${dec}` : '');
}

/** 期末日 (YYYY-MM-DD) の文字列を切り出して「YYYY年M月D日」にする。Date は使わない (E-28 の日 32 が繰り上がらないように。設計 §3.2 #141-8)。 */
export function jpDate(iso: string, day?: number): string {
  const [y, m, d] = iso.split('-');
  return `${Number(y)}年${Number(m)}月${day ?? Number(d)}日`;
}

export function headlineWord(direction: 'up' | 'down' | 'zero', noun: '益' | '収'): string {
  return `${direction === 'down' ? '減' : '増'}${noun}`;
}

/** IR の金額を、試作の決めで億円・小数第 1 位にそろえる (設計 R-D7 の先取り。今のデータは億円 5 社・百万円 5 社)。 */
export const irOku = (v: number, c: Company): number => Math.round((c.irUnit === '億円' ? v : v / 100) * 10) / 10;

interface SlotDef {
  key: string;
  block: BlockId;
  itemKey: string;
  label: string;
  group?: string;
  kind: CardSlot['kind'];
  unit: string;
  reads: string[];
  /** 値 (数値の欄) か文 (文欄)。 */
  get(p: Problem, c: Company): number | string;
}

const num = (key: string, block: BlockId, itemKey: string, label: string, path: string, extra: Partial<SlotDef> = {}): SlotDef => ({
  key, block, itemKey, label, kind: 'amount', unit: '百万円', reads: [path], get: (p) => getCell(p, path) as number, ...extra,
});
const ir = (key: string, label: string, path: string): SlotDef => ({
  key, block: 'ir', itemKey: `ir.${key}`, label, kind: 'amount', unit: '億円', reads: [path], get: (p, c) => irOku(getCell(p, path) as number, c),
});
const text = (key: string, block: BlockId, label: string, reads: string[], get: SlotDef['get']): SlotDef => ({
  key, block, itemKey: `text.${key}`, label, kind: 'text', unit: '', reads, get,
});
const names = (xs: { name: string }[]) => xs.map((x) => x.name).join('・');

const CARD_SLOTS: SlotDef[] = [
  num('sales', 'card', 'tanshin.incomeStatement.netSales', '売上高', `${IS}.current.netSales`),
  num('opPrev', 'card', 'tanshin.incomeStatement.operatingIncome', '営業利益 (前期)', `${IS}.previous.operatingIncome`),
  num('opCurr', 'card', 'tanshin.incomeStatement.operatingIncome', '営業利益 (当期)', `${IS}.current.operatingIncome`),
  num('margin', 'card', 'tanshin.summary.operatingMargin', '営業利益率', 'tanshin.summary.operatingMargin', { kind: 'ratio', unit: '%' }),
];

const SCOPE = (p: Problem) => String(getCell(p, 'tanshin.notes.cashScope'));
const HARD_SLOTS: SlotDef[] = [
  num('pbt', 'pl', `${IS}.incomeBeforeTax`, '税金等調整前当期純利益 (当期)', `${IS}.current.incomeBeforeTax`),
  num('cash', 'bs', `${BS}.cash`, '現金及び預金 (当期末)', `${BS}.current.cash`, { group: '資産' }),
  num('arPrev', 'bs', `${BS}.receivables`, '売上債権 (前期末)', `${BS}.previous.receivables`, { group: '資産' }),
  num('arCurr', 'bs', `${BS}.receivables`, '売上債権 (当期末)', `${BS}.current.receivables`, { group: '資産' }),
  num('ta', 'bs', `${BS}.totalAssets`, '総資産', `${BS}.current.totalAssets`, { group: '資産' }),
  num('tlna', 'bs', `${BS}.totalLiabilitiesAndNetAssets`, '負債及び純資産合計', `${BS}.current.totalLiabilitiesAndNetAssets`, { group: '負債及び純資産' }),
  num('cfStart', 'cf', `${CF}.incomeBeforeTax`, '税金等調整前当期純利益', `${CF}.incomeBeforeTax`),
  num('cfAr', 'cf', `${CF}.receivablesChange`, '売上債権 (売掛金) の増減額', `${CF}.receivablesChange`),
  num('ocf', 'cf', `${CF}.operatingCashFlow`, '営業キャッシュ・フロー', `${CF}.operatingCashFlow`),
  { ...num('cfEnd', 'cf', `${CF}.cashEnding`, '現金及び現金同等物の期末残高', `${CF}.cashEnding`), reads: [`${CF}.cashEnding`, 'tanshin.notes.cashScope'] },
  text('audit', 'notes', '監査', ['tanshin.summary.auditNote'], (p) => getCell(p, 'tanshin.summary.auditNote')),
  text('policyFlag', 'notes', '会計方針の変更', ['tanshin.summary.accountingPolicyChange'], (p) => (getCell(p, 'tanshin.summary.accountingPolicyChange') ? '有' : '無')),
  text('policyNote', 'notes', '会計方針の注記', ['tanshin.notes.accountingPolicyNote'], (p) => getCell(p, 'tanshin.notes.accountingPolicyNote')),
  text('subseq', 'notes', '後発事象', ['tanshin.notes.subsequentEvents'], (p) => getCell(p, 'tanshin.notes.subsequentEvents')),
  text('segs', 'notes', '報告セグメント', ['tanshin.notes.segments.current.segments'], (p) => names(getCell(p, 'tanshin.notes.segments.current.segments'))),
  ir('irSales', '売上高', 'ir.highlights.netSales.amount'),
  ir('irCashCur', '現金 (当期)', 'ir.supplement.cash.current'),
  ir('irCashPrev', '現金 (前期)', 'ir.supplement.cash.previous'),
  ir('irDebtPrev', '有利子負債 (前期)', 'ir.supplement.interestBearingDebt.previous'),
  ir('irNetDebtPrev', '純有利子負債 (前期) = 有利子負債 − 現金', 'ir.supplement.netDebt.previous'),
  text('irOcf', 'ir', '営業キャッシュ・フロー', ['ir.statements'], (p) => {
    const n = ocfClaimIndex(p);
    const d = p.ir.statements[n]?.claims.find((c) => c.metric === 'operatingCashFlow')?.direction;
    return d === 'down' ? 'マイナス' : 'プラス';
  }),
  text('irSubseq', 'ir', '期末後の出来事', ['ir.outlook.subsequentEvent'], (p) => getCell(p, 'ir.outlook.subsequentEvent') ?? 'なし'),
  text('irSegs', 'ir', '報告セグメント', ['ir.segments.items'], (p) => names(getCell(p, 'ir.segments.items'))),
];

export function ocfClaimIndex(p: Problem): number {
  return p.ir.statements.findIndex((s) => s.claims.some((c) => c.metric === 'operatingCashFlow'));
}
export function opClaimIndex(p: Problem): number {
  return p.ir.statements.findIndex((s) => s.slide === 'highlights' && s.claims.some((c) => c.metric === 'operatingIncome'));
}

const BLOCKS: { id: BlockId; part: 0 | 1 | 2; title: string }[] = [
  { id: 'card', part: 0, title: '' },
  { id: 'pl', part: 1, title: '損益' },
  { id: 'bs', part: 1, title: '貸借 (当期末)' },
  { id: 'cf', part: 1, title: 'キャッシュ・フロー' },
  { id: 'notes', part: 1, title: '注記' },
  { id: 'ir', part: 2, title: 'IR のひとこと' },
];

export function deriveCards(problem: Problem, company: Company, difficulty: Difficulty, edits: readonly CardEdit[] = []): Card {
  const overrides = problem.labelOverrides ?? {};
  const defs = difficulty === 'easy' ? CARD_SLOTS : [...CARD_SLOTS, ...HARD_SLOTS];
  const glossed = new Set<string>();
  let entries: { block: BlockId; slot: CardSlot }[] = defs.map((d) => {
    const raw = d.get(problem, company);
    const isText = d.kind === 'text';
    const value = isText ? null : (raw as number);
    const label = overrides[d.itemKey] !== undefined ? overrides[d.itemKey]! + (/ \((前期|当期)\)$/.exec(d.label)?.[0] ?? '') : d.label;
    const first = !glossed.has(d.itemKey);
    glossed.add(d.itemKey);
    const gloss = difficulty === 'easy' && first ? GLOSS[d.itemKey] : undefined;
    const t = isText ? String(raw) : d.kind === 'ratio' ? (raw as number).toFixed(1) : d.unit === '億円' ? fmtOku(raw as number) : fmtAmount(raw as number);
    return {
      block: d.block,
      slot: { key: d.key, itemKey: d.itemKey, label: label === d.label && d.key === 'cfEnd' ? `${label} (範囲: ${SCOPE(problem)})` : label, ...(gloss ? { gloss } : {}), kind: d.kind, value, text: t, unit: d.unit, ...(d.group ? { group: d.group } : {}), reads: d.reads },
    };
  });

  let headline: Card['headline'] = null;
  const n = opClaimIndex(problem);
  const claim = problem.ir.statements[n]?.claims.find((c) => c.metric === 'operatingIncome');
  if (n >= 0 && claim) {
    const word = headlineWord(claim.direction, '益');
    headline = { text: word, reads: [`ir.statements.${n}`], gloss: difficulty === 'easy' ? headlineGloss(word) : '', count: 1 };
  }

  let day: number | undefined;
  const dropped: Card['dropped'] = [];
  const baseIndex = new Map<string, number>();
  for (const b of BLOCKS) entries.filter((e) => e.block === b.id).forEach((e, i) => baseIndex.set(e.slot.key, i));
  const patch = (key: string, f: (s: CardSlot) => CardSlot) => {
    entries = entries.map((e) => (e.slot.key === key ? { ...e, slot: f(e.slot) } : e));
  };
  for (const e of edits) {
    if (e.op === 'drop') {
      const hit = entries.find((x) => x.slot.key === e.slot);
      if (hit) {
        dropped.push({ key: e.slot, label: hit.slot.label, block: hit.block, index: baseIndex.get(e.slot)! });
        entries = entries.filter((x) => x !== hit);
      }
    } else if (e.op === 'format') {
      patch(e.slot, (s) => ({ ...s, text: e.style === 'no-comma' ? s.text.replace(/,/g, '') : shiftComma(s.text) }));
    } else if (e.op === 'unit') {
      patch(e.slot, (s) => ({ ...s, unit: e.unit }));
    } else if (e.op === 'dup') {
      if (e.slot === 'headline') {
        if (headline) headline = { ...headline, count: 2 };
        continue;
      }
      const i = entries.findIndex((x) => x.slot.key === e.slot);
      if (i >= 0) {
        entries = [...entries];
        entries.splice(i + 1, 0, { block: entries[i]!.block, slot: { ...entries[i]!.slot, key: `${e.slot}#2` } });
      }
    } else if (e.op === 'suffix') {
      patch(e.slot, (s) => ({ ...s, label: s.label.replace(/\((前期|当期)\)$/, `(${e.word})`) }));
    } else if (e.op === 'glyph') {
      patch(e.slot, (s) => {
        let k = -1;
        return { ...s, text: [...s.text].map((ch) => (/\d/.test(ch) && ++k === e.at ? 'X' : ch)).join('') };
      });
    } else if (e.op === 'sign') {
      patch(e.slot, (s) => ({ ...s, text: `△${s.text}` }));
    } else if (e.op === 'day') {
      day = e.day;
    } else if (e.op === 'headline') {
      if (headline) headline = { ...headline, text: e.word, gloss: difficulty === 'easy' ? headlineGloss(e.word) : '' };
    }
  }

  const blocks: Block[] = BLOCKS.map((b) => ({ ...b, slots: entries.filter((e) => e.block === b.id).map((e) => e.slot) })).filter((b) => b.slots.length > 0 || b.id === 'card');

  return {
    difficulty,
    company: { id: company.id, name: company.name, emblem: company.emblem, main: company.colors.main, light: company.colors.light },
    period: problem.tanshin.header.periodLabel,
    periodEnd: `期末 ${jpDate(getCell(problem, PERIOD_END_PATH), day)}`,
    headline,
    blocks,
    slots: blocks.flatMap((b) => b.slots),
    dropped,
    irHead: difficulty === 'hard' ? { text: `${problem.ir.header.companyName} ${problem.ir.header.periodLabel}`, reads: IR_HEAD_PATHS } : null,
  };
}

const covers = (read: string, place: string) => place === read || place.startsWith(read + '.');

/** 異変の場所 (問題データのセルのパス・`slot:<キー>`・`headline`・`period`・`frame`) を、カード上の場所に当てる (設計 R-D3)。 */
export function locate(card: Card, places: readonly string[]): Location[] {
  const out: Location[] = [];
  for (const place of places) {
    if (place.startsWith('slot:')) {
      const key = place.slice(5);
      if (card.slots.some((s) => s.key === key)) out.push({ type: 'slot', key });
      else if (card.dropped.some((d) => d.key === key)) out.push({ type: 'dropped', key });
      continue;
    }
    if (place === 'period' || covers(PERIOD_END_PATH, place)) { out.push({ type: 'period' }); continue; }
    if (place === 'frame' || covers(FRAME_PATH, place)) { out.push({ type: 'frame' }); continue; }
    if (place === 'irHead' || (card.irHead && card.irHead.reads.some((r) => covers(r, place)))) { out.push({ type: 'irHead' }); continue; }
    if (card.headline && (place === 'headline' || card.headline.reads.some((r) => covers(r, place)))) { out.push({ type: 'headline' }); continue; }
    for (const s of card.slots) if (s.reads.some((r) => covers(r, place))) out.push({ type: 'slot', key: s.key });
  }
  return out;
}
