"""試作 (#41): 難しさの段 (P1) を入れた出題の 2 つの手順で、狙いの段が当たる割合を測る。標準ライブラリのみ。製品のコードではない。
使いかた (docs/plans/spike/ で): python3 draw-tiers.py [プール数 400] [1 プールあたりの試行 50]
プールの作りかた: 25 問を段 11:9:5 に割り、会社 (8・12 社) に配る。どの会社も、異変あり・なしの両方を 1 問以上持つ (設計 §4.3 の条件)。
手順 A (設計の初版 §5.3): 会社を 8 社先に選ぶ → 各社で あり/なし を引く → その会社の問題から狙いの段にいちばん近いものを引く。
手順 B (枠を先に決める): 各枠の あり/なし を先に引く → 1 社目の枠から順に、重複しない会社を増加路 (二部マッチング) で割り当てる。当てられない枠だけ、その枠の段を近い段へ緩める (先の枠は緩めない) → 各会社の問題を引く。
狙いの段: 1〜2 社目 = 1、3〜5 社目 = 2、6〜8 社目 = 3。
"""
import random
import sys

POOLS = int(sys.argv[1]) if len(sys.argv) > 1 else 400
TRIALS = int(sys.argv[2]) if len(sys.argv) > 2 else 50
TARGET = [1, 1, 2, 2, 2, 3, 3, 3]


def make_pool(rng, n_companies, total=25):
    """25 問を段 11:9:5 に割る。どの会社も 異変あり・なし の両方を 1 問以上持ち、残りは無作為の会社・側。"""
    extra = total - 2 * n_companies
    if extra < 0:
        raise SystemExit('会社が多すぎる (両面で 25 問を超える)')
    tiers = [1] * 11 + [2] * 9 + [3] * 5
    rng.shuffle(tiers)
    pairs = [(c, s) for c in range(n_companies) for s in (True, False)]
    pairs += [(rng.randrange(n_companies), rng.random() < 0.5) for _ in range(extra)]
    return [{'company': c, 'anomaly': s, 'tier': t} for (c, s), t in zip(pairs, tiers)]


def near_tiers(t):
    return sorted([1, 2, 3], key=lambda x: (abs(x - t), x))


def procedure_a(rng, probs, companies):
    chosen = rng.sample(companies, 8)
    out = []
    for slot, c in enumerate(chosen):
        side = rng.random() < 0.5
        cand = [p for p in probs if p['company'] == c and p['anomaly'] == side]
        best = min(abs(p['tier'] - TARGET[slot]) for p in cand)
        out.append(rng.choice([p for p in cand if abs(p['tier'] - TARGET[slot]) == best]))
    return out


def procedure_b(rng, probs, companies):
    """枠を 1 社目から順に増加路で割り当てる。当てられない枠だけ、その枠の段を近い段へ緩める (先の枠は緩めない)。"""
    sides = [rng.random() < 0.5 for _ in range(8)]
    allowed = [None] * 8   # 枠ごとに許す会社 (緩めるたびに作り直す)
    tier_used = [None] * 8
    owner = {}             # 会社 → 枠

    def cands(i, t):
        cs = [c for c in companies if any(p['company'] == c and p['anomaly'] == sides[i] and (t is None or p['tier'] == t) for p in probs)]
        rng.shuffle(cs)
        return cs

    def try_assign(i, seen):
        for c in allowed[i]:
            if c in seen:
                continue
            seen.add(c)
            if c not in owner or try_assign(owner[c], seen):
                owner[c] = i
                return True
        return False

    for i in range(8):
        order = near_tiers(TARGET[i]) + [None]
        for t in order:
            allowed[i] = cands(i, t)
            if try_assign(i, set()):
                tier_used[i] = t
                break
        else:
            raise SystemExit('割り当てられない (両面の会社が足りない)')
    slot_company = {i: c for c, i in owner.items()}
    out = []
    for i in range(8):
        t = tier_used[i]
        cand = [p for p in probs if p['company'] == slot_company[i] and p['anomaly'] == sides[i] and (t is None or p['tier'] == t)]
        out.append(rng.choice(cand))
    return out


def run(n_companies):
    rng = random.Random(41 + n_companies)
    res = {'A': [0] * 8, 'B': [0] * 8}
    first3 = {'A': 0, 'B': 0}
    n = 0
    for _ in range(POOLS):
        probs = make_pool(rng, n_companies)
        companies = list(range(n_companies))
        for _ in range(TRIALS):
            for name, f in (('A', procedure_a), ('B', procedure_b)):
                picks = f(rng, probs, companies)
                for i, p in enumerate(picks):
                    res[name][i] += p['tier'] == TARGET[i]
                first3[name] += picks[0]['tier'] == 3
            n += 1
    base1 = 11 / 25
    print(f'会社 {n_companies} 社 (プール {POOLS} × {TRIALS} 回 = {n} 回)')
    for name in 'AB':
        r = [x / n for x in res[name]]
        print(f'  手順 {name}: 枠ごとの当たり率', ' '.join(f'{x:.2f}' for x in r), f'| 1 社目に段 3 が出る割合 {first3[name] / n:.3f}')
    print(f'  (段の指定が無いとき、1 社目が段 1 になる割合 = 11/25 = {base1:.2f})')


for k in (8, 12):
    run(k)
