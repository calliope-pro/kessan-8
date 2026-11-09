// @ts-nocheck — 問題データを作る道具 (むずかしい 132 問。docs/plans/problems-hard.md)。生成物は src/data/problems/hard/*.json で、JSON が唯一の出所。
// 正常な問題の生成器 (正常 10 問と、異変の問題の基)。検証器の規則 (hard 全部) を満たすよう、連動の式から数字を導く。v3 で直した 4 点: 全社 億円 (companies.json の irUnit)・要素 DN (営業利益が減る)・CN (営業 CF がマイナス)・段を持たせない・営業 CF の文を向きで作る。
import { readFileSync } from 'node:fs';
import { roundHalfAway as rh, toIrUnit, dividendAmount } from '../../src/verifier/math.ts';

/** 正常な問題の指定 (plan.ts の正常の行)。 */
export interface NormalSpec {
  /** 問題の番号 (hard-001〜010)。乱数の種に使う。 */
  n: number;
  id: string;
  company: string;
  fiscalYear: number;
  /** 疑わしく見える要素 (G X D N C P E DN CN)。 */
  elements: string[];
}

/** 会計方針の変更の注記 (40 字以内。H-23 の反転も同じ文を使う)。 */
export const POLICY_TEXT = '当期から収益認識の適用指針の改正を適用。影響は軽微。';

export const companies: any[] = JSON.parse(readFileSync(new URL('../../src/data/companies.json', import.meta.url), 'utf-8'));

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

interface Prof {
  S0: number; gm: number; opm: number; aps: number; eqr: number; shares: number;
  assets: [number, number, number, number, number, number]; // cash rec inv oca tangible investments
  liab: { p: number; s: number; t: number; o: number };
  payout: number; interim: boolean; dep: number; rate: number;
  seg: number[]; // 売上構成
  segp: number[]; // 利益配分
  pays: boolean;
  ig?: number; // 投資その他の資産の年間増加率 (現金がたまりすぎる会社用)
}
const PROF: Record<string, Prof> = {
  c01: { S0: 38000, gm: 0.34, opm: 0.09, aps: 1.0, eqr: 0.58, shares: 12000, assets: [0.12, 0.17, 0.14, 0.02, 0.45, 0.1], liab: { p: 0.09, s: 0.04, t: 0.01, o: 0.04 }, payout: 0.25, interim: true, dep: 0.09, rate: 0.016, seg: [0.5, 0.33, 0.17], segp: [0.5, 0.35, 0.15], pays: true },
  c02: { S0: 24000, gm: 0.27, opm: 0.04, aps: 0.8, eqr: 0.45, shares: 9000, assets: [0.1, 0.14, 0.1, 0.02, 0.55, 0.09], liab: { p: 0.11, s: 0.08, t: 0.008, o: 0.05 }, payout: 0.3, interim: false, dep: 0.09, rate: 0.016, seg: [0.58, 0.42], segp: [0.55, 0.45], pays: true },
  c03: { S0: 152000, gm: 0.26, opm: 0.035, aps: 0.45, eqr: 0.38, shares: 30000, assets: [0.1, 0.04, 0.18, 0.03, 0.55, 0.1], liab: { p: 0.2, s: 0.05, t: 0.008, o: 0.08 }, payout: 0.3, interim: true, dep: 0.08, rate: 0.014, seg: [0.62, 0.3, 0.08], segp: [0.5, 0.35, 0.15], pays: true },
  c04: { S0: 12500, gm: 0.55, opm: 0.14, aps: 0.9, eqr: 0.62, shares: 6000, assets: [0.3, 0.2, 0.0, 0.03, 0.1, 0.37], liab: { p: 0.04, s: 0, t: 0.015, o: 0.325 }, payout: 0, interim: false, dep: 0.1, rate: 0, seg: [0.7, 0.3], segp: [0.7, 0.3], pays: false, ig: 0.3 },
  c05: { S0: 46000, gm: 0.62, opm: 0.11, aps: 1.3, eqr: 0.71, shares: 15000, assets: [0.15, 0.16, 0.12, 0.02, 0.35, 0.2], liab: { p: 0.06, s: 0.02, t: 0.015, o: 0.04 }, payout: 0.3, interim: true, dep: 0.09, rate: 0.012, seg: [0.72, 0.28], segp: [0.75, 0.25], pays: true },
  c06: { S0: 98000, gm: 0.12, opm: 0.05, aps: 0.7, eqr: 0.34, shares: 20000, assets: [0.14, 0.28, 0.1, 0.02, 0.3, 0.16], liab: { p: 0.22, s: 0.08, t: 0.01, o: 0.08 }, payout: 0.3, interim: false, dep: 0.08, rate: 0.014, seg: [0.55, 0.32, 0.13], segp: [0.5, 0.3, 0.2], pays: true },
  c07: { S0: 61000, gm: 0.18, opm: 0.025, aps: 0.7, eqr: 0.21, shares: 14000, assets: [0.08, 0.16, 0.01, 0.02, 0.65, 0.08], liab: { p: 0.1, s: 0.1, t: 0.005, o: 0.04 }, payout: 0, interim: false, dep: 0.1, rate: 0.016, seg: [0.82, 0.18], segp: [0.6, 0.4], pays: false },
  c08: { S0: 29000, gm: 0.45, opm: 0.17, aps: 2.0, eqr: 0.29, shares: 7000, assets: [0.06, 0.01, 0.2, 0.02, 0.6, 0.11], liab: { p: 0.02, s: 0.06, t: 0.01, o: 0.03 }, payout: 0.3, interim: false, dep: 0.04, rate: 0.012, seg: [0.55, 0.3, 0.15], segp: [0.6, 0.3, 0.1], pays: true },
  c09: { S0: 8400, gm: 0.62, opm: 0.08, aps: 0.6, eqr: 0.52, shares: 3500, assets: [0.35, 0.06, 0.0, 0.03, 0.4, 0.16], liab: { p: 0.02, s: 0.02, t: 0.01, o: 0.3 }, payout: 0.25, interim: false, dep: 0.1, rate: 0.012, seg: [0.65, 0.35], segp: [0.7, 0.3], pays: true },
  c10: { S0: 215000, gm: 0.09, opm: 0.018, aps: 0.35, eqr: 0.27, shares: 40000, assets: [0.12, 0.35, 0.2, 0.02, 0.22, 0.09], liab: { p: 0.3, s: 0.12, t: 0.005, o: 0.03 }, payout: 0.3, interim: true, dep: 0.07, rate: 0.012, seg: [0.5, 0.3, 0.2], segp: [0.45, 0.3, 0.25], pays: true },
};

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

export function genNormal(spec: NormalSpec, prev?: any): { problem: any; state: any } {
  const co = companies.find((c) => c.id === spec.company);
  const P = PROF[spec.company] as Prof;
  const R = mulberry32(hash(`${spec.company}:${spec.fiscalYear}:${spec.n}`));
  const rr = (a: number, b: number) => a + (b - a) * R();
  const el = new Set(spec.elements);
  const unit10 = co.irUnit === '億円' ? 10 : 1; // 億円の会社は営業利益・セグメント利益・調整額を 10 の倍数に
  const q = (x: number, m = 1) => Math.round(x / m) * m;

  // 規模は期ごとに少し変える (同じ会社の問題が同じ数字にならない)
  const scale = 1 + (spec.fiscalYear - 2027) * 0.045 + rr(-0.01, 0.01);
  const S0 = prev ? prev.PL1.netSales : q(P.S0 * scale, 10);
  let g = rr(0.02, 0.08);
  if (el.has('G')) g = rr(0.12, 0.17);
  const S1 = q(S0 * (1 + g), 10);
  // 前期
  const gp0 = prev ? prev.PL1.grossProfit : q(S0 * (P.gm + rr(-0.005, 0.005)), 10);
  const OI0 = prev ? prev.PL1.operatingIncome : q(S0 * (P.opm + rr(-0.004, 0.004)), 10);
  // 当期
  let OI1 = q(OI0 * (S1 / S0) * rr(0.96, 1.04), 10); // 売上高に連れて動く (大きな増減率 G は別に作る)
  if (el.has('G')) OI1 = q(OI0 * rr(1.18, 1.26), 10);
  else if (el.has('DN')) OI1 = q(OI0 * rr(0.82, 0.92), 10); // 営業利益が減る (R-S5 (f)。【減益】が正常にも出る)
  else OI1 = Math.max(OI1, q(OI0 * 1.03, 10)); // 前期比 2% 以上の増益 (向きが読み取れる。#171 の J5)
  const gp1 = q(S1 * (P.gm + rr(-0.004, 0.006)), 10);
  const sga0 = gp0 - OI0;
  const sga1 = gp1 - OI1;

  // 貸借 (前期)
  const A0n = S0 * P.aps;
  const a = P.assets.map((f) => Math.round(A0n * f));
  const [cash0, rec0, inv0, oca0, tang0, invst0] = (prev ? [prev.BS1.cash, prev.BS1.receivables, prev.BS1.inventories, prev.BS1.otherCurrentAssets, prev.BS1.tangibleAssets, prev.BS1.investments] : a) as [number, number, number, number, number, number];
  const curA0 = cash0 + rec0 + inv0 + oca0;
  const fixA0 = tang0 + invst0;
  const A0 = curA0 + fixA0;
  const pay0 = prev ? prev.BS1.payables : Math.round(A0 * P.liab.p);
  const st0 = prev ? prev.BS1.shortTermDebt : Math.round(A0 * P.liab.s);
  const itp0 = prev ? prev.BS1.incomeTaxesPayable : Math.round(A0 * P.liab.t);
  const ocl0 = prev ? prev.BS1.otherCurrentLiabilities : Math.round(A0 * P.liab.o);
  const lt0 = prev ? prev.BS1.longTermDebt : Math.round(A0 * (1 - P.eqr - P.liab.p - P.liab.s - P.liab.t - P.liab.o));
  const curL0 = pay0 + st0 + itp0 + ocl0;
  const L0 = curL0 + lt0;
  const NA0 = A0 - L0;
  const cs0 = prev ? prev.BS1.capitalStock : Math.round(NA0 * 0.25);
  const sur0 = prev ? prev.BS1.capitalSurplus : Math.round(NA0 * 0.15);
  const re0 = prev ? prev.BS1.retainedEarnings : NA0 - cs0 - sur0;

  // 損益
  const nonOpInc0 = prev ? prev.PL1.nonOperatingIncome : Math.round(S0 * 0.003);
  const nonOpInc1 = Math.round(S1 * 0.003);
  const nonOpExp0 = prev ? prev.PL1.nonOperatingExpenses : Math.round((st0 + lt0) * P.rate);
  // 当期の借入
  const stD = Math.round(st0 * rr(-0.08, 0.08));
  const st1 = st0 + stD;
  const B = Math.round(lt0 * 0.06);
  const Rp = -Math.round(lt0 * rr(0.07, 0.11));
  const lt1 = lt0 + B + Rp;
  const nonOpExp1 = Math.round((st1 + lt1) * P.rate);
  const ord0 = OI0 + nonOpInc0 - nonOpExp0;
  const ord1 = OI1 + nonOpInc1 - nonOpExp1;
  const exL0 = prev ? prev.PL1.extraordinaryLoss : Math.round(ord0 * 0.015);
  let exG1 = 0;
  let exL1 = Math.round(ord1 * 0.015);
  if (el.has('X')) {
    exL1 = Math.round(ord1 * rr(0.07, 0.1));
  }
  if (el.has('R')) exL1 = ord1 + Math.round(ord1 * 0.5); // 最終赤字 (営業利益は正のまま)
  const pre0 = ord0 - exL0;
  const pre1 = ord1 + exG1 - exL1;
  const tax0 = prev ? prev.PL1.incomeTaxes : Math.round(pre0 * 0.31);
  const tax1 = el.has('R') ? Math.round(ord1 * 0.08) : Math.round(pre1 * 0.31);
  const NI0 = pre0 - tax0;
  const NI1 = pre1 - tax1;

  // 当期の貸借 (キャッシュ・フロー以外)
  const k = S1 / S0;
  const rec1 = Math.round(rec0 * k * (el.has('CN') ? rr(1.26, 1.32) : rr(0.97, 1.04))); // CN = 売上債権が膨らみ、営業 CF がマイナスになる (R-S5 (f))
  const inv1 = Math.round(inv0 * k * rr(0.97, 1.04));
  const oca1 = oca0;
  const pay1 = Math.round(pay0 * k * rr(0.97, 1.03));
  const itp1 = Math.round(itp0 * (tax1 / tax0));
  const ocl1 = Math.round(ocl0 * k);
  const invst1 = Math.round(invst0 * (1 + (P.ig ?? 0.02)));
  const dep1 = Math.round(tang0 * P.dep);
  const capexN = Math.round(dep1 * (el.has('C') ? rr(1.7, 1.9) : rr(0.9, 1.2)));
  const tang1 = tang0 + capexN - dep1;

  // 配当
  const shares = P.shares;
  const eps0 = rh(NI0 * 100000, shares) / 100;
  const eps1 = rh(NI1 * 100000, shares) / 100;
  let divPrev = prev ? prev.divCur : P.pays ? Math.max(1, Math.round(eps0 * P.payout)) : 0;
  let divCur = P.pays ? Math.max(1, Math.round(eps1 * P.payout)) : 0;
  if (P.pays) {
    if (el.has('D')) divCur = Math.max(0, divPrev - Math.max(1, Math.round(divPrev * 0.2)));
    else if (divCur < divPrev) divCur = divPrev;
  }
  if (P.pays && NI1 > 0) {
    // 配当性向 (表示) と 配当金総額 ÷ 純利益 (別経路) が丸めでずれないように、当期の配当を 1 円ずつ動かして選ぶ
    const epsH = Math.round(eps1 * 100);
    const okDiv = (d: number) => d >= 1 && rh(d * 100000, epsH) === rh(dividendAmount(d, shares) * 1000, NI1);
    const cands = el.has('D') ? [divCur, divCur - 1, divCur - 2, divCur - 3].filter((d) => d < divPrev) : [divCur, divCur + 1, divCur - 1, divCur + 2, divCur - 2, divCur + 3].filter((d) => d >= divPrev);
    const pick = cands.find(okDiv);
    if (pick !== undefined) divCur = pick;
  }
  const intPrev = prev ? prev.intCur : P.interim ? Math.round(divPrev * 0.4) : 0;
  const intCur = P.interim ? Math.round(divCur * 0.4) : 0;
  const divPaid = dividendAmount(divPrev - intPrev + intCur, shares);
  const re1 = re0 + NI1 - divPaid;

  // キャッシュ・フロー
  const cf: any = {};
  cf.incomeBeforeTax = pre1;
  cf.depreciation = dep1;
  cf.interestDividendIncome = -nonOpInc1;
  cf.interestExpense = nonOpExp1;
  cf.receivablesChange = -(rec1 - rec0);
  cf.inventoriesChange = -(inv1 - inv0);
  cf.payablesChange = pay1 - pay0;
  cf.otherAssetsChange = -(oca1 - oca0);
  cf.otherLiabilitiesChange = ocl1 - ocl0;
  cf.subtotal = pre1 + dep1 - nonOpInc1 + nonOpExp1 + cf.receivablesChange + cf.inventoriesChange + cf.payablesChange + cf.otherAssetsChange + cf.otherLiabilitiesChange;
  cf.interestDividendReceived = nonOpInc1;
  cf.interestPaid = -nonOpExp1;
  cf.incomeTaxesPaid = -(tax1 - (itp1 - itp0));
  cf.operatingCashFlow = cf.subtotal + nonOpInc1 - nonOpExp1 + cf.incomeTaxesPaid;
  cf.capex = -capexN;
  cf.otherInvestingChange = -(invst1 - invst0);
  cf.investingCashFlow = cf.capex + cf.otherInvestingChange;
  cf.shortTermDebtChange = st1 - st0;
  cf.longTermBorrowings = B;
  cf.longTermRepayments = Rp;
  cf.dividendsPaid = -divPaid;
  cf.financingCashFlow = cf.shortTermDebtChange + B + Rp - divPaid;
  cf.fxEffect = 0;
  cf.netChangeInCash = cf.operatingCashFlow + cf.investingCashFlow + cf.financingCashFlow;
  cf.cashBeginning = cash0;
  cf.cashEnding = cash0 + cf.netChangeInCash;
  const cash1 = cf.cashEnding;

  const bs = (c: number, r: number, i: number, o: number, t: number, iv: number, p: number, s: number, ip: number, ol: number, l: number, cs: number, su: number, re: number) => {
    const tca = c + r + i + o;
    const tfa = t + iv;
    const tcl = p + s + ip + ol;
    const tl = tcl + l;
    const tse = cs + su + re;
    return {
      cash: c, receivables: r, inventories: i, otherCurrentAssets: o, totalCurrentAssets: tca, tangibleAssets: t, investments: iv, totalFixedAssets: tfa, totalAssets: tca + tfa,
      payables: p, shortTermDebt: s, incomeTaxesPayable: ip, otherCurrentLiabilities: ol, totalCurrentLiabilities: tcl, longTermDebt: l, totalLiabilities: tl,
      capitalStock: cs, capitalSurplus: su, retainedEarnings: re, totalShareholdersEquity: tse, nonControllingInterests: 0, totalNetAssets: tse, totalLiabilitiesAndNetAssets: tl + tse,
    };
  };
  const BS0 = bs(cash0, rec0, inv0, oca0, tang0, invst0, pay0, st0, itp0, ocl0, lt0, cs0, sur0, re0);
  const BS1 = bs(cash1, rec1, inv1, oca1, tang1, invst1, pay1, st1, itp1, ocl1, lt1, cs0, sur0, re1);
  const pl = (S: number, gp: number, sga: number, OI: number, ni: number, ne: number, ord: number, eg: number, el_: number, pre: number, tax: number, NI: number) => ({
    netSales: S, costOfSales: S - gp, grossProfit: gp, sga, operatingIncome: OI, nonOperatingIncome: ni, nonOperatingExpenses: ne, ordinaryIncome: ord,
    extraordinaryGain: eg, extraordinaryLoss: el_, incomeBeforeTax: pre, incomeTaxes: tax, netIncome: NI, netIncomeNonControlling: 0, netIncomeParent: NI,
  });
  const PL0 = pl(S0, gp0, sga0, OI0, nonOpInc0, nonOpExp0, ord0, 0, exL0, pre0, tax0, NI0);
  const PL1 = pl(S1, gp1, sga1, OI1, nonOpInc1, nonOpExp1, ord1, exG1, exL1, pre1, tax1, NI1);

  // セグメント
  const segInfo = (S: number, OI: number, jitter: number): any => {
    const n = P.seg.length;
    const sales = P.seg.map((f) => q(S * f * (1 + (R() - 0.5) * jitter), 10)); // 10 百万円の倍数 (億円の会社の IR の比率が丸めでずれない)
    // 残差は一番大きいセグメントに寄せる (小さなセグメントが残差で大きく振れて、正常な問題で疑わしく見えないように)
    const big = P.seg.indexOf(Math.max(...P.seg));
    sales[big] = S - sales.reduce((x, y, i) => (i === big ? x : x + y), 0);
    const adj = -q(OI * 0.08, unit10 === 10 ? 10 : 1) - 0;
    const pool = OI - adj;
    const profit = P.segp.map((f) => q(pool * f, unit10 === 10 ? 10 : 1));
    profit[big] = pool - profit.reduce((x, y, i) => (i === big ? x : x + y), 0);
    return { sales, profit, adj };
  };
  const sg0 = prev ? prev.sg1 : segInfo(S0, OI0, 0.02);
  const sg1 = segInfo(S1, OI1, 0.03);
  if (el.has('N')) {
    // 最後のセグメントを赤字にする (前期は黒字)。他のセグメントで OI に合わせる
    const n = P.seg.length;
    const loss = -q(OI1 * 0.06, unit10 === 10 ? 10 : 1);
    const pool = OI1 - sg1.adj;
    sg1.profit[n - 1] = loss;
    const rest = pool - loss;
    for (let i = 0; i < n - 1; i++) sg1.profit[i] = q(rest * (P.segp[i] as number) / (1 - (P.segp[n - 1] as number)), unit10 === 10 ? 10 : 1);
    sg1.profit[0] += rest - sg1.profit.slice(0, n - 1).reduce((x: number, y: number) => x + y, 0);
  }
  const segs = (sg: any, S: number, OI: number) => ({
    segments: co.segmentNames.map((name: string, i: number) => ({ name, netSales: sg.sales[i], profit: sg.profit[i] })),
    adjustment: sg.adj, consolidatedNetSales: S, consolidatedOperatingIncome: OI,
  });

  // サマリー
  const chg = (cur: number, prev: number) => rh((cur - prev) * 1000, prev) / 10;
  const eq0 = BS0.totalNetAssets;
  const eq1 = BS1.totalNetAssets;
  const eps = rh(NI1 * 100000, shares) / 100;
  const bps = rh(eq1 * 100000, shares) / 100;
  const accountingPolicy = el.has('P');
  const event = el.has('E');
  const summary = {
    netSales: { current: S1, previous: S0, changeRate: chg(S1, S0) },
    operatingIncome: { current: OI1, previous: OI0, changeRate: chg(OI1, OI0) },
    ordinaryIncome: { current: ord1, previous: ord0, changeRate: chg(ord1, ord0) },
    netIncomeParent: { current: NI1, previous: NI0, changeRate: chg(NI1, NI0) },
    operatingMargin: rh(OI1 * 1000, S1) / 10,
    roe: rh(NI1 * 2000, eq0 + eq1) / 10,
    eps, totalAssets: BS1.totalAssets, netAssets: BS1.totalNetAssets, equity: eq1,
    equityRatio: rh(eq1 * 1000, BS1.totalAssets) / 10,
    bps, annualDividend: divCur, interimDividend: intCur, annualDividendPrevious: divPrev, interimDividendPrevious: intPrev,
    dividendTotal: dividendAmount(divCur, shares),
    payoutRatio: eps > 0 && divCur > 0 ? rh(divCur * 100000, Math.round(eps * 100)) / 10 : 0,
    accountingPolicyChange: accountingPolicy,
    auditNote: '決算短信は公認会計士又は監査法人の監査の対象外です',
  };

  // 日付
  const m = co.fiscalYearEndMonth;
  const y = spec.fiscalYear;
  const pe = new Date(Date.UTC(y, m - 1, lastDay(y, m)));
  const ppe = new Date(Date.UTC(y - 1, m - 1, lastDay(y - 1, m)));
  // 発表日・総会の日は、土日なら次の平日にずらす (日曜の決算発表は不自然で、正常な問題が異変に見えるため)
  const weekday = (d: Date) => { while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000); return d; };
  const disc = weekday(new Date(pe.getTime() + 45 * 86400000));
  const meet = weekday(new Date(pe.getTime() + 88 * 86400000));
  const dates = { periodEnd: iso(pe), previousPeriodEnd: iso(ppe), disclosure: iso(disc), shareholdersMeeting: iso(meet) };
  const colDates = { previous: dates.previousPeriodEnd, current: dates.periodEnd };
  const periodLabel = `${y}年${m}月期`;
  const unit = co.irUnit;
  const u = (v: number) => toIrUnit(v, unit);
  const hdr = (un: string) => ({ companyName: co.name, securitiesCode: co.securitiesCode, periodLabel, unit: un });

  // 文欄は 40 字以内 (カードの文欄。設計 v3 §1.1)
  const subsText = event ? `期末後に子会社の一部を譲渡。譲渡益は約 ${Math.max(10, q(NI1 * 0.5, 10)).toLocaleString('ja-JP')} 百万円の見込み。` : '該当事項はありません。';
  const policyNote = accountingPolicy ? POLICY_TEXT : '該当事項はありません。';

  const tanshin = {
    header: hdr('百万円'),
    summary,
    dates,
    columnDates: { balanceSheet: colDates, incomeStatement: colDates, cashFlow: colDates },
    balanceSheet: { previous: BS0, current: BS1 },
    incomeStatement: { previous: PL0, current: PL1 },
    cashFlow: cf,
    notes: {
      goingConcern: '該当事項はありません。', cashScope: '現金及び預金',
      segments: { previous: segs(sg0, S0, OI0), current: segs(sg1, S1, OI1) },
      averageSharesThousand: shares, bps, eps, subsequentEvents: subsText, accountingPolicyNote: policyNote,
    },
  };

  // IR
  const irPct = (a: number, b: number) => rh(a * 1000, b) / 10;
  const irDelta = (f: number, a: number) => rh((f - a) * 1000, a) / 10;
  const x10 = (v: number) => Math.round(v * 10);
  const gf = rr(0.02, 0.06);
  const fNS = u(Math.round(S1 * (1 + gf)));
  const fOI = u(q(OI1 * (1 + gf * 1.3), 10));
  const aNS = u(S1);
  const aOI = u(OI1);
  const irSegItems = co.segmentNames.map((name: string, i: number) => {
    const s0 = tanshin.notes.segments.previous.segments[i];
    const s1 = tanshin.notes.segments.current.segments[i];
    return {
      name,
      netSales: { previous: u(s0.netSales), current: u(s1.netSales), changeRate: chg(s1.netSales, s0.netSales) },
      profit: { previous: u(s0.profit), current: u(s1.profit), changeRate: chg(s1.profit, s0.profit) },
      salesShare: irPct(s1.netSales, S1),
    };
  });
  const debt0 = st0 + lt0, debt1 = st1 + lt1;
  const sd = (x: number) => x10(u(x));
  const ir = {
    header: hdr(unit),
    highlights: {
      netSales: { amount: u(S1), changeRate: summary.netSales.changeRate },
      operatingIncome: { amount: u(OI1), changeRate: summary.operatingIncome.changeRate },
      ordinaryIncome: { amount: u(ord1), changeRate: summary.ordinaryIncome.changeRate },
      netIncomeParent: { amount: u(NI1), changeRate: summary.netIncomeParent.changeRate },
      annualDividend: divCur, payoutRatio: summary.payoutRatio,
    },
    results: {
      netSales: { previous: u(S0), current: u(S1) },
      grossProfit: { previous: u(gp0), current: u(gp1) },
      grossMargin: { previous: irPct(gp0, S0), current: irPct(gp1, S1) },
      operatingIncome: { previous: u(OI0), current: u(OI1) },
      operatingMargin: { previous: irPct(OI0, S0), current: irPct(OI1, S1) },
      chart: {
        netSales: { axisMin: 0, previous: u(S0), current: u(S1) },
        operatingIncome: { axisMin: 0, previous: u(OI0), current: u(OI1) },
      },
    },
    segments: {
      items: irSegItems,
      adjustment: { previous: u(sg0.adj), current: u(sg1.adj) },
      consolidatedOperatingIncome: { previous: u(OI0), current: u(OI1) },
    },
    outlook: {
      forecast: {
        netSales: fNS, netSalesChangeRate: rh((x10(fNS) - x10(aNS)) * 1000, x10(aNS)) / 10,
        operatingIncome: fOI, operatingIncomeChangeRate: rh((x10(fOI) - x10(aOI)) * 1000, x10(aOI)) / 10,
        capex: u(Math.round(capexN * 1.05)), depreciation: u(Math.round(dep1 * 1.04)), annualDividend: divCur,
      },
      actual: { netSales: aNS, operatingIncome: aOI, capex: u(capexN), depreciation: u(dep1) },
      subsequentEvent: event ? subsText : null,
    },
    supplement: {
      capex: { previous: null, current: u(capexN) },
      depreciation: { previous: null, current: u(dep1) },
      interestBearingDebt: { previous: u(debt0), current: u(debt1) },
      cash: { previous: u(cash0), current: u(cash1) },
      netDebt: { previous: (sd(debt0) - sd(cash0)) / 10, current: (sd(debt1) - sd(cash1)) / 10 },
      equityRatio: summary.equityRatio,
    },
    statements: [] as any[],
  };
  const up = (a: number, b: number) => (a > b ? 'up' : 'down');
  // I1 の文は、同じ画面に出る利益 (営業・経常・親会社株主に帰属する当期純利益) の動きと矛盾させない。揃わない期は、揃わないことを文に書き、claims にも持つ。
  const nsUp = S1 > S0;
  const profitsUp = [OI1 > OI0, ord1 > ord0, NI1 > NI0];
  const mixed = !(profitsUp.every(Boolean) || profitsUp.every((x) => !x));
  const base = nsUp ? '増収' : '減収';
  const phrase = mixed
    ? `${base}、営業利益は${profitsUp[0] ? '増益' : '減益'}、${!profitsUp[2] && profitsUp[0] ? '特別損失の計上により' : ''}親会社株主に帰属する当期純利益は${profitsUp[2] ? '増益' : '減益'}`
    : `${base}${profitsUp[0] ? '増益' : '減益'}`;
  ir.statements = [
    { slide: 'highlights', text: TEXT.highlights(spec.company, phrase), claims: [
      { metric: 'netSales', direction: up(S1, S0) }, { metric: 'operatingIncome', direction: up(OI1, OI0) },
      ...(mixed ? [{ metric: 'ordinaryIncome', direction: up(ord1, ord0) }, { metric: 'netIncomeParent', direction: up(NI1, NI0) }] : [])] },
    { slide: 'outlook', text: TEXT.outlook(spec.company, fNS > aNS, fOI > aOI), claims: [
      { metric: 'forecastNetSales', direction: up(x10(fNS), x10(aNS)) }, { metric: 'forecastOperatingIncome', direction: up(x10(fOI), x10(aOI)) }] },
    { slide: 'supplement', text: cf.operatingCashFlow > 0 ? TEXT.ocf(spec.company) : TEXT.ocf(spec.company).replace('プラス', 'マイナス'), claims: [{ metric: 'operatingCashFlow', direction: cf.operatingCashFlow > 0 ? 'up' : 'down' }] },
  ];
  if (P.pays && divCur !== divPrev) {
    ir.statements.push({ slide: 'highlights', text: divCur > divPrev ? TEXT.divUp(spec.company) : TEXT.divDown(spec.company), claims: [{ metric: 'dividend', direction: divCur > divPrev ? 'up' : 'down' }] });
  }

  const problem = {
    id: spec.id, difficulty: 'hard', companyId: spec.company, fiscalYear: spec.fiscalYear,
    tanshin, ir, anomaly: null,
  };
  return { problem, state: { PL1, BS1, sg1, divCur, intCur } };
}

/** 正常な問題を指定の順に作る (会社ごとに期は 1 つなので、前期からのつなぎ (prev) は使わない)。 */
export function genAll(specs: NormalSpec[]): any[] {
  return specs.map((s) => genNormal(s).problem);
}

// 会社の口調 (companies.md §5.3) に合わせた IR の文。主張は claims に持つ。程度の語は使わない。
const TEXT = {
  highlights: (c: string, w: string) => {
    const t: Record<string, string> = {
      c01: `当期は${w}となった。装置・部品・保守の 3 事業で受注を積み上げた。`, c02: `当期は${w}となりました。家庭用・業務用ともに、引き続き取り組んでまいりました。`, c03: `当期: ${w}。既存店と新店の両方で売場を見直した。`,
      c04: `当期は${w}。サービスの提供を継続し、基盤を活かして進めた。`, c05: `当期は${w}であった。開発の進捗は引き続き慎重に見ている。`, c06: `当期は${w}。安全と品質を最優先とした施工を継続。`,
      c07: `当期は${w}となった。便数と稼働を維持し、運行を続けた。`, c08: `当期は${w}となりました。保有資産の運営を着実に進めてまいりました。`, c09: `当期は${w}となりました。生徒一人ひとりに向き合い、運営を続けてまいりました。`, c10: `当期は${w}。取扱高は各セグメントの動向を反映した。`,
    };
    return t[c] as string;
  },
  outlook: (c: string, ns: boolean, oi: boolean) => {
    const w = ns && oi ? '増収増益' : ns ? '増収減益' : oi ? '減収増益' : '減収減益';
    const t: Record<string, string> = {
      c01: `次期は${w}を見込む。`, c02: `次期は${w}を見込んでおります。`, c03: `次期予想: ${w}。`, c04: `次期は${w}を計画している。`, c05: `次期は${w}を見込むが、開発の結果により変動する可能性がある。`,
      c06: `次期は${w}の見通し。`, c07: `次期は${w}を見込んでいる。`, c08: `次期は${w}を見込んでおります。`, c09: `次期は${w}を見込んでおります。`, c10: `次期は${w}を見込む。`,
    };
    return t[c] as string;
  },
  ocf: (c: string) => ({ c01: '営業活動によるキャッシュ・フローはプラスであった。', c02: '営業活動によるキャッシュ・フローはプラスとなりました。', c03: '営業キャッシュ・フロー: プラス。', c04: '営業活動によるキャッシュ・フローはプラス。', c05: '営業活動によるキャッシュ・フローはプラスであった。', c06: '営業キャッシュ・フローはプラス。', c07: '営業活動によるキャッシュ・フローはプラスとなった。', c08: '営業活動によるキャッシュ・フローはプラスとなりました。', c09: '営業活動によるキャッシュ・フローはプラスとなりました。', c10: '営業活動によるキャッシュ・フローはプラスであった。' } as Record<string, string>)[c] as string,
  divUp: (c: string) => (c === 'c02' || c === 'c08' || c === 'c09' ? '年間配当は増配となりました。' : '年間配当は増配とした。'),
  divDown: (c: string) => (c === 'c02' || c === 'c08' || c === 'c09' ? '年間配当は減配となりました。' : '年間配当は減配とした。'),
};
