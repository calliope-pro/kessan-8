"""試作 (#10): 架空の会社の正常データ (決算短信の連結財務諸表) を生成する。標準ライブラリのみ。製品のコードではない。

方式 S2 (構築による整合): 前期末の貸借対照表を平衡させて作り、当期は営業の前提 (売上・原価率・運転資本日数・
設備投資・借入・配当) から損益 → 運転資本 → キャッシュ・フロー → 当期末の貸借対照表の順に導く。
方式 S1 (素朴): 各項目を独立に乱数で決める。比較のためだけに置く。
単位は百万円 (整数)。比率は検証器 (verify.py) が表示値から再計算して確かめる。
"""
import random
from fractions import Fraction


def rh(num, den=1):
    """四捨五入 (0.5 は絶対値の大きい側へ)。Fraction で正確に。"""
    f = Fraction(num) / den
    n = f.numerator * 2 + (f.denominator if f >= 0 else -f.denominator)
    return int(n // (2 * f.denominator)) if f >= 0 else -int((-n) // (2 * f.denominator))


def pct(n, d):  # 小数 1 位の %
    return rh(n * 1000, d) / 10


def _pl(rng, S, cr, sr, ii, ie, special):
    cogs = rh(S * cr)
    gp = S - cogs
    sga = rh(S * sr)
    op = gp - sga
    ordp = op + ii - ie
    sg, sl = special
    pbt = ordp + sg - sl
    tax = rh(pbt * Fraction(rng.randint(285, 335), 1000)) if pbt > 0 else 0
    ni = pbt - tax
    nci = rh(ni * Fraction(rng.randint(0, 50), 1000)) if ni > 0 else 0
    return {
        "売上高": S, "売上原価": cogs, "売上総利益": gp, "販売費及び一般管理費": sga, "営業利益": op,
        "営業外収益": ii, "営業外費用": ie, "経常利益": ordp, "特別利益": sg, "特別損失": sl,
        "税金等調整前当期純利益": pbt, "法人税等": tax, "当期純利益": ni,
        "非支配株主に帰属する当期純利益": nci, "親会社株主に帰属する当期純利益": ni - nci,
    }


def _special(rng, S):
    sg = rh(S * Fraction(rng.randint(1, 40), 10000)) if rng.random() < 0.3 else 0
    sl = rh(S * Fraction(rng.randint(1, 60), 10000)) if rng.random() < 0.3 else 0
    return sg, sl


def generate(seed, plausible_drivers=True, attempt=0):
    """S2。正常データ 1 件 (dict) を返す。attempt は棄却して引き直すときの番号 (種を変える)。"""
    rng = random.Random(seed * 1000 + attempt)
    U = lambda a, b: rng.uniform(a, b)

    # ---- 前期 ----
    S0 = rng.randrange(6000, 60000, 100)
    cr0, sr0 = U(0.60, 0.74), U(0.14, 0.24)
    PPE0 = rh(S0 * U(0.25, 0.60))
    AR0 = rh(S0 * U(40, 90) / 365)
    cogs0 = rh(S0 * cr0)
    INV0 = rh(cogs0 * U(30, 80) / 365)
    AP0 = rh(cogs0 * U(30, 70) / 365)
    OCA0 = rh(S0 * U(0.01, 0.04))
    OCL0 = rh(S0 * U(0.02, 0.06))
    TAXP0 = rh(S0 * U(0.005, 0.02))
    OTH0 = rh(S0 * U(0.05, 0.20))
    STD0 = rh(S0 * U(0.02, 0.10))
    LTD0 = rh(S0 * U(0.05, 0.25))
    C0 = rh(S0 * U(0.08, 0.25))
    CAP = rh(S0 * U(0.05, 0.12))
    CS = rh(CAP * U(0.5, 1.0))
    NCI0 = rh(S0 * U(0.0, 0.02))
    assets0 = C0 + AR0 + INV0 + OCA0 + PPE0 + OTH0
    liab0 = AP0 + STD0 + TAXP0 + OCL0 + LTD0
    RE0 = assets0 - liab0 - CAP - CS - NCI0  # 平衡させる
    ii0 = rh(S0 * U(0.0005, 0.003))
    ie0 = rh((STD0 + LTD0) * U(0.005, 0.02))
    pl0 = _pl(rng, S0, cr0, sr0, ii0, ie0, _special(rng, S0))

    # ---- 当期の前提 ----
    g = U(-0.05, 0.15) if plausible_drivers else U(-0.4, 0.6)
    S1 = rh(S0 * (1 + g))
    cr1 = min(max(cr0 + U(-0.02, 0.02), 0.5), 0.8)
    sr1 = min(max(sr0 + U(-0.015, 0.015), 0.1), 0.3)
    cogs1 = rh(S1 * cr1)
    AR1 = rh(S1 * (AR0 * 365 / S0 + U(-6, 6)) / 365)
    INV1 = rh(cogs1 * (INV0 * 365 / max(cogs0, 1) + U(-8, 8)) / 365)
    AP1 = rh(cogs1 * (AP0 * 365 / max(cogs0, 1) + U(-6, 6)) / 365)
    OCA1 = rh(OCA0 * U(0.8, 1.25))
    OCL1 = rh(OCL0 * U(0.8, 1.25))
    TAXP1 = rh(TAXP0 * U(0.7, 1.4))
    OTH1 = rh(OTH0 * U(0.9, 1.15))
    capex = rh(PPE0 * U(0.05, 0.22))
    D = rh(PPE0 * U(0.06, 0.12))
    PPE1 = PPE0 + capex - D
    STD1 = max(rh(STD0 * U(0.6, 1.4)), 0)
    LTD1 = max(rh(LTD0 * U(0.75, 1.2)), 0)
    ii1 = rh(S1 * U(0.0005, 0.003))
    ie1 = rh(((STD0 + LTD0 + STD1 + LTD1) / 2) * U(0.005, 0.02))
    # 減価償却費は原価と販管費に含まれる: 販管費率を、償却費を下回らない範囲に
    sga1 = rh(S1 * sr1)
    pl1 = _pl(rng, S1, cr1, sga1 / S1, ii1, ie1, _special(rng, S1))
    parent = pl1["親会社株主に帰属する当期純利益"]
    sh = rng.randrange(2000, 30000, 100)  # 期中平均株式数 (千株)
    payout = U(0.0, 0.5)
    dps = max(int(parent * 1000 / sh * payout // 10 * 10), 0) if parent > 0 else 0
    div = rh(dps * sh, 1000)

    # ---- キャッシュ・フロー ----
    tax_paid = pl1["法人税等"] - (TAXP1 - TAXP0)
    cf = {
        "税金等調整前当期純利益": pl1["税金等調整前当期純利益"],
        "減価償却費": D,
        "受取利息": -ii1,
        "支払利息": ie1,
        "売上債権の増減額": -(AR1 - AR0),
        "棚卸資産の増減額": -(INV1 - INV0),
        "仕入債務の増減額": AP1 - AP0,
        "その他資産の増減額": -(OCA1 - OCA0),
        "その他負債の増減額": OCL1 - OCL0,
    }
    cf["小計"] = sum(cf.values())
    cf["利息の受取額"] = ii1
    cf["利息の支払額"] = -ie1
    cf["法人税等の支払額"] = -tax_paid
    cf["営業活動によるキャッシュ・フロー"] = cf["小計"] + ii1 - ie1 - tax_paid
    cf["有形固定資産の取得による支出"] = -capex
    cf["その他投資の増減額"] = -(OTH1 - OTH0)
    cf["投資活動によるキャッシュ・フロー"] = -capex - (OTH1 - OTH0)
    cf["短期借入金の増減額"] = STD1 - STD0
    cf["長期借入金の増減額"] = LTD1 - LTD0
    cf["配当金の支払額"] = -div
    cf["財務活動によるキャッシュ・フロー"] = (STD1 - STD0) + (LTD1 - LTD0) - div
    cf["現金及び現金同等物に係る換算差額"] = 0
    inc = (cf["営業活動によるキャッシュ・フロー"] + cf["投資活動によるキャッシュ・フロー"]
           + cf["財務活動によるキャッシュ・フロー"])
    cf["現金及び現金同等物の増減額"] = inc
    cf["現金及び現金同等物の期首残高"] = C0
    C1 = C0 + inc
    cf["現金及び現金同等物の期末残高"] = C1

    RE1 = RE0 + parent - div
    NCI1 = NCI0 + pl1["非支配株主に帰属する当期純利益"]

    def bs(C, AR, INV, OCA, PPE, OTH, AP, STD, TAXP, OCL, LTD, RE, NCI):
        ca = C + AR + INV + OCA
        fa = PPE + OTH
        cl = AP + STD + TAXP + OCL
        shareholders = CAP + CS + RE
        return {
            "現金及び預金": C, "売掛金": AR, "棚卸資産": INV, "その他流動資産": OCA, "流動資産合計": ca,
            "有形固定資産": PPE, "投資その他の資産": OTH, "固定資産合計": fa, "資産合計": ca + fa,
            "買掛金": AP, "短期借入金": STD, "未払法人税等": TAXP, "その他流動負債": OCL, "流動負債合計": cl,
            "長期借入金": LTD, "固定負債合計": LTD, "負債合計": cl + LTD,
            "資本金": CAP, "資本剰余金": CS, "利益剰余金": RE, "株主資本合計": shareholders,
            "非支配株主持分": NCI, "純資産合計": shareholders + NCI,
            "負債純資産合計": cl + LTD + shareholders + NCI,
        }

    b0 = bs(C0, AR0, INV0, OCA0, PPE0, OTH0, AP0, STD0, TAXP0, OCL0, LTD0, RE0, NCI0)
    b1 = bs(C1, AR1, INV1, OCA1, PPE1, OTH1, AP1, STD1, TAXP1, OCL1, LTD1, RE1, NCI1)
    eq0 = b0["純資産合計"] - b0["非支配株主持分"]
    eq1 = b1["純資産合計"] - b1["非支配株主持分"]
    p0 = pl0["親会社株主に帰属する当期純利益"]

    def g_(a, b):
        return pct(a - b, b) if b else None

    summary = {
        "売上高": pl1["売上高"], "営業利益": pl1["営業利益"], "経常利益": pl1["経常利益"],
        "親会社株主に帰属する当期純利益": parent, "総資産": b1["資産合計"], "純資産": b1["純資産合計"], "自己資本": eq1,
        "売上高増減率": g_(pl1["売上高"], pl0["売上高"]),
        "営業利益増減率": g_(pl1["営業利益"], pl0["営業利益"]) if pl0["営業利益"] > 0 else None,
        "経常利益増減率": g_(pl1["経常利益"], pl0["経常利益"]) if pl0["経常利益"] > 0 else None,
        "親会社株主に帰属する当期純利益増減率": g_(parent, p0) if p0 > 0 else None,
        "1株当たり当期純利益": rh(parent * 100000, sh) / 100,
        "自己資本比率": pct(eq1, b1["資産合計"]),
        "自己資本当期純利益率": pct(parent * 2, eq0 + eq1),
        "1株当たり純資産": rh(eq1 * 100000, sh) / 100,
        "年間配当金": dps,
        "配当性向": pct(div, parent) if parent > 0 else None,
    }
    return {
        "会社": f"架空商事{seed:05d}株式会社", "単位": "百万円", "期中平均株式数(千株)": sh,
        "サマリー": summary, "BS": {"前期末": b0, "当期末": b1}, "PL": {"前期": pl0, "当期": pl1}, "CF": cf,
    }


def generate_naive(seed):
    """S1 (素朴)。各項目を独立の乱数で決め、合計だけ足し上げる。連結の整合は考えない。"""
    rng = random.Random(seed)
    d = generate(seed)  # 形だけ借りて、数字を独立の乱数で置き換える
    for sect in (d["BS"]["前期末"], d["BS"]["当期末"], d["PL"]["前期"], d["PL"]["当期"], d["CF"]):
        for k, v in sect.items():
            if isinstance(v, int):
                sect[k] = rng.randint(max(0, abs(v) // 2), abs(v) * 2 + 1) * (1 if v >= 0 else -1)
    return d
