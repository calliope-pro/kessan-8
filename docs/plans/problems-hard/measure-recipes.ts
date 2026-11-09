// @ts-nocheck — 測定 (Sub-task #170 レビュー 1 回目 B1): 今の注入 (scripts/gen-hard/inject.ts) の 11 recipe を、今の正常 16 問に当て、v3 の検証器で見える・二重の食い違いが無いかを数える。
// 再現: node --experimental-strip-types --no-warnings docs/plans/problems-hard/measure-recipes.ts [--filter-places | --v3]
//   --v3: 設計表 §5 の作り方で直した試作 recipe (H-01・H-03・H-05・H-13・H-19・H-21・H-23。この中の DRAFT)
//   --filter-places: 場所を『カードに載るセル (cardCells) だけ』に絞った版 (§5 の場所の決まり)。
import { readFileSync, readdirSync } from 'node:fs';
import { deriveCards, cardCells } from '../../../src/domain/cards.ts';
import { anomalyIssues } from '../../../src/verifier/anomaly.ts';
import { cardVisibility, doubleDiscrepancies, deviationIssues, cardRelationIssues } from '../../../src/verifier/cards.ts';
import { verifyProblem } from '../../../src/verifier/index.ts';
import { changedCells } from '../../../src/verifier/path.ts';
import { inject } from '../../../scripts/gen-hard/inject.ts';

const root = new URL('../../../', import.meta.url);
const companies = JSON.parse(readFileSync(new URL('src/data/companies.json', root), 'utf-8'));
const kinds = JSON.parse(readFileSync(new URL('src/data/anomaly-kinds.json', root), 'utf-8'));
const normals = readdirSync(new URL('src/data/problems/hard/', root))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(`src/data/problems/hard/${f}`, root), 'utf-8')))
  .filter((p) => p.anomaly === null);
const filterPlaces = process.argv.includes('--filter-places');
const useDraft = process.argv.includes('--v3');
const KINDS = useDraft ? ['H-01', 'H-03', 'H-05', 'H-13', 'H-19', 'H-21', 'H-23'] : ['H-01', 'H-03', 'H-05', 'H-13', 'H-17', 'H-19', 'H-21', 'H-22', 'H-23', 'H-24', 'H-28'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const T = (path) => ({ doc: 'tanshin', path });
const I = (path) => ({ doc: 'ir', path });
function resumBs(b) {
  b.totalCurrentLiabilities = b.payables + b.shortTermDebt + b.incomeTaxesPayable + b.otherCurrentLiabilities;
  b.totalLiabilities = b.totalCurrentLiabilities + b.longTermDebt;
  b.totalLiabilitiesAndNetAssets = b.totalLiabilities + b.totalNetAssets;
}
/** v3 の試作 recipe (設計表 §5 の作り方 + 場所は『形の欄が読むセル』だけ)。i = その種類の何問目か (形の選び方)。 */
const DRAFT = {
  'H-01': (q) => {
    const b = q.tanshin.balanceSheet.current;
    b.payables += Math.max(20, Math.round((b.payables * 0.1) / 10) * 10); // design-v3 §2.3 の +10%
    resumBs(b);
    return [T('balanceSheet.current.totalAssets'), T('balanceSheet.current.totalLiabilitiesAndNetAssets')];
  },
  'H-03': (q) => {
    q.tanshin.cashFlow.incomeBeforeTax = q.tanshin.incomeStatement.current.netIncome; // 再計算しない
    return [T('cashFlow.incomeBeforeTax'), T('incomeStatement.current.incomeBeforeTax')];
  },
  'H-05': (q, i) => {
    const cf = q.tanshin.cashFlow;
    const t = cf.receivablesChange;
    // 符号を逆に / 20% ずらす (再計算しない)。20% は丸めたあとに 20% を割らないよう切り上げる (四捨五入だと −742 → −890 で 19.95% になり、最小のずれの検査 `5|x−t| ≥ |t|` で落ちる)。
    // c03・c08 は増減が小さく 20% が G3 (5 百万円) に届かないので、設計表 (plan.ts) の形は符号を逆に
    const flip = i % 2 === 0 || q.companyId === 'c03' || q.companyId === 'c08';
    cf.receivablesChange = flip ? -t : t + Math.sign(t) * Math.ceil(Math.abs(t) * 0.2);
    return [T('cashFlow.receivablesChange'), T('balanceSheet.previous.receivables'), T('balanceSheet.current.receivables')];
  },
  'H-13': (q, i) => {
    if (i % 2 === 0) q.ir.highlights.netSales.amount = Math.round(q.ir.highlights.netSales.amount * 1.05 * 10) / 10;
    else q.ir.supplement.cash.current = Math.round(q.ir.supplement.cash.current * 1.05 * 10) / 10;
    return i % 2 === 0 ? [I('highlights.netSales.amount'), T('incomeStatement.current.netSales')] : [I('supplement.cash.current'), T('balanceSheet.current.cash')];
  },
  'H-19': (q) => {
    const items = q.ir.segments.items;
    items.pop();
    for (const k of ['previous', 'current']) {
      const sum10 = items.reduce((a, it) => a + Math.round(it.profit[k] * 10), 0);
      q.ir.segments.adjustment[k] = (Math.round(q.ir.segments.consolidatedOperatingIncome[k] * 10) - sum10) / 10;
    }
    return [I('segments.items'), T(`notes.segments.current.segments.${items.length}.name`)];
  },
  'H-21': (q) => {
    const idx = q.ir.statements.findIndex((s) => s.claims.some((c) => c.metric === 'operatingCashFlow'));
    const c = q.ir.statements[idx].claims.find((c) => c.metric === 'operatingCashFlow');
    c.direction = c.direction === 'up' ? 'down' : 'up';
    return [I(`statements.${idx}`), T('cashFlow.operatingCashFlow')];
  },
  'H-23': (q, i) => {
    const t = q.tanshin;
    const text = '当期から、収益認識に関する会計基準の適用指針の改正を適用している。この変更による当期の損益への影響は軽微である。';
    if (i % 2 === 0) t.summary.accountingPolicyChange = !t.summary.accountingPolicyChange; // flag
    else t.notes.accountingPolicyNote = t.notes.accountingPolicyNote === '該当事項はありません。' ? text : '該当事項はありません。'; // note
    return [T('summary.accountingPolicyChange'), T('notes.accountingPolicyNote')];
  },
};
const placeKeyOf = (pl) => (pl.doc === 'card' ? `card.0.${pl.slot}` : 'itemKey' in pl ? pl.itemKey : `${pl.doc}.${pl.path}`);

console.log(`正常 ${normals.length} 問${filterPlaces ? ' (場所をカードのセルに絞る)' : ''}`);
console.log('種類 | 作れた | 異変の検査が落ちる | 見えない (V1 / V2 / 表示が変わらない) | 二重の食い違い | 最小のずれ | card-relation が落ちる | 全部通る');
for (const kind of KINDS) {
  let kindIndex = 0;
  let made = 0, bad = 0, v1 = 0, v2 = 0, v3 = 0, dbl = 0, dev = 0, rel = 0, ok = 0;
  const why = new Map();
  for (const p of normals) {
    const co = companies.find((c) => c.id === p.companyId);
    let q;
    try {
      if (useDraft) {
        q = clone(p);
        const places = DRAFT[kind](q, kindIndex);
        q.anomaly = { kind, places, explanation: 'x', expectedRules: [...new Set(verifyProblem(q, co).hard.map((v) => v.rule))].sort() };
        q.tier = 1;
      } else q = inject(p, co, { kind, tier: 1 });
    } catch (e) {
      console.log('  例外', kind, p.id, e.message);
      continue;
    }
    kindIndex++;
    made++;
    if (filterPlaces) {
      const cells = cardCells(deriveCards(q, co, 'hard', { applyEdits: false }));
      const vis = (pl) => cells.has(placeKeyOf(pl)) || [...cells].some((c) => placeKeyOf(pl) === c || placeKeyOf(pl).startsWith(`${c}.`) || c.startsWith(`${placeKeyOf(pl)}.`));
      q.anomaly.places = q.anomaly.places.filter(vis);
    }
    q.anomaly.base = p.id;
    q.anomaly.changed = changedCells(p, q);
    const result = verifyProblem(q, co);
    const issues = anomalyIssues(q, kinds, result);
    const v = cardVisibility(q, co, kinds, result, p);
    const d = doubleDiscrepancies(q, co, kinds, result, p);
    const dv = deviationIssues(q, co);
    const r = cardRelationIssues(deriveCards(q, co, 'hard')).length;
    if (issues.length) { bad++; issues.forEach((i) => why.set(i.code, (why.get(i.code) ?? 0) + 1)); }
    if (v.missingPlaces.length) { v1++; if (process.argv.includes('--debug') && v1 === 1) console.log('  V1', kind, p.id, JSON.stringify(v.missingPlaces), JSON.stringify(q.anomaly.places)); }
    if (!v.v2) v2++;
    if (v.v3 === false) v3++;
    if (d.length) dbl++;
    if (dv.length) { dev++; if (process.argv.includes('--debug')) console.log('  最小のずれ', kind, p.id, p.companyId, dv.join('/')); }
    if (r) rel++;
    if (!issues.length && !v.missingPlaces.length && v.v2 && v.v3 !== false && !d.length && !dv.length && !r) ok++;
  }
  console.log(`${kind} | ${made} | ${bad} | ${v1} / ${v2} / ${v3} | ${dbl} | ${dev} | ${rel} | ${ok}/${made}${why.size ? '  (' + [...why].map(([k, n]) => `${k} ${n}`).join('・') + ')' : ''}`);
}

if (process.argv.includes('--debug')) {
  const p = normals[0];
  const co = companies.find((c) => c.id === p.companyId);
  const q = clone(p);
  const places = DRAFT['H-01'](q, 0);
  q.anomaly = { kind: 'H-01', places, explanation: 'x', expectedRules: [] };
  const result = verifyProblem(q, co);
  const v = cardVisibility(q, co, kinds, result, p);
  console.log('places', JSON.stringify(places));
  console.log('vis', JSON.stringify(v));
  console.log([...cardCells(deriveCards(q, co, 'hard', { applyEdits: false }))].filter((c) => c.includes('totalAssets')));
  console.log(result.hard.map((x) => `${x.rule}: ${x.paths.join(',')}`));
}

// --g3: 異変のずれが G3 (anomalies.md。金額は 5 百万円以上かつ対象値の 1% 以上・IR の億円は 0.3 億円以上かつ 1% 以上) を満たすかの余裕。今の正常 16 問
if (process.argv.includes('--g3')) {
  const rows = normals.map((p) => {
    const t = p.tanshin, cf = t.cashFlow;
    const dAR = Math.abs(t.balanceSheet.current.receivables - t.balanceSheet.previous.receivables);
    const netDebtPrev = Math.abs(Math.round(p.ir.supplement.interestBearingDebt.previous * 10) - Math.round(p.ir.supplement.cash.previous * 10)) / 10;
    return {
      id: p.id, co: p.companyId,
      'H-05 20%ずらし (百万円)': dAR * 0.2,
      'H-04 5% (百万円)': cf.cashEnding * 0.05,
      'H-13 売上 5% (億円)': p.ir.highlights.netSales.amount * 0.05,
      'H-13 現金 5% (億円)': p.ir.supplement.cash.current * 0.05,
      'H-20 20% (億円)': netDebtPrev * 0.2,
      'H-01 +10% (百万円)': Math.max(20, Math.round((t.balanceSheet.current.payables * 0.1) / 10) * 10),
      'H-03 当期純利益との差 (百万円)': Math.abs(t.incomeStatement.current.incomeBeforeTax - t.incomeStatement.current.netIncome),
    };
  });
  const need = { 'H-05 20%ずらし (百万円)': 5, 'H-04 5% (百万円)': 5, 'H-13 売上 5% (億円)': 0.3, 'H-13 現金 5% (億円)': 0.3, 'H-20 20% (億円)': 0.3, 'H-01 +10% (百万円)': 5, 'H-03 当期純利益との差 (百万円)': 5 };
  for (const [k, min] of Object.entries(need)) {
    const bad = rows.filter((r) => r[k] < min).map((r) => `${r.id}(${r.co}) ${r[k].toFixed(2)}`);
    console.log(`${k}: 最小 ${Math.min(...rows.map((r) => r[k])).toFixed(2)} (下限 ${min}) → 下限未満 ${bad.length} 問${bad.length ? ': ' + bad.join('、') : ''}`);
  }
}
