"""試作 (#10): 生成 → 検証を N 件回し、通過率と時間を測る。標準ライブラリのみ。製品のコードではない。

使いかた (docs/plans/spike/ で): python3 run.py [N]   既定 N=1000。結果を標準出力に出す (固定の種で再現できる)。
"""
import copy
import json
import statistics
import sys
import time
from collections import Counter

import gen
import verify

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1000


def batch(label, fn):
    t = time.perf_counter()
    hard_ok = soft_ok = both_ok = 0
    hard_fail = Counter()
    soft_fail = Counter()
    for seed in range(N):
        r = verify.verify(fn(seed))
        h, s = not r["hard_fail"], not r["soft_fail"]
        hard_ok += h
        soft_ok += s
        both_ok += h and s
        hard_fail.update(r["hard_fail"])
        soft_fail.update(r["soft_fail"])
    dt = time.perf_counter() - t
    print(f"\n## {label}  (N={N})")
    print(f"- 整合 (hard {r['hard_n']} 規則) を全部通った: {hard_ok}/{N} = {hard_ok / N:.1%}")
    print(f"- もっともらしさ (soft {r['soft_n']} 規則) を全部通った: {soft_ok}/{N} = {soft_ok / N:.1%}")
    print(f"- 両方通った: {both_ok}/{N} = {both_ok / N:.1%}")
    print(f"- 生成 + 検証 {dt / N * 1000:.2f} ms/件 (合計 {dt:.2f} 秒)")
    if hard_fail:
        print("- hard で落ちた規則 (上位 8):", hard_fail.most_common(8))
    if soft_fail:
        print("- soft で落ちた規則:", soft_fail.most_common())
    return both_ok


batch("S2 構築による整合 (前提の範囲は妥当)", gen.generate)
batch("S2 構築による整合 (前提の範囲を広げる: 売上 -40%〜+60%)", lambda s: gen.generate(s, plausible_drivers=False))
batch("S1 素朴 (各項目を独立の乱数)", gen.generate_naive)

# ---- 検証器が空振りしていないか: 1 つの数字を +1 して、何本の規則が落ちるか ----
print("\n## 変異: 正常データの 1 つの数字を +1 (百万円) / 比率は最後の桁を +1 したとき、検証が検出するか")
detected = total = 0
blast = []
bysec = {}
undetected = Counter()
for seed in range(50):
    base = gen.generate(seed)
    leaves = []
    for sect in ("BS", "PL"):
        for col, tbl in base[sect].items():
            for k in tbl:
                leaves.append((sect, col, k))
    leaves += [("CF", None, k) for k in base["CF"]]
    leaves += [("サマリー", None, k) for k, v in base["サマリー"].items() if v is not None]
    for sect, col, k in leaves:
        d = copy.deepcopy(base)
        tbl = d[sect][col] if col else d[sect]
        step = 1 if isinstance(tbl[k], int) and sect != "サマリー" else (0.1 if "率" in k or "性向" in k or "比率" in k else 0.01)
        if sect == "サマリー" and k == "年間配当金":
            step = 10
        tbl[k] = round(tbl[k] + step, 2)
        r = verify.verify(d)
        total += 1
        n = len(r["hard_fail"])
        if n:
            detected += 1
            blast.append(n)
            bysec.setdefault(sect, []).append(n)
        else:
            undetected[f"{sect}.{k}"] += 1
print(f"- 検出: {detected}/{total} = {detected / total:.1%}")
print(f"- 検出した変異 1 つあたりの、落ちた規則の本数: 中央値 {statistics.median(blast)}・平均 {statistics.mean(blast):.1f}・"
      f"最大 {max(blast)}・1 本だけ {sum(1 for b in blast if b == 1)}/{len(blast)}")
print("- 区分ごと (本数の中央値 / 1 本だけの割合):", {k: (statistics.median(v), f"{sum(1 for x in v if x == 1) / len(v):.0%}") for k, v in bysec.items()})
print("- 検出されなかった項目 (件数):", dict(undetected))

if "--dump" in sys.argv:
    print(json.dumps(gen.generate(0), ensure_ascii=False, indent=1))
