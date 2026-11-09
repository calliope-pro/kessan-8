// 試作の異変 (docs/design-v3.md §2.2 の台帳のやさしい 15 種類と、§2.3 のむずかしいから 5 種類)。
// 異変は問題データの変更 (数字・文のセル、labelOverrides) か cardEdits で表す。カードを手で書き換えない (設計 R-D2)。
// 元の問題 (同じ会社・同じ期の正常な問題) は変えず、複製に 1 つだけ異変を加える (R-S5 (d))。
import type { Problem } from '../domain/types';
import { fmtAmount, fmtOku, getCell, headlineWord, irOku, ocfClaimIndex, opClaimIndex, type CardEdit, type Difficulty } from './cards';

export interface AnomalyResult {
  kind: string;
  name: string;
  problem: Problem;
  edits: CardEdit[];
  /** 異変の場所。セルのパス・`slot:<キー>`・`headline`・`period`・`frame`。カードの上で見えるものだけ (R-D3・R-S4 の V1)。 */
  places: string[];
  explanation: string;
}

type Made = Pick<AnomalyResult, 'edits' | 'places' | 'explanation'>;
type Rng = () => number;

export interface AnomalyDef {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** この正常な問題に当てられるか (E-02 だけ基の条件がある)。 */
  applies?(p: Problem): boolean;
  make(p: Problem, rng: Rng): Made;
}

const IS = 'tanshin.incomeStatement';
const round1 = (n: number) => Math.round(n * 10) / 10;
const pickOf = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;

function setCell(p: Problem, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<any>((o, k) => o[k], p);
  parent[last] = value;
}

const NUMBER_SLOTS = ['sales', 'opPrev', 'opCurr', 'margin'] as const;
const AMOUNT_SLOTS = ['sales', 'opPrev', 'opCurr'] as const;
const LABEL: Record<string, string> = { sales: '売上高', opPrev: '営業利益 (前期)', opCurr: '営業利益 (当期)', margin: '営業利益率' };
const AMOUNT_PATH: Record<string, string> = { sales: `${IS}.current.netSales`, opPrev: `${IS}.previous.operatingIncome`, opCurr: `${IS}.current.operatingIncome` };
const cur = (p: Problem) => p.tanshin.incomeStatement.current;
const isUp = (p: Problem) => cur(p).operatingIncome > p.tanshin.incomeStatement.previous.operatingIncome;
const claimOf = (p: Problem, n: number, metric: string) => p.ir.statements[n]!.claims.find((c) => c.metric === metric)!;

/** 月末日 (閏年も含む)。表示には使わない (Date は期末日の整形に使わない)。作るときだけ。 */
function monthEnd(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const ANOMALIES: readonly AnomalyDef[] = [
  {
    id: 'E-17', name: '見出しと数字の向きが逆', difficulty: 'easy',
    make(p) {
      const n = opClaimIndex(p);
      const claim = claimOf(p, n, 'operatingIncome');
      const real = headlineWord(claim.direction, '益');
      claim.direction = claim.direction === 'up' ? 'down' : 'up';
      const shown = headlineWord(claim.direction, '益');
      const [pre, now] = [p.tanshin.incomeStatement.previous.operatingIncome, cur(p).operatingIncome];
      return { edits: [], places: [`ir.statements.${n}`], explanation: `見出しは【${shown}】ですが、営業利益は ${fmtAmount(pre)} から ${fmtAmount(now)} へ動いていて、本当は【${real}】です。` };
    },
  },
  {
    id: 'E-12', name: '営業利益率が数字と合わない', difficulty: 'easy',
    make(p) {
      const base = p.tanshin.summary.operatingMargin;
      const bad = round1(base * 2.2);
      p.tanshin.summary.operatingMargin = bad;
      return { edits: [], places: ['tanshin.summary.operatingMargin'], explanation: `営業利益率は ${bad}% と書いてありますが、営業利益 ${fmtAmount(cur(p).operatingIncome)} ÷ 売上高 ${fmtAmount(cur(p).netSales)} は約 ${base}% です。` };
    },
  },
  {
    id: 'E-02', name: '桁がずれた数字', difficulty: 'easy',
    // 増益は 10 倍にしても売上高の 0.8 倍以下の基だけ (10 倍にした営業利益が売上高を超えると E-24 の見え方が同時に出る。設計 §2.2)
    applies: (p) => !isUp(p) || 10 * cur(p).operatingIncome <= 0.8 * cur(p).netSales,
    make(p) {
      const was = cur(p).operatingIncome;
      const up = isUp(p);
      const now = up ? was * 10 : Math.round(was / 10);
      setCell(p, `${IS}.current.operatingIncome`, now);
      // 営業利益率は元のまま (再計算しない): 売上高と営業利益から出る割合と合わなくなる
      return { edits: [], places: [`${IS}.current.operatingIncome`, 'tanshin.summary.operatingMargin'], explanation: `営業利益 (当期) が ${fmtAmount(now)} になっています。前期の ${fmtAmount(p.tanshin.incomeStatement.previous.operatingIncome)} と桁が違い、営業利益率 ${p.tanshin.summary.operatingMargin}% とも合いません。本当は ${fmtAmount(was)} で、桁が 1 つずれています。` };
    },
  },
  {
    id: 'E-24', name: '売上高が営業利益より小さい', difficulty: 'easy',
    make(p) {
      const was = cur(p).netSales;
      const now = Math.round(cur(p).operatingIncome * 0.6);
      setCell(p, `${IS}.current.netSales`, now);
      return { edits: [], places: [`${IS}.current.netSales`, `${IS}.current.operatingIncome`], explanation: `売上高 ${fmtAmount(now)} が、営業利益 ${fmtAmount(cur(p).operatingIncome)} より小さくなっています。営業利益は売上高から費用を引いた残りなので、売上高より大きくなりません。本当の売上高は ${fmtAmount(was)} です。` };
    },
  },
  {
    id: 'E-03', name: '単位の語が 1 つだけ違う', difficulty: 'easy',
    make(_p, rng) {
      const slot = pickOf(rng, AMOUNT_SLOTS);
      return { edits: [{ op: 'unit', slot, unit: '億円' }], places: [`slot:${slot}`], explanation: `「${LABEL[slot]}」の単位だけ「億円」で、ほかの金額は「百万円」です。` };
    },
  },
  {
    id: 'E-05', name: '科目名の誤字', difficulty: 'easy',
    make(p) {
      p.labelOverrides = { ...(p.labelOverrides ?? {}), 'tanshin.incomeStatement.operatingIncome': '営業和益' };
      return { edits: [], places: ['slot:opPrev', 'slot:opCurr'], explanation: '「営業和益」は誤字です。「和」ではなく「利」で、正しくは「営業利益」です。' };
    },
  },
  {
    id: 'E-19', name: '欄が 1 つ足りない', difficulty: 'easy',
    make(_p, rng) {
      const slot = pickOf(rng, NUMBER_SLOTS);
      return { edits: [{ op: 'drop', slot }], places: [`slot:${slot}`], explanation: `いつもある「${LABEL[slot]}」の欄がありません。` };
    },
  },
  {
    id: 'E-22', name: '同じ欄が 2 回出る', difficulty: 'easy',
    make(_p, rng) {
      if (rng() < 0.5) return { edits: [{ op: 'dup', slot: 'headline' }], places: ['headline'], explanation: '見出し語が 2 回出ています。' };
      const slot = pickOf(rng, NUMBER_SLOTS);
      return { edits: [{ op: 'dup', slot }], places: [`slot:${slot}#2`], explanation: `「${LABEL[slot]}」の欄が 2 回出ています。` };
    },
  },
  {
    id: 'E-21', name: '数字の桁区切りが違う', difficulty: 'easy',
    // no-comma は整数部が 4 桁以上の金額の欄 (売上高・営業利益のどれでも)、comma-shift は 5 桁以上 (やさしいでは売上高だけ。設計 §1.6)。
    make(p, rng) {
      const wide = (slot: string, min: number) => Number(getCell(p, AMOUNT_PATH[slot]!)) >= min;
      const shift = rng() >= 0.5 && wide('sales', 10000);
      if (shift) return { edits: [{ op: 'format', slot: 'sales', style: 'comma-shift' }], places: ['slot:sales'], explanation: '「売上高」の桁区切りの位置が、いつもと違います。カンマがずれています。' };
      const slot = pickOf(rng, AMOUNT_SLOTS.filter((k) => wide(k, 1000)));
      return { edits: [{ op: 'format', slot, style: 'no-comma' }], places: [`slot:${slot}`], explanation: `「${LABEL[slot]}」の桁区切りの位置が、いつもと違います。カンマがありません。` };
    },
  },
  {
    id: 'E-25', name: 'あり得ない符号', difficulty: 'easy',
    make(p) {
      return { edits: [{ op: 'sign', slot: 'sales' }], places: ['slot:sales'], explanation: `売上高に △ (マイナス) が付いています。売上高がマイナスになることはありません。本当は ${fmtAmount(cur(p).netSales)} です。` };
    },
  },
  {
    id: 'E-23', name: '見出しの語の種類が違う', difficulty: 'easy',
    make(p) {
      const n = opClaimIndex(p);
      const dir = claimOf(p, n, 'operatingIncome').direction;
      const word = headlineWord(dir, '収');
      return { edits: [{ op: 'headline', word }], places: ['headline'], explanation: `このカードは営業利益 (もうけ) を見せているので、見出しは【${headlineWord(dir, '益')}】のはずです。【${word}】は売上高の語です。` };
    },
  },
  {
    id: 'E-04', name: '期と期末日が合わない', difficulty: 'easy',
    make(p) {
      const path = 'tanshin.columnDates.incomeStatement.current';
      const [y, m] = (getCell(p, path) as string).split('-').map(Number) as [number, number];
      const ny = y - 1;
      setCell(p, path, `${ny}-${String(m).padStart(2, '0')}-${String(monthEnd(ny, m)).padStart(2, '0')}`);
      return { edits: [], places: ['frame', 'period'], explanation: `${p.tanshin.header.periodLabel}なのに、期末日が 1 年前の ${ny}年${m}月${monthEnd(ny, m)}日になっています。` };
    },
  },
  {
    id: 'E-26', name: '添え字が取り違えられている', difficulty: 'easy',
    make(p, rng) {
      const toPrev = rng() < 0.5;
      const slot = toPrev ? 'opCurr' : 'opPrev';
      const word = toPrev ? '前期' : '当期';
      return { edits: [{ op: 'suffix', slot, word }], places: ['slot:opPrev', 'slot:opCurr'], explanation: `「営業利益 (${word})」の行が 2 つ並んでいて、${fmtAmount(p.tanshin.incomeStatement.previous.operatingIncome)} と ${fmtAmount(cur(p).operatingIncome)} の 2 つの違う数字が入っています。同じ期の数字が 2 つあるはずがありません。` };
    },
  },
  {
    id: 'E-27', name: '数字に数字でない字が混じる', difficulty: 'easy',
    make(p, rng) {
      const slot = pickOf(rng, AMOUNT_SLOTS);
      const v = String(getCell(p, AMOUNT_PATH[slot]!));
      const at = Math.floor(v.length / 2);
      const shown = fmtAmount(Number(v)).split('').map((ch, i, a) => (/\d/.test(ch) && a.slice(0, i).filter((c) => /\d/.test(c)).length === at ? 'X' : ch)).join('');
      return { edits: [{ op: 'glyph', slot, at }], places: [`slot:${slot}`], explanation: `「${LABEL[slot]}」の数字が ${shown} になっていて、数字でない字「X」が混じっています。` };
    },
  },
  {
    id: 'E-28', name: '期末日が存在しない日付', difficulty: 'easy',
    make(p) {
      const [y, m] = (getCell(p, 'tanshin.columnDates.incomeStatement.current') as string).split('-').map(Number);
      return { edits: [{ op: 'day', slot: 'period', day: 32 }], places: ['period'], explanation: `期末が ${y}年${m}月32日になっています。${m}月に 32 日はありません。` };
    },
  },
  // ---- むずかしい (試作は 5 種類。1 社を読む時間を、正常と異変の両方で測るため) ----
  {
    id: 'H-01', name: '資産の合計と負債・純資産の合計が一致しない', difficulty: 'hard',
    make(p) {
      const bs = p.tanshin.balanceSheet.current;
      const delta = Math.max(1, Math.round(bs.payables * 0.1));
      bs.payables += delta;
      bs.totalCurrentLiabilities += delta;
      bs.totalLiabilities += delta;
      bs.totalLiabilitiesAndNetAssets += delta;
      return { edits: [], places: ['slot:ta', 'slot:tlna'], explanation: `総資産 ${fmtAmount(bs.totalAssets)} と、負債及び純資産合計 ${fmtAmount(bs.totalLiabilitiesAndNetAssets)} が一致していません。貸借対照表の両側は必ず同じ額になります。` };
    },
  },
  {
    id: 'H-04', name: 'CF の期末残高が貸借の現金と合わない', difficulty: 'hard',
    make(p) {
      const was = p.tanshin.cashFlow.cashEnding;
      p.tanshin.cashFlow.cashEnding = Math.round(was * 1.05);
      return { edits: [], places: ['slot:cfEnd', 'slot:cash'], explanation: `キャッシュ・フローの期末残高 ${fmtAmount(p.tanshin.cashFlow.cashEnding)} が、貸借の現金及び預金 ${fmtAmount(p.tanshin.balanceSheet.current.cash)} と合いません。本当は ${fmtAmount(was)} です。` };
    },
  },
  {
    id: 'H-13', name: '同じ数字が短信と IR で少し違う', difficulty: 'hard',
    make(p) {
      const was = p.ir.highlights.netSales.amount;
      p.ir.highlights.netSales.amount = round1(was * 1.05);
      return { edits: [], places: ['slot:irSales', 'slot:sales'], explanation: `短信の売上高 ${fmtAmount(p.tanshin.incomeStatement.current.netSales)} 百万円に対し、IR の売上高が 5% 多い数字になっています。同じ数字は同じ値のはずです。` };
    },
  },
  {
    id: 'H-21', name: 'IR の文と数字の向きが逆', difficulty: 'hard',
    make(p) {
      const n = ocfClaimIndex(p);
      const claim = claimOf(p, n, 'operatingCashFlow');
      const was = claim.direction;
      claim.direction = was === 'up' ? 'down' : 'up';
      return { edits: [], places: [`ir.statements.${n}`], explanation: `IR は営業キャッシュ・フローを「${claim.direction === 'up' ? 'プラス' : 'マイナス'}」と書いていますが、短信の営業キャッシュ・フローは ${fmtAmount(p.tanshin.cashFlow.operatingCashFlow)} 百万円で、本当は「${was === 'up' ? 'プラス' : 'マイナス'}」です。` };
    },
  },
  {
    id: 'H-33', name: '同じ欄が 2 回出る', difficulty: 'hard',
    make(_p, rng) {
      const slot = pickOf(rng, ['cash', 'ta', 'ocf', 'irSales', 'audit', 'irSegs'] as const);
      return { edits: [{ op: 'dup', slot }], places: [`slot:${slot}#2`], explanation: `資料の「${HARD_LABEL[slot]}」の欄が 2 回出ています。` };
    },
  },
];

const HARD_LABEL: Record<string, string> = { cash: '現金及び預金', ta: '総資産', ocf: '営業キャッシュ・フロー', irSales: 'IR の売上高', audit: '監査', irSegs: 'IR の報告セグメント' };

export function kindsFor(difficulty: Difficulty): AnomalyDef[] {
  return ANOMALIES.filter((a) => a.difficulty === difficulty);
}

export function applicable(kind: string, p: Problem): boolean {
  const def = ANOMALIES.find((a) => a.id === kind);
  if (!def) throw new Error(`知らない異変の種類: ${kind}`);
  return def.applies ? def.applies(p) : true;
}

/** 正常な問題の複製に、異変を 1 つ加える。 */
export function buildAnomaly(kind: string, normal: Problem, rng: Rng): AnomalyResult {
  const def = ANOMALIES.find((a) => a.id === kind);
  if (!def) throw new Error(`知らない異変の種類: ${kind}`);
  if (def.applies && !def.applies(normal)) throw new Error(`${kind} は ${normal.id} には当てられません`);
  const problem = structuredClone(normal);
  const made = def.make(problem, rng);
  return { kind, name: def.name, problem, ...made };
}

// 使っていない import の抑止 (fmtOku・irOku は将来の種類で使う)
void fmtOku; void irOku;
