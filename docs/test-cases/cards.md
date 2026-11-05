# ケース表: カードの導出と検証器の拡張 (Sub-task #151)

Task #138 (受け入れ条件 6)。根拠: [design-v2.md](../design-v2.md) §1 (カード)・§2 (台帳)・§2.7・[requirements.md](../requirements.md) 受け入れ条件 5・6・[charter.md](../charter.md) (single source of truth・テスト容易性)。この表のあと、テスト (#152・#153) をレッドで書き、グリーンにする。

印: **仕様** (design-v2.md にある) / **決めた** (この表で決めた。設計書の細部を埋めたもの。監視役のレビューで変えてよい) / **測った** (コマンドの結果)。

## 0. 公開する入口 (テストが外から呼ぶもの)

内部の関数名には依らず、次の入口の入力と出力だけでテストする。

| 入口 | 入力 → 出力 |
| --- | --- |
| `SHAPE_IDS`・`shapesOf(difficulty)`・`difficultyOfShape(shape)` (`src/domain/cards.ts`) | 形の ID の一覧 `E1 E2 E3 H1 H2 H3` / やさしい → `[E1,E2,E3]`、むずかしい → `[H1,H2,H3]` / 形 → 難易度 |
| `deriveCards(problem, company, shape)` | 問題・会社・形 → `Card[]` (やさしい = 1 枚、むずかしい = [短信型, IR 型])。**純関数**。形の難易度が問題の難易度と違えば `RangeError` |
| `Card` | `{ doc: 'summary'｜'tanshin'｜'ir'; frame: { companyName, securitiesCode, periodLabel, periodEnd? }; headline?: { word, reads }; slots: CardSlot[]; bars?: { axisMin, items: [{ key: 'previous'｜'current', value, reads }] } }` |
| `CardSlot` | `{ key; kind: 'number'｜'text'; itemKey; label; text; unit; raw; reads }`。`text` = 画面に出す文字列 (数字は桁区切り・符号つき、文欄は文)。`raw` = 元のセルの値 (数字欄は number、文欄は string)。`unit` = 単位の語 (金額は `百万円`/`億円`、比率は `%`、文欄は空)。`reads` = その欄が読むセル `<doc>.<path>` |
| `countNumbers(card)`・`countTexts(card)` | 枠の外を除いた数字の数 (棒 1 本も 1 つ)・文欄の数 |
| `cardCells(cards)` | 見えるセルの集合 = 全欄の `reads` + 全欄の `itemKey` + 枠のセル (`<doc>.header.companyName・securitiesCode・periodLabel`、`tanshin.columnDates.<画面>.current`) + 棒の `reads` |
| `placeSlots(cards, place)` | 異変の場所 (`AnomalyPlace`) → その場所を見せる欄 `{ card, key }[]` (R-D3)。パスの場所は `reads` が場所と同じか場所の親 (入れ物)、`itemKey` の場所は `Slot.itemKey` が同じ欄 |
| `cardRelationIssues(cards, shape)` (`src/verifier/cards.ts`) | 導出したカード → 関係の食い違いの文の配列 (空 = 整合) |
| `cardStructureIssues(cards, shape)` | カード → 欄の並びが形の定義と違う、数字・文の数が上限 (やさしい 数字 4 / むずかしい 1 枚 数字 4 + 文 3) を超える、の文の配列 |
| `cardTextLengthIssues(cards)` | 文欄の `text` が 40 字を超える欄の文の配列 |
| `visibleShapes(problem, company, kinds)` | 異変の問題 → V1・V2 (R-S4) を満たす形の ID の配列。正常な問題 → 難易度の全形 |
| `verifyDataset` の追加 | 下の §5 |
| 規則 (`HARD_RULE_IDS` に足す) | `card-slots`・`card-unit`・`card-format`・`card-headline`・`card-period`・`xdoc-seg-names` |
| 型 (`types.ts` と docs/design.md §4.2 の写し) | `ShapeId`・`CardEdit`・`Problem.cardEdits?`・`ANOMALY_FAMILIES` に `card-form` (むずかしい) |

**基準問題** (`src/verifier/fixtures/`): A = `normal.problem.json` (百万円の会社)、B = `normal-b.problem.json` (億円・セグメント 3)。どちらも `difficulty: 'easy'` で入っているので、むずかしいの形のテストは `{ ...A, difficulty: 'hard' }` にして使う。以下の値は **測った** (fixture を読んだ値)。

| | A | B |
| --- | --- | --- |
| 売上高 前期・当期 / 営業利益 前期・当期 / 営業利益率 | 11,800・12,400 / 1,120・1,240 / 10.0 | 同じ |
| 流動資産合計・固定資産合計・資産合計・負債純資産合計 | 7,700・7,500・15,200・15,200 | 同じ |
| 売掛金 前期・当期 / CF の売上債権の増減 / 営業 CF | 2,900・3,000 / △100 (= −100) / 1,500 | 同じ |
| CF の税引前利益 / CF の期末残高 / 貸借の現金 | 1,250 / 2,300 / 2,300 | 同じ |
| IR 売上高・棒 (前期・当期) | 12,400 (百万円)・11,800・12,400 | 124.0 (億円)・118.0・124.0 |
| IR 現金 当期・前期 / 有利子負債 前期 / 純有利子負債 前期 | 2,300・2,100 / 4,834 / 2,734 | 23.0・21.0 / 48.3 / 27.3 |
| 文: 売上・営業利益の主張 (`ir.statements.0`) | 売上高・営業利益ともに前期を上回った。 | 同じ |
| 文: 営業 CF の主張 (`ir.statements.2`) | 営業キャッシュ・フローは堅調であった。 | 同じ |
| セグメント (短信・IR の名前の並び) | 電機部品事業・産業機器事業 | 電機部品事業・計測機器事業・産業機器事業 |

## 1. カードの導出 `deriveCards` (Sub-task #152)

### 1.1 形の定義 (欄の並び。**仕様** §1.3・§1.4。表示の細部は**決めた**)

| ID | 形・カード | 欄の key (上から) | 数字 | 文 | 枠の列見出し (`columnDates` の画面) |
| --- | --- | --- | --- | --- | --- |
| D1 | E1 | headline=営業利益の主張。`netSales`・`opPrev`・`opCur`・`margin` | 4 | 0 | incomeStatement |
| D2 | E2 | headline=売上高の主張。`salesPrev`・`salesCur` + 棒 `previous`・`current` | 2 + 棒 2 = 4 | 0 | incomeStatement |
| D3 | E3 | headline なし。`currentAssets`・`fixedAssets`・`totalAssets` | 3 | 0 | balanceSheet |
| D4 | H1 短信 | `salesPrev`・`salesCur`・`totalAssets`・`totalLiabNet` | 4 | 0 | incomeStatement |
| D5 | H1 IR | 数字 `netSales`、文 `claim` (slide = highlights で netSales の主張を持つ文) | 1 | 1 | (無し) |
| D6 | H2 短信 | 数字 `recvPrev`・`recvCur`・`recvChange`・`operatingCf`、文 `recvRow`・`policyChange`・`policyNote` | 4 | 3 | cashFlow |
| D7 | H2 IR | 文 `claim` (operatingCashFlow の主張を持つ文) | 0 | 1 | (無し) |
| D8 | H3 短信 | 数字 `cfStart`・`plStart`・`cash`・`cfEnd`、文 `auditNote`・`subsequent`・`segments` | 4 | 3 | cashFlow |
| D9 | H3 IR | 数字 `cashCur`・`cashPrev`・`debtPrev`・`netDebtPrev`、文 `subsequent`・`segments` | 4 | 2 | (無し) |

テスト: 形ごとに、カードの枚数・各カードの `doc`・欄の key の並び・`countNumbers`・`countTexts` が上の表のとおり (基準問題 A で)。`shapesOf('easy')` = `[E1,E2,E3]`。難易度の違う形 (やさしいの問題に `H1`) は `RangeError`。

### 1.2 値 (基準問題 A・B)

| ID | 入力 | 期待 |
| --- | --- | --- |
| D10 | A, E1 | 枠: 社名・証券コード・期は `tanshin.header` のとおり、`periodEnd` = `2027-03-31` (`columnDates.incomeStatement.current`)。headline `増益` (reads `ir.statements.0`)。欄の `text`: `12,400`・`1,120`・`1,240`・`10.0`、`unit`: `百万円`×3・`%`。`label`: `売上高`・`営業利益 (前期)`・`営業利益 (当期)`・`売上高営業利益率`。`reads` は規則どおりの 1 セル (§1.3 の表の「見せるセル」) |
| D11 | A, E2 | headline `増収`。`salesPrev`=`11,800` (前期)・`salesCur`=`12,400` (当期)。棒: `axisMin` 0、`previous` 11800・`current` 12400。棒の `reads` = `ir.results.chart.netSales.previous`・`…current`、棒の軸 `ir.results.chart.netSales.axisMin` も `cardCells` に入る。**軸の目盛りの数字は欄にも棒にも持たない** |
| D12 | B, E2 | 同じ形で、棒 `previous` 118.0・`current` 124.0 (IR の単位の値のまま)。欄 ①② は短信の百万円 `11,800`・`12,400` |
| D13 | A, E3 | `7,700`・`7,500`・`15,200`。ラベル `流動資産合計`・`固定資産合計`・`資産合計`。headline なし |
| D14 | A, H1 | 短信: `11,800`・`12,400`・`15,200`・`15,200`。IR: `12,400` (unit 百万円)・文 `売上高・営業利益ともに前期を上回った。` (reads `ir.statements.0`) |
| D15 | B, H1 | IR の数字 `124.0` (unit `億円`)。IR の金額は 1 桁の小数、短信は整数 |
| D16 | A, H2 | 短信: `2,900`・`3,000`・`△100`・`1,500`。文: `売掛金 (資産の部)`・`なし`・`該当事項はありません。`。IR: 文 `営業キャッシュ・フローは堅調であった。` (reads `ir.statements.2`) |
| D17 | A, H3 | 短信: `1,250`・`1,250`・`2,300`・`2,300`。ラベル `税金等調整前当期純利益 (CF)`・`税金等調整前当期純利益 (損益)`。文: 監査の注意書き (`決算短信は公認会計士又は監査法人の監査の対象外です`)・`該当事項はありません。`・`電機部品事業・産業機器事業` (名前を `・` で連ねる。reads は `tanshin.notes.segments.current.segments.<i>.name` の全部)。IR: `2,300`・`2,100`・`4,834`・`2,734`。ラベル `純有利子負債 (有利子負債 − 現金)`。文: `なし` (`outlook.subsequentEvent` が null のとき)・`電機部品事業・産業機器事業` |
| D18 | B, H3 | IR の数字 `23.0`・`21.0`・`48.3`・`27.3` (unit `億円`)。セグメントの文が 3 つの名前 |
| D19 | A に `outlook.subsequentEvent` = 文を入れる, H3 | IR の文 `期末後の出来事` の `text` がその文、`reads` = `ir.outlook.subsequentEvent` |
| D20 | 売上高が前期より減る問題 (A の当期と前期を入れ替え、主張を `down`) | E2 の headline `減収`、E1 は営業利益の主張が `down` なら `減益` |

### 1.3 書式 (**決めた**)

| ID | 入力 → 期待 |
| --- | --- |
| D21 | 数字の `text`: 百万円は整数に 3 桁区切り (`12400` → `12,400`)。0 は `0` |
| D22 | 負の数は `△` + 絶対値 (`-100` → `△100`)。`signOverrides` のキー (`<doc>.<path>`) がその欄のセルなら、記号を差し替える (`△` → `▲` で `▲100`) |
| D23 | 比率は小数第一位 (`10` → `10.0`)、`unit` は `%` |
| D24 | IR の金額は、`Company.irUnit` が億円なら小数第一位 (`124` → `124.0`、`27.3`)、百万円なら整数 |
| D25 | 桁区切りは 7 桁まで正しい (`1234567` → `1,234,567`)、小数つきでも整数部だけ区切る (`1234.5` → `1,234.5`) |

### 1.4 ラベルと差し替え (R-D2)

| ID | 入力 → 期待 |
| --- | --- |
| D26 | `labelOverrides['tanshin.incomeStatement.operatingIncome']` = `営業和益` → E1 の `opPrev`・`opCur` のラベルが `営業和益 (前期)`・`営業和益 (当期)` |
| D27 | `labelOverrides['tanshin.balanceSheet.receivables']` = `買掛金` → H2 の `recvRow` の `text` が `買掛金 (資産の部)`、`recvPrev`・`recvCur` のラベルも `買掛金 (前期末)`・`買掛金 (当期末)` |
| D28 | `unitOverrides['tanshin.incomeStatement']` = `億円` → その画面のセルを読む金額の欄 (E1 の売上高・営業利益) の `unit` が `億円`。ほかの欄 (比率 `%`、貸借のセル) は変わらない |
| D29 | 正常な問題 (`labelOverrides` なし) では、`unit` はどの金額欄も短信 `百万円`・IR は `header.unit` |

### 1.5 形のずれ `cardEdits` (§1.6)

| ID | `cardEdits` | 期待 (E1 で) |
| --- | --- | --- |
| D30 | `[{shape:'E1',card:0,slot:'margin',op:'drop'}]` | E1 の欄の key が `netSales`・`opPrev`・`opCur` の 3 つ。**E2・E3 は編集に影響されない** (編集は `shape` が同じ形でだけ効く) |
| D31 | `[{shape:'E1',card:0,op:'swap',slots:['netSales','margin']}]` | 欄の並びが `margin`・`opPrev`・`opCur`・`netSales` |
| D32 | `[{shape:'E1',card:0,slot:'netSales',op:'format',style:'no-comma'}]` | `netSales` の `text` = `12400` (`raw` は 12400 のまま) |
| D33 | 同じ `style:'comma-shift'` | `text` = `1,2400` (桁区切りを 1 桁ずらす。例: 96930 → `9,6930`) |
| D34 | `[{shape:'E1',card:0,slot:'netSales',op:'unit',unit:'億円'}]` | `netSales` の `unit` = `億円` (ほかの欄は `百万円`) |
| D35 | `[{shape:'E1',card:0,slot:'margin',op:'dup'}]` | `margin` が 2 回並ぶ (key `margin` が 2 つ。`opCur` の直後) |
| D36 | `[{shape:'E1',card:0,op:'headline',word:'増収'}]` | headline の `word` = `増収` (`reads` はそのまま) |
| D37 | 編集の `slot` が形に無い key、`card` が範囲外 | `deriveCards` は `RangeError` (データの誤りを黙って通さない) |
| D38 | むずかしい: `[{shape:'H2',card:1,...}]` の `card` = 1 は IR 型、0 は短信型 | `card` の番号どおりのカードの欄に効く |

### 1.6 見出し語 (R-D5)

| ID | 入力 → 期待 |
| --- | --- |
| D40 | E1: `ir.statements` に営業利益 `up` の主張 → `増益`、`down` → `減益`。E2: 売上高 `up` → `増収`、`down` → `減収` |
| D41 | 売上高と営業利益の主張が同じ 1 つの文に入っていても (`claims` が 2 つ)、metric で引き、`reads` はその文 `ir.statements.<N>` |
| D42 | 主張が無い問題 (statements を空にする) → headline は `undefined` (欄は出る。例外にしない)。見出し語の有無は検証器 (§2 の構造検査) が拾う |
| D43 | `direction: 'zero'` の主張は見出し語にしない (`netSales`・`operatingIncome` では起きない。起きても `増`・`減` にしない) |

### 1.7 純関数・性質

| ID | 性質 |
| --- | --- |
| D50 | 同じ入力 → 同じ出力 (`toEqual`)。2 回呼んでも同じ |
| D51 | 入力の問題・会社を書き換えない (呼ぶ前後で `structuredClone` と `toEqual`) |
| D52 | 乱数・時刻を見ない: `Math.random`・`Date.now` を例外を投げる関数に差し替えても呼べる |
| D53 | どの形でも、数字の数 ≤ 4 (やさしい) / 1 枚あたり 数字 ≤ 4・文 ≤ 3 (むずかしい)。**今の正常な問題 28 問すべて**で、全形について成り立つ (`src/data` を読む) |
| D54 | 全問・全形で、`slots[].reads` のセルがすべて問題に実在する (`getPath` が `undefined` でない。`itemKey` だけで `reads` が空の欄を除く) |
| D55 | `placeSlots`: A の E1 で、場所 `{doc:'tanshin', path:'summary.operatingMargin'}` → `margin` の欄、場所 `{doc:'tanshin', itemKey:'tanshin.incomeStatement.operatingIncome'}` → `opPrev`・`opCur`、`{doc:'ir', path:'statements.0.text'}` → headline (文章の異変 = 見出し語の欄。R-D3)、カードに無い場所 → 空 |

## 2. 検証器: カードの整合と構造 (Sub-task #153。受け入れ条件 6 の「正常のカードはどの形でも整合する」)

### 2.1 関係 `cardRelationIssues` (**仕様** §1.3・§1.4 の「関係」。値はカードの `raw` から独立に再計算する)

| ID | 形 | 関係 |
| --- | --- | --- |
| R1 | E1 | 見出し語の向き = sign(営業利益 当期 − 前期) / 営業利益率 = roundHalfAway(営業利益 当期 × 1000 ÷ 売上高) ÷ 10 (小数第一位) |
| R2 | E2 | 見出し語の向き = sign(売上高 当期 − 前期) / 棒 `axisMin` = 0 / 棒の値 = `toIrUnit(欄の売上高, 会社の irUnit)` (前期・当期とも) |
| R3 | E3 | 資産合計 = 流動資産合計 + 固定資産合計 |
| R4 | H1 | 資産合計 = 負債純資産合計 / IR の売上高 = `toIrUnit(短信の売上高 当期)` / 文の主張の向き (売上高) = sign(売上高 当期 − 前期) |
| R5 | H2 | 売上債権の増減 = −(当期末 − 前期末) / 会計方針の変更の有無 (なし/あり) と注記が合う (注記が `該当事項はありません。` ⇔ なし) / 売上債権の行は資産の部 (科目名が資産の科目) / IR の文の営業 CF の向き = sign(営業 CF) |
| R6 | H3 | CF の税引前利益 = 損益の税引前利益 / CF の期末残高 = 貸借の現金 / IR の現金 当期 = `toIrUnit(貸借の現金)` / 純有利子負債 前期 = 有利子負債 前期 − 現金 前期 (10 倍した整数で比べる) / 監査の注意書き = 標準の文 / 後発事象の有無 (短信 `該当事項はありません。` ⇔ IR `なし`) / セグメントの名前の並び (短信 = IR) |

テスト (各関係): 基準問題 A・B の導出したカードは空。関係ごとに、対応する `raw` (または `text`) を 1 つ書き換えたカードで、文が 1 件以上返り、**その関係の文だけ** (ほかの関係の文は増えない) であること。R1 の丸め: 営業利益 1,240 ÷ 売上高 12,400 = 10.0、売上高 96,930・営業利益 4,920 → 5.1 (4920 × 1000 ÷ 96930 = 50.76 → 51 → 5.1)、5.05 ちょうど (例: 売上高 2,000・営業利益 101 → 5.05 → 0.5 を遠い側へ 5.1)。

### 2.2 構造 `cardStructureIssues`・`cardTextLengthIssues`

| ID | 入力 → 期待 |
| --- | --- |
| C1 | 導出したカード (正常) → 空 |
| C2 | 欄を 1 つ削った・並びを替えた・同じ欄を足したカード → 文が 1 件以上 (形の定義との差) |
| C3 | 数字の欄を 5 つにしたカード (E1 に 1 つ足す)・文の欄を 4 つにしたカード (H2 短信に 1 つ足す) → 上限超えの文 |
| C4 | headline が無い E1・E2 → 文 (見出し語が出ていない) |
| C5 | 文欄の `text` が 40 字ちょうど → 空、41 字 → 1 件。数字の欄は長さを見ない。文字数は `[...text].length` (サロゲート対を 1 字) |
| C6 | **今の正常な問題**に当てると、`cardStructureIssues` は 0 件、`cardTextLengthIssues` は 40 字超の文欄がある問題だけ (**測った**: 正常な問題の文 18 件が 40 字超。うち、いずれかの形の欄に載るのは `src/data` を読んで数える。データの Task が直す) |

## 3. 検証器の規則 (形のずれ。問題に `cardEdits` が付くと落ちる)

規則は `verifyProblem` が全問に当てる (`cardEdits` が無い問題では常に満たす)。落ちたときの `paths` は、食い違った欄の `reads` (と `itemKey`)。1 つの異変は 1 つの編集 (G6)。

| ID | 規則 | 入力 → 期待 |
| --- | --- | --- |
| K1 | `card-slots` | `drop`・`dup`・`swap` の編集 → その形・そのカードで違反 1 件 (`paths` = 食い違った欄の `reads`。`swap` は入れ替えた 2 欄の `reads` を合わせる)。編集なし・`format`/`unit`/`headline` の編集 → 満たす |
| K2 | `card-unit` | `unit` の編集 (E1 の売上高を `億円`) → 違反 1 件 (`paths` = その欄の `reads`)。正常 (A・B) → 満たす。IR 型の金額は `header.unit`、短信型は `百万円`、比率は `%` が標準 |
| K3 | `card-format` | `format` の編集 (`12400`・`1,2400`) → 違反 1 件。標準の書式 (`12,400`・`△100`・`10.0`) → 満たす |
| K4 | `card-headline` | `headline` の編集 (E1 に `増収`) → 違反 1 件。E1 の語は営業利益の組 (増益・減益)、E2 は売上高の組 (増収・減収) 以外が出たら違反 |
| K5 | `card-period` | `columnDates.incomeStatement.current` を 1 年ずらす (`2028-03-31`) → E1 で違反 1 件、`paths` = `tanshin.columnDates.incomeStatement.current` と `tanshin.header.periodLabel`。ずらした画面を枠に持たない形 (E3 は balanceSheet の列) では満たす |
| K6 | `xdoc-seg-names` | IR のセグメントの名前の並びが短信の報告セグメントと違う (1 つ欠ける・並びが違う・綴りが違う) → 違反 1 件 (`paths` = 短信の名前のセル全部と IR の名前のセル全部)。正常 (A・B) → 満たす |
| K7 | 既存規則との共存 | 既存の正常な問題 28 問 (`src/data`) が、新しい規則 6 つすべてで違反 0 件 |
| K8 | 型 | `shapeErrors` が `cardEdits` の誤り (`op` が未知・`shape` が未知・`slots` が 2 要素でない・`style` が未知) を返す。正常な問題・`cardEdits` が 1 件の問題は誤りなし |
| K9 | `anomalyIssues` | 正常な問題に `cardEdits` → `override-on-normal`。異変の問題の `cardEdits` が 2 件以上 → `anomaly-mismatch` (1 つの異変は 1 つの編集)。編集の `shape` が問題の難易度の形でない・`slot` が形に無い・`card` が範囲外 → `anomaly-mismatch`。H-19 の既存問題 (IR のセグメントが欠ける) は `xdoc-seg-names` を含む `expectedRules` で通る |
| K10 | 系統 | `ANOMALY_FAMILIES` に `card-form`、`FAMILY_DIFFICULTY['card-form']` = `hard`。`PRIMARY_FAMILIES.hard` には入れない |

## 4. 見える条件 `visibleShapes` (R-S4。受け入れ条件 6 の「異変のカードには検出に要る数字か文が載る」)

V1 = `anomaly.places` の全セルが形のカードに載る (`cardCells`。文章の場所は入れ物の `reads` の子として載る。`itemKey` の場所は欄の `itemKey` が同じ)。V2 = `primaryRules` の 1 つが落とした違反の `paths` が全部、形のカードのセル (別名を含む) に載る。**別名** (正常では必ず等しい 2 つのセル): `ir.results.netSales.{previous,current}` = `tanshin.incomeStatement.{previous,current}.netSales` (§1.5)。`cardEdits` を持つ問題は、編集の `shape` の形だけで見え、その形で V1・V2 を満たすこと。

テストは、基準問題 A・B から異変を作って (`add`・`set` で書き換え、期待集合は実際に `verifyProblem` で出した規則に合わせる)、種類のダミー (`primaryRules` を指定) で試す。

| ID | 異変 (A から) | 期待する見える形 |
| --- | --- | --- |
| V1 | 営業利益率を 20.0 に (`ratio-operating-margin`。places = `summary.operatingMargin`) | `E1` だけ (売上高・営業利益 当期は E1 にだけ載る。E2・E3 には営業利益率が無い) |
| V2 | 資産合計を 10% 以上ずらす (`bs-total-assets`。places = `balanceSheet.current.totalAssets`) | `E3` だけ。やさしいで見える形は E3 だけ |
| V3 | 棒の当期を小さく描く (`results.chart.netSales.current`。`chart-bars`。paths = 棒のセルと `ir.results.netSales.current` (別名)) | `E2` だけ (別名で V2 を満たす) |
| V4 | 軸の下端を 0 でなくする (`chart-axis-zero`) | `E2` だけ |
| V5 | 売上高の主張の向きを逆に (`claims-direction`。places = `ir.statements.0.text`) | `E2` (売上高の前期・当期が載る)。E1 は売上高の前期が載らないので見えない |
| V6 | 営業利益の主張の向きを逆に | `E1` (営業利益の前期・当期が載る)。E2 は見えない |
| V7 | 科目名の誤字 (`labelOverrides` の営業利益。places = itemKey) | `E1` だけ (営業利益の欄がある形) |
| V8 | 売上高の桁をずらす (売上高 10 倍、営業利益率は再計算して整合。places = 売上高・営業利益率) | `E1` だけ (規則 `ratio-operating-margin` の 3 セルがすべて E1 に載る)。**places が E1 に載るセルだけであること** |
| V9 | むずかしい: 監査の注意書きを `監査済み` に (`audit-note`) | `H3` だけ |
| V10 | むずかしい: 売掛金の科目名 → `買掛金` (`account-section`。itemKey) | `H2` だけ |
| V11 | むずかしい: CF の最初の行をずらす (`link-cf-start`) | `H3` だけ |
| V12 | むずかしい: 貸借を 1 つずらす (`bs-balance`。paths = 資産合計・負債純資産合計) | `H1` だけ |
| V13 | むずかしい: IR の売上高を 10 倍 (`xdoc-hl-net-sales`。paths = 短信の売上高 当期と IR の `highlights.netSales.amount`) | `H1` だけ |
| V14 | むずかしい: CF の売上債権の増減をずらす (`link-cf-receivables`。paths = CF の増減と BS の前期末・当期末) | `H2` だけ |
| V15 | むずかしい: IR のセグメントが 1 つ欠ける (`xdoc-seg-names`) | `H3` だけ |
| V16 | **places が二次の症状を含む** (例: V14 で places に `cashEnding` も入れる。`cashEnding` は H2 のカードに載らない) | どの形でも見えない (空)。V1 が落ちる |
| V17 | places が 1 つも落ちた違反に触れない | 空 |
| V18 | `cardEdits` (E1 で `drop` の `margin`。`primaryRules` = `card-slots`。places = `summary.operatingMargin`) | `E1` だけ。同じ編集でも `shape: 'E2'` なら、E2 のカードに `margin` が無いので V1 が落ちて空 |
| V19 | 正常な問題 | 難易度の全形 (`[E1,E2,E3]` または `[H1,H2,H3]`) |
| V20 | 異変の種類が一覧に無い | 空 (種類が引けない問題は見えない扱い。`unknown-kind` は別の検査が拾う) |

実データでの性質 (**測った**。設計書 §1.7 と §2.6): 今の異変の問題のうち見える形を 1 つ以上持つのは、やさしい 13 問中 N 問・むずかしい 16 問中 M 問。**N・M は #153 で `src/data` に当てて測り、PR の本文に書く** (設計書の予想: places を書き直さずに V1 を当てると、むずかしいは 16 種類中 7 種類)。

## 5. データ全件 `verifyDataset` の追加 (R-S5。「形の出方が正常と異変でそろう」)

追加の検査はすべて `Entry` で、**`shortfalls`** に入れる (コードは `card-` で始める)。理由 (**決めた**): 今のデータは第 1 版で作ったので、これらを満たさない (§4 のとおり places を書き直す前提)。`errors` にすると CI が全部赤になる。データの Task (#139・#140) が直して、`--require-cards` で致命にする (下の §6)。ただし、構造の誤り (正常な問題の `cardStructureIssues`・正常な問題の `cardRelationIssues`・`cardEdits` の誤り) は**第 1 版のデータでも成り立つので `errors`** (コード `card-structure`・`card-relation`・`shape`・`override-on-normal`・`anomaly-mismatch`)。

| ID | コード | 条件 (難易度ごと。形ごとは `shapesOf` の 3 形) |
| --- | --- | --- |
| S1 | `card-structure` (errors) | 正常な問題 × 難易度の全形で、`cardStructureIssues` ≠ 空 |
| S2 | `card-relation` (errors) | 正常な問題 × 全形で、`cardRelationIssues` ≠ 空 |
| S3 | `card-text-length` | 正常な問題 × 全形で、`cardTextLengthIssues` ≠ 空 (問題ごとに 1 件) |
| S4 | `card-invisible` | 異変の問題で、`visibleShapes` が空 (問題ごとに 1 件。メッセージに V1・V2 のどちらが落ちたかを書く) |
| S5 | `card-shape-companies` (R-S5 (a)) | ある形で、その形で見える異変の問題を持つ会社が 8 社 (`ROUNDS_TO_CLEAR`) 未満 |
| S6 | `card-shape-both-sided` (R-S5 (b)) | 難易度の会社 (`companies.json` 全社) の中に、ある形で「正常な問題」か「その形で見える異変の問題」を持たない会社がある (会社と形を列挙して 1 件にまとめる) |
| S7 | `card-shape-kinds` (R-S5 (c)) | ある形で見える異変の種類が 4 種類未満 |
| S8 | `card-company-period` (R-S5 (d)) | プールにある (会社, 期) に、正常な問題か、ある形で見える異変の問題が無い (組と形を列挙して 1 件にまとめる) |
| S9 | `anomaly-ratio` の廃止 (R-S5 (e)) | 既存の `anomaly-ratio` の shortfall は出さない (問題数の比が 0.5 から離れても、`shortfalls` に入らない) |
| S10 | 既存の維持 | `pool-size`・`both-sided-companies`・`family-balance` は今のまま。`stats` の形も変えない |

テスト: 小さな合成のデータ (会社 2〜3 社・問題 数件を、基準問題 A から作る) で、各コードが条件どおり出る・出ない (境界: S5 は 7 社 → 出る、8 社 → 出ない。S7 は 3 種類 → 出る、4 種類 → 出ない。S3 は 40 字 → 出ない、41 字 → 出る)。実データ (`src/data`) には、`errors` が 0 件のまま (`card-structure`・`card-relation` を含む)、shortfalls に `card-*` が出ることを確かめる (測った件数を PR に書く)。

## 6. CLI と CI

| ID | 入力 → 期待 |
| --- | --- |
| L1 | `npm run verify:data -- --require-complete` は、今のデータで終了コード 0 (errors が無い。`card-*` の shortfalls は警告として出る) |
| L2 | `--require-cards` を付けると、`card-*` の shortfalls が致命 (今のデータでは終了コード 1)。`--require-cards=easy`・`--require-cards=hard` はその難易度の `card-*` だけ致命。値が easy・hard 以外なら終了コード 2 |
| L3 | `card-*` の shortfalls は `--require-complete` の致命に**数えない** (`--require-cards` が別に決める)。`pool-size` などは今のまま `--require-complete` で致命 |
| L4 | `.github/workflows/ci.yml` の `check` ジョブが、`npm run verify:data -- --require-complete` で `card-*` の警告を出す。**データの Task (#139・#140) の完了時に `--require-cards=easy`・`--require-cards=hard` を足す** (ci.yml のコメントに書く) |
| L5 | 新しいテストは `npm test` に含まれ、`src/ci.test.ts` (ci.yml の内容の検査) が `--require-complete` の行が残ることを確かめる |

## 7. この Task でやらないこと (範囲の外。理由つき)

| 事柄 | 理由 | 担当 |
| --- | --- | --- |
| R-S6 (1 万周の出題で形の出方が 1/3 ±1.5 ポイント) | `draw` の v2 (枠ごとに形を引く) が前提。`draw`・`game`・`session` の作り直しは画面の Task (#141) | #141 |
| §2.7 の「ずれが最小以上」(`checkAnomaly` の閾値) | 異変の問題を作るときの基準で、問題データがそろってから種類ごとに決める | #139・#140 |
| 新しい異変の種類 (E-18〜E-23・H-29〜H-32) を `anomaly-kinds.json` に足す・既存の種類の `primaryRules` を v2 の規則に直す (H-19 を除く) | 種類の文言 (名前・tip・答え合わせ) と `primaryRules` はデータの作り方と一体 | #139・#140 |
| 40 字を超える文のデータ修正 | データの Task が直す (設計書 §1.1) | #139・#140 |
| UI | 作り直しは impeccable の仕事 | #141 |
