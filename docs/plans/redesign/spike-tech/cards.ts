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
const COMPANY_RULES = new Set(['header-company-name', 'header-securities-code', 'segment-names', 'seg-count', 'dates-column-headings']);

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
  console.log(`  最小 : 1 画面以内 ${cnt((r) => r.min.screens.length <= 1 && !r.min.note)} / 2 画面 ${cnt((r) => r.min.screens.length === 2)} / 3 画面以上 ${cnt((r) => r.min.screens.length >= 3)} / セルが出ない規則 ${cnt((r) => r.min.note)}`);
  console.log(`  最小で、検出のセルが 4 つ以内: ${cnt((r) => r.min.cells.length <= 4 && !r.min.note)}`);
  console.log(`  最小がサマリーだけ: ${a.filter((r) => r.min.screens.length === 1 && r.min.screens[0] === 'tanshin.summary').map((r) => r.id).join(' ') || 'なし'}`);
}

// 固定したスロットの組への収まり。各問題の選択肢 = 期待する規則の違反ごとの検出のセル (正規化)。
interface Opt { cells: string[] }
function best(probs: { id: string; opts: Opt[] }[], fits: (u: Set<string>) => boolean) {
  let top: { n: number; slots: string[]; ids: string[] } = { n: -1, slots: [], ids: [] };
  const go = (i: number, u: Set<string>, ids: string[]) => {
    if (ids.length + (probs.length - i) <= top.n) return; // 枝刈り
    if (i === probs.length) { if (ids.length > top.n) top = { n: ids.length, slots: [...u].sort(), ids: [...ids] }; return; }
    for (const o of probs[i].opts) {
      const nu = new Set([...u, ...o.cells]);
      if (fits(nu)) go(i + 1, nu, [...ids, probs[i].id]);
    }
    go(i + 1, u, ids);
  };
  go(0, new Set(), []);
  return top;
}
const optsOf = (r: Row) => ({ id: `${r.id} ${r.kind}`, opts: r.dets.filter((x) => !x.note && x.cells.length > 0).map((x) => ({ cells: x.cells.map(norm) })) }).opts.length ? { id: `${r.id} ${r.kind}`, opts: r.dets.filter((x) => !x.note && x.cells.length > 0).map((x) => ({ cells: x.cells.map(norm) })) } : null;
const easy = rows.filter((r) => r.id.startsWith('easy')).map(optsOf).filter(Boolean) as any[];
const hard = rows.filter((r) => r.id.startsWith('hard')).map(optsOf).filter(Boolean) as any[];
const be = best(easy, (u) => u.size <= 4);
console.log(`\n[固定したスロットへの収まり] やさしい: カード 1 枚・スロット 4 つ → 最大 ${be.n} / ${easy.length} 問  スロット: ${be.slots.join(', ')}\n   収まる問題: ${be.ids.join(' | ')}`);
const isIr = (c: string) => c.startsWith('ir.');
const bh = best(hard, (u) => [...u].filter(isIr).length <= 4 && [...u].filter((c) => !isIr(c)).length <= 4);
console.log(`[固定したスロットへの収まり] むずかしい: 短信型 4 つ + IR 型 4 つ → 最大 ${bh.n} / ${hard.length} 問  スロット: ${bh.slots.join(', ')}\n   収まる問題: ${bh.ids.join(' | ')}`);
const bh1 = best(hard, (u) => u.size <= 4);
console.log(`[参考] むずかしい: カード 1 枚・スロット 4 つ → 最大 ${bh1.n} / ${hard.length} 問`);
const bhAny = best(hard, (u) => u.size <= 8);
console.log(`[参考] むずかしい: スロット 8 つ (文書の区別なし) → 最大 ${bhAny.n} / ${hard.length} 問`);

// テンプレートを複数にする別案 (§6.1 の別案): 1 つ目の最良の組で収まらない問題から、次の最良の組を取る (貪欲。最適とは限らない)。
function greedy(label: string, probs: { id: string; opts: Opt[] }[], fits: (u: Set<string>) => boolean, max: number) {
  let rest = probs;
  let total = 0;
  const out: string[] = [];
  for (let t = 1; t <= max && rest.length; t++) {
    const b = best(rest, fits);
    if (b.n <= 0) break;
    total += b.n;
    rest = rest.filter((p) => !b.ids.includes(p.id));
    out.push(`${t} 個目で +${b.n} (累計 ${total}/${probs.length})`);
  }
  console.log(`[テンプレートを複数にした場合の貪欲な収まり] ${label}: ${out.join(' / ')}`);
}
greedy('やさしい (4 スロット)', easy, (u) => u.size <= 4, 4);
greedy('むずかしい (短信型 4 + IR 型 4)', hard, (u) => [...u].filter(isIr).length <= 4 && [...u].filter((c) => !isIr(c)).length <= 4, 4);
