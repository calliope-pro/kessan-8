# -*- coding: utf-8 -*-
"""会社ごとの数字の方針 (docs/plans/problems-easy.md §3)。companies.md の §5.1・§5.2 の目安を、整合の規則 (検証器) を満たす範囲の係数にしたもの。
数字は架空で、実在の会社・同業の平均ではない。"""

# 会社の設定 (docs/plans/companies.md §4・§5)。src/data/companies.json (別の PR) が入ったら、gen.py はそちらを読む。
COMPANIES = {
    'c01': dict(name='ミオトリ精機株式会社', securitiesCode='0801', industry='精密機器', segmentNames=['装置', '部品', '保守サービス'], fiscalYearEndMonth=3, irUnit='百万円', emblem='◆', main='#1F4E79', light='#E6EEF5', business='工場向けの位置決め装置と部品を作り、保守サービスも手がける会社'),
    'c02': dict(name='クレセラ食品株式会社', securitiesCode='0802', industry='食料品', segmentNames=['家庭用', '業務用'], fiscalYearEndMonth=3, irUnit='百万円', emblem='●', main='#A8431A', light='#F8EBE5', business='冷凍の惣菜や乳製品を、家庭用と業務用に作って売る会社'),
    'c03': dict(name='ソルベリマート株式会社', securitiesCode='0803', industry='小売業', segmentNames=['食品小売', '衣料・生活雑貨', 'テナント・金融'], fiscalYearEndMonth=2, irUnit='億円', emblem='■', main='#0B6E4F', light='#E4F1EC', business='食品や衣料、生活雑貨の店を運営し、テナントへの貸出も行う会社'),
    'c04': dict(name='ゼノメアシステムズ株式会社', securitiesCode='0804', industry='情報・通信業', segmentNames=['クラウド', '受託開発'], fiscalYearEndMonth=9, irUnit='百万円', emblem='▲', main='#5B3FA8', light='#EEEAF7', business='企業向けの業務ソフトをクラウドで提供し、受託開発も行う会社'),
    'c05': dict(name='ブルネラ製薬株式会社', securitiesCode='0805', industry='医薬品', segmentNames=['医療用医薬品', '一般用医薬品'], fiscalYearEndMonth=12, irUnit='億円', emblem='✚', main='#A3243B', light='#F7E7EA', business='病院で使う医療用医薬品と、薬局で買える一般用医薬品を作る会社'),
    'c06': dict(name='トラウネ建設株式会社', securitiesCode='0806', industry='建設業', segmentNames=['建築', '土木', '開発'], fiscalYearEndMonth=3, irUnit='億円', emblem='⬢', main='#7A4B00', light='#F3EBDD', business='建築と土木の工事を請け負い、開発事業も行う会社'),
    'c07': dict(name='ザルツァ運輸株式会社', securitiesCode='0807', industry='陸運業', segmentNames=['貨物輸送', '倉庫・センター運営'], fiscalYearEndMonth=6, irUnit='百万円', emblem='◐', main='#12687A', light='#E3F0F2', business='トラックで荷物を運ぶ貨物輸送と、倉庫・物流センターの運営を行う会社'),
    'c08': dict(name='セレニア不動産株式会社', securitiesCode='0808', industry='不動産業', segmentNames=['賃貸', '分譲', '管理'], fiscalYearEndMonth=12, irUnit='億円', emblem='◇', main='#3D4A5C', light='#E7EAEE', business='オフィスビルや住宅の賃貸と分譲を行い、管理も請け負う会社'),
    'c09': dict(name='キュルネ教育株式会社', securitiesCode='0809', industry='サービス業', segmentNames=['学習塾', '通信講座'], fiscalYearEndMonth=3, irUnit='百万円', emblem='★', main='#A12B7C', light='#F6E6F0', business='学習塾を運営し、自宅で学べる通信講座も提供する会社'),
    'c10': dict(name='ヨクトス商事株式会社', securitiesCode='0810', industry='卸売業', segmentNames=['機械・資材', '食品原料', '化成品'], fiscalYearEndMonth=3, irUnit='億円', emblem='▼', main='#5C6B1E', light='#EDF0E2', business='機械・資材、食品原料、化成品を国内外で仕入れて販売する会社'),
}

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
