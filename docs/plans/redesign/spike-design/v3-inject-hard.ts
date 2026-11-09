// 設計 v3 §3.3: むずかしいの 1 つの形 (カード + 資料。§1.3) の上で、会計・資料間・注記の種類の作り方を、今の正常な問題 16 問すべてに注入する。
// 数えるもの: (a) 二重の食い違い = 形に載るセルだけで落ちる hard の違反が、種類の primaryRules の外にもある (遊び手に 2 つ目の手がかりが見える)
//             (b) 主な規則が無い = 形に載るセルだけで primaryRules の 1 つが落ちない (その異変は形の上で見えない)
//             (c) 表示が変わらない = 注入しても形の表示が基と同じ (正しく読んだ人が「異変あり」を正解にされる)
// 設計 v2 の inject-hard.ts は形 3 つ (H1〜H3) ごとに載るセルを分けていた。v3 は 1 つの形に載るセルの全部で数える (二重の食い違いが増えるかを見る)。製品のコードではない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/v3-inject-hard.ts
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
// 枠 (表題): 短信と IR の社名・証券コード・期。形の全社で同じ位置
const FRAME = [T('header.periodLabel'), T('header.companyName'), T('header.securitiesCode'), I('header.periodLabel'), I('header.companyName'), I('header.securitiesCode')];
// むずかしいの形に載るセル (設計 v3 §1.3 の表と同じ)。'@stmt:<metric>' は、その metric の主張を持つ ir.statements.<N> (見出し語・IR の文を claims から型で作る。設計 v2 R-D5)
const SHOWN: string[] = [
  // カード (やさしいと同じ)
  T('incomeStatement.current.netSales'), T('incomeStatement.previous.operatingIncome'), T('incomeStatement.current.operatingIncome'), T('summary.operatingMargin'), '@stmt:operatingIncome',
  // 資料 1: 決算短信のまとめ
  T('incomeStatement.current.incomeBeforeTax'),
  T('balanceSheet.current.cash'), T('balanceSheet.previous.receivables'), T('balanceSheet.current.receivables'), T('balanceSheet.current.totalAssets'), T('balanceSheet.current.totalLiabilitiesAndNetAssets'),
  T('cashFlow.incomeBeforeTax'), T('cashFlow.receivablesChange'), T('cashFlow.operatingCashFlow'), T('cashFlow.cashEnding'), T('notes.cashScope'),
  T('summary.auditNote'), T('summary.accountingPolicyChange'), T('notes.accountingPolicyNote'), T('notes.subsequentEvents'), T('notes.segments.current.segments.*.name'),
  // 資料 2: IR のひとこと
  I('highlights.netSales.amount'), I('supplement.cash.current'), I('supplement.cash.previous'), I('supplement.interestBearingDebt.previous'), I('supplement.netDebt.previous'),
  '@stmt:operatingCashFlow', I('outlook.subsequentEvent'), I('segments.items.*.name'),
];
const stmtIndex = (q: any, metric: string) => q.ir.statements.findIndex((x: any) => x.claims.some((c: any) => c.metric === metric));
const gv = (o: any, path: string) => path.split('.').reduce((a: any, k) => a[k], o);
const sv = (o: any, path: string, v: unknown) => { const ks = path.split('.'); ks.slice(0, -1).reduce((a: any, k) => a[k], o)[ks.at(-1)!] = v; };
// 表示モデル: 金額 = 整数 (カンマ区切り)、IR (億円) = 小数第 1 位、% = 小数第 1 位、文 = そのまま。基と注入後で 1 つでも違えば「表示が変わる」
const show = (q: any, cell: string): string => {
  const [doc, ...rest] = cell.split('.'); const v = gv(q[doc as 'tanshin' | 'ir'], rest.join('.'));
  if (typeof v !== 'number') return String(v);
  if (cell.includes('operatingMargin')) return v.toFixed(1);
  return doc === 'ir' ? (Math.abs(v) < 100000 && !Number.isInteger(v) ? v.toFixed(1) : String(v)) : Math.round(v).toLocaleString('en-US');
};
const claimOf = (q: any, m: string) => JSON.stringify(q.ir.statements[stmtIndex(q, m)]?.claims);
const segNames = (p: any) => p.tanshin.notes.segments.current.segments.map((x: any) => x.name).join('|') + '/' + p.ir.segments.items.map((x: any) => x.name).join('|');
const displayChanged = (b: any, q: any): boolean =>
  JSON.stringify(b.labelOverrides ?? {}) !== JSON.stringify(q.labelOverrides ?? {}) || b.ir.header.companyName !== q.ir.header.companyName ||
  SHOWN.filter((x) => !x.startsWith('@') && !x.includes('*')).some((c) => show(b, c) !== show(q, c)) ||
  segNames(b) !== segNames(q) || claimOf(b, 'operatingIncome') !== claimOf(q, 'operatingIncome') || claimOf(b, 'operatingCashFlow') !== claimOf(q, 'operatingCashFlow');
const mul = (doc: 'tanshin' | 'ir', path: string, m: number) => (q: any) => { const v = gv(q[doc], path); sv(q[doc], path, Math.round(v * m * 10) / 10); };
const flip = (metric: string) => (q: any) => { for (const s of q.ir.statements) for (const c of s.claims) if (c.metric === metric) c.direction = c.direction === 'up' ? 'down' : 'up'; };
// 科目名の規則 (label-spelling・account-section) の違反の paths は、セルでなく項目キー。形にその項目キーの欄があれば形に載る (設計 v2 §1.5 V2)
const SHOWN_KEYS = [T('balanceSheet.receivables'), T('cashFlow.operatingCashFlow'), T('cashFlow.receivablesChange'), T('incomeStatement.netSales'), T('incomeStatement.operatingIncome'), T('summary.operatingMargin')];
// card-relation の関係 3 つ (設計 v3 §1.2): r1 = ③ ÷ ② が [0.5, 2] の外・r2 = ③ = ②・r3 = ③ ≥ ①。むずかしいの種類はカードの数字を変えないので、どの注入でも 0 のはず (#174 包括レビュー B1)
const relBroken = (q: any): string[] => {
  const t = q.tanshin.incomeStatement, s1 = t.current.netSales, o0 = t.previous.operatingIncome, o1 = t.current.operatingIncome;
  const r: string[] = []; const ratio = o1 / o0;
  if (!(ratio >= 0.5 && ratio <= 2)) r.push('r1'); if (o1 === o0) r.push('r2'); if (!(o1 < s1)) r.push('r3');
  return r;
};
const RECIPES: { kind: string; label: string; make: (q: any) => void; primary?: string[] }[] = [
  { kind: 'H-01', label: '買掛金を +10% ずらし、負債・純資産の合計を再計算 (総資産は元のまま)', make: (q) => { const b = q.tanshin.balanceSheet.current; const d = Math.round(b.payables * 0.1); b.payables += d; b.totalCurrentLiabilities += d; b.totalLiabilities += d; b.totalLiabilitiesAndNetAssets += d; } },
  { kind: 'H-03', label: '再計算しない (cashFlow.incomeBeforeTax だけ。税引前利益 → 当期純利益の値)', make: (q) => sv(q.tanshin, 'cashFlow.incomeBeforeTax', q.tanshin.incomeStatement.current.netIncome) },
  { kind: 'H-04', label: 'cashFlow.cashEnding を 5% ずらす', make: mul('tanshin', 'cashFlow.cashEnding', 1.05) },
  { kind: 'H-05', label: '再計算しない (receivablesChange の符号だけを逆に)', make: (q) => sv(q.tanshin, 'cashFlow.receivablesChange', -q.tanshin.cashFlow.receivablesChange) },
  { kind: 'H-05', label: '再計算しない (receivablesChange を 20% ずらす)', make: (q) => { const c = q.tanshin.cashFlow; sv(q.tanshin, 'cashFlow.receivablesChange', c.receivablesChange + (Math.round(c.receivablesChange * 0.2) || 1)); } },
  { kind: 'H-05', label: '(旧 v2) 符号を逆に + 小計以降を再計算 = 期末残高まで動く', make: (q) => { const c = q.tanshin.cashFlow; const d = -2 * c.receivablesChange; c.receivablesChange += d; c.subtotal += d; c.operatingCashFlow += d; c.netChangeInCash += d; c.cashEnding += d; } },
  { kind: 'H-13', label: 'IR の売上高を 5% ずらす', make: mul('ir', 'highlights.netSales.amount', 1.05) },
  { kind: 'H-28', label: '売上債権の行の科目名を「買掛金」にする (labelOverrides)', make: (q) => { q.labelOverrides = { ...(q.labelOverrides ?? {}), [T('balanceSheet.receivables')]: '買掛金' }; } },
  { kind: 'H-30', label: '営業 CF の科目名を「営業活動によるキャッシュ・フロ」にする (誤字)', primary: ['label-spelling'], make: (q) => { q.labelOverrides = { ...(q.labelOverrides ?? {}), [T('cashFlow.operatingCashFlow')]: '営業活動によるキャッシュ・フロ' }; } },
  { kind: 'H-35', label: 'IR の表題の社名を、別の会社の名にする', primary: ['header-company-name'], make: (q) => { const other = companies.find((c: any) => c.id !== q.companyId); sv(q.ir, 'header.companyName', other.name); } },
  { kind: 'H-13', label: 'IR の現金 (当期) を 5% ずらす', make: mul('ir', 'supplement.cash.current', 1.05) },
  { kind: 'H-17', label: 'IR の売上高を 10 倍', make: mul('ir', 'highlights.netSales.amount', 10) },
  { kind: 'H-19', label: 'IR のセグメントを 1 つ消す (主な規則は新しい xdoc-seg-names。今の規則では測れない)', make: (q) => { q.ir.segments.items.pop(); } },
  { kind: 'H-20', label: 'IR の純有利子負債 (前期) を 20% ずらす', make: mul('ir', 'supplement.netDebt.previous', 1.2) },
  { kind: 'H-21', label: '営業 CF の主張の向きを逆にする', make: flip('operatingCashFlow') },
  { kind: 'H-22', label: '監査の注意書きを「監査済みです」に', make: (q) => sv(q.tanshin, 'summary.auditNote', '決算短信は監査済みです') },
  { kind: 'H-23', label: '会計方針の変更の有無を反転', make: (q) => sv(q.tanshin, 'summary.accountingPolicyChange', !q.tanshin.summary.accountingPolicyChange) },
  { kind: 'H-24', label: 'IR に期末後の出来事を書く', make: (q) => sv(q.ir, 'outlook.subsequentEvent', '期末後に子会社の売却を決定した (売却益は約 10 億円)') },
];
const bases = readdirSync(resolve(root, 'src/data/problems/hard')).sort().map((f) => read(`src/data/problems/hard/${f}`)).filter((p) => !p.anomaly);
console.log(`基: むずかしいの正常な問題 ${bases.length} 問。形に載るセル ${SHOWN.length} 欄 (カード 4 欄 + 見出し語・資料)`);
for (const r of RECIPES) {
  const primary: string[] = r.primary ?? kinds.find((k: any) => k.id === r.kind).primaryRules;
  let doubled = 0, noPrimary = 0, same = 0, relBad = 0; const extras = new Set<string>();
  for (const b of bases) {
    const q = JSON.parse(JSON.stringify(b)); r.make(q);
    if (relBroken(q).length) relBad++;
    const vs = verifyProblem(q, companies.find((c: any) => c.id === b.companyId)).hard;
    if (!displayChanged(b, q)) same++;
    const shown = new Set([...SHOWN.filter((x) => !x.startsWith('@')), ...SHOWN_KEYS, ...FRAME, `ir.statements.${stmtIndex(b, 'operatingIncome')}`, `ir.statements.${stmtIndex(b, 'operatingCashFlow')}`]);
    const onCard = vs.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x))));
    const extra = [...new Set<string>(onCard.map((v: any) => v.rule))].filter((x) => !primary.includes(x));
    if (extra.length) { doubled++; extra.forEach((x) => extras.add(x)); }
    if (!onCard.some((v: any) => primary.includes(v.rule))) noPrimary++;
  }
  console.log(`${r.kind} ${r.label}: 二重の食い違い ${doubled}/${bases.length}${extras.size ? ` (${[...extras].join(', ')})` : ''}・形に載る主な規則が無い ${noPrimary}/${bases.length}・表示が変わらない ${same}/${bases.length}・card-relation が落ちる ${relBad}/${bases.length}`);
}

// H-34 あり得ない符号 (設計 v3 §1.6 の `sign`・§2.3。#174 包括レビュー B2・B3)
// (a) 対象欄を閉じる: 「正でなければならない」欄 = 11 欄。正常な問題 (むずかしい 16・やさしい 12 = 28 問) で負・0 になるものが 0 であること。対象外 = 正常でも負になりうる欄
const NEG_OK: [string, string][] = [
  ['sales', 'tanshin.incomeStatement.current.netSales'], ['ta', 'tanshin.balanceSheet.current.totalAssets'], ['tlna', 'tanshin.balanceSheet.current.totalLiabilitiesAndNetAssets'],
  ['cash', 'tanshin.balanceSheet.current.cash'], ['arPrev', 'tanshin.balanceSheet.previous.receivables'], ['arCurr', 'tanshin.balanceSheet.current.receivables'], ['cfEnd', 'tanshin.cashFlow.cashEnding'],
  ['irSales', 'ir.highlights.netSales.amount'], ['irCashCur', 'ir.supplement.cash.current'], ['irCashPrev', 'ir.supplement.cash.previous'], ['irDebtPrev', 'ir.supplement.interestBearingDebt.previous'],
];
const NEG_NG: [string, string][] = [
  ['opPrev', 'tanshin.incomeStatement.previous.operatingIncome'], ['opCurr', 'tanshin.incomeStatement.current.operatingIncome'], ['pbt', 'tanshin.incomeStatement.current.incomeBeforeTax'],
  ['cfStart', 'tanshin.cashFlow.incomeBeforeTax'], ['ocf', 'tanshin.cashFlow.operatingCashFlow'], ['cfAr', 'tanshin.cashFlow.receivablesChange'], ['irNetDebtPrev', 'ir.supplement.netDebt.previous'], ['margin', 'tanshin.summary.operatingMargin'],
];
{
  const all: any[] = [];
  for (const d of ['easy', 'hard']) for (const f of readdirSync(resolve(root, `src/data/problems/${d}`)).sort()) { const p = read(`src/data/problems/${d}/${f}`); if (!p.anomaly) all.push(p); }
  const neg = (path: string) => { const [doc, ...rest] = path.split('.'); return all.filter((p) => gv(p[doc], rest.join('.')) <= 0).map((p) => p.id); };
  console.log(`H-34 対象 ${NEG_OK.length} 欄 (正常 ${all.length} 問で 0 以下になる問題): ` + NEG_OK.map(([n, pth]) => `${n} ${neg(pth).length}`).join('・'));
  console.log(`H-34 対象外 ${NEG_NG.length} 欄 (正常で負・0 になる問題): ` + NEG_NG.map(([n, pth]) => `${n} ${neg(pth).length}${neg(pth).length ? `(${neg(pth).join(',')})` : ''}`).join('・'));
  // (b) 値を負にする作り方 (旧) は、対象 11 欄のうちいくつで二重の食い違いを出すか。表示だけに △ を付ける作り方 (採用) は、データが基のままなので 0
  let valueDoubled = 0; const detail: string[] = [];
  for (const [n, pth] of NEG_OK) {
    let bad = 0; const rules = new Set<string>();
    for (const b of bases) {
      const q = JSON.parse(JSON.stringify(b)); const [doc, ...rest] = pth.split('.'); sv(q[doc as 'tanshin' | 'ir'], rest.join('.'), -gv(b[doc], rest.join('.')));
      const shown = new Set([...SHOWN.filter((x) => !x.startsWith('@')), ...SHOWN_KEYS, ...FRAME, `ir.statements.${stmtIndex(b, 'operatingIncome')}`, `ir.statements.${stmtIndex(b, 'operatingCashFlow')}`]);
      const onCard = verifyProblem(q, companies.find((c: any) => c.id === b.companyId)).hard.filter((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x))));
      const rr = [...new Set<string>(onCard.map((v: any) => v.rule))]; if (rr.length || relBroken(q).length) { bad++; rr.forEach((x) => rules.add(x)); if (relBroken(q).length) rules.add('card-relation'); }
    }
    if (bad) valueDoubled++; detail.push(`${n} ${bad}/${bases.length}${rules.size ? `(${[...rules].join(',')})` : ''}`);
  }
  console.log(`H-34 値を負にする作り方 (旧) で、別の規則も落ちる (二重の食い違い) 欄: ${valueDoubled}/${NEG_OK.length} 欄。内訳 (問題数): ` + detail.join('・'));
  let dd = 0; for (const b of bases) { const q = JSON.parse(JSON.stringify(b)); const shown = new Set([...SHOWN.filter((x) => !x.startsWith('@')), ...SHOWN_KEYS, ...FRAME, `ir.statements.${stmtIndex(b, 'operatingIncome')}`, `ir.statements.${stmtIndex(b, 'operatingCashFlow')}`]); if (verifyProblem(q, companies.find((c: any) => c.id === b.companyId)).hard.some((v: any) => v.paths.length > 0 && [...new Set<string>(v.paths)].every((x) => shown.has(norm(x)))) || relBroken(q).length) dd++; }
  console.log(`H-34 表示だけに △ を付ける作り方 (採用。データは基のまま): 形に載る規則が落ちる ${dd}/${bases.length} (= 基の正常と同じ。0)`);
}

// 読む量 (設計 v3 §1.3): 形の全部の文字数。科目名・見出し・単位は設計の表のとおりの定数、数字・文は正常 16 問のデータから。製品のコードではない。
const LABELS = [
  '売上高', '営業利益 (前期)', '営業利益 (当期)', '営業利益率', '百万円', '百万円', '百万円', '%', '【増益】', '期末', // カード
  '決算短信のまとめ', '税金等調整前当期純利益', '資産', '現金及び預金', '売上債権 (売掛金) (前期末)', '売上債権 (売掛金) (当期末)', '総資産', '負債及び純資産合計',
  '税金等調整前当期純利益 (CF の最初の行)', '売上債権 (売掛金) の増減額', '営業活動によるキャッシュ・フロー', '現金及び現金同等物の期末残高 (資金の範囲 = 現金及び預金)',
  '監査', '会計方針の変更', '会計方針の注記', '後発事象', 'セグメント', ...Array(10).fill('百万円'),
  'IR のひとこと', '売上高', '現金 (当期)', '現金 (前期)', '有利子負債 (前期)', '純有利子負債 (前期・有利子負債 − 現金)', '営業 CF', '期末後の出来事', 'セグメント', ...Array(5).fill('億円'),
];
const chars: number[] = [];
for (const b of bases) {
  const t = b.tanshin, r = b.ir, c = companies.find((x: any) => x.id === b.companyId);
  const nums = [t.incomeStatement.current.netSales, t.incomeStatement.previous.operatingIncome, t.incomeStatement.current.operatingIncome, t.summary.operatingMargin, t.incomeStatement.current.incomeBeforeTax, t.balanceSheet.current.cash, t.balanceSheet.previous.receivables, t.balanceSheet.current.receivables, t.balanceSheet.current.totalAssets, t.balanceSheet.current.totalLiabilitiesAndNetAssets, t.cashFlow.incomeBeforeTax, t.cashFlow.receivablesChange, t.cashFlow.operatingCashFlow, t.cashFlow.cashEnding, r.highlights.netSales.amount, r.supplement.cash.current, r.supplement.cash.previous, r.supplement.interestBearingDebt.previous, r.supplement.netDebt.previous].map((v: number) => (Number.isInteger(v) ? Math.round(v).toLocaleString('en-US') : String(v)));
  const texts = [t.header.companyName, t.header.periodLabel, t.summary.auditNote, t.summary.accountingPolicyChange ? 'あり' : 'なし', t.notes.accountingPolicyNote ?? '', t.notes.subsequentEvents ?? '', t.notes.segments.current.segments.map((x: any) => x.name).join('・'), '営業活動によるキャッシュ・フローはプラス', r.outlook.subsequentEvent ?? '期末後の出来事: なし', r.segments.items.map((x: any) => x.name).join('・'), c.name];
  chars.push([...LABELS, ...nums, ...texts].join('').length);
}
const avg = chars.reduce((a, x) => a + x, 0) / chars.length;
console.log(`読む量: むずかしいの形の全部の文字数 (科目名・単位・数字・文。正常 ${bases.length} 問): 平均 ${avg.toFixed(0)} 字・最大 ${Math.max(...chars)} 字・最小 ${Math.min(...chars)} 字。欄の数: 数字 19・文 8`);
// カードだけの文字数 (やさしいの形。LABELS の先頭 10 件 + 数字 4 つ + 社名・期・期末日)
const cardChars = bases.map((b: any) => { const t = b.tanshin; const nums = [t.incomeStatement.current.netSales, t.incomeStatement.previous.operatingIncome, t.incomeStatement.current.operatingIncome].map((v: number) => Math.round(v).toLocaleString('en-US')).concat(String(t.summary.operatingMargin)); return [...LABELS.slice(0, 10), ...nums, t.header.companyName, t.header.periodLabel, String(t.columnDates.incomeStatement.current)].join('').length; });
console.log(`読む量: カードだけ (やさしいの形): 平均 ${(cardChars.reduce((a: number, x: number) => a + x, 0) / cardChars.length).toFixed(0)} 字・最大 ${Math.max(...cardChars)} 字。黙読 653 字/分 (小林・川嶋 2018) なら、むずかしいの形の全部を読む時間 = ${(avg / 653 * 60).toFixed(0)} 秒/社 (最大 ${(Math.max(...chars) / 653 * 60).toFixed(0)} 秒)・8 社で ${(avg * 8 / 653).toFixed(1)} 分、カードだけなら ${(cardChars.reduce((a: number, x: number) => a + x, 0) / cardChars.length / 653 * 60).toFixed(0)} 秒/社`);
