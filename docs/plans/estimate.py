"""案 A・B・C の Story/Task の DAG から、総工数・クリティカルパス・並列の幅を出す (標準ライブラリのみ)。

使いかた: python3 docs/plans/estimate.py
入力はすべて仮定 (docs/plans/plan-comparison.md の「見積もりの単位」)。測った値ではない (AI の利用枠の実測値 MEASURED を除く)。

案の軸は 2 つだけ: 画面の単位 (A は決算短信のみ / B・C は決算短信 + IR) と、問題の作りかた
(A・B は手書き / C は生成)。図鑑・共有・演出・解説・3 段目の難易度は、全案で同じ「追加オプション」
として別に出す (OPTIONS)。基本の案には含めない。

Task の見積もり (組の作業時間) = 実装時間 × K (ケース表の固定とサブタスクのレビューの往復を含む)。
Task の包括レビューは、Task 1 件につき REVIEW_PER_TASK 時間 (係数を掛けない) を総工数にだけ足す
(別の監視役が Task ごとに行うので、日程の経路には入れない)。Story の包括レビューは 5 Story × 1 時間で、
経路の最後に入れる。日程は最早開始: 依存が済んだ Task は同時に始める (組の数に上限は無い)。
"""
K = 1.5  # 実装時間 -> 組の作業時間。仮定
REVIEW_PER_TASK = 0.5  # Task の包括レビュー 1 件あたり (h)。仮定
STORY_REVIEW = 5 * 1.0  # Story 5 つの包括レビューと是正 (h)。仮定

# id: (名前, Story, 実装時間 h, 依存, 種別)  種別 m=手書きの問題制作 v=一次資料での確認 g=生成の設計 o=その他
# (m と v は、感度の scale_content では内容として一緒に縮める。測った値の置き換え (S_MEASURED) は m だけ)
COMMON = {
    'C0': ('技術方針と ADR', '基盤', 2, [], 'o'),
    'C1': ('問題データ形式・全体設計', '基盤', 3, ['C0'], 'o'),
    'C2': ('進行ロジック (判定・周回・戻り・クリア)', '基盤', 4, ['C1'], 'o'),
    'C3': ('共通 UI (タイトル・難易度選択・結果・答え合わせ・スマホの土台)', '基盤', 6, ['C1'], 'o'),
    'C4': ('公開の設定 (Vercel・ビルド・CI)', '公開', 2, ['C0'], 'o'),
    'C5': ('免責・ライセンス・素材方針', '公開', 1, ['C0'], 'o'),
    'C6': ('正常の見せ方 (毎回同じ書式の規則と、各難易度の最初の 1 問の見本表示)', '基盤', 1.5, ['C2', 'C3'], 'o'),
}


def tail(contents):
    deps = list(contents) + ['C2', 'C3', 'C4', 'C5', 'C6']
    return {
        'F1': ('結合テスト・クリア確認 (全難易度)', '品質', 3, deps, 'o'),
        # Story の包括レビューと是正。実作業の時間なので K を打ち消して入れる
        'F2': ('Story の包括レビューと是正 (5 Story × 1 時間)', '品質', STORY_REVIEW / K, ['F1'], 'o'),
    }


# ---- 案 A: 決算短信のみ (IR を外す)・手書き固定 ----
A = dict(COMMON)
A.update({
    'A1': ('画面テンプレート: 短信サマリー・貸借・損益', '中身', 2 * 3, ['C1'], 'o'),
    'A2': ('画面テンプレート: キャッシュ・フロー・注記', '中身', 2 * 2, ['C1'], 'o'),
    'A3': ('架空の会社の設定 (6 社。明らかに架空と分かる付けかた) と、実在の法人名との衝突の確認 (国税庁の法人番号公表サイトの全件データと突き合わせる)', '中身', 1.5, ['C1'], 'o'),
    'A4': ('問題制作 やさしい 1〜8 問目', '中身', 8 * 0.5, ['A1', 'A2', 'A3'], 'm'),
    'A5': ('問題制作 やさしい 9〜15 問目', '中身', 7 * 0.5, ['A1', 'A2', 'A3'], 'm'),
    'A6': ('問題制作 むずかしい 1〜8 問目', '中身', 8 * 0.5, ['A1', 'A2', 'A3'], 'm'),
    'A7': ('問題制作 むずかしい 9〜15 問目', '中身', 7 * 0.5, ['A1', 'A2', 'A3'], 'm'),
    'A8': ('一次資料での会計の確認 (全 30 問 × 0.25)', '中身', 30 * 0.25, ['A4', 'A5', 'A6', 'A7'], 'v'),
    'A9': ('スマホでの表の表示 (短信)', '遊び', 3, ['A1', 'A2', 'C3'], 'o'),
})
A.update(tail(['A4', 'A5', 'A6', 'A7', 'A8', 'A9']))

# ---- 案 B: 決算短信 + IR・手書きのテンプレート (会社 × 資料束) ----
B = dict(COMMON)
B.update({
    'B1': ('画面テンプレート: 短信 5 (サマリー・貸借・損益・CF・注記)', '中身', 2 * 5, ['C1'], 'o'),
    'B2': ('画面テンプレート: IR スライド 5 (ハイライト・業績・セグメント・見通し・補足)', '中身', 2 * 5, ['C1'], 'o'),
    'B3': ('架空の会社の設定 (8 社。明らかに架空と分かる付けかた) と、実在の法人名との衝突の確認 (法人番号公表サイトの全件データ)', '中身', 2, ['C1'], 'o'),
    'B4': ('問題テンプレート (会社 × 資料束) の設計', '中身', 6, ['B1', 'B2', 'B3'], 'o'),
    'B5': ('問題制作 やさしい 1〜8 問目 (資料束)', '中身', 8 * 1.0, ['B4'], 'm'),
    'B6': ('問題制作 やさしい 9〜15 問目', '中身', 7 * 1.0, ['B4'], 'm'),
    'B7': ('問題制作 むずかしい 1〜8 問目', '中身', 8 * 1.0, ['B4'], 'm'),
    'B8': ('問題制作 むずかしい 9〜15 問目', '中身', 7 * 1.0, ['B4'], 'm'),
    'B9': ('一次資料での会計・資料間整合の確認 (全 30 問 × 0.4)', '中身', 30 * 0.4, ['B5', 'B6', 'B7', 'B8'], 'v'),
    'B10': ('スマホでの資料間の表示', '遊び', 5, ['B1', 'B2', 'C3'], 'o'),
})
B.update(tail(['B5', 'B6', 'B7', 'B8', 'B9', 'B10']))

# ---- 案 C: 案 B と同じ画面・同じ資料束。問題を生成して異変を注入する ----
C = dict(COMMON)
C.update({
    'S1': ('画面テンプレート: 短信 5', '中身', 2 * 5, ['C1'], 'o'),
    'S2': ('画面テンプレート: IR スライド 5', '中身', 2 * 5, ['C1'], 'o'),
    'S3': ('会社の名前と設定の生成規則 (明らかに架空と分かる付けかた) と、実在の法人名との衝突の確認 (法人番号公表サイトの全件データ)', '中身', 3, ['C1'], 'o'),
    'S4': ('問題テンプレート (会社 × 資料束) の設計', '中身', 6, ['S1', 'S2', 'S3'], 'o'),
    'S5': ('正常データの生成 (貸借の等式・損益の連鎖・CF の連動・比率)', '生成', 12, ['S4'], 'g'),
    'S6': ('異変の注入: 見た目・計算 10 種類', '生成', 10 * 1.0, ['S5'], 'g'),
    'S7': ('異変の注入: 会計・注記・継続企業 10 種類', '生成', 10 * 1.0, ['S5'], 'g'),
    'S8': ('異変の注入: 資料間の矛盾 5 種類 (IR と短信)', '生成', 5 * 1.0, ['S5'], 'g'),
    'S9': ('整合の検証 (正常データが全規則を満たす・異変が 1 つだけを変える)', '生成', 8, ['S6', 'S7', 'S8'], 'g'),
    'S10': ('一次資料での確認 (生成の規則と異変の規則のレビュー)', '中身', 8, ['S9'], 'v'),
    'S11': ('スマホでの資料間の表示', '遊び', 5, ['S1', 'S2', 'C3'], 'o'),
})
C.update(tail(['S6', 'S7', 'S8', 'S9', 'S10', 'S11']))

PLANS = {'A': A, 'B': B, 'C': C}
# 異変の種類の数 (設計値。仮定): A は見た目 5・計算 5・会計 10、B・C はそれに資料間の矛盾 5
KINDS = {'A': 20, 'B': 25, 'C': 25}
# 追加オプション (全案で同じ既定は「入れない」)。実装時間 (h)。K を掛けて組の作業時間にする。
# (名前, {案: 実装時間}, 人間が言ったか)
OPTIONS = {
    'O1': ('図鑑と保存 (ブラウザ内)', {'A': 4, 'B': 4, 'C': 4}),
    'O2': ('結果共有と共有用画像', {'A': 3, 'B': 3, 'C': 3}),
    'O3': ('雰囲気のある演出 (配色・遷移)', {'A': 4, 'B': 4, 'C': 4}),
    'O4': ('厚い演出 (遷移・音つき。O3 の代わり)', {'A': 8, 'B': 8, 'C': 8}),
    'O5': ('理由 1 行の解説 (種類 × 0.2 h)', {k: KINDS[k] * 0.2 for k in KINDS}),
    'O6': ('理由 + 用語の解説 (種類 × 0.3 h。O5 の代わり)', {k: KINDS[k] * 0.3 for k in KINDS}),
    # ふつう (3 段目): 手書きは問題 15 問 + 確認、生成は設定だけ
    'O7': ('ふつう (3 段目の難易度)', {'A': 15 * 0.5 + 15 * 0.25, 'B': 15 * 1.0 + 15 * 0.4, 'C': 3}),
}


def schedule(tasks, scale_content=1.0, scale_gen=1.0, scale_make=1.0):
    """scale_content は m と v (内容)、scale_gen は g (生成)、scale_make は m だけ (測った値の置き換え) に掛ける。"""
    T = {}
    for i, (lab, st, h, deps, kind) in tasks.items():
        f = scale_content if kind in ('m', 'v') else scale_gen if kind == 'g' else 1.0
        if kind == 'm':
            f *= scale_make
        T[i] = dict(lab=lab, story=st, h=h * K * f, deps=deps, kind=kind)
    ES, EF = {}, {}

    def go(i):
        if i in EF:
            return EF[i]
        ES[i] = max([go(d) for d in T[i]['deps']], default=0.0)
        EF[i] = ES[i] + T[i]['h']
        return EF[i]

    for i in T:
        go(i)
    cp = max(EF.values())
    end = max(EF, key=EF.get)
    path = [end]
    while T[path[-1]]['deps']:
        path.append(max(T[path[-1]]['deps'], key=lambda x: EF[x]))
    path.reverse()
    pts = sorted(set(list(ES.values()) + list(EF.values())))
    width = max(sum(1 for i in T if ES[i] <= (a + b) / 2 < EF[i]) for a, b in zip(pts, pts[1:]))
    n_work = len([i for i in T if i not in ('F1', 'F2')])
    review = REVIEW_PER_TASK * n_work
    dag_total = sum(t['h'] for t in T.values())
    return dict(T=T, ES=ES, EF=EF, cp=cp, path=path, dag_total=dag_total, review=review,
                total=dag_total + review, width=width, n_work=n_work)


# ---- 段階公開 (案 B を、1 回目 = 案 A の範囲、2 回目 = IR の追加、の 2 回に分けて出す) ----
# 1 回目の DAG は案 A そのもの。2 回目は、案 B にしか無い Task だけ (案 A の短信の画面・会社・短信の問題は残す)。
STAGE2 = {
    'T1': ('画面テンプレート: IR スライド 5', '中身', 2 * 5, [], 'o'),
    'T2': ('問題テンプレート (会社 × 資料束) の設計', '中身', 6, ['T1'], 'o'),
    'T3': ('会社の追加 (6 社 → 8 社) と、実在の法人名との衝突の確認', '中身', 0.5, [], 'o'),
    'T4': ('問題制作 やさしい 1〜8 問目 (資料束)', '中身', 8 * 1.0, ['T2', 'T3'], 'm'),
    'T5': ('問題制作 やさしい 9〜15 問目', '中身', 7 * 1.0, ['T2', 'T3'], 'm'),
    'T6': ('問題制作 むずかしい 1〜8 問目', '中身', 8 * 1.0, ['T2', 'T3'], 'm'),
    'T7': ('問題制作 むずかしい 9〜15 問目', '中身', 7 * 1.0, ['T2', 'T3'], 'm'),
    'T8': ('一次資料での会計・資料間整合の確認 (資料束 30 問 × 0.4)', '中身', 30 * 0.4, ['T4', 'T5', 'T6', 'T7'], 'v'),
    'T9': ('スマホでの資料間の表示の増分 (案 B の 5 − 案 A の 3)', '遊び', 5 - 3, ['T1'], 'o'),
    'F1': ('2 回目の結合テスト・クリア確認', '品質', 3, ['T8', 'T9'], 'o'),
    'F2': ('2 回目の Story の包括レビューと是正 (5 Story × 1 時間)', '品質', STORY_REVIEW / K, ['F1'], 'o'),
}


def staged_summary(measured=False):
    """段階公開の総工数・1 回目の公開までの経路・完成までの経路 (1 回目の後に 2 回目を始める)。
    measured=True なら、手書きの問題制作 (m) を S_MEASURED 倍にする。"""
    sm = S_MEASURED if measured else 1.0
    s1 = schedule(A, scale_make=sm)
    s2 = schedule(STAGE2, scale_make=sm)
    return dict(
        stage1_total=s1['total'], stage1_cp=s1['cp'],
        stage2_dag=s2['dag_total'], stage2_review=s2['review'], stage2_total=s2['total'], stage2_cp=s2['cp'],
        total=s1['total'] + s2['total'], elapsed=s1['cp'] + s2['cp'],
    )


def option_hours(plan, key):
    return OPTIONS[key][1][plan] * K


# ---- 測った値による置き換え (Task #8 の技術の見立て。docs/plans/tech-assessment.md) ----
# 手書き 1 問の制作: 外で確かめられる上限で、短信 5 画面分 + 異変 1 つが 2 分 34 秒 (計画の 0.5 h の 0.086 倍)、
# 資料束 (短信 + IR スライド 5 枚 + 資料間の矛盾 1 つ) が 6 分 9 秒 (計画の 1.0 h の 0.103 倍)。
# 上側を丸めた 0.10 を、手書きの問題制作 (種別 m) の実装時間に掛ける。n = 1、AI が作成。
S_SHORT_MEASURED = 154 / 1800   # 0.0856
S_BUNDLE_MEASURED = 369 / 3600  # 0.1025
S_MEASURED = 0.10
# 生成の倍率 t (導いた。大きな不確かさ): 試作の経過 約 13 分〜16 分 55 秒を、覆った範囲の計画時間 約 18 h で割った 0.012〜0.016。
# 範囲外 (注記・IR 側・資料間の矛盾・19 種類の注入) は重い可能性が高いので、順位を決めない。
T_MEASURED_MID = 0.015
# 測っていない項目 (基盤・テンプレート・一次資料での確認 A8/B9/S10・スマホ表示・係数・包括レビュー) は計画の仮定のまま。
# したがって「測定反映」の総工数は、測った項目と仮定の項目を混ぜた尺度で、絶対値としては使えない。


def schedule_measured(plan_tasks, t=1.0, s=S_MEASURED, **kw):
    """手書きの問題制作 (m) を s 倍、生成 (g) を t 倍にした日程。確認 (v) は縮めない。"""
    return schedule(plan_tasks, scale_gen=t, scale_make=s, **kw)


def t_boundary(s=S_MEASURED):
    """案 C の総工数が案 B (手書きを s 倍) と等しくなる生成の倍率 t。これより小さい t で C が B を下回る。"""
    b = schedule_measured(B, s=s)['total']
    lo, hi = 0.0, 1.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if schedule_measured(C, t=mid)['total'] < b:
            lo = mid
        else:
            hi = mid
    return lo


# ---- 1 回のクリアの長さ: 間違えると最初に戻る型での期待値 ----
def expected_questions(p, n):
    """1 問を正しく判定する確率 p、連続 n 問でクリアのとき、クリアまでに見る問題数の期待値。
    (1 - p^n) / ((1 - p) * p^n)。間違えたら最初から数え直す。"""
    return (1 - p ** n) / ((1 - p) * p ** n)


def pool_extension_hours(plan, extra_questions, measured=False):
    """難易度ごとの問題のプールを広げる追加工数 (組の作業時間 h)。案 C は生成なので 0。
    手書き 1 問あたり: 案 A (制作 0.5 + 確認 0.25) × K、案 B (制作 1.0 + 確認 0.4) × K。
    measured=True なら制作を S_MEASURED 倍にする (確認は計画の仮定のまま)。"""
    s = S_MEASURED if measured else 1.0
    per = {'A': (0.5 * s + 0.25) * K, 'B': (1.0 * s + 0.4) * K, 'C': 0.0}[plan]
    return per * extra_questions


# ---- AI の利用枠 (測った値)。~/.claude/projects/ の組のセッションの記録から、assistant の usage を
# メッセージ ID ごとに 1 回だけ合計した (2026-11-03)。Task #3 の作業 (Sub-task #4・#5・#6 と、
# Sub-task のレビュー) の区間 12:34:32〜13:17:10 UTC (13:18:00 UTC までのメッセージ)。包括レビューは別。
# 再現: python3 docs/plans/usage.py <記録のディレクトリ> 2026-11-03T13:18:00Z ----
MEASURED = {
    'window_hours': (42 * 60 + 38) / 3600,  # 12:34:32〜13:17:10 UTC は 42 分 38 秒
    'executor_sonnet': {'input': 216, 'output': 188_199, 'cache_read': 20_794_908, 'cache_creation': 449_853},
    'inspector_opus': {'input': 124, 'output': 66_609, 'cache_read': 9_487_046, 'cache_creation': 232_441},
    'comprehensive_review_opus': {'input': 38, 'output': 33_579, 'cache_read': 1_888_005, 'cache_creation': 115_893},
    'comprehensive_review_minutes': 6.2,  # 13:23:01〜13:29:12 UTC
    'task3_estimate_hours': 3.0,  # Task #3 の見積もり (仮定)
}


def ai_rates():
    """Task #3 の実測から、見積もり 1 時間あたりと、経過 1 時間あたり (1 組) の消費。
    下限 = 見積もり 3 h あたり (見積もりが実際より大きかった分を割り引く)、
    上限 = 経過時間あたり (1 見積もり時間 = 1 経過時間と置く)。"""
    m = MEASURED
    out = m['executor_sonnet']['output'] + m['inspector_opus']['output']
    cache = m['executor_sonnet']['cache_read'] + m['inspector_opus']['cache_read']
    return {
        'out_per_est_h': out / m['task3_estimate_hours'],
        'out_per_elapsed_h': out / m['window_hours'],
        'cache_per_est_h': cache / m['task3_estimate_hours'],
        'cache_per_elapsed_h': cache / m['window_hours'],
    }


def limited_makespan(tasks, k):
    """同時に動かせる組を k に限ったときの経過時間 (h)。依存が済んだ Task を、残りの経路が長い順に k 個まで始める
    (リスト・スケジューリング)。k が十分大きければ最早開始の経路 (cp) と一致する。"""
    T = {i: v[2] * K for i, v in tasks.items()}
    deps = {i: v[3] for i, v in tasks.items()}
    succ = {i: [] for i in tasks}
    for i, ds in deps.items():
        for d in ds:
            succ[d].append(i)
    rem = {}

    def tail_len(i):
        if i in rem:
            return rem[i]
        rem[i] = T[i] + max([tail_len(s) for s in succ[i]], default=0.0)
        return rem[i]

    for i in tasks:
        tail_len(i)
    done, running, t = {}, {}, 0.0  # running: id -> finish time
    while len(done) < len(tasks):
        ready = [i for i in tasks if i not in done and i not in running and all(d in done for d in deps[i])]
        ready.sort(key=lambda i: -rem[i])
        while ready and len(running) < k:
            i = ready.pop(0)
            running[i] = t + T[i]
        t = min(running.values())
        for i in [i for i, f in running.items() if f <= t + 1e-9]:
            done[i] = running.pop(i)
    return t


def ai_range(plan, t=1.0, s=S_MEASURED):
    """測定反映の AI の利用枠 (出力トークン) の下限〜上限。測った分 (手書きの制作 m・生成 g) には経過あたりの率を、
    残り (計画の尺度) には見積もりあたりの率 (下限) と経過あたりの率 (上限) の幅を掛ける。"""
    r = schedule_measured(PLANS[plan], t=t, s=s)
    rt = ai_rates()
    kinds = ('m',) if plan in ('A', 'B') else ('g',)
    mh = sum(x['h'] for x in r['T'].values() if x['kind'] in kinds)
    lo = (r['total'] - mh) * rt['out_per_est_h'] + mh * rt['out_per_elapsed_h']
    return lo, r['total'] * rt['out_per_elapsed_h']


if __name__ == '__main__':
    for k, tasks in PLANS.items():
        r = schedule(tasks)
        print(f"案 {k}: DAG の和 {r['dag_total']:.1f} h + Task の包括レビュー {r['review']:.1f} h = 総工数 {r['total']:.1f} h"
              f" / クリティカルパス {r['cp']:.1f} h / 並列の幅 {r['width']} / Task {len(r['T'])}")
        print('  パス:', ' -> '.join(r['path']))
    print('追加オプション (組の作業時間 h)')
    for key, (name, hrs) in OPTIONS.items():
        print(' ', key, name, ' | '.join(f"{k} {option_hours(k, key):.1f}" for k in 'ABC'))
    print('感度 (総工数 / クリティカルパス)')
    for sc, sg, lab in [(1, 1, '基準'), (0.5, 0.5, '内容・生成 ×0.5'), (1.5, 1.5, '内容・生成 ×1.5'),
                        (1, 2, '生成だけ ×2'), (2, 1, '内容だけ ×2')]:
        print(' ', lab, ' | '.join(
            f"{k} {schedule(v, sc, sg)['total']:.0f}/{schedule(v, sc, sg)['cp']:.0f}" for k, v in PLANS.items()))
    print('期待問題数 (間違えると最初から): p=1問の正答率, n=連続クリア数')
    for n in (5, 8):
        print(' ', f'n={n}', ' '.join(f'p={p}: {expected_questions(p, n):.1f}問' for p in (0.7, 0.8, 0.9)))
    print('プールを 25 問/難易度にする追加工数 (+10 問/難易度 = +20 問):',
          ' '.join(f'{k} {pool_extension_hours(k, 20):.1f}h' for k in 'ABC'))
    r = ai_rates()
    print('AI の利用枠 (出力トークン): 見積もり 1 h あたり %.0f / 経過 1 h あたり %.0f' % (r['out_per_est_h'], r['out_per_elapsed_h']))
    for k, v in PLANS.items():
        s = schedule(v)
        print(f"  案 {k} 総工数 {s['total']:.1f} h -> 出力 {s['total']*r['out_per_est_h']/1e6:.1f}〜{s['total']*r['out_per_elapsed_h']/1e6:.1f} M")
    print('同時に動かす組を絞ったときの経過時間 (h)')
    for k, v in PLANS.items():
        print(' ', k, ' '.join(f'k={n}: {limited_makespan(v, n):.1f}' for n in (1, 2, 3, 5, 8)))
    st = staged_summary()
    b = schedule(B)
    print('段階公開 (1 回目 = 案 A の範囲、2 回目 = IR の追加):')
    print(f"  1 回目 総工数 {st['stage1_total']:.1f} h・経路 {st['stage1_cp']:.1f} h / 2 回目 DAG の和 {st['stage2_dag']:.1f} h + Task の包括レビュー {st['stage2_review']:.1f} h = {st['stage2_total']:.1f} h・経路 {st['stage2_cp']:.1f} h")
    print(f"  合計 {st['total']:.1f} h (一括の案 B {b['total']:.1f} h との差 {st['total'] - b['total']:+.1f} h)、完成までの経路 {st['elapsed']:.1f} h (一括 {b['cp']:.1f} h との差 {st['elapsed'] - b['cp']:+.1f} h)、1 回目の公開 {st['stage1_cp']:.1f} h (一括より {b['cp'] - st['stage1_cp']:.1f} h 早い)")
    print('---- 測定反映 (Task #8 の測った値。手書きの問題制作 m を s 倍、生成 g を t 倍、確認 v は縮めない。混ぜた尺度) ----')
    print(f'  s = {S_MEASURED} (測った上限の比: 短信 {S_SHORT_MEASURED:.4f}・資料束 {S_BUNDLE_MEASURED:.4f} の上側を丸めた)')
    for k in 'AB':
        m = schedule_measured(PLANS[k])
        print(f"  案 {k}: 総工数 {m['total']:.1f} h・経路 {m['cp']:.1f} h")
    for tv in (1.0, 0.3, T_MEASURED_MID):
        m = schedule_measured(C, t=tv)
        print(f"  案 C (t = {tv}): 総工数 {m['total']:.1f} h・経路 {m['cp']:.1f} h")
    print(f'  案 C が案 B と並ぶ t の境目: {t_boundary():.3f}')
    ms = staged_summary(measured=True)
    print(f"  段階公開: 2 回目 {ms['stage2_total']:.1f} h・合計 {ms['total']:.1f} h・完成までの経路 {ms['elapsed']:.1f} h")
    print('  プール 25 問/難易度の追加 (+20 問):', ' '.join(f'{k} {pool_extension_hours(k, 20, True):.1f}h' for k in 'AB'))
    for k in 'AB':
        lo, hi = ai_range(k)
        print(f"  AI の利用枠 (出力トークン) 案 {k}: {lo/1e6:.1f}〜{hi/1e6:.1f} 百万")
    lo, _ = ai_range('C', T_MEASURED_MID)
    _, hi = ai_range('C', 1.0)
    print(f"  AI の利用枠 (出力トークン) 案 C: {lo/1e6:.1f}〜{hi/1e6:.1f} 百万 (下限は t = {T_MEASURED_MID}、上限は t = 1)")
