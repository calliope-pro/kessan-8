"""試作 (#11): 案 B と案 C の総工数の順位が、測った値を入れると逆転するかを出し直す。標準ライブラリのみ。
docs/plans/estimate.py の DAG と単価を読み込み、測った値で置き換える Task だけを係数で縮める。製品のコードではない。

使いかた (docs/plans/spike/ で): python3 reversal.py
入力: s = 問題制作 (B5〜B8・A4〜A7) の単価の倍率 (計画 = 1)、t = 生成まわり (G5〜G9) の倍率 (計画 = 1)。
estimate.py の scale_content は問題制作と一次資料の確認 (A8・B9・G10) の両方を縮めてしまうため、ここでは確認を縮めない。
"""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import estimate as E  # noqa: E402

MAKE = {'A': ['A4', 'A5', 'A6', 'A7'], 'B': ['B5', 'B6', 'B7', 'B8'], 'C': []}   # 問題制作 (手書き)
GEN = {'A': [], 'B': [], 'C': ['G5', 'G6', 'G7', 'G8', 'G9']}                      # 生成まわり


def total(plan, s=1.0, t=1.0, override=None):
    tasks = copy.deepcopy(E.PLANS[plan])
    for i, h in (override or {}).items():  # 実装時間 h を直接置き換える (感度用)
        lab, st, _, deps, kind = tasks[i]
        tasks[i] = (lab, st, h, deps, kind)
    for i in MAKE[plan]:
        lab, st, h, deps, kind = tasks[i]
        tasks[i] = (lab, st, h * s, deps, kind)
    for i in GEN[plan]:
        lab, st, h, deps, kind = tasks[i]
        tasks[i] = (lab, st, h * t, deps, kind)
    r = E.schedule(tasks)
    return r['total'], r['cp']


if __name__ == '__main__':
    print('基準 (計画の仮定のまま):', {p: tuple(round(x, 1) for x in total(p)) for p in 'ABC'})
    print('\n(1) 手書きだけを縮める (s)。生成は計画のまま (t=1)。総工数 / クリティカルパス (h)')
    for s in (2.0, 1.0, 0.5, 0.25, 0.09, 0.04):
        a, b, c = (total('A', s=s), total('B', s=s), total('C'))
        print(f'  s={s:<5} 案A {a[0]:6.1f}/{a[1]:5.1f}  案B {b[0]:6.1f}/{b[1]:5.1f}  案C {c[0]:6.1f}/{c[1]:5.1f}'
              f'  B-C(総工数) {b[0] - c[0]:+7.1f}  順位 {"C<B (逆転)" if c[0] < b[0] else "B<C"}')
    print('\n(2) 手書きを測った値 (s=0.09) に固定し、生成の倍率 t を動かす。C が B を下回る t の境目')
    s = 0.09
    b = total('B', s=s)
    for t in (2.0, 1.0, 0.5, 0.25, 0.1, 0.05, 0.0):
        c = total('C', t=t)
        print(f'  t={t:<5} 案B {b[0]:6.1f}/{b[1]:5.1f}  案C {c[0]:6.1f}/{c[1]:5.1f}  C-B {c[0] - b[0]:+7.1f}')
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if total('C', t=mid)[0] < b[0]:
            lo = mid
        else:
            hi = mid
    print(f'  C の総工数が B を下回るのは t < {lo:.3f} (生成まわり G5〜G9 の工数を計画の {lo:.1%} 未満にできたとき)')
    # 計画が逆転すると書いた条件 (手書き 2 倍 = s=2) でも、測った s では起きない
    lo, hi = 0.0, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if total('B', s=mid)[0] > total('C')[0]:
            hi = mid
        else:
            lo = mid
    print(f'\n(3) 生成が計画どおり (t=1) のとき、B の総工数が C を超える (逆転する) のは s > {hi:.2f} (手書きの単価が計画の {hi:.2f} 倍より大きいとき)')

    # ---- (4) 測った値を入れた場面の表 (総工数 h / クリティカルパス h)。K=Task の係数、s=手書き、t=生成まわり ----
    print('\n(4) 場面ごとの総工数 / パス。s=0.09 は #9 の測定 (短信 1 問の上限 2 分 34 秒 ÷ 0.5 h = 0.086 を丸めた。案 B の資料束は短信の 2 倍と置く仮定のまま)')
    print('    t は生成まわり G5〜G9 の倍率。0.015 は「試作で覆った範囲の計画時間 約 18 h に対して 約 16〜17 分」からの導出 (範囲は不確か。推奨の根拠にしない)')
    for K in (1.5, 2.0, 2.9):
        E.K = K
        for (s, t, lab) in ((1.0, 1.0, '計画のまま'), (0.09, 1.0, '手書きだけ測った値'), (0.09, 0.3, '手書き + 生成 0.3'), (0.09, 0.1, '手書き + 生成 0.1'), (0.09, 0.015, '手書き + 生成 0.015')):
            a, b, c = total('A', s=s), total('B', s=s), total('C', t=t)
            print(f'  K={K:<3} {lab:<14} 案A {a[0]:6.1f}/{a[1]:5.1f}  案B {b[0]:6.1f}/{b[1]:5.1f}  案C {c[0]:6.1f}/{c[1]:5.1f}  C-B {c[0] - b[0]:+6.1f}')
    E.K = 1.5

    # ---- (5) C − B の分解と、一次資料の確認 (G10 / B9) の感度 (#11 のレビュー 1 回目の指摘 B1 を受けて) ----
    print('\n(5) s=t=0 に近づけたときの C − B (測っていない項目の仮定の差だけが残る)。K=1.5')
    c0, b0 = total('C', t=0.0)[0], total('B', s=0.0)[0]
    print(f'  C − B = {c0 - b0:+.1f} h  (案 C {c0:.1f} − 案 B {b0:.1f})')
    k = E.K
    T = E.PLANS
    parts = [('G3 − B3 (会社の設定と衝突の確認)', T['C']['G3'][2] * k - T['B']['B3'][2] * k),
             ('G4 − B4 (問題テンプレートの設計)', T['C']['G4'][2] * k - T['B']['B4'][2] * k),
             ('G10 − B9 (一次資料での確認)', T['C']['G10'][2] * k - T['B']['B9'][2] * k),
             ('G11 − B10 (スマホでの資料間の表示)', T['C']['G11'][2] * k - T['B']['B10'][2] * k),
             ('Task の包括レビュー (C は B より 1 件多い)', E.REVIEW_PER_TASK * (len(T['C']) - 2 - (len(T['B']) - 2)))]
    for n, v in parts:
        print(f'    {n:<34} {v:+6.1f}')
    print(f'    合計 {sum(v for _, v in parts):+.1f}  (G1/G2/B1/B2 と共通の基盤は同じなので 0)')
    print('\n    s=0.09・t=0.015 のまま G10 の実装時間だけを動かす (B9 = 30 問 × 0.4 h = 12 h):')
    b = total('B', s=0.09)[0]
    for g10 in (8, 12, 16):
        c = total('C', t=0.015, override={'G10': g10})[0]
        print(f'    G10 = {g10:>2} h  案C {c:6.1f}  案B {b:6.1f}  C − B {c - b:+5.1f}')
    print('\n    資料束 1 問の単価が何 h を超えると B が C を超えるか (t=1): s > 1.41 → 1.41 h/問。短信側の上限 0.043 h を引いた IR 側の余裕 =', round(1.41 - 154 / 3600, 2), 'h')
