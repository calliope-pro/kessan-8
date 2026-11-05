// 試作の異変 (docs/design-v2.md §2.2 の台帳の、やさしい 15 種類)。
// 異変は問題データの変更 (数字・文のセル、labelOverrides) か cardEdits で表す。カードを手で書き換えない (設計 R-D2)。
// 元の問題 (同じ会社・同じ期の正常な問題) は変えず、複製に 1 つだけ異変を加える (R-S5 (d))。
import type { Problem } from '../domain/types';
import { fmtAmount, getCell, headlineWord, SHAPES, type CardEdit, type EditBody, type ShapeId } from './cards';

export interface AnomalyResult {
  kind: string;
  name: string;
  problem: Problem;
  edits: CardEdit[];
  /** 異変の場所。セルのパス・`slot:<キー>`・`headline`・`period`。カードの上で見えるものだけ (R-D3・R-S4 の V1)。 */
  places: string[];
  explanation: string;
}

type Made = Pick<AnomalyResult, 'edits' | 'places' | 'explanation'>;
type Rng = () => number;

export interface AnomalyDef {
  id: string;
  name: string;
  shapes: readonly ShapeId[];
  make(p: Problem, shape: ShapeId, rng: Rng): Made;
}

const IS = 'tanshin.incomeStatement';
const BS = 'tanshin.balanceSheet.current';
const edit = (shape: ShapeId, e: EditBody): CardEdit => ({ shape, card: 0, ...e });
const round1 = (n: number) => Math.round(n * 10) / 10;

function setCell(p: Problem, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<any>((o, k) => o[k], p);
  parent[last] = value;
}

function claimIndex(p: Problem, metric: 'operatingIncome' | 'netSales'): number {
  return p.ir.statements.findIndex((s) => s.slide === 'highlights' && s.claims.some((c) => c.metric === metric));
}
const metricOf = (shape: ShapeId) => (shape === 'E1' ? 'operatingIncome' : 'netSales');

// 形ごとの、形のずれに使う欄
const UNIT_SLOT: Record<ShapeId, string> = { E1: 'opCurr', E2: 'salesCurr', E3: 'fixed' };
const DROP_SLOT: Record<ShapeId, string> = { E1: 'margin', E2: 'salesPrev', E3: 'fixed' };
const SWAP_SLOTS: Record<ShapeId, [string, string]> = { E1: ['sales', 'margin'], E2: ['salesPrev', 'salesCurr'], E3: ['current', 'total'] };
const FORMAT_SLOT: Record<ShapeId, string> = { E1: 'sales', E2: 'salesCurr', E3: 'current' };
const DUP_SLOT: Record<ShapeId, string> = { E1: 'margin', E2: 'salesCurr', E3: 'fixed' };
const TYPO: Record<ShapeId, { itemKey: string; from: string; to: string; slots: string[] }> = {
  E1: { itemKey: 'tanshin.incomeStatement.operatingIncome', from: '営業利益', to: '営業和益', slots: ['opPrev', 'opCurr'] },
  E2: { itemKey: 'tanshin.incomeStatement.netSales', from: '売上高', to: '売上商', slots: ['salesPrev', 'salesCurr'] },
  E3: { itemKey: 'tanshin.balanceSheet.totalCurrentAssets', from: '流動資産', to: '流動貸産', slots: ['current'] },
};
const LABEL: Record<string, string> = {
  margin: '営業利益率', salesPrev: '売上高 (前期)', fixed: '固定資産', sales: '売上高', salesCurr: '売上高 (当期)', current: '流動資産', total: '総資産', opCurr: '営業利益 (当期)',
};

const ALL = SHAPES;
export const ANOMALIES: readonly AnomalyDef[] = [
  {
    id: 'E-17', name: '見出しと数字の向きが逆', shapes: ['E1', 'E2'],
    make(p, shape) {
      const n = claimIndex(p, metricOf(shape));
      const claim = p.ir.statements[n]!.claims.find((c) => c.metric === metricOf(shape))!;
      const noun = shape === 'E1' ? '益' : '収';
      const real = headlineWord(claim.direction, noun);
      claim.direction = claim.direction === 'up' ? 'down' : 'up';
      const shown = headlineWord(claim.direction, noun);
      const [pre, cur] = shape === 'E1'
        ? [p.tanshin.incomeStatement.previous.operatingIncome, p.tanshin.incomeStatement.current.operatingIncome]
        : [p.tanshin.incomeStatement.previous.netSales, p.tanshin.incomeStatement.current.netSales];
      const what = shape === 'E1' ? '営業利益' : '売上高';
      return { edits: [], places: [`ir.statements.${n}`], explanation: `見出しは【${shown}】ですが、${what}は ${fmtAmount(pre)} から ${fmtAmount(cur)} へ動いていて、本当は【${real}】です。` };
    },
  },
  {
    id: 'E-12', name: '営業利益率が数字と合わない', shapes: ['E1'],
    make(p) {
      const base = p.tanshin.summary.operatingMargin;
      const bad = round1(base * 2.2);
      p.tanshin.summary.operatingMargin = bad;
      const op = p.tanshin.incomeStatement.current.operatingIncome, sales = p.tanshin.incomeStatement.current.netSales;
      return { edits: [], places: ['tanshin.summary.operatingMargin'], explanation: `営業利益率は ${bad}% と書いてありますが、営業利益 ${fmtAmount(op)} ÷ 売上高 ${fmtAmount(sales)} は約 ${base}% です。` };
    },
  },
  {
    id: 'E-02', name: '桁がずれた数字', shapes: ALL,
    make(p, shape) {
      if (shape === 'E1') {
        // 営業利益率は元のまま (再計算しない): 売上高と営業利益から出る割合と合わなくなり、1 枚の中で見える (設計 §2.2。ratio-operating-margin)
        const was = p.tanshin.incomeStatement.current.netSales;
        setCell(p, `${IS}.current.netSales`, was * 10);
        return { edits: [], places: [`${IS}.current.netSales`, 'tanshin.summary.operatingMargin'], explanation: `売上高が ${fmtAmount(was * 10)} になっています。営業利益率 ${p.tanshin.summary.operatingMargin}% と合いません。本当は ${fmtAmount(was)} で、桁が 1 つずれています。` };
      }
      if (shape === 'E2') {
        const was = p.tanshin.incomeStatement.current.netSales;
        setCell(p, `${IS}.current.netSales`, was * 10);
        return { edits: [], places: [`${IS}.current.netSales`], explanation: `当期の売上高が ${fmtAmount(was * 10)} になっています。棒の高さと釣り合いません。本当は ${fmtAmount(was)} で、桁が 1 つずれています。` };
      }
      // 総資産は元のまま (足し直さない): 流動資産 + 固定資産と合わなくなり、1 枚の中で見える (設計 §2.2。bs-total-assets)
      const was = p.tanshin.balanceSheet.current.totalFixedAssets;
      setCell(p, `${BS}.totalFixedAssets`, was * 10);
      return { edits: [], places: [`${BS}.totalFixedAssets`, `${BS}.totalAssets`], explanation: `固定資産が ${fmtAmount(was * 10)} になっています。流動資産との和が総資産 ${fmtAmount(p.tanshin.balanceSheet.current.totalAssets)} と合いません。本当は ${fmtAmount(was)} で、桁が 1 つずれています。` };
    },
  },
  {
    id: 'E-18', name: '2 つの数字が入れ替わっている', shapes: ['E1'],
    make(p) {
      const cur = p.tanshin.incomeStatement.current;
      const [s, o] = [cur.netSales, cur.operatingIncome];
      cur.netSales = o;
      cur.operatingIncome = s;
      return { edits: [], places: [`${IS}.current.netSales`, `${IS}.current.operatingIncome`], explanation: `売上高 ${fmtAmount(o)} と営業利益 ${fmtAmount(s)} が入れ替わっています。売上高が営業利益より小さいはずがありません。` };
    },
  },
  {
    id: 'E-23', name: '見出しの語の種類が違う', shapes: ['E1', 'E2'],
    make(p, shape) {
      const claim = p.ir.statements[claimIndex(p, metricOf(shape))]!.claims.find((c) => c.metric === metricOf(shape))!;
      const word = headlineWord(claim.direction, shape === 'E1' ? '収' : '益');
      const right = headlineWord(claim.direction, shape === 'E1' ? '益' : '収');
      const what = shape === 'E1' ? '営業利益 (もうけ)' : '売上高';
      return { edits: [edit(shape, { op: 'headline', word })], places: ['headline'], explanation: `この伝票は${what}を見せているので、見出しは【${right}】のはずです。【${word}】は別のものの語です。` };
    },
  },
  {
    id: 'E-03', name: '単位の語が 1 つだけ違う', shapes: ALL,
    make(_p, shape) {
      const slot = UNIT_SLOT[shape];
      return { edits: [edit(shape, { op: 'unit', slot, unit: '億円' })], places: [`slot:${slot}`], explanation: `「${LABEL[slot]}」の単位だけ「億円」で、ほかの金額は「百万円」です。` };
    },
  },
  {
    id: 'E-05', name: '科目名の誤字', shapes: ALL,
    make(p, shape) {
      const t = TYPO[shape];
      const d = [...t.to].findIndex((ch, i) => ch !== [...t.from][i]);
      p.labelOverrides = { ...(p.labelOverrides ?? {}), [t.itemKey]: t.to };
      return { edits: [], places: t.slots.map((k) => `slot:${k}`), explanation: `「${t.to}」は誤字です。「${[...t.to][d]}」ではなく「${[...t.from][d]}」で、正しくは「${t.from}」です。` };
    },
  },
  {
    id: 'E-19', name: '欄が 1 つ足りない', shapes: ALL,
    make(_p, shape) {
      const slot = DROP_SLOT[shape];
      return { edits: [edit(shape, { op: 'drop', slot })], places: [`slot:${slot}`], explanation: `いつもある「${LABEL[slot]}」の欄がありません。` };
    },
  },
  {
    id: 'E-20', name: '欄の並びが違う', shapes: ALL,
    make(_p, shape) {
      const [a, b] = SWAP_SLOTS[shape];
      return { edits: [edit(shape, { op: 'swap', slots: [a, b] })], places: [`slot:${a}`, `slot:${b}`], explanation: `「${LABEL[a]}」と「${LABEL[b]}」の位置が、いつもと入れ替わっています。` };
    },
  },
  {
    id: 'E-21', name: '数字の桁区切りが違う', shapes: ALL,
    make(_p, shape, rng) {
      const slot = FORMAT_SLOT[shape];
      const style = rng() < 0.5 ? 'no-comma' : 'comma-shift';
      return { edits: [edit(shape, { op: 'format', slot, style })], places: [`slot:${slot}`], explanation: `「${LABEL[slot]}」の桁区切りの位置が、いつもと違います。${style === 'no-comma' ? '区切りがありません。' : '区切りがずれています。'}` };
    },
  },
  {
    id: 'E-22', name: '同じ欄が 2 回出る', shapes: ALL,
    make(_p, shape) {
      const slot = DUP_SLOT[shape];
      return { edits: [edit(shape, { op: 'dup', slot })], places: [`slot:${slot}#2`], explanation: `「${LABEL[slot]}」の欄が 2 回出ています。` };
    },
  },
  {
    id: 'E-04', name: '期と期末日が合わない', shapes: ALL,
    make(p) {
      const path = 'tanshin.columnDates.incomeStatement.current';
      const was = getCell(p, path) as string;
      const [y, ...rest] = was.split('-');
      setCell(p, path, [String(Number(y) - 1), ...rest].join('-'));
      return { edits: [], places: ['period'], explanation: `${p.tanshin.header.periodLabel}なのに、期末日が 1 年前の日付になっています。` };
    },
  },
  {
    id: 'E-07', name: '棒の高さが数字と逆', shapes: ['E2'],
    make(p) {
      const b = p.ir.results.chart.netSales;
      if (b.current >= b.previous) b.current = round1(b.previous * 0.6);
      else b.previous = round1(b.current * 0.6);
      return { edits: [], places: ['ir.results.chart.netSales'], explanation: `数字では売上が大きいほうの棒が、小さいほうの棒より低く描かれています。` };
    },
  },
  {
    id: 'E-06', name: '棒の高さの比が数字の比と合わない', shapes: ['E2'],
    make(p) {
      const b = p.ir.results.chart.netSales;
      const s = Math.min(b.previous, b.current), l = Math.max(b.previous, b.current);
      b.axisMin = Math.ceil(3 * s - 2 * l);
      return { edits: [], places: ['ir.results.chart.netSales.axisMin'], explanation: `棒グラフが 0 から始まっていません。数字の差は小さいのに、棒の差が大きく見えます。` };
    },
  },
  {
    id: 'E-09', name: '足し算が合わない', shapes: ['E3'],
    make(p) {
      const bs = p.tanshin.balanceSheet.current;
      const sum = bs.totalCurrentAssets + bs.totalFixedAssets;
      bs.totalAssets = Math.round(sum * 1.12);
      return { edits: [], places: [`${BS}.totalAssets`], explanation: `流動資産 ${fmtAmount(bs.totalCurrentAssets)} + 固定資産 ${fmtAmount(bs.totalFixedAssets)} は ${fmtAmount(sum)} ですが、総資産は ${fmtAmount(bs.totalAssets)} と書いてあります。` };
    },
  },
];

export function kindsFor(shape: ShapeId): AnomalyDef[] {
  return ANOMALIES.filter((a) => a.shapes.includes(shape));
}

/** 正常な問題の複製に、異変を 1 つ加える。その形で見えない種類は作らない (R-S4)。 */
export function buildAnomaly(kind: string, normal: Problem, shape: ShapeId, rng: Rng): AnomalyResult {
  const def = ANOMALIES.find((a) => a.id === kind);
  if (!def) throw new Error(`知らない異変の種類: ${kind}`);
  if (!def.shapes.includes(shape)) throw new Error(`${kind} は ${shape} では見えません`);
  const problem = structuredClone(normal);
  const made = def.make(problem, shape, rng);
  return { kind, name: def.name, problem, ...made };
}
