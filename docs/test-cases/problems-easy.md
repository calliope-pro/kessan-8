# ケース表: やさしいの正常な資料 (Sub-task #70)

Task #25。設計表: [docs/plans/problems-easy.md](../plans/problems-easy.md)。検証器: ブランチ calliope/validator (`npm run verify:data`)。データの中身は、方針どおり、ケース表ではなく検証器で全問に当てて確かめる。ここには、検証器が見ない約束と、実行の手順を置く。

## 1. 手順と期待

| ID | 手順 | 期待 (レッド → グリーン) |
| --- | --- | --- |
| P1 | レッド: データを置く前に `verify:data -- --dir <作業用ディレクトリ>` を回す | 0 問。数が足りない (`pool-size`・`both-sided-companies`) が出る |
| P2 | `python3 docs/plans/problems-easy/gen.py` で、正常な 12 問と見本を作り、`verify:data` に当てる | 致命 0 件 (整合の規則の違反なし)。参考の規則の報告 0 件 |
| P3 | 異変の問題の土台 (要素なしの正常な 13 問と見本、`--base-out`) も同じ検証器に当てる | 致命 0 件・参考の報告 0 件 (#71 で異変を入れる前の土台が正常であること) |
| P4 | 同じ入力で `gen.py` を 2 回回し、出力を比べる | 完全に同じ (乱数は会社 id から作った種) |

## 2. 検証器が見ない約束 (設計表 §3 と experience.md §6.7)

| ID | 約束 | 確かめ方 |
| --- | --- | --- |
| C1 | 同じ会社の期は続いている (前の期の当期 = 次の期の前期) | `gen.py` が会社ごとの 1 本の時系列から作る。前期の貸借・損益が前の当期と一致することを、下のスクリプトで比べる |
| C2 | 期はすべて過去 (発表日が 2026-11 より前) | 日付の最大を比べる |
| C3 | 正常な問題の `tier` と、疑わしく見える要素の数が合う (0 個 = 1、1〜2 個 = 2、3 個以上 = 3) | `spec.json` と生成された JSON を突き合わせる |
| C4 | 疑わしく見える要素が資料に実際にある (大きな設備投資 = 設備投資 ÷ 減価償却 2 倍以上、特別損益 ≠ 0、減配、無配、赤字のセグメント、会計方針の変更と注記、後発事象と IR、利益の大きな増減率) | 同上 |
| C5 | 正常な問題に `labelOverrides`・`unitOverrides`・`signOverrides` が無い。非支配株主持分が 0 | JSON を読む |
| C6 | 営業赤字・最終赤字を使わない | 営業利益・当期純利益が正 |

上の C1〜C6 は `docs/plans/problems-easy/check.py` で確かめる (標準ライブラリのみ)。

## 3. 異変の問題 (Sub-task #71)

| ID | 手順 | 期待 |
| --- | --- | --- |
| A1 | 正常な土台に 1 か所の異変を入れ (`anomalies.py`)、検証器で落ちた規則を数えて期待集合 (`EXPECTED`) にする | 落ちた規則が空でない |
| A2 | `verify:data --fail-on-soft` を 25 問に当てる | 致命 0 件 (実際に落ちた集合 = 期待集合、種類の主な規則を 1 つ以上含み許容集合に収まる、場所が違反に触れる、違反が場所に触れる)。参考の規則の報告 0 件。やさしいの数が足りない警告が 0 件 (問題数 25、異変あり 13、両面の会社 10、見た目 + 計算 12/13) |
| A3 | `gen.py` を 2 回回して出力を比べる | 同一 |

異変の問題 13 問の、場所と期待集合 (検証器を当てて落ちた規則):

| id | 種類 | 場所 (places) | 期待集合 (expectedRules) |
| --- | --- | --- | --- |
| easy-002 | E-02 | `summary.netSales.current`, `incomeStatement.current.netSales` | sum-change-net-sales, sum-net-sales |
| easy-003 | E-01 | `summary.operatingIncome.current`, `incomeStatement.current.operatingIncome` | sum-change-operating-income, sum-operating-income |
| easy-005 | E-09 | `balanceSheet.current.totalCurrentAssets` | bs-current-assets, bs-total-assets |
| easy-008 | E-11 | `summary.ordinaryIncome.changeRate` | sum-change-ordinary-income |
| easy-009 | E-10 | `incomeStatement.current.grossProfit` | ir-results-gross-margin, pl-gross-profit, pl-operating-income, xdoc-results-gross-profit |
| easy-011 | E-08 | `header.securitiesCode` | header-securities-code |
| easy-012 | E-14 | `segments.items.0.salesShare` | ir-seg-share |
| easy-014 | E-12 | `summary.equityRatio` | ratio-equity-ratio, xdoc-supp-equity-ratio |
| easy-016 | E-13 | `notes.segments.current.segments.0.netSales` | ir-seg-change-sales, ir-seg-share, seg-sales-sum, xdoc-seg-sales |
| easy-018 | E-06 | `results.chart.netSales.axisMin` | chart-axis-zero |
| easy-021 | E-16 | `summary.eps` | check-eps-product, notes-per-share, ratio-eps, ratio-payout |
| easy-022 | E-04 | `columnDates.balanceSheet.current` | dates-column-headings |
| easy-024 | E-17 | `statements.0.text` | claims-direction |
