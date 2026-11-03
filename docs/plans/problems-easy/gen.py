# -*- coding: utf-8 -*-
"""やさしい 25 問 + 見本の正常な資料を作る (Sub-task #70)。標準ライブラリのみ。
使いかた: python3 docs/plans/problems-easy/gen.py [--out <出力先のディレクトリ>] [--companies <companies.json>]
spec.json (設計表) の会社 × 期 × 疑わしく見える要素から、整合の規則 (検証器 src/verifier/) をすべて満たす資料束を作る。
会社ごとに 1 本の時系列 (前の期の当期 = 次の期の前期) で作る。乱数は会社 id から作った種で、同じ入力から同じ JSON が出る。
金額は百万円の整数。IR の単位が億円の会社は、金額を 10 の倍数にして、百万円 ÷ 100 の四捨五入が誤差を出さないようにする。
"""
import argparse
import calendar
import datetime
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from profiles import BASE_YEAR, PROFILES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
NONE_TEXT = '該当事項はありません。'
AUDIT_NOTE = '決算短信は公認会計士又は監査法人の監査の対象外です'


def rha(num, den):
    """num ÷ den を、0.5 を絶対値の大きい側へ丸めた整数 (検証器の roundHalfAway)。"""
    neg = (num < 0) != (den < 0)
    n, d = abs(num), abs(den)
    q = (2 * n + d) // (2 * d)
    return -q if neg else q


def tenths(x):
    return int(round(x * 10))


class Co:
    """1 社の設定と係数。"""

    def __init__(self, cid, companies):
        self.id = cid
        self.c = companies[cid]
        self.p = PROFILES[cid]
        self.q = 10 if self.c['irUnit'] == '億円' else 1
        self.rng = random.Random('kessan-easy-' + cid)

    def rq(self, x):
        """q の倍数に丸める。"""
        return int(round(x / self.q)) * self.q

    def ir(self, millions):
        """百万円 → IR の単位の値。億円は ÷100 を小数第一位まで (q = 10 なので誤差なし)。"""
        return round(rha(millions, 10) / 10, 1) if self.c['irUnit'] == '億円' else millions

    def ir10(self, millions):
        return rha(millions, 10) if self.c['irUnit'] == '億円' else millions * 10


def base_state(co):
    """基準年の前期の状態 (貸借・損益・配当・セグメント)。"""
    p, rq = co.p, co.rq
    sales = rq(p['sales0'])
    gp = rq(sales * p['gm'])
    cogs = sales - gp
    op = rq(sales * p['om'])
    sga = gp - op
    # 貸借
    rec = rq(sales * p['rec'] / 365)
    inv = rq(cogs * p['inv'] / 365)
    pay = rq(cogs * p['pay'] / 365)
    ocl = rq(sales * p['ocl'])
    oca = rq(sales * 0.015)
    cash = rq(sales * p['cash'])
    tang = rq(sales * p['tang'])
    invest = rq(sales * 0.05)
    nonop_in = rq(sales * p['nonop_in'])
    cur_assets = cash + rec + inv + oca
    total_assets = cur_assets + tang + invest
    equity = rq(total_assets * p['eq'])
    capital_stock = rq(equity * 0.16)
    capital_surplus = rq(equity * 0.12)
    re = equity - capital_stock - capital_surplus
    short = 0 if p.get('nodebt') else rq(total_assets * p.get('short', 0.03))
    tax_payable = rq(sales * 0.004)
    if p.get('nodebt'):
        # 有利子負債が無い会社: 契約負債など (その他流動負債) で貸借を合わせる
        ocl = total_assets - equity - pay - tax_payable
        ltd = 0
    else:
        cur_liab_wo = pay + short + tax_payable + ocl
        ltd = total_assets - equity - cur_liab_wo
    assert ltd >= 0 and ocl > 0, (co.id, ltd, ocl)
    nonop_exp = rq((short + ltd) * p['int_rate'])
    ordinary = op + nonop_in - nonop_exp
    tax = rq(ordinary * 0.31)
    ni = ordinary - tax
    bs = dict(cash=cash, receivables=rec, inventories=inv, otherCurrentAssets=oca, tangibleAssets=tang, investments=invest,
              payables=pay, shortTermDebt=short, incomeTaxesPayable=tax_payable, otherCurrentLiabilities=ocl, longTermDebt=ltd,
              capitalStock=capital_stock, capitalSurplus=capital_surplus, retainedEarnings=re, nonControllingInterests=0)
    is_ = dict(netSales=sales, costOfSales=cogs, sga=sga, nonOperatingIncome=nonop_in, nonOperatingExpenses=nonop_exp,
               extraordinaryGain=0, extraordinaryLoss=0, incomeTaxes=tax, netIncomeNonControlling=0)
    shares = p['shares']
    eps = ni * 1000 / shares
    dps = 0 if p['payout'] == 0 else max(1, int(round(eps * p['payout'] / 100)))
    segs = split_segments(co, sales, op, 0)
    return dict(bs=bs, is_=is_, dps=dps, segs=segs)


def split_segments(co, sales, op, loss_index, adjust_ratio=0.03):
    """売上高と営業利益をセグメントに分ける。loss_index > 0 のとき、その番号 (1 始まり) のセグメントを赤字にする。"""
    rq = co.rq
    seg = co.p['seg']
    n = len(seg)
    adj = -rq(abs(op) * adjust_ratio)
    segment_total = op - adj  # セグメント利益の合計
    # 売上高
    sales_list = [rq(sales * s) for s, _ in seg[:-1]]
    sales_list.append(sales - sum(sales_list))
    # 利益: 売上 × 相対利益率の重みで配分
    if loss_index:
        li = loss_index - 1
        loss = -rq(abs(segment_total) * 0.06)
        rest = segment_total - loss
        weights = [sales_list[i] * seg[i][1] if i != li else 0 for i in range(n)]
        wsum = sum(weights)
        profits = [rq(rest * w / wsum) if i != li else loss for i, w in enumerate(weights)]
        # 余りを最大のセグメントに寄せる
        diff = segment_total - sum(profits)
        k = max((i for i in range(n) if i != li), key=lambda i: weights[i])
        profits[k] += diff
    else:
        weights = [sales_list[i] * seg[i][1] for i in range(n)]
        wsum = sum(weights)
        profits = [rq(segment_total * w / wsum) for w in weights[:-1]]
        profits.append(segment_total - sum(profits))
    return dict(sales=sales_list, profits=profits, adjustment=adj)


def step(co, prev, year, knobs):
    """前期の状態 prev から、year 年の決算期の状態と、出力用の数字を作る。
    疑わしく見える要素を付けない年は、利益の増減率が ±20% に収まるまで乱数を引き直す (異変の問題の土台が、目立つ増減を持たないように)。"""
    ni_prev = prev['is_']['netSales'] - prev['is_']['costOfSales'] - prev['is_']['sga'] + prev['is_']['nonOperatingIncome'] - prev['is_']['nonOperatingExpenses'] \
        + prev['is_']['extraordinaryGain'] - prev['is_']['extraordinaryLoss'] - prev['is_']['incomeTaxes']
    for _ in range(200):
        state, cf, extra = _step(co, prev, year, knobs)
        i = state['is_']
        ni = i['netSales'] - i['costOfSales'] - i['sga'] + i['nonOperatingIncome'] - i['nonOperatingExpenses'] + i['extraordinaryGain'] - i['extraordinaryLoss'] - i['incomeTaxes']
        if knobs or prev.get('flag_big') or abs(ni - ni_prev) / ni_prev < 0.20:
            state['flag_big'] = 'big-change' in knobs
            return state, cf, extra
    raise SystemExit(f'{co.id} {year}: 利益の増減が収まらない')


def _step(co, prev, year, knobs):
    p, rq = co.p, co.rq
    rng = co.rng
    pb, pi = prev['bs'], prev['is_']
    lo, hi = p['growth']
    g = rng.uniform(lo, hi) / 100
    if 'big-change' in knobs:
        g = 0.04
    sales = rq(pi['netSales'] * (1 + g))
    gm = p['gm'] + rng.uniform(-0.004, 0.004)
    om = p['om'] + rng.uniform(-0.004, 0.006)
    if 'big-change' in knobs:
        om = p['om'] * 0.62  # 純利益が大きく減る (増減率 −35% 前後)
    gp = rq(sales * gm)
    cogs = sales - gp
    op = rq(sales * om)
    sga = gp - op
    short_cur = pb['shortTermDebt']
    nonop_in = rq(sales * p['nonop_in'])
    nonop_exp = rq((pb['shortTermDebt'] + pb['longTermDebt']) * p['int_rate'])
    gain = loss = 0
    if 'extraordinary-loss' in knobs:
        loss = rq(sales * 0.012)
    if 'extraordinary-gain' in knobs:
        gain = rq(sales * 0.010)  # 受取保険金・補助金収入など (現金で受け取り、資産は動かない)
    ordinary = op + nonop_in - nonop_exp
    ibt = ordinary + gain - loss
    tax = rq(ibt * 0.31)
    ni = ibt - tax
    # 貸借 (運転資本)
    rec = rq(sales * p['rec'] / 365)
    inv = rq(cogs * p['inv'] / 365)
    pay = rq(cogs * p['pay'] / 365)
    ocl = rq(pb['otherCurrentLiabilities'] * sales / pi['netSales']) if p.get('nodebt') else rq(sales * p['ocl'])
    oca = rq(sales * 0.015)
    tax_payable = rq(tax * 0.5)
    invest = rq(pb['investments'] * 1.02)
    # 固定資産
    dep = rq(pb['tangibleAssets'] * p['dep'])
    capex = rq(dep * 1.08)
    if 'capex-large' in knobs:
        capex = rq(dep * 2.6)
    tang = pb['tangibleAssets'] + capex - dep
    # 配当
    shares = p['shares']
    div_paid = (prev['dps'] * shares) // 1000  # 前期の期末配当 (中間配当は置かない)
    eps100 = rha(ni * 100000, shares)
    dps = choose_dps(co, prev['dps'], ni, shares, knobs)
    # キャッシュ・フロー
    d_rec, d_inv, d_pay = rec - pb['receivables'], inv - pb['inventories'], pay - pb['payables']
    d_oca, d_ocl = oca - pb['otherCurrentAssets'], ocl - pb['otherCurrentLiabilities']
    d_taxp = tax_payable - pb['incomeTaxesPayable']
    div_paid_pre = (prev['dps'] * shares) // 1000
    d_invest = invest - pb['investments']
    cf = dict(incomeBeforeTax=ibt, depreciation=dep, interestDividendIncome=-nonop_in, interestExpense=nonop_exp,
              receivablesChange=-d_rec, inventoriesChange=-d_inv, payablesChange=d_pay, otherAssetsChange=-d_oca, otherLiabilitiesChange=d_ocl)
    subtotal = sum(cf.values())
    cf['subtotal'] = subtotal
    cf.update(interestDividendReceived=nonop_in, interestPaid=-nonop_exp, incomeTaxesPaid=-(tax - d_taxp))
    ocf = subtotal + cf['interestDividendReceived'] + cf['interestPaid'] + cf['incomeTaxesPaid']
    cf['operatingCashFlow'] = ocf
    if p.get('nodebt'):
        # 借入れが無い会社は、余ったお金を投資その他の資産 (有価証券など) に回して、現金を目標に保つ
        target = rq(sales * p['cash'])
        d_invest = rq(pb['cash'] + ocf - capex - div_paid_pre - target)
        invest = pb['investments'] + d_invest
        cf['otherInvestingChange'] = -d_invest
    cf.update(capex=-capex, otherInvestingChange=-d_invest)
    icf = -capex - d_invest
    cf['investingCashFlow'] = icf
    # 財務: 現金が目標になるように長期借入れを決める
    repay = rq(pb['longTermDebt'] * 0.07)
    target_cash = rq(sales * p['cash'])
    short_change = short_cur - pb['shortTermDebt']
    need = target_cash - pb['cash'] - ocf - icf  # 財務活動で足したい額
    borrow = need - short_change + repay + div_paid
    borrow = max(0, rq(borrow))
    if p.get('nodebt'):
        borrow = repay = 0
    ltd = pb['longTermDebt'] + borrow - repay
    fcf = short_change + borrow - repay - div_paid
    cf.update(shortTermDebtChange=short_change, longTermBorrowings=borrow, longTermRepayments=-repay, dividendsPaid=-div_paid, financingCashFlow=fcf, fxEffect=0)
    net = ocf + icf + fcf
    cash = pb['cash'] + net
    cf.update(netChangeInCash=net, cashBeginning=pb['cash'], cashEnding=cash)
    re = pb['retainedEarnings'] + ni - div_paid
    bs = dict(cash=cash, receivables=rec, inventories=inv, otherCurrentAssets=oca, tangibleAssets=tang, investments=invest,
              payables=pay, shortTermDebt=short_cur, incomeTaxesPayable=tax_payable, otherCurrentLiabilities=ocl, longTermDebt=ltd,
              capitalStock=pb['capitalStock'], capitalSurplus=pb['capitalSurplus'], retainedEarnings=re, nonControllingInterests=0)
    is_ = dict(netSales=sales, costOfSales=cogs, sga=sga, nonOperatingIncome=nonop_in, nonOperatingExpenses=nonop_exp,
               extraordinaryGain=gain, extraordinaryLoss=loss, incomeTaxes=tax, netIncomeNonControlling=0)
    segs = split_segments(co, sales, op, len(p['seg']) if 'segment-loss' in knobs else 0)
    return dict(bs=bs, is_=is_, dps=dps, segs=segs), cf, dict(eps100=eps100)


def choose_dps(co, prev_dps, ni, shares, knobs):
    """配当金 (1 株当たり、円)。配当性向の表示値と、配当金総額 ÷ 純利益が小数第一位まで一致するものを選ぶ。"""
    p = co.p
    if p['payout'] == 0 or 'no-dividend' in knobs:
        return 0
    eps = ni * 1000 / shares
    target = eps * p['payout'] / 100
    if 'dividend-cut' in knobs:
        target = prev_dps * 0.7
    elif prev_dps:
        target = (target + prev_dps) / 2  # 配当は急には動かさない
    cands = sorted({max(1, int(round(target)) + d) for d in range(-6, 7)}, key=lambda x: abs(x - target))
    if 'dividend-cut' not in knobs and prev_dps:
        cands = [d for d in cands if d >= prev_dps]  # 要素なしの年は減配しない
    eps100 = rha(ni * 100000, shares)
    for d in cands:
        if 'dividend-cut' in knobs and d >= prev_dps * 0.85:
            continue
        total = (d * shares) // 1000
        payout = rha(d * 100 * 1000, eps100)
        if payout == rha(total * 1000, ni):
            return d
    raise SystemExit(f'{co.id}: 配当性向が一致する配当が見つからない')


def last_day(year, month):
    return calendar.monthrange(year, month)[1]


def build_problem(co, pid, difficulty, year, prev, cur, cf, extra, knobs, tier):
    """出力用の Problem (正常) を組み立てる。"""
    c, p = co.c, co.p
    pb, cb = prev['bs'], cur['bs']
    pis, cis = prev['is_'], cur['is_']

    def bs_full(b):
        ca = b['cash'] + b['receivables'] + b['inventories'] + b['otherCurrentAssets']
        fa = b['tangibleAssets'] + b['investments']
        cl = b['payables'] + b['shortTermDebt'] + b['incomeTaxesPayable'] + b['otherCurrentLiabilities']
        tl = cl + b['longTermDebt']
        se = b['capitalStock'] + b['capitalSurplus'] + b['retainedEarnings']
        na = se + b['nonControllingInterests']
        return dict(cash=b['cash'], receivables=b['receivables'], inventories=b['inventories'], otherCurrentAssets=b['otherCurrentAssets'],
                    totalCurrentAssets=ca, tangibleAssets=b['tangibleAssets'], investments=b['investments'], totalFixedAssets=fa, totalAssets=ca + fa,
                    payables=b['payables'], shortTermDebt=b['shortTermDebt'], incomeTaxesPayable=b['incomeTaxesPayable'],
                    otherCurrentLiabilities=b['otherCurrentLiabilities'], totalCurrentLiabilities=cl, longTermDebt=b['longTermDebt'], totalLiabilities=tl,
                    capitalStock=b['capitalStock'], capitalSurplus=b['capitalSurplus'], retainedEarnings=b['retainedEarnings'],
                    totalShareholdersEquity=se, nonControllingInterests=b['nonControllingInterests'], totalNetAssets=na, totalLiabilitiesAndNetAssets=tl + na)

    def is_full(i):
        gp = i['netSales'] - i['costOfSales']
        op = gp - i['sga']
        ordi = op + i['nonOperatingIncome'] - i['nonOperatingExpenses']
        ibt = ordi + i['extraordinaryGain'] - i['extraordinaryLoss']
        ni = ibt - i['incomeTaxes']
        return dict(netSales=i['netSales'], costOfSales=i['costOfSales'], grossProfit=gp, sga=i['sga'], operatingIncome=op,
                    nonOperatingIncome=i['nonOperatingIncome'], nonOperatingExpenses=i['nonOperatingExpenses'], ordinaryIncome=ordi,
                    extraordinaryGain=i['extraordinaryGain'], extraordinaryLoss=i['extraordinaryLoss'], incomeBeforeTax=ibt,
                    incomeTaxes=i['incomeTaxes'], netIncome=ni, netIncomeNonControlling=i['netIncomeNonControlling'], netIncomeParent=ni - i['netIncomeNonControlling'])

    PB, CB, PI, CI = bs_full(pb), bs_full(cb), is_full(pis), is_full(cis)
    shares = p['shares']
    ni = CI['netIncomeParent']
    equity = CB['totalNetAssets'] - CB['nonControllingInterests']
    equity_prev = PB['totalNetAssets'] - PB['nonControllingInterests']
    eps = rha(ni * 100000, shares) / 100
    bps = rha(equity * 100000, shares) / 100
    dps, dps_prev = cur['dps'], prev['dps']
    div_total = (dps * shares) // 1000
    payout = rha(dps * 100 * 1000, rha(ni * 100000, shares)) / 10 if dps else 0.0

    def change(cur_v, prev_v):
        return dict(current=cur_v, previous=prev_v, changeRate=rha((cur_v - prev_v) * 1000, prev_v) / 10)

    policy = 'policy-change' in knobs
    event = 'subsequent-event' in knobs
    policy_note = POLICY_NOTE[co.id] if policy else NONE_TEXT
    event_text, event_ir = (EVENT_NOTE(co), EVENT_IR(co)) if event else (NONE_TEXT, None)

    summary = dict(
        netSales=change(CI['netSales'], PI['netSales']), operatingIncome=change(CI['operatingIncome'], PI['operatingIncome']),
        ordinaryIncome=change(CI['ordinaryIncome'], PI['ordinaryIncome']), netIncomeParent=change(CI['netIncomeParent'], PI['netIncomeParent']),
        operatingMargin=rha(CI['operatingIncome'] * 1000, CI['netSales']) / 10,
        roe=rha(ni * 2000, equity_prev + equity) / 10, eps=eps, totalAssets=CB['totalAssets'], netAssets=CB['totalNetAssets'], equity=equity,
        equityRatio=rha(equity * 1000, CB['totalAssets']) / 10, bps=bps, annualDividend=dps, interimDividend=0, annualDividendPrevious=dps_prev,
        interimDividendPrevious=0, dividendTotal=div_total, payoutRatio=payout, accountingPolicyChange=policy, auditNote=AUDIT_NOTE)

    month = c['fiscalYearEndMonth']
    end = datetime.date(year, month, last_day(year, month))
    pend = datetime.date(year - 1, month, last_day(year - 1, month))
    disclosure = end + datetime.timedelta(days=45)
    meeting = end + datetime.timedelta(days=88)
    ds = lambda d: d.isoformat()  # noqa: E731
    seg_prev, seg_cur = prev['segs'], cur['segs']
    names = c['segmentNames']

    def seg_info(sg, i_):
        return dict(segments=[dict(name=names[k], netSales=sg['sales'][k], profit=sg['profits'][k]) for k in range(len(names))],
                    adjustment=sg['adjustment'], consolidatedNetSales=i_['netSales'], consolidatedOperatingIncome=i_['operatingIncome'])

    tanshin = dict(
        header=dict(companyName=c['name'], securitiesCode=c['securitiesCode'], periodLabel=f"{year}年{month}月期", unit='百万円'),
        summary=summary,
        dates=dict(periodEnd=ds(end), previousPeriodEnd=ds(pend), disclosure=ds(disclosure), shareholdersMeeting=ds(meeting)),
        columnDates=dict(balanceSheet=dict(previous=ds(pend), current=ds(end)), incomeStatement=dict(previous=ds(pend), current=ds(end)),
                         cashFlow=dict(previous=ds(pend), current=ds(end))),
        balanceSheet=dict(previous=PB, current=CB), incomeStatement=dict(previous=PI, current=CI),
        cashFlow=cf_full(cf),
        notes=dict(goingConcern=NONE_TEXT, cashScope='現金及び預金', segments=dict(previous=seg_info(seg_prev, PI), current=seg_info(seg_cur, CI)),
                   averageSharesThousand=shares, bps=bps, eps=eps, subsequentEvents=event_text, accountingPolicyNote=policy_note),
    )

    ir = co.ir
    ir10 = co.ir10
    unit = c['irUnit']
    hl = {m: dict(amount=ir(CI[m]), changeRate=summary[m]['changeRate']) for m in ('netSales', 'operatingIncome', 'ordinaryIncome', 'netIncomeParent')}
    hl.update(annualDividend=dps, payoutRatio=payout)
    results = dict(
        netSales=dict(previous=ir(PI['netSales']), current=ir(CI['netSales'])), grossProfit=dict(previous=ir(PI['grossProfit']), current=ir(CI['grossProfit'])),
        grossMargin=dict(previous=rha(PI['grossProfit'] * 1000, PI['netSales']) / 10, current=rha(CI['grossProfit'] * 1000, CI['netSales']) / 10),
        operatingIncome=dict(previous=ir(PI['operatingIncome']), current=ir(CI['operatingIncome'])),
        operatingMargin=dict(previous=rha(PI['operatingIncome'] * 1000, PI['netSales']) / 10, current=rha(CI['operatingIncome'] * 1000, CI['netSales']) / 10))
    results['chart'] = dict(netSales=dict(axisMin=0, previous=results['netSales']['previous'], current=results['netSales']['current']),
                            operatingIncome=dict(axisMin=0, previous=results['operatingIncome']['previous'], current=results['operatingIncome']['current']))
    items = []
    for k in range(len(names)):
        sp, sc = seg_prev['sales'][k], seg_cur['sales'][k]
        pp, pc = seg_prev['profits'][k], seg_cur['profits'][k]
        profit_rate = rha((pc - pp) * 1000, pp) / 10 if pp > 0 else 0.0
        items.append(dict(name=names[k], netSales=dict(previous=ir(sp), current=ir(sc), changeRate=rha((sc - sp) * 1000, sp) / 10),
                          profit=dict(previous=ir(pp), current=ir(pc), changeRate=profit_rate), salesShare=rha(sc * 1000, CI['netSales']) / 10))
    segments = dict(items=items, adjustment=dict(previous=ir(seg_prev['adjustment']), current=ir(seg_cur['adjustment'])),
                    consolidatedOperatingIncome=dict(previous=ir(PI['operatingIncome']), current=ir(CI['operatingIncome'])))
    # 見通し
    fg = max(0.5, min(5.0, co.rng.uniform(1.0, 5.0)))
    fo = co.rng.uniform(-0.5, 0.8)
    f_sales = co.rq(CI['netSales'] * (1 + fg / 100))
    f_op = co.rq(CI['operatingIncome'] * (1 + fo / 10))
    if 'big-change' in knobs:
        f_op = co.rq(CI['operatingIncome'] * 1.18)
    a_sales10, a_op10 = ir10(CI['netSales']), ir10(CI['operatingIncome'])
    capex_act = -cf['capex']
    outlook = dict(
        forecast=dict(netSales=ir(f_sales), netSalesChangeRate=rha((ir10(f_sales) - a_sales10) * 1000, a_sales10) / 10,
                      operatingIncome=ir(f_op), operatingIncomeChangeRate=rha((ir10(f_op) - a_op10) * 1000, a_op10) / 10,
                      capex=ir(co.rq(capex_act * 1.05)), depreciation=ir(co.rq(cf['depreciation'] * 1.04)), annualDividend=dps),
        actual=dict(netSales=ir(CI['netSales']), operatingIncome=ir(CI['operatingIncome']), capex=ir(capex_act), depreciation=ir(cf['depreciation'])),
        subsequentEvent=event_ir)
    debt_cur, debt_prev = CB['shortTermDebt'] + CB['longTermDebt'], PB['shortTermDebt'] + PB['longTermDebt']
    supplement = dict(
        capex=dict(previous=None, current=ir(capex_act)), depreciation=dict(previous=None, current=ir(cf['depreciation'])),
        interestBearingDebt=dict(previous=ir(debt_prev), current=ir(debt_cur)), cash=dict(previous=ir(PB['cash']), current=ir(CB['cash'])),
        netDebt=dict(previous=(ir10(debt_prev) - ir10(PB['cash'])) / 10, current=(ir10(debt_cur) - ir10(CB['cash'])) / 10),
        equityRatio=summary['equityRatio'])
    statements = make_statements(co, CI, PI, f_sales, CI['netSales'], f_op, CI['operatingIncome'], cf['operatingCashFlow'], ir10)
    ir_deck = dict(header=dict(companyName=c['name'], securitiesCode=c['securitiesCode'], periodLabel=f"{year}年{month}月期", unit=unit),
                   highlights=hl, results=results, segments=segments, outlook=outlook, supplement=supplement, statements=statements)
    return dict(id=pid, difficulty=difficulty, companyId=co.id, fiscalYear=year, tier=tier, tanshin=tanshin, ir=ir_deck, anomaly=None)


def cf_full(cf):
    order = ['incomeBeforeTax', 'depreciation', 'interestDividendIncome', 'interestExpense', 'receivablesChange', 'inventoriesChange', 'payablesChange',
             'otherAssetsChange', 'otherLiabilitiesChange', 'subtotal', 'interestDividendReceived', 'interestPaid', 'incomeTaxesPaid', 'operatingCashFlow',
             'capex', 'otherInvestingChange', 'investingCashFlow', 'shortTermDebtChange', 'longTermBorrowings', 'longTermRepayments', 'dividendsPaid',
             'financingCashFlow', 'fxEffect', 'netChangeInCash', 'cashBeginning', 'cashEnding']
    return {k: cf[k] for k in order}


# 会計方針の変更の注記・後発事象 (summary.accountingPolicyChange と注記、notes.subsequentEvents と IR の期末後の出来事を整合させる)。
POLICY_NOTE = {
    'c02': '当期から、棚卸資産の評価方法を総平均法から移動平均法に変更しています。この変更による損益への影響は軽微です。',
    'c08': '当期から、有形固定資産の減価償却の方法を定率法から定額法に変更しています。この変更による損益への影響は軽微です。',
}


# 後発事象 (会社ごとの文と金額。百万円。億円の会社は IR に ÷100 で書く)
EVENTS = {
    'c01': ('新たな部品工場の増設に関する契約を締結しました', 900),
    'c02': ('冷凍食品の新たな製造ラインの導入に関する契約を締結しました', 700),
    'c03': ('新たな店舗用地の取得に関する契約を締結しました', 2600),
    'c04': ('データセンターの利用拡張に関する契約を締結しました', 400),
    'c05': ('研究用の新施設の建設に関する契約を締結しました', 800),
    'c06': ('自社開発の用地の取得に関する契約を締結しました', 3000),
    'c07': ('新たな物流拠点の建設に関する契約を締結しました', 1200),
    'c08': ('賃貸用ビルの取得に関する契約を締結しました', 3500),
    'c09': ('新たな教室の開設に伴う賃貸借契約を締結しました', 300),
    'c10': ('化成品の保管施設の取得に関する契約を締結しました', 1500),
}


def EVENT_NOTE(co):
    what, amt = EVENTS[co.id]
    return f'期末後に、{what}。契約金額は {amt:,} 百万円です。'


def EVENT_IR(co):
    what, amt = EVENTS[co.id]
    what = what.replace('しました', 'した')
    if co.c['irUnit'] == '億円':
        return f'期末後に、{what} (契約金額 {amt / 100:.1f} 億円)'
    return f'期末後に、{what} (契約金額 {amt:,} 百万円)'


def sgn(x):
    return 1 if x > 0 else -1


TONE = {
    # 会社ごとの口調 (docs/plans/companies.md §5.3)。(増・減) の語と、文の型。
    'c01': dict(up='上回った', down='下回った', fmt=lambda a, b: f'売上高は前期を{a}。営業利益は前期を{b}。', out=lambda a, b: f'次期は{a}{b}を見込む。', cash={1: '営業キャッシュ・フローは堅調であった。'}),
    'c02': dict(up='上回りました', down='下回りました', fmt=lambda a, b: f'おかげさまで、売上高は前期を{a}。営業利益は前期を{b}。', out=lambda a, b: f'次期は{a}{b}を見込んでいます。', cash={1: '営業キャッシュ・フローは安定しました。'}),
    'c03': dict(up='増', down='減', fmt=lambda a, b: f'売上高 前期比{a}。営業利益 前期比{b}。', out=lambda a, b: f'次期見通し: {a}{b}。', cash={1: '営業 CF は黒字。'}),
    'c04': dict(up='伸びた', down='縮んだ', fmt=lambda a, b: f'売上高は前期より{a}。営業利益は前期より{b}。', out=lambda a, b: f'次期は{a}{b}を目指し、拡大を加速する。', cash={1: '営業キャッシュ・フローは良好に推移した。'}),
    'c05': dict(up='上回った', down='下回った', fmt=lambda a, b: f'売上高は前期を{a}。営業利益は前期を{b}。研究開発の進捗はリスクとあわせて別に示す。', out=lambda a, b: f'次期は{a}{b}となる見込みであるが、承認の時期により変動する可能性がある。', cash={1: '営業キャッシュ・フローは黒字を確保した。'}),
    'c06': dict(up='増加', down='減少', fmt=lambda a, b: f'売上高は前期比{a}。営業利益は前期比{b}。', out=lambda a, b: f'次期見通し: {a}{b}。', cash={1: '営業キャッシュ・フローは黒字。'}),
    'c07': dict(up='上回った', down='下回った', fmt=lambda a, b: f'売上高は前期を{a}。営業利益は前期を{b}。', out=lambda a, b: f'次期は{a}{b}を見込む。', cash={1: '営業キャッシュ・フローは黒字であった。'}),
    'c08': dict(up='上回りました', down='下回りました', fmt=lambda a, b: f'賃料収入を含む売上高は前期を{a}。営業利益は前期を{b}。', out=lambda a, b: f'次期は{a}{b}を見込んでおります。', cash={1: '営業キャッシュ・フローは着実に積み上がりました。'}),
    'c09': dict(up='上回りました', down='下回りました', fmt=lambda a, b: f'売上高は前期を{a}。営業利益は前期を{b}。', out=lambda a, b: f'次期は{a}{b}を見込んでおります。引き続き、教室の運営体制の強化に取り組んでまいります。', cash={1: '営業キャッシュ・フローは黒字を維持しました。'}),
    'c10': dict(up='増加', down='減少', fmt=lambda a, b: f'取扱高は前期比{a}。営業利益は前期比{b}。', out=lambda a, b: f'次期見通し: {a}{b}。', cash={1: '営業キャッシュ・フローは黒字。'}),
}


def make_statements(co, CI, PI, f_sales, a_sales, f_op, a_op, ocf, ir10):
    t = TONE[co.id]
    s_dir = sgn(CI['netSales'] - PI['netSales'])
    o_dir = sgn(CI['operatingIncome'] - PI['operatingIncome'])
    word = lambda d: t['up'] if d > 0 else t['down']  # noqa: E731
    fs = sgn(ir10(f_sales) - ir10(a_sales))
    fo = sgn(ir10(f_op) - ir10(a_op))
    name = lambda d, kind: ('増' if d > 0 else '減') + kind  # noqa: E731
    d = lambda x: 'up' if x > 0 else 'down'  # noqa: E731
    return [
        dict(slide='highlights', text=t['fmt'](word(s_dir), word(o_dir)), claims=[dict(metric='netSales', direction=d(s_dir)), dict(metric='operatingIncome', direction=d(o_dir))]),
        dict(slide='outlook', text=t['out'](name(fs, '収'), name(fo, '益')), claims=[dict(metric='forecastNetSales', direction=d(fs)), dict(metric='forecastOperatingIncome', direction=d(fo))]),
        dict(slide='supplement', text=t['cash'][1], claims=[dict(metric='operatingCashFlow', direction='up')]),
    ]


def simulate(co, years, knobs_by_year):
    """基準年から years の順に作る。{年: (状態, cf, extra, knobs)} を返す。"""
    state = base_state(co)
    out = {}
    for y in years:
        k = knobs_by_year.get(y, [])
        state, cf, extra = step(co, state, y, k)
        out[y] = (state, cf, extra, k)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=None)
    ap.add_argument('--companies', default='src/data/companies.json', help='会社の設定 (docs/plans/companies.md の 10 社)')
    ap.add_argument('--normals-only', action='store_true', help='異変を入れない (#70 の範囲)')
    ap.add_argument('--base-out', default=None, help='異変の問題の土台 (要素なしの正常) を書く場所。コミットしない')
    args = ap.parse_args()
    spec = json.load(open(os.path.join(HERE, 'spec.json'), encoding='utf-8'))
    companies = {c['id']: c for c in json.load(open(args.companies, encoding='utf-8'))}
    states, built = {}, {}
    for cid in sorted({p['company'] for p in spec['problems']} | {spec['sample']['company']}):
        co = Co(cid, companies)
        knobs_by_year = {p['fiscalYear']: p['elements'] for p in spec['problems'] if p['company'] == cid and p['kind'] is None}
        years = list(range(BASE_YEAR + 1, 2026))
        # 疑わしく見える要素は正常な問題の年にだけ付ける (異変の問題の土台は、要素なしの正常)
        built[cid] = (co, simulate_with_prev(co, years, knobs_by_year))
    out = args.out or 'src/data'
    os.makedirs(os.path.join(out, 'problems', 'easy'), exist_ok=True)
    os.makedirs(os.path.join(out, 'samples'), exist_ok=True)
    written = []
    for p in spec['problems']:
        co, sim = built[p['company']]
        prev, cur, cf, extra, knobs = sim[p['fiscalYear']]
        prob = build_problem(co, p['id'], 'easy', p['fiscalYear'], prev, cur, cf, extra, knobs, p['tier'])
        if p['kind'] is None:
            path = os.path.join(out, 'problems', 'easy', p['id'] + '.json')
            write_json(path, prob)
            written.append(path)
        else:
            if args.base_out:
                write_json(os.path.join(args.base_out, p['id'] + '.json'), prob)
            if not args.normals_only:
                import anomalies  # noqa: E402
                final = anomalies.apply(prob, p, co)
                path = os.path.join(out, 'problems', 'easy', p['id'] + '.json')
                write_json(path, final)
                written.append(path)
    s = spec['sample']
    co, sim = built[s['company']]
    prev, cur, cf, extra, knobs = sim[s['fiscalYear']]
    prob = build_problem(co, 'sample', 'easy', s['fiscalYear'], prev, cur, cf, extra, knobs, None)
    del prob['tier']  # 見本は出題のプールの外
    write_json(os.path.join(out, 'samples', 'sample.json'), dict(problem=prob, notes=sample_notes(prob)))
    if args.base_out:
        write_json(os.path.join(args.base_out, 'sample.json'), prob)
    print(f'{len(written)} 問と見本を {out} に書いた')


def sample_notes(prob):
    """見本の注釈 (画面 ID → 1 文)。確かめた整合を、その資料の数字で述べる。"""
    t, i = prob['tanshin'], prob['ir']
    bs, is_, cf, sm = t['balanceSheet']['current'], t['incomeStatement']['current'], t['cashFlow'], t['summary']
    n = lambda x: f'{x:,}'  # noqa: E731
    return dict(
        summary=f"サマリーの売上高 {n(sm['netSales']['current'])} 百万円は、損益計算書の売上高と同じ数字です。増減率は前期と当期から計算した値です。",
        balanceSheet=f"資産合計 {n(bs['totalAssets'])} 百万円と、負債・純資産合計 {n(bs['totalLiabilitiesAndNetAssets'])} 百万円が一致しています。各合計は内訳の和です。",
        incomeStatement=f"売上高 {n(is_['netSales'])} から売上原価 {n(is_['costOfSales'])} を引いた売上総利益は {n(is_['grossProfit'])} 百万円で、利益は上から順に差引計算でつながっています。",
        cashFlow=f"期末の現金 {n(cf['cashEnding'])} 百万円は、貸借対照表の現金及び預金と同じです。営業・投資・財務の合計が現金の増減額 {n(cf['netChangeInCash'])} 百万円になります。",
        notes=f"セグメントの売上高の合計は、連結の売上高 {n(is_['netSales'])} 百万円に一致します。1 株当たりの数字はサマリーと同じです。",
        highlights="ハイライトの金額は、決算短信の同じ項目と同じ数字です。文章は数字の動きと合っています。",
        results="利益率は売上高と利益から計算した値です。グラフの縦軸は 0 から始まり、棒の高さは数字に比例します。",
        segments="セグメント別の金額は、決算短信の注記と同じです。構成比は、売上高に占める割合です。",
        outlook="当期の実績は決算短信と同じ数字です。次期の予想の前期比は、予想と当期の実績から計算した値です。",
        supplement="設備投資と減価償却費は、キャッシュ・フロー計算書と同じです。純有利子負債は、有利子負債から現金を引いた値です。",
    )


def simulate_with_prev(co, years, knobs_by_year):
    state = base_state(co)
    out = {}
    for y in years:
        k = knobs_by_year.get(y, [])
        new, cf, extra = step(co, state, y, k)
        out[y] = (state, new, cf, extra, k)
        state = new
    return out


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
