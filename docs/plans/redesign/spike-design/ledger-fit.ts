// 設計 v2 §2: 今の異変の問題 (やさしい 13・むずかしい 16) が、§1 の形のどれで V2 を満たして見えるか (places の書き直しを前提)。製品のコードではない。
// V2 = 種類の主な規則 (primaryRules) が落とした違反の 1 つについて、その paths (読んだセル) が全部、形のカードに載るセル (または別名) に含まれる。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/ledger-fit.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const kinds = read('src/data/anomaly-kinds.json');
const norm = (c: string) => c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.');
const T = (s: string) => `tanshin.${s}`;
const I = (s: string) => `ir.${s}`;
const IS = 'incomeStatement', BS = 'balanceSheet', CF = 'cashFlow';
// 形ごとに載るセル (§1.3・§1.4)。別名 (V2): ir.results.netSales.* = tanshin.incomeStatement.*.netSales (E2 の棒)。claims-direction が積む ir.statements.N は見出し語・文のセル。header.* は枠 (全形)
const FRAME_E = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode')]; // やさしいのカードの枠は短信側だけ
const FRAME_H = [...FRAME_E, I('header.periodLabel'), I('header.companyName'), I('header.securitiesCode')]; // むずかしいは短信型・IR 型の両方に枠がある
const SHAPES: Record<string, string[]> = {
  E1: [T(`${IS}.current.netSales`), T(`${IS}.previous.operatingIncome`), T(`${IS}.current.operatingIncome`), T('summary.operatingMargin'), 'ir.statements.*'],
  E2: [T(`${IS}.previous.netSales`), T(`${IS}.current.netSales`), I('results.chart.netSales.axisMin'), I('results.chart.netSales.previous'), I('results.chart.netSales.current'), I('results.netSales.previous'), I('results.netSales.current'), 'ir.statements.*'],
  E3: [T(`${BS}.current.totalCurrentAssets`), T(`${BS}.current.totalFixedAssets`), T(`${BS}.current.totalAssets`)],
  H1: [T(`${IS}.previous.netSales`), T(`${IS}.current.netSales`), T(`${BS}.current.totalAssets`), T(`${BS}.current.totalLiabilitiesAndNetAssets`), I('highlights.netSales.amount'), 'ir.statements.*'],
  H2: [T(`${BS}.previous.receivables`), T(`${BS}.current.receivables`), T(`${CF}.receivablesChange`), T(`${CF}.operatingCashFlow`), T('summary.accountingPolicyChange'), T('notes.accountingPolicyNote'), 'ir.statements.*'],
  H3: [T(`${CF}.incomeBeforeTax`), T(`${IS}.current.incomeBeforeTax`), T(`${BS}.current.cash`), T(`${CF}.cashEnding`), T('summary.auditNote'), T('notes.subsequentEvents'), T('notes.segments.current.segments.*.name'), I('supplement.cash.current'), I('supplement.cash.previous'), I('supplement.interestBearingDebt.previous'), I('supplement.netDebt.previous'), I('outlook.subsequentEvent'), I('segments.items.*.name')],
};
// セルの無い規則 (科目名・名前の並び・表記) は、種類から形を直接決める
// H-28 = 売上債権の itemKey (receivables) の欄がある形 (H2 だけ)。E-03・E-05 は今の異変の問題に無いので載せない (itemKey が一致する形でだけ見える。§1.5 V1)
const BY_KIND: Record<string, string[]> = { 'H-28': ['H2'], 'E-08': [] } // E-08 (短信と IR の社名・コード) はやさしいのカードに IR の枠が無いので載らない;
const rows: { id: string; kind: string; shapes: string[] }[] = [];
for (const d of ['easy', 'hard']) for (const f of readdirSync(resolve(root, `src/data/problems/${d}`)).sort()) {
  const p = read(`src/data/problems/${d}/${f}`);
  if (!p.anomaly) continue;
  const kind = kinds.find((k: any) => k.id === p.anomaly.kind);
  const co = companies.find((c: any) => c.id === p.companyId);
  const res = verifyProblem(p, co);
  const vs = [...res.hard, ...res.soft].filter((v: any) => kind.primaryRules.includes(v.rule));
  const ok = new Set<string>(BY_KIND[p.anomaly.kind] ?? []);
  // H-19: 新しい規則 xdoc-seg-names (短信の報告セグメントの名前の並びと IR の並びを直接比べる) を、ここで直接当てる。名前の並びは H3 の文欄に載る
  if (p.anomaly.kind === 'H-19') {
    const a = p.tanshin.notes.segments.current.segments.map((x: any) => x.name).join('|');
    const b = p.ir.segments.items.map((x: any) => x.name).join('|');
    if (a !== b) ok.add('H3');
  }
  for (const [sid, shown] of Object.entries(SHAPES)) {
    if (sid[0] !== (d === 'easy' ? 'E' : 'H')) continue;
    const set = new Set([...shown, ...(sid[0] === 'E' ? FRAME_E : FRAME_H)]);
    if (vs.some((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((c) => set.has(norm(c))))) ok.add(sid);
  }
  rows.push({ id: p.id, kind: p.anomaly.kind, shapes: [...ok].sort() });
}
rows.forEach((r) => console.log(r.id, r.kind, kinds.find((k: any) => k.id === r.kind).name.slice(0, 22), '→', r.shapes.join(',') || 'なし'));
for (const d of ['E', 'H']) {
  const rs = rows.filter((r) => r.kind[0] === d);
  console.log(`${d === 'E' ? 'やさしい' : 'むずかしい'}: 異変の問題 ${rs.length} 問のうち、いずれかの形で V2 を満たす ${rs.filter((r) => r.shapes.length).length} 問 / 種類 ${new Set(rs.filter((r) => r.shapes.length).map((r) => r.kind)).size}`);
}
