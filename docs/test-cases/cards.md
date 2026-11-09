# ケース表 v3: カードの導出と検証器 (Task #138・Sub-task #179)

根拠: [design-v3.md](../design-v3.md) (main。#178) の §1 (形)・§2 (台帳)・§3.2 の **#138 の 1〜8** と「チケットの受け入れ条件の読み替え」・[requirements.md](../requirements.md) (第 3 版)・[charter.md](../charter.md)。このあと #180 で、この表のとおりにテストをレッドで書き、グリーンにする。v2 のケース表 (PR #157、形 3 種類) は git の履歴 (419dc94) に残る。**この表がそれを置き換える**。

印: **仕様** (design-v3.md にある。節を書く) / **決めた** (設計の細部をこの表で埋めた。監視役のレビューで変えてよい) / **測った** (コマンドの結果。再現を添える)。

**v2 から外れるもの**: 形 3 種類 (`ShapeId`・`shapesOf`・`difficultyOfShape`・E1〜E3・H1〜H3)、`swap`、棒 (`bars`)・別名 (`aliases`)、形ごとの検査 (`visibleShapes`・`card-shape-*`)、`irUnit` の分岐、H1〜H3 の関係 (R2〜R6。値の取り違えは `deriveCards` の値の表 DH と、既存の規則 (`bs-balance`・`link-cf-*`・`xdoc-*` ほか) が受け持つ。**決めた**: 設計 §1.2 の許可表は `card-relation` に 5 検査だけを置き、むずかしいの種類 (H-01 など) が値を変えても落ちない前提。H1〜H3 の関係を残すと、H-01 の異変が `card-relation` でも落ちて二重の食い違いになる)。

## 0. 公開する入口 (テストが外から呼ぶもの)

内部の関数名には依らず、入力と出力だけでテストする。

| 入口 | 入力 → 出力 |
| --- | --- |
| `deriveCards(problem, company, difficulty, options?)` (`src/domain/cards.ts`) | 問題・会社・難易度 → **`Card` 1 つ** (**仕様** §1.4 R-D1。やさしいもむずかしいも 1 枚。むずかしいは、カードと資料を 1 つの欄の並びに持つ。§1.6)。**純関数**。`difficulty` が `problem.difficulty` と違えば `RangeError` (見本の問題は両方の難易度で使うので、呼ぶ側が `{ ...p, difficulty }` を渡す)。`options.applyEdits` は既定 `true`。`false` なら `cardEdits` を無視した形のとおりのカード (**テンプレートのカード**)。見える条件 (§5) と答え合わせの場所 (`placeSlots`) は、`cardEdits` を持つ問題ではこのテンプレートのカードで判定する |
| `Card` | `{ difficulty; frame: { companyName; securitiesCode; emblem; periodLabel; reads }; headline?: { word; repeat; reads }; footer: { periodEnd; reads }; irFrame?: { companyName; periodLabel; reads }; slots: CardSlot[] }`。`frame` = 表題 (社章・社名・期)、`footer` = 足元 (期末日の表示 `2024年3月31日`)、`irFrame` = 資料 2 の表題 (むずかしいだけ。枠の外)。`headline.repeat` は通常 1 (`dup` で 2)。`slots` は表示順 (§1) |
| `CardSlot` | `{ key; kind: 'number'｜'text'; section: 'card'｜'pl'｜'bs'｜'cf'｜'notes'｜'ir'; heading?: '資産'｜'負債及び純資産'; measure: 'money'｜'percent'｜'text'; column?: 'previous'｜'current'; itemKey: string｜null; label; text; unit; raw; reads }`。`text` = 画面に出す文字列 (数字は桁区切り・符号つき)。`unit` = 単位の語。`heading` は `bs` の欄だけ (§1.3 の貸借の見出し)。**決めた**: `section`・`heading` は画面 (#141) の区切りと H-28 の見出しのための印 |
| `countNumbers(card)`・`countTexts(card)` | 枠の外を除いた数字の欄の数・文欄の数 (見出し語・表題・足元・`irFrame` は数えない) |
| `cardCells(card)` | 見えるセルの集合 = 全欄の `reads`・`itemKey`・`frame.reads`・`headline.reads`・`footer.reads`・`irFrame.reads` + 場所のセル `card.0.<欄の key>` (全欄・`headline`・`frame`・`frame.period`・`period`・`irHead`。後者 3 つは §1.1 の表のとおり有るとき) |
| `placeSlots(card, place)` | 異変の場所 (`AnomalyPlace`) → その場所を見せる欄の key の配列 (R-D3。`cardEdits` の問題にはテンプレートのカードを渡す)。パスの場所は `reads` が場所と同じか場所の親 (入れ物)・子、`itemKey` の場所は欄の `itemKey` が同じ、`{doc:'card', card:0, slot}` はその key (欄・見出し語・枠・期末日・資料 2 の表題が有るとき) |
| `cardRelationIssues(card)` (`src/verifier/cards.ts`) | `Card` → `{ check: 'R-dir'｜'R-margin'｜'R-range'｜'R-ne'｜'R-lt'; message }[]` (落ちた検査。空 = 整合)。**決めた**: 設計 §3.2 #138-3「落ちた検査の名前を返す」を、この戻り値にした。引数は `Card` だけ (v2 の `ctx`・`irUnit`・`statements` は要らない。見出し語の向きは `Card.headline` と数字から照らす) |
| `relationAllowed(problem, kind)` | 異変の問題・種類 → その種類で落ちてよい `card-relation` の検査の名前 (§6)。種類ごとの固定の集合は `anomaly-kinds.json` の `relationChecks` (任意。無ければ空) に持ち、`drop` の編集は「落とした欄を読む検査」を足す。**決めた**: 設計の表 (§1.2) をデータの 1 か所 (種類の定義) に置き、コードに種類の ID を埋めない |
| `cardStructureIssues(card)` | `Card` → 欄の並びが形の定義と違う・数字や文の数が上限を超える・見出し語が出ていない、の文の配列。`cardLimitIssues(card, allowance?)`: 上限だけ (§3) |
| `cardTextLengthIssues(card)` | 文欄の `text` が 40 字を超える欄の文 |
| `cardEditIssues(problem, company)` | `cardEdits` が、§2.2 の op ごとに当ててよい欄に当たっているかの文 (K11 の v3) |
| `displayChanges(problem, base, company)` | 検査 5: `places` の欄の表示が基の同じ欄と違うか |
| `cardVisibility(problem, company, kinds, result?, base?)` | 異変の問題 → `{ missingPlaces: string[]; v2: boolean; v3: boolean｜null }` (V1 を満たさない場所・V2・検査 5)。`isVisible` = `missingPlaces` が空 かつ `v2` かつ `v3 !== false`。正常な問題は常に見える |
| `doubleDiscrepancies(problem, company, kinds, result?, base?)` | 異変の問題 → 種類の `primaryRules` の外で「カードに収まる」hard の違反の規則の一覧 (空 = カードの上の食い違いは 1 つだけ) |
| `deviationIssues(problem, company)` | §9。種類ごとの最小のずれ |
| `verifyDataset` の追加 | §7 |
| 規則 (`HARD_RULE_IDS` に足す。どれも問題だけを見る) | `card-slots`・`card-unit`・`card-format`・`card-headline`・`card-period`・`xdoc-seg-names` (v2 から。直す所は §4)、**新規** `card-sign`・`card-column-suffix`・`card-digits`・`card-date-valid` |
| 型 (`types.ts`) | `ShapeId`・`SHAPE_IDS` を消す。`CardEdit` = §2.1。`AnomalyPlace` の card の場所 = `{ doc: 'card'; card: 0; slot: string }` (**決めた**: `shape` を捨てる。場所のセル = `card.0.<slot>`)。`AnomalyKind.relationChecks?: ('R-dir'｜'R-margin'｜'R-range'｜'R-ne'｜'R-lt')[]` と `AnomalyKind.ledger?: 'v3'` (台帳 v3 の種類の印。§6.4) を足す。`Anomaly.base`・`changed` は今のまま |

**基準問題** (`src/verifier/fixtures/`): **B** = `normal-b.problem.json` (億円・セグメント 3)、**A** = `normal.problem.json` (百万円・セグメント 2)。どちらも `difficulty: 'easy'` で入っているので、むずかしいの形は `{ ...B, difficulty: 'hard' }` で使う。**v3 の基準は B** (IR が億円。A は IR が百万円で、R-D7 に反するデータの例として §7 の DS11 だけに使う)。以下の値は **測った** (fixture を読んだ値。再現: `src/verifier/fixtures/*.json`)。

| | B |
| --- | --- |
| 社名・証券コード・社章 | `company-b.json` のとおり (`companyB()`) |
| 期 (`header.periodLabel`)・期末日 (`columnDates.incomeStatement.current`) | 2027年3月期・2027-03-31 |
| 売上高 当期 / 営業利益 前期・当期 / 営業利益率 | 12,400 / 1,120・1,240 / 10.0 |
| 税引前利益 (損益 当期) / CF の最初の行 | 1,250 / 1,250 |
| 現金 当期 / 売掛金 前期・当期 / 資産合計 / 負債純資産合計 | 2,300 / 2,900・3,000 / 15,200 / 15,200 |
| CF の売上債権の増減 / 営業 CF / 期末残高 | △100 / 1,500 / 2,300 |
| IR の売上高 / 現金 当期・前期 / 有利子負債 前期 / 純有利子負債 前期 (億円) | 124.0 / 23.0・21.0 / 48.3 / 27.3 |
| 主張: 営業利益 (`ir.statements.0`) / 営業 CF (`ir.statements.2`) | `up` / `up` |
| セグメント (短信・IR の名前の並び) | 電機部品事業・計測機器事業・産業機器事業 |

## 1. 形の定義 (欄の並び。**仕様** §1.2・§1.3。名前・表示の細部は**決めた**)

### 1.1 やさしい (もうけ)

`slots` は上から: `sales`・`opPrev`・`opCurr`・`margin` (すべて `section: 'card'`)。枠: `frame` (社章・社名・期)・`headline` (見出し語)・`footer` (期末日)。

| key | 種類 | 科目名 (`label`。添え字は欄と一緒に) | `column` | セル (`reads` の先頭。数字のセルが先) |
| --- | --- | --- | --- | --- |
| `sales` | 金額 | 売上高 | — | `tanshin.incomeStatement.current.netSales` |
| `opPrev` | 金額 | 営業利益 (前期) | previous | `tanshin.incomeStatement.previous.operatingIncome` |
| `opCurr` | 金額 | 営業利益 (当期) | current | `tanshin.incomeStatement.current.operatingIncome` |
| `margin` | 比率 | 売上高営業利益率 | — | `tanshin.summary.operatingMargin` |

| 枠 | 値 | `reads` |
| --- | --- | --- |
| `frame` | 社章・社名・証券コードは会社 (`companies.json`)、期は `tanshin.header.periodLabel` | `tanshin.header.companyName`・`tanshin.header.securitiesCode`・`tanshin.header.periodLabel` |
| `headline` | `ir.statements` の営業利益の主張が `up` → `増益`、`down` → `減益`。`repeat` = 1 | `ir.statements.<N>` (主張を持つ最初の文 1 つ) |
| `footer` | `columnDates.incomeStatement.current` の `YYYY-MM-DD` を**文字列の切り出しで** `YYYY年M月D日` にした表示 (§1.5) | `tanshin.columnDates.incomeStatement.current` |
| 場所のセル | `frame` = 社章・社名の場所、`frame.period` = 表題の期 + 足元の期末日 (`reads` = `tanshin.header.periodLabel`・`tanshin.columnDates.incomeStatement.current`。R-D3 の `frame.period`)、`period` = 足元 | `placeSlots` が返す key (§2.3) |

### 1.2 むずかしい (もうけ + 資料)

`slots` はやさしいの 4 欄に続けて、上から (**仕様** §1.3 の表):

| section | key (上から) | 種類 | 科目名 (**決めた**。v2 のものを引き継ぐ) | セル |
| --- | --- | --- | --- | --- |
| `pl` | `pbt` | 金額 | 税金等調整前当期純利益 (損益) | `tanshin.incomeStatement.current.incomeBeforeTax` |
| `bs` (heading 資産) | `cash`・`arPrev`・`arCurr`・`ta` | 金額 | 現金及び預金・売掛金 (前期末)・売掛金 (当期末)・資産合計 | `…balanceSheet.current.cash`・`…previous.receivables`・`…current.receivables`・`…current.totalAssets` |
| `bs` (heading 負債及び純資産) | `tlna` | 金額 | 負債純資産合計 | `…balanceSheet.current.totalLiabilitiesAndNetAssets` |
| `cf` | `cfStart`・`cfAr`・`ocf`・`cfEnd` | 金額 | 税金等調整前当期純利益 (CF)・売上債権 (売掛金) の増減額・営業活動によるキャッシュ・フロー・現金及び現金同等物の期末残高 (資金の範囲 = 現金及び預金) | `…cashFlow.incomeBeforeTax`・`…receivablesChange`・`…operatingCashFlow`・`…cashEnding` (`cfEnd` の `reads` は 2 つ目に `tanshin.notes.cashScope`) |
| `notes` | `audit`・`policyFlag`・`policyNote`・`subseq`・`segs` | 文 | 監査についての注意書き・会計方針の変更の有無 (`あり`/`なし`)・会計方針の変更・重要な後発事象・セグメント | `…summary.auditNote`・`…summary.accountingPolicyChange`・`…notes.accountingPolicyNote`・`…notes.subsequentEvents`・`…notes.segments.current.segments.<i>.name` の全部 (名前を `・` で連ねる) |
| `ir` | `irSales`・`irCashCur`・`irCashPrev`・`irDebtPrev`・`irNetDebtPrev` | 金額 | 売上高・現金及び預金 (当期)・現金及び預金 (前期)・有利子負債 (前期)・純有利子負債 (前期・有利子負債 − 現金) | `ir.highlights.netSales.amount`・`ir.supplement.cash.current`・`…cash.previous`・`…interestBearingDebt.previous`・`…netDebt.previous` |
| `ir` | `irOcf`・`irSubseq`・`irSegs` | 文 | 営業活動によるキャッシュ・フローの説明・期末後の出来事 (無ければ `なし`)・セグメント | `ir.statements.<N>` (営業 CF の主張。型の文)・`ir.outlook.subsequentEvent`・`ir.segments.items.<i>.name` の全部 |

`irFrame` = `ir.header.companyName`・`ir.header.periodLabel` (`reads` も同じ)。`section`・`column` は上の `bs`・`ir` の前期・当期の欄に付く (`arPrev`・`irCashPrev`・`irDebtPrev`・`irNetDebtPrev` = previous、`arCurr`・`irCashCur` = current。`opPrev`・`opCurr` は §1.1)。

### 1.3 テスト: 形 (`DS`・`DH`)

| ID | 入力 → 期待 |
| --- | --- |
| DE1 | B・やさしい: `slots` の key = `sales`・`opPrev`・`opCurr`・`margin`。`countNumbers` = 4・`countTexts` = 0。`headline` あり (`増益`)・`irFrame` なし・`footer` あり。`heading` はどの欄にも無い |
| DE2 | B・やさしい: 値 = §1.1 の表と基準の表。`text` = `12,400`・`1,120`・`1,240`・`10.0`、`unit` = `百万円` ×3・`%`、`label` = 売上高・営業利益 (前期)・営業利益 (当期)・売上高営業利益率、`raw` = 12400・1120・1240・10、`measure` = money ×3・percent、`reads` の先頭 = §1.1 のセル |
| DE3 | B・やさしい: 枠。`frame` = 会社 B の社名・証券コード・社章と `2027年3月期`、`reads` 3 つ。`headline` = `{ word: '増益', repeat: 1, reads: ['ir.statements.0'] }`。`footer.periodEnd` = `2027年3月31日`・`reads` = [`tanshin.columnDates.incomeStatement.current`] |
| DH1 | B・むずかしい: `slots` の key の並び = §1.1 の 4 欄 + `pbt`・`cash`・`arPrev`・`arCurr`・`ta`・`tlna`・`cfStart`・`cfAr`・`ocf`・`cfEnd`・`audit`・`policyFlag`・`policyNote`・`subseq`・`segs`・`irSales`・`irCashCur`・`irCashPrev`・`irDebtPrev`・`irNetDebtPrev`・`irOcf`・`irSubseq`・`irSegs`。`countNumbers` = **19**・`countTexts` = **8**。`irFrame` あり。カードの 4 欄 (`sales`〜`margin`) はやさしいの `deriveCards` の結果と `toEqual` (**カードは難易度によらず同じ**。§1.3 の「いつものカード」) |
| DH2 | B・むずかしい: `section` の並び = `card`×4・`pl`・`bs`×5・`cf`×4・`notes`×5・`ir`×8。`heading`: `cash`・`arPrev`・`arCurr`・`ta` = `資産`、`tlna` = `負債及び純資産`、`bs` 以外は無い |
| DH3 | B・むずかしい: 値 = §1.2 の表と基準の表。`text`: `1,250`・`2,300`・`2,900`・`3,000`・`15,200`・`15,200`・`1,250`・`△100`・`1,500`・`2,300`・`124.0`・`23.0`・`21.0`・`48.3`・`27.3`。`unit`: 短信の金額 `百万円`、IR の金額 `億円`。文: `audit` = 標準の注意書き (`決算短信は公認会計士又は監査法人の監査の対象外です`)・`policyFlag` = `なし`・`policyNote`・`subseq` = `該当事項はありません。`・`segs` = `電機部品事業・計測機器事業・産業機器事業`・`irOcf` = `営業活動によるキャッシュ・フローはプラス`・`irSubseq` = `なし`・`irSegs` = 3 つの名前。`label`: §1.2 の表のとおり (`cfEnd` = `現金及び現金同等物の期末残高 (資金の範囲 = 現金及び預金)`)。`irFrame` = B の IR の社名・期 |
| DH4 | `cfEnd` の `reads` = [`tanshin.cashFlow.cashEnding`, `tanshin.notes.cashScope`] (数字のセルが先。`cardCells` に `cashScope` が入る)。`cashScope` を書き換えるとラベルの範囲が変わる (範囲の語は枠の外で、数字・文の数に入らない)。`labelOverrides` の科目名の差し替えは、範囲の語の前の名前に効く |
| DH5 | `irOcf`: 営業 CF の主張が `up` → `…はプラス`、`down` → `…はマイナス`。**主語は `labels.ts` の標準の名前だけ** (`labelOverrides` は読まない。短信の `ocf` だけに誤字を出す H-30 が、IR の文にも写らないように)。`reads` = [`ir.statements.<N>`] (その 1 つの文だけ)。`ir.statements` の `text` を書き換えてもカードは変わらない。主張が無い・`zero` → その欄は出ない (例外にしない。構造の検査 ST2・ST3 が拾う)。型の文は最長 21 字 (`営業活動によるキャッシュ・フローはマイナス`) で 40 字に収まる |
| DH6 | `irSubseq`: `ir.outlook.subsequentEvent` が文なら `text` がその文・`reads` = `ir.outlook.subsequentEvent`。null → `なし` |
| DH7 | `arCurr`・`arPrev` の科目名は `labelOverrides['tanshin.balanceSheet.receivables']` = `買掛金` で両方 `買掛金 (…)` になる (H-28。見出しは `資産` のまま)。`cfAr` の科目名は変わらない (売掛金の行の差し替えを読まない)。`opPrev`・`opCurr` は `labelOverrides['tanshin.incomeStatement.operatingIncome']` = `営業和益` で両方 `営業和益 (…)` (E-05。**科目名は `itemKey` ごとに差し替える**) |
| DH8 | `column` = 前期・当期の欄だけに付く (§1.1・§1.2 の欄)。ほかは `undefined`。科目名の添え字 (`(前期)`・`(当期)`・`(前期末)`・`(当期末)`・`(前期・…)`) は `column` と対応する |
| DH9 | 見出し語: 営業利益の主張 (`operatingIncome`) だけを読む。売上高の主張 (`netSales`) を `down` にしてもカードは変わらない。営業利益と売上高の主張が同じ 1 つの文にあっても、`headline.reads` はその文 `ir.statements.<N>`。`direction` が `zero`・主張が無い → `headline` は `undefined` (例外にしない) |

### 1.4 書式 (**決めた**。v2 の D21〜D25 を引き継ぎ、IR を変える)

| ID | 入力 → 期待 |
| --- | --- |
| DF1 | 金額は整数に 3 桁区切り (`12400` → `12,400`)。0 は `0`。7 桁まで正しい (`1234567` → `1,234,567`) |
| DF2 | 負の数は `△` + 絶対値 (`-100` → `△100`) |
| DF3 | 比率は小数第一位 (`10` → `10.0`)、`unit` は `%` |
| DF4 | **IR の金額は会社の `irUnit` によらず小数第一位** (R-D7。`124` → `124.0`)。`Company.irUnit` を `百万円` にしても `irSales` の `text` は `124.0` のまま (v2 の `irUnit` の分岐を外す)。`unit` は `ir.header.unit` の値 |
| DF5 | 短信の金額の `unit` は `tanshin.header.unit`。`unitOverrides`・`signOverrides` (第 1 版の見た目の異変の差し替え) は `deriveCards` では読まない (**決めた**: v3 の異変は `cardEdits` の `unit`・`sign` で表す。`unit-consistency`・`sign-consistency` の規則は今のまま残る。§2.1・設計 §1.6) |

### 1.5 期末日の表示 (**仕様** §3.2 #138-8。Date を使わない)

| ID | 入力 → 期待 |
| --- | --- |
| DD1 | `columnDates.incomeStatement.current` = `2024-03-31` → `footer.periodEnd` = `2024年3月31日` |
| DD2 | `2025-02-28` → `2025年2月28日`。`2024-03-05` → `2024年3月5日` (月・日の先頭の 0 を落とす) |
| DD3 | `2024-02-29` → `2024年2月29日` (閏日) |
| DD4 | **`day` の編集** (日 32) → `2024年3月32日`。繰り上がって `4月1日` にならない・`Invalid Date` と書かれない。元のセル (`columnDates`) は書き換わらない。`Date` を使わないことは、`Date` を例外を投げる関数に差し替えても呼べることで確かめる |

## 2. 形のずれ `cardEdits` (**仕様** §1.6)

### 2.1 型と効果 (`deriveCards`)

```ts
type CardEdit =
  | { card: 0; slot: string; op: 'drop' }
  | { card: 0; slot: string; op: 'format'; style: 'no-comma' | 'comma-shift' }
  | { card: 0; slot: string; op: 'unit'; unit: string }
  | { card: 0; slot: string; op: 'dup' }                       // slot は欄の key か 'headline'
  | { card: 0; slot: 'opPrev' | 'opCurr'; op: 'suffix'; word: '前期' | '当期' }
  | { card: 0; slot: string; op: 'glyph'; at: number }
  | { card: 0; slot: string; op: 'sign' }
  | { card: 0; slot: 'period'; op: 'day'; day: 32 }
  | { card: 0; op: 'headline'; word: string };
```

`shape` を持たない。`swap` は無い (型にも無い)。

| ID | `cardEdits` (B・やさしい) | 期待 |
| --- | --- | --- |
| DX1 | `drop` `margin` | `slots` の key = `sales`・`opPrev`・`opCurr` |
| DX2 | `format` `sales` `no-comma` | `text` = `12400` (`raw` は 12400 のまま)。`comma-shift` は `1,2400` (最後の 4 桁を 1 組、その前を 3 桁区切り。96930 → `9,6930`)。**整数部が 5 桁未満には `comma-shift` を効かせられず `RangeError`** (黙って無視すると、検証器が見つけられない異変の問題ができる) |
| DX3 | `unit` `sales` `億円` | `sales` の `unit` = `億円`。ほかは変わらない |
| DX4 | `dup` `opCurr` | `opCurr` が 2 回並ぶ (key `opCurr` が 2 つ、1 つ目の直後)。`countNumbers` = 5。`dup` `headline` → `headline.repeat` = 2。文欄・資料の欄 (むずかしい) の `dup` も同じ |
| DX5 | `suffix` `opPrev` `当期` | `opPrev` の `label` = `営業利益 (当期)` (`opCurr` と同じ名前が 2 行。値は前期の 1,120 のまま・`column` は previous のまま)。`opCurr` に `前期` → `営業利益 (前期)` |
| DX6 | `glyph` `opCurr` `at: 2` | `text` = `1,X40` (`1,240` の文字は [`1`・`,`・`2`・`4`・`0`] で、添字 2 の `2` を `X` に。`at` は `text` の文字の添字で、数字の文字を指す)。`at: 3` → `1,2X0`。`raw` は変わらない。`at` が数字でない文字 (`at: 1` の `,`) か範囲外 (`at: 5`) → `RangeError`。比率・文欄にも当てられる (数字を含む欄なら可。`10.0` の `at: 0` → `X0.0`) |
| DX7 | `sign` `sales` | `text` = `△12,400` (**値は正のまま**。`raw` = 12400)。`sign` は `raw` > 0 の金額の欄だけ (§2.2) |
| DX8 | `day` `period` 32 | DD4 |
| DX9 | `headline` `増収` | `headline.word` = `増収` (`reads` はそのまま) |
| DX10 | 編集の `slot` が形に無い key・`card` が 0 でない・見出し語に `drop`・`headline` の編集が見出し語の無い問題 | `deriveCards` は `RangeError` (データの誤りを黙って通さない) |
| DX11 | `applyEdits: false` | DX1〜DX9 の問題でも、`cardEdits` の無い同じ問題の結果と `toEqual`。省くと編集が効く |
| DX12 | むずかしい: `drop` `irSales`・`dup` `audit`・`format` `ta` `no-comma`・`unit` `irSales` `百万円`・`sign` `ta` | 欄の key が §1.2 の表の key で効く (`slot` で指す。`card` は 0)。`unit` `irSales` `百万円` は `unit` = `百万円` |

### 2.2 op ごとに当ててよい欄 (`cardEditIssues`。**仕様** §1.6。K11 の v3)

当ててよい例と、ダメな例を op ごとに 1 つ以上。`card-edit-op` (errors) が弾く。

| ID | op | 当ててよい | ダメ (`cardEditIssues` が文を返す) |
| --- | --- | --- | --- |
| K11a | `unit` | 金額の欄 (`measure` = money) | 比率の欄 `margin`・文欄 `audit` |
| K11b | `format` | `no-comma` = 金額の欄で整数部が 4 桁以上 (B の `sales`・`opPrev`・`opCurr`)。`comma-shift` = 5 桁以上 (B の `sales` は 12,400 で可。`opCurr` 1,240 は不可) | 比率・文欄・整数部が足りない欄 (`cfAr` の `△100` の `no-comma`) |
| K11c | `dup` | 数字の欄・文欄・`headline` | — (どれでもよい) |
| K11d | `suffix` | `opPrev`・`opCurr` | ほかの欄 (`sales`)。**型が `slot: 'opPrev' | 'opCurr'` なので、ほかは `shapeErrors` (§8) も弾く** |
| K11e | `glyph` | 数字を含む欄 | 文欄・`at` が数字の文字でない・範囲外。**`cardEditIssues` が文を返し (errors の `card-edit-op`)、`deriveCards` も `RangeError` を投げる (両方)**。`format` の `comma-shift` が 5 桁未満 (DX2) も同じ (両方) |
| K11f | `sign` | **値が正の金額の欄で、`card-sign` の対象 (売上高 `sales`・`ta`・`tlna`・`cash`・`arPrev`・`arCurr`・`cfEnd`・`irSales`・`irCashCur`・`irCashPrev`・`irDebtPrev` の 11 欄)** | 対象外 (`opPrev`・`opCurr`・`margin`・`pbt`・`cfStart`・`ocf`・`cfAr`・`irNetDebtPrev`)・値が 0 の欄 (無借金の `irDebtPrev`)・値が負の欄 |
| K11g | `day` | `period` だけ | (型が `slot: 'period'`) |
| K11h | `headline` | 元の語の組の外の語 (増益・減益 → `増収`・`減収`) | 組の中の語 (`減益`・`増益`) |
| K11i | `drop` | 数字の欄・文欄・`period`・資料 2 の欄 | `headline`・表題 (`frame`) (「何のカードか」が消える。見出し語の欠落は E-23 の語の違いと見え方が重なる) |
| K11j | `unit` の語 | その欄の正常の語以外 (短信の欄 `百万円` → `億円`、IR の欄 `億円` → `百万円`) | その欄の正常の語と同じ (`sales` を `百万円` に。表示が変わらない) |

### 2.3 答え合わせの場所 `placeSlots` (R-D3)

| ID | 入力 (B) → 期待 |
| --- | --- |
| P1 | 場所 `{doc:'tanshin', path:'summary.operatingMargin'}` → `['margin']`。`{doc:'tanshin', itemKey:'tanshin.incomeStatement.operatingIncome'}` → `['opPrev','opCurr']`。カードに無い場所 → 空 |
| P2 | `{doc:'ir', path:'statements.0'}` → `['headline']`。文章の異変の場所 `statements.0.text` (text の下) は `reads` の子として `['headline']` を返す (ただし `card-place-text` の shortfall が別に出る。§7) |
| P3 | 期の場所 `{doc:'tanshin', path:'header.periodLabel'}` → `['frame','frame.period']`・期末日の場所 `{doc:'tanshin', path:'columnDates.incomeStatement.current'}` → `['frame.period','period']`。**E-04 の答え合わせは `frame.period` (R-D3)** |
| P4 | 入れ物の場所: むずかしい `{doc:'ir', path:'segments.items'}` → `['irSegs']`。`ir.segments.items.2` (欠けた要素) も `['irSegs']` |
| P5 | `{doc:'ir', path:'header.companyName'}` → `['irHead']` (むずかしい)。やさしいは空 |
| P6 | `{doc:'card', card:0, slot:K}` → `[K]` (K = 欄の key・`headline`・`frame`・`frame.period`・`period`・(むずかしいは) `irHead`)。形に無い K (`nope`・やさしいの `irSales`) → 空 |

## 3. 構造・文字数 (`cardStructureIssues`・`cardTextLengthIssues`)

**上限** (**仕様** §1.1・§1.3): やさしい = 数字 4・文 0。むずかしい = カード数字 4・資料 1 数字 10・文 5・資料 2 数字 5・文 3 (合計 19・8)。文欄は 1 文・40 字以内。**上限は正常なカードに当てる。`dup` を持つ異変のカードは、上限をすべて +1 する** (責任者の決定 2026-11-08 問 1 = (b))。

| ID | 入力 → 期待 |
| --- | --- |
| ST1 | 導出したカード (B・やさしい・むずかしい) → `cardStructureIssues` は空 |
| ST2 | 欄を 1 つ削った・欄の並びを替えた (導出したカードの `slots` を書き換える)・同じ欄を足したカード → 文が 1 件以上 (形の定義との差) |
| ST3 | `headline` が無いカード (主張が無い問題) → 文 (見出し語が出ていない) |
| ST4 | `cardLimitIssues(カード)`: やさしいに数字の欄を 1 つ足す (5 つ) → 上限超えの文。むずかしいで `ir` の数字を 6 つにする・`notes` の文欄を 6 つにする → 超えの文。`cardLimitIssues(カード, 1)` (`dup` を持つ異変) では、やさしいの数字 5 は可・6 は不可 |
| ST5 | `cardTextLengthIssues`: 文欄の `text` が 40 字ちょうど → 空、41 字 → 1 件。数字の欄は長さを見ない。文字数は `[...text].length` |
| ST6 | **今の正常な問題**に当てる: `cardStructureIssues` は全問で空 (#180 で測り、PR に書く)。`cardTextLengthIssues` の今の件数は #180 で測り、データの課題の一覧 (§10) に書く。**見込み** (v2 の測定。ケース表 v2 の C8・S18): 正常な問題は **4 問・6 欄** (hard-023 方針注記 56・hard-024 後発事象 47 と IR 後発 47・hard-031 方針注記 56・hard-032 後発事象 49 と IR 後発 49。型の文 `irOcf` は 21 字以内)、異変の問題を含めると **6 問** (さらに hard-018 方針注記 56・hard-019 IR 後発 69)、やさしいは 0。v3 のカードの文欄は v2 の H3・H2 の文欄の和集合なので同じ数になるはず。ずれたら理由を §10 に書く |

## 4. 検証器の規則 (形のずれ。問題に `cardEdits` が付くと落ちる。v2 の K1〜K6 の直しと、新規 4 つ)

規則は `verifyProblem` が全問に当てる (`cardEdits` が無い問題では常に満たす。ただし `card-period`・`card-sign`・`card-column-suffix`・`card-digits`・`card-date-valid`・`xdoc-seg-names` は、導出したカードが正常のとき満たす)。落ちたときの `paths` は、食い違った欄の場所 **`card.0.<slot>`** (見出し語は `headline`)。`card-period` だけは、期のセルと期末日のセル。1 つの異変は 1 つの編集 (G6)。

| ID | 規則 | 入力 (B) → 期待 |
| --- | --- | --- |
| K1 | `card-slots` | `drop`・`dup` の編集 → 違反 1 件 (`paths`: drop = 欠けた欄 `card.0.margin`・dup = 重複した欄 `card.0.opCurr` か `card.0.headline`)。編集なし・`format`/`unit`/`headline`/`suffix`/`glyph`/`sign`/`day` の編集 → 満たす (v2 の「並び」の分岐 (`swap`) は無い) |
| K2 | `card-unit` | `unit` の編集 (`sales` を `億円`) → 違反 1 件 (`paths` = `card.0.sales`)。IR の `unit` 編集 (`irSales` を `百万円`) → `card.0.irSales`。正常 → 満たす。**標準の単位 = 比率は `%`、金額はその資料の `header.unit`** (短信 = `tanshin.header.unit`、IR = `ir.header.unit`。`header.unit` そのものの誤りは `header-unit` の仕事。`unitOverrides` は `unit-consistency` の仕事で、`card-unit` は `cardEdits` の `unit` だけを見る。**IR の単位が全社 億円であること (R-D7) は、規則でなくデータの検査 `card-ir-unit`** (§7 DS10)。決めた: 規則で `億円` を直書きすると、今の IR が百万円の 5 社の正常な問題が致命 (errors) になる) |
| K3 | `card-format` | `format` の編集 → 違反 1 件 (`paths` = その欄)。標準の書式 (`12,400`・`△100`・`10.0`・IR `124.0`) → 満たす。**標準の IR の小数 = 1 桁** (`irUnit` の分岐を外す) |
| K4 | `card-headline` | `headline` の編集 (`増収`) → 違反 1 件 (`paths` = `card.0.headline`)。語の組は `増益`・`減益` だけ (E-23) |
| K5 | `card-period` | **足元の期末日 (`columnDates.incomeStatement.current`) が、枠の期 `header.periodLabel` から作った期末日と合う**か (期の表記と期末日の照合。`isoDate` が閏年を含めて月末日を返す)。`columnDates.incomeStatement.current` を `2028-03-31` → 違反 1 件、`paths` = `tanshin.columnDates.incomeStatement.current`・`tanshin.header.periodLabel`。**3 画面でなく incomeStatement の当期だけを見る** (v2 から直す所)。ほかの 2 画面の列見出しは `dates-column-headings` が見る。2 月決算: `2025年2月期` の期末日は `2025-02-28`、`2024年2月期` は `2024-02-29`。E-04 の作り方 (設計 §2.5): 年を 1 年ずらしたあとの月末日 (`2024-02-29` → `2025-02-28`)。期の表記が読めないときは落とす |
| K6 | `xdoc-seg-names` | IR のセグメントの名前の並びが短信と違う (欠ける・並びが違う・綴りが違う) → 違反 1 件 (`paths` = 短信の名前のセル全部と IR の名前のセル全部)。正常 → 満たす |
| K7 | `card-sign` (新規) | 対象の欄 (`sales`・`ta`・`tlna`・`cash`・`arPrev`・`arCurr`・`cfEnd`・`irSales`・`irCashCur`・`irCashPrev`・`irDebtPrev`) の導出した表示に負の記号 (`△`・`−`・`-`) が付くと違反 (`paths` = `card.0.<欄>`)。`sign` の編集 (`sales`・`ta`) → 違反 1 件。**値が 0 の欄は落とさない** (`irDebtPrev` = 0 の問題に、表示 `0` は正常)。**対象外の欄 (`opPrev`・`opCurr`・`margin`・`pbt`・`cfStart`・`ocf`・`cfAr`・`irNetDebtPrev`) の負・△ は落とさない** (`cfAr` の `△100` は正常)。正常 (B) → 満たす |
| K8 | `card-column-suffix` (新規) | `column` を持つ欄の科目名の添え字が、`column` と合う (previous = `(前期…)`、current = `(当期…)`)。`suffix` の編集 (`opPrev` に `当期`) → 違反 1 件 (`paths` = `card.0.opPrev`)。正常 → 満たす。`labelOverrides` の誤字は添え字に影響しない |
| K9 | `card-digits` (新規) | 数字の欄の表示は、数字・カンマ・小数点だけ (負の記号 `△` は先頭に許す)。`glyph` の編集 (`opCurr` `at: 2`。`1,X40`) → 違反 1 件 (`paths` = `card.0.opCurr`)。正常 → 満たす。文欄は見ない |
| K10 | `card-date-valid` (新規) | 足元の表示 `YYYY年M月D日` の日が、その年月に実在する。`day` の編集 (32) → 違反 1 件 (`paths` = `card.0.period`)。正常・`2024年2月29日`・`2025年2月28日` → 満たす。`2025年2月29日` (存在しない日) → 違反。**足元のセル `columnDates` が正しいまま、表示だけが 32 になる** (E-28) |
| K12 | 既存の正常な問題との共存 | 今の正常な問題 (`src/data`) が、新しい規則 (`card-sign`・`card-column-suffix`・`card-digits`・`card-date-valid`) と、直した `card-period`・`card-unit` で違反 0 件。**IR の単位が百万円の会社の正常な問題で `card-unit` が落ちないこと** (規則は `ir.header.unit` と比べる。K2) |
| K13 | `shapeErrors` (§8) | `cardEdits` の誤りを返す |
| K14 | `anomalyIssues` | 正常な問題に `cardEdits` → `override-on-normal`。異変の問題の `cardEdits` が 2 件以上 → `anomaly-mismatch` (1 つの異変は 1 つの編集)。`slot` が形に無い・`card` が 0 でない → `anomaly-mismatch`。`headline` の編集・`dup` の `headline` は見出し語があるので通る。H-19 の既存問題は `xdoc-seg-names` を含む `expectedRules` で通る |
| K15 | 系統 | `ANOMALY_FAMILIES` に `card-form`、`FAMILY_DIFFICULTY['card-form']` = `hard`。`PRIMARY_FAMILIES.hard` には入れない (設計 §2.3) |

## 5. 見える条件 (R-S4 の V1・V2・検査 5。受け入れ条件 6 の「異変のカードには検出に要る数字か文が載る」)

形が 1 つなので、問題ごとに 1 回だけ判定する (`cardVisibility`)。V1 = `anomaly.places` の全セルが形のカードに載る (`cardCells`。文章の場所は入れ物の `reads` の子として載る。`itemKey` の場所は欄の `itemKey` が同じ)。V2 = `primaryRules` の 1 つが落とした違反の `paths` が全部、カードのセルに載る。検査 5 (V3) = `places` の欄の表示が基の同じ欄と違う (§5.2)。`cardEdits` を持つ問題は、V1・V2 を**テンプレートのカード** (`applyEdits: false`) で判定する (編集後のカードには `drop` した欄が無いので、欠けた位置を示せない)。

テストは、基準問題 B から異変を作って (`add`・`set` で書き換え、期待集合は実際に `verifyProblem` で出した規則に合わせる)、種類のダミー (`primaryRules` を指定) で試す。やさしい・むずかしいの両方の難易度で。

### 5.1 V1・V2

| ID | 異変 (B から) | 期待 |
| --- | --- | --- |
| V1 | やさしい: 営業利益率を 20.0 に (`ratio-operating-margin`。places = `summary.operatingMargin`) | 見える (`margin` の欄と、規則の 3 セル (売上高 当期・営業利益 当期・営業利益率) がすべてカードに載る) |
| V2 | やさしい: 営業利益 当期を 10 倍 (E-02。再計算しない。`primaryRules` = `ratio-operating-margin`。places = `incomeStatement.current.operatingIncome`) | 見える。places に営業利益率を足しても同じ |
| V3 | やさしい: 売上高 当期を営業利益の 0.8 倍以下に (E-24。`primaryRules` = `ratio-operating-margin`。places = `incomeStatement.current.netSales`) | 見える |
| V4 | やさしい: 営業利益の主張の向きを逆に (E-17。`claims-direction`。places = `ir.statements.0`) | 見える (見出し語と、営業利益の前期・当期が載る) |
| V5 | やさしい: 科目名の誤字 (`labelOverrides` の営業利益。places = `itemKey`) | 見える (`itemKey` が同じ欄がある) |
| V6 | **やさしいに載らないセル**: 総資産をずらす (`bs-total-assets`。places = `balanceSheet.current.totalAssets`)・IR の売上高を 10 倍 (H-17) | **やさしいでは見えない** (V1 が落ちる。`missingPlaces` に場所)。むずかしいでは見える |
| V7 | むずかしい: 監査の注意書きを `監査済み` に (H-22。`audit-note`) | 見える |
| V8 | むずかしい: 売掛金の科目名を `買掛金` に (H-28。`account-section`。itemKey) | 見える (`arPrev`・`arCurr`) |
| V9 | むずかしい: CF の最初の行をずらす (H-03。`link-cf-start`。paths = CF の最初の行・損益の税引前利益) | 見える |
| V10 | むずかしい: 貸借を 1 つずらす (H-01。`bs-balance`。paths = 資産合計・負債純資産合計) | 見える |
| V11 | むずかしい: IR の売上高を 10 倍 (H-17。`xdoc-hl-net-sales`。paths = 短信の売上高 当期と `ir.highlights.netSales.amount`) | 見える |
| V12 | むずかしい: CF の売上債権の増減をずらす (H-05。`link-cf-receivables`。paths = CF の増減と貸借の前期末・当期末) | 見える |
| V13 | むずかしい: IR のセグメントが 1 つ欠ける (H-19。`xdoc-seg-names`) | 見える (`segs`・`irSegs`) |
| V14 | むずかしい: CF の期末残高をずらす (H-04。`link-cf-cash-end`) | 見える |
| V15 | むずかしい: IR の純有利子負債 **前期**をずらす (H-20。`ir-supp-net-debt`。paths = 純有利子負債・有利子負債・現金の前期) | 見える。**当期**の純有利子負債は形に無いので見えない |
| V16 | むずかしい: 営業 CF の主張の向きを逆に (H-21。`claims-direction`。paths = 営業 CF と `ir.statements.2`) | 見える |
| V17 | むずかしい: 会計方針の変更を「あり」にして注記は `該当事項はありません。` のまま (H-23) | 見える |
| V18 | むずかしい: 短信の後発事象に文を入れ、IR の期末後の出来事は null のまま (H-24。`subsequent-event-match`) | 見える |
| V19 | むずかしい: IR の現金 当期を短信と違う値に (H-13。`xdoc-supp-cash`) | 見える。IR の現金 **前期**だけは、短信の前期の現金が形に無いので見えない |
| V20 | むずかしい: IR の社名を別の会社の名に (H-35。`header-company-name`。places = `ir.header.companyName`) | 見える (`irHead`) |
| V21 | **places が二次の症状を含む** (例: V12 で places に形に無いセルを入れる) | 見えない (V1 が落ちる) |
| V22 | places が 1 つも落ちた違反に触れない | 見えない (V2 が落ちる) |
| V23 | `cardEdits` の `drop` (`margin`。`primaryRules` = `card-slots`。places = `{doc:'card',card:0,slot:'margin'}`) | 見える。判定は**テンプレートのカード** (編集後には `margin` が無い) |
| V24 | `cardEdits` の `slot` が形に無い (やさしいの `irSales`) | 見えない (K14 の `anomaly-mismatch` も別に出る) |
| V25 | `columnDates.incomeStatement.current` をずらす (E-04。`card-period`。paths = 期末日のセルと `header.periodLabel`。places = 同じ 2 セル) | 見える (`frame.period`・`period`) |
| V26 | 正常な問題 | 見える (`isVisible` = true) |
| V27 | 異変の種類が一覧に無い | 見えない扱い (`unknown-kind` は別の検査が拾う) |

### 5.2 検査 5 (表示が実際に変わる。`displayChanges`。v2 の V28〜V31 を 1 形に)

`places` の欄の表示 (出す文字列 = 科目名 (添え字・資金の範囲を含む)・数字の文字列・単位の語・見える順の位置・欄の有無・見出し語 (語と `repeat`)・表題・足元の表示・`irFrame`) が、基 (`Anomaly.base` の正常な問題) の同じカードと違う。編集の印 (`op`・`style`)・欄の `key`・`itemKey` は表示に入れない。`places` の欄のどれか 1 つでも違えばよい。

| ID | 入力 → 期待 |
| --- | --- |
| V28 | 営業利益率 10.0 → 20.0 は表示が変わる。`sales` に `no-comma` は `12400` で変わる。`unit` の編集は単位が変わる。`drop` は欄が消える。`dup` は欄が 2 回出る・`headline` の `dup` は `repeat` が 2 になる。`headline` の編集は語が変わる。`suffix` は科目名が変わる。`glyph` は文字が変わる。`sign` は `△` が付く。`day` は足元の表示が変わる |
| V29 | **科目名だけが変わる異変** (`labelOverrides` の営業利益 → 営業和益・むずかしいの `ocf` の誤字 (H-30)・`cfEnd` の誤字) も、科目名が表示に入るので変わる (見える) |
| V30 | **表示が変わらない編集**: `cfAr` (`△100`) の `no-comma` → `△100` のまま変わらない (見えない。`cardEditIssues` K11b も弾く)。`suffix` が元と同じ語 (`opPrev` に `前期`)。`unit` が元と同じ語。`card-format` も落ちないので V2 でも見えない |
| V31 | **別名だけを変えた異変**は v3 では扱わない (`aliases` が無い)。`ir.results.netSales.current` だけを変える異変は、どの欄にも載らず V1 が落ちる |
| V32 | `base` を渡さない・基が引けない問題は、検査 5 を当てない (`v3` = null。`card-anomaly-base` が別に拾う) |

## 6. 許容集合 (`card-relation` の 5 検査。**仕様** §1.2・§3.2 #138-6)

### 6.1 `cardRelationIssues` の検査

| ID | 検査 | 内容 (読む欄) | 通る | 落ちる |
| --- | --- | --- | --- | --- |
| RC1 | R-dir | 見出し語の向き = 営業利益の前期 → 当期の向き (増益 ⇔ ② < ③、減益 ⇔ ② > ③。② = ③ のとき、どの語も違い)。`headline`・`opPrev`・`opCurr` | B (増益・1,120 → 1,240) | `減益` の語・`増収` の語 (別の型の語。`headlineIssue` は【増収】も違いとして落とす)・② = ③ |
| RC2 | R-margin | 営業利益率 (小数第 1 位) = ③ ÷ ① × 100 を小数第 1 位に**四捨五入**した値。`margin`・`opCurr`・`sales` | B (1,240 ÷ 12,400 = 10.0)・売上高 96,930・営業利益 4,920 → 5.1 (4920 × 1000 ÷ 96930 = 50.76 → 51 → 5.1)・5.05 ちょうど (売上高 2,000・営業利益 101 → 5.05 → 遠い側へ 5.1) | 率 20.0。売上高 0 |
| RC3 | R-range | 0.5 ≤ ③ ÷ ② ≤ 2。`opPrev`・`opCurr` | B (1.107)・0.5 ちょうど・2 ちょうど | ③ ÷ ② = 10・0.1・0.49・2.01 |
| RC4 | R-ne | ③ ≠ ②。`opPrev`・`opCurr` | B | ③ = ② (このとき R-dir も落ちる) |
| RC5 | R-lt | ③ < ①。`opCurr`・`sales` | B (1,240 < 12,400) | ③ = ① (等しいも落ちる)・③ > ① |
| RC6 | 欄が無い | 欄の値は `NaN` として扱い、その欄を読む検査が落ちる。`margin` を落とす → R-margin だけ。`sales` を落とす → R-margin・R-lt。`opCurr` を落とす → R-dir・R-margin・R-range・R-ne・R-lt。`opPrev` を落とす → R-dir・R-range・R-ne。読まない検査は落ちない | | |
| RC7 | **正常な問題** | **今の正常な問題 (やさしい 12・むずかしい 16・見本) のどれも 5 検査すべてが落ちない** (**測った**: 設計 §1.2 の表で 28 問 0 件。#180 でも測る)。基準問題 A・B も落ちない | | |
| RC8 | 落ちた検査の名前 | 各検査を 1 つだけ書き換えたカードで、返る `check` がその検査の名前 1 つだけ (ほかの検査が増えない。R-ne は R-dir を伴うので例外: 同じ値の `opPrev`・`opCurr` で `[R-dir, R-ne]`、R-range は ② = ③ で落ちない) | | |

### 6.2 異変の問題に許す検査 (`relationAllowed`・データの検査)

**許す検査 (異変の種類 → `anomaly-kinds.json` の `relationChecks`)**: E-02 = R-margin・R-range、E-24 = R-margin・R-lt、E-12 = R-margin、E-17・E-23 = R-dir、**E-19・H-31 (`drop`) = 落とした欄を読む検査** (RC6)、**ほかのすべての種類 = なし**。異変の問題で、落ちた検査が許す集合に入っていなければ、データの検査 `card-relation-extra` (shortfalls。**決めた**: 今のデータの異変の問題は v1 の作り方で、旧 E-02 などが許す外を落とす。errors にすると CI が赤になる。データの Task が直したあと `--require-cards` で致命にする。正常な問題と見本は errors の `card-relation`) に出る。

| ID | 入力 (B・やさしい。種類のダミーに `relationChecks` を持たせる) | 期待 |
| --- | --- | --- |
| AL1 | E-02 (**増益**) で ③ を 10 倍にして ③ ≥ ① になる (例: B の ③ を 12,400 以上に) | 落ちた検査に **R-lt** (許す外) → `card-relation-extra` が出る |
| AL2 | E-02 (採用の基: 増益で 10 × ③ ≤ 0.8 × ①。B は ③ = 1,240・① = 12,400 → 12,400 ≤ 9,920 で**基に当てはまらない**ので、基は ① を 20,000 などにして作る) | 落ちる検査 = R-margin・R-range だけ → 出ない。R-lt は落ちない |
| AL3 | E-02 (減益 1/10。基は B の ②・③ を入れ替えた減益 (1,240 → 1,120。営業利益の主張も `down`) で、③ を 1/10 にする) | R-margin・R-range だけ → 出ない |
| AL4 | E-24 (売上高 当期を営業利益の 0.8 倍以下に。再計算しない) | R-margin・R-lt だけ → 出ない。R-range・R-ne は落ちない |
| AL5 | E-12 (営業利益率を 2.2 倍) | R-margin だけ → 出ない |
| AL6 | E-17 (営業利益の主張の向きを逆) | R-dir だけ → 出ない。E-23 (見出し語を `増収` に) も R-dir だけ → 出ない |
| AL7 | E-19 で `margin` を落とす (`drop`) | R-margin だけ → 出ない (落とした欄を読む検査だけを許す)。`sales` を落とす → R-margin・R-lt → 出ない。`opCurr` を落とす → 5 検査すべて落ちるが許す → 出ない |
| AL8 | H-31 (むずかしいの `drop` `pbt`・`audit`) | 5 検査はどれも落ちない → 出ない。読まない検査が落ちたら出る |
| AL9 | 上のほかのすべての種類。**`cardRelationIssues` が読むのは `raw` (データの値) と見出し語の語で、`text` (表示の文字列) ではない** (表示を数にして読むと、E-25 の `△12,400` で R-margin・R-lt、E-27 の `1,2X0` で NaN になり、許す検査が「なし」の種類が 4 検査落ちる)。次の行を**種類ごとに個別のテスト**にする。落ちたら `card-relation-extra` (許す外) | 5 検査はどれも落ちない → 出ない |
| AL9a | E-25: `sign` `sales` (`text` = `△12,400`・`raw` = 12400) | 5 検査すべて落ちない |
| AL9b | E-27: `glyph` `opCurr` `at: 2` (`text` = `1,X40`・`raw` = 1240) | 5 検査すべて落ちない |
| AL9c | E-21: `format` `sales` `no-comma` (`12400`)・E-03: `unit` `sales`・E-22: `dup` `opCurr`・`dup` `headline`・E-26: `suffix` `opPrev` `当期`・E-28: `day` 32・E-04: `columnDates.incomeStatement.current` のずれ・E-05: `labelOverrides` の誤字 (営業和益) | それぞれ 5 検査すべて落ちない (E-22 の `dup` `opCurr` は `find` が最初の欄を読むので値は同じ) |
| AL9d | むずかしいの種類 (H-01・H-03・H-04・H-05・H-13・H-17・H-19〜H-24・H-28〜H-30・H-32〜H-35 を 1 つずつ。基は B・むずかしい。H-34 は `sign` `ta`) | 5 検査すべて落ちない (カードの 4 欄・見出し語を変えないので) |
| AL10 | `relationChecks` を持たない種類・種類が引けない異変の問題 | 落ちた検査があれば `card-relation-extra` (種類が引けないときは `unknown-kind` が別に出る) |
| AL11 | **正常な問題・見本** | 5 検査すべてが落ちない (RC7)。落ちると errors の `card-relation` |

### 6.4 種類の定義 `anomaly-kinds.json` (設計 §3.2 #138-6。#138 が足す・印を付ける。既存の種類の定義は**足すだけで、外さない**)

今のデータの `expectedRules`・主な規則の検査 (errors) を壊さないため、既存の種類の `primaryRules`・`allowedRules` は**足すだけ** (外さない)。台帳から外れた種類 (E-01・E-06〜E-11・E-13〜E-16・H-02・H-06〜H-12・H-14〜H-16・H-18) は残し、`ledger` の印を付けない。

| ID | 入力 → 期待 |
| --- | --- |
| KD1 | **台帳 v3 の印 `ledger: 'v3'`**: やさしい = E-02・E-03・E-04・E-05・E-12・E-17 (既存) と E-19・E-21〜E-28 の新規 = **15 種類**。むずかしい = H-01・H-03・H-04・H-05・H-13・H-17・H-19〜H-24・H-28 (既存。H-19・H-20・H-21・H-22・H-23・H-24 を含む 13 種類) と H-29〜H-35 (新規) = **20 種類**。印の無い種類はそれ以外。データ検査: 印のある種類を `kind-shape` が受け入れ、印の値が `'v3'` 以外なら誤り (SE4) |
| KD2 | **新しい種類** (id・系統・`primaryRules`。`allowedRules` = `primaryRules` + 既存の種類と同様に必要な規則 (`changed` を読む違反は `changed` の許容で通るので、足すのは主な規則だけ)): E-19 (appearance・`card-slots`)・E-21 (appearance・`card-format`)・E-22 (appearance・`card-slots`)・E-23 (appearance・`card-headline`)・E-24 (calculation・`ratio-operating-margin`)・E-25 (appearance・`card-sign`)・E-26 (appearance・`card-column-suffix`)・E-27 (appearance・`card-digits`)・E-28 (appearance・`card-date-valid`)・H-29 (card-form・`card-unit`)・H-30 (card-form・`label-spelling`)・H-31 (card-form・`card-slots`)・H-32 (card-form・`card-format`)・H-33 (card-form・`card-slots`)・H-34 (card-form・`card-sign`)・H-35 (cross-document・`header-company-name`)。`relationChecks`: E-23 = R-dir・E-24 = R-margin・R-lt。ほかの新しい種類は持たない (E-19・H-31 の `drop` は `drop` した欄を読む検査をコードで足す。RC6・AL7) |
| KD3 | **既存の種類に足す** (N1): E-02 = `primaryRules`・`allowedRules` に `ratio-operating-margin` を足し、系統を `calculation` に (設計 §2.3)。`relationChecks` = R-margin・R-range。E-12 に `relationChecks` = R-margin。E-17 に R-dir。E-03 の `primaryRules`・`allowedRules` に `card-unit` を足す (v3 の `cardEdits` の `unit`。今の `unit-consistency`・`sign-consistency` は残す)。E-04・E-05 は足すものが無い (E-04 は `card-period` を持つ)。むずかしいの既存の種類は、`ledger` の印だけ |
| KD4 | `unknown-rule` (errors): 種類が参照する規則 ID はすべて `HARD_RULE_IDS` か `SOFT_RULE_IDS` にある (KD2 の `card-sign` などが規則に入っている)。`kind-primary-not-allowed`・`kind-no-primary` の検査は新しい種類も通る |
| KD5 | **今のデータ** (`src/data`) に当てて、`errors` が 0 件のまま (E-02 の定義を足しても今の E-02 の問題の `expectedRules`・主な規則の検査が壊れない)。壊れるなら足さずに §10 と §13 の申し送りに書く |

### 6.3 二重の食い違いの禁止 (`doubleDiscrepancies`。v2 の X1〜X5 を 1 形に)

見える条件を満たす問題の hard の違反のうち、「`paths` がすべてカードのセルに収まる」ものが、すべて種類の `primaryRules` に入る。入らない違反があれば、その規則を返す。

| ID | 入力 (B・やさしい) | 期待 |
| --- | --- | --- |
| X1 | 営業利益 当期を 10 倍 (E-02。向きは変わらない。`primaryRules` = `ratio-operating-margin`) | 空 (`ratio-operating-margin` だけがカードに収まる。`pl-operating-income` は粗利・販管費がカードに無く収まらない) |
| X2 | 営業利益を 1/10 (増益の期なので向きが逆になる) | `claims-direction` が収まるので `['claims-direction']` |
| X3 | むずかしい: CF の売上債権の増減を再計算 (H-05 の v2 の作り方。期末残高 `cfEnd` が `link-cf-cash-end` を同時に落とす) | `['link-cf-cash-end']` (v3 は再計算しない。設計 §2.3) |
| X4 | 正常な問題・見えない問題 | 空 |
| X5 | データ全件 | `card-double-discrepancy` の shortfall (§7) |

## 7. データ全件 `verifyDataset` (R-S5 の v3 版・**仕様** §1.5・§3.2 #138-4・5)

追加の検査はすべて `Entry`。**致命 (errors)** は、今のデータでも成り立つもの (構造・正常な問題の `card-relation`・`cardEdits` の誤り・`card-edit-op`・`cash-scope`・`claims-count`・`anomaly-base`・`anomaly-changed-mismatch`)。**数・作りの不足 (shortfalls。コードは `card-` で始める。`anomaly-min-deviation` も)** は、今のデータが満たさないので警告にし、データの Task (#139・#140) が直したあと `--require-cards=easy|hard` で致命にする (§11)。

| ID | コード | 条件 (難易度ごと) |
| --- | --- | --- |
| DS1 | `card-structure` (errors) | 正常な問題・見本 × 難易度で `cardStructureIssues` ≠ 空。異変の問題の `cardEdits` を当てたカードも `cardLimitIssues` (`dup` を持つ異変は +1。メッセージに上限) |
| DS2 | `card-relation` (errors) | 正常な問題・見本 × 難易度で `cardRelationIssues` ≠ 空 (落ちた検査の名前を書く) |
| DS3 | `card-relation-extra` (shortfalls) | 異変の問題で、落ちた検査が `relationAllowed` の外 (§6.2。問題ごとに 1 件。落ちた検査と許す検査を書く) |
| DS4 | `card-text-length` (shortfalls) | 全問 (異変の問題も。`cardEdits` の問題はテンプレートのカード) × 難易度で `cardTextLengthIssues` ≠ 空 (問題ごとに 1 件)。見本は両方の難易度の形で数え、**超えた難易度を付けて 1 件** (`--require-cards=hard` が数える) |
| DS5 | `card-invisible` (shortfalls) | 異変の問題で `isVisible` が偽 (問題ごとに 1 件。メッセージに V1・V2・V3 のどれが落ちたか。V1 = `カードに載らない場所`) |
| DS6 | `card-company-both-sided` (shortfalls。R-S5 (b) の v3 版) | 難易度の会社 (`companies.json` 全社) の中に、**異変の問題か正常な問題を持たない会社** (会社を列挙して 1 件)。`ROUNDS_TO_CLEAR` (8) 社の (a) はこれに含まれる |
| DS7 | `card-company-period` (shortfalls。R-S5 (d)) | プールにある (会社, 期) に、正常な問題か異変の問題が無い |
| DS8 | `card-claim-directions` (shortfalls。R-S5 (f) の v3 版) | 難易度ごとに、**正常な問題**で `direction: 'down'` を持つ会社の数: やさしい = `operatingIncome` 3 社以上、むずかしい = `operatingIncome` 3 社以上・`operatingCashFlow` 1 社以上 (**`netSales` は要らない**。`CLAIMS_SHOWN`・`CLAIM_DOWN_MIN_COMPANIES` から `netSales` を外す)。足りなければ 1 件にまとめる |
| DS9 | `claims-count` (errors) | 1 問の中で **`operatingIncome`・`operatingCashFlow` の主張がちょうど 1 つ**でない (0 個・2 個以上)。問題 × metric ごとに 1 件。**`netSales` は数えない** (R-D5)。異変の問題・正常な問題・見本の全部 |
| DS10 | `card-ir-unit` (shortfalls。R-D7) | IR の単位が億円でない問題 (`ir.header.unit` ≠ `億円`。問題ごとに 1 件)・`companies.json` の `irUnit` が `億円` でない会社 (会社ごとに 1 件。**今は 5 社**: c03・c05・c06・c08・c10 が億円で、c01・c02・c04・c07・c09 が百万円。設計 §1.4・**測った**: `companies.json`) |
| DS11 | 基準問題 A (百万円の IR) | `card-ir-unit` の shortfall が出る・`card-unit` (規則) は落ちない (K2・K12) |
| DS12 | `card-tier-balance` (shortfalls。設計 §2.7・§3.2 #138-5) | **段ごとに、会社どうしの差が 1 問以内** (設計 §2.7・§1.5「各社が持つ異変の問題の数が、段ごとに 1 問以内の差」。段 t について、各社が持つ段 t の異変の問題の数の最大 − 最小 ≤ 1。段 1・2・3 のそれぞれで当てる。**1 社の中の段どうしの差ではない**: 設計の推奨のプールは 1 社に段 1 が 5 問・段 3 が 1 問で、会社の中の差は 4 になる。段を持つ異変の問題だけ数える。違反した段と会社を列挙して 1 件) |
| DS13 | `card-normal-tier` (shortfalls) | 正常な問題が `tier` を持つ (問題ごとに 1 件) |
| DS14 | `card-kind-count` (shortfalls) | **数える種類 = `anomaly-kinds.json` の `ledger: 'v3'` の印を持つ種類** (§6.4。台帳 v3 のやさしい 15・むずかしい 20。`anomaly-kinds.json` には台帳から外れた種類 (E-01・E-06〜E-11・E-13〜E-16・H-02・H-06〜H-12・H-14〜H-16・H-18) が残るが、**印の無い種類は数えない**)。難易度の印のある種類ごとに、異変の問題の数が 5 問でない (むずかしいの会計 (accounting) と資料間 (cross-document) の印のある 11 種類は 7 問でない。**0 問も出る**。種類を列挙して 1 件)。`card-kind-companies` = 印のある種類ごとに、その種類の異変の問題を持つ会社が 5 社未満 (0 問を含む。種類を列挙して 1 件)。印の無い種類の問題は、この 2 つの数え方に入らない (印の無い種類の問題が残っていても出ない) |
| DS15 | `card-pool-size` (shortfalls) | 難易度の問題数が やさしい 85・むずかしい 132 でない (設計 §1.5。数は 15 × 5 + 10 と 11 × 7 + 9 × 5 + 10 で、DS14 の数え方の和 + 正常 10。印の無い種類の問題は含めない)。**`pool-size` (25 問。要件) は今のまま** (`--require-complete` の致命。85・132 を入れると今のデータで CI が赤になる) |
| DS16 | `card-anomaly-base` (shortfalls)・`anomaly-base`・`anomaly-changed-mismatch` (errors) | v2 の S12〜S14 のまま (§12 の BC1〜BC6) |
| DS17 | `card-double-discrepancy`・`anomaly-min-deviation`・`card-place-text`・`cash-scope` | `card-double-discrepancy` = `doubleDiscrepancies` ≠ 空 (問題ごと)。`anomaly-min-deviation` = `deviationIssues` ≠ 空 (§9)。`card-place-text` = 異変の `places` が `ir.statements.<N>.text` を指す (shortfalls。カードの文は claims から作り、`text` は読まない)。`cash-scope` (errors) = `notes.cashScope` が標準の名前と違う |
| DS18 | 既存の維持 | `pool-size`・`both-sided-companies`・`family-balance` は今のまま (`stats` の形も)。`anomaly-ratio` は出さない |
| DS20 | `card-edit-op` (errors) | `deriveCards` が `RangeError` を投げる `cardEdits` (形に無い欄・`comma-shift` が 5 桁未満・`glyph` の `at` が数字でない・見出し語に `drop` など) を持つ異変の問題 → `verifyDataset` は `RangeError` を握りつぶさず、`card-edit-op` を errors に出す (メッセージに `RangeError` の内容)。v2 は `card-invisible` (shortfalls) にしか出ず、注入の添字ずれが `--require-complete` を素通りした |
| DS19 | 外すもの | `card-shape-companies`・`card-shape-both-sided`・`card-shape-kinds` (形ごとの検査)。コードは出ない |

テスト: 小さな合成のデータ (会社 2〜3 社・問題 数件を、基準問題 B から作る) で、各コードが条件どおり出る・出ない (境界: DS4 は 40 字 → 出ない・41 字 → 出る、DS12 は「段 1 の問題を会社 a が 5 問・会社 b が 4 問」(差 1) → 出ない・「会社 a が 5 問・会社 b が 3 問」(差 2) → 出る・「会社 a に段 1 が 5 問・段 3 が 1 問で、どの会社もそうなっている」 → 出ない (会社の中の差は見ない)、DS14 は 5 問 → 出ない・4 問 → 出る・印のある種類が 0 問 → 出る・印の無い種類が 3 問 → 出ない (数えない)・むずかしいの accounting の印のある種類は 7 問 → 出ない・5 問 → 出る)。実データ (`src/data`) には、`errors` が 0 件のまま (`card-structure`・`card-relation` を含む) で、shortfalls に `card-*` が出ること。測った件数を PR と §10 に書く。

## 8. 型の検証 `shapeErrors` (K13)

| ID | 入力 → 期待 |
| --- | --- |
| SE1 | `cardEdits` の `op` が未知・`card` が 0 でない・`slot` が文字列でない・`style` が未知・`word` が `前期`/`当期` でない (`suffix`)・`day` が 32 でない・`at` が整数でない・`headline` に `word` が無い・未知のキー・**`shape` を持つ** (v2 の型。`swap` を含む) → 誤りを返す |
| SE2 | 正しい `cardEdits` (DX1〜DX9)・`cardEdits` が 1 件の問題・`cardEdits` の無い問題 → 誤りなし |
| SE3 | `AnomalyPlace` の card の場所 `{doc:'card', card:0, slot}` → 正しければ誤りなし。`shape` を持つ・`card` が 0 でない・`slot` が無い・`path` か `itemKey` を持つ・未知のキー → 誤り |
| SE4 | `AnomalyKind.relationChecks` が 5 つの名前以外・配列でない → 誤り (`kindShapeErrors`)。無い種類は誤りなし |

## 9. 道具なしで気づける最小のずれ `deviationIssues` (**仕様** §2.8。M1〜M6 は v2 のまま、E-24・E-02 を足す)

| ID | 種類 | 検査 | 通る例 | 通らない例 |
| --- | --- | --- | --- | --- |
| M1〜M6 | E-09・E-12・E-06・E-07・H-05・H-20 | v2 のまま (v2 のケース表の M1〜M6。値は `src/verifier/cards.test.ts` の既存のケースを引き継ぐ。E-09・E-06・E-07 は台帳から外れたが、`anomaly-kinds.json` に残っている間は検査も残す) | | |
| M9 | E-24 | **売上高 当期が営業利益 当期の 0.8 倍以下** (`10 × 売上高 ≤ 8 × 営業利益`。設計 §2.8: 「小さい」と一目で分かる。0.95 倍などを避ける) | 売上高 2,950・営業利益 4,920 (0.60)・0.8 倍ちょうど (3,936) | 0.81 倍・売上高 > 営業利益 |
| M10 | E-02 | **③ ÷ ② が 10 以上 (増益)・0.1 以下 (減益)** (向きを変えない方。`③ ≥ 10 × ②` か `10 × ③ ≤ ②`) | 4,480 → 49,200 (10.98)・4,480 → 448 | 4,480 → 40,000 (8.9)・4,480 → 4,500 |
| M7 | 検査の無い種類・正常な問題 | 空を返す。正常な問題 (28 問) も空 | | |
| M8 | 今のデータ | 今の異変の問題に当てた結果を **測って** PR に書く (E-24 の問題は今のデータに無い。旧 E-02 の問題 (v1 の「桁の取り違え」) は M10 で落ちうる。shortfalls `anomaly-min-deviation` に入る。データの Task が作り直す) | | |

`deviationIssues` は、問題の異変の種類 (`problem.anomaly.kind`) で表を引き、表に無い種類は空。メッセージに、種類・実際のずれ・最小のずれを書く。

## 10. 今のデータで落ちる検査の一覧 (#180 の成果物。#139・#140 への申し送り)

#180 で `src/data` に全検査を当て、**shortfalls に出るコードごとに件数と問題を一覧にして、本書のこの節に書く** (データは直さない)。見込み (設計 §3.2 の申し送りと、v2 の測定から): `card-ir-unit` (5 社の会社設定と、その会社の問題)・`card-pool-size`・`card-kind-count`・`card-kind-companies`・`card-tier-balance`・`card-normal-tier` (今の正常な問題に `tier` が付いている)・`card-claim-directions` (やさしい 減益 2 社 → +1・むずかしい 減益 1 社 → +2・営業 CF マイナス 0 社 → +1)・`card-text-length`・`card-invisible`・`card-relation-extra`・`card-place-text`・`anomaly-min-deviation`・`card-anomaly-base`・`card-double-discrepancy`。**見込みと実測がずれたら、ずれた理由を書く**。

## 11. CLI と CI

| ID | 入力 → 期待 |
| --- | --- |
| L1 | `npm run verify:data -- --require-complete` は、今のデータで終了コード 0 (errors が無い。`card-*` の shortfalls は警告として出る) |
| L2 | `--require-cards` を付けると、`card-*`・`anomaly-min-deviation` の shortfalls が致命 (今のデータでは終了コード 1)。`--require-cards=easy`・`=hard` はその難易度だけ致命。値が easy・hard 以外なら終了コード 2 |
| L3 | `card-*` と `anomaly-min-deviation` の shortfalls は `--require-complete` の致命に数えない。`pool-size` などは今のまま致命 |
| L4 | `.github/workflows/ci.yml` の `check` ジョブは `npm test`・`npm run verify:data -- --require-complete` を回す (今のとおり)。責任者が #139・#140 の受け入れ条件に「CI に `--require-cards=easy` / `=hard` を足して終了コード 0」を入れた。ci.yml のコメントのケース表の節番号を **§11** に直す |
| L5 | 新しいテストは `npm test` に含まれ、`src/ci.test.ts` が `--require-complete` の行が残ることを確かめる |

## 12. 設計 v2 §2.8 の `base`・`changed`・許容集合 (v2 の §9 のうち、形の数に依らないもの。値は v2 のまま)

**v2 の #153 で決めたこと (変えない)**: (a) 「違反が `changed` のセルを読む」は、違反の path が `changed` の 1 つと**同じか、その下** (`changed` が要素のパスのとき)、または**その入れ物** (違反が `ir.segments.items` を読み、`changed` がその要素 `…items.2` のとき。H-19 の二次の違反) で判定する。(b) `changed` が要素の過不足のときは、`changedCells` が足りない・余った要素のパス 1 つを差とする。**v3 で変えるのは A5 の場所の形だけ** (形を持たない)。種類のダミーは `primaryRules` = `allowedRules` = `['ratio-operating-margin']`、A は基準問題 B に置き換える (A の値は B と同じ)。

### 12.1 `anomalyIssues`・`checkAnomaly` の許容集合 (**§2.8** の検査 1・2)

`anomaly.changed` (基との差のセル `<doc>.<path>`) を持つ問題だけに、新しい決まりを当てる (`changed` が無い問題は今のまま = #139・#140 が足すまで)。**`expectedRules` = 実際に落ちた集合** の検査と、主な規則が 1 つ以上落ちる検査は今のまま。

| ID | 入力 (A から。種類のダミーは `primaryRules` = `allowedRules` = `['ratio-operating-margin']`) | 期待 |
| --- | --- | --- |
| A1 | 営業利益 当期を 10 倍 (再計算しない)、`changed = ['tanshin.incomeStatement.current.operatingIncome']`、`expectedRules` = 実際に落ちた規則 | 問題なし (落ちた規則は `allowedRules` の外 (`pl-operating-income` など) でも、変えたセルを読むので許す) |
| A2 | A1 と同じで `changed` を省く、または `[]` | 「許容集合の外の規則が落ちている」「期待集合が許容集合を越えている」 (今のまま) |
| A3 | A1 で `changed` に別のセル (`tanshin.summary.eps`) を入れる | 変えたセルを読まない規則が落ちる → 許容集合の外の指摘 |
| A4 | A1 で `places` = `summary.operatingMargin` だけ。`pl-operating-income` は `places` に触れない | **§2.8 検査 2**: `changed` を読む違反なので「場所に触れない違反」は出ない。`changed` を読まない違反が `places` に触れないなら今のまま出る (`anomaly-mismatch`) |
| A5 | 場所 `{doc:'card',card:0,slot:'margin'}` の問題 (`cardEdits` の drop) | 場所の key = `card.0.margin` が `card-slots` の違反の `paths` に触れる。欄が形に無い (`slot: 'nope'`・やさしいの `irSales`)・`card` が 0 でないと `anomaly-mismatch` (場所が実在しない) |
| A7 | 要素の欠け (H-19 型。正常な B から IR のセグメントを 1 つ消す。`changed = ['ir.segments.items.2']`、places = 欠けたセグメントの短信側の名前のセル、`expectedRules` = 実際に落ちた規則) | 問題なし。`seg-count`・`segment-names`・`ir-seg-reconcile` は入れ物 `ir.segments.items` を読む違反で、changed の要素 (`…items.2`) の入れ物なので「変えたセルを読む」に数える。`changed` を空にすると「場所に触れない違反」が出る (#153 レビュー B1) |
| A6 | `shapeErrors` の card の場所 | §8 の SE3 |

### 12.2 データ全件の `base`・`changed` (**§2.8**。S12〜S14)

| ID | 入力 | 期待 |
| --- | --- | --- |
| B1 | 異変の問題に `base` = 同じ会社・同じ期の正常な問題の ID、`changed` = 実際の差 | errors に `anomaly-changed-mismatch`・`anomaly-base` が出ない |
| B2 | `changed` が差より少ない・多い・順序だけ違う | 少ない・多いは `anomaly-changed-mismatch` (メッセージに足りない・余計なセル)。順序だけは出ない (集合で比べる) |
| B3 | `base` が存在しない ID・異変の問題・別の会社・別の期・自分自身 | `anomaly-base` |
| B4 | `labelOverrides` だけの異変 (基からセルの差なし)・`changed: []` | 出ない。`changed` が空で差があれば `anomaly-changed-mismatch` |
| B5 | `base`・`changed` が無い異変の問題 | shortfalls `card-anomaly-base` (問題ごと) |
| B6 | 差の取り方: セルは `tanshin`・`ir` の全リーフ (数・文・真偽・null)。配列 (`statements`・`segments.items`) は添字つきのパス `ir.statements.0.text`。要素の数が違えば、足りない・余った添字のパスが差 | `changed` はそのパスで書く |


## 13. この Task でやらないこと・設計 v3 と読み替えた所 (範囲の外。理由つき)

**設計 v3 と読み替えた所** (中身は設計の許可表と同じ。#139・#140 が設計の文のまま書くと種類の定義が誤りになるので、ここに残す): ① 設計 §2.9 の「E-02 の `primaryRules` に `card-relation` の R-range、E-24 に R-lt を足す」は、`card-relation` を規則の ID にすると今の異変の問題の `expectedRules` (実際に落ちた集合との一致を求める errors) が壊れるので、**`primaryRules` には足さず、種類の `relationChecks` (R-range・R-lt を含む許す検査) で表す** (§6.2・§6.4)。`primaryRules` に `R-range` と書くと、規則の ID に無いので `unknown-rule` の誤りになる。② 設計 §3.2 #138-3 の「`card-unit` から `irUnit` の分岐を外す (IR = 億円)」は、規則は `ir.header.unit` と比べ、IR が億円であることはデータの検査 `card-ir-unit` (shortfalls) に置く (K2・DS10)。理由: 規則で `億円` を直書きすると、今 IR が百万円の 5 社 (c01・c02・c04・c07・c09) の正常な問題が致命になる。どちらも最後は `--require-cards=easy|hard` の終了 0 (#139・#140 の受け入れ条件) で致命になる。


| 事柄 | 理由 | 担当 |
| --- | --- | --- |
| 出題 (`draw` の段の累積・種類の履歴・R-S6 の置き換え・`Round` から形を外す・`game`・`session`・`records`) | 設計 §3.2 の #155 の持ち分 | #155 |
| 問題データの作り直し (IR を億円に・85/132 問・`tier` を外す・異変の作り方・`base`・`changed`・答え合わせの文言) と、`anomaly-kinds.json` の**既存の種類の定義の作り直し** (E-02 などの v1 の定義) | データの Task。#138 は**新しい種類の ID を足す**・`relationChecks` を持たせる・`card-form` を足す (設計 §3.2 #138-6) までで、今のデータの `expectedRules` の検査 (errors) を壊さない | #139・#140 |
| 画面 (言い換えの文言 (`labels.ts` の言い換え)・桁マス・DESIGN.md・PRODUCT.md の直し・字体) | 設計 §3.2 の #141 | #141 |
| `docs/design-v2.md` の直し | 設計の Task (#174) の所有物 | — |
