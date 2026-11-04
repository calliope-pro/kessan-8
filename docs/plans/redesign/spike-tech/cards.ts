// 試作 (製品のコードではない)。Task #125 / Sub-task #126・#131。
// 「異変の検出に要るセル」を、2 通りの数えかたで、各「異変あり」の問題について画面数・セル数にする。
//   和   = 期待する規則 (anomaly.expectedRules) が落としたすべての違反の paths の和。「手がかりを全部見るのに要る画面」
//   最小 = 違反 1 つの paths が出る画面数 (次にセル数) が最も小さいもの。「検出に要る画面」。検出には 1 つの式の食い違いが見えれば足りる
// さらに「固定したテンプレートのスロットに、検出に要るセルが揃うか」(本当の縛り) を調べる:
//   やさしい = カード 1 枚・スロット 4 つ (どの文書のセルでもよい)、むずかしい = 短信型 4 つ + IR 型 4 つ (#120 の plans.md の案 1 の定義)。
//   スロットの組を 1 つに固定したとき、検出のセル (違反 1 つの paths) がスロットに収まる異変の問題が、最大いくつか (全組の探索)。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-tech/cards.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const kinds = read('src/data/anomaly-kinds.json');
const kindOf = (id: string) => kinds.find((k: any) => k.id === id);
const comp = (id: string) => companies.find((c: any) => c.id === id);

// '<doc>.<path>' が出る画面。header は全画面に出るので数えない。dates はサマリー。
function screenOf(p: any, full: string): string | null {
  const [doc, ...rest] = full.split('.');
  const head = rest[0];
  if (head === 'header') return null;
  if (head === 'dates') return 'tanshin.summary';
  if (head === 'columnDates') return `${doc}.${rest[1]}`;
  if (head === 'statements') return `ir.${p.ir.statements?.[Number(rest[1])]?.slide ?? '?'}`;
  return `${doc}.${head}`;
}
// スロットの比較用に、添字の数字を * にする (セグメントの 0 番・1 番は同じ種類のセルとして扱う)。
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');

// 会社の設定 (Company: 社名・証券コード・セグメント名と数・決算期の月) と比べる規則。paths のセルだけでは検出できない (設定は画面に出ない)。
const COMPANY_RULES = new Set(['header-company-name', 'header-securities-code', 'segment-names', 'seg-count']);

interface Det { rule: string; cells: string[]; screens: string[]; note: boolean }
interface Row { id: string; kind: string; name: string; sumScreens: number; sumCells: number; min: Det; dets: Det[] }
const rows: Row[] = [];
for (const d of ['easy', 'hard']) {
  for (const f of readdirSync(resolve(root, `src/data/problems/${d}`)).sort()) {
    const p = read(`src/data/problems/${d}/${f}`);
    if (!p.anomaly) continue;
    const res = verifyProblem(p, comp(p.companyId));
    const expected = new Set<string>(p.anomaly.expectedRules);
    const vs = [...res.hard, ...res.soft].filter((v: any) => expected.has(v.rule));
    const dets: Det[] = vs.map((v: any) => {
      const cells = [...new Set<string>(v.paths)].filter((c) => screenOf(p, c) !== null);
      const screens = [...new Set(cells.map((c) => screenOf(p, c)!))];
      return { rule: v.rule, cells, screens, note: cells.length === 0 || COMPANY_RULES.has(v.rule) }; // note: セルが出ない・会社の設定と比べる規則 (セルだけでは検出できない)
    });
    const allCells = [...new Set(dets.flatMap((x) => x.cells))];
    const sumScreens = new Set(allCells.map((c) => screenOf(p, c)!)).size;
    const usable = dets.filter((x) => !x.note);
    const pool = usable.length ? usable : dets;
    const min = [...pool].sort((a, b) => a.screens.length - b.screens.length || a.cells.length - b.cells.length)[0];
    rows.push({ id: p.id, kind: p.anomaly.kind, name: kindOf(p.anomaly.kind)?.name, sumScreens, sumCells: allCells.length, min, dets });
  }
}
console.log('id  種類  名前  | 和: 画面/セル | 最小: 画面/セル (規則) [注]');
for (const r of rows) console.log([r.id, r.kind, r.name, `| 和 ${r.sumScreens}/${r.sumCells}`, `| 最小 ${r.min.screens.length}/${r.min.cells.length} (${r.min.rule})${r.min.note ? ' [会社の設定と比べる規則か、セルが出ない規則。画面のセルだけでは確かでない]' : ''}`].join('  '));
for (const d of ['easy', 'hard']) {
  const a = rows.filter((r) => r.id.startsWith(d));
  const cnt = (f: (r: Row) => boolean) => a.filter(f).length;
  console.log(`${d}: 異変あり ${a.length} 問`);
  console.log(`  和   : 1 画面以内 ${cnt((r) => r.sumScreens <= 1)} / 2 画面 ${cnt((r) => r.sumScreens === 2)} / 3 画面以上 ${cnt((r) => r.sumScreens >= 3)}`);
  console.log(`  最小 : 1 画面以内 ${cnt((r) => r.min.screens.length <= 1 && !r.min.note)} / 2 画面 ${cnt((r) => r.min.screens.length === 2 && !r.min.note)} / 3 画面以上 ${cnt((r) => r.min.screens.length >= 3 && !r.min.note)} / 会社の設定と比べる規則 ${cnt((r) => r.min.note)}`);
  console.log(`  最小で、検出のセルが 4 つ以内: ${cnt((r) => r.min.cells.length <= 4 && !r.min.note)} (会社の設定と比べる規則の問題は除く)`);
  console.log(`  最小がサマリーだけ: ${a.filter((r) => r.min.screens.length === 1 && r.min.screens[0] === 'tanshin.summary').map((r) => r.id).join(' ') || 'なし'}`);
}

// 固定したスロットの組への収まり。各問題の選択肢 = 期待する規則の違反ごとの検出のセル。
// 正規化: 違反の中で、添字 (数字の経路の要素) を出てきた順に *0・*1… に置く (複数の添字を読む規則を、スロットを少なく数えない)。
const numericCell = new Map<string, boolean>(); // 正規化したセル → 数字のセル (JSON の値が number) か
function normViolation(p: any, cells: string[]): string[] {
  const rank = new Map<string, number>();
  return cells.map((c) => {
    const nc = c.split('.').map((seg) => (/^\d+$/.test(seg) ? `*${rank.has(seg) ? rank.get(seg) : (rank.set(seg, rank.size), rank.size - 1)}` : seg)).join('.');
    const [doc, ...rest] = c.split('.');
    const v = rest.reduce((n: any, k) => (n == null ? n : n[k]), p[doc]);
    numericCell.set(nc, typeof v === 'number');
    return nc;
  });
}
interface Opt { cells: string[]; rule: string }
interface Prob { id: string; opts: Opt[] }
const problemsOf = (prefix: string): Prob[] => rows.filter((r) => r.id.startsWith(prefix)).map((r) => {
  const p = read(`src/data/problems/${prefix}/${r.id}.json`);
  return { id: `${r.id} ${r.kind}`, opts: r.dets.filter((x) => !x.note && x.cells.length > 0).map((x) => ({ cells: normViolation(p, x.cells), rule: x.rule })) };
}).filter((x) => x.opts.length > 0);
interface Top { n: number; slots: string[]; picks: { id: string; rule: string; cells: string[] }[] }
function best(probs: Prob[], fits: (u: Set<string>) => boolean): Top {
  let top: Top = { n: -1, slots: [], picks: [] };
  const go = (i: number, u: Set<string>, picks: Top['picks']) => {
    if (picks.length + (probs.length - i) <= top.n) return; // 枝刈り
    if (i === probs.length) { if (picks.length > top.n) top = { n: picks.length, slots: [...u].sort(), picks: [...picks] }; return; }
    for (const o of probs[i].opts) {
      const nu = new Set([...u, ...o.cells]);
      if (fits(nu)) go(i + 1, nu, [...picks, { id: probs[i].id, rule: o.rule, cells: o.cells }]);
    }
    go(i + 1, u, picks);
  };
  go(0, new Set(), []);
  return top;
}
const easy = problemsOf('easy');
const hard = problemsOf('hard');
const isIr = (c: string) => c.startsWith('ir.');
// 2 つの数えかた: (全) どのセルもスロット 1 つ / (数+文) 数字のセルは 1 枚 4 つ以内、文字のセルは 1 枚 3 つ以内 (ビジネスのカード = 見出し 1 行 + 3 文 + 数字 4 つ以内)
const fitsAll = (cap: number) => (u: Set<string>) => u.size <= cap;
const fitsNT = (u: Set<string>) => [...u].filter((c) => numericCell.get(c)).length <= 4 && [...u].filter((c) => !numericCell.get(c)).length <= 3;
const fitsAllHard = (u: Set<string>) => [...u].filter(isIr).length <= 4 && [...u].filter((c) => !isIr(c)).length <= 4;
const fitsNTHard = (u: Set<string>) => ['tanshin', 'ir'].every((d) => { const cs = [...u].filter((c) => (d === 'ir') === isIr(c)); return cs.filter((c) => numericCell.get(c)).length <= 4 && cs.filter((c) => !numericCell.get(c)).length <= 3; });
function report(label: string, probs: Prob[], t: Top) {
  const types = new Set(t.picks.map((x) => `${x.rule}|${[...x.cells].sort().join(',')}`));
  console.log(`[固定したスロットへの収まり] ${label}: 最大 ${t.n} / ${probs.length} 問、見え方の違う型 ${types.size} 個\n   スロット: ${t.slots.join(', ')}\n   収まる問題 (使った規則): ${t.picks.map((x) => `${x.id} (${x.rule})`).join(' | ')}`);
}
console.log('');
report('やさしい・カード 1 枚・スロット 4 つ (全セル)', easy, best(easy, fitsAll(4)));
report('やさしい・カード 1 枚・数字 4 + 文 3', easy, best(easy, fitsNT));
report('むずかしい・短信型 4 + IR 型 4 (全セル)', hard, best(hard, fitsAllHard));
report('むずかしい・短信型 + IR 型・各 数字 4 + 文 3', hard, best(hard, fitsNTHard));
console.log(`[参考] むずかしい・カード 1 枚・スロット 4 つ → 最大 ${best(hard, fitsAll(4)).n} / ${hard.length} 問 / スロット 8 つ (文書の区別なし) → 最大 ${best(hard, fitsAll(8)).n} / ${hard.length} 問`);

// テンプレートを複数にする別案 (§6.1 の別案): 1 つ目の最良の組で収まらない問題から、次の最良の組を取る (貪欲。最適とは限らない)。
function greedy(label: string, probs: Prob[], fits: (u: Set<string>) => boolean, max: number) {
  let rest = probs;
  let total = 0;
  const out: string[] = [];
  for (let t = 1; t <= max && rest.length; t++) {
    const b = best(rest, fits);
    if (b.n <= 0) break;
    total += b.n;
    rest = rest.filter((p) => !b.picks.some((x) => x.id === p.id));
    out.push(`${t} 個目で +${b.n} (累計 ${total}/${probs.length})`);
  }
  console.log(`[テンプレートを複数にした場合の貪欲な収まり] ${label}: ${out.join(' / ')}`);
}
greedy('やさしい (全セル 4 スロット)', easy, fitsAll(4), 4);
greedy('やさしい (数字 4 + 文 3)', easy, fitsNT, 4);
greedy('むずかしい (短信型 4 + IR 型 4。全セル)', hard, fitsAllHard, 4);
greedy('むずかしい (各 数字 4 + 文 3)', hard, fitsNTHard, 4);
