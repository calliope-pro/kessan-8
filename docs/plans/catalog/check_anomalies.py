#!/usr/bin/env python3
"""docs/plans/anomalies.md の一覧表と詳細が、受け入れ条件と食い違っていないかを確かめる (標準ライブラリのみ)。

使いかた: python3 docs/plans/catalog/check_anomalies.py [anomalies.md のパス]
終了コード 0 = 合格、1 = 不合格 (理由を表示)。

確かめること:
 1. 異変の種類が 25 以上。ID が重ならない。難易度は「やさしい」「むずかしい」のどちらか
 2. 難易度ごとの種類の数と、系統が決まった集合に入っている
 3. 画面の ID が §2 の画面 (T1〜T5・I1〜I5) に入っている。会社の ID が companies.md の c01〜c10 に入っている
 4. 一覧の ID ごとに、詳細の節 (### ID) があり、必須の見出し 7 つを含む
 5. 型 (K1〜K8) が §4 で定義された型である
 6. 独立な問題の数 (種類 × 場所の数 × 適する会社の数) の合計が、難易度ごとに 25 以上
    (確度 C の種類は、境界の確認が済むまで使えないので数えない)
"""
import re
import sys

COMPANIES = {f"c{n:02d}" for n in range(1, 11)}
SCREENS = {f"T{n}" for n in range(1, 6)} | {f"I{n}" for n in range(1, 6)}
LEVELS = {"やさしい", "むずかしい"}
KINDS = {"見た目", "計算", "文章", "会計", "資料間", "注記", "手口"}
EASY_KINDS = {"見た目", "計算", "文章"}
HARD_KINDS = {"会計", "資料間", "注記", "手口"}
TYPES = {f"K{n}" for n in range(1, 9)}
REQUIRED = ["画面と場所", "どう変わるか", "破れる規則", "適する会社", "答え合わせ", "正常の条件", "根拠"]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "docs/plans/anomalies.md"
    text = open(path, encoding="utf-8").read()
    errors = []

    m = re.search(r"^\| ID \| 名前 \|.*\n\| ---.*\n((?:\|.*\n)+)", text, re.M)
    if not m:
        print("一覧表 (| ID | 名前 | ... ) が見つからない")
        sys.exit(1)
    rows = []
    for line in m.group(1).splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 9:
            errors.append(f"列の数が 9 でない: {line[:60]}")
            continue
        rows.append(dict(zip(["id", "name", "level", "kind", "screens", "places", "fits", "conf", "ktype"], cells)))

    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        errors.append("ID が重なっている")
    if len(rows) < 25:
        errors.append(f"種類が {len(rows)} しかない (25 以上が要る)")

    cap = {"やさしい": 0, "むずかしい": 0}
    count = {"やさしい": 0, "むずかしい": 0}
    for r in rows:
        i = r["id"]
        if r["level"] not in LEVELS:
            errors.append(f"{i}: 難易度が不正 {r['level']}")
            continue
        count[r["level"]] += 1
        if r["kind"] not in KINDS:
            errors.append(f"{i}: 系統が不正 {r['kind']}")
        elif (r["level"] == "やさしい") != (r["kind"] in EASY_KINDS):
            errors.append(f"{i}: 難易度 {r['level']} と系統 {r['kind']} が合わない")
        if not i.startswith("E-" if r["level"] == "やさしい" else "H-"):
            errors.append(f"{i}: ID の接頭辞が難易度と合わない")
        sc = set(re.findall(r"[TI]\d", r["screens"]))
        if not sc or not sc <= SCREENS:
            errors.append(f"{i}: 画面が不正 {r['screens']}")
        if r["fits"] == "全社":
            fits = COMPANIES
        else:
            fits = set(re.findall(r"c\d\d", r["fits"]))
            if not fits or not fits <= COMPANIES:
                errors.append(f"{i}: 会社が不正 {r['fits']}")
        if not r["places"].isdigit() or int(r["places"]) < 1:
            errors.append(f"{i}: 場所の数が不正 {r['places']}")
            continue
        if r["conf"] not in {"A", "B", "C"}:
            errors.append(f"{i}: 確度が不正 {r['conf']}")
        if r["ktype"] not in TYPES:
            errors.append(f"{i}: 型が不正 {r['ktype']}")
        if r["conf"] in {"A", "B"}:
            cap[r["level"]] += int(r["places"]) * len(fits)

        sec = re.search(r"^### " + re.escape(i) + r"\b.*\n((?:(?!^### |^## ).*\n?)*)", text, re.M)
        if not sec:
            errors.append(f"{i}: 詳細の節 (### {i}) が無い")
        else:
            for label in REQUIRED:
                if label not in sec.group(1):
                    errors.append(f"{i}: 詳細に「{label}」が無い")

    for lv in LEVELS:
        if cap[lv] < 25:
            errors.append(f"{lv}: 独立な問題の数が {cap[lv]} (25 以上が要る)")

    print(f"種類 {len(rows)} (やさしい {count['やさしい']}・むずかしい {count['むずかしい']})")
    print(f"独立な問題の数 (確度 A・B のみ): やさしい {cap['やさしい']}・むずかしい {cap['むずかしい']}")
    if errors:
        print("不合格:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("合格")


if __name__ == "__main__":
    main()
