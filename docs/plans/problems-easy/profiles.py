# -*- coding: utf-8 -*-
"""会社ごとの数字の方針 (docs/plans/problems-easy.md §3)。companies.md の §5.1・§5.2 の目安を、整合の規則 (検証器) を満たす範囲の係数にしたもの。
数字は架空で、実在の会社・同業の平均ではない。会社の設定 (社名・セグメント名など) は src/data/companies.json が正本で、ここには持たない。"""

# 数字の係数。sales0 = 基準年の売上高 (百万円)、gm = 売上総利益率、om = 営業利益率、eq = 自己資本比率、
# rec/inv/pay = 売上債権・棚卸資産・仕入債務の回転日数 (売上債権は売上高、棚卸資産と仕入債務は売上原価に対して)、
# tang = 有形固定資産 ÷ 売上高、dep = 減価償却率 (期首の有形固定資産に対して)、shares = 期中平均株式数 (千株。1,000 の倍数)、
# payout = 配当性向の目安 (%)、cash = 現金 ÷ 売上高の目安、ocl = その他流動負債 ÷ 売上高、growth = 売上高の増減率の範囲 (%)、
# seg = セグメントの売上構成比と利益の構成 (売上構成比, 利益率の相対値)。
PROFILES = {
    'c01': dict(sales0=34000, gm=0.34, om=0.090, eq=0.58, rec=70, inv=80, pay=45, tang=0.30, dep=0.10, shares=20000, payout=26, cash=0.12, ocl=0.020, nonop_in=0.0025, int_rate=0.012, growth=(0.0, 9.0), seg=[(0.55, 1.1), (0.30, 0.9), (0.15, 0.8)]),
    'c02': dict(sales0=22000, gm=0.30, om=0.042, eq=0.46, rec=40, inv=25, pay=30, tang=0.32, dep=0.09, shares=12000, payout=28, cash=0.11, ocl=0.030, nonop_in=0.002, int_rate=0.012, growth=(-2.0, 7.0), seg=[(0.62, 1.0), (0.38, 1.0)]),
    'c03': dict(sales0=140000, gm=0.28, om=0.036, eq=0.38, rec=5, inv=45, pay=32, tang=0.28, dep=0.08, shares=60000, payout=30, cash=0.06, ocl=0.020, nonop_in=0.0015, int_rate=0.012, growth=(-1.0, 6.0), seg=[(0.58, 0.8), (0.30, 0.9), (0.12, 2.6)]),
    'c04': dict(sales0=10800, gm=0.62, om=0.140, eq=0.62, rec=60, inv=0, pay=22, tang=0.07, dep=0.12, shares=5000, payout=0, cash=0.22, nodebt=True, ocl=0.100, nonop_in=0.003, int_rate=0.012, growth=(2.0, 12.0), seg=[(0.58, 1.3), (0.42, 0.7)]),
    'c05': dict(sales0=42000, gm=0.62, om=0.110, eq=0.71, rec=80, inv=90, pay=40, tang=0.30, dep=0.09, shares=25000, payout=30, cash=0.16, short=0.05, ocl=0.085, nonop_in=0.004, int_rate=0.012, growth=(0.0, 8.0), seg=[(0.66, 1.1), (0.34, 0.8)]),
    'c06': dict(sales0=90000, gm=0.125, om=0.050, eq=0.34, rec=110, inv=14, pay=70, tang=0.11, dep=0.09, shares=40000, payout=30, cash=0.09, ocl=0.020, nonop_in=0.002, int_rate=0.012, growth=(-2.0, 8.0), seg=[(0.45, 1.0), (0.38, 0.9), (0.17, 1.7)]),
    'c07': dict(sales0=57000, gm=0.080, om=0.026, eq=0.24, rec=45, inv=5, pay=20, tang=0.50, dep=0.085, shares=15000, payout=0, cash=0.07, ocl=0.020, nonop_in=0.0015, int_rate=0.012, growth=(-2.0, 6.0), seg=[(0.82, 1.0), (0.18, 1.3)]),
    'c08': dict(sales0=26000, gm=0.46, om=0.170, eq=0.30, rec=20, inv=60, pay=25, tang=1.10, dep=0.035, shares=18000, payout=32, cash=0.10, ocl=0.030, nonop_in=0.002, int_rate=0.012, growth=(-1.0, 7.0), seg=[(0.50, 1.15), (0.30, 1.0), (0.20, 0.7)]),
    'c09': dict(sales0=7600, gm=0.40, om=0.080, eq=0.52, rec=8, inv=0, pay=15, tang=0.24, dep=0.09, shares=4000, payout=30, cash=0.20, ocl=0.050, nonop_in=0.002, int_rate=0.012, growth=(0.0, 9.0), seg=[(0.72, 1.0), (0.28, 1.0)]),
    'c10': dict(sales0=200000, gm=0.080, om=0.018, eq=0.28, rec=75, inv=40, pay=55, tang=0.07, dep=0.09, shares=60000, payout=28, cash=0.05, ocl=0.015, nonop_in=0.0015, int_rate=0.012, growth=(-2.0, 6.0), seg=[(0.48, 0.9), (0.30, 1.2), (0.22, 1.0)]),
}

# 時系列の基準年 (この年は前期として使うだけで、問題にしない)。会社ごとに最初の問題 (または見本) の 1 年前。
BASE_YEAR = 2022
