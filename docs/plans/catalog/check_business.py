#!/usr/bin/env python3
"""docs/plans/companies.md §5.4 の事業の説明 (Company.business) が、規則 B1〜B6 を満たすかを確かめる (標準ライブラリのみ)。

使いかた: python3 docs/plans/catalog/check_business.py [companies.md のパス]
終了コード 0 = 合格、1 = 不合格 (理由を表示)。

確かめること (companies.md §5.4 の規則と同じ):
 B1 10 社すべてに business がある。1 文で、「会社」で終わる。長さは 8〜36 字
 B2 数字 (算用数字・全角数字・数を表す漢数字) を含まない
 B3 増減・好不調・順位・時期を表す語 (禁止語) を含まない
 B4 必須語の数が、§5.2 のセグメントの数と同じ。必須語は §5.2 の同じ会社のセグメント名に含まれ、business にも含まれる
    (全セグメントに触れ、セグメント名と違う事業を書かない)
 B5 10 社の business はすべて違う
 B6 実在の社名・ブランド名に当たる語を含まない (数は少なく、禁止語の表で見る)
意味の矛盾 (業種と合うか) は機械では確かめられない。レビューで人が読む。
"""
import re
import sys

FORBIDDEN = [
    "増", "減", "伸", "拡大", "縮小", "成長", "好調", "不調", "堅調", "低迷", "回復", "急", "最大", "最高", "最新",
    "大手", "業界", "トップ", "首位", "老舗", "新興", "赤字", "黒字", "無借金", "安定", "今期", "当期", "前期", "近年",
    "年", "月", "世紀",
]
# 実在の社名・ブランド名として思いつくもの (B6 の最低限。網羅ではない)
REAL = ["トヨタ", "ソニー", "パナソニック", "ユニクロ", "イオン", "セブン", "ローソン", "ファミリーマート", "楽天", "任天堂"]
COMPANIES = [f"c{n:02d}" for n in range(1, 11)]


def section(text, start, end):
    a = text.index(start)
    b = text.index(end, a)
    return text[a:b]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "docs/plans/companies.md"
    text = open(path, encoding="utf-8").read()
    errors = []

    seg = {}
    for m in re.finditer(r"^\| (c\d\d) \| ([^|]+?) \|", section(text, "### 5.2", "### 5.3"), re.M):
        seg[m.group(1)] = [s.strip() for s in m.group(2).split("/")]

    try:
        sec = section(text, "### 5.4", "\n## ")
    except ValueError:
        sec = text[text.index("### 5.4"):] if "### 5.4" in text else ""
    rows = {}
    for m in re.finditer(r"^\| (c\d\d) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|", sec, re.M):
        rows[m.group(1)] = (m.group(2).strip(), m.group(3).strip(), [w.strip() for w in m.group(4).split("、")])

    for c in COMPANIES:
        if c not in rows:
            errors.append(f"{c}: business が無い (§5.4 の表)")
            continue
        name, biz, must = rows[c]
        if not (8 <= len(biz) <= 36):
            errors.append(f"{c}: 長さが 8〜36 字でない ({len(biz)} 字)")
        if not biz.endswith("会社") or "。" in biz:
            errors.append(f"{c}: 「会社」で終わる 1 文 (句点なし) でない")
        if re.search(r"[0-9０-９]", biz) or re.search(r"[〇二三四五六七八九十百千万億]|一(?!般|括|部|貫)", biz):
            errors.append(f"{c}: 数字を含む")
        for w in FORBIDDEN:
            if w in biz:
                errors.append(f"{c}: 禁止語「{w}」を含む")
        for w in REAL:
            if w in biz:
                errors.append(f"{c}: 実在の名前「{w}」を含む")
        segs = seg.get(c, [])
        if len(must) != len(segs):
            errors.append(f"{c}: 必須語 {len(must)} 個 ≠ セグメント {len(segs)} 個")
        else:
            for w, s in zip(must, segs):
                if w not in s:
                    errors.append(f"{c}: 必須語「{w}」がセグメント名「{s}」に無い")
                if w not in biz:
                    errors.append(f"{c}: business に必須語「{w}」が無い")

    bizs = [rows[c][1] for c in COMPANIES if c in rows]
    if len(set(bizs)) != len(bizs):
        errors.append("business が重なっている")

    print(f"事業の説明 {len(rows)} 社")
    if errors:
        print("不合格:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("合格")


if __name__ == "__main__":
    main()
