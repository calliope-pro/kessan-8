# 問題の設計表 v3: やさしい 85 問 + 見本 1 つ

Sub-task #167 (Task #139)。作成: 2026-11-09。置き換えるもの: 第 1 版 [problems-easy.md](problems-easy.md) (25 問。カードの形・R-S5 の前)、第 2 版 (ブランチ calliope/problems-easy-v2 の commit 1f32b79。要件 第 2 版の 3 形・E-18・E-20 を前提にしており、v3 では使えない)。
根拠: [requirements.md](../requirements.md) (第 3 版)・[design-v3.md](../design-v3.md) の §1.2 (形)・§1.5 (問題の数・R-S5)・§1.6 (cardEdits)・§2.2 (やさしい 15 種類)・§2.7 (段・出題)・§3.2 #139・[charter.md](../charter.md)・[test-cases/cards.md](../test-cases/cards.md) §7 (データの検査 DS1〜DS20)・§10 (今のデータの警告)・§13。材料: [companies.md](companies.md) (10 社)・[problems-easy/profiles.py](problems-easy/profiles.py) (会社ごとの数字の係数)。
一覧の元は [problems-easy/spec-v3.json](problems-easy/spec-v3.json) (`make-spec-v3.py` が作る。手で直さない)。下の表と数は同じデータから作り、[scripts/problems-easy-spec.test.ts](../../scripts/problems-easy-spec.test.ts) が数え直す。
印: **要件** (requirements.md) / **導いた** (spec-v3.json を数えた。テスト SP1〜SP14) / **測った** (コマンドの結果。再現を添える) / **設計** (本書の取り決め。責任者が変えてよい) / **仮定** / **未確認**。

## 1. 条件と、この設計が満たす数

| 条件 | 出所 | 値 | 結果 |
| --- | --- | --- | --- |
| 問題の数 85 | 設計 §1.5・`CARD_POOL_SIZE.easy`・検証器 DS15 | **85** (正常 10 + 異変 75 = 15 種類 × 5 問) | 満たす (導いた。SP1) |
| 異変は 15 種類 (要件は 12 種類以上) | 要件 5・設計 §2.2 | 台帳 v3 のやさしい **15 種類のちょうど全部** (E-17・E-02・E-24・E-03・E-05・E-22・E-21・E-25・E-26・E-27・E-19・E-23・E-28・E-12・E-04)。数え方は設計 §2.4 (主な数え方 15・責任者の推測の E-19 を外しても 14・最悪の数え方 8 は責任者が主な数え方で満たすと決めた) | 満たす (導いた。SP2。`anomaly-kinds.json` の `ledger: 'v3'` のやさしい種類と同じ集合) |
| カードの形は 1 種類 | 要件 第 3 版・設計 §1.2 | もうけ (表題・見出し語・数字 4 欄・足元) | 満たす (形は `deriveCards` が決める。この表は形を持たない) |
| 種類ごとに 5 問・5 社 | 設計 §1.5・検証器 DS14 (`KIND_PROBLEMS.default`・`KIND_MIN_COMPANIES`) | 15 種類すべてが 5 問・5 社 (同じ会社に同じ種類は 1 問) | 満たす (導いた。SP3。下の §3 の表) |
| 段ごとに、会社どうしの異変の問題の数の差が 1 問以内 (0 問の会社も数える) | 設計 §2.7・検証器 DS12 (`TIER_BALANCE_MAX_GAP`) | 段 1 = 全社 5 問 (差 0)・段 2 = 5 社が 2 問・5 社が 1 問 (差 1)・段 3 = 全社 1 問 (差 0)。1 社が持つ異変の問題は 7 か 8 問 | 満たす (導いた。SP4・SP13) |
| 全 10 社が、正常な問題と異変の問題の両方を持つ (会社から答えが漏れない。R-S5 (b)) | 設計 §1.5・DS6 | 10 社すべて (正常 1 問 + 異変 7〜8 問) | 満たす (導いた。SP5) |
| どの (会社 × 期) にも、正常と異変の両方 (R-S5 (d)) | 設計 §1.5・DS7 | 10 (会社 × 期) = 1 社 1 期。異変の問題は同じ (会社, 期) の正常な問題が基 (`base`) | 満たす (導いた。SP5) |
| 正常な問題は段を持たない | 設計 §2.7・DS13 | 正常 10 問に `tier` を付けない | 満たす (導いた。SP6) |
| 正常な問題に、カードに出る語の両方の向き (R-S5 (f)) | 設計 §1.5・DS8 (`CLAIM_DOWN_MIN_COMPANIES.operatingIncome` = 3) | 減益 **4 社** (c02・c05・c08・c10)・増益 6 社 | 満たす (導いた。SP6。余裕 1 社) |
| 異変の問題の 8 割以上が 見た目 + 計算 | 検証器 `FAMILY_SHARE_MIN.easy` = 0.8 | 75 問のうち文章 (E-17) は 5 問。**70/75 = 93%** | 満たす (導いた) |
| 金額は 6 桁以内 | #139 の申し送り (桁マスの都合) | **導いた** (profiles.py の `growth` の上限・`om` と gen.py のゆらぎ +0.6 ポイントから。spec-v3.json の `salesRange`・`opRange`): 売上高の最大は c10 の 200,000 × 1.06³ = **238,203**。10 倍にする E-02 (増益の基 c03・c06・c07) の営業利益の最大は c03 の 6,611・c06 の 6,353・c07 の 2,177 なので、10 倍にしても **66,110 以下**。どちらも 999,999 以下 | 満たす (導いた。SP14)。生成後に全セルを数えて確かめるのは #168 のテスト |
| 見本は 1 つ。プールの (会社 × 期) と重ならない | 検証器 `sample-overlaps-pool` | c09 キュルネ教育 2023 年 3 月期 (プールの c09 は 2025 年 3 月期)。**IR 億円・金額 10 の倍数で作り直し済み** (commit 9b9e08a) | 満たす (導いた。SP10) |

## 2. 会社 × 期と、数字の動き (正常な問題 10 問)

1 社 1 期。「向き」は営業利益の前期 → 当期の向き (カードの見出し語になる。やさしいの見出し語は営業利益の主張だけ。設計 §1.4 R-D5)。営業利益率の目安は [profiles.py](problems-easy/profiles.py) の `om` (実際の値は生成のたびに ±0.4〜0.6 ポイントゆらぐ)。

| 会社 | 期 | 向き | 営業利益率の目安 | この向き・期にした理由 |
| --- | --- | --- | --- | --- |
| c01 ミオトリ精機 | 2025年3月期 | 増益 | 9.0% | |
| c02 クレセラ食品 | 2025年3月期 | **減益** | 4.2% | 減益 (R-S5 (f))。E-02 は減益の基なので 1/10 |
| c03 ソルベリマート | **2024年2月期** | 増益 | 3.6% | **閏日** (期末 2024-02-29)。E-04 の「ずらした年の月末日にする」(設計 §2.5) を実データで通す。E-02 は増益の基 (営業利益率が 8% 以下) |
| c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 14.0% | |
| c05 ブルネラ製薬 | 2025年12月期 | **減益** | 11.0% | 減益 (R-S5 (f)) |
| c06 トラウネ建設 | 2025年3月期 | 増益 | 5.0% | E-02 は増益の基 (営業利益率 8% 以下) |
| c07 ザルツァ運輸 | 2025年6月期 | 増益 | 2.6% | E-02 は増益の基 (営業利益率 8% 以下) |
| c08 セレニア不動産 | 2025年12月期 | **減益** | 17.0% | 減益 (R-S5 (f)) |
| c09 キュルネ教育 | 2025年3月期 | 増益 | 8.0% | 営業利益率が 8% の境目なので、E-02 の増益の基には使わない |
| c10 ヨクトス商事 | 2025年3月期 | **減益** | 1.8% | 減益 (R-S5 (f))。E-02 は減益の基なので 1/10。売上高が 6 桁 (約 20 万百万円) の会社に 10 倍の異変を置かない |

**正常な問題の作り方 (設計。生成器 #168 の約束)**:
- **営業利益の向きは、spec の `op` の期だけ、その向きで前期比 2% 以上になるまで引き直す** (`gen.py` の `step` の `want`)。減益の期は、営業利益率を下げ寄りに (`OM_DRIFT_DOWN` = U(−0.010, +0.002)) 引き、売上高の伸びも下側の 40% の範囲から引く (`profiles.py`)。v1 のゆらぎ (U(−0.004, +0.006)) では、c08 2025 年の減益が 200 回引いても出なかった (測った。`gen.py` が「利益の増減が収まらない」で止まった)。増益の期とほかの期は v1 のまま (見本 c09 2023 年の数字が動かない。ただし次期の見通しは §2 の次の約束のとおり変わった)。
- **次期の見通し (IR の `outlook.forecast`) は、問題ごとの乱数 (会社 id・期) から引く** (時系列の乱数の流れが、後の期の引き直しで変わっても、見本や前の期の問題が変わらないように)。見本 c09 2023 年は、commit 9b9e08a のものと、この見通しの 4 つの数字 (売上高・同前期比・営業利益・同前期比) だけが違う。
- **同じ会社の期は 1 本の時系列でつなぐ** (基準年 2022 → 期。前期の数字は前の期の当期)。見本 c09 2023 年と c09 2025 年は同じ時系列 (2024 年を飛ばす)。生成の乱数は会社 id から作った種で、同じ入力から同じ JSON が出る (今の `gen.py` と同じ)。
- **期は過去** (発表日が 2026-11 より前)。
- **営業赤字・最終赤字は使わない**。**カードの 4 欄 (売上高・営業利益 前期・当期・営業利益率) は負にしない** (設計 §3.2 #139 の 3)。営業利益は前期比 ±20% 以内を目安にし、検証器の `card-relation` の R-range (0.5 ≤ ③ ÷ ② ≤ 2)・R-ne (③ ≠ ②)・R-lt (③ < ①) を満たす。営業利益率は小数第 1 位に四捨五入。期末日は期の月の末日。
- **営業利益の前期比は、増減が見て取れる大きさにする**: |③ ÷ ② − 1| ≥ 2% (#168 の約束。レビュー 1 回目 N4)。今のデータの実測の最小は 2.1% (設計 §1.2 の表)。引き直しで −0.5% 前後 (4,620 → 4,600 など) の減益ができると、段 1 の E-17 (向きが逆) が 3 桁目の比べ合いになる。生成器に下限を置き、#168 のテストで全 10 問に当てる。
- **IR は全社 億円・小数第 1 位・金額は 10 の倍数** (今の `gen.py` は `irUnit` が億円の会社を 10 の倍数で作る。`companies.json` を全社億円にした commit 9b9e08a で、全社が同じ作りになった)。IR の純有利子負債 (前期) は、丸めたあとの有利子負債 (前期) − 丸めたあとの現金 (前期) で作る (設計 §3.2 #139 の 3。`ir-supp-net-debt` の 0.1 のずれを避ける)。
- **疑わしく見える要素 (大きな設備投資・特別損益・減配・会計方針の変更・後発事象など) は入れない**。やさしいのカードに載らないので、正常を見分ける手がかりにならず、問題データの整合の検査だけが増える (第 2 版の設計表と同じ考え)。第 1 版の `elements` は使わない。
- **非支配株主持分は 0・換算差額は 0** (第 1 版のまま。`gen.py` の既定)。

## 3. 種類 × 会社の割り振り

15 種類を 10 社に置く。決め方 (**設計**。`make-spec-v3.py` の `solve`): ① 段 3 = E-04 は c03 (閏日) を含む 5 社・E-12 はその残り 5 社 (全社が段 3 を 1 問ずつ)。② 段 2 = 15 件を、5 社が 2 件・5 社が 1 件になるように (同じ会社に同じ種類は 1 つ)。③ 段 1 = E-02 を 5 社 (c02・c03・c06・c07・c10。増益の基は営業利益率の目安 6% 以下の 3 社・減益の基 2 社) に固定し、残り 9 種類を、各社がちょうど 5 種類になるよう、負荷の低い会社から置く。同じ入力から同じ割り振りになる (乱数の種は固定。SP11)。

| 種類 (段) | c01 | c02 | c03 | c04 | c05 | c06 | c07 | c08 | c09 | c10 | 計 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-17 (1) | ● |  |  | ● | ● |  |  | ● | ● |  | 5 |
| E-02 (1) |  | ● | ● |  |  | ● | ● |  |  | ● | 5 |
| E-24 (1) | ● |  | ● |  |  |  | ● |  | ● | ● | 5 |
| E-03 (1) |  | ● |  | ● | ● | ● |  | ● |  |  | 5 |
| E-05 (1) |  | ● | ● | ● |  | ● |  |  | ● |  | 5 |
| E-22 (1) | ● |  |  |  | ● |  | ● | ● |  | ● | 5 |
| E-21 (1) |  | ● | ● |  |  |  |  | ● | ● | ● | 5 |
| E-25 (1) | ● |  |  | ● | ● | ● | ● |  |  |  | 5 |
| E-26 (1) | ● | ● | ● |  |  | ● | ● |  |  |  | 5 |
| E-27 (1) |  |  |  | ● | ● |  |  | ● | ● | ● | 5 |
| E-19 (2) |  | ● |  | ● |  | ● | ● |  |  | ● | 5 |
| E-23 (2) | ● |  | ● | ● | ● |  |  | ● |  |  | 5 |
| E-28 (2) | ● |  |  |  |  | ● |  | ● | ● | ● | 5 |
| E-12 (3) | ● |  |  |  | ● | ● | ● |  |  | ● | 5 |
| E-04 (3) |  | ● | ● | ● |  |  |  | ● | ● |  | 5 |
| 段 1 の問題数 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 50 |
| 段 2 の問題数 | 2 | 1 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 15 |
| 段 3 の問題数 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 10 |
| 異変の問題 計 | 8 | 7 | 7 | 8 | 7 | 8 | 7 | 8 | 7 | 8 | 75 |

**出題の種類の出方を、この割り振りで測った** (**測った**。再現: `node --experimental-strip-types --no-warnings docs/plans/problems-easy/pool-sim.ts`。設計 §2.7 の試算 `v3-tier-sim.ts` の `draw` (段の指定を累積にした版) を、この表のプールに当てた。1 万周 = 8 万枠。出題の本体 (`draw` の累積化) は #155 の持ち分で、まだ入っていない):

| 見たもの | 結果 | 基準 (設計 §1.5 R-S6 の置き換え・§2.7) |
| --- | --- | --- |
| 異変の枠の割合 | 50.06% | 0.5 ± 1.5 ポイント |
| 1〜2 社目 (候補 10 種類) | 10/10 種類が出る。最多 10.2% = 一様 (10.0%) の 1.02 倍 | 1.5 倍以内 |
| 3〜5 社目 (候補 13 種類) | 13/13。最多 8.0% = 一様 (7.7%) の 1.04 倍 | 1.5 倍以内 |
| 6〜8 社目 (候補 15 種類) | 15/15。最多 6.9% = 一様 (6.7%) の 1.03 倍 | 1.5 倍以内 |
| 会社ごとの「出たとき異変の問題だった割合」 | 49.0〜50.8% | 50% の近く (会社から答えが漏れない。今の draw は 49〜51%) |

## 4. 一覧 (85 問)

段 (`tier`): 台帳 §2.2 の段 (1 = 目立つ・2 = 中・3 = 紛らわしい)。正常の行が基 (`base`)。見出し語は基の営業利益の向き。「変えるもの (edit)」の `slot` は設計 §1.2 のカードの欄の key (`sales` = 売上高・`opPrev` = 営業利益 (前期)・`opCurr` = 営業利益 (当期)・`margin` = 営業利益率・`headline` = 見出し語・`period` = 足元の期末日)。edit の意味は §5。

<!-- spec-table:begin -->
| id | 会社 | 期 | 見出し語 | 段 | 種別 | 異変の種類 | 変えるもの (edit) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy-001 | c01 ミオトリ精機 | 2025年3月期 | 増益 | ― | 正常 | ― | 基 |
| easy-002 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 1 | 異変あり | E-17 見出し語と数字の向きが逆 | `op=claim, metric=operatingIncome, to=down` |
| easy-003 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 1 | 異変あり | E-24 売上高が営業利益より小さい | `op=scale-sales, cell=tanshin.incomeStatement.current.netSales, of=operatingIncome, ratio=0.5` |
| easy-004 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 1 | 異変あり | E-22 同じ欄が 2 回出る | `op=dup, slot=headline` |
| easy-005 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 1 | 異変あり | E-25 あり得ない符号 | `op=sign, slot=sales` |
| easy-006 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 1 | 異変あり | E-26 添え字の取り違え | `op=suffix, slot=opPrev, word=当期` |
| easy-007 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 2 | 異変あり | E-23 見出し語が別の型の語 | `op=headline, word=増収` |
| easy-008 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 2 | 異変あり | E-28 期末日が存在しない日付 | `op=day, slot=period, day=32` |
| easy-009 | c01 ミオトリ精機 | 2025年3月期 | 増益 | 3 | 異変あり | E-12 営業利益率が合わない | `op=scale-margin, factor=2.2` |
| easy-010 | c02 クレセラ食品 | 2025年3月期 | 減益 | ― | 正常 | ― | 基 |
| easy-011 | c02 クレセラ食品 | 2025年3月期 | 減益 | 1 | 異変あり | E-02 桁がずれた数字 | `op=scale, cell=tanshin.incomeStatement.current.operatingIncome, factor=0.1` |
| easy-012 | c02 クレセラ食品 | 2025年3月期 | 減益 | 1 | 異変あり | E-03 単位の語が 1 つだけ違う | `op=unit, slot=sales, unit=億円` |
| easy-013 | c02 クレセラ食品 | 2025年3月期 | 減益 | 1 | 異変あり | E-05 科目名の誤字 | `op=label, target=sales, itemKey=tanshin.incomeStatement.netSales, word=売上商` |
| easy-014 | c02 クレセラ食品 | 2025年3月期 | 減益 | 1 | 異変あり | E-21 数字のカンマの位置が違う | `op=format, slot=sales, style=comma-shift` |
| easy-015 | c02 クレセラ食品 | 2025年3月期 | 減益 | 1 | 異変あり | E-26 添え字の取り違え | `op=suffix, slot=opCurr, word=前期` |
| easy-016 | c02 クレセラ食品 | 2025年3月期 | 減益 | 2 | 異変あり | E-19 欄が 1 つ足りない | `op=drop, slot=opPrev` |
| easy-017 | c02 クレセラ食品 | 2025年3月期 | 減益 | 3 | 異変あり | E-04 期と期末日が合わない | `op=shift-year, cell=tanshin.columnDates.incomeStatement.current, years=1` |
| easy-018 | c03 ソルベリマート | 2024年2月期 | 増益 | ― | 正常 | ― | 基 |
| easy-019 | c03 ソルベリマート | 2024年2月期 | 増益 | 1 | 異変あり | E-02 桁がずれた数字 | `op=scale, cell=tanshin.incomeStatement.current.operatingIncome, factor=10` |
| easy-020 | c03 ソルベリマート | 2024年2月期 | 増益 | 1 | 異変あり | E-24 売上高が営業利益より小さい | `op=scale-sales, cell=tanshin.incomeStatement.current.netSales, of=operatingIncome, ratio=0.6` |
| easy-021 | c03 ソルベリマート | 2024年2月期 | 増益 | 1 | 異変あり | E-05 科目名の誤字 | `op=label, target=sales, itemKey=tanshin.incomeStatement.netSales, word=売上局` |
| easy-022 | c03 ソルベリマート | 2024年2月期 | 増益 | 1 | 異変あり | E-21 数字のカンマの位置が違う | `op=format, slot=sales, style=no-comma` |
| easy-023 | c03 ソルベリマート | 2024年2月期 | 増益 | 1 | 異変あり | E-26 添え字の取り違え | `op=suffix, slot=opCurr, word=前期` |
| easy-024 | c03 ソルベリマート | 2024年2月期 | 増益 | 2 | 異変あり | E-23 見出し語が別の型の語 | `op=headline, word=増収` |
| easy-025 | c03 ソルベリマート | 2024年2月期 | 増益 | 3 | 異変あり | E-04 期と期末日が合わない | `op=shift-year, cell=tanshin.columnDates.incomeStatement.current, years=1` |
| easy-026 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | ― | 正常 | ― | 基 |
| easy-027 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 1 | 異変あり | E-17 見出し語と数字の向きが逆 | `op=claim, metric=operatingIncome, to=down` |
| easy-028 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 1 | 異変あり | E-03 単位の語が 1 つだけ違う | `op=unit, slot=opCurr, unit=億円` |
| easy-029 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 1 | 異変あり | E-05 科目名の誤字 | `op=label, target=op, itemKey=tanshin.incomeStatement.operatingIncome, word=営業判益` |
| easy-030 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 1 | 異変あり | E-25 あり得ない符号 | `op=sign, slot=sales` |
| easy-031 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 1 | 異変あり | E-27 数字に数字でない字が混じる | `op=glyph, slot=opCurr, digit=first` |
| easy-032 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 2 | 異変あり | E-19 欄が 1 つ足りない | `op=drop, slot=margin` |
| easy-033 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 2 | 異変あり | E-23 見出し語が別の型の語 | `op=headline, word=増収` |
| easy-034 | c04 ゼノメアシステムズ | 2025年9月期 | 増益 | 3 | 異変あり | E-04 期と期末日が合わない | `op=shift-year, cell=tanshin.columnDates.incomeStatement.current, years=1` |
| easy-035 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | ― | 正常 | ― | 基 |
| easy-036 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 1 | 異変あり | E-17 見出し語と数字の向きが逆 | `op=claim, metric=operatingIncome, to=up` |
| easy-037 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 1 | 異変あり | E-03 単位の語が 1 つだけ違う | `op=unit, slot=opPrev, unit=億円` |
| easy-038 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 1 | 異変あり | E-22 同じ欄が 2 回出る | `op=dup, slot=sales` |
| easy-039 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 1 | 異変あり | E-25 あり得ない符号 | `op=sign, slot=sales` |
| easy-040 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 1 | 異変あり | E-27 数字に数字でない字が混じる | `op=glyph, slot=opPrev, digit=middle` |
| easy-041 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 2 | 異変あり | E-23 見出し語が別の型の語 | `op=headline, word=減収` |
| easy-042 | c05 ブルネラ製薬 | 2025年12月期 | 減益 | 3 | 異変あり | E-12 営業利益率が合わない | `op=scale-margin, factor=0.4` |
| easy-043 | c06 トラウネ建設 | 2025年3月期 | 増益 | ― | 正常 | ― | 基 |
| easy-044 | c06 トラウネ建設 | 2025年3月期 | 増益 | 1 | 異変あり | E-02 桁がずれた数字 | `op=scale, cell=tanshin.incomeStatement.current.operatingIncome, factor=10` |
| easy-045 | c06 トラウネ建設 | 2025年3月期 | 増益 | 1 | 異変あり | E-03 単位の語が 1 つだけ違う | `op=unit, slot=sales, unit=億円` |
| easy-046 | c06 トラウネ建設 | 2025年3月期 | 増益 | 1 | 異変あり | E-05 科目名の誤字 | `op=label, target=op, itemKey=tanshin.incomeStatement.operatingIncome, word=営業和益` |
| easy-047 | c06 トラウネ建設 | 2025年3月期 | 増益 | 1 | 異変あり | E-25 あり得ない符号 | `op=sign, slot=sales` |
| easy-048 | c06 トラウネ建設 | 2025年3月期 | 増益 | 1 | 異変あり | E-26 添え字の取り違え | `op=suffix, slot=opPrev, word=当期` |
| easy-049 | c06 トラウネ建設 | 2025年3月期 | 増益 | 2 | 異変あり | E-19 欄が 1 つ足りない | `op=drop, slot=opCurr` |
| easy-050 | c06 トラウネ建設 | 2025年3月期 | 増益 | 2 | 異変あり | E-28 期末日が存在しない日付 | `op=day, slot=period, day=32` |
| easy-051 | c06 トラウネ建設 | 2025年3月期 | 増益 | 3 | 異変あり | E-12 営業利益率が合わない | `op=scale-margin, factor=2.2` |
| easy-052 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | ― | 正常 | ― | 基 |
| easy-053 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 1 | 異変あり | E-02 桁がずれた数字 | `op=scale, cell=tanshin.incomeStatement.current.operatingIncome, factor=10` |
| easy-054 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 1 | 異変あり | E-24 売上高が営業利益より小さい | `op=scale-sales, cell=tanshin.incomeStatement.current.netSales, of=operatingIncome, ratio=0.6` |
| easy-055 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 1 | 異変あり | E-22 同じ欄が 2 回出る | `op=dup, slot=opCurr` |
| easy-056 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 1 | 異変あり | E-25 あり得ない符号 | `op=sign, slot=sales` |
| easy-057 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 1 | 異変あり | E-26 添え字の取り違え | `op=suffix, slot=opPrev, word=当期` |
| easy-058 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 2 | 異変あり | E-19 欄が 1 つ足りない | `op=drop, slot=margin` |
| easy-059 | c07 ザルツァ運輸 | 2025年6月期 | 増益 | 3 | 異変あり | E-12 営業利益率が合わない | `op=scale-margin, factor=0.4` |
| easy-060 | c08 セレニア不動産 | 2025年12月期 | 減益 | ― | 正常 | ― | 基 |
| easy-061 | c08 セレニア不動産 | 2025年12月期 | 減益 | 1 | 異変あり | E-17 見出し語と数字の向きが逆 | `op=claim, metric=operatingIncome, to=up` |
| easy-062 | c08 セレニア不動産 | 2025年12月期 | 減益 | 1 | 異変あり | E-03 単位の語が 1 つだけ違う | `op=unit, slot=opPrev, unit=億円` |
| easy-063 | c08 セレニア不動産 | 2025年12月期 | 減益 | 1 | 異変あり | E-22 同じ欄が 2 回出る | `op=dup, slot=margin` |
| easy-064 | c08 セレニア不動産 | 2025年12月期 | 減益 | 1 | 異変あり | E-21 数字のカンマの位置が違う | `op=format, slot=opCurr, style=no-comma` |
| easy-065 | c08 セレニア不動産 | 2025年12月期 | 減益 | 1 | 異変あり | E-27 数字に数字でない字が混じる | `op=glyph, slot=opCurr, digit=last` |
| easy-066 | c08 セレニア不動産 | 2025年12月期 | 減益 | 2 | 異変あり | E-23 見出し語が別の型の語 | `op=headline, word=減収` |
| easy-067 | c08 セレニア不動産 | 2025年12月期 | 減益 | 2 | 異変あり | E-28 期末日が存在しない日付 | `op=day, slot=period, day=32` |
| easy-068 | c08 セレニア不動産 | 2025年12月期 | 減益 | 3 | 異変あり | E-04 期と期末日が合わない | `op=shift-year, cell=tanshin.columnDates.incomeStatement.current, years=-1` |
| easy-069 | c09 キュルネ教育 | 2025年3月期 | 増益 | ― | 正常 | ― | 基 |
| easy-070 | c09 キュルネ教育 | 2025年3月期 | 増益 | 1 | 異変あり | E-17 見出し語と数字の向きが逆 | `op=claim, metric=operatingIncome, to=down` |
| easy-071 | c09 キュルネ教育 | 2025年3月期 | 増益 | 1 | 異変あり | E-24 売上高が営業利益より小さい | `op=scale-sales, cell=tanshin.incomeStatement.current.netSales, of=operatingIncome, ratio=0.5` |
| easy-072 | c09 キュルネ教育 | 2025年3月期 | 増益 | 1 | 異変あり | E-05 科目名の誤字 | `op=label, target=margin, itemKey=tanshin.summary.operatingMargin, word=売上高営業利益卒` |
| easy-073 | c09 キュルネ教育 | 2025年3月期 | 増益 | 1 | 異変あり | E-21 数字のカンマの位置が違う | `op=format, slot=sales, style=no-comma` |
| easy-074 | c09 キュルネ教育 | 2025年3月期 | 増益 | 1 | 異変あり | E-27 数字に数字でない字が混じる | `op=glyph, slot=sales, digit=last` |
| easy-075 | c09 キュルネ教育 | 2025年3月期 | 増益 | 2 | 異変あり | E-28 期末日が存在しない日付 | `op=day, slot=period, day=32` |
| easy-076 | c09 キュルネ教育 | 2025年3月期 | 増益 | 3 | 異変あり | E-04 期と期末日が合わない | `op=shift-year, cell=tanshin.columnDates.incomeStatement.current, years=-1` |
| easy-077 | c10 ヨクトス商事 | 2025年3月期 | 減益 | ― | 正常 | ― | 基 |
| easy-078 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 1 | 異変あり | E-02 桁がずれた数字 | `op=scale, cell=tanshin.incomeStatement.current.operatingIncome, factor=0.1` |
| easy-079 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 1 | 異変あり | E-24 売上高が営業利益より小さい | `op=scale-sales, cell=tanshin.incomeStatement.current.netSales, of=operatingIncome, ratio=0.6` |
| easy-080 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 1 | 異変あり | E-22 同じ欄が 2 回出る | `op=dup, slot=opPrev` |
| easy-081 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 1 | 異変あり | E-21 数字のカンマの位置が違う | `op=format, slot=opPrev, style=no-comma` |
| easy-082 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 1 | 異変あり | E-27 数字に数字でない字が混じる | `op=glyph, slot=sales, digit=first` |
| easy-083 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 2 | 異変あり | E-19 欄が 1 つ足りない | `op=drop, slot=sales` |
| easy-084 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 2 | 異変あり | E-28 期末日が存在しない日付 | `op=day, slot=period, day=32` |
| easy-085 | c10 ヨクトス商事 | 2025年3月期 | 減益 | 3 | 異変あり | E-12 営業利益率が合わない | `op=scale-margin, factor=2.2` |
<!-- spec-table:end -->

## 5. 異変の作り方 (種類ごとの edit の意味と、見つける規則)

「1 つの異変 = 1 つの原因の変更」(anomalies.md G1)。種類の定義 (`primaryRules`・`relationChecks`) は `src/data/anomaly-kinds.json` の値 (検証器 #138 が入れた)。**再計算しない種類は、変えたセルのほかを動かさない** (設計 §2.9)。「許す検査」は設計 §1.2 の表 (表の外の `card-relation` の検査が落ちたら、データの検査 `card-relation-extra` が出る)。

| 種類 | edit の op | 変えるもの | 主な規則 (`primaryRules`) | 許す検査 | 答え合わせの場所 (`places`・設計 §2.3 R-D3) |
| --- | --- | --- | --- | --- | --- |
| E-17 | `claim` | `ir.statements` の営業利益の主張 (`claims` の `direction`) を逆に。文 (`text`) も同じ向きに直す | `claims-direction` | R-dir | 見出し語 `headline` と営業利益 `opPrev`・`opCurr` (場所は `ir.statements.<N>` の入れ物で書く。`text` は指さない = `card-place-text`) |
| E-02 | `scale` | `incomeStatement.current.operatingIncome` を、増益は 10 倍・減益は 1/10。**再計算しない**。増益の基は 10 × ③ ≤ 0.8 × ① のものだけ | `sum-*`・`ratio-operating-margin` | R-margin・R-range | `opCurr` (`opPrev` と並べて見る) |
| E-24 | `scale-sales` | `incomeStatement.current.netSales` を営業利益の 0.6 倍か 0.5 倍 (0.8 倍以下)。**再計算しない**。営業利益は動かさない | `ratio-operating-margin` | R-margin・R-lt | `sales`・`opCurr` |
| E-03 | `unit` | 金額の欄 (`sales`・`opPrev`・`opCurr`) 1 つの単位の語を「億円」に (正常の語は百万円) | `card-unit` (+`unit-consistency`) | なし | その欄 |
| E-05 | `label` | `labelOverrides` で科目名を誤字に (売上高 → 売上商・売上局、営業利益 → 営業和益・営業判益、売上高営業利益率 → 売上高営業利益卒)。営業利益は 2 欄 (前期・当期) とも変わる | `label-spelling` | なし | その欄 |
| E-22 | `dup` | 数字の欄か見出し語を 2 回出す (数字の欄を重ねると数字が 5 つ載る。責任者の決定 問 1 = (b)) | `card-slots` | なし | その欄 |
| E-21 | `format` | 金額の欄の桁区切り。`no-comma` (整数部 4 桁以上) か `comma-shift` (整数部 5 桁以上は売上高だけ) | `card-format` | なし | その欄 |
| E-25 | `sign` | 売上高の**表示だけ**に △ を付ける (値は正のまま・`changed` は空) | `card-sign` | なし | `sales` |
| E-26 | `suffix` | 営業利益の欄の添え字を取り違える (前期の欄を「(当期)」に、または逆) | `card-column-suffix` | なし | `opPrev` か `opCurr` |
| E-27 | `glyph` | 金額の欄の数字 1 字を「X」に (最初・途中・最後の字。生成のとき表示の添字に直す) | `card-digits` | なし | その欄 |
| E-19 | `drop` | 数字の欄 1 つを消す | `card-slots` | 落とした欄を読む検査 (R-margin など) | 消えた欄 (答え合わせは「ここに○○の欄があるはず」。設計 §3.2 #141-4) |
| E-23 | `headline` | 見出し語を別の型の語に (増益 → 増収、減益 → 減収。向きは基と同じ) | `card-headline` | R-dir | `headline` |
| E-28 | `day` | 足元の期末日の表示の日を 32 に (問題データの期末日は変えない。表示は文字列の切り出しで作る) | `card-date-valid` | なし | `period` |
| E-12 | `scale-margin` | `summary.operatingMargin` を 2.2 倍か 0.4 倍 (正しい値の 2 倍以上か 1/2 以下)。**再計算しない** | `ratio-operating-margin` | R-margin | `margin` (`sales`・`opCurr` と並べて見る) |
| E-04 | `shift-year` | `columnDates.incomeStatement.current` の年を 1 年ずらし、**ずらした年のその月の末日にする** (c03 は 2024-02-29 → 2025-02-28)。表題の期は変えない | `card-period` (+`dates-*`) | なし | `frame.period` (表題の期と足元の期末日) |

答え合わせの文言 (`explanation`) は、種類ごとの文型 (anomalies.md §4 の K1・K7。短く・一般の人に分かる言葉・数字を含める。設計 §2.7) を生成器が持つ。`expectedRules` は検証器を当てて落ちた規則の集合を、`changed` は基との実際の差を、生成器が書く (第 1 版の `EXPECTED` の手書きはやめる)。

## 6. 時間の見積もり (設計 §3.2 #139-1 の内訳で作り直した。参照クラスで、P50・P80 で出す)

これまでの見積もり (25 問・40 問程度が前提) は使えない。

**単位 (定義)**: 時間 = **組の経過時間**。Sub-task に取りかかってから、監視役と合意して閉じるまで (進める役の作業と、監視役のレビュー往復を含む。責任者・人間の待ちは含まない)。測り方: 同じ組の Sub-task が順に閉じるので、「直前の Sub-task が閉じた時刻 (最初は取りかかりの時刻) → その Sub-task が閉じた時刻」。時刻は GitHub の issue の `createdAt`・`closedAt` (`gh issue view <番号> --json createdAt,closedAt`。UTC。JST は +9 時間)。commit の時刻は使わない (第 1 版の commit は 11-04 02:57〜03:46 JST に固まっていて作業時間を表さない)。見積もりの欄には **P80** を入れる (日程を組む値)。

**方法**: 参照クラス予測 (似た過去の仕事の実際の所要から、1 点でなく分布で出す。Flyvbjerg 2006「From Nobel Prize to Project Management: Getting Risks Right」(Project Management Journal 37(3))。P50・P80 の使い方は、同じ論文の Table 4 と Oxford の報告 (Edinburgh 市のトラム事業の参考資料) の Table 1 を参照した。出典と、読んだ範囲は下)。手順 = ① 参照クラスを決める → ② 実績の分布を出す → ③ この仕事に当てる。

**参照クラスと実績** (**測った**。再現: 下の issue 番号の `createdAt`・`closedAt` から上の定義で引く。すべて 2026-11 のこのリポジトリ):

| 種類 | Sub-task (経過時間) | 件数 |
| --- | --- | --- |
| データを作る・検証器に通す (v1 のやさしい #25・むずかしい #26) | #70 11 分・#71 6 分・#72 2 分 / #74 6 分・#75 5 分・#76 4 分 | 6 |
| テスト駆動の実装 (#138 の v2・v3) | #152 10 分・#153 19 分・#180 27 分 | 3 |
| ケース表 | #151 15 分・#179 18 分 | 2 |
| 包括レビューの指摘への対応 | #88 16 分・#92 17 分・#154 15 分・#156 9 分・#160 12 分・#161 14 分・#162 13 分 | 7 |
| CI の実行 (GitHub Actions。成功した 11 回) | 215〜287 秒。中央値 約 4 分 (`gh run list --json startedAt,updatedAt`) | 11 |

「実装・データを作る」9 件 (2・4・5・6・6・10・11・19・27 分) の P50 = 6 分・P80 = 14.2 分 (線形補間)。P80 ÷ P50 = 2.4。

**この仕事に当てる**:

| Sub-task | 前例からの式 | P50 | P80 | 見積もり欄 (P80) |
| --- | --- | --- | --- | --- |
| #167 設計表 | 実績: 取りかかり 14:18 JST → レビュー依頼 14:30 = 12 分 + レビュー 1 回目の直し (合意の時刻まで #167 のコメントに記録する) | 0.3 h | 0.5 h | 0.5 h |
| #168 問題データ | v1 の ①正常 #70・②異変 #71・③検証 #72 の和 = 19 分 (むずかしい v1 は 15 分。平均 17 分) + ケース表の先行 (#151・#179 の平均 16.5 分) = 33 分 ≈ **0.6 h** (P50)。P80 = P50 × 2.4 = 79 分 ≈ **1.3 h** | 0.6 h | 1.3 h | 1.3 h |
| #169 致命にして通す・CI・PR | v1 の #72・#76 = 2〜4 分 (平均 3 分) + CI 1 回 4 分 = 7 分 ≈ 0.12 h (P50)。P80 は CI を 2 回回す = 0.3 h | 0.1 h | 0.3 h | 0.3 h |
| Task の包括レビューの直し (別の Sub-task) | 直し 7 件の P50 14 分・P80 16 分を 1 ラウンド (v2 の検証器は 4 ラウンド) | 0.25 h | 0.5 h | (起票のとき) |
| 合計 | 各 Sub-task の和 (P80 の和は保守的) | **約 1.3 h** | **約 2.6 h** | |

**この見積もりの弱い所 (仮定・未確認)**:
- **参照クラスは薄い**: 「実装・データを作る」9 件・2 系統 (v1 のデータ 2 本・#138 の 3 本)。85 問を生成する仕事の前例は無い。v1 は 25 問・手書きの異変 13 問・生成器 927 行 (gen.py 595・anomalies.py 205・check.py 127。`wc -l`) を 19 分で作った。v3 は 85 問・15 種類の注入で、生成器・検証器を再利用する分と、新しい種類 (E-24〜E-28。実データで未測定) の分が相殺すると**仮定**した。P80 ÷ P50 の 2.4 は、この 9 件から出した比で、85 問に当てて足りる保証は無い。
- **反復の余地**: 実データを初めて検証器 v3 に通すと、種類ごとの作り方の直しが出る (v2 の #153・#154 のように)。この分は P80 の比 2.4 に含めたつもりだが、根拠は 9 件の分布だけ。#168 の途中で、検証器に通した 1 回目の結果を #168 のコメントに残し、P80 を超えそうなら責任者に伝える。
- **出典を読んだ範囲** (2026-11-09 に PDF を取得して本文を読んだ): Flyvbjerg 2006 (arxiv.org/pdf/1302.3642。PMJ 37(3) pp.5-15) の本文に「Table 4 presents an overview of applicable optimism bias uplifts for the 50% and 80% percentiles」とあり、続けて「The 80% percentile--corresponding to a risk of cost overrun of 20%--is the level of risk that the UK Department for Transport is typically willing to accept」「The 50% percentile is pertinent to the investor with a large project portfolio」とある。Oxford の報告 (edinburgh.gov.uk の file/90。PDF 9 ページ) の Table 1 に「50% acceptable chance of overrun (P50)」「20% acceptable chance of overrun (P80)」とある。eight2late.com の記事 (2010-05-13) は、参照クラスの件数が足りることを求め、過去のプロジェクトの分布と比べるとある (50%・80% の語は無い)。**この 3 つはコストの超過の話で、所要時間に当てるのは類推**。P50 = 「複数の仕事を持つ組が、ならして守る値」、P80 = 「日程を組むときに超えたくない値」として使った (**仮定**)。concepts.dsebastien.net は本文を確かめていないので出典にしない。

出典: Flyvbjerg (2006) https://arxiv.org/abs/1302.3642 (PDF https://arxiv.org/pdf/1302.3642) ・ https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068 / The University of Oxford report, Reference class forecasting (Edinburgh trams) https://www.edinburgh.gov.uk/tramstonewhaven/downloads/file/90/the-university-of-oxford-report-reference-class-forecasting / https://eight2late.com/2010/05/13/the-reference-class-problem-and-its-implications-for-project-management

## 7. 生成の手順と確かめ方 (#168・#169)

1. `python3 docs/plans/problems-easy/make-spec-v3.py` が spec-v3.json を作る (SP11)。
2. `python3 docs/plans/problems-easy/gen.py --spec docs/plans/problems-easy/spec-v3.json --out src/data` が、正常な問題 10 問と見本を書く (`src/data/problems/easy/easy-*.json` を先に消す)。
3. `node --experimental-strip-types --no-warnings scripts/gen-easy/run.ts` が、異変の問題 75 問を同じ所に書く (`scripts/gen-easy/inject.ts`。1 つの異変 = 1 つの変更。`anomaly` の `expectedRules` は検証器で実際に落ちた hard の規則、`changed` は基との実際の差、`explanation` は種類ごとの型 (ケース表 A4))。
4. ケース表 [problems-easy-v3.md](../test-cases/problems-easy-v3.md) のテスト: `npx vitest run scripts/gen-easy scripts/problems-easy-spec.test.ts` (道具の境界値 U1〜U8・正常 N1〜N12・異変 A1〜A6・全体 D1〜D5・再現 R1)。
5. #169: `npm run verify:data -- --require-complete --require-cards=easy` が終了 0 (致命 0・`card-*` の shortfalls 0)。CI に `--require-cards=easy` を足す。

**この Sub-task の確かめ方 (#167 の成果物)**: `npx vitest run scripts/problems-easy-spec.test.ts` (SP1〜SP14)。

## 8. 未確認・申し送り

- **未確認**: 金額が 6 桁以内か (§1 は導いた上限。生成後に全セルを数えるのは #168)。E-21・E-24・E-26〜E-28 が、会計を知らない人に本当に「おかしい」と分かるか (設計 §3.4。試作 #141)。
- **全体のテスト (#169 へ)**: `npx vitest run` の全体は今 10 件赤 (旧データ・irUnit の全社億円化に追随していないテスト: data.test.ts K4・N4-1、problems-hard.test.ts 5 件、verify-data.test.ts L7・Lc4、dataset-cards.test.ts KD5)。#168 (easy 分)・#140 (hard 分) の作り直しで直す。#168 のレビューの前に、この 10 件を退行と見分けられるよう、直す対象の一覧を #168 のコメントに残す。**#169 の PR の前に、全体が緑であることを確かめる**。
- **約束 (#168 へ)**: E-02 の増益の基の営業利益率は、gen.py のゆらぎ (`om` = 目安 + U(−0.004, +0.006)。`profiles.py` の `OM_DRIFT`) の最大でも c06 の 5.6% で、8% まで 2.4 ポイントの余裕がある (導いた。spec-v3.json の `omRange`。SP7 が 8% 以下を数える)。`om` のゆらぎの幅は `profiles.py` の `OM_DRIFT`・`OM_DRIFT_DOWN`・`GROWTH_DOWN_FRAC` が 1 か所の出所で、`gen.py` と `make-spec-v3.py` が同じ値を読む (幅を変えて spec を作り直せば、SP7・SP14 が範囲を見直す)。
- **#155 (出題) へ**: §3 の試算は、`draw` の段の指定を累積にした版 (設計 §2.7 の採用案) で測った。本体の `draw` はまだ「段がちょうど同じ」なので、#155 が累積にするまでは、この表のプールでも 3〜5 社目・6〜8 社目で種類が絞られる (設計 §2.7 の「今のとおり」の行)。
- **#140 (むずかしい) へ**: `companies.json` の `irUnit` と見本は本ブランチの commit 9b9e08a で全社億円になっている (責任者の決定)。#140 はこれを取り込む。見本は両方の難易度で共有。
- **第 2 版の設計表からの変更**: 問題 44 → 85。形 3 → 1 (E1〜E3 を捨て、もうけ 1 つ)。15 種類のうち E-18・E-20・E-06・E-07・E-09 を外し、E-24〜E-28 を足した。(会社 × 期) 11 → 10 (1 社 1 期。第 2 版は c01 が 2 期)。減収の正常な問題は要らない (見出し語が営業利益の主張だけ)。
