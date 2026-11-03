# ケース表: 会計の整合の検証器 (Sub-task #47)

Task #23。目的 (charter の失敗 1): 異変の無い問題が会計の整合をすべて満たし、異変の問題は**指定した所だけ**が破れていることを、全問に機械で確かめる。設計: [docs/design.md](../design.md) §4 (型)・§4.3 (プールの条件)・§7 (テストの置き場)。試作: `docs/plans/spike/verify.py` (必須 67・参考 12)・`check_ir.py` (36)。

## 0. 公開する入口 (テストが外から呼ぶもの)

内部の関数名には依らず、次の入口の入力と出力だけでテストする。

| 入口 | 入力 → 出力 |
| --- | --- |
| `roundHalfAway(num, den)` (`src/verifier/math.ts`) | 整数 2 つ → 割った商を、0.5 を絶対値の大きい側へ丸めた整数 (作成要領の端数処理) |
| `getPath(problem, doc, path)` (`path.ts`) | `doc` = `tanshin`/`ir`、`path` = 設計 §4.1 の `path` → その場所の値、無ければ `undefined` |
| `numericCells(problem)` (`path.ts`) | 問題 → 数値のセルの `<doc>.<path>` の一覧 (短信・IR の全数値。`null` と文字列は除く) |
| `verifyProblem(problem, company)` (`index.ts`) | 問題と会社 → `{ hard: Violation[]; soft: Violation[] }`。`Violation = { rule: string; paths: string[]; message: string }`。`paths` は `<doc>.<path>` で、規則が読んだセルのうち**食い違った式に関わるもの**。同じ規則が前期・当期の両方で破れたら 2 件 |
| `HARD_RULE_IDS` / `SOFT_RULE_IDS` | 規則 ID の一覧 (§1)。`AnomalyKind.rules` が参照する |
| `checkAnomaly(problem, kinds, result)` | 問題・異変の種類の一覧・`verifyProblem` の結果 → 食い違いのメッセージの配列 (空 = 異変の指定どおり) |
| `shapeErrors(value)` | 未検証の JSON → 型の形の誤りの配列 (空 = `Problem` の形) |
| `verifyDataset(input)` | `{ companies, kinds, problems: [{ file, value }] }` → `{ errors, shortfalls, soft, stats }` (各要素は `{ code, problem?, message }`) |
| CLI `npm run verify:data [-- --dir <データのディレクトリ>] [--require-complete] [--fail-on-soft]` | データ全件を検証。`errors` があれば終了コード 1 |

基準にする正常な問題 (**基準問題**): `src/verifier/fixtures/normal.problem.json` と `company.json`。試作の手書き 1 問 (`hand-q01-full.json`・`hand-q01-ir.json`、AI が手で書き、貸借・損益・CF の連動を 1 つずつ確かめたもの) を、設計の型の英語キーに写した。型に合うことは `satisfies Problem` でコンパイル時に確かめる。

## 1. 規則の一覧 (契約)

`AnomalyKind.rules` (Task #24・#40) はこの ID を参照する。**ID は変えない** (変えるときはチケットで知らせる)。期 (`previous`/`current`) があるものは前期・当期の両方に当てる。数値は、百万円の整数は完全一致、比率は表示値 (% は小数第一位、1 株当たりは小数第二位) の再計算と一致、丸めは 0.5 を遠い側へ (`roundHalfAway`)。

### 1.1 貸借対照表・損益計算書・キャッシュ・フロー計算書の中の式 (両期)

| ID | 式 |
| --- | --- |
| bs-current-assets | totalCurrentAssets = cash + receivables + inventories + otherCurrentAssets |
| bs-fixed-assets | totalFixedAssets = tangibleAssets + investments |
| bs-total-assets | totalAssets = totalCurrentAssets + totalFixedAssets |
| bs-current-liabilities | totalCurrentLiabilities = payables + shortTermDebt + incomeTaxesPayable + otherCurrentLiabilities |
| bs-total-liabilities | totalLiabilities = totalCurrentLiabilities + longTermDebt |
| bs-shareholders-equity | totalShareholdersEquity = capitalStock + capitalSurplus + retainedEarnings |
| bs-net-assets | totalNetAssets = totalShareholdersEquity + nonControllingInterests |
| bs-liabilities-and-net-assets | totalLiabilitiesAndNetAssets = totalLiabilities + totalNetAssets |
| bs-balance | totalAssets = totalLiabilitiesAndNetAssets |
| pl-gross-profit | grossProfit = netSales − costOfSales |
| pl-operating-income | operatingIncome = grossProfit − sga |
| pl-ordinary-income | ordinaryIncome = operatingIncome + nonOperatingIncome − nonOperatingExpenses |
| pl-income-before-tax | incomeBeforeTax = ordinaryIncome + extraordinaryGain − extraordinaryLoss |
| pl-net-income | netIncome = incomeBeforeTax − incomeTaxes |
| pl-net-income-parent | netIncomeParent = netIncome − netIncomeNonControlling |
| cf-subtotal | subtotal = incomeBeforeTax + depreciation + interestDividendIncome + interestExpense + receivablesChange + inventoriesChange + payablesChange + otherAssetsChange + otherLiabilitiesChange |
| cf-operating | operatingCashFlow = subtotal + interestDividendReceived + interestPaid + incomeTaxesPaid |
| cf-investing | investingCashFlow = capex + otherInvestingChange |
| cf-financing | financingCashFlow = shortTermDebtChange + longTermDebtChange + dividendsPaid |
| cf-net-change | netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow + fxEffect |
| cf-ending | cashEnding = cashBeginning + netChangeInCash |

### 1.2 財務諸表のあいだの連動 (当期 = 日本基準・間接法・資金の範囲は現金及び預金)

| ID | 式 |
| --- | --- |
| link-cf-start | CF.incomeBeforeTax = 当期 PL.incomeBeforeTax |
| link-cf-cash-end | CF.cashEnding = 当期 BS.cash |
| link-cf-cash-begin | CF.cashBeginning = 前期 BS.cash |
| link-cf-receivables | CF.receivablesChange = −(当期 − 前期 の BS.receivables) |
| link-cf-inventories | CF.inventoriesChange = −(BS.inventories の増加) |
| link-cf-payables | CF.payablesChange = BS.payables の増加 |
| link-cf-other-assets | CF.otherAssetsChange = −(BS.otherCurrentAssets の増加) |
| link-cf-other-liabilities | CF.otherLiabilitiesChange = BS.otherCurrentLiabilities の増加 |
| link-cf-income-taxes | −CF.incomeTaxesPaid = 当期 PL.incomeTaxes − (BS.incomeTaxesPayable の増加) |
| link-cf-interest-income | CF.interestDividendIncome = −PL.nonOperatingIncome かつ CF.interestDividendReceived = PL.nonOperatingIncome (当期) |
| link-cf-interest-expense | CF.interestExpense = PL.nonOperatingExpenses かつ CF.interestPaid = −PL.nonOperatingExpenses (当期) |
| link-tangible-assets | 当期 BS.tangibleAssets = 前期 BS.tangibleAssets − CF.capex − CF.depreciation |
| link-cf-other-investing | CF.otherInvestingChange = −(BS.investments の増加) |
| link-cf-short-debt | CF.shortTermDebtChange = BS.shortTermDebt の増加 |
| link-cf-long-debt | CF.longTermDebtChange = BS.longTermDebt の増加 |
| link-retained-earnings | 当期 BS.retainedEarnings = 前期 + 当期 PL.netIncomeParent + CF.dividendsPaid |
| link-nci | 当期 BS.nonControllingInterests = 前期 + 当期 PL.netIncomeNonControlling |
| link-capital-unchanged | BS.capitalStock と capitalSurplus が前期と当期で等しい |

### 1.3 サマリー・注記・比率

| ID | 式 |
| --- | --- |
| sum-net-sales / sum-operating-income / sum-ordinary-income / sum-net-income-parent | summary.<項目>.current = 当期 PL の同じ項目、summary.<項目>.previous = 前期 PL の同じ項目 |
| sum-total-assets | summary.totalAssets = 当期 BS.totalAssets |
| sum-net-assets | summary.netAssets = 当期 BS.totalNetAssets |
| sum-change-net-sales / -operating-income / -ordinary-income / -net-income-parent | summary.<項目>.changeRate = 表示した current と previous からの増減率 (% 小数第一位) |
| ratio-eps | summary.eps = 当期 PL.netIncomeParent ÷ notes.averageSharesThousand (円、小数第二位) |
| ratio-equity-ratio | summary.equityRatio = (当期 BS.totalNetAssets − nonControllingInterests) ÷ 当期 BS.totalAssets (% 小数第一位) |
| ratio-bps | summary.bps = (当期 BS.totalNetAssets − nonControllingInterests) ÷ notes.averageSharesThousand (円、小数第二位) |
| ratio-payout | summary.payoutRatio = summary.annualDividend ÷ summary.eps (JPX 作成要領 p.27。% 小数第一位。eps が 0 以下のときは規則に当たらない) |
| ratio-dividend-total | −CF.dividendsPaid = summary.annualDividend × notes.averageSharesThousand ÷ 1,000 (百万円) |
| notes-per-share | notes.eps = summary.eps かつ notes.bps = summary.bps |
| seg-sales-sum | notes のセグメント売上高の合計 = consolidatedNetSales (両期) |
| seg-profit-sum | セグメント利益の合計 + adjustment = consolidatedOperatingIncome (両期) |
| seg-consolidated-sales | consolidatedNetSales = 同じ期の PL.netSales |
| seg-consolidated-profit | consolidatedOperatingIncome = 同じ期の PL.operatingIncome |

### 1.4 見出し・名前 (短信・IR の両方)

| ID | 式 |
| --- | --- |
| header-company-name | header.companyName = company.name |
| header-period-label | header.periodLabel = `<fiscalYear>年<fiscalYearEndMonth>月期` |
| header-unit | header.unit = `百万円` |
| segment-names | 短信 notes のセグメント名と IR segments.items の名前が、company.segmentNames と同じ並びで等しい |

### 1.5 IR スライドの中の式と、短信との一致 (xdoc = 資料間)

| ID | 式 |
| --- | --- |
| xdoc-hl-net-sales / -operating-income / -ordinary-income / -net-income-parent | ir.highlights.<項目>.amount = 短信の当期 PL の同じ項目 |
| ir-hl-change-net-sales / -operating-income / -ordinary-income / -net-income-parent | ir.highlights.<項目>.changeRate = (amount − 短信の前期 PL の同じ項目) の増減率 |
| xdoc-hl-dividend / xdoc-hl-payout | ir.highlights.annualDividend / payoutRatio = summary の同じ項目 |
| xdoc-results-net-sales / -gross-profit / -operating-income | ir.results.<項目>.previous/current = 短信の前期・当期 PL |
| ir-results-gross-margin / -operating-margin | ir.results.grossMargin / operatingMargin = 同じ期の grossProfit / operatingIncome ÷ netSales (IR の中の値、% 小数第一位) |
| xdoc-seg-sales / xdoc-seg-profit | ir.segments.items[i].netSales / profit の前期・当期 = 短信 notes の同じセグメント |
| ir-seg-change-sales / ir-seg-change-profit | items[i].netSales / profit.changeRate = 表示した current と previous からの増減率 |
| ir-seg-share | items[i].salesShare = items[i].netSales.current ÷ ir.results.netSales.current (% 小数第一位) |
| ir-seg-reconcile | items の profit の合計 + adjustment = consolidatedOperatingIncome (両期) |
| xdoc-seg-adjustment / xdoc-seg-consolidated | ir.segments.adjustment = 短信 notes の adjustment、consolidatedOperatingIncome = 短信の PL.operatingIncome (両期) |
| xdoc-outlook-actual-results | ir.outlook.actual.netSales / operatingIncome = 短信の当期 PL |
| xdoc-outlook-actual-capex-depreciation | actual.capex = −CF.capex、actual.depreciation = CF.depreciation |
| ir-outlook-change-net-sales / -operating-income | forecast.netSalesChangeRate / operatingIncomeChangeRate = forecast と actual からの増減率 |
| xdoc-supp-capex-depreciation | supplement.capex.current = −CF.capex、depreciation.current = CF.depreciation |
| xdoc-supp-debt | supplement.interestBearingDebt = BS.shortTermDebt + longTermDebt (両期) |
| xdoc-supp-cash | supplement.cash = BS.cash (両期) |
| ir-supp-net-debt | supplement.netDebt = interestBearingDebt − cash (両期、IR の中の値) |
| xdoc-supp-equity-ratio | supplement.equityRatio = summary.equityRatio |

### 1.6 参考の規則 (soft。遊び手に正常と見えるための範囲。破れても異変ではないので、報告するが既定では失敗にしない)

soft-nonnegative-bs (BS の全項目が 0 以上、利益剰余金を除く)・soft-current-ratio (流動比率 0.8〜4)・soft-equity-ratio-range (自己資本比率 20〜80%)・soft-operating-margin-range (営業利益率 −5〜25%)・soft-sales-growth-range (売上高増減率 ±20%)・soft-operating-profit-positive (営業利益 > 0)・soft-tax-rate-range (実効税率 25〜40%。税引前利益が 0 以下なら当たらない)・soft-ocf-vs-operating-income (営業 CF ÷ 営業利益 0.3〜3)・soft-cash-vs-sales (現金 ÷ 売上高 3〜40%)・soft-payout-max (配当性向 100% 以下)・soft-rates-expressible (増減率の分母になる前期の値が正、eps が正)・soft-payout-cross-path (配当性向 = 配当金総額 ÷ 純利益 を小数第一位まで)。範囲の数字は試作 (gen-measure.md) の仮定で、会計の分かる人の確認は未実施。

## 2. ケース

### 2.1 丸めと場所の取り出し

| ID | 入力 | 期待 |
| --- | --- | --- |
| R1 | `roundHalfAway(5, 2)`・`(−5, 2)` | 3・−3 (0.5 は遠い側) |
| R2 | `roundHalfAway(4, 2)`・`(7, 3)`・`(−7, 3)`・`(1, 3)` | 2・2・−2・0 |
| R3 | `roundHalfAway(0, 5)`・`(1, 2)`・`(−1, 2)` | 0・1・−1 |
| R4 | `roundHalfAway(1, 0)` | 例外 (0 で割らない) |
| P1 | 基準問題で `getPath(…, 'tanshin', 'balanceSheet.current.cash')` | 2300 |
| P2 | 配列の添字 `getPath(…, 'ir', 'segments.items.0.netSales.current')` | 7900 |
| P3 | `getPath(…, 'tanshin', 'header.companyName')` | `第七試作電機株式会社` |
| P4 | 存在しない `balanceSheet.current.nothing`・`balanceSheet.nothing.cash` | どちらも `undefined` |
| P5 | `numericCells(基準問題)` | すべて `tanshin.` か `ir.` で始まり、`null` のセルと文字列のセルを含まない。件数は短信 + IR の数値の数 (実装前に基準問題から数えて固定する: 後述の C1 の対象) |

### 2.2 正常な問題と、ありえない書き方

| ID | 入力 | 期待 |
| --- | --- | --- |
| N1 | `verifyProblem(基準問題, 会社)` | `hard` が空。`soft` も空 |
| N2 | 基準問題の前期・当期を入れ替えず、`fiscalYear` だけ変える (2027 → 2026) | `hard` は `header-period-label` の 2 件 (短信・IR の見出し) だけ |
| N3 | 会社の `name` を変えて渡す | `header-company-name` の 2 件だけ |
| N4 | 会社の `segmentNames` を入れ替えて渡す | `segment-names` だけ (短信・IR の両方の場所が `paths` に出る) |
| N5 | 会社の `fiscalYearEndMonth` を 3 → 9 | `header-period-label` の 2 件だけ |

### 2.3 1 つのセルを変えたとき、破れる規則が**ちょうど**これ (V。基準問題から、指定のセルに加算する)

加算の大きさは、丸めの境目に当たらないように大きく取る (金額 ±100、% ±1.0〜3.0、円 ±10)。期待は「そのセルを読む式」から決めた。

| ID | 変えるセル (加算) | 破れる規則 (`hard` の `rule` の集合) |
| --- | --- | --- |
| V1 | tanshin.balanceSheet.current.totalAssets +100 | bs-total-assets, bs-balance, sum-total-assets, ratio-equity-ratio |
| V2 | tanshin.balanceSheet.current.cash +100 | bs-current-assets, link-cf-cash-end, xdoc-supp-cash |
| V3 | tanshin.balanceSheet.current.totalCurrentAssets +100 | bs-current-assets, bs-total-assets |
| V4 | tanshin.balanceSheet.current.retainedEarnings +100 | bs-shareholders-equity, link-retained-earnings |
| V5 | tanshin.balanceSheet.current.totalNetAssets +100 | bs-net-assets, bs-liabilities-and-net-assets, sum-net-assets, ratio-equity-ratio, ratio-bps |
| V6 | tanshin.incomeStatement.current.ordinaryIncome +100 | pl-ordinary-income, pl-income-before-tax, sum-ordinary-income, xdoc-hl-ordinary-income |
| V7 | tanshin.summary.ordinaryIncome.changeRate +2.0 | sum-change-ordinary-income |
| V8 | tanshin.summary.netSales.current +100 | sum-net-sales, sum-change-net-sales |
| V9 | tanshin.cashFlow.cashEnding +100 | cf-ending, link-cf-cash-end |
| V10 | tanshin.cashFlow.operatingCashFlow +100 | cf-operating, cf-net-change |
| V11 | tanshin.cashFlow.depreciation +100 | cf-subtotal, link-tangible-assets, xdoc-outlook-actual-capex-depreciation, xdoc-supp-capex-depreciation |
| V12 | tanshin.cashFlow.capex −100 | cf-investing, link-tangible-assets, xdoc-outlook-actual-capex-depreciation, xdoc-supp-capex-depreciation |
| V13 | tanshin.incomeStatement.current.incomeTaxes +100 | pl-net-income, link-cf-income-taxes |
| V14 | tanshin.notes.segments.current.segments.0.netSales +100 | seg-sales-sum, xdoc-seg-sales |
| V15 | tanshin.notes.segments.current.adjustment +10 | seg-profit-sum, xdoc-seg-adjustment |
| V16 | ir.highlights.netSales.amount +100 | xdoc-hl-net-sales, ir-hl-change-net-sales |
| V17 | ir.segments.items.0.netSales.current +100 | xdoc-seg-sales, ir-seg-change-sales, ir-seg-share |
| V18 | ir.supplement.capex.current +100 | xdoc-supp-capex-depreciation |
| V19 | ir.supplement.netDebt.current +100 | ir-supp-net-debt |
| V20 | ir.results.operatingMargin.current +1.0 | ir-results-operating-margin |
| V21 | ir.header.companyName を `第七試作電機株式会杜` に | header-company-name (paths は ir.header.companyName のみ) |
| V22 | tanshin.header.unit を `千円` に | header-unit |
| V23 | ir.header.periodLabel を `2026年3月期` に | header-period-label |
| V24 | tanshin.notes.segments.current.segments.1.name を別の名前に | segment-names |
| V25 | tanshin.summary.payoutRatio +3.0 | ratio-payout, xdoc-hl-payout |
| V26 | tanshin.notes.averageSharesThousand +400 | ratio-eps, ratio-bps, ratio-dividend-total |
| V27 | tanshin.summary.eps +10 | ratio-eps, notes-per-share, ratio-payout |
| V28 | ir.outlook.forecast.netSalesChangeRate +1.0 | ir-outlook-change-net-sales |
| V29 | ir.highlights.annualDividend +2 | xdoc-hl-dividend |
| V30 | tanshin.cashFlow.interestDividendIncome +10 | cf-subtotal, link-cf-interest-income |
| V31 | tanshin.balanceSheet.previous.totalAssets +100 | bs-total-assets, bs-balance |
| V32 | tanshin.balanceSheet.previous.receivables +100 | bs-current-assets, link-cf-receivables |

加えて、`paths` の確認: V1 の `bs-total-assets` の `paths` に `tanshin.balanceSheet.current.totalAssets` が含まれ、`balanceSheet.previous` のセルは含まれない。V31 の `paths` は `previous` のセルだけ。

### 2.4 どの数字を変えても、どれかの規則が破れる (C。守られていない数字が無い)

| ID | 入力 | 期待 |
| --- | --- | --- |
| C1 | `numericCells(基準問題)` の**各セル**を 1 つずつ変える (整数は +1、% の項目は +0.1、1 株当たりは +0.01) | どのセルでも、`hard` が 1 件以上あり、そのどれかの `paths` が**変えたセル**を含む。ただし**守られていないと明示した次のセルだけは除く**: ir.outlook.forecast.capex・depreciation・annualDividend (次期の予想で、他の式が無い) |
| C2 | 除外したセルの一覧 | 上の 3 つだけ (実装で増やさない。増やすときはケース表に理由を足す) |
| C3 | 文字列のセルのうち、見出し (社名・期・単位) を `x` に変える | それぞれ header-company-name・header-period-label・header-unit が破れる (短信・IR 両方)。注記の文 (goingConcern・cashScope・subsequentEvents) と commentary は式が無いので破れない (明示) |

### 2.5 参考の規則 (S。各ケースで、指定の ID が `soft` に出る。`hard` は問わない)

| ID | 変えるセル | 期待する soft |
| --- | --- | --- |
| S1 | tanshin.balanceSheet.current.receivables を −5 に | soft-nonnegative-bs |
| S2 | balanceSheet.current.totalCurrentAssets を 1,000 に | soft-current-ratio |
| S3 | summary.equityRatio を 10.0 に | soft-equity-ratio-range |
| S4 | incomeStatement.current.operatingIncome を 4,000 に | soft-operating-margin-range |
| S5 | summary.netSales.changeRate を 25.0 に | soft-sales-growth-range |
| S6 | incomeStatement.current.operatingIncome を −1 に | soft-operating-profit-positive |
| S7 | incomeStatement.current.incomeTaxes を 100 に | soft-tax-rate-range |
| S8 | cashFlow.operatingCashFlow を 100 に | soft-ocf-vs-operating-income |
| S9 | balanceSheet.current.cash を 100 に | soft-cash-vs-sales |
| S10 | summary.payoutRatio を 120.0 に | soft-payout-max |
| S11 | summary.netSales.previous を 0 に | soft-rates-expressible |
| S12 | summary.payoutRatio を 31.0 に | soft-payout-cross-path |
| S13 | 基準問題のまま | `soft` が空 (S1〜S12 のどれも出ない) |

### 2.6 異変の指定どおりにだけ破れているか (A。`checkAnomaly`)

異変の種類の例 (テスト内の表): `k-balance` = rules [bs-total-assets, bs-balance, sum-total-assets, ratio-equity-ratio]、`k-rate` = [sum-change-ordinary-income]、`k-company` = [header-company-name]、`k-text` = [] (式で見つけられない注記の誤植)。問題は基準問題から V1・V7・V21 の変更を施したもの。

| ID | 入力 | 期待 |
| --- | --- | --- |
| A1 | V7 の問題、`anomaly = { kind: 'k-rate', places: [{ doc: 'tanshin', path: 'summary.ordinaryIncome.changeRate' }], explanation: '…' }` | メッセージ 0 件 |
| A2 | A1 の問題で `kind` を `k-balance` に | 「破れた規則が種類の指定と違う」(実際 {sum-change-ordinary-income}、指定 {…}) |
| A3 | V1 の問題 (`k-balance`)、`places` が `tanshin.balanceSheet.current.totalAssets` | 0 件 |
| A4 | A3 で `places` を `tanshin.balanceSheet.current.cash` (食い違いに関わらないセル) に | 「どの違反にも触れない場所」と「場所に触れない違反」 |
| A5 | A3 で `places` を 2 つ (totalAssets と cash) | 「違反に触れない場所」(cash) |
| A6 | A1 で `places` の `path` を存在しない `summary.nothing` に | 「場所が実在しない」 |
| A7 | V21 の問題、`k-company`、places = `ir.header.companyName` | 0 件 |
| A8 | 基準問題のまま (式が破れていない) で `anomaly = { kind: 'k-rate', … }` | 「指定した規則が破れていない」 |
| A9 | `k-text` (rules が空) の問題で、基準問題の `notes.goingConcern` の文だけを変え、places = `tanshin.notes.goingConcern` | 0 件 (規則が空なら、違反が 0 件で場所が実在すればよい) |
| A10 | A9 の問題で、さらに V1 の変更も入れる | 「規則が空の種類なのに式が破れている」 |
| A11 | `explanation` が空文字 | 「答え合わせの文言が空」 |
| A12 | 正常な問題 (`anomaly: null`) に `labelOverrides` がある | 「正常な問題に項目名の差し替え」 |
| A13 | `anomaly.kind` が一覧に無い | 「異変の種類が一覧に無い」 |

### 2.7 型の形 (SH。`shapeErrors`)

| ID | 入力 | 期待 |
| --- | --- | --- |
| SH1 | 基準問題 | 空 |
| SH2 | 基準問題から `tanshin.cashFlow.capex` を消す | 誤り 1 件 (場所つき: `tanshin.cashFlow.capex`) |
| SH3 | `tanshin.balanceSheet.current.cash` を文字列 `"2300"` に | 型の誤り (場所つき) |
| SH4 | 数値のセルを `NaN`・`Infinity` に (JSON では書けないので、値として渡す) | 誤り |
| SH5 | 未知のキー `tanshin.summary.typo: 1` を足す | 未知のキー (場所つき。誤植を見逃さない) |
| SH6 | `ir.segments.items` を 1 要素に | 長さの誤り (2 要素) |
| SH7 | `ir.supplement.capex.previous` が `null`・数値 | どちらも空 (許す)。`ir.supplement.capex.current` が `null` なら誤り |
| SH8 | 任意項目 (`tier`・`labelOverrides`・`results.commentary`・`outlook.commentary`) を足す | 空 (許す)。`tier: 4` や `tier: '1'` は誤り |
| SH9 | `difficulty` が `normal` | 誤り (`easy`/`hard` だけ) |
| SH10 | `anomaly.places` が空配列 | 誤り (1 件以上) |
| SH11 | `anomaly.places[0].doc` が `pdf` | 誤り |
| SH12 | ルートが配列・`null`・文字列 | 誤り 1 件 (「問題がオブジェクトでない」)。以降の検証を止める (例外にならない) |

### 2.8 データ全件 (D。`verifyDataset`)

入力は、基準問題を `easy-001`(`problems/easy/easy-001.json`) として置き、会社 `fixture-c01`、異変の種類の例の表を使う。`errors` は致命 (CI を落とす)、`shortfalls` は「数が足りない」(完成の段階で効く)。

| ID | 入力 | 期待 |
| --- | --- | --- |
| D1 | 基準問題 1 件・会社 1 社 | `errors` 空。`stats` に難易度ごとの問題数 (easy 1・hard 0)・異変あり・なし |
| D2 | `id` とファイル名が違う (`easy-002.json` の中身が `easy-001`) | code `id-mismatch` |
| D3 | `difficulty: hard` の問題が `problems/easy/` にある | code `difficulty-mismatch` |
| D4 | `companyId` が会社の一覧に無い | code `unknown-company` |
| D5 | 同じ `id` が 2 ファイル | code `duplicate-id` |
| D6 | 異変の問題の `kind` が一覧に無い | code `unknown-kind` |
| D7 | 正常な問題が 1 件でも `hard` を破る (V1 の変更) | code `hard-violation` (規則 ID と場所を含む)。`problem` に ID |
| D8 | 異変の問題が種類の指定と違う (A2 相当) | code `anomaly-mismatch` |
| D9 | 型の形が誤り (SH2) | code `shape` だけを出し、その問題の規則の検証は行わない (落ちない) |
| D10 | `AnomalyKind.rules` に存在しない規則 ID (`bs-nothing`) | code `unknown-rule` (kind の ID を含む) |
| D11 | 会社の `id` が重複 / 異変の種類の `id` が重複 | code `duplicate-company`・`duplicate-kind` |
| D12 | `soft` の違反だけ (S3 相当) | `errors` 空。`soft` に出る (`--fail-on-soft` で致命) |
| D13 | 難易度ごとの問題数が 25 未満 | `shortfalls` に code `pool-size` (easy・hard それぞれ)。`errors` ではない |
| D14 | 異変あり・なしの両方を持つ会社が難易度ごとに 8 社未満 | `shortfalls` に code `both-sided-companies` |
| D15 | 25 問・8 社が両面に揃ったデータ (基準問題の複製 25 件に、ID と会社 ID だけ変える。異変あり 25 件のうち…) | `shortfalls` 空。※複製は id・companyId・難易度だけを変えた正常な問題と、V7 の変更を施した異変の問題を使う |
| D16 | 問題 0 件・会社 0 社・種類 0 件 | `errors` 空、`shortfalls` に pool-size (easy・hard) と both-sided-companies |

### 2.9 CLI (L。`npm run verify:data`)

テストは一時ディレクトリに `companies.json`・`anomaly-kinds.json`・`problems/<難易度>/*.json` を作り、`node --experimental-strip-types scripts/verify-data.ts --dir <一時ディレクトリ>` を実行する (npm のスクリプトと同じコマンド)。

| ID | 入力 | 期待 |
| --- | --- | --- |
| L1 | 基準問題 1 件のディレクトリ | 終了コード 0。出力に検証した問題の数と、`shortfalls` (数が足りない) が警告として出る |
| L2 | 規則を破る問題 (V1) | 終了コード 1。出力に問題のファイルのパス・規則 ID・場所 |
| L3 | 数が足りない (D13) だけ | 既定は終了コード 0。`--require-complete` を付けると 1 |
| L4 | 参考の規則だけ (D12) | 既定は終了コード 0。`--fail-on-soft` を付けると 1 |
| L5 | JSON として壊れたファイル | 終了コード 1。出力にファイルのパス (他のファイルの検証は続ける) |
| L6 | ディレクトリが無い | 終了コード 1。「読めません」 |
| L7 | リポジトリの本物のデータ (`src/data`、いまは問題 0 件) | 終了コード 0 (CI がこの状態で通る) |

## 3. 受け入れ条件との対応

| 受け入れ条件 (Task #23) | ケース |
| --- | --- |
| 試作の規則を、設計の言語とデータの形で作り直す | §1 (規則の一覧)・N1・V1〜V32・C1〜C3・S1〜S13 |
| 異変の問題は指定した所だけが破れている | A1〜A13・D8 |
| 単体テストがある | 全ケース (Vitest) |
| 全問を検証するコマンドが CI で回る | L1〜L7・D1〜D16。CI のケースは #49 で `ci.yml` に足す (`ci.test.ts` の C3 を `npm run verify:data` の位置つきに直す) |

## 4. 範囲外

- 会社の設定・異変の種類の一覧そのもの (Task #24)・問題の制作 (#25・#26)。いまは基準問題だけで検証する
- 項目名の差し替え (`labelOverrides`) のキーが `labels.ts` にあること・値が標準と違うこと (`labels.ts` の `itemKey` は画面の Task #27 の成果物。そこで `labels.ts` ができたら、データの検証に足す。設計 §7 の該当行は #27 の受け入れ条件に回す)
- 実在の企業名との衝突の確認 (Task #24)
- 会計の分かる人による soft の範囲の確認
