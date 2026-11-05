// 設計 v2 §2.8: むずかしいの種類の作り方を、今の正常な問題 16 問すべてに注入し、検査 4 (その形のカードに収まる hard の違反が、すべて種類の primaryRules に入る) を数える。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/inject-hard.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { verifyProblem } = await import(pathToFileURL(resolve(root, 'src/verifier/index.ts')).href);
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const companies = read('src/data/companies.json');
const kinds = read('src/data/anomaly-kinds.json');
const norm = (c: string) => (c.startsWith('ir.statements.') ? c : c.split('.').map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.'));
const T = (s: string) => `tanshin.${s}`, I = (s: string) => `ir.${s}`;
const FRAME = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode'), I('header.periodLabel'), I('header.companyName'), I('header.securitiesCode')];
// 形ごとに載るセル (§1.4)。名前の並びの欄の reads は名前のセルだけで、入れ物 (ir.segments.items) を含まない
const SHOWN: Record<string, string[]> = {
  H1: [T('incomeStatement.previous.netSales'), T('incomeStatement.current.netSales'), T('balanceSheet.current.totalAssets'), T('balanceSheet.current.totalLiabilitiesAndNetAssets'), I('highlights.netSales.amount'), '@stmt'],
  H2: [T('balanceSheet.previous.receivables'), T('balanceSheet.current.receivables'), T('cashFlow.receivablesChange'), T('cashFlow.operatingCashFlow'), T('summary.accountingPolicyChange'), T('notes.accountingPolicyNote'), '@stmt'],
  H3: [T('cashFlow.incomeBeforeTax'), T('incomeStatement.current.incomeBeforeTax'), T('balanceSheet.current.cash'), T('cashFlow.cashEnding'), T('notes.cashScope'), T('summary.auditNote'), T('notes.subsequentEvents'), T('notes.segments.current.segments.*.name'), I('supplement.cash.current'), I('supplement.cash.previous'), I('supplement.interestBearingDebt.previous'), I('supplement.netDebt.previous'), I('outlook.subsequentEvent'), I('segments.items.*.name')],
};
// 文の欄の reads は、型が使った 1 つの文の ir.statements.<N> だけ (設計 v2 §1.2 R-D5)。添字は基ごとに、その metric の主張を持つ最初の文
const stmtIndex = (q: any, metric: string) => q.ir.statements.findIndex((x: any) => x.claims.some((c: any) => c.metric === metric));
// 検査 5 の最小の表示モデル: 載るセルを文字列にして、基と注入後で 1 つでも違えば「表示が変わる」。金額 = 整数 (カンマ区切り)、IR (億円) = 小数第 1 位、文 = そのまま
const show = (q: any, cell: string): string => { const [doc, ...rest] = cell.split('.'); const v = gv(q[doc as 'tanshin' | 'ir'], rest.join('.')); if (typeof v === 'number') return doc === 'ir' && !Number.isInteger(v * 10) ? String(v) : (doc === 'ir' ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')); return String(v); };
const displayChanged = (b: any, q: any, shape: string): boolean => {
  const cells = SHOWN[shape]!.filter((x) => x !== '@stmt' && !x.includes('*'));
  const segNames = (p: any) => p.tanshin.notes.segments.current.segments.map((x: any) => x.name).join('|') + '/' + p.ir.segments.items.map((x: any) => x.name).join('|');
  if (cells.some((c) => show(b, c) !== show(q, c))) return true;
  if (shape === 'H3' && segNames(b) !== segNames(q)) return true;
  // 文の欄は、型が使った 1 つの文 (H1 = netSales、H2 = operatingCashFlow の主張を持つ最初の文) の claims だけを見せる
  const m = shape === 'H1' ? 'netSales' : 'operatingCashFlow';
  const claim = (p: any) => JSON.stringify(p.ir.statements[stmtIndex(p, m)]?.claims);
  return (shape === 'H1' || shape === 'H2') && claim(b) !== claim(q);
};
const gv = (o: any, path: string) => path.split('.').reduce((a: any, k) => a[k], o);
const sv = (o: any, path: string, v: unknown) => { const ks = path.split('.'); ks.slice(0, -1).reduce((a: any, k) => a[k], o)[ks.at(-1)!] = v; };
const mul = (doc: 'tanshin' | 'ir', path: string, m: number) => (q: any) => { const v = gv(q[doc], path); sv(q[doc], path, Math.round(v * m * 10) / 10); };
const RECIPES: { kind: string; shape: string; label: string; make: (q: any) => void }[] = [
  { kind: 'H-03', shape: 'H3', label: '再計算しない (cashFlow.incomeBeforeTax だけ。税引前利益 → 当期純利益の値)', make: (q) => sv(q.tanshin, 'cashFlow.incomeBeforeTax', q.tanshin.incomeStatement.current.netIncome) },
  { kind: 'H-03', shape: 'H3', label: '(旧) 期末残高まで再計算する', make: (q) => { const c = q.tanshin.cashFlow; const d = q.tanshin.incomeStatement.current.netIncome - c.incomeBeforeTax; c.incomeBeforeTax += d; c.subtotal += d; c.operatingCashFlow += d; c.netChangeInCash += d; c.cashEnding += d; } },
  { kind: 'H-04', shape: 'H3', label: 'cashFlow.cashEnding を 5% ずらす', make: mul('tanshin', 'cashFlow.cashEnding', 1.05) },
  { kind: 'H-13', shape: 'H1', label: 'IR の売上高を 5% ずらす', make: mul('ir', 'highlights.netSales.amount', 1.05) },
  { kind: 'H-13', shape: 'H3', label: 'IR の現金 (当期) を 5% ずらす', make: mul('ir', 'supplement.cash.current', 1.05) },
  { kind: 'H-17', shape: 'H1', label: 'IR の売上高を 10 倍', make: mul('ir', 'highlights.netSales.amount', 10) },
  { kind: 'H-20', shape: 'H3', label: 'IR の純有利子負債 (前期) を 20% ずらす', make: mul('ir', 'supplement.netDebt.previous', 1.2) },
  { kind: 'H-19', shape: 'H3', label: 'IR のセグメントを 1 つ消す', make: (q) => { q.ir.segments.items.pop(); } },
  { kind: 'H-21', shape: 'H1', label: '売上高の主張の向きを逆にする', make: (q) => { for (const s of q.ir.statements) for (const c of s.claims) if (c.metric === 'netSales') c.direction = c.direction === 'up' ? 'down' : 'up'; } },
  { kind: 'H-21', shape: 'H2', label: '営業 CF の主張の向きを逆にする', make: (q) => { for (const s of q.ir.statements) for (const c of s.claims) if (c.metric === 'operatingCashFlow') c.direction = c.direction === 'up' ? 'down' : 'up'; } },
  { kind: 'H-21', shape: 'H1', label: '(同じ metric の主張を 2 つ持たせ、カードに出ない 2 つ目だけを逆にする。reads が 1 つの文なら弾かれる)', make: (q) => { const i = stmtIndex(q, 'netSales'); q.ir.statements.push({ slide: 'results', text: '売上高は前期比増加。', claims: [{ metric: 'netSales', direction: 'up' }] }); void i; q.ir.statements[q.ir.statements.length - 1].claims[0].direction = 'down'; } },
  { kind: 'H-22', shape: 'H3', label: '監査の注意書きを「監査済みです」に', make: (q) => sv(q.tanshin, 'summary.auditNote', '決算短信は監査済みです') },
  { kind: 'H-23', shape: 'H2', label: '会計方針の変更の有無を反転', make: (q) => sv(q.tanshin, 'summary.accountingPolicyChange', !q.tanshin.summary.accountingPolicyChange) },
  { kind: 'H-24', shape: 'H3', label: 'IR に期末後の出来事を書く', make: (q) => sv(q.ir, 'outlook.subsequentEvent', '期末後に子会社の売却を決定した (売却益は約 10 億円)') },
  { kind: 'H-05', shape: 'H2', label: 'cashFlow.receivablesChange の符号を逆に (再計算なし)', make: (q) => sv(q.tanshin, 'cashFlow.receivablesChange', -q.tanshin.cashFlow.receivablesChange) },
  { kind: 'H-05', shape: 'H2', label: 'cashFlow.receivablesChange の符号を逆に + 小計以降を再計算 (anomalies.md のとおり)', make: (q) => { const c = q.tanshin.cashFlow; const d = -2 * c.receivablesChange; c.receivablesChange += d; c.subtotal += d; c.operatingCashFlow += d; c.netChangeInCash += d; c.cashEnding += d; } },
  { kind: 'H-05', shape: 'H2', label: 'cashFlow.receivablesChange を 20% ずらし + 小計以降を再計算 (営業 CF がマイナスの基向け)', make: (q) => { const c = q.tanshin.cashFlow; const d = Math.round(c.receivablesChange * 0.2) || 1; c.receivablesChange += d; c.subtotal += d; c.operatingCashFlow += d; c.netChangeInCash += d; c.cashEnding += d; } },
  { kind: 'H-01', shape: 'H1', label: '買掛金を +10% ずらし、負債・純資産の合計を再計算 (総資産は元のまま)', make: (q) => { const b = q.tanshin.balanceSheet.current; const d = Math.round(b.payables * 0.1); b.payables += d; b.totalCurrentLiabilities += d; b.totalLiabilities += d; b.totalLiabilitiesAndNetAssets += d; } },
];
// H1・H2 の IR 型の文は claims から型で作る (設計 v2 §1.2 R-D5)。text は使わない
const sentence = (q: any, metric: 'netSales' | 'operatingCashFlow'): string | null => {
  const c = q.ir.statements.flatMap((x: any) => x.claims).find((x: any) => x.metric === metric);
  if (!c) return null;
  return metric === 'netSales' ? (c.direction === 'up' ? '売上高は前期より増えた' : '売上高は前期より減った') : c.direction === 'up' ? '営業活動によるキャッシュ・フローはプラス' : '営業活動によるキャッシュ・フローはマイナス';
};
const bases = readdirSync(resolve(root, 'src/data/problems/hard')).sort().map((f) => read(`src/data/problems/hard/${f}`)).filter((p) => !p.anomaly);
console.log(`基: むずかしいの正常な問題 ${bases.length} 問`);
for (const r of RECIPES) {
  const primary: string[] = kinds.find((k: any) => k.id === r.kind).primaryRules;
  let doubled = 0, noPrimary = 0, same = 0; const extras = new Set<string>();
  for (const b of bases) {
    const q = JSON.parse(JSON.stringify(b)); r.make(q);
    const vs = verifyProblem(q, companies.find((c: any) => c.id === b.companyId)).hard;
    const sel = (m: string) => `ir.statements.${stmtIndex(b, m)}`;
    if (!displayChanged(b, q, r.shape)) same++;
    const shown = new Set([...SHOWN[r.shape]!.filter((x) => x !== '@stmt'), ...FRAME, ...(r.shape === 'H1' ? [sel('netSales')] : r.shape === 'H2' ? [sel('operatingCashFlow')] : [])]);
    const onCard = vs.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x))));
    const extra = [...new Set<string>(onCard.map((v: any) => v.rule))].filter((x) => !primary.includes(x));
    if (extra.length) { doubled++; extra.forEach((x) => extras.add(x)); }
    if (!onCard.some((v: any) => primary.includes(v.rule))) noPrimary++;
  }
  let changed = 0;
  if (r.kind === 'H-21') for (const b of bases) { const q = JSON.parse(JSON.stringify(b)); r.make(q); const m = r.shape === 'H2' ? 'operatingCashFlow' : 'netSales'; if (sentence(q, m) !== sentence(b, m)) changed++; }
  const sentenceNote = r.kind === 'H-21' ? ` (カードの文が変わる ${changed}/${bases.length}。カードの文は選んだ 1 つの文の claims から型で作る。変わらず「主な規則が無い」なら、検査 3 で弾かれる)` : '';
  console.log(`${r.kind} [${r.shape}] ${r.label}: 二重の食い違い ${doubled}/${bases.length}${extras.size ? ` (${[...extras].join(', ')})` : ''}・カードに収まる主な規則が無い ${noPrimary}/${bases.length}・表示が変わらない ${same}/${bases.length}${sentenceNote}`);
}
