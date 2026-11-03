#!/usr/bin/env python3
"""架空の会社名が実在の法人名と衝突しないことを確かめる (標準ライブラリのみ)。

使いかた:
  python3 check_names.py <JPX の data_j.xlsx> <国税庁の全件 CSV (Unicode)> <候補の TSV>

候補の TSV (UTF-8、先頭行は見出し): id, 社名 (株式会社を除く), 読み (全角カタカナ), 語幹, 語幹の読み, 英字 (語幹のローマ字。小文字)
出力: Markdown の表 (companies.md §3 に貼る)。終了コード 0 = 全社が合格、1 = 不合格あり。

入力 (どちらも公開データ。リポジトリには置かない。取得手順は companies.md §3):
- JPX 上場会社一覧: https://www.jpx.co.jp/markets/statistics-equities/misc/01.html (data_j.xlsx。ETF・ETN も含む全行)
- 国税庁 法人番号公表サイト 全件データ (CSV・Unicode): https://www.houjin-bangou.nta.go.jp/download/zenken/
  (列: 6 = 商号又は名称、24 = 英語表記、末尾の 1 つ前 = フリガナ。閉鎖・合併した法人も含む全行)

合格の条件 (どれも「ある」なら不合格):
 1. 社名 (法人格を除いた正規化後) が、JPX の銘柄名か国税庁の商号と完全に一致する
 2. 社名の読みが、国税庁のフリガナ (法人格を除く) と完全に一致する
 3. 語幹が、JPX の銘柄名に含まれる
 4. 語幹か語幹の読みが、国税庁の商号か、そのフリガナに含まれる
 5. JPX の銘柄名 (法人格・記号を除いて 3 字以上) が、社名に含まれる
 6. 英字が、国税庁の英語表記 (列 24) か、正規化した商号 (列 6。ローマ字の商号はここに入る) に含まれる
 7. 語幹を 1 字置き換えるか 1 字挿入した形 (カタカナ・長音。語幹が 4 字以上のとき) が、JPX の銘柄名 (3 字以上) に含まれる
 参考 (合否に使わない): 国税庁の商号 (法人格を除く) が、語幹を 1 字置き換え・挿入・削除した形と完全に一致する、
    または社名 (業種語つき) との編集距離が 1 以下である件数。約 585 万件の個人店・小規模法人を含むため、
    3〜4 字のカタカナ語幹には必ず近傍があり、合否にできない。件数が多い・上場会社と思しき名が出たときは目で見る

 検査 7 は companies.md の規則 N5 (実在の語を 1 字変えただけの語幹を避ける) を、上場会社 (遊び手が知りうる名) について機械で確かめる。
 補足: 国税庁のフリガナは、約 4 割の行で空。その行では検査 2 と検査 4 の読みの部分は効かない (出力の先頭行に件数を出す)。
"""
import csv
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FORMS = re.compile(
    r"株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|\(有\)|\(合\)|"
    r"一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人社団|医療法人|社会福祉法人|学校法人|"
    r"特定非営利活動法人|協同組合|"
    r"ホールディングス|グループ本社|[\s　・･\-－]"
)


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = "".join(chr(ord(ch) + 0x60) if "\u3041" <= ch <= "\u3096" else ch for ch in s)  # ひらがな -> カタカナ
    return FORMS.sub("", s)


KANA = [chr(c) for c in range(0x30A1, 0x30FB)] + ["ー"]  # ァ〜ヺ と長音


def variants(stem, with_delete):
    """語幹の 1 字置換・1 字挿入 (と、with_delete なら 1 字削除) の集合。語幹そのものは含めない。"""
    out = set()
    for i in range(len(stem)):
        for k in KANA:
            if k != stem[i]:
                out.add(stem[:i] + k + stem[i + 1:])
        if with_delete:
            out.add(stem[:i] + stem[i + 1:])
    for i in range(len(stem) + 1):
        for k in KANA:
            out.add(stem[:i] + k + stem[i:])
    out.discard(stem)
    return out


def lev_le1(a, b):
    """編集距離が 1 以下か (等しいときも真)。"""
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la > lb:
        a, b, la, lb = b, a, lb, la
    i = 0
    while i < la and a[i] == b[i]:
        i += 1
    if i == la:
        return True
    if la == lb:
        return a[i + 1:] == b[i + 1:]
    return a[i:] == b[i + 1:]


def read_jpx(path):
    z = zipfile.ZipFile(path)
    ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])) for si in ss.findall("m:si", NS)]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    names = []
    for row in sheet.iter("{%s}row" % NS["m"]):
        if row.get("r") == "1":
            continue
        for c in row:
            if c.get("r", "").startswith("C"):
                v = c.find("m:v", NS)
                if v is not None:
                    names.append(strings[int(v.text)] if c.get("t") == "s" else v.text)
    return names


def main():
    jpx_path, nta_path, cand_path = sys.argv[1:4]
    cands = []
    with open(cand_path, encoding="utf-8") as f:
        rows = list(csv.reader(f, delimiter="\t"))
    for r in rows[1:]:
        if len(r) >= 6 and r[0]:
            cands.append({"id": r[0], "name": r[1], "yomi": r[2], "stem": r[3], "stem_yomi": r[4], "en": r[5].lower()})
    for c in cands:
        c["n_name"], c["n_yomi"] = norm(c["name"]), norm(c["yomi"])
        c["n_stem"], c["n_stem_yomi"] = norm(c["stem"]), norm(c["stem_yomi"])
        c.update(jpx_exact=0, jpx_stem=0, jpx_in_name=0, nta_exact=0, nta_yomi=0, nta_stem=0, nta_stem_yomi=0, nta_en=0, jpx_var=0, nta_var=0, samples=[])
        c["var_sub_ins"] = variants(c["n_stem"], False) if len(c["n_stem"]) >= 4 else set()
        c["var_all"] = variants(c["n_stem"], True)

    jpx = read_jpx(jpx_path)
    jpx_n = [norm(n) for n in jpx]
    for c in cands:
        for n in jpx_n:
            if n == c["n_name"]:
                c["jpx_exact"] += 1
            if c["n_stem"] in n:
                c["jpx_stem"] += 1
                if len(c["samples"]) < 3:
                    c["samples"].append("JPX:" + n)
            if len(n) >= 3 and n in c["n_name"]:
                c["jpx_in_name"] += 1
            if len(n) >= 3 and any(v in n for v in c["var_sub_ins"]):
                c["jpx_var"] += 1
                if len(c["samples"]) < 3:
                    c["samples"].append("JPX 1字差:" + n)

    total = 0
    yomi_empty = 0
    with open(nta_path, encoding="utf-8", newline="") as f:
        for row in csv.reader(f):
            total += 1
            name, yomi, en = norm(row[6]), norm(row[-2]), row[24].lower()
            if not yomi:
                yomi_empty += 1
            for c in cands:
                if name == c["n_name"]:
                    c["nta_exact"] += 1
                if yomi == c["n_yomi"]:
                    c["nta_yomi"] += 1
                if c["n_stem"] in name:
                    c["nta_stem"] += 1
                    if len(c["samples"]) < 3:
                        c["samples"].append("NTA:" + name)
                if name in c["var_all"] or lev_le1(name, c["n_name"]):
                    c["nta_var"] += 1
                    if len(c["samples"]) < 3:
                        c["samples"].append("NTA 1字差:" + name)
                if c["en"] and (c["en"] in en or c["en"] in name):
                    c["nta_en"] += 1
                    if len(c["samples"]) < 3:
                        c["samples"].append("NTA英:" + (en if c["en"] in en else name))
                if c["n_stem_yomi"] in yomi:
                    c["nta_stem_yomi"] += 1
                    if len(c["samples"]) < 3:
                        c["samples"].append("NTA読み:" + yomi)

    print(f"JPX 行数 {len(jpx)}、国税庁 行数 {total} (うちフリガナが空 {yomi_empty} 行)\n")
    print("| id | 社名 | JPX 完全一致 | JPX 語幹を含む | JPX 銘柄が社名に含まれる | 国税庁 商号の完全一致 | 国税庁 読みの完全一致 | 国税庁 語幹を商号に含む | 国税庁 語幹の読みをフリガナに含む | 国税庁 英字を英語表記か商号に含む | JPX 語幹の 1 字差 | (参考) 国税庁 商号の 1 字差 | 判定 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    ok_all = True
    for c in cands:
        ok = not (c["jpx_exact"] or c["jpx_stem"] or c["jpx_in_name"] or c["nta_exact"] or c["nta_yomi"] or c["nta_stem"] or c["nta_stem_yomi"] or c["nta_en"] or c["jpx_var"])
        ok_all &= ok
        print(f"| {c['id']} | {c['name']} | {c['jpx_exact']} | {c['jpx_stem']} | {c['jpx_in_name']} | {c['nta_exact']} | {c['nta_yomi']} | {c['nta_stem']} | {c['nta_stem_yomi']} | {c['nta_en']} | {c['jpx_var']} | {c['nta_var']} | {'合格' if ok else '不合格 ' + ' / '.join(c['samples'])} |")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
