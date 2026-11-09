# ケース表: 会計の整合の検証器 (Sub-task #47)

Task #23。型は #52 で広げたもの ([design.md](../design.md) §4.2・§4.5。異変の一覧 [anomalies.md](../plans/anomalies.md) の 45 種類を表せる。うち H-25〜H-27 は使わないので、`anomaly-kinds.json` は 42 種類)。目的 (charter の失敗 1): 異変の無い問題が会計の整合をすべて満たし、異変の問題は**指定した所だけ**が破れていることを、全問に機械で確かめる。設計: [docs/design.md](../design.md) §4 (型)・§4.3 (プールの条件)・§7 (テストの置き場)。試作: `docs/plans/spike/verify.py` (必須 67・参考 12)・`check_ir.py` (36)。

## 0. 公開する入口 (テストが外から呼ぶもの)

内部の関数名には依らず、次の入口の入力と出力だけでテストする。

| 入口 | 入力 → 出力 |
| --- | --- |
| `roundHalfAway(num, den)` (`src/verifier/math.ts`) | 整数 2 つ → 割った商を、0.5 を絶対値の大きい側へ丸めた整数 (作成要領の端数処理) |
| `toIrUnit(百万円, irUnit)`・`scaled10(x)`・`dividendAmount(円, 千株)` (`math.ts`) | 百万円の整数 → IR の単位の値 (億円は ÷100 を小数第一位まで四捨五入、百万円はそのまま) / 億円の値 → 10 倍した整数 `Math.round(x × 10)` (比較に使う。浮動小数の誤差を避ける) / 1 株当たり配当 (円) × 株数 (千株) ÷ 1,000 を**百万円未満切捨て**した整数 |
| `getPath(problem, doc, path)` (`path.ts`) | `doc` = `tanshin`/`ir`、`path` = 設計 §4.1 の `path` → その場所の値、無ければ `undefined` |
| `numericCells(problem)` (`path.ts`) | 問題 → 数値のセルの `<doc>.<path>` の一覧 (短信・IR の全数値。`null` と文字列は除く) |
| `verifyProblem(problem, company)` (`index.ts`) | 問題と会社 → `{ hard: Violation[]; soft: Violation[] }`。`Violation = { rule: string; paths: string[]; message: string }`。`paths` は `<doc>.<path>` で、規則が読んだセルのうち**食い違った式に関わるもの**。同じ規則が前期・当期の両方で破れたら 2 件 |
| `HARD_RULE_IDS` / `SOFT_RULE_IDS` | 規則 ID の一覧 (§1)。`AnomalyKind.primaryRules`・`allowedRules` が参照する |
| `itemKey(doc, path)`・`LABELS`・`SECTION_OF_ITEM` (`src/domain/labels.ts`) | 設計 §4.1 の項目キーの文法。`LABELS` = 項目キー → 標準の表示名 (日本語)、`SECTION_OF_ITEM` = 貸借対照表の項目キー → 部 (`asset`/`liability`/`equity`)。**画面の Task (#27) が使う共有の土台を、科目名の規則 (§1.6) のために #23 で作る** |
| `checkAnomaly(problem, kinds, result)` | 問題・異変の種類の一覧・`verifyProblem` の結果 → 食い違いのメッセージの配列 (空 = 異変の指定どおり。意味は §2.6) |
| `shapeErrors(value)` | 未検証の JSON → 型の形の誤りの配列 (空 = `Problem` の形) |
| `verifyDataset(input)` | `{ companies, kinds, problems: [{ file, value }] }` → `{ errors, shortfalls, soft, stats }` (各要素は `{ code, problem?, message }`)。`companies`・`kinds` の中身の形も検証する |
| CLI `npm run verify:data [-- --dir <データのディレクトリ>] [--require-complete] [--fail-on-soft]` | データ全件を検証。`errors` があれば終了コード 1。`companies.json`・`anomaly-kinds.json`・`problems/` が**無ければ 0 件として扱う** (ディレクトリそのものが無いのは、`--dir` を明示したときだけ誤り) |

基準にする正常な問題 (**基準問題**): `src/verifier/fixtures/normal.problem.json` と `company.json`。試作の手書き 1 問 (`hand-q01-full.json`・`hand-q01-ir.json`、AI が手で書き、貸借・損益・CF の連動を 1 つずつ確かめたもの) を、設計の型の英語キーに写した。型に合うことは `shapeErrors` (実行時) と、型検査 (`tsc`。JSON の文字列はリテラル型にならないので `satisfies` は使わず、テストで `as Problem` に通す前に `shapeErrors` が空であることを確かめる) で確かめる。**基準問題 B**: 億円・3 セグメントの会社の基準問題 (`normal-b.problem.json`・`company-b.json`)。基準問題から、IR の金額を億円 (÷100、小数第一位) にし、セグメントを 3 つにして作る。値は IR の表示値どうしが完全に一致するものを選ぶ。**浮動小数の罠が自然に入っている**: 前期の有利子負債 48.3 億円・現金 21.0 億円・純有利子負債 27.3 億円 (`48.3 − 21.0` は JavaScript で 27.299999999999997 になり、27.3 と `===` で一致しない。測った)。`124.6 − 30.2` の組は R7 が直接確かめる。**B は億円の規則の実装より先に commit し、N6 が赤になることを確かめてから実装する** (通る値だけを選ばないため)。

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
| cf-financing | financingCashFlow = shortTermDebtChange + longTermBorrowings + longTermRepayments + dividendsPaid |
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
| link-cf-long-debt | CF.longTermBorrowings + CF.longTermRepayments = BS.longTermDebt の増加 (総額表示。anomalies.md G4) |
| link-cf-dividends-paid | −CF.dividendsPaid = ((summary.annualDividendPrevious − interimDividendPrevious) + summary.interimDividend) × notes.averageSharesThousand ÷ 1,000 (前期の期末配当 + 当期の中間配当。anomalies.md G5。百万円未満**切捨て**) |
| link-retained-earnings | 当期 BS.retainedEarnings = 前期 + 当期 PL.netIncomeParent + CF.dividendsPaid |
| link-nci | 当期 BS.nonControllingInterests = 前期 + 当期 PL.netIncomeNonControlling |
| link-capital-unchanged | BS.capitalStock と capitalSurplus が前期と当期で等しい |

### 1.3 サマリー・注記・比率

増減率の規則 (sum-change-*・ir-hl-change-*・ir-seg-change-*・ir-outlook-change-*) は、**分母 (前期の値) が 0 以下のときは当たらない** (例外にしない)。その状態は参考の規則 soft-rates-expressible が報告する (型の `changeRate: number` は「－」を書けないため、正常な問題では分母を正に保つ)。

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
| ratio-dividend-total | summary.dividendTotal = summary.annualDividend × notes.averageSharesThousand ÷ 1,000 (百万円未満**切捨て**。作成要領の端数処理・anomalies.md G2) |
| sum-equity | summary.equity = 当期 BS.totalNetAssets − nonControllingInterests |
| ratio-operating-margin | summary.operatingMargin = 当期 PL.operatingIncome ÷ netSales (% 小数第一位) |
| ratio-roe | summary.roe = 当期 PL.netIncomeParent ÷ ((前期 equity + 当期 equity) ÷ 2) (% 小数第一位。equity = BS.totalNetAssets − nonControllingInterests) |
| check-eps-product | 別経路: summary.eps × notes.averageSharesThousand ÷ 1,000 = 当期 PL.netIncomeParent (百万円、四捨五入。一致しない = 遊び手が検算すると正常が異変に見える)。averageSharesThousand が 1 億株 (100,000 千株) 以上の会社は、丸めの誤差でこの規則を満たせないので使わない |
| check-bps-product | 別経路: summary.bps × notes.averageSharesThousand ÷ 1,000 = summary.equity (同上) |
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
| header-securities-code | header.securitiesCode = company.securitiesCode (短信・IR) |
| header-unit | header.unit = 短信は `百万円`、IR は company.irUnit |
| segment-names | 短信 notes のセグメント名と IR segments.items の名前が、company.segmentNames と同じ並びで等しい |
| seg-count | 短信 notes (前期・当期) と IR segments.items のセグメントの数が、company.segmentNames の数 (2 か 3) と等しい (IR から欠けるのは H-19) |

### 1.5 IR スライドの中の式と、短信との一致 (xdoc = 資料間)

**単位**: IR の金額は company.irUnit の単位。`億円` の会社は、短信の百万円 ÷ 100 を小数第一位まで四捨五入 (0.5 は遠い側へ。12,456 → 124.6) した値と比べる (`toIrUnit(百万円, irUnit)`)。**比率** (増減率・利益率・構成比) は、**両方の項が短信にある場合は短信の百万円の値から計算した値**と比べる (億円の丸めに左右されない。ir-hl-change-*・ir-results-*-margin・ir-seg-change-*・ir-seg-share)。IR にだけある項 (次期の予想) を含む比率 (ir-outlook-change-*) は、IR の表示値から計算する。したがって IR の金額だけを変える異変 (H-13 など) では、IR の比率の規則は破れない。IR の中の足し算・引き算 (ir-seg-reconcile・ir-supp-net-debt) は、**10 倍した整数 (`scaled10`) にして**表示値どうしで完全に一致させる。

| ID | 式 |
| --- | --- |
| xdoc-hl-net-sales / -operating-income / -ordinary-income / -net-income-parent | ir.highlights.<項目>.amount = 短信の当期 PL の同じ項目 |
| ir-hl-change-net-sales / -operating-income / -ordinary-income / -net-income-parent | ir.highlights.<項目>.changeRate = 短信の当期 PL と前期 PL の同じ項目からの増減率 |
| xdoc-hl-dividend / xdoc-hl-payout | ir.highlights.annualDividend / payoutRatio = summary の同じ項目 |
| xdoc-results-net-sales / -gross-profit / -operating-income | ir.results.<項目>.previous/current = 短信の前期・当期 PL |
| ir-results-gross-margin / -operating-margin | ir.results.grossMargin / operatingMargin = 同じ期の**短信の** PL.grossProfit / operatingIncome ÷ netSales (% 小数第一位) |
| xdoc-seg-sales / xdoc-seg-profit | ir.segments.items[i].netSales / profit の前期・当期 = 短信 notes の同じセグメント |
| ir-seg-change-sales / ir-seg-change-profit | items[i].netSales / profit.changeRate = **短信の** notes の同じセグメントの当期・前期からの増減率 |
| ir-seg-share | items[i].salesShare = **短信の** notes の同じセグメントの当期売上高 ÷ 当期 PL.netSales (% 小数第一位) |
| ir-seg-reconcile | items の profit の合計 + adjustment = consolidatedOperatingIncome (両期、IR の中の値。`scaled10` で比べる) |
| xdoc-seg-adjustment / xdoc-seg-consolidated | ir.segments.adjustment = 短信 notes の adjustment、consolidatedOperatingIncome = 短信の PL.operatingIncome (両期) |
| xdoc-outlook-actual-results | ir.outlook.actual.netSales / operatingIncome = 短信の当期 PL |
| xdoc-outlook-actual-capex-depreciation | actual.capex = −CF.capex、actual.depreciation = CF.depreciation |
| ir-outlook-change-net-sales / -operating-income | forecast.netSalesChangeRate / operatingIncomeChangeRate = forecast と actual からの増減率 |
| xdoc-supp-capex-depreciation | supplement.capex.current = −CF.capex、depreciation.current = CF.depreciation |
| xdoc-supp-debt | supplement.interestBearingDebt = BS.shortTermDebt + longTermDebt (両期) |
| xdoc-supp-cash | supplement.cash = BS.cash (両期) |
| ir-supp-net-debt | supplement.netDebt = interestBearingDebt − cash (両期、IR の中の値。`scaled10` で比べる) |
| xdoc-supp-equity-ratio | supplement.equityRatio = summary.equityRatio |

### 1.6 数値の等式でない規則 (種類の主な規則として要る。anomalies.md の E-03〜E-08・E-17・H-21〜H-24・H-28。design §4.5)

| ID | 式・判定 | 読む場所 |
| --- | --- | --- |
| unit-consistency | `unitOverrides` の各項目の値が、その資料の `header.unit` と等しい (正常な問題は `unitOverrides` が無いので満たす) | `<doc>.<画面の ID>.unit` |
| sign-consistency | `signOverrides` の各項目の値が、標準の負の記号 `△` と等しい | その `<doc>.<path>` |
| label-spelling | `labelOverrides` の各項目の値が、その項目キーの標準の表示名 (`LABELS`) と等しいか、別の項目の標準の表示名であること。**どちらでもない値 (誤字) があれば破れる** | `<doc>.<項目キー>` |
| account-section | `labelOverrides` の値が**別の部**(貸借対照表の資産・負債・純資産) の項目の標準の表示名であれば破れる (「売掛金」→「買掛金」) | `<doc>.<項目キー>` |
| chart-axis-zero | `ir.results.chart.*.axisMin` が 0 | `ir.results.chart.<項目>.axisMin` |
| chart-bars | 棒の高さが表示の数字と同じ: `chart.netSales.previous/current` = `results.netSales.previous/current`、operatingIncome も同じ | `ir.results.chart.<項目>.<期>` |
| dates-period-end | `dates.periodEnd` が company の決算期末 (`fiscalYear` 年 `fiscalYearEndMonth` 月の末日) で、`previousPeriodEnd` が 1 年前の同じ末日 | `tanshin.dates.*` |
| dates-order | `periodEnd` < `disclosure` < `shareholdersMeeting` (ISO の文字列の大小) | `tanshin.dates.*` |
| dates-column-headings | `columnDates` のすべての列が `dates.previousPeriodEnd`・`periodEnd` と等しい | `tanshin.columnDates.*` |
| claims-direction | `ir.statements[].claims[]` の方向が数字の動きと合う。`netSales`・`operatingIncome`・`ordinaryIncome`・`netIncomeParent` = 短信の当期 − 前期の符号 (up = 増、down = 減)、`forecastNetSales`・`forecastOperatingIncome` = 次期の予想 − 当期の実績の符号、`dividend` = summary.annualDividend − annualDividendPrevious の符号、`operatingCashFlow` = 営業 CF の符号 (up = プラス、down = マイナス)、`interestBearingDebt` = 当期 − 前期の符号 (zero = 当期が 0)。**差が 0 のとき (前期と同じ) は、up も down も破れる** (変化が無いのに増減を主張できない) | `ir.statements.<添字>` |
| audit-note | `summary.auditNote` = 「決算短信は公認会計士又は監査法人の監査の対象外です」 | `tanshin.summary.auditNote` |
| accounting-policy-match | `summary.accountingPolicyChange` = (`notes.accountingPolicyNote` が「該当事項はありません。」でない) | `tanshin.summary.accountingPolicyChange`・`tanshin.notes.accountingPolicyNote` |
| subsequent-event-match | (`notes.subsequentEvents` が「該当事項はありません。」) = (`ir.outlook.subsequentEvent` が `null`) | `tanshin.notes.subsequentEvents`・`ir.outlook.subsequentEvent` |

### 1.7 参考の規則 (soft。遊び手に正常と見えるための範囲。破れても異変ではないので、報告するが既定では失敗にしない)

soft-nonnegative-bs (BS の全項目が 0 以上、利益剰余金を除く)・soft-current-ratio (流動比率 0.8〜4)・soft-equity-ratio-range (自己資本比率 20〜80%)・soft-operating-margin-range (営業利益率 −5〜25%)・soft-sales-growth-range (売上高増減率 ±20%)・soft-operating-profit-positive (営業利益 > 0)・soft-tax-rate-range (実効税率 25〜40%。税引前利益が 0 以下なら当たらない)・soft-ocf-vs-operating-income (営業 CF ÷ 営業利益 0.3〜3。**営業 CF の主張が down (マイナス) の問題は下限を外す** = 3 以下。R-S5 (f) が正常に営業 CF がマイナスの会社を求めるため。#171 で直した。docs/test-cases/problems-hard.md §2.4・rules.test.ts の S14〜S16)・soft-cash-vs-sales (現金 ÷ 売上高 3〜40%)・soft-payout-max (配当性向 100% 以下)・soft-rates-expressible (増減率の分母になる前期の値が正、eps が正)・soft-payout-cross-path (配当性向 = 配当金総額 ÷ 純利益 を小数第一位まで)。範囲の数字は試作 (gen-measure.md) の仮定で、会計の分かる人の確認は未実施。

## 2. ケース

### 2.1 丸めと場所の取り出し

| ID | 入力 | 期待 |
| --- | --- | --- |
| R1 | `roundHalfAway(5, 2)`・`(−5, 2)` | 3・−3 (0.5 は遠い側) |
| R2 | `roundHalfAway(4, 2)`・`(7, 3)`・`(−7, 3)`・`(1, 3)` | 2・2・−2・0 |
| R3 | `roundHalfAway(0, 5)`・`(1, 2)`・`(−1, 2)` | 0・1・−1 |
| R4 | `roundHalfAway(1, 0)` | 例外 (0 で割らない)。規則の側は、増減率の分母が 0 以下のときこの関数を呼ばない (§1.3。S11) |
| R5 | `toIrUnit(12456, '億円')`・`toIrUnit(12450, '億円')`・`toIrUnit(-12450, '億円')`・`toIrUnit(12456, '百万円')` | 124.6・124.5・−124.5・12456 (12,450 ÷ 100 = 124.50 は小数第一位でちょうど 124.5) |
| R6 | `toIrUnit(12449, '億円')`・`toIrUnit(12455, '億円')` | 124.5・124.6 (小数第二位の 5 は切り上げ) |
| R7 | `scaled10(124.6) − scaled10(30.2)`・`scaled10(94.4)`・`scaled10(0.1 + 0.2)` | 944・944・3 (浮動小数の誤差に左右されない) |
| R8 | `dividendAmount(25, 8630)`・`dividendAmount(30, 8600)`・`dividendAmount(0, 8600)` | 215 (215.75 の切捨て)・258・0 |
| P1 | 基準問題で `getPath(…, 'tanshin', 'balanceSheet.current.cash')` | 2300 |
| P2 | 配列の添字 `getPath(…, 'ir', 'segments.items.0.netSales.current')` | 7900 |
| P3 | `getPath(…, 'tanshin', 'header.companyName')` | `第七試作電機株式会社` |
| P4 | 存在しない `balanceSheet.current.nothing`・`balanceSheet.nothing.cash` | どちらも `undefined` |
| P6 | 単位の場所 `getPath(…, 'tanshin', 'balanceSheet.unit')`・存在しない画面 `nothing.unit` | 前者は短信の `header.unit` (`百万円`)、後者は `undefined` |
| I1 | `itemKey('tanshin', 'incomeStatement.current.ordinaryIncome')`・`('tanshin', 'summary.ordinaryIncome.changeRate')`・`('ir', 'segments.items.0.netSales.current')`・`('ir', 'outlook.forecast.netSales')`・`('ir', 'outlook.actual.netSales')` | `tanshin.incomeStatement.ordinaryIncome`・`tanshin.summary.ordinaryIncome`・`ir.segments.items.0.netSales`・`ir.outlook.netSales`・`ir.outlook.netSales` (設計 §4.1 の文法) |
| I2 | 短信・IR のすべての数値のセルの `itemKey` | どれも `LABELS` に標準の表示名がある (抜けた項目名が無い)。短信の貸借対照表の項目は `SECTION_OF_ITEM` に部がある |
| I3 | `LABELS` の値 | 空でなく、同じ部の中で重複しない |
| P5 | `numericCells(基準問題)` | すべて `tanshin.` か `ir.` で始まり、`null` のセルと文字列のセルを含まない。件数は、テストが基準問題を独立にたどって数えた数値のセルの数と等しい (C1 の対象) |

### 2.2 正常な問題と、ありえない書き方

| ID | 入力 | 期待 |
| --- | --- | --- |
| N1 | `verifyProblem(基準問題, 会社)` | `hard` が空。`soft` も空 |
| N2 | 基準問題の前期・当期を入れ替えず、`fiscalYear` だけ変える (2027 → 2026) | `hard` は `header-period-label` の 2 件 (短信・IR の見出し) と `dates-period-end` の 2 件 (期末日・前期末日) だけ |
| N3 | 会社の `name` を変えて渡す | `header-company-name` の 2 件だけ |
| N4 | 会社の `segmentNames` を入れ替えて渡す | `segment-names` だけ (短信・IR の両方の場所が `paths` に出る) |
| N5 | 会社の `fiscalYearEndMonth` を 3 → 9 | `header-period-label` の 2 件と `dates-period-end` の 2 件だけ |
| N6 | **基準問題 B** (億円・3 セグメント。§0) と会社 B | `hard` が空。`soft` も空 (`億円` の換算・3 セグメントの規則が働く) |
| N7 | 基準問題 B の IR の `header.unit` を `百万円` に | `header-unit` だけ |
| N8 | 基準問題 B の `ir.highlights.netSales.amount` に +0.1 (億円) | `xdoc-hl-net-sales` だけ (IR の比率は短信から計算するので、IR の金額を変えても破れない) |
| N9 | 決算期 2 月・2028 年の問題 (見出し `2028年2月期`、`dates.periodEnd` = `2028-02-29`、`previousPeriodEnd` = `2027-02-28`、列見出しも同じ。会社の `fiscalYearEndMonth` = 2、発表日・総会の日はその後) | `hard` が空 (うるう年の末日を関数で求める) |

### 2.3 1 つのセルを変えたとき、破れる規則が**ちょうど**これ (V。基準問題から、指定のセルに加算する)

加算の大きさは、丸めの境目に当たらないように大きく取る (金額 ±100、% ±1.0〜3.0、円 ±10)。期待は「そのセルを読む式」から決めた。

| ID | 変えるセル (加算) | 破れる規則 (`hard` の `rule` の集合) |
| --- | --- | --- |
| V1 | tanshin.balanceSheet.current.totalAssets +100 | bs-total-assets, bs-balance, sum-total-assets, ratio-equity-ratio |
| V2 | tanshin.balanceSheet.current.cash +100 | bs-current-assets, link-cf-cash-end, xdoc-supp-cash |
| V3 | tanshin.balanceSheet.current.totalCurrentAssets +100 | bs-current-assets, bs-total-assets |
| V4 | tanshin.balanceSheet.current.retainedEarnings +100 | bs-shareholders-equity, link-retained-earnings |
| V5 | tanshin.balanceSheet.current.totalNetAssets +100 | bs-net-assets, bs-liabilities-and-net-assets, sum-net-assets, sum-equity, ratio-equity-ratio, ratio-roe, ratio-bps |
| V6 | tanshin.incomeStatement.current.ordinaryIncome +100 | pl-ordinary-income, pl-income-before-tax, sum-ordinary-income, xdoc-hl-ordinary-income, ir-hl-change-ordinary-income |
| V7 | tanshin.summary.ordinaryIncome.changeRate +2.0 | sum-change-ordinary-income |
| V8 | tanshin.summary.netSales.current +100 | sum-net-sales, sum-change-net-sales |
| V9 | tanshin.cashFlow.cashEnding +100 | cf-ending, link-cf-cash-end |
| V10 | tanshin.cashFlow.operatingCashFlow +100 | cf-operating, cf-net-change |
| V11 | tanshin.cashFlow.depreciation +100 | cf-subtotal, link-tangible-assets, xdoc-outlook-actual-capex-depreciation, xdoc-supp-capex-depreciation |
| V12 | tanshin.cashFlow.capex −100 | cf-investing, link-tangible-assets, xdoc-outlook-actual-capex-depreciation, xdoc-supp-capex-depreciation |
| V13 | tanshin.incomeStatement.current.incomeTaxes +100 | pl-net-income, link-cf-income-taxes |
| V14 | tanshin.notes.segments.current.segments.0.netSales +100 | seg-sales-sum, xdoc-seg-sales, ir-seg-change-sales, ir-seg-share (IR の比率は短信から計算するので、短信側を変えると破れる) |
| V15 | tanshin.notes.segments.current.adjustment +10 | seg-profit-sum, xdoc-seg-adjustment |
| V16 | ir.highlights.netSales.amount +100 | xdoc-hl-net-sales (IR の比率は短信から計算するので、IR の金額だけを変えても ir-hl-change-net-sales は破れない) |
| V17 | ir.segments.items.0.netSales.current +100 | xdoc-seg-sales |
| V18 | ir.supplement.capex.current +100 | xdoc-supp-capex-depreciation |
| V19 | ir.supplement.netDebt.current +100 | ir-supp-net-debt |
| V20 | ir.results.operatingMargin.current +1.0 | ir-results-operating-margin |
| V21 | ir.header.companyName を `第七試作電機株式会杜` に | header-company-name (paths は ir.header.companyName のみ) |
| V22 | tanshin.header.unit を `千円` に | header-unit |
| V23 | ir.header.periodLabel を `2026年3月期` に | header-period-label |
| V24 | tanshin.notes.segments.current.segments.1.name を別の名前に | segment-names |
| V25 | tanshin.summary.payoutRatio +3.0 | ratio-payout, xdoc-hl-payout |
| V26 | tanshin.notes.averageSharesThousand +400 | ratio-eps, ratio-bps, ratio-dividend-total, link-cf-dividends-paid, check-eps-product, check-bps-product |
| V27 | tanshin.summary.eps +10 | ratio-eps, notes-per-share, ratio-payout, check-eps-product |
| V28 | ir.outlook.forecast.netSalesChangeRate +1.0 | ir-outlook-change-net-sales |
| V29 | ir.highlights.annualDividend +2 | xdoc-hl-dividend |
| V30 | tanshin.cashFlow.interestDividendIncome +10 | cf-subtotal, link-cf-interest-income |
| V31 | tanshin.balanceSheet.previous.totalAssets +100 | bs-total-assets, bs-balance |
| V32 | tanshin.balanceSheet.previous.receivables +100 | bs-current-assets, link-cf-receivables |
| V33 | tanshin.cashFlow.longTermBorrowings +100 | cf-financing, link-cf-long-debt |
| V34 | tanshin.cashFlow.longTermRepayments −100 | cf-financing, link-cf-long-debt |
| V35 | tanshin.summary.interimDividend +5 | link-cf-dividends-paid |
| V36 | tanshin.summary.dividendTotal +10 | ratio-dividend-total |
| V37 | tanshin.summary.equity +100 | sum-equity, check-bps-product |
| V38 | tanshin.summary.operatingMargin +2.0 | ratio-operating-margin |
| V39 | tanshin.summary.roe +1.0 | ratio-roe |
| V40 | tanshin.summary.auditNote を `監査済みです` に | audit-note |
| V41 | tanshin.summary.accountingPolicyChange を `true` に | accounting-policy-match |
| V42 | tanshin.dates.disclosure を `2027-03-01` に | dates-order |
| V43 | tanshin.columnDates.incomeStatement.current を `2028-03-31` に | dates-column-headings |
| V44 | ir.results.chart.operatingIncome.current を 900 に | chart-bars |
| V45 | ir.results.chart.netSales.axisMin を 11000 に | chart-axis-zero |
| V46 | ir.statements.0.claims.0.direction を `down` に (netSales が増収なのに減少と主張) | claims-direction |
| V47 | ir.outlook.subsequentEvent を `期末後に子会社の売却を決定した。` に | subsequent-event-match |
| V48 | tanshin.header.securitiesCode を `0810` に | header-securities-code (paths は tanshin.header.securitiesCode のみ) |
| V49 | unitOverrides = `{ 'tanshin.balanceSheet': '千円' }` を足す | unit-consistency (paths は tanshin.balanceSheet.unit) |
| V50 | signOverrides = `{ 'tanshin.cashFlow.capex': '-' }` を足す | sign-consistency (paths は tanshin.cashFlow.capex) |
| V51 | labelOverrides = `{ 'tanshin.incomeStatement.operatingIncome': '営業利金' }` を足す | label-spelling (paths は tanshin.incomeStatement.operatingIncome) |
| V52 | labelOverrides = `{ 'tanshin.balanceSheet.receivables': '買掛金' }` を足す | account-section だけ (買掛金は別の部の標準の名前なので、誤字ではない) |
| V53 | **基準問題 B** の ir.segments.items から 3 つ目を除く (3 → 2。H-19 の本番の形) | seg-count, segment-names, ir-seg-reconcile (無い要素を読む式は評価しない) |
| V55 | `ir.statements.0.claims` に `{ metric: 'dividend', direction: 'up' }` を足す (年間配当は前期と同じ 30) / `direction: 'down'` を足す | どちらも claims-direction (差が 0 なら増減は主張できない) |
| V54 | tanshin.notes.segments.current.segments を 3 つ目の `{ name: 'x', netSales: 0, profit: 0 }` つきにする | seg-count, segment-names (0 の足しは合計に影響しない) |

加えて、`paths` の確認: V1 の `bs-total-assets` の `paths` に `tanshin.balanceSheet.current.totalAssets` が含まれ、`balanceSheet.previous` のセルは含まれない。V31 の `paths` は `previous` のセルだけ。

### 2.4 どの数字を変えても、どれかの規則が破れる (C。守られていない数字が無い)

| ID | 入力 | 期待 |
| --- | --- | --- |
| C1 | `numericCells(基準問題)` の**各セル**を 1 つずつ変える (整数は +1、% の項目は +0.1、1 株当たりは +0.01。**ただし増減率だけが守るセル (ir.outlook.forecast.netSales・operatingIncome) は、表示の丸めを越える量 = 値の 1% を足す**: +1 は増減率の小数第一位に吸い込まれて破れない) | どのセルでも、`hard` が 1 件以上あり、そのどれかの `paths` が**変えたセル**を含む。ただし**守られていないと明示した次のセルだけは除く**: ir.outlook.forecast.capex・depreciation・annualDividend (次期の予想で、他の式が無い) |
| C2 | 除外したセルの一覧 | 上の 3 つだけ (実装で増やさない。増やすときはケース表に理由を足す) |
| C3 | 文字列のセルのうち、見出し (社名・証券コード・期・単位) と、決まった文のセル (summary.auditNote・notes.accountingPolicyNote・notes.subsequentEvents・日付の文字列) を `x` に変える | 見出しは header-company-name・header-securities-code・header-period-label・header-unit が破れる (短信・IR 両方)。auditNote は audit-note、accountingPolicyNote は accounting-policy-match、subsequentEvents は subsequent-event-match、日付は dates-* のどれかが破れる。式が無く破れないと**明示するのは** goingConcern・cashScope・`ir.statements[].text` の文面 (主張の構造 `claims` が守る) |

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
| S14 | cashFlow.operatingCashFlow を −300 に、営業 CF の主張 (ir.statements.2) を down に | soft-ocf-vs-operating-income が**出ない** (S15: 主張が up のままなら出る・S16: 主張が down でも営業利益が 0 なら出る) |
| S9 | balanceSheet.current.cash を 100 に | soft-cash-vs-sales |
| S10 | summary.payoutRatio を 120.0 に | soft-payout-max |
| S11 | summary.netSales.previous を 0 に | soft-rates-expressible |
| S12 | summary.payoutRatio を 31.0 に | soft-payout-cross-path |
| S13 | 基準問題のまま | `soft` が空 (S1〜S12 のどれも出ない) |

### 2.6 異変の指定どおりにだけ破れているか (A。`checkAnomaly`)

意味 (anomalies.md G1 と design §4.1 の「期待集合」): 異変の問題は、(a) `anomaly.expectedRules` が**実際に落ちた hard の規則の集合と等しい**、(b) その集合が種類の `primaryRules` を**1 つ以上含み**、(c) 種類の `allowedRules` に**収まる**、(d) `expectedRules` 自体も `allowedRules` に収まり `primaryRules` を含む、(e) どの違反の `paths` も `places` のどれかに触れ、どの `places` も違反の `paths` のどれかに触れる、(f) `places` が実在する場所を指す、(g) `explanation` が空でない。種類の `primaryRules` が空の種類は存在しない (D 参照)。

異変の種類の例 (テスト内の表): `k-rate` = calculation・primary/allowed [sum-change-ordinary-income]、`k-balance` = accounting・primary [bs-balance]・allowed [bs-total-assets, bs-balance, sum-total-assets, ratio-equity-ratio]、`k-balance-narrow` = 同じで allowed から ratio-equity-ratio を除く、`k-company` = appearance・primary/allowed [header-company-name]、`k-typo` = appearance・primary/allowed [label-spelling]、`k-unit` = appearance・primary/allowed [unit-consistency]。問題は基準問題から V1・V7・V21・V49・V51 の変更を施したもの。

| ID | 入力 | 期待 |
| --- | --- | --- |
| A1 | V7 の問題、`k-rate`、`expectedRules = [sum-change-ordinary-income]`、places = `tanshin.summary.ordinaryIncome.changeRate` | メッセージ 0 件 |
| A2 | A1 で `expectedRules = [sum-change-net-sales]` | 「期待集合が実際に落ちた規則と違う」 (実際・期待の両方を含む) |
| A3 | V7 の問題に `k-balance`、`expectedRules` は実際どおり | 「主な規則のどれも落ちていない」 |
| A4 | V1 の問題に `k-balance-narrow`、`expectedRules` は実際どおり (4 つ) | 「許容集合の外の規則が落ちている」 (ratio-equity-ratio) |
| A5 | V1 の問題に `k-balance`、`expectedRules` が実際 + `link-cf-start` (種類の許容集合の外) | 「期待集合が許容集合を越えている」と「期待集合が実際と違う」 |
| A6 | V1 の問題に `k-balance`、`expectedRules` は実際どおり、places = `tanshin.balanceSheet.current.totalAssets` | 0 件 |
| A7 | A6 で places を `tanshin.balanceSheet.current.cash` (食い違いに関わらないセル) に | 「どの違反にも触れない場所」と「場所に触れない違反」 |
| A8 | A6 で places を 2 つ (totalAssets と cash) | 「違反に触れない場所」 (cash) だけ |
| A9 | A1 で places の path を存在しない `summary.nothing` に | 「場所が実在しない」 |
| A10 | V21 の問題、`k-company`、`expectedRules = [header-company-name]`、places = `ir.header.companyName` | 0 件 |
| A11 | 基準問題のまま (式が破れていない) に `k-rate` の異変を付ける (`expectedRules = [sum-change-ordinary-income]`) | 「期待集合が実際に落ちた規則 (なし) と違う」 |
| A12 | V51 の問題、`k-typo`、`expectedRules = [label-spelling]`、places = `{ doc: 'tanshin', itemKey: 'tanshin.incomeStatement.operatingIncome' }` | 0 件 (項目名の場所が、`label-spelling` の違反の paths に触れる) |
| A13 | A12 で itemKey を `tanshin.nothing.nothing` に | 「項目キーが labels に無い」と「場所に触れない違反」 |
| A14 | V49 の問題、`k-unit`、places = `{ doc: 'tanshin', path: 'balanceSheet.unit' }` | 0 件 (画面の単位の場所が実在する) |
| A15 | `explanation` が空文字 | 「答え合わせの文言が空」 |
| A16 | 正常な問題 (`anomaly: null`) に `labelOverrides`・`unitOverrides`・`signOverrides` のどれか | 「正常な問題に見た目の差し替え」 (3 通りそれぞれ) |
| A17 | `anomaly.kind` が一覧に無い | 「異変の種類が一覧に無い」 |
| A18 | `k-rate` の問題で、難易度が `hard` (calculation はやさしいの系統) | 「系統と難易度が合わない」 |

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
| SH13 | `tanshin.notes.segments.current.segments` が 3 要素 | 空 (許す。2 か 3)。4 要素・1 要素は誤り |
| SH14 | `unitOverrides`・`signOverrides` の値が数値 | 誤り (文字列だけ) |
| SH15 | `anomaly.places[0]` が `path` と `itemKey` の両方を持つ・どちらも持たない | どちらも誤り (ちょうど 1 つ) |
| SH16 | `anomaly.expectedRules` が無い・文字列の配列でない | 誤り |
| SH17 | `ir.statements[0].claims[0].direction` が `flat`・`metric` が未知 | どちらも誤り |
| SH18 | `ir.statements[0].slide` が `nothing` | 誤り |
| SH19 | `tanshin.cashFlow.longTermBorrowings` を消す (旧名 `longTermDebtChange` を足す) | 誤り 2 件 (欠落と未知のキー) |

### 2.8 データ全件 (D。`verifyDataset`)

入力は、基準問題を `easy-001` (`problems/easy/easy-001.json`) として置き、会社 `fixture-c01`、異変の種類の例の表を使う。`errors` は致命 (CI を落とす)、`shortfalls` は「数が足りない」(完成の段階で効く)。

| ID | 入力 | 期待 |
| --- | --- | --- |
| D1 | 基準問題 1 件・会社 1 社 | `errors` 空。`stats` に難易度ごとの問題数 (easy 1・hard 0)・異変あり・なし |
| D2 | `id` とファイル名が違う (`easy-002.json` の中身が `easy-001`) | code `id-mismatch` |
| D3 | `difficulty: hard` の問題が `problems/easy/` にある | code `difficulty-mismatch` |
| D4 | `companyId` が会社の一覧に無い | code `unknown-company` |
| D5 | 同じ `id` が 2 ファイル | code `duplicate-id` |
| D6 | 異変の問題の `kind` が一覧に無い | code `unknown-kind` |
| D7 | 正常な問題が 1 件でも `hard` を破る (V1 の変更) | code `hard-violation` (規則 ID と場所を含む)。`problem` に ID |
| D8 | 異変の問題が種類の指定と違う (A2 相当) | code `anomaly-mismatch` (メッセージに A の食い違い) |
| D9 | 型の形が誤り (SH2) | code `shape` だけを出し、その問題の規則の検証は行わない (落ちない) |
| D10 | `AnomalyKind.primaryRules`・`allowedRules` に存在しない規則 ID (`bs-nothing`) | code `unknown-rule` (種類の ID を含む) |
| D11 | 会社の `id` が重複 / 異変の種類の `id` が重複 | code `duplicate-company`・`duplicate-kind` |
| D12 | `soft` の違反だけ: 基準問題で株数を 8,630 千株にし、EPS 99.65・BPS 951.1・配当性向 30.1 (summary・notes・IR) を表示値の再計算に合わせた問題。hard はすべて通るが、配当性向 (1 株配当 ÷ EPS = 30.1%) と配当金総額 ÷ 純利益 (258 ÷ 860 = 30.0%) の別経路だけがずれる | `errors` 空。`soft` に `soft-payout-cross-path` だけが出る (`--fail-on-soft` で致命) |
| D13 | 難易度ごとの問題数が 25 未満 | `shortfalls` に code `pool-size` (easy・hard それぞれ)。`errors` ではない |
| D14 | 異変あり・なしの両方を持つ会社が難易度ごとに 8 社未満 | `shortfalls` に code `both-sided-companies` |
| D15 | **満たすデータ**: 難易度ごとに、会社 8 社 × (正常 1 + 異変 1) = 16 件 + 9 件 (異変 4・正常 5) = 25 件 (異変 12・正常 13)。異変は V7 の変更を施した `k-rate`、系統の割合は D17 の閾値を満たすように、`k-rate` (calculation) をやさしいに、`k-balance` (accounting) をむずかしいにする | `shortfalls` 空、`errors` 空 |
| D16 | 問題 0 件・会社 0 社・種類 0 件 | `errors` 空、`shortfalls` に pool-size (easy・hard) と both-sided-companies |
| D17 | D15 のやさしいで、異変 12 件のうち 4 件を appearance・calculation 以外の系統の種類 (text) にする (appearance + calculation が 8/12 = 67% < 80%) / むずかしいで accounting + cross-document を 6 割未満にする | `shortfalls` に code `family-balance` (難易度を含む) |
| D18 | D15 で異変の数を 5 (比 0.5 × 25 = 12.5 の ±3 の外) にする | `shortfalls` に code `anomaly-ratio` |
| D19 | 種類の `primaryRules` が空 | code `kind-no-primary` |
| D20 | 種類の `primaryRules` が `allowedRules` に含まれない | code `kind-primary-not-allowed` |
| D21 | 種類の `family` が未知 / 異変の問題の難易度が `FAMILY_DIFFICULTY[kind.family]` と違う | code `kind-shape`・`family-difficulty-mismatch` |
| D22 | 会社の形が誤り (`irUnit: '千円'`・`segmentNames` が 4 つ・`colors` が無い・`securitiesCode` が無い) | code `company-shape` (どれも) |
| D23 | 問題の `fiscalYear`・会社の `fiscalYearEndMonth` から作る期の表記と見出しが違う | `hard-violation` (header-period-label) |
| D24 | 会社のセグメントが 3 つで、問題の短信・IR が 2 つ | `hard-violation` (seg-count) |
| D25 | 正常な問題に `labelOverrides` がある (値は標準と同じでも) | code `override-on-normal` |

### 2.9 CLI (L。`npm run verify:data`)

テストは一時ディレクトリに `companies.json`・`anomaly-kinds.json`・`problems/<難易度>/*.json` を作り、`node --experimental-strip-types scripts/verify-data.ts --dir <一時ディレクトリ>` を実行する (npm のスクリプトと同じコマンド)。

| ID | 入力 | 期待 |
| --- | --- | --- |
| L1 | 基準問題 1 件のディレクトリ | 終了コード 0。出力に検証した問題の数と、`shortfalls` (数が足りない) が警告として出る |
| L2 | 規則を破る問題 (V1) | 終了コード 1。出力に問題のファイルのパス・規則 ID・場所 |
| L3 | 数が足りない (D13) だけ | 既定は終了コード 0。`--require-complete` を付けると 1 |
| L4 | 参考の規則だけ (D12 の問題) | 既定は終了コード 0 (出力に soft-payout-cross-path)。`--fail-on-soft` を付けると 1 |
| L5 | JSON として壊れたファイル | 終了コード 1。出力にファイルのパス (他のファイルの検証は続ける) |
| L6 | `--dir` を明示して、そのディレクトリが無い | 終了コード 1。「読めません」 |
| L7 | `--dir` を付けない (既定の `src/data`)。問題が揃った今のデータ (やさしい・むずかしい 25 問以上。Task #25・#26 の後) | 終了コード 0。`--require-complete` を付けても 0 で、「数が足りない」の警告 (`pool-size`) も出ない。**CI は `--require-complete` で通る** (#26 の追加の受け入れ条件) |
| L7b | 会社・種類・問題が何も無い空のディレクトリを `--dir` で渡す | 終了コード 0 (0 件として扱う)。「数が足りない」の警告が出る。`--require-complete` を付けると 1 (問題データが無い間の挙動。#26 で L7 を問題が揃った状態に直し、無い場合はここで確かめる) |
| L8 | `--dir` はあるが `anomaly-kinds.json` だけ無く、異変の問題がある | 終了コード 1 (`unknown-kind`)。無いファイルは 0 件として扱うだけ |
| L9 | CLI の実行に使う TypeScript に、型を消すだけでは動かない書き方 (enum・引数のプロパティ) を持ち込まない | `tsconfig.json` の `erasableSyntaxOnly: true` で型検査が捕まえる。`verbatimModuleSyntax: true` で型だけの import が `import type` になる (相対 import は `.ts` の拡張子つき) |

### 2.10 規則の計算元 (X。実装後の変異で見つかった抜けを足したケース。1 つの規則だけを評価する)

| ID | 入力 | 期待 |
| --- | --- | --- |
| X1 | 基準問題 B で短信の売上高 12,449・売上総利益 3,725 (百万円)、IR の売上高 124.5・売上総利益 37.3 (億円)、`ir.results.grossMargin.current` = 29.9 | `ir-results-gross-margin` は破れない (短信から 3,725 ÷ 12,449 = 29.9%)。30.0 にすると破れる (IR の 37.3 ÷ 124.5 = 30.0% から計算していないこと) |
| X2 | 基準問題 B で短信の売上高 当期 12,449・前期 11,751、IR の amount = 124.5 | `ir-hl-change-net-sales` は changeRate 5.9 で破れず、6.0 で破れる (短信から 5.9%。IR の 124.5 と 117.5 からは 6.0%) |
| X3 | 基準問題 A で前期の売上高を当期と同じ 12,400 にする。claims の netSales が `up` / `down` | どちらも `claims-direction` が破れる (差が 0 のとき増減は主張できない) |

### 2.12 IR の表示金額からの検算 (Y・D26〜D27・X4・L10。#81 の包括レビュー B1・N1・N2)

正常な問題だけに当てる検査 (`verifyIrDisplay`、規則 ID は `ir-display-*`、`verifyDataset` では code `ir-display-mismatch` で致命)。短信の百万円から計算した IR の比率 (§1.5) が、IR の表示金額 (億円は 0.1 億円に丸め) から検算した値にも一致することを確かめる。異変の問題には当てない (答えは あり/なし だけで、異変の問題では誤答にならない)。対象: ハイライトの売上高・営業利益の前期比 (前期は `results` の金額)、`results` の売上総利益率・営業利益率、セグメントの売上高・利益の前期比と売上構成比。経常利益・純利益の前期比は IR に前期の金額が無いので対象外。

| ID | 入力 | 期待 |
| --- | --- | --- |
| Y1 | 基準問題 B (金額が 10 百万円の倍数) と A | 空 |
| Y2 | B で短信の売上高 当期 12,449・前期 11,751、IR の 124.5・117.5、`highlights.netSales.changeRate` = 5.9 (X2 と同じ形) | `ir-hl-change-net-sales` (短信から) は通るが、`ir-display-hl-change-net-sales` が破れる (IR の金額からは 6.0%) |
| Y3 | B でセグメント 0 の利益を 4.1 → 4.7 (億円)、changeRate 13.1 (導いた例: 短信 413 → 467 百万円。IR の金額からは 14.6%) | `ir-display-seg-change-profit` だけ |
| Y4 | B で `grossMargin.current` = 31 / セグメント 0 の `salesShare` = 60.0 | それぞれ `ir-display-results-gross-margin`・`ir-display-seg-share` だけ |
| Y5 | B で `results.operatingIncome.previous` を変える / `operatingMargin.previous` = 9.0 | `ir-display-hl-change-operating-income` を含む / `ir-display-results-operating-margin` だけ |
| Y6 | B で `highlights.ordinaryIncome.changeRate` = 99 | 空 (IR に前期の金額が無く、検算の対象にしない) |
| D26 | 正常な問題で Y2 の形 | `verifyDataset` の errors に `ir-display-mismatch` |
| D27 | 異変の問題に同じ食い違い | `ir-display-mismatch` は出ない |
| X4 | 株数 100,526 千株・EPS 8.56 (正しく丸めた値。8.56 × 100,526 ÷ 1,000 = 861 で純利益 860 と合わない) | `check-eps-product`・`check-bps-product` は当たらない (株数が 100,000 千株以上の会社には当てない。1 億株未満では当てる: V26・V27) |
| L11 | `--require-complete=hrad`・`=medium`・`=` (値が easy・hard 以外) | 使いかたを出して終了コード 2 (打ち間違いで致命が効かなくなるのを防ぐ) |
| L10 | `--require-complete=easy` / `=hard` / 指定なし | easy だけ揃ったデータで、`=easy` は 0、`=hard` と指定なしは 1 (難易度ごとに致命にできる) |

N2 の運用: 問題データが揃ったら、CI の `npm run verify:data` を `--require-complete` にする (難易度ごとに `=easy`・`=hard` を先に足してもよい)。この作業は、最後に閉じる問題作りのチケット (#25 / #26) の受け入れ条件に書く。受け入れ条件 5・6 を受け持つのは `npm run verify:data` (design §7)。

### 2.13 見本 (samples/*.json) の検証 (D28〜D34・L12〜L13。#86、#23 の 2 回目の包括レビュー N1)

見本は `src/data/samples/*.json` の `{ problem, notes }` (design §4.5・P0)。出題のプールには入れないが、遊び手に「これが正常です」と見せるので、**正常な問題として**検証する。数えるのは `verifyDataset` の `samples` (入力の任意項目) と `stats` ではなく `result.samples`。

| ID | 入力 | 期待 |
| --- | --- | --- |
| D28 | 正常な見本 (プールと別の会社) | errors 空。プールの数 (stats) には入らない |
| D29 | 見本が hard を破る (V1) | `hard-violation` (メッセージに見本のファイルと規則 ID) |
| D30 | 見本の IR の比率が IR の表示金額からの検算と食い違う (Y2 の形) | `ir-display-mismatch` |
| D31 | 見本が異変の問題 | `sample-anomaly` |
| D32 | 見本がプールの問題と同じ会社 × 期 | `sample-overlaps-pool` (見本が出題に混ざって「見本だから正常」と当たるのを防ぐ) |
| D33 | `problem` が無い / `notes` が文字列の record でない / 問題の形の誤り | `sample-shape` |
| D34 | 見本の会社が一覧に無い / 見本の id がプールの id と同じ | `unknown-company` / `duplicate-id` |
| D35 | 見本に `labelOverrides` (同じ部の別の科目名)・`unitOverrides` (header と同じ値)・`signOverrides` (△) | `override-on-normal` (正常な問題と同じ。#86 レビュー 1 回目 B1) |
| D36 | 見本の `notes` のキーが画面の ID でない (打ち間違い) / 画面の ID | 前者は `sample-shape`、後者は通る (#86 N1。全画面の注釈は求めない) |
| L12 | `samples/sample.json` が正常 / hard を破る | 前者は終了コード 0 で出力に「見本 1 件」、後者は 1 で見本のファイルのパスと規則 ID |
| L13 | `samples/` が無い | 0 件として扱う (出力に「見本 0 件」) |

## 3. 受け入れ条件との対応

| 受け入れ条件 (Task #23) | ケース |
| --- | --- |
| 試作の規則を、設計の言語とデータの形で作り直す | §1 (規則の一覧)・N1・V1〜V32・C1〜C3・S1〜S13 |
| 異変の問題は指定した所だけが破れている | A1〜A18・D8・D17〜D21 |
| 単体テストがある | 全ケース (Vitest) |
| 全問を検証するコマンドが CI で回る | L1〜L9・D1〜D25。CI のケースは #49 で `ci.yml` に足す (`ci.test.ts` の C3 を `npm run verify:data` の位置つきに直す) |

## 4. 範囲外

- 会社の設定・異変の種類の一覧そのもの (Task #24)・問題の制作 (#25・#26)。いまは基準問題だけで検証する
- `labels.ts` の**画面側の使いかた** (表示名を画面に出す・`data-item-key` を付ける・全項目キーが画面に出る確認) は画面の Task #27。ここ (#23) は、検証器が使う `itemKey`・`LABELS`・`SECTION_OF_ITEM` を作る
- 実在の企業名との衝突の確認 (Task #24)
- 会計の分かる人による soft の範囲の確認

### 2.11 場所の検査の穴 (A19〜A24。#48 のレビュー 1 回目の B1・B2。赤から足したケース)

| ID | 入力 | 期待 |
| --- | --- | --- |
| A19 | V1 の問題 (`k-balance`)、places = `tanshin.balanceSheet` (画面全体) | 「場所が値でなくまとまりを指している」と「場所に触れない違反」 |
| A20 | 同じで places = `tanshin.balanceSheet.current` | 「場所が値でなくまとまりを指している」 |
| A21 | 前期の売上高 (summary.netSales.previous) を +100、places = `summary.netSales.current` / 前期なら通る | 当期を指すと「場所に触れない違反」 (前期だけを読む違反に触れない)。前期を指せば 0 件 |
| A22 | signOverrides のキーが正の数のセル (`tanshin.balanceSheet.current.cash`) | 「負の記号の差し替えが負の数のセルを指していない」 |
| A23 | signOverrides のキーが画面全体 (`tanshin.cashFlow`) | 同上 |
| A24 | signOverrides が負の数のセル (`tanshin.cashFlow.capex`) は通る / unitOverrides のキーが画面でない (`tanshin.cashFlow.capex`) | 前者は 0 件、後者は「単位の差し替えが画面を指していない」 |
| A25 | 基準問題 B の IR の items から 3 つ目を除いた問題 (H-19 の形。3 → 2)、種類 `k-h19` (cross-document・primary [seg-count]・allowed [seg-count, segment-names, ir-seg-reconcile])、places = `ir.segments.items` (入れ物) | 0 件 (seg-count・segment-names・ir-seg-reconcile の違反が入れ物の path `ir.segments.items` を paths に持つので、場所が違反に触れる) |


「触れる」の意味を狭めた: 場所が違反の path と同じか、**その子** (違反の path が `ir.statements.0` のような入れ物のとき) だけ。場所が親 (まとまり全体) の向きは許さない。あわせて、独立の等式を 1 回の評価にまとめていた規則 (sum-*・notes-per-share・link-cf-interest-*・link-capital-unchanged・xdoc-outlook-actual-*・xdoc-supp-capex-depreciation・dates-*) は、等式ごとに評価を分けた (違反の paths が、食い違った式のセルだけになる)。その結果 N2・N5 の `dates-period-end` は 1 件から 2 件 (期末日・前期末日) になった。**理由を残す**: これはレビューの指摘 (場所の検査が緩い) への対応で、実装に合わせてテストを緩めたのではなく、期待を厳しい側 (件数が増える) に直した。D12・L4 は、元の D12 (S3 相当) が S3 で equityRatio を変えると hard の ratio-equity-ratio・xdoc-supp-equity-ratio も破れて「errors 空」と両立しなかったため、soft だけが破れる問題 (株数 8,630 千株) に書き直した。

## 5. 確かめた記録 (Sub-task #48)

- レッド: 実装の前に、テスト (N・V・C・S・A・SH・D・L ほか) は実装の無い状態で全件失敗 (`math.ts`・`index.ts` などが無い)。基準問題 B は実装より先に commit した (N6 が赤)。
- グリーン: `npm run typecheck` が通り、`npx vitest run` で 13 ファイル 429 件 (X1〜X3 を足して 432 件、レビュー 1 回目の A19〜A24 ほかで 439 件) が緑。規則 ID は hard 116・soft 12 (`HARD_RULE_IDS.length`)。`npm run verify:data` は 0 件のデータで終了コード 0。
- 変異 (規則を壊して赤になることの確認): `pl-gross-profit` の式を壊す → 81 件赤。配当を四捨五入に → R8・D12・L4。増減率の分母 0 以下の扱いをやめる → S11。億円の比較を素の引き算に → N6・N7・N8・V53。**緑のまま残った変異が 2 つ**あり (IR の利益率を IR の値から計算する・claims の差 0 を up と扱う)、X1〜X3 を足して赤になることを確かめた。
- `erasableSyntaxOnly` は、規則の道具 (`Reader`) に引数のプロパティ (`constructor(readonly ctx)`) を書いた時点で型検査が止めた (L9)。
