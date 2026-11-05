// 設計 v2 §1.6・§2.8 検査 5: cardEdits の (op × 欄) の組が、今の正常な問題で表示を実際に変えるか (表示が変わらない組み合わせを数える)。製品のコードではない。
// 表示モデルは最小: 金額の欄 = 整数部に桁区切りのカンマ (4 桁以上のときだけ見た目が変わる)。% の欄・棒・文・見出し語は単位や桁区切りを持たない。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/card-edits.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const g = (o: any, path: string) => path.split('.').reduce((a: any, k) => a?.[k], o);
type Slot = { shape: string; name: string; kind: 'amount' | 'percent' | 'bar' | 'text'; doc: 'tanshin' | 'ir'; path?: string };
const T = (shape: string, name: string, path: string, kind: Slot['kind'] = 'amount'): Slot => ({ shape, name, kind, doc: 'tanshin', path });
const I = (shape: string, name: string, path: string): Slot => ({ shape, name, kind: 'amount', doc: 'ir', path });
const SLOTS: Slot[] = [
  T('E1', '売上高', 'incomeStatement.current.netSales'), T('E1', '営業利益 前期', 'incomeStatement.previous.operatingIncome'), T('E1', '営業利益 当期', 'incomeStatement.current.operatingIncome'), T('E1', '営業利益率', 'summary.operatingMargin', 'percent'),
  T('E2', '売上高 前期', 'incomeStatement.previous.netSales'), T('E2', '売上高 当期', 'incomeStatement.current.netSales'), { shape: 'E2', name: '棒', kind: 'bar', doc: 'ir' },
  T('E3', '流動資産', 'balanceSheet.current.totalCurrentAssets'), T('E3', '固定資産', 'balanceSheet.current.totalFixedAssets'), T('E3', '総資産', 'balanceSheet.current.totalAssets'),
  T('H1', '売上高 前期', 'incomeStatement.previous.netSales'), T('H1', '売上高 当期', 'incomeStatement.current.netSales'), T('H1', '総資産', 'balanceSheet.current.totalAssets'), T('H1', '負債・純資産合計', 'balanceSheet.current.totalLiabilitiesAndNetAssets'), I('H1', 'IR 売上高', 'highlights.netSales.amount'),
  T('H2', '売掛金 前期末', 'balanceSheet.previous.receivables'), T('H2', '売掛金 当期末', 'balanceSheet.current.receivables'), T('H2', '売上債権の増減額', 'cashFlow.receivablesChange'), T('H2', '営業 CF', 'cashFlow.operatingCashFlow'),
  T('H3', 'CF の起点', 'cashFlow.incomeBeforeTax'), T('H3', '損益の税引前利益', 'incomeStatement.current.incomeBeforeTax'), T('H3', '貸借の現金', 'balanceSheet.current.cash'), T('H3', 'CF の期末残高', 'cashFlow.cashEnding'),
  I('H3', 'IR 現金 当期', 'supplement.cash.current'), I('H3', 'IR 現金 前期', 'supplement.cash.previous'), I('H3', 'IR 有利子負債 前期', 'supplement.interestBearingDebt.previous'), I('H3', 'IR 純有利子負債 前期', 'supplement.netDebt.previous'),
];
const bases = ['easy', 'hard'].flatMap((d) => readdirSync(resolve(root, `src/data/problems/${d}`)).sort().map((f) => read(`src/data/problems/${d}/${f}`))).filter((p) => !p.anomaly);
// 「桁区切りのカンマが見た目に出る」= 絶対値の整数部が 4 桁以上
const hasComma = (v: number) => Math.floor(Math.abs(v)) >= 1000;
console.log('op=format (no-comma / comma-shift): 金額の欄で、正常な問題のうち表示が変わる (整数部 4 桁以上の) 割合。0% の欄には当てられない');
const bad: string[] = [];
for (const s of SLOTS) {
  if (s.kind !== 'amount') { console.log(`  ${s.shape} ${s.name}: ${s.kind} の欄 → format・unit は不可 (カンマも単位も出さない)`); continue; }
  const bs = bases.filter((b) => (s.shape[0] === 'E') === (b.difficulty === 'easy'));
  const vals = bs.map((b) => g(b[s.doc], s.path!)).filter((v) => typeof v === 'number');
  const share = vals.filter(hasComma).length / vals.length;
  console.log(`  ${s.shape} ${s.name}: ${(share * 100).toFixed(0)}% (${vals.filter(hasComma).length}/${vals.length})`);
  if (share < 1) bad.push(`${s.shape} ${s.name}`);
}
console.log(`\n100% でない金額の欄 (${bad.length}): ${bad.join('、')} → format はこの欄では問題ごとに「元の表示に桁区切りがある」を検査 5 で確かめる`);
console.log('\nop=unit: 単位を表示する金額の欄だけ。% の欄・棒・文には当てない (§1.6)');
console.log('op=swap: itemKey が違う欄どうしだけ (前期・当期の同じ科目の入れ替えは E-17 と同じ見え方なので禁じる。Slot.column で前期・当期を区別する)');
console.log('op=headline: 元の語の組の外の語だけ (E1 = 増益・減益 → 増収・減収、E2 = 増収・減収 → 増益・減益)');
console.log('op=dup: E3 だけ (E1・E2 は数字の欄が 4 つで、重複すると画面に 5 つ出る)');
const scopes = new Set(bases.filter((b) => b.difficulty === 'hard').map((b) => b.tanshin.notes.cashScope));
console.log(`\nnotes.cashScope (むずかしいの正常 ${bases.filter((b) => b.difficulty === 'hard').length} 問): ${[...scopes].join(' / ')}`);
