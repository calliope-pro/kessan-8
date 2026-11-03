# -*- coding: utf-8 -*-
"""異変を入れる (Sub-task #71)。正常な土台 (gen.py が作る要素なしの正常な問題) の 1 か所を差し替え、場所 (places)・答え合わせの文言 (explanation) を付ける。
1 つの異変は 1 つの原因 (1 つのセル・1 つの文・1 つの図) の変更 (anomalies.md G1)。ずれの大きさは G3: 金額 5 百万円以上かつ対象値の 1% 以上 (億円の会社は 10 の倍数)、% は 1.0 ポイント以上、1 株当たり指標は 1% 以上。
期待集合 (expectedRules) は、検証器を実際に当てて落ちた規則の集合 (EXPECTED)。変えたセルによって変わるので、問題ごとに持つ。
"""
import copy


def n(x):
    return f'{x:,}'


def pct(x):
    return f'{x:.1f}%'


def place(doc, path):
    return dict(doc=doc, path=path)


def swap_digits(v):
    """隣り合う桁を入れ替えて、元と違う、1% 以上離れた数にする。"""
    s = str(v)
    for i in range(len(s) - 1):
        if s[i] != s[i + 1]:
            t = s[:i] + s[i + 1] + s[i] + s[i + 2:]
            w = int(t)
            if abs(w - v) >= max(5, v * 0.01):
                return w
    raise SystemExit(f'桁を入れ替えられない: {v}')


def e01(p, co):
    """転記違い: サマリーの営業利益の隣り合う桁を入れ替える。"""
    s = p['tanshin']['summary']['operatingIncome']
    pl = p['tanshin']['incomeStatement']['current']['operatingIncome']
    s['current'] = swap_digits(pl)
    return ([place('tanshin', 'summary.operatingIncome.current'), place('tanshin', 'incomeStatement.current.operatingIncome')],
            f'サマリーの営業利益は {n(s["current"])} 百万円ですが、損益計算書の営業利益は {n(pl)} 百万円です。数字の並びが入れ替わっています。')


def e02(p, co):
    """桁の取り違え: サマリーの売上高を 10 倍にする。"""
    s = p['tanshin']['summary']['netSales']
    pl = p['tanshin']['incomeStatement']['current']['netSales']
    s['current'] = pl * 10
    return ([place('tanshin', 'summary.netSales.current'), place('tanshin', 'incomeStatement.current.netSales')],
            f'サマリーの売上高は {n(s["current"])} 百万円ですが、損益計算書の売上高は {n(pl)} 百万円です。サマリーの桁が 1 つ多くなっています。')


def e04(p, co):
    """期・日付の食い違い: 貸借対照表の当期末の見出しを 1 年前の日付にする。"""
    end = p['tanshin']['dates']['periodEnd']
    old = p['tanshin']['dates']['previousPeriodEnd']
    p['tanshin']['columnDates']['balanceSheet']['current'] = old
    y, m, d = (int(x) for x in end.split('-'))
    return ([place('tanshin', 'columnDates.balanceSheet.current')],
            f'表題の期は {p["tanshin"]["header"]["periodLabel"]} (期末日 {y}年{m}月{d}日) ですが、貸借対照表の当期末の見出しは {old.split("-")[0]}年{int(old.split("-")[1])}月{int(old.split("-")[2])}日です。')


def e06(p, co):
    """グラフの縦軸が 0 から始まらない: 売上高の棒グラフの下端を、低い方の棒のすぐ下にする。"""
    ch = p['ir']['results']['chart']['netSales']
    low = min(ch['previous'], ch['current'])
    step_ = 500 if low >= 5000 else 100
    axis = int(round(low * 0.96 / step_)) * step_
    ch['axisMin'] = axis
    unit = p['ir']['header']['unit']
    real = (ch['current'] - ch['previous']) / ch['previous'] * 100
    look = (ch['current'] - axis) / (ch['previous'] - axis) * 100 - 100
    return ([place('ir', 'results.chart.netSales.axisMin')],
            f'IR の業績の売上高の棒グラフは、縦軸が 0 ではなく {n(axis)} {unit}から始まっています。前期 {n(ch["previous"])}・当期 {n(ch["current"])} {unit}の実際の差は {real:+.1f}% ですが、棒の高さでは当期が前期より {look:+.1f}% に見え、差が実際より大きく見えます。')


def e08(p, co):
    """社名・証券コードの食い違い: IR の証券コードを 2 桁入れ替える (架空の 08xx の帯の中)。"""
    code = p['tanshin']['header']['securitiesCode']
    new = code[:2] + code[3] + code[2]
    assert new != code
    p['ir']['header']['securitiesCode'] = new
    return ([place('ir', 'header.securitiesCode')],
            f'決算短信の証券コードは {code} ですが、IR スライドの証券コードは {new} です。同じ会社の資料なのに、下 2 桁が入れ替わっています。')


def e09(p, co):
    """貸借の足し算が合わない: 流動資産合計を内訳の和より大きくする。"""
    b = p['tanshin']['balanceSheet']['current']
    total = b['totalCurrentAssets']
    b['totalCurrentAssets'] = total + max(5, int(round(total * 0.04)))
    return ([place('tanshin', 'balanceSheet.current.totalCurrentAssets')],
            f'流動資産合計は {n(b["totalCurrentAssets"])} 百万円ですが、内訳の和は {n(total)} 百万円 (現金及び預金 {n(b["cash"])} + 売掛金 {n(b["receivables"])} + 棚卸資産 {n(b["inventories"])} + その他 {n(b["otherCurrentAssets"])}) です。差は {n(b["totalCurrentAssets"] - total)} 百万円です。')


def e10(p, co):
    """損益の差引計算が合わない: 売上総利益を (売上高 − 売上原価) より大きくする。"""
    i = p['tanshin']['incomeStatement']['current']
    gp = i['grossProfit']
    i['grossProfit'] = gp + co.rq(max(5, gp * 0.03))
    return ([place('tanshin', 'incomeStatement.current.grossProfit')],
            f'売上総利益は 売上高 {n(i["netSales"])} − 売上原価 {n(i["costOfSales"])} = {n(gp)} 百万円になるはずですが、{n(i["grossProfit"])} 百万円と書かれています。')


def e11(p, co):
    """増減率の計算違い: サマリーの経常利益の増減率を 3.0 ポイントずらす。"""
    s = p['tanshin']['summary']['ordinaryIncome']
    right = s['changeRate']
    s['changeRate'] = round(right + 3.0, 1)
    return ([place('tanshin', 'summary.ordinaryIncome.changeRate')],
            f'経常利益の増減率は ({n(s["current"])} − {n(s["previous"])}) ÷ {n(s["previous"])} × 100 = {pct(right)} になるはずですが、{pct(s["changeRate"])} と書かれています。')


def e12(p, co):
    """比率の計算違い: サマリーの自己資本比率を 8.0 ポイント低くする。"""
    s = p['tanshin']['summary']
    right = s['equityRatio']
    s['equityRatio'] = round(right - 8.0, 1)
    return ([place('tanshin', 'summary.equityRatio')],
            f'自己資本比率は 自己資本 {n(s["equity"])} ÷ 総資産 {n(s["totalAssets"])} × 100 = {pct(right)} になるはずですが、{pct(s["equityRatio"])} と書かれています。')


def e13(p, co):
    """セグメントの合計が連結と合わない: 注記の 1 つ目のセグメントの売上高をずらす。"""
    seg = p['tanshin']['notes']['segments']['current']
    first = seg['segments'][0]
    right = first['netSales']
    first['netSales'] = right + co.rq(max(5, right * 0.03))
    total = sum(x['netSales'] for x in seg['segments'])
    names = ' + '.join(f'{n(x["netSales"])}' for x in seg['segments'])
    return ([place('tanshin', 'notes.segments.current.segments.0.netSales')],
            f'セグメントの売上高の合計 ({names} = {n(total)} 百万円) と、連結の売上高 {n(seg["consolidatedNetSales"])} 百万円が一致しません (差 {n(total - seg["consolidatedNetSales"])} 百万円)。')


def e14(p, co):
    """IR の中の計算値が合わない: 1 つ目のセグメントの売上構成比を 5.0 ポイントずらす。"""
    it = p['ir']['segments']['items'][0]
    right = it['salesShare']
    it['salesShare'] = round(right + 5.0, 1)
    t = p['tanshin']
    sales = t['notes']['segments']['current']['segments'][0]['netSales']
    total = t['incomeStatement']['current']['netSales']
    return ([place('ir', 'segments.items.0.salesShare')],
            f'IR のセグメント別で、{it["name"]}の売上構成比は {n(sales)} ÷ {n(total)} × 100 = {pct(right)} になるはずですが、{pct(it["salesShare"])} と書かれています。')


def e16(p, co):
    """1 株当たり指標の計算違い: 1 株当たり当期純利益を 15% 大きくする。"""
    s = p['tanshin']['summary']
    right = s['eps']
    s['eps'] = round(right * 1.15, 2)
    ni = p['tanshin']['incomeStatement']['current']['netIncomeParent']
    sh = p['tanshin']['notes']['averageSharesThousand']
    return ([place('tanshin', 'summary.eps')],
            f'1 株当たり当期純利益は 親会社株主に帰属する当期純利益 {n(ni)} 百万円 ÷ 期中平均株式数 {n(sh)} 千株 = {right:.2f} 円になるはずですが、{s["eps"]:.2f} 円と書かれています。')


def e17(p, co):
    """文章と数字の矛盾: 営業利益の動きを、数字と逆に書く (文章と、その主張を一緒に変える)。"""
    st = p['ir']['statements'][0]
    claim = next(c for c in st['claims'] if c['metric'] == 'operatingIncome')
    t = p['tanshin']['summary']['operatingIncome']
    from gen import TONE  # noqa: E402
    tone = TONE[co.id]
    sales_up = next(c for c in st['claims'] if c['metric'] == 'netSales')['direction'] == 'up'
    now_up = claim['direction'] == 'up'
    flipped = 'down' if now_up else 'up'
    word = lambda up: tone['up'] if up else tone['down']  # noqa: E731
    st['text'] = tone['fmt'](word(sales_up), word(not now_up))
    claim['direction'] = flipped
    shown = '増加' if not now_up else '減少'
    real = '増加' if now_up else '減少'
    return ([place('ir', 'statements.0.text')],
            f'IR のハイライトの文章は営業利益が前期より{shown}したと読めますが、営業利益は {n(t["previous"])} 百万円から {n(t["current"])} 百万円へ{real} ({pct(t["changeRate"])}) しています。')


KINDS = {'E-01': e01, 'E-02': e02, 'E-04': e04, 'E-06': e06, 'E-08': e08, 'E-09': e09, 'E-10': e10, 'E-11': e11, 'E-12': e12, 'E-13': e13, 'E-14': e14, 'E-16': e16, 'E-17': e17}

# 検証器を実際に当てて落ちた規則の集合 (期待集合)。変更したら、作業用の rules-of で出し直す。
EXPECTED = {
    'easy-002': ['sum-change-net-sales', 'sum-net-sales'],
    'easy-003': ['sum-change-operating-income', 'sum-operating-income'],
    'easy-005': ['bs-current-assets', 'bs-total-assets'],
    'easy-008': ['sum-change-ordinary-income'],
    'easy-009': ['ir-results-gross-margin', 'pl-gross-profit', 'pl-operating-income', 'xdoc-results-gross-profit'],
    'easy-011': ['header-securities-code'],
    'easy-012': ['ir-seg-share'],
    'easy-014': ['ratio-equity-ratio', 'xdoc-supp-equity-ratio'],
    'easy-016': ['ir-seg-change-sales', 'ir-seg-share', 'seg-sales-sum', 'xdoc-seg-sales'],
    'easy-018': ['chart-axis-zero'],
    'easy-021': ['check-eps-product', 'notes-per-share', 'ratio-eps', 'ratio-payout'],
    'easy-022': ['dates-column-headings'],
    'easy-024': ['claims-direction'],
}


def apply(base, spec, co):
    p = copy.deepcopy(base)
    places, explanation = KINDS[spec['kind']](p, co)
    p['anomaly'] = dict(kind=spec['kind'], places=places, explanation=explanation, expectedRules=EXPECTED.get(spec['id'], []))
    return p
