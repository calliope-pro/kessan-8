# ケース表: 項目キーと項目名の標準 (`src/domain/labels.ts`)

Task #57 の前提 (責任者の決定: 案 A。labels.ts は #23 の約束 ([validator.md](https://github.com/calliope-pro/kessan-8/blob/calliope/validator/docs/test-cases/validator.md) §0・§2.1 の I1〜I3) を、画面の #57 が先に作る)。文法は [design.md](../design.md) §4.1「項目キー」。**I1〜I3 は #47 で固定済み**。ここは I1〜I3 を満たすうえで足りないものだけを足す (L 系)。

## 公開する入口

| 入口 | 入力 → 出力 |
| --- | --- |
| `itemKey(doc, path)` | `doc` = `tanshin`/`ir`、`path` = 設計 §4.1 の `path` → 項目キー (文字列) |
| `LABELS` | 項目キー → 標準の表示名 (日本語) |
| `SECTION_OF_ITEM` | 貸借対照表の項目キー → `asset`/`liability`/`equity` |

## ケース

基準にする資料束: 検証器のケース表 (#47) の基準問題 (`src/domain/fixtures/normal.problem.json`。#48 の `src/verifier/fixtures/normal.problem.json` と同じ中身)。**全部入りの資料束**: 基準問題に、第 3 セグメント (短信の注記の前期・当期、IR のセグメント別) と、IR の `outlook.subsequentEvent` の文、IR の `supplement.capex.previous`・`depreciation.previous` の数字を足したもの (テストが作る)。

### L1. 項目キーの文法 (I1 を含む)

| ID | 入力 (doc, path) | 期待 |
| --- | --- | --- |
| I1 | `tanshin` `incomeStatement.current.ordinaryIncome` / `tanshin` `summary.ordinaryIncome.changeRate` / `ir` `segments.items.0.netSales.current` / `ir` `outlook.forecast.netSales` / `ir` `outlook.actual.netSales` | `tanshin.incomeStatement.ordinaryIncome` / `tanshin.summary.ordinaryIncome` / `ir.segments.items.0.netSales` / `ir.outlook.netSales` / `ir.outlook.netSales` |
| L1-1 | `tanshin` `balanceSheet.previous.cash` と `balanceSheet.current.cash` | どちらも `tanshin.balanceSheet.cash` (期は行を分けない) |
| L1-2 | `tanshin` `summary.netSales.previous` / `.current` / `.changeRate` | 3 つとも `tanshin.summary.netSales` |
| L1-3 | `ir` `highlights.netSales.amount` / `highlights.netSales.changeRate` | どちらも `ir.highlights.netSales` (末尾の amount・changeRate を取る) |
| L1-4 | `ir` `outlook.forecast.netSalesChangeRate` | `ir.outlook.netSalesChangeRate` (名前の一部に changeRate を含むだけの項目は、取らない) |
| L1-5 | `tanshin` `notes.segments.current.segments.1.profit` | `tanshin.notes.segments.segments.1.profit` (段は途中にあっても取り、添字は残す) |
| L1-6 | `ir` `supplement.capex.previous` と `supplement.capex.current` | どちらも `ir.supplement.capex` |
| L1-7 | `ir` `results.chart.netSales.axisMin` / `results.chart.netSales.current` | `ir.results.chart.netSales.axisMin` / `ir.results.chart.netSales` (軸の下端は別の行) |
| L1-8 | `tanshin` `header.companyName` / `tanshin` `dates.periodEnd` / `tanshin` `summary.auditNote` | `tanshin.header.companyName` / `tanshin.dates.periodEnd` / `tanshin.summary.auditNote` (段が無ければ頭に資料の種類を付けるだけ) |
| L1-9 | 同じ入力を 2 回 / `tanshin` と `ir` で同じ path (`summary.netSales.current` を `ir` に) | 同じ出力 / 頭だけが違う (`ir.summary.netSales`)。純粋で、資料の種類が頭に付く |

### L2. 標準の表示名が全部ある (I2 を含む)

| ID | 入力 | 期待 |
| --- | --- | --- |
| I2 | 全部入りの資料束の、短信・IR のすべての数値のセル | どれの項目キーも `LABELS` に空でない標準の表示名がある。短信の貸借対照表の項目は `SECTION_OF_ITEM` に部がある |
| L2-1 | 全部入りの資料束の、数値以外のセル (文字列・真偽値) | 行の名前を持つもの (下の「行の名前を持たない」以外) は `LABELS` に標準の表示名がある (`summary.auditNote`・`summary.accountingPolicyChange`・`dates.*`・`notes` の文字列・`outlook.subsequentEvent`) |
| L2-2 | 行の名前を持たないセル: `header.*` (見出し)・`columnDates.*` (列見出し)・`ir.statements.*` (文章)・セグメントの `name` (データが名前を持つ) | `LABELS` に無くてよい (あっても数えない)。この 4 つ以外のセルで `LABELS` に無いものは L2-1 の失敗 |
| L2-3 | `LABELS` の各キー | 全部入りの資料束のどれかのセルの項目キーになる (キーの打ち間違い・使われない項目が無い。表にあっても画面に出ないキーがあると、`labelOverrides` が無効になる: design §7) |
| L2-4 | セグメントの添字 | `…segments.items.0`・`.1`・`.2` と `notes.segments.segments.0`〜`.2` の売上高・利益のキーがある。添字 3 は無い (セグメントは 2〜3) |

### L3. 値の約束 (I3 を含む)

| ID | 入力 | 期待 |
| --- | --- | --- |
| I3 | `LABELS` の値 | 空でなく (前後の空白を除く)、同じ部の中で重複しない |
| L3-1 | 貸借対照表の項目の値 | 部をまたいでも重複しない (`account-section` が「別の部の標準の表示名」で判定するので、2 つの部に同じ名前があると判定できない) |
| L3-2 | `SECTION_OF_ITEM` | キーは `LABELS` にある `tanshin.balanceSheet.` で始まる項目キーと一致し、値は 3 つのどれか。`asset` は資産の部、`liability` は負債の部、`equity` は純資産の部 (例: `cash` = asset、`payables` = liability、`capitalStock` = equity、`totalLiabilitiesAndNetAssets` = equity) |
| L3-3 | 損益計算書とサマリーの同じ名前の行 (営業利益・経常利益) | 項目キーが別で、標準の表示名が同じでもよい (別の項目の名前への差し替えは、検証器の `label-spelling` が許す側) |
| L3-4 | `LABELS` のキー | すべて `tanshin.` か `ir.` で始まる |
