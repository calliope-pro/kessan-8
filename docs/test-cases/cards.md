# ケース表: カードの導出と検証器の拡張 (Sub-task #151)

Task #138 (受け入れ条件 6)。根拠: [design-v2.md](../design-v2.md) §1 (カード)・§2 (台帳)・§2.7・[requirements.md](../requirements.md) 受け入れ条件 5・6・[charter.md](../charter.md) (single source of truth・テスト容易性)。この表のあと、テスト (#152・#153) をレッドで書き、グリーンにする。

印: **仕様** (design-v2.md にある) / **決めた** (この表で決めた。設計書の細部を埋めたもの。監視役のレビューで変えてよい) / **測った** (コマンドの結果)。

**追記 (#153 着手時。設計 v2 の #154 の直しを取り込んだ)**: design-v2.md §2.8 (`Anomaly.base`・`changed`・カード上の場所・許容集合・二重の食い違いの禁止) が #151 の合意のあとに入った (責任者の知らせ「E-02・E-09・E-18 の定義が変わる。決め打ちせず、直った設計に合わせる」)。**§9 を新設**し、§0・§3 (K1〜K4 の `paths`)・§4 (V18〜)・§8 (M1・M2)・§5 (S12〜S14) を直した。直した所は「**§2.8**」と書く。E-02・E-09・E-18・E-03・E-04 の種類ごとの `primaryRules` の変更は決め打ちせず (データの Task が `anomaly-kinds.json` に書く)、検証器は**種類によらない仕組み** (`changed`・`card-*` の規則・場所の形) だけを持つ。

## 0. 公開する入口 (テストが外から呼ぶもの)

内部の関数名には依らず、次の入口の入力と出力だけでテストする。

| 入口 | 入力 → 出力 |
| --- | --- |
| `SHAPE_IDS`・`shapesOf(difficulty)`・`difficultyOfShape(shape)` (`src/domain/cards.ts`) | 形の ID の一覧 `E1 E2 E3 H1 H2 H3` / やさしい → `[E1,E2,E3]`、むずかしい → `[H1,H2,H3]` / 形 → 難易度 |
| `deriveCards(problem, company, shape, options?)` | 問題・会社・形 → `Card[]` (やさしい = 1 枚、むずかしい = [短信型, IR 型])。**純関数**。形の難易度が問題の難易度と違えば `RangeError`。`options.applyEdits` は既定 `true`。`false` なら `cardEdits` を無視して形のとおりのカード (**テンプレートのカード**) を返す。見える条件 (§4) と答え合わせの場所 (`placeSlots`) は、`cardEdits` を持つ問題ではこのテンプレートのカードで判定する (`drop` は欄が無くなるので、編集後のカードでは場所を示せない。遊び手にはテンプレートの位置の「欠け」を示す) |
| `Card` | `{ doc: 'summary'｜'tanshin'｜'ir'; frame: { companyName, securitiesCode, periodLabel, periodEnd? }; headline?: { word, reads }; slots: CardSlot[]; bars?: { axisMin, axisReads, items: [{ key: 'previous'｜'current', value, reads }] }; aliases: { cell, of }[] }`。`aliases` = 別名 (§4。E2 だけが持つ: `ir.results.netSales.*` は短信の売上高の欄が見せているとみなす。正常では必ず等しいので) |
| `CardSlot` | `{ key; kind: 'number'｜'text'; itemKey; label; text; unit; raw; reads }`。`text` = 画面に出す文字列 (数字は桁区切り・符号つき、文欄は文)。`raw` = 元のセルの値 (数字欄は number、文欄は string)。`unit` = 単位の語 (金額は `百万円`/`億円`、比率は `%`、文欄は空)。`reads` = その欄が読むセル `<doc>.<path>` |
| `countNumbers(card)`・`countTexts(card)` | 枠の外を除いた数字の数 (棒 1 本も 1 つ)・文欄の数 |
| `cardCells(cards)` | 見えるセルの集合 = 全欄の `reads` + 全欄の `itemKey` + 枠のセル (`<doc>.header.companyName・securitiesCode・periodLabel`、`tanshin.columnDates.<画面>.current`) + 棒の `reads` |
| `placeSlots(cards, place)` | 異変の場所 (`AnomalyPlace`) → その場所を見せる欄 `{ card, key }[]` (R-D3。`cardEdits` の問題には `applyEdits: false` のカードを渡す)。パスの場所は `reads` が場所と同じか場所の親 (入れ物)、`itemKey` の場所は `Slot.itemKey` が同じ欄 |
| `cardRelationIssues(cards, shape, { company, statements })` (`src/verifier/cards.ts`) | 導出したカード・会社 (IR の単位の換算)・IR の文章 (主張の向きを引く) → 関係の食い違いの文の配列 (空 = 整合)。R4・R5 が文の主張 (`claims`) を、R2・R4・R6 が `irUnit` を使うので、第 3 引数で渡す (**決めた**。ケース表の最初の版は引数 2 つだった) |
| `cardStructureIssues(cards, shape)` | カード → 欄の並びが形の定義と違う、数字・文の数が上限 (やさしい 数字 4 / むずかしい 1 枚 数字 4 + 文 3) を超える、の文の配列 |
| `cardTextLengthIssues(cards)` | 文欄の `text` が 40 字を超える欄の文の配列 |
| `shapeChecks(problem, company, kinds)` | 異変の問題 → 難易度の形ごとの `{ shape, missingPlaces, v2 }` (V1 を満たさない場所・V2 を満たすか)。`card-invisible` のメッセージを作る |
| `visibleShapes(problem, company, kinds)` | 異変の問題 → V1・V2 (R-S4) を満たす形の ID の配列 (`cardEdits` があれば、編集の `shape` の形だけを、テンプレートのカードで判定)。正常な問題 → 難易度の全形 |
| `deviationIssues(problem, company)` (§2.7。種類は `problem.anomaly.kind` で引く) | 異変の問題 → 種類ごとの「道具なしで気づける最小のずれ」(§8) を満たさない文の配列 (空 = 満たす、または検査の無い種類) |
| `verifyDataset` の追加 | 下の §5 |
| 規則 (`HARD_RULE_IDS` に足す。`verifyProblem` は形の引数を持たないので、どの規則も形によらず問題だけを見る) | `card-slots`・`card-unit`・`card-format`・`card-headline`・`card-period`・`xdoc-seg-names` |
| 型 (`types.ts` と docs/design.md §4.2 の写し) | `ShapeId`・`CardEdit`・`Problem.cardEdits?`・`ANOMALY_FAMILIES` に `card-form` (むずかしい) (#152 で済み)。**§2.8**: `Anomaly.base?: string`・`Anomaly.changed?: string[]` (**決めた**: 今のデータが持たないので任意。無い問題は shortfalls `card-anomaly-base` で、データの Task が足す)、`AnomalyPlace` に `{ doc: 'card'; shape: ShapeId; card: number; slot: string }` を足す。`Card` に `shape: ShapeId` を足す (カードのセル `card.<shape>.<card>.<slot>` を作るため) |
| `doubleDiscrepancies(problem, company, kinds)` | **§2.8** 異変の問題 → 見える形ごとの、種類の `primaryRules` の外で「カードに収まる」違反の規則の一覧 `{ shape, rules }[]` (空 = カードの上の食い違いは 1 つだけ) |

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
| D17 | A, H3 | 短信: `1,250`・`1,250`・`2,300`・`2,300`。ラベル `税金等調整前当期純利益 (CF)`・`税金等調整前当期純利益 (損益)`。文: 監査の注意書き (`決算短信は公認会計士又は監査法人の監査の対象外です`)・`該当事項はありません。`・`電機部品事業・産業機器事業` (名前を `・` で連ねる。reads は `tanshin.notes.segments.current.segments.<i>.name` の全部)。IR: `2,300`・`2,100`・`4,834`・`2,734`。ラベル `純有利子負債 (前期・有利子負債 − 現金)` (純有利子負債は前期の値なので、時期の語を入れる。入れないと、時期の無い科目を当期と読んで 有利子負債 − 現金 が合わないと思い、正常なカードに異変ありと答える。#152 レビュー B1)。文: `なし` (`outlook.subsequentEvent` が null のとき)・`電機部品事業・産業機器事業` |
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
| D33 | 同じ `style:'comma-shift'` | `text` = `1,2400` (最後の 4 桁を 1 組にして、その前を 3 桁区切りにする。例: 96930 → `9,6930`、1234567 → `123,4567`)。整数部が 5 桁未満の数 (1,234 など) には効かせられないので `RangeError` (**決めた**。実装で足した: 黙って無視すると、検証器が違反を見つけられない異変の問題ができる) |
| D34 | `[{shape:'E1',card:0,slot:'netSales',op:'unit',unit:'億円'}]` | `netSales` の `unit` = `億円` (ほかの欄は `百万円`) |
| D35 | `[{shape:'E1',card:0,slot:'margin',op:'dup'}]` | `margin` が 2 回並ぶ (key `margin` が 2 つ。`opCur` の直後) |
| D36 | `[{shape:'E1',card:0,op:'headline',word:'増収'}]` | headline の `word` = `増収` (`reads` はそのまま) |
| D37 | 編集の `slot` が形に無い key、`card` が範囲外、見出し語の無い形 (E3・H1〜H3) への `headline` | `deriveCards` は `RangeError` (データの誤りを黙って通さない) |
| D39 | `applyEdits: false` | D30〜D36 の問題でも、`cardEdits` の無い同じ問題の `deriveCards` と `toEqual`。`applyEdits` を省くと編集が効く (D30〜D36 の結果) |
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
| D56 | 場所が入れ物 | `placeSlots` は、場所が欄の `reads` の親 (入れ物) のときも、その下を読む欄を拾う (H-19 の今の問題 hard-003 の places は `ir.segments.items`。H3 → `{card:1,key:'segments'}`)。下のセルが載らない形 (H1) では空。`placeVisible(cells, key)` も同じ決まり (§4 の V1 が使う)。#152 レビュー N1 |
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
| C6 | **今の正常な問題**に当てると、`cardStructureIssues` は 0 件、`cardTextLengthIssues` は S3 の 7 問・10 欄だけ (**測った**: 正常な問題の文 18 件が 40 字超、うちカードの欄に載るのが 10 欄。ほか 8 件はカードに載らない文 (やさしいの statements・むずかしいの outlook の文など)。データの Task が直す) |

## 3. 検証器の規則 (形のずれ。問題に `cardEdits` が付くと落ちる)

規則は `verifyProblem` が全問に当てる (`cardEdits` が無い問題では常に満たす)。**§2.8**: 落ちたときの `paths` は、食い違った欄の場所を **`card.<shape>.<card>.<slot>`** の形で返す (例 `card.E1.0.margin`。見出し語は slot = `headline`)。`AnomalyPlace` の `{ doc: 'card', shape, card, slot }` の場所の key も同じ文字列で、`touches`・V1・V2 は今のパスの照合に乗る。`cardCells` は全カードの全欄の `card.<shape>.<card>.<slot>` (と見出し語の `…headline`) を含む。1 つの異変は 1 つの編集 (G6)。

| ID | 規則 | 入力 → 期待 |
| --- | --- | --- |
| K1 | `card-slots` | `drop`・`dup`・`swap` の編集 → その形・そのカードで違反 1 件 (`paths`: drop = 欠けた欄 `card.E1.0.margin` (欠けた位置は、テンプレートのカードのその key の位置)・dup = 重複した欄・swap = 入れ替えた 2 欄)。編集なし・`format`/`unit`/`headline` の編集 → 満たす |
| K2 | `card-unit` | `unit` の編集 (E1 の売上高を `億円`) → 違反 1 件 (`paths` = `card.E1.0.netSales`)。正常 (A・B) → 満たす。**標準の単位 = 比率は `%`、金額はその資料の `header.unit`** (`header.unit` そのものの誤りは `header-unit`、`unitOverrides` (第 1 版の画面ごとの単位の差し替え) は `unit-consistency` の仕事で、`card-unit` は `cardEdits` の `unit` だけを見る。第 1 版の E-03 が `card-unit` で二重に落ちて期待集合が変わらないようにする。実装で決めた) |
| K3 | `card-format` | `format` の編集 (`12400`・`1,2400`) → 違反 1 件 (`paths` = `card.E1.0.netSales`)。標準の書式 (`12,400`・`△100`・`10.0`) → 満たす |
| K4 | `card-headline` | `headline` の編集 (E1 に `増収`) → 違反 1 件 (`paths` = `card.E1.0.headline`)。E1 の語は営業利益の組 (増益・減益)、E2 は売上高の組 (増収・減収) 以外が出たら違反 |
| K5 | `card-period` | 形によらず、3 画面 (`balanceSheet`・`incomeStatement`・`cashFlow`) の `columnDates.<画面>.current` が、**カードの枠の期 `header.periodLabel` (`2027年3月期`) から作った期末日** (`2027-03-31`) と合うか (**決めた**: 期の表記と列見出しの照合なので `periodLabel` から作る。`fiscalYear` から作ると、`fiscalYear` だけが違う問題で `header-period-label` と同時に落ち、第 1 版の N2・N5 の期待が変わる)。`columnDates.incomeStatement.current` を `2028-03-31` にする → 違反 1 件、`paths` = `tanshin.columnDates.incomeStatement.current` と `tanshin.header.periodLabel` (どちらも枠のセル)。3 画面とも直すと 3 件。正常 (A・B) → 満たす。**見える形は §4 の V 表** (incomeStatement の列を枠に持つ形だけ) |
| K6 | `xdoc-seg-names` | IR のセグメントの名前の並びが短信の報告セグメントと違う (1 つ欠ける・並びが違う・綴りが違う) → 違反 1 件 (`paths` = 短信の名前のセル全部と IR の名前のセル全部)。正常 (A・B) → 満たす |
| K7 | 既存規則との共存 | 既存の正常な問題 28 問 (`src/data`) が、新しい規則 6 つすべてで違反 0 件 |
| K8 | 型 | `shapeErrors` が `cardEdits` の誤り (`op` が未知・`shape` が未知・`slots` が 2 要素でない・`style` が未知) を返す。正常な問題・`cardEdits` が 1 件の問題は誤りなし |
| K9 | `anomalyIssues` | 正常な問題に `cardEdits` → `override-on-normal`。異変の問題の `cardEdits` が 2 件以上 → `anomaly-mismatch` (1 つの異変は 1 つの編集)。編集の `shape` が問題の難易度の形でない・`slot` が形に無い・`card` が範囲外 → `anomaly-mismatch`。H-19 の既存問題 (IR のセグメントが欠ける) は `xdoc-seg-names` を含む `expectedRules` で通る |
| K10 | 系統 | `ANOMALY_FAMILIES` に `card-form`、`FAMILY_DIFFICULTY['card-form']` = `hard`。`PRIMARY_FAMILIES.hard` には入れない |

## 4. 見える条件 `visibleShapes` (R-S4。受け入れ条件 6 の「異変のカードには検出に要る数字か文が載る」)

V1 = `anomaly.places` の全セルが形のカードに載る (`cardCells`。文章の場所は入れ物の `reads` の子として載る。`itemKey` の場所は欄の `itemKey` が同じ)。V2 = `primaryRules` の 1 つが落とした違反の `paths` が全部、形のカードのセル (別名を含む) に載る。**別名** (正常では必ず等しい 2 つのセル): `ir.results.netSales.{previous,current}` = `tanshin.incomeStatement.{previous,current}.netSales` (§1.5)。`cardEdits` を持つ問題は、編集の `shape` の形だけで見え、**その形のテンプレートのカード** (`applyEdits: false`) で V1・V2 を満たすこと (編集の `slot` がその形に無ければ見えない)。

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
| V8 | 売上高 当期を 10 倍 (124,000。営業利益 1,240 と営業利益率 10.0 は**変えない**ので比が合わない。`primaryRules` = `ratio-operating-margin`。places = `incomeStatement.current.netSales`) | `E1` だけ (規則の 3 セル = 売上高 当期・営業利益 当期・営業利益率がすべて E1 に載る。E2 は営業利益が無い)。places に営業利益率を足しても E1 のセルなので結果は同じ (`summary.operatingMargin` も places に入れた版も `E1`) |
| V8b | 流動資産合計を 10 倍 (`primaryRules` = `bs-total-assets`。paths = 流動資産合計・固定資産合計・資産合計。places = 流動資産合計) | `E3` だけ (E-02 の E3 版) |
| V9 | むずかしい: 監査の注意書きを `監査済み` に (`audit-note`) | `H3` だけ |
| V10 | むずかしい: 売掛金の科目名 → `買掛金` (`account-section`。itemKey) | `H2` だけ |
| V11 | むずかしい: CF の最初の行をずらす (`link-cf-start`) | `H3` だけ |
| V12 | むずかしい: 貸借を 1 つずらす (`bs-balance`。paths = 資産合計・負債純資産合計) | `H1` だけ |
| V13 | むずかしい: IR の売上高を 10 倍 (`xdoc-hl-net-sales`。paths = 短信の売上高 当期と IR の `highlights.netSales.amount`) | `H1` だけ |
| V14 | むずかしい: CF の売上債権の増減をずらす (`link-cf-receivables`。paths = CF の増減と BS の前期末・当期末) | `H2` だけ |
| V15 | むずかしい: IR のセグメントが 1 つ欠ける (`xdoc-seg-names`) | `H3` だけ |
| V16 | **places が二次の症状を含む** (例: V14 で places に `cashEnding` も入れる。`cashEnding` は H2 のカードに載らない) | どの形でも見えない (空)。V1 が落ちる |
| V17 | places が 1 つも落ちた違反に触れない | 空 |
| V18 | `cardEdits` (E1 で `drop` の `margin`。`primaryRules` = `card-slots`。**§2.8**: places = `{doc:'card',shape:'E1',card:0,slot:'margin'}`) | `E1` だけ。判定は**テンプレートのカード**で行う (編集後のカードには `margin` が無いので、編集後で判定すると V1・V2 とも落ちて E-19・H-31 がすべて見えなくなる。B1)。`placeSlots(テンプレートのカード, place)` = `[{card:0,key:'margin'}]` (card の場所は欄の key で引く。drop は欠けた位置) |
| V18b | `cardEdits` の `shape: 'E2'`・`slot: 'margin'` (E2 に無い欄) | `visibleShapes` は空 (K9 の `anomaly-mismatch` も別に出る)。V1 は「編集の shape = 枠の形」かつ場所の欄が形にあること |
| V18e | **§2.8** `itemKey` の場所 (E-05・H-28・H-30): 営業利益の誤字 (`labelOverrides`。places = `{itemKey:'tanshin.incomeStatement.operatingIncome'}`) | `E1` だけ (同じ itemKey の欄がある形。E3 には営業利益の欄が無いので出さない) |
| V18c | `cardEdits` の `swap` (E1 の `netSales`・`margin`。`card-slots`。places = 売上高 当期・営業利益率) | `E1` だけ。`dup`・`unit`・`format`・`headline` の編集も、それぞれの形のテンプレートで同じ (`card-unit` の paths = その欄の `reads`) |
| V18d | `columnDates.incomeStatement.current` をずらす (`card-period`。paths = `tanshin.columnDates.incomeStatement.current`・`tanshin.header.periodLabel`。places = 同じ 2 セル) | `E1`・`E2` (incomeStatement の列を枠に持つ形)。E3 は balanceSheet の列なので載らず見えない |
| V19 | 正常な問題 | 難易度の全形 (`[E1,E2,E3]` または `[H1,H2,H3]`) |
| V20 | 異変の種類が一覧に無い | 空 (種類が引けない問題は見えない扱い。`unknown-kind` は別の検査が拾う) |
| V21 | むずかしい: CF の期末残高をずらす (H-04。`link-cf-cash-end`。paths = CF の期末残高・貸借の現金 当期) | `H3` だけ |
| V22 | むずかしい: IR の純有利子負債 **前期**をずらす (H-20。`ir-supp-net-debt`。paths = 純有利子負債・有利子負債・現金の前期) | `H3` だけ。**当期**の純有利子負債をずらすと、H3 の IR 型には当期の有利子負債・純有利子負債が載らない (現金 当期だけ) ので空 |
| V23 | むずかしい: 売上高の主張の向きを逆に (H-21 の H1。`claims-direction`。paths = 売上高 前期・当期と `ir.statements.0`) | `H1` だけ |
| V24 | むずかしい: 営業 CF の主張の向きを逆に (H-21 の H2。`claims-direction`。paths = 営業 CF と `ir.statements.2`) | `H2` だけ |
| V25 | むずかしい: 会計方針の変更を「あり」にして注記は `該当事項はありません。` のまま (H-23。`accounting-policy-match`) | `H2` だけ |
| V26 | むずかしい: 短信の後発事象に文を入れ、IR の期末後の出来事は null のまま (H-24。`subsequent-event-match`。paths = 短信の後発事象・IR の期末後の出来事) | `H3` だけ |
| V27 | むずかしい: IR の現金 当期を短信と違う値に (H-13 の H3 側。`xdoc-supp-cash`。paths = 貸借の現金 当期・IR の現金 当期) | `H3` だけ。IR の現金 **前期**をずらすと、短信の前期の現金が H3 のカードに載らないので空 |

実データでの性質 (**測った**。設計書 §1.7 と §2.6): 今の異変の問題のうち見える形を 1 つ以上持つのは、やさしい 13 問中 N 問・むずかしい 16 問中 M 問。**N・M は #153 で `src/data` に当てて測り、PR の本文に書く** (設計書の予想: places を書き直さずに V1 を当てると、むずかしいは 16 種類中 7 種類)。

## 5. データ全件 `verifyDataset` の追加 (R-S5。「形の出方が正常と異変でそろう」)

追加の検査はすべて `Entry` で、**`shortfalls`** に入れる (コードは `card-` で始める)。理由 (**決めた**): 今のデータは第 1 版で作ったので、これらを満たさない (§4 のとおり places を書き直す前提)。`errors` にすると CI が全部赤になる。データの Task (#139・#140) が直して、`--require-cards` で致命にする (下の §6)。ただし、構造の誤り (正常な問題の `cardStructureIssues`・正常な問題の `cardRelationIssues`・`cardEdits` の誤り) は**第 1 版のデータでも成り立つので `errors`** (コード `card-structure`・`card-relation`・`shape`・`override-on-normal`・`anomaly-mismatch`)。

| ID | コード | 条件 (難易度ごと。形ごとは `shapesOf` の 3 形) |
| --- | --- | --- |
| S1 | `card-structure` (errors) | 正常な問題 × 難易度の全形で、`cardStructureIssues` ≠ 空 |
| S2 | `card-relation` (errors) | 正常な問題 × 全形で、`cardRelationIssues` ≠ 空 |
| S3 | `card-text-length` | 正常な問題 × 全形で、`cardTextLengthIssues` ≠ 空 (問題ごとに 1 件)。**実データでの期待 (測った。監視役と私の数が一致)**: やさしい 0 件 (文欄が無い)、むずかしい 7 問・10 欄: hard-009 (IR 主張 41)・hard-023 (方針注記 56)・hard-024 (後発事象 47・IR 後発 47)・hard-026 (IR 主張 62)・hard-030 (IR 主張 41)・hard-031 (方針注記 56)・hard-032 (後発事象 49・IR 後発 49・IR 主張 70) |
| S4 | `card-invisible` | 異変の問題で、`visibleShapes` が空 (問題ごとに 1 件。メッセージに V1・V2 のどちらが落ちたかを書く) |
| S5 | `card-shape-companies` (R-S5 (a)) | ある形で、その形で見える異変の問題を持つ会社が 8 社 (`ROUNDS_TO_CLEAR`) 未満 |
| S6 | `card-shape-both-sided` (R-S5 (b)) | 難易度の会社 (`companies.json` 全社) の中に、ある形で「正常な問題」か「その形で見える異変の問題」を持たない会社がある (会社と形を列挙して 1 件にまとめる) |
| S7 | `card-shape-kinds` (R-S5 (c)) | ある形で見える異変の種類が 4 種類未満 |
| S8 | `card-company-period` (R-S5 (d)) | プールにある (会社, 期) に、正常な問題か、ある形で見える異変の問題が無い (組と形を列挙して 1 件にまとめる) |
| S9 | `anomaly-ratio` の廃止 (R-S5 (e)) | 既存の `anomaly-ratio` の shortfall は出さない (問題数の比が 0.5 から離れても、`shortfalls` に入らない) |
| S12 | **§2.8** `changed` が基との差と違う (errors) | `anomaly.changed` と、`anomaly.base` の正常な問題との実際の差 (`tanshin`・`ir` の全セルの違い。`<doc>.<path>` の集合) が一致しない。`anomaly-changed-mismatch`。`labelOverrides`・`unitOverrides`・`signOverrides`・`cardEdits` の異変は、セルの差が無いので `changed: []` |
| S13 | **§2.8** `base` の誤り (errors) | `base` の問題が無い・正常でない・`companyId` か `header.periodLabel` が違う・自分自身。`anomaly-base` |
| S14 | **§2.8** `base`・`changed` が無い異変の問題 (shortfalls) | `card-anomaly-base` (問題ごと。データの Task が足す) |
| S15 | **§2.8** `card-double-discrepancy` (shortfalls) | `doubleDiscrepancies` が空でない異変の問題 (問題ごとに 1 件。形と規則を書く) |
| S11 | `anomaly-min-deviation` (§2.7) | 異変の問題で `deviationIssues` ≠ 空 (問題ごとに 1 件。§8) |
| S10 | 既存の維持 | `pool-size`・`both-sided-companies`・`family-balance` は今のまま。`stats` の形も変えない |

テスト: 小さな合成のデータ (会社 2〜3 社・問題 数件を、基準問題 A から作る) で、各コードが条件どおり出る・出ない (境界: S5 は 7 社 → 出る、8 社 → 出ない。S7 は 3 種類 → 出る、4 種類 → 出ない。S3 は 40 字 → 出ない、41 字 → 出る)。実データ (`src/data`) には、`errors` が 0 件のまま (`card-structure`・`card-relation` を含む)、shortfalls に `card-*` が出ることを確かめる (測った件数を PR に書く)。

## 6. CLI と CI

| ID | 入力 → 期待 |
| --- | --- |
| L1 | `npm run verify:data -- --require-complete` は、今のデータで終了コード 0 (errors が無い。`card-*` の shortfalls は警告として出る) |
| L2 | `--require-cards` を付けると、`card-*` の shortfalls が致命 (今のデータでは終了コード 1)。`--require-cards=easy`・`--require-cards=hard` はその難易度の `card-*` だけ致命。値が easy・hard 以外なら終了コード 2 |
| L3 | `card-*` と `anomaly-min-deviation` の shortfalls は `--require-complete` の致命に**数えない** (`--require-cards` が別に決める。`anomaly-min-deviation` は `--require-cards` の対象に入れる)。`pool-size` などは今のまま `--require-complete` で致命 |
| L4 | `.github/workflows/ci.yml` の `check` ジョブが、`npm run verify:data -- --require-complete` で `card-*`・`anomaly-min-deviation` の警告を出す。**責任者が #139・#140 の受け入れ条件に『CI に `--require-cards=easy` / `=hard` を足して終了コード 0』を入れた (技術責任者の決定、#151 の確認)**。ci.yml のコメントにそのことを書く |
| L5 | 新しいテストは `npm test` に含まれ、`src/ci.test.ts` (ci.yml の内容の検査) が `--require-complete` の行が残ることを確かめる |

## 7. この Task でやらないこと (範囲の外。理由つき)

| 事柄 | 理由 | 担当 |
| --- | --- | --- |
| R-S6 (1 万周の出題で形の出方が 1/3 ±1.5 ポイント、異変の枠の割合 0.5 ±1.5 ポイント) と、domain v2 (`game`・`draw`・`session`・`records`・`sample`。設計書 §3.3 の『直す』) | `draw` の v2 (枠ごとに形を引く) が前提。技術責任者の決定 (#151 の確認): **新しい Task #155 (出題と状態遷移 v2) が持つ**。PR に記録する | #155 |
| 新しい異変の種類 (E-18〜E-23・H-29〜H-32) を `anomaly-kinds.json` に足す・既存の種類の `primaryRules` を v2 の規則に直す (H-19 を除く) | 種類の文言 (名前・tip・答え合わせ) と `primaryRules` はデータの作り方と一体 | #139・#140 |
| 40 字を超える文のデータ修正 | データの Task が直す (設計書 §1.1) | #139・#140 |
| UI | 作り直しは impeccable の仕事 | #141 |

## 8. 道具なしで気づける最小のずれ `deviationIssues` (§2.7。Sub-task #153。技術責任者が #138 に入れてよいと決めた)

設計書 §2.7 の表のうち、**問題の値だけから「ずれ」を計算できる種類**に、関数を 1 つずつ持つ。元の値が問題に残らない種類 (E-02・H-17 の「10 倍か 1/10」・向きの逆・綴りなど「見るだけ」の種類、H-01・H-03・H-04・H-13 の G3 のまま) は検査しない (`deviationIssues` は空を返す)。種類の ID はコードの表のキー。値は整数 (百万円)・10 倍した整数 (IR の億円・比率の小数第一位) で比べる。**図の値の 2/3・1.5 倍・10%・2 倍・20% は設計書で「仮定」と明記されたもので、ここで変えない**。

| ID | 種類 | 検査 (対象の違反が起きた所だけに当てる) | 通る例 | 通らない例 |
| --- | --- | --- | --- | --- |
| M1 | E-09 | **§2.8**: (流動資産合計 + 固定資産合計) と `totalAssets` の差 ≥ `totalAssets` の 10% (`10 × \|差\| ≥ totalAssets`。総資産は元のまま、流動資産の小計をずらす作り方なので、割る数は総資産)。足し算が合わない期に | 総資産 58,080 に対し 流動資産合計 + 固定資産合計 = 63,900 (差 5,820。`10×5,820 ≥ 58,080`)・52,200 (差 5,880) | 63,800 (差 5,720)・52,300 (差 5,780)。境界は 5,808 ちょうど (= 52,272・63,888) は通る (設計書が §2.8 で 52,200 に直した。52,300 は通らない) |
| M2 | E-12 | 営業利益率の表示値 m (10 倍した整数 M) と、売上高 S・営業利益 O から出る**正確な**値 c = O ÷ S × 100 で、m ≥ 2c (`M × S ≥ 2 × O × 1000`) または m ≤ c/2 (`2 × M × S ≤ O × 1000`)。**§2.8**: 丸めた表示値でなく正確な値 | 売上高 96,930・営業利益 4,920 (c = 5.076) に対し m = 10.2 (102×96,930 = 9,886,860 ≥ 9,840,000)・m = 2.5 (2×25×96,930 = 4,846,500 ≤ 4,920,000) | m = 10.1 (9,789,930 < 9,840,000)・m = 2.6 (5,040,360 > 4,920,000)・正しい値 5.1 |
| M3 | E-06 | `ir.results.chart.netSales` の `axisMin` a について、短い棒の数字 s・長い棒の数字 l (`previous`・`current` の小さい方・大きい方) で `s > a` かつ `l − a ≥ 1.5 × (s − a)` | s = 906.6・l = 969.3 に対し a = 782 (187.3 ≥ 1.5×124.6 = 186.9) | a = 781 (188.3 < 1.5×125.6 = 188.4)・a ≥ s (棒が見えない。別の異変なので通らない扱い) |
| M4 | E-07 | `ir.results.netSales` の `previous`・`current` で数字の大きい側の棒 (`chart.netSales` の同じ側) が、小さい側の棒の 2/3 以下 (`3 × 大きい側の棒 ≤ 2 × 小さい側の棒`)。数字が等しいときは通らない (向きが決まらない) | 数字 906.6 → 969.3、棒 前期 906.6・当期 604.0 (増収の期。当期の棒を下げた) / 減収の期 (数字 969.3 → 906.6) で前期の棒を下げた場合も同じ | 当期の棒 605.0 (3×605.0 = 1815 > 2×906.6 = 1813.2)・棒を入れ替えただけ (969.3・906.6。差 6.5%) |
| M5 | H-05 | 売上債権の増減 x と真の値 t = −(当期末 − 前期末) について、x と t の符号が逆、または \|x − t\| ≥ 0.2 × \|t\| (`5 × \|x − t\| ≥ \|t\|`)。t = 0 のときは通らない (比が決まらない) | 前期末 2,900・当期末 3,000 (t = −100) に対し x = +100 (符号逆)・x = −80 (差 20 = 20%)・x = −120 | x = −81 (差 19)・x = −100 (ずれ無し。この種類の異変ではない) |
| M6 | H-20 | 純有利子負債 n と t = 有利子負債 − 現金 (10 倍した整数) について、\|n − t\| ≥ 0.2 × \|t\|。当期・前期のうち n ≠ t の期に | B の前期 (有利子負債 48.3・現金 21.0・t = 27.3) に対し n = 33.0 (差 5.7 ≥ 5.46) | n = 32.0 (差 4.7 < 5.46)・t = 0 のとき (比が決まらない) |
| M7 | 検査の無い種類・正常な問題 | 空を返す。正常な問題 (28 問) も空 |
| M8 | 今のデータ | 今の異変の問題に当てた結果 (`src/data`。やさしい 13・むずかしい 16 のうち、検査のある種類) を **測って** PR に書く。検査のある種類の第 1 版の異変は 1% 程度 (G3) なので、通らないものが出る (shortfalls `anomaly-min-deviation` に入る。データの Task が作り直す) |

`deviationIssues` は、問題の異変の種類 (`problem.anomaly.kind`) で表を引き、`kinds` が無い種類・表に無い種類は空。メッセージに、種類・実際のずれ・最小のずれを書く (データを直す人が読む)。

## 9. 設計 §2.8 を取り込んだ追加 (Sub-task #153。`changed`・`base`・カード上の場所・二重の食い違い)

**実装で決めたこと (#153)**: (a) 「違反が `changed` のセルを読む」は、違反の path が `changed` の 1 つと**同じか、その下** (`changed` が要素のパスのとき。`ir.segments.items.2` なら `…items.2.name`)、または**その入れ物** (違反が `ir.segments.items` を読み、`changed` がその要素 `…items.2` のとき。H-19 の二次の違反。#153 レビュー B1) で判定する。(b) `changed` が要素の過不足 (`ir.segments.items` の要素が足りない) のときは、`changedCells` が**足りない・余った要素のパス 1 つ**を差とする (リーフに分けない)。(c) 今のデータとの整合のため、H-19 の `primaryRules` を `xdoc-seg-names` にし (設計 §2.3)、hard-003 の `expectedRules` に `xdoc-seg-names` を足し、`places` に欠けたセグメントの短信側の名前のセルを足した (入れ物 `ir.segments.items` も残す: `seg-count`・`segment-names` が読むため)。E-04 の `primaryRules`・`allowedRules` に `card-period` を足し (設計の一覧どおり)、easy-022 の `expectedRules` に `card-period` を足した。

### 9.1 `anomalyIssues`・`checkAnomaly` の許容集合 (**§2.8** の検査 1・2)

`anomaly.changed` (基との差のセル `<doc>.<path>`) を持つ問題だけに、新しい決まりを当てる (`changed` が無い問題は今のまま = #139・#140 が足すまで)。**`expectedRules` = 実際に落ちた集合** の検査と、主な規則が 1 つ以上落ちる検査は今のまま。

| ID | 入力 (A から。種類のダミーは `primaryRules` = `allowedRules` = `['ratio-operating-margin']`) | 期待 |
| --- | --- | --- |
| A1 | 営業利益 当期を 10 倍 (再計算しない)、`changed = ['tanshin.incomeStatement.current.operatingIncome']`、`expectedRules` = 実際に落ちた規則 | 問題なし (落ちた規則は `allowedRules` の外 (`pl-operating-income` など) でも、変えたセルを読むので許す) |
| A2 | A1 と同じで `changed` を省く、または `[]` | 「許容集合の外の規則が落ちている」「期待集合が許容集合を越えている」 (今のまま) |
| A3 | A1 で `changed` に別のセル (`tanshin.summary.eps`) を入れる | 変えたセルを読まない規則が落ちる → 許容集合の外の指摘 |
| A4 | A1 で `places` = `summary.operatingMargin` だけ。`pl-operating-income` は `places` に触れない | **§2.8 検査 2**: `changed` を読む違反なので「場所に触れない違反」は出ない。`changed` を読まない違反が `places` に触れないなら今のまま出る (`anomaly-mismatch`) |
| A5 | 場所 `{doc:'card',shape:'E1',card:0,slot:'margin'}` の問題 (`cardEdits` の drop) | 場所の key = `card.E1.0.margin` が `card-slots` の違反の `paths` に触れる。形・欄が形に無い (`slot: 'nope'`・`shape: 'H1'` で難易度が違う・`card` が範囲外) と `anomaly-mismatch` (場所が実在しない) |
| A7 | 要素の欠け (H-19 型。正常な B から IR のセグメントを 1 つ消す。`changed = ['ir.segments.items.2']`、places = 欠けたセグメントの短信側の名前のセル、`expectedRules` = 実際に落ちた規則) | 問題なし。`seg-count`・`segment-names`・`ir-seg-reconcile` は入れ物 `ir.segments.items` を読む違反で、changed の要素 (`…items.2`) の入れ物なので「変えたセルを読む」に数える。`changed` を空にすると「場所に触れない違反」が出る (#153 レビュー B1) |
| A6 | `shapeErrors`: `{doc:'card',shape,card,slot}` | 正しければ誤りなし。`shape` が未知・`card` が整数でない・`slot` が無い・`path` か `itemKey` を持つ・未知のキー → 誤り |

### 9.2 データ全件の `base`・`changed` (**§2.8**。S12〜S14)

| ID | 入力 | 期待 |
| --- | --- | --- |
| B1 | 異変の問題に `base` = 同じ会社・同じ期の正常な問題の ID、`changed` = 実際の差 | errors に `anomaly-changed-mismatch`・`anomaly-base` が出ない |
| B2 | `changed` が差より少ない・多い・順序だけ違う | 少ない・多いは `anomaly-changed-mismatch` (メッセージに足りない・余計なセル)。順序だけは出ない (集合で比べる) |
| B3 | `base` が存在しない ID・異変の問題・別の会社・別の期・自分自身 | `anomaly-base` |
| B4 | `labelOverrides` だけの異変 (基からセルの差なし)・`changed: []` | 出ない。`changed` が空で差があれば `anomaly-changed-mismatch` |
| B5 | `base`・`changed` が無い異変の問題 | shortfalls `card-anomaly-base` (問題ごと) |
| B6 | 差の取り方: セルは `tanshin`・`ir` の全リーフ (数・文・真偽・null)。配列 (`statements`・`segments.items`) は添字つきのパス `ir.statements.0.text`。要素の数が違えば、足りない・余った添字のパスが差 | `changed` はそのパスで書く |

### 9.3 二重の食い違いの禁止 (**§2.8** 検査 4。`doubleDiscrepancies`)

見える形 s ごとに、その問題の hard の違反のうち「`paths` がすべて s のカードのセル (別名・見出し語の文を含む) に収まる」ものが、すべて種類の `primaryRules` に入る。入らない違反があれば、その形・規則を返す。

| ID | 入力 (A から) | 期待 |
| --- | --- | --- |
| X1 | 営業利益 当期を 10 倍 (増益の期なので向きは変わらない。`primaryRules` = `ratio-operating-margin`) | E1 は空 (`ratio-operating-margin` だけがカードに収まる。`pl-operating-income` は粗利・販管費がカードに無く収まらない) |
| X2 | 営業利益を 1/10 (増益の期なので向きが逆になる) | E1 に `claims-direction` (営業利益の主張の向き) も収まるので `[{shape:'E1', rules:['claims-direction']}]` |
| X3 | 正常な問題 | 空 (異変が無い) |
| X4 | 見える形が無い問題 | 空 (「その問題を出す形」が無い) |
| X5 | S15 | データ全件では `card-double-discrepancy` の shortfall |

### 9.4 CI の受け渡し (L4 に足す)

責任者が決めたとおり (#139・#140 に `--require-cards` を入れる) で、`card-anomaly-base`・`card-double-discrepancy` も `--require-cards` の対象に入る (L3)。

## 10. 設計 #156 の取り込み (Sub-task #158。calliope/design-v2 22e9012)

設計 v2 の 2 回目の包括レビュー (#156) で、むずかしいの IR 型の文欄を claims から型で作る (R-D5)・主張はちょうど 1 つ・40 字は全問・E-22 は E3 だけ・R-S5 (f) が入った。#151〜#153 の合意のあとなので、**§1 (D14・D16)・§2.2 (C6)・§5 (S3) の期待は、この節で置き換える**。

### 10.1 文欄を claims から型で作る (R-D5。`deriveCards`)

| ID | 入力 → 期待 |
| --- | --- |
| D44 | H1 IR の `claim` 欄: `netSales` の主張が `up` → `売上高は前期より増えた`、`down` → `売上高は前期より減った`。`text` が何であっても (`ir.statements.<N>.text` は使わない)、`raw` もこの文。`reads` = `['ir.statements.<N>']` (型が使った 1 つの文だけ。`ir.statements` 全体を読まない)。基準問題 A・B で `売上高は前期より増えた` (D14 の `売上高・営業利益ともに前期を上回った。` を置き換える) |
| D45 | H2 IR の `claim` 欄: `operatingCashFlow` の主張が `up` → `営業活動によるキャッシュ・フローはプラス`、`down` → `…マイナス`。**主語は `labels.ts` の `tanshin.cashFlow.operatingCashFlow` の標準の名前だけ** (**`labelOverrides` は読まない**。H-30 の誤字は短信の ④ だけに出る。IR の文は別の資料で、短信の表の差し替えが写ると、誤字が 2 か所に出るのに答え合わせの場所が ④ だけになる。#158 レビュー B1)。欄の名前も同じ呼び名の `営業活動によるキャッシュ・フローの説明` (同じ科目の呼び名が正常なカードの組に 2 つ出ない。N1)。基準問題 A・B で `営業活動によるキャッシュ・フローはプラス` (D16 を置き換える) |
| D46 | `ir.statements` の `text` を別の文に書き換えても、カードは変わらない (単一の出所)。同じ metric の主張を持つ文が 2 つある問題は、最初の文を使い、`reads` はその 1 つの添字だけ |
| D47 | 主張の `direction` が `zero` (型の文を作れない)・主張が無い → その欄は出ない (例外にしない。構造の検査 C1・§10.2 が拾う) |
| D48 | 型の文はどの向きでも **40 字以内**。最長は H2 の `営業活動によるキャッシュ・フローはマイナス` の **21 字** (**導いた**: 科目名 16 字 + `は` + `マイナス` 4 字。設計書 R-D5 の「最長 20 字」は 1 字少ないが、40 字には収まる。設計書は直さず PR に書く) |
| D49 | 売上高の主張が `up` の文 (`ir.statements.0`) と `operatingCashFlow` の主張の文 (`ir.statements.2`) は別の文でも、`netSales` の主張が営業利益の主張と同じ 1 つの文にあっても (基準問題 A)、H1 の欄はその文の添字 (`ir.statements.0`) を読む |

### 10.2 検証器

| ID | 入力 → 期待 |
| --- | --- |
| C7 | `cardTextLengthIssues` の対象は **`deriveCards` が作る文欄の `text` すべて** (監査の注意書き・会計方針の注記・後発事象・「期末後の出来事: なし」・セグメントの名前の並び・型の文)。今の C5 と同じ数え方 (40 字ちょうどは可・41 字は 1 件) |
| C8 | **今の正常な問題**で 40 字を超える欄 (**測った**。型の文は 21 字以内なので、H1 の IR 主張 4 欄は対象から外れる): hard-023 (方針注記 56)・hard-024 (後発事象 47・IR 後発 47)・hard-031 (方針注記 56)・hard-032 (後発事象 49・IR 後発 49) の **4 問・6 欄**。やさしいは 0 件 |
| S16 | `claims-count` (errors): 1 問の中で `netSales`・`operatingIncome`・`operatingCashFlow` の主張がちょうど 1 つでない (0 個・2 個以上) → **問題 × metric ごとに 1 件** (メッセージの頭に metric と個数。#158 レビュー N4)。**異変の問題・正常な問題の全問**に当てる。今の 57 問は満たす (**測った**) |
| S17 | `card-claim-directions` (shortfalls。R-S5 (f)): **カードに出る語の向きが、正常な問題に両方出る**。難易度ごとに、正常な問題のうち、**その難易度のカードに出る主張** (やさしい = `netSales`・`operatingIncome` の見出し語、むずかしい = `netSales` (H1 の文)・`operatingCashFlow` (H2 の文)) の `direction: 'down'` を持つ会社の数が、`netSales` 3 社・`operatingIncome` 3 社・`operatingCashFlow` 1 社に足りない → 1 件にまとめる (**仮定**: 設計書 R-S5 (f) の数。減益は今の 3/28 に合わせた水準)。今のデータは 減収 0 社・営業 CF マイナス 0 社なので出る (**測った**: 28/28 が増収・営業 CF プラス) |
| S18 | `card-text-length` は**異変の問題にも**当てる (S3 を広げる。異変の問題の文欄だけが長いと、行の数で答えが分かる。設計 §1.1)。cardEdits の問題はテンプレートのカードで見る。**実データ (測った)**: 異変の問題も含めて、hard-018 (方針注記 56)・hard-019 (IR 後発 69)・hard-023・hard-024・hard-031・hard-032 の 6 問 (やさしいは 0) |
| S19 | 異変の問題の `cardEdits` を当てたカードも、数字 ≤ 4 (やさしい)・文 ≤ 3 (むずかしい) を守る → 守らないと `card-structure` (errors。メッセージに形・カード・上限)。**E-22 (欄の重複) は E3 だけ**: E3 (数字 3 つ) の `dup` は 4 つで可、E1・E2 (数字 4 つ) の `dup` は 5 つで errors |
| R7 | 関係 R4・R5 の文の向きは、**カードが読んだ文 (`ir.statements.<N>`) の claims の向き**と数字を照らす (今のまま。文の `text` は照らさない) |
| S20 | `card-place-text` (shortfalls。#158 レビュー N2): 異変の `places` が `ir.statements.<N>.text` (text の下) を指す問題 (問題ごとに 1 件)。カードの文は claims から作り、`text` は読まないので、場所は `ir.statements.<N>` (claims の入れ物) で書く。今の easy-024 (E-17)・hard-007 (H-21) が当たる (データの Task が直す) |
| S21 | 見本にも同じ検査 (N3・B2): `samples/*.json` の問題にも、`claims-count`・`card-structure`・`card-relation` (errors)・`card-text-length` (shortfalls) を当てる。見本は両方の難易度で共有するので、問題の難易度を easy・hard に替えて両方の形で数え、**超えた形の難易度ごとに `difficulty` を付けて 1 件** (文欄はむずかしいの形にしか無いので実際は `hard` の 1 件。`--require-cards=hard` が数える。難易度が無いと `=easy`・`=hard` のどちらでも致命にならない)。基準の見本は出ない |

