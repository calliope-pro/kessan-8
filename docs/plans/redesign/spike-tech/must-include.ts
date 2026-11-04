// 試作 (製品のコードではない)。Sub-task #134 (Task #115 包括レビュー 4 回目の N1)。
// 「固定の型 (短信型・IR 型 各 数字 4 + 文 3)・芯の規則」に、特定の異変の種類を必ず入れたとき、収まる問題数と見え方の数が最大いくつか。
// cards.ts と同じ道具 (verifyProblem の違反の paths) で、primaryRules に絞った違反のセルを使う。会社の設定と比べる規則 (H-19) は除く。
// --with-ledger: 今の問題で使っていない台帳の種類 (H-04・07・08・10・11・12・14・18・20) を、検証器の規則から読んだセルで足す (検証器にはかけていない)。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-tech/must-include.ts [--with-ledger]
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
function screenOf(p: any, full: string) { const [doc, ...rest] = full.split('.'); return rest[0] === 'header' ? null : doc; }
const COMPANY_RULES = new Set(['header-company-name', 'header-securities-code', 'segment-names', 'seg-count']);
const numeric = new Map<string, boolean>();
function norm(p: any, cells: string[]) {
  const rank = new Map<string, number>();
  return cells.map((c) => {
    const nc = c.split('.').map((seg) => (/^\d+$/.test(seg) ? `*${rank.has(seg) ? rank.get(seg) : (rank.set(seg, rank.size), rank.size - 1)}` : seg)).join('.');
    const [doc, ...rest] = c.split('.');
    numeric.set(nc, typeof rest.reduce((n: any, k) => (n == null ? n : n[k]), p[doc]) === 'number');
    return nc;
  });
}
interface Opt { cells: string[]; rule: string }
interface Prob { id: string; kind: string; opts: Opt[] }
const hard: Prob[] = [];
for (const f of readdirSync(resolve(root, 'src/data/problems/hard')).sort()) {
  const p = read(`src/data/problems/hard/${f}`);
  if (!p.anomaly) continue;
  const res = verifyProblem(p, comp(p.companyId));
  const prim = new Set<string>(kindOf(p.anomaly.kind).primaryRules);
  const vs = [...res.hard, ...res.soft].filter((v: any) => prim.has(v.rule));
  const opts = vs.filter((v: any) => !COMPANY_RULES.has(v.rule)).map((v: any) => {
    const cells = [...new Set<string>(v.paths)].filter((c) => screenOf(p, c) !== null);
    return { rule: v.rule, cells: norm(p, cells) };
  }).filter((o: any) => o.cells.length);
  if (opts.length) hard.push({ id: p.id, kind: p.anomaly.kind, opts });
}

const T='tanshin.', I='ir.';
const syn: Record<string,[string,string[],string[]][]> = {
 'H-04': [['link-cf-cash-end',[T+'cashFlow.cashEnding',T+'balanceSheet.current.cash'],[]]],
 'H-07': [['link-cf-income-taxes',[T+'cashFlow.incomeTaxesPaid',T+'incomeStatement.current.incomeTaxes',T+'balanceSheet.current.incomeTaxesPayable',T+'balanceSheet.previous.incomeTaxesPayable'],[]]],
 'H-08': [['link-cf-short-debt',[T+'cashFlow.shortTermDebtChange',T+'balanceSheet.current.shortTermDebt',T+'balanceSheet.previous.shortTermDebt'],[]]],
 'H-10': [['link-capital-unchanged',[T+'balanceSheet.current.capitalStock',T+'balanceSheet.previous.capitalStock'],[]]],
 'H-11': [['ratio-roe',[T+'summary.roe',T+'incomeStatement.current.netIncomeParent',T+'balanceSheet.current.totalNetAssets',T+'balanceSheet.current.nonControllingInterests',T+'balanceSheet.previous.totalNetAssets',T+'balanceSheet.previous.nonControllingInterests'],[]]],
 'H-12': [['sum-equity',[T+'summary.equity',T+'balanceSheet.current.totalNetAssets',T+'balanceSheet.current.nonControllingInterests'],[]]],
 'H-14': [['xdoc-results-net-sales',[T+'incomeStatement.previous.netSales',I+'results.netSales.previous'],[]]],
 'H-18': [['xdoc-hl-dividend',[T+'summary.annualDividend',I+'highlights.annualDividend'],[]]],
 'H-20': [['ir-supp-net-debt',[I+'supplement.netDebt.current',I+'supplement.interestBearingDebt.current',I+'supplement.cash.current'],[]]],
};
if (process.argv.includes('--with-ledger')) for (const [k,v] of Object.entries(syn)) { const opts = v.map(([rule,cells])=>{cells.forEach(c=>numeric.set(c,true));return {rule,cells}}); hard.push({id:'syn-'+k,kind:k,opts}); }
const isIr = (c: string) => c.startsWith('ir.');
const fits = (u: Set<string>) => ['tanshin', 'ir'].every((d) => { const cs = [...u].filter((c) => (d === 'ir') === isIr(c)); return cs.filter((c) => numeric.get(c)).length <= 4 && cs.filter((c) => !numeric.get(c)).length <= 3; });
// required の種類を必ず入れて、見え方 (規則 + セル) の数が最大の組を探す。見え方が同じなら問題数が多い組。
function best(required: string[]) {
  let top: any = { score: -1 };
  const go = (i: number, u: Set<string>, picks: any[]) => {
    if (i === hard.length) {
      if (!required.every((r) => picks.some((x) => x.kind === r))) return;
      const types = new Set(picks.map((x) => `${x.rule}|${[...x.cells].sort().join(',')}`));
      const score = types.size * 100 + picks.length;
      if (score > top.score) top = { score, n: picks.length, types: types.size, picks: picks.map((x) => x.kind) };
      return;
    }
    const pr = hard[i];
    for (const o of pr.opts) { const nu = new Set([...u, ...o.cells]); if (fits(nu)) go(i + 1, nu, [...picks, { kind: pr.kind, rule: o.rule, cells: o.cells }]); }
    if (!required.includes(pr.kind)) go(i + 1, u, picks);
  };
  go(0, new Set(), []);
  return top;
}
const show = (label: string, t: any) => console.log(label.padEnd(18), t.score < 0 ? '収まらない' : `${t.n} 問・見え方 ${t.types}  ${t.picks.join(' ')}`);
show('制約なし', best([]));
const real = hard.filter((h) => !h.id.startsWith('syn-')).map((h) => h.kind);
for (const k of real) show('必ず ' + k, best([k]));
for (const pair of [['H-03','H-05'],['H-03','H-06'],['H-05','H-06'],['H-03','H-23'],['H-05','H-23'],['H-06','H-23'],['H-01','H-03']]) show('必ず ' + pair.join('+'), best(pair));
if (process.argv.includes('--with-ledger')) for (const k of Object.keys(syn)) show('台帳 ' + k, best([k]));
