"""試作 (#10 の副産物): 正常データに異変を 1 つ注入し、検証器が「想定した規則だけ」を落とすかを確かめる。
標準ライブラリのみ。製品のコードではない。使いかた (docs/plans/spike/ で): python3 inject.py [N]

注入 = 1 か所を書き換え、意図した食い違い以外の下流は表示上つじつまが合うように再計算する (遊び手に
「ほかは正常に見える」ようにするため)。異変の種類ごとに、検証器が落とすべき規則の集合を先に決めておく。
"""
import copy
import sys
from collections import Counter

import gen
import pipeline
import verify

N = int(sys.argv[1]) if len(sys.argv) > 1 else 200


def _resum_bs(b):
    b["流動資産合計"] = b["現金及び預金"] + b["売掛金"] + b["棚卸資産"] + b["その他流動資産"]
    b["固定資産合計"] = b["有形固定資産"] + b["投資その他の資産"]
    b["資産合計"] = b["流動資産合計"] + b["固定資産合計"]
    b["流動負債合計"] = b["買掛金"] + b["短期借入金"] + b["未払法人税等"] + b["その他流動負債"]
    b["負債合計"] = b["流動負債合計"] + b["固定負債合計"]
    b["株主資本合計"] = b["資本金"] + b["資本剰余金"] + b["利益剰余金"]
    b["純資産合計"] = b["株主資本合計"] + b["非支配株主持分"]
    b["負債純資産合計"] = b["負債合計"] + b["純資産合計"]


def _resum_summary(d):
    """貸借の書き換えが、サマリーの総資産・純資産・自己資本比率・1株当たり純資産・ROE に漏れないよう、表示上つじつまを合わせる。"""
    b0, b1, sm, sh = d["BS"]["前期末"], d["BS"]["当期末"], d["サマリー"], d["期中平均株式数(千株)"]
    eq0, eq1 = b0["純資産合計"] - b0["非支配株主持分"], b1["純資産合計"] - b1["非支配株主持分"]
    parent = d["PL"]["当期"]["親会社株主に帰属する当期純利益"]
    sm["総資産"], sm["純資産"], sm["自己資本"] = b1["資産合計"], b1["純資産合計"], eq1
    sm["自己資本比率"] = verify.rh(eq1 * 1000, b1["資産合計"]) / 10
    sm["1株当たり純資産"] = verify.rh(eq1 * 100000, sh) / 100
    sm["自己資本当期純利益率"] = verify.rh(parent * 2000, eq0 + eq1) / 10


# 各注入: (名前, 段, 関数 d -> None, 落ちるべき規則の集合)
def a_growth(d):  # 計算: サマリーの増減率が表の数字から計算した値と合わない
    d["サマリー"]["経常利益増減率"] = round(d["サマリー"]["経常利益増減率"] + 2.0, 1)


def a_summary_level(d):  # 見た目: サマリーの売上高が損益計算書と食い違う (桁の取り違え)
    d["サマリー"]["売上高"] = d["サマリー"]["売上高"] * 10


def a_subtotal(d):  # 計算: 流動資産の合計が内訳の和と合わない (資産合計は表示上の合計に合わせる)
    b = d["BS"]["当期末"]
    b["流動資産合計"] += 30
    b["資産合計"] = b["流動資産合計"] + b["固定資産合計"]
    _resum_summary(d)


def a_balance(d):  # 会計: 買掛金が過少で貸借が合わない (合計は表示上つじつまを合わせる)
    b = d["BS"]["当期末"]
    b["買掛金"] += 50
    _resum_bs(b)
    _resum_summary(d)


def a_cf_start(d):  # 会計: CF の起点が税金等調整前当期純利益ではなく当期純利益 (CF の合計は表示上つじつまを合わせる)
    cf = d["CF"]
    delta = d["PL"]["当期"]["当期純利益"] - cf["税金等調整前当期純利益"]
    cf["税金等調整前当期純利益"] += delta
    cf["小計"] += delta
    cf["営業活動によるキャッシュ・フロー"] += delta
    cf["現金及び現金同等物の増減額"] += delta
    cf["現金及び現金同等物の期末残高"] += delta


def a_retained(d):  # 会計: 利益剰余金が前期末 + 純利益 − 配当と合わない (貸借は現金で調整せず、合計だけ再計算)
    b = d["BS"]["当期末"]
    b["利益剰余金"] += 40
    _resum_bs(b)
    _resum_summary(d)


INJECTIONS = [
    ("計算: 増減率のずれ", a_growth, {"比率-経常利益増減率"}),
    ("見た目: サマリーの桁違い", a_summary_level, {"表示-サマリーの値=財務諸表"}),
    ("計算: 合計が内訳の和と合わない", a_subtotal, {"BS当-流動資産", "BS当-貸借の等式"}),
    ("会計: 貸借が合わない (買掛金)", a_balance, {"BS当-貸借の等式", "連動-仕入債務増減"}),
    ("会計: CF の起点が当期純利益", a_cf_start, {"連動-CF起点=PL税引前", "連動-CF期末=BS現金"}),
    ("会計: 利益剰余金の連動", a_retained, {"BS当-貸借の等式", "連動-利益剰余金"}),
]

if __name__ == "__main__":
    for name, fn, expect in INJECTIONS:
        exact = skipped = 0
        seen = Counter()
        for seed in range(N):
            base, _ = pipeline.generate_checked(seed)
            d = copy.deepcopy(base)
            fn(d)
            failed = set(verify.verify(d)["hard_fail"])
            seen.update(failed)
            exact += failed == expect
        print(f"- {name}: 想定どおりの規則だけが落ちた {exact}/{N} = {exact / N:.1%}  落ちた規則 {dict(seen)}")
