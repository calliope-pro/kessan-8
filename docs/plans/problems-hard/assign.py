# 設計表 (docs/plans/problems-hard.md §4) の、異変の問題を会社へ散らす割り当てを探す (標準ライブラリのみ)。
# 使いかた: python3 docs/plans/problems-hard/assign.py   → scripts/gen-hard/plan.ts の ASSIGN と同じ内容を出す (種 51 で見つかる。下の条件を満たす最初のもの)
# 条件 (すべて src/data/problems-hard-table.test.ts が数える): 種類ごとに別の会社 (H-19 を除く)・H-19 は 3 セグメントの会社 5 社に 7 問 (2 社が 2 問)・
#   H-24 は後発事象のある c10 に当てない・H-21 は営業 CF がマイナスの c06 に当てない・段ごとに会社どうしの数の差が 1 以内・会社ごとの異変の合計が 12 か 13。
import json
import random

C = ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10']
SEG3 = ['c01', 'c03', 'c06', 'c08', 'c10']
TIERS = {
    1: [('H-17', 7), ('H-35', 7), ('H-22', 5), ('H-29', 5), ('H-30', 5), ('H-32', 5), ('H-33', 5), ('H-34', 5)],
    2: [('H-13', 7), ('H-19', 7), ('H-21', 7), ('H-28', 7), ('H-23', 5), ('H-24', 5), ('H-31', 5)],
    3: [('H-01', 7), ('H-03', 7), ('H-04', 7), ('H-05', 7), ('H-20', 7)],
}
EXTRA = {1: 4, 2: 3, 3: 5}  # 段ごとに、基の数より 1 問多い会社の数 (44 = 4×10 + 4・43 = 4×10 + 3・35 = 3×10 + 5)
BASE = {1: 4, 2: 4, 3: 3}


def allowed(kind):
    a = list(C)
    if kind == 'H-24':
        a.remove('c10')
    if kind == 'H-21':
        a.remove('c06')
    if kind == 'H-19':
        a = list(SEG3)
    return a


def solve(seed):
    R = random.Random(seed)
    asg = {}
    total = {c: 0 for c in C}
    for t, kinds in TIERS.items():
        for _ in range(2000):
            extras = set(R.sample(C, EXTRA[t]))
            target = {c: BASE[t] + (1 if c in extras else 0) for c in C}
            order = sorted(kinds, key=lambda kn: (kn[0] != 'H-19', kn[0] != 'H-24', kn[0] != 'H-21'))
            left = dict(target)
            res = {}
            ok = True
            for kind, count in order:
                al = allowed(kind)
                if kind == 'H-19':
                    pool = [c for c in al for _ in range(min(2, left[c]))]
                    if len(pool) < count:
                        ok = False
                        break
                    R.shuffle(pool)
                    chosen = pool[:count]
                    if len(set(chosen)) < 5:
                        ok = False
                        break
                else:
                    cand = [c for c in al if left[c] > 0]
                    if len(cand) < count:
                        ok = False
                        break
                    cand.sort(key=lambda c: (-left[c], R.random()))
                    chosen = cand[:count]
                for c in chosen:
                    left[c] -= 1
                res[kind] = sorted(chosen)
            if ok and all(v == 0 for v in left.values()):
                asg.update(res)
                for c in C:
                    total[c] += target[c]
                break
        else:
            return None
    return asg if all(v in (12, 13) for v in total.values()) else None


for seed in range(2000):
    a = solve(seed)
    if a:
        print(json.dumps(a, ensure_ascii=False, indent=1))
        print('seed', seed)
        break
