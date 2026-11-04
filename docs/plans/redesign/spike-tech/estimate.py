# -*- coding: utf-8 -*-
# 試作 (製品のコードではない)。tech-estimates.md §5 の足し算と最短の経路を出す。標準ライブラリのみ。
# 使いかた (リポジトリの根から): python3 docs/plans/redesign/spike-tech/estimate.py
# 単位は tech-estimates.md §2.1 (動いていた時間の壁時計 h。止まる時間は含まない)。どれも仮定の積み上げで、絶対値として使わない。
# 問題データは 2 通りの見方の幅で数える (§2.1): 下限 = 生成器の見方 (固定 + 行ごとの小さな費用)、上限 = 件数に比例する見方 (#25・#26 の 0.03 h/件を ×1.5 まで)。
FIXED = (0.5, 1.0)            # 問題データ 1 系統 (設計表の行を決める・注入器の追加・生成の実行・検査・直し)。#25・#26 の 45〜58 分は、生成器 (595 行・423 行) を初めて作る費用を含むので、これは上限寄りの仮定
FIXED3 = (0.8, 1.6)           # 案 3: 期をまたぐ注入器と、複数期・複数版の生成の拡張を含む
MARG = (0.003, 0.01)          # 設計表に 1 行足すときの費用 (行を書く・生成・検証・目視)。仮定 (未実測)
PROP = (0.025, 0.06)          # 件数に比例する見方 (上限): #25・#26 は 0.03 h/件 (測った)。0.025 = 下限の丸め、0.06 = 引き直し ×1.5 +余裕 (仮定)
V = (0.5, 1.3)                # 検証器の規則の追加
L = (0.5, 1.1)                # 純ロジック + 単体テスト
F = 1.1                       # 画面 + 状態遷移 + E2E (#28)
W = (0.7, 1.9)                # 複雑な画面 (#57。動いていた時間: 40 分 (Sub-task 完了) 〜 1 時間 51 分以上 (止まった時間 3 時間 17 分を除く全体))
R = (0.5, 1.5)                # 包括レビュー・統合・公開の確認
K = (1.0, 2.0)                # 設計の反復の係数 (仮定。実績なし)

def mul(a, k): return (a[0] * k[0], a[1] * k[1])
def add(*xs): return (sum(x[0] for x in xs), sum(x[1] for x in xs))
def mx(*xs): return (max(x[0] for x in xs), max(x[1] for x in xs))
def seq(*xs): return add(*xs)

UI = mul((F + 0.3 * W[0], F + 0.5 * W[1]), K)       # UI 核 = (F + W の 3〜5 割) × 設計の反復
CARD = (0.4 + 0.5, 0.9 + 1.3)                        # カードの導出 (固定のテンプレート) 0.4〜0.9 + 検出可能性の検査 V
E2E1 = (0.5, 1.5); E2E2 = (1.0, 2.5)
def files(n, fixed=FIXED, systems=1):
    lo = systems * fixed[0] + n * MARG[0]
    hi = max(n * PROP[1], systems * fixed[1] + n * MARG[1])
    return (lo, hi)

def show(name, items, cp):
    tot = add(*[v for _, v in items])
    print(f'{name}: 合計 {tot[0]:.1f}〜{tot[1]:.1f} h / 最短の経路 {cp[0]:.1f}〜{cp[1]:.1f} h')
    for k, v in items: print(f'   {k}: {v[0]:.2f}〜{v[1]:.2f}')

print(f'UI 核 {UI[0]:.2f}〜{UI[1]:.2f}')
# 案 1
a = CARD; b = files(57, systems=2); c = (0.3, 0.7); d = (0.3, 0.8)
it = [('1-a カード', a), ('1-b データ 57 件', b), ('1-c 状態遷移', c), ('1-d 撤去', d), ('UI 核', UI), ('E2E', E2E1), ('R', R)]
show('案 1', it, seq(a, mx(b, UI, add(c, d)), E2E1, R))
# 案 2
b = files(25); c = W; d = (0.5, 1.0)
it = [('2-a カード', CARD), ('2-b データ 25 件', b), ('2-c 展開', c), ('2-d 状態遷移', d), ('UI 核', UI), ('E2E', E2E2), ('R', R)]
show('案 2', it, seq(CARD, mx(b, c, add(UI, d)), E2E2, R))
# 案 3 (社数 n、異変の版 k=1 で 1 期 = 正常 + 異変 1 版)
for n, new in ((1, 13), (3, 40), (10, 132)):
    a3 = (1.0, 2.5); b3 = files(new, FIXED3); c3 = (0.7, 1.5); d3 = (1.0, 2.4); e3 = (0.5, 1.0)
    it = [('3-a 系列の規則', a3), (f'3-b データ {new} 件', b3), ('3-c 出題・保存', c3), ('3-d カード+持ち越し', d3), ('3-e 状態遷移', e3), ('UI 核', UI), ('E2E', E2E2), ('R', R)]
    show(f'案 3 (N={n} 社, k=1)', it, seq(mx(seq(a3, b3), add(d3, mx(UI, e3), (0, 0))), E2E2, R))
