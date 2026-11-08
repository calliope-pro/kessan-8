// 設計 v3 §3.3: やさしいの 1 つの形 (もうけ = 見出し語 + 数字 4 欄。§1.2) の上で、
//  (1) 正常な問題 12 問が、形の上で食い違わないこと (正しく読んだ人が不正解にならない)。営業利益率の丸め・見出し語の向き・符号・桁区切りの有無を数える
//  (2) 数字・文を変える種類 (E-17・E-12・E-02・E-24) を正常 12 問すべてに注入し、二重の食い違い・主な規則が無い・表示が変わらないを数える
//  (3) 表示だけを変える種類 (E-03・E-21・E-25・E-04・E-05・E-19・E-22・E-23) が、正常 12 問の何問・どの欄に当てられるかを数える (閏日・桁区切り)
// 製品のコードではない。使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/v3-inject-easy.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const norm = (c: string) => (c.startsWith('ir.statements.') ? c : c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.'));
const T = (s: string) => `tanshin.${s}`;
const IS = 'incomeStatement';
// 形に載るセル (設計 v3 §1.2)。枠 (表題) = 社名・期・期末日。見出し語 = 営業利益の主張 (ir.statements.<N>)
const SHOWN = [T(`${IS}.current.netSales`), T(`${IS}.previous.operatingIncome`), T(`${IS}.current.operatingIncome`), T('summary.operatingMargin')];
const FRAME = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode'), T('columnDates.incomeStatement.current')];
const gv = (p: any, path: string) => path.split('.').reduce((o: any, k) => o[k], p.tanshin);
const sv = (p: any, path: string, v: number) => { const ks = path.split('.'); ks.slice(0, -1).reduce((o: any, k) => o[k], p.tanshin)[ks.at(-1)!] = v; };
const stmtIndex = (q: any, metric: string) => q.ir.statements.findIndex((x: any) => x.claims.some((c: any) => c.metric === metric));
const clone = (p: any) => JSON.parse(JSON.stringify(p));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const show = (p: any, c: string): string => { const v = gv(p, c.replace(/^tanshin\./, '')); return c.includes('Margin') ? v.toFixed(1) : fmt(v); };
const headline = (p: any) => JSON.stringify(p.ir.statements[stmtIndex(p, 'operatingIncome')].claims.filter((c: any) => c.metric === 'operatingIncome'));
const displayChanged = (b: any, q: any) => JSON.stringify(b.labelOverrides ?? {}) !== JSON.stringify(q.labelOverrides ?? {}) || SHOWN.some((c) => show(b, c) !== show(q, c)) || headline(b) !== headline(q);
const bases = readdirSync(resolve(root, 'src/data/problems/easy')).sort().map((f) => read(`src/data/problems/easy/${f}`)).filter((p) => !p.anomaly);
const co = (p: any) => companies.find((c: any) => c.id === p.companyId);
console.log(`基: やさしいの正常な問題 ${bases.length} 問`);

// (1) 正常な問題が形の上で食い違わない (カードはやさしいもむずかしいも同じなので、正常 28 問 = やさしい 12 + むずかしい 16 のそれぞれで測る)
for (const dir of ['easy', 'hard']) {
  const ps = readdirSync(resolve(root, `src/data/problems/${dir}`)).sort().map((f) => read(`src/data/problems/${dir}/${f}`)).filter((p) => !p.anomaly);
  let violations = 0, maxGap = 0, minChange = Infinity, minRatio = Infinity, maxRatio = 0, minShare = Infinity, negatives = 0, ocfNeg = 0, periodBad = 0;
  const down: string[] = [];
  for (const p of ps) {
    const shownAll = new Set([...SHOWN, ...FRAME, `ir.statements.${stmtIndex(p, 'operatingIncome')}`]);
    const vs = verifyProblem(p, co(p)).hard.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x: string) => shownAll.has(norm(x))));
    violations += vs.length;
    const s1 = gv(p, `${IS}.current.netSales`), o0 = gv(p, `${IS}.previous.operatingIncome`), o1 = gv(p, `${IS}.current.operatingIncome`), m = gv(p, 'summary.operatingMargin');
    maxGap = Math.max(maxGap, Math.abs(m - (o1 / s1) * 100));
    if (o1 < o0) down.push(`${p.id}(${p.companyId})`);
    minChange = Math.min(minChange, Math.abs(o1 - o0) / o0);
    minRatio = Math.min(minRatio, o1 / o0); maxRatio = Math.max(maxRatio, o1 / o0); minShare = Math.min(minShare, s1 > o1 ? s1 / o1 : -1);
    if ([s1, o0, o1, m].some((v) => v < 0)) negatives++;
    if (gv(p, 'cashFlow.operatingCashFlow') < 0) ocfNeg++;
    // 期末日が期の末日と合う (期 = 「2024年3月期」→ 2024-03-31)
    const mm = /^(\d{4})年(\d{1,2})月期$/.exec(gv(p, 'header.periodLabel'));
    const end = String(gv(p, 'columnDates.incomeStatement.current'));
    if (!mm || end !== new Date(Date.UTC(Number(mm[1]), Number(mm[2]), 0)).toISOString().slice(0, 10)) periodBad++;
  }
  console.log(`(1) ${dir} 正常 ${ps.length} 問: 形に載るセルだけで落ちる hard の違反 ${violations} 件 / 営業利益率と (③ ÷ ① × 100) の差の最大 ${maxGap.toFixed(3)} ポイント / ③ ÷ ② の範囲 ${minRatio.toFixed(2)}〜${maxRatio.toFixed(2)} / 前期比の変化の最小 ${(minChange * 100).toFixed(1)}% / ① ÷ ③ の最小 ${minShare.toFixed(1)} (負なら ① ≦ ③ の問題あり) / 負の数を持つ問題 ${negatives} / 期末日が期の末日と合わない ${periodBad} / 減益 ${down.length} 問: ${down.join(' ')} / 営業 CF がマイナス ${ocfNeg} 問`);
}

// (2) 数字・文を変える種類の注入
type Recipe = { kind: string; label: string; primary: string[]; make: (q: any) => any | null; min?: (b: any, q: any) => string };
// 科目名の規則 (label-spelling) の違反の paths は項目キー。形にその項目キーの欄があれば形に載る
const SHOWN_KEYS = [T('incomeStatement.netSales'), T('incomeStatement.operatingIncome'), T('summary.operatingMargin')];
const flip = (q: any) => { for (const s of q.ir.statements) for (const c of s.claims) if (c.metric === 'operatingIncome') c.direction = c.direction === 'up' ? 'down' : 'up'; return q; };
const RECIPES: Recipe[] = [
  { kind: 'E-17', label: '営業利益の主張の向きを逆にする (見出し語が数字と逆)', primary: ['claims-direction'], make: (b) => flip(clone(b)) },
  { kind: 'E-12', label: '営業利益率を 2.2 倍にする (道具なしで気づける 2 倍以上)', primary: ['ratio-operating-margin'], make: (b) => { const q = clone(b); sv(q, 'summary.operatingMargin', Math.round(gv(b, 'summary.operatingMargin') * 2.2 * 10) / 10); return q; } },
  { kind: 'E-02', label: '当期の営業利益を 10 倍 (増益) か 1/10 (減益) にする。再計算しない', primary: ['ratio-operating-margin'], make: (b) => { const q = clone(b); const k = `${IS}.current.operatingIncome`; const up = gv(b, k) > gv(b, `${IS}.previous.operatingIncome`); sv(q, k, up ? gv(b, k) * 10 : Math.round(gv(b, k) / 10)); return q; } },
  { kind: 'E-05', label: '営業利益の科目名を「営業和益」にする (labelOverrides。営業利益は 2 欄に出る)', primary: ['label-spelling'], make: (b) => { const q = clone(b); q.labelOverrides = { ...(q.labelOverrides ?? {}), [T('incomeStatement.operatingIncome')]: '営業和益' }; return q; } },
  { kind: 'E-24', label: '当期の売上高を、営業利益の 0.6 倍にする (売上高が営業利益より小さい)。再計算しない', primary: ['ratio-operating-margin'], make: (b) => { const q = clone(b); sv(q, `${IS}.current.netSales`, Math.round(gv(b, `${IS}.current.operatingIncome`) * 0.6)); return q; } },
];
for (const r of RECIPES) {
  let applied = 0, skipped = 0, doubled = 0, noPrimary = 0, same = 0; const extras = new Set<string>();
  for (const b of bases) {
    const q = r.make(b);
    if (q === null) { skipped++; continue; }
    applied++;
    if (!displayChanged(b, q)) same++;
    const shown = new Set([...SHOWN, ...SHOWN_KEYS, ...FRAME, `ir.statements.${stmtIndex(b, 'operatingIncome')}`]);
    const onCard = verifyProblem(q, co(b)).hard.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x: string) => shown.has(norm(x))));
    const extra = [...new Set<string>(onCard.map((v: any) => v.rule))].filter((x) => !r.primary.includes(x));
    if (extra.length) { doubled++; extra.forEach((x) => extras.add(x)); }
    if (!onCard.some((v: any) => r.primary.includes(v.rule))) noPrimary++;
  }
  console.log(`(2) ${r.kind} ${r.label}: 適用 ${applied}・適用できない ${skipped} / 二重の食い違い ${doubled}${extras.size ? ` (${[...extras].join(', ')})` : ''} / 形に載る主な規則が無い ${noPrimary} / 表示が変わらない ${same}`);
}

// (3) 表示だけを変える種類の当てられる数
{
  const FIELDS: [string, string][] = [['① 売上高', `${IS}.current.netSales`], ['② 営業利益 (前期)', `${IS}.previous.operatingIncome`], ['③ 営業利益 (当期)', `${IS}.current.operatingIncome`]];
  for (const [name, path] of FIELDS) {
    const n4 = bases.filter((p) => Math.abs(gv(p, path)) >= 1000).length, n5 = bases.filter((p) => Math.abs(gv(p, path)) >= 10000).length;
    console.log(`(3) E-21 カンマの位置 ${name}: 整数部 4 桁以上 (no-comma を当てられる) ${n4}/${bases.length}・5 桁以上 (comma-shift を当てられる) ${n5}/${bases.length}`);
  }
  console.log('(3) E-25 あり得ない符号 (① 売上高に △): 売上高が正の正常な問題 ' + bases.filter((p) => gv(p, `${IS}.current.netSales`) > 0).length + `/${bases.length}`);
  // E-04: 期末日の年をずらす。2 月 29 日を 1 年ずらすと存在しない日付 (2025-02-29) になるので、ずらした年のその月の末日にする
  const ends = bases.map((p) => String(gv(p, 'columnDates.incomeStatement.current')));
  const feb29 = ends.filter((d) => d.endsWith('-02-29')).length;
  const naive = (d: string) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y! + 1, m! - 1, dd!)); return t.getUTCMonth() !== m! - 1 ? '存在しない日付' : 'ok'; };
  console.log(`(3) E-04 期末日: 当期の期末日が 2 月 29 日の正常な問題 ${feb29}/${bases.length} (1 年そのままずらすと存在しない日付になる: ${ends.filter((d) => naive(d) !== 'ok').length} 問)。月末日にそろえる直しで ${ends.length} 問すべてに当てられる`);
  console.log('(3) 決算月の内訳 (期末日の月): ' + JSON.stringify(ends.reduce((a: Record<string, number>, d) => ((a[d.slice(5, 7)] = (a[d.slice(5, 7)] ?? 0) + 1), a), {})));
}

// (4) E-02 が作る ③ ÷ ② の比が、正常の範囲 [0.5, 2] (設計 v3 §1.2 の関係 3) の外にあること。増益の問題 = 10 倍で 10 以上・減益の問題 = 1/10 で 0.1 以下 (導いた) を、正常 28 問で数える
{
  const rc = RECIPES.find((r) => r.kind === 'E-02')!;
  const rs: number[] = [];
  for (const dir of ['easy', 'hard']) for (const f of readdirSync(resolve(root, `src/data/problems/${dir}`)).sort()) {
    const p = read(`src/data/problems/${dir}/${f}`); if (p.anomaly) continue;
    const q = rc.make(p)!; rs.push(gv(q, `${IS}.current.operatingIncome`) / gv(q, `${IS}.previous.operatingIncome`));
  }
  const inRange = rs.filter((r) => r >= 0.5 && r <= 2).length;
  console.log(`(4) E-02 の作り方を正常 ${rs.length} 問に当てた ③ ÷ ② = 最小 ${Math.min(...rs).toFixed(2)}・最大 ${Math.max(...rs).toFixed(1)}。正常の範囲 [0.5, 2] に入る (= 異変にならない) もの ${inRange} 問。10 以上のもの ${rs.filter((r) => r >= 10).length} 問・0.1 以下のもの ${rs.filter((r) => r <= 0.1).length} 問`);
}

// (5) 責任者の決定 (問 3 = (b)) で足した種類の当てられる数: E-26 添え字 (opPrev・opCurr の 2 欄に必ず当てられる)・E-27 数字の字 (数字 1 字が 0・1・5・8 のどれかである金額の欄)・E-28 存在しない日付 (期末日の日を 32 にする。検証器が落ちず、期末日のセルを読む規則だけが落ちる)
{
  const FIELDS: [string, string][] = [['① 売上高', `${IS}.current.netSales`], ['② 営業利益 (前期)', `${IS}.previous.operatingIncome`], ['③ 営業利益 (当期)', `${IS}.current.operatingIncome`]];
  for (const [name, path] of FIELDS) {
    const n = bases.filter((p) => /[0158]/.test(fmt(Math.abs(gv(p, path))))).length;
    console.log(`(5) E-27 数字の字 ${name}: 0・1・5・8 のどれかを含む (当てられる) ${n}/${bases.length}`);
  }
  const bad = bases.filter((p) => { const q = clone(p); const d = String(gv(q, 'columnDates.incomeStatement.current')); q.tanshin.columnDates.incomeStatement.current = d.slice(0, 8) + '32'; try { verifyProblem(q, co(p)); return false; } catch { return true; } }).length;
  console.log(`(5) E-28 期末日の日を 32 にして検証器に通す: 例外 ${bad}/${bases.length} (0 なら検証器が落ちずに違反を返す)`);
}
