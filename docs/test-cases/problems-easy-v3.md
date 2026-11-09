# ケース表: やさしいの問題データ v3 (Sub-task #168)

Task #139。設計表: [docs/plans/problems-easy-v3.md](../plans/problems-easy-v3.md) (元データ [spec-v3.json](../plans/problems-easy/spec-v3.json))。設計: [design-v3.md](../design-v3.md) §1.2・§1.5・§1.6・§2.2・§3.2 #139。検証器: [test-cases/cards.md](cards.md) (§7 DS・§10・§13)。
方針 ([charter](../charter.md)): 問題データ (JSON) の中身は、ケース表ではなく**検証器を全問に当てて**確かめる (D 群)。ここには、検証器が見ない約束 (設計表との一致・金額の桁・前期比・答え合わせの文・再現性) と、生成の道具の境界値を置く。**N・A・D 群は、コミットした `src/data` (`problems/easy/*.json`・`samples/sample.json`) を読んで確かめる** (生成器の一時出力ではない)。生成器の出力が `src/data` と同じことは R1 が確かめる。実装 (データ・生成器) の前に固定する。固定後に足すときは理由を残す。
印: **仕様** (設計・設計表にある) / **決めた** (本書が決める。実装を見ずに書いた)。入力は外から観測できる JSON・コマンドの結果だけ。内部の関数名に依存するのは、道具の境界値 (U 群) だけ (道具の入口を仕様として固定する。§0)。

## 0. 作るもの (入口)

| 入口 | 中身 |
| --- | --- |
| `python3 docs/plans/problems-easy/gen.py --spec docs/plans/problems-easy/spec-v3.json --out <dir>` | spec-v3.json の正常 10 問 (`kind: null`) と見本を `<dir>/problems/easy/<id>.json`・`<dir>/samples/sample.json` に書く。`<dir>/problems/easy/` の既存の `easy-*.json` を先に消す (古い問題を残さない)。標準ライブラリのみ。同じ入力から同じ出力 |
| `node --experimental-strip-types --no-warnings scripts/gen-easy/run.ts [--dir <dir>]` | `<dir>` (既定 `src/data`) の正常 10 問と spec-v3.json から、異変 75 問を `<dir>/problems/easy/<id>.json` に書く |
| `scripts/gen-easy/inject.ts` の `shiftYearEnd`・`glyphIndex`・`flipOperatingText` ほか | 道具の境界値 (U 群)。純関数 |

## 1. 正常な問題 10 問と見本 (N 群。コミットした `src/data` に、検証器とは別に当てる)

| ID | 入力 → 期待 |
| --- | --- |
| N1 | spec-v3.json の正常 10 問 → `<id>.json` 10 件。`id`・`companyId`・`fiscalYear`・`difficulty = easy`・`anomaly = null`・`tier` なし・`labelOverrides`・`unitOverrides`・`signOverrides`・`cardEdits` なし。`problems/easy/` にほかの `easy-*.json` が無い。`samples/sample.json` が 1 件 (c09・2023 年 3 月期) |
| N2 | 営業利益の向き: spec の `op` が `up` なら 当期 > 前期、`down` なら 当期 < 前期。減益 (`down`) の会社が 4 社 (c02・c05・c08・c10) |
| N3 | 営業利益の前期比 \|当期 ÷ 前期 − 1\| ≥ 2% (設計表 §2 の約束)・0.5 ≤ 当期 ÷ 前期 ≤ 2・当期 < 売上高。カードの 4 欄 (売上高・営業利益 前期・当期・営業利益率) は正 |
| N4 | 営業利益率 (`summary.operatingMargin`) = 当期の営業利益 ÷ 売上高 × 100 を小数第 1 位に四捨五入 (差 0)。spec の `omRange` の範囲内 |
| N5 | E-02 の増益の基 (c03・c06・c07): 10 × 営業利益 (当期) ≤ 0.8 × 売上高 (当期) |
| N6 | IR の単位: `ir.header.unit = 億円`。短信の金額 (売上高・売上総利益・営業利益・セグメントの売上高と利益。前期・当期) は 10 の倍数 (IR の 0.1 億円の丸めで比率がずれない) |
| N7 | 期: `header.periodLabel = ${fiscalYear}年${month}月期`。`columnDates` の 3 画面の当期の日付 = その月の末日 (c03 = 2024-02-29)。前期の日付はその 1 年前の月末日 |
| N8 | 金額は 6 桁以内: `tanshin` の数値のセル (百万円) の絶対値がすべて < 1,000,000。売上高の範囲は spec の `salesRange` の中、営業利益は `opRange` の中 |
| N9 | 検証器: `verifyProblem` の hard・soft の違反が 0 件、`verifyIrDisplay` が空。`deriveCards` の `cardStructureIssues`・`cardRelationIssues`・`cardTextLengthIssues` が空。`claims-count` (営業利益・営業 CF の主張がちょうど 1 つ)・`cash-scope` が成り立つ |
| N10 | 見出し語の向き: 営業利益の主張 (`ir.statements` の `claims` の `operatingIncome`) の向き = 営業利益の前期 → 当期の向き |
| N11 | 見本 c09 2023 は、commit 9b9e08a の `src/data/samples/sample.json` と**同一** (生成し直しても見本が変わらない。回帰) |
| N12 | 同じ入力で `gen.py` を 2 回回す → 出力 (全ファイル) がバイト単位で同じ。1 回目と 2 回目を別の `--out` に書いて比べる |

## 2. 異変の問題 75 問 (A 群。コミットした `src/data` に当てる)

| ID | 入力 → 期待 |
| --- | --- |
| A1 | spec-v3.json の異変 75 問 → `<id>.json` 75 件。`id`・`companyId`・`fiscalYear`・`difficulty = easy`・`tier` = spec・`anomaly.kind` = spec・`anomaly.base` = spec の `base`。`anomaly.expectedRules` = 検証器 (`verifyProblem`) で実際に落ちた hard の規則の集合 (生成器が書く。設計表 §5) |
| A2 | `base` の問題は、同じ会社・同じ `periodLabel` の正常な問題。`anomaly.changed` = `changedCells(base, 問題)` (検証器の `anomaly-changed-mismatch` が出ない) |
| A3 | **1 つの異変 = 1 つの変更**: 基との差 (`changedCells`)・`cardEdits`・`labelOverrides` が、種類ごとに次の表のとおり。それ以外は基と同じ (`tanshin`・`ir` の全セル) |
| A4 | 答え合わせの文 (`anomaly.explanation`): 空でない・**2 文まで・1 文 60 字以内** (根拠: 文化審議会「公用文作成の考え方 (建議)」令和 4 年 1 月 7 日、Ⅲ-3「文の書き方」(PDF の「- 32 -」の頁。本文を取得して読んだ。ア「一文を短くする」に「適当な長さは一概に決められないが、50～60字ほどになってきたら読みにくくなっていないか意識するとよい。」、イ「一文の論点は、一つにする」。https://www.bunka.go.jp/seisaku/bunkashingikai/kokugo/hokoku/pdf/93731901_01.pdf)。K1・K7 の骨組みは 2 文。**決めた**: 60 字は上の「50～60字」の上端を上限にしたもの)・専門語 (検証器・規則・セル・cardEdits・slot・tier・primaryRules・expectedRules・R-) を含まない。**比べる 2 つの値を、カードの表示のとおりに含む** (下の表)。含める値は、`deriveCards` で作ったそのカードの欄の表示 (`slot.text`) |

A4 で文に含める値 (種類ごと。「表示」はカードの欄の表示):

| 種類 | 含める値 |
| --- | --- |
| E-17 | 見出し語 (増益・減益) と、営業利益の前期・当期の表示 (向きを数字で言う) |
| E-02 | 営業利益の前期・当期の表示 (桁の違いを数字で言う) |
| E-24 | 売上高と営業利益 (当期) の表示 |
| E-12 | カードに書かれた営業利益率の表示と、正しい営業利益率 (営業利益 ÷ 売上高 の小数第 1 位) |
| E-04 | 表題の期 (例 2024年3月期) と足元の期末日の表示 |
| E-03 | 変えた欄の科目名と、書かれた単位 (億円) と、ほかの欄の単位 (百万円) |
| E-21 | 変えた欄の表示 (桁区切りが違う数字) と、正しい表示 |
| E-25 | 売上高の表示 (△ つき) |
| E-26 | 2 つの欄の科目名 (添え字つき) と値 (同じ添え字が 2 回出ること) |
| E-27 | 変えた欄の表示 (X の入った数字) |
| E-28 | 足元の期末日の表示 (存在しない日付) |
| E-05 | 誤字の科目名と、正しい科目名 |
| E-19 | 消えた欄の科目名 |
| E-22 | 重なった欄の科目名か見出し語 |
| E-23 | 見出し語 (増収・減収) と、営業利益の前期・当期の表示 (向きは合っている) |
| A5 | 同じ入力で `run.ts` を 2 回回す → 全ファイルがバイト単位で同じ |
| A6 | 答え合わせの場所 (`places`): E-04 = `tanshin.columnDates.incomeStatement.current` と `tanshin.header.periodLabel`、E-17 = 営業利益の主張を持つ文 `ir.statements.<N>`、E-05 = 変えた科目名の項目キー、E-02 = `…operatingIncome`、E-24 = `…netSales` と `…operatingIncome`、E-12 = `summary.operatingMargin`、cardEdits の種類 = `{ doc: 'card', card: 0, slot }` (E-26・E-22 の対象の欄、E-19 は消えた欄の key、E-23 は `headline`、E-28 は `period`)。E-17 の文の `text` を場所にしない |

種類ごとの「変えたもの」(A3)。「表示だけ」は `changed` が空で、問題データのセルは基と同じ:

| 種類 | 変えたもの (spec の `edit`) | `changed` | 検証 |
| --- | --- | --- | --- |
| E-17 | 営業利益の主張の向きを逆に (`claims[].direction`)、その文の営業利益の語も同じ向きに直す | `ir.statements.<N>.claims.<K>.direction` と `ir.statements.<N>.text` | 見出し語 = 逆向き (`deriveCards` の `headline.word`) |
| E-02 | `incomeStatement.current.operatingIncome` を × 10 (増益) か × 1/10 (減益)。再計算しない | そのセルだけ (サマリーの営業利益・営業利益率・IR は変えない。再計算しない) | 当期 ÷ 前期 ≥ 10 (増益) か ≤ 1/10 (減益) |
| E-24 | `incomeStatement.current.netSales` を営業利益 (当期) × ratio (0.6 か 0.5。10 の倍数に四捨五入) | そのセルだけ | 売上高 × 10 ≤ 営業利益 × 8 |
| E-12 | `summary.operatingMargin` × factor (2.2 か 0.4。小数第 1 位) | そのセルだけ | 正しい値の 2 倍以上か 1/2 以下 |
| E-04 | `columnDates.incomeStatement.current` を年 ±1 (spec の `years`)、**ずらした年のその月の末日** | そのセルだけ | 実在する日付。c03 の +1 = 2025-02-28 |
| E-03 | `cardEdits` = 1 件 `{ op: 'unit', slot, unit: '億円' }` | 空 | |
| E-05 | `labelOverrides` = 1 件 `{ <itemKey>: <誤字> }` (spec の `word`) | 空 | |
| E-19 | `cardEdits` = 1 件 `{ op: 'drop', slot }` | 空 | |
| E-22 | `cardEdits` = 1 件 `{ op: 'dup', slot }` | 空 | |
| E-21 | `cardEdits` = 1 件 `{ op: 'format', slot, style }` | 空 | `no-comma` は整数部 4 桁以上、`comma-shift` は 5 桁以上 |
| E-25 | `cardEdits` = 1 件 `{ op: 'sign', slot: 'sales' }` | 空 | 売上高の値は正のまま |
| E-26 | `cardEdits` = 1 件 `{ op: 'suffix', slot, word }` | 空 | |
| E-27 | `cardEdits` = 1 件 `{ op: 'glyph', slot, at }`。`at` は、spec の `digit` (first・middle・last) の数字の表示上の添字 | 空 | 表示の `at` の字が数字 |
| E-23 | `cardEdits` = 1 件 `{ op: 'headline', word }` (増益 → 増収、減益 → 減収) | 空 | |
| E-28 | `cardEdits` = 1 件 `{ op: 'day', slot: 'period', day: 32 }` | 空 | |

## 3. データ全体 (D 群。検証器 `verifyDataset` と CLI を、やさしい 85 問に当てる)

| ID | 入力 → 期待 |
| --- | --- |
| D1 | やさしい 85 問 + 見本 + 会社 + 種類を `verifyDataset` に渡す (むずかしいは入れない) → `errors` 0 件。`shortfalls` のうち `card-*`・`anomaly-min-deviation`・`pool-size`・`both-sided-companies`・`family-balance` が 0 件 (`card-double-discrepancy`・`card-invisible`・`card-relation-extra`・`card-kind-count`・`card-kind-companies`・`card-pool-size`・`card-tier-balance`・`card-company-period`・`card-company-both-sided`・`card-claim-directions`・`card-ir-unit`・`card-normal-tier`・`card-anomaly-base`・`card-place-text`・`card-text-length` を含む) |
| D2 | 同じ入力 (一時ディレクトリにやさしい 85 問 + 見本 + 会社 + 種類だけ) に `npm run verify:data -- --dir <dir> --require-complete=easy --require-cards=easy` → 終了コード 0 |
| R1 | 再現 (コミットした `src/data` との一致): 一時ディレクトリに `gen.py` → `run.ts` を回した出力が、`src/data/problems/easy/*.json` (85 件) と `src/data/samples/sample.json` に**バイト単位で一致**する (#167 の SP11 と同じ考え。レビューの直しで JSON を手で直したり、spec を変えて `run.ts` を回し忘れたりすると赤になる) |
| D3 | `src/data/problems/easy/` は 85 件 (`easy-001`〜`easy-085`)。それ以外の `easy-*.json` が無い |
| D4 | 全 85 問で `tanshin` の数値のセルの絶対値 < 1,000,000 (異変の問題も。E-02 の 10 倍を含む) |
| D5 | 全 85 問で、`deriveCards` が例外 (`RangeError`) を投げない |
| D6 | 異変の問題で、`doubleDiscrepancies` が空・`isVisible` が真・`deviationIssues` が空・`cardRelationIssues` の落ちた検査が種類の許す検査の中 (検証器が見る。D1 に含む。ここは種類ごとの数を出して記録する) |
| D8 | 正常な問題 10 問と見本は参考の規則 (soft) の報告が 0 件 (N9)。異変の問題の soft の報告は、数を出して #168 のコメントに記録する (致命にしない) |
| D7 | 今のデータ (旧 25 問) との差: 旧 `easy-0NN` のうち spec に無い ID は消える。コミットに旧問題が残らない |

## 4. 道具の境界値 (U 群。`scripts/gen-easy/inject.ts` の純関数)

| ID | 入力 → 期待 |
| --- | --- |
| U1 | `shiftYearEnd('2024-02-29', 1)` → `'2025-02-28'`。`shiftYearEnd('2023-02-28', 1)` → `'2024-02-29'` (閏年の 2 月は 29 日)。`shiftYearEnd('2025-03-31', -1)` → `'2024-03-31'`。`shiftYearEnd('2025-03-31', 1)` → `'2026-03-31'`。`shiftYearEnd('2025-09-30', -1)` → `'2024-09-30'` |
| U2 | `glyphIndex('4,920', 'first')` → 0。`glyphIndex('4,920', 'last')` → 4。`glyphIndex('4,920', 'middle')` → 3 (数字 4 つ [0,2,3,4] の添字 ⌊4/2⌋ = 2 番目 = 3)。`glyphIndex('96,930', 'middle')` → 3。カンマを飛ばして数字だけを数える。数字の無い文字列は `RangeError` |
| U3 | `flipOperatingText(text, to, companyId)` (`to` は 'up' か 'down'): 各社の口調 (上回った/下回った・上回りました/下回りました・増/減・伸びた/縮んだ・増加/減少) で、**営業利益を述べる文だけ**の向きの語を逆にする。売上高の文は変えない。例: `'売上高は前期を上回った。営業利益は前期を上回った。'` → `'売上高は前期を上回った。営業利益は前期を下回った。'`、`'売上高 前期比増。営業利益 前期比増。'` → `'売上高 前期比増。営業利益 前期比減。'` |
| U4 | `salesBelowOperating(op, ratio)` = `round(op × ratio / 10) × 10` (10 の倍数)。結果 × 10 ≤ op × 8 (ratio 0.5・0.6)。op = 4,920・ratio 0.6 → 2,950。op = 1,184・ratio 0.5 → 590。結果 > 0 |
| U5 | `scaleMargin(margin, factor)` (小数第 1 位): 5.1 × 2.2 → 11.2。1.4 × 0.4 → 0.6 (正しい値 1.4 の 1/2 以下 = 0.7 以下)。結果 ≥ 2 × margin か ≤ margin ÷ 2 を常に満たす (margin 0.8〜20 の 0.1 刻みを総当たり)。結果 ≠ margin |
| U6 | `scaleOperating(op, 'up' \| 'down')`: up → op × 10、down → op ÷ 10 (op が 10 の倍数のとき整数)。op = 4,920 → 49,200 / 492 |
| U7 | `digitsOf` (表示の整数部の桁数): `'96,930'` → 5、`'4,920'` → 4、`'492'` → 3、`'8,080'` → 4、`'11.2'` → 2 |
| U8 | 答え合わせの文: 種類を知らない (台帳に無い) 種類 ID → `RangeError` |

## 5. 手順 (レッド → グリーン)

1. **レッド**: ケース表を固定したあと、`scripts/gen-easy/inject.test.ts` (U 群) と `scripts/gen-easy/data.test.ts` (N・A・D 群) を書く。実装 (`inject.ts`・`run.ts`・`gen.py` の v3・データ) を置く前に実行し、**失敗を確かめて**記録する (U 群は `inject.ts` が無いので import で失敗、N・A・D 群は旧データ 25 問で失敗)。
2. **グリーン**: `gen.py` を spec-v3 から読む形に直し、`inject.ts`・`run.ts` を書き、`src/data` に 85 問を書く。N・A・D・U がすべて通る。
3. **文の確認**: グリーンのあと、種類ごとに 1 問、計 15 問の答え合わせの文を、監視役へのレビュー依頼に並べる (A4 の禁止語の一覧に入らない会計の用語・言いまわしが、一般の人に分かるかは機械で確かめられない。#139-1 ③「人が確かめるのは種類ごとの代表」)。
4. 全体の `npx vitest run` の赤 10 件のうち、やさしいに関わる 5 件 (data.test.ts K4・N4-1、verify-data.test.ts L7・Lc4、dataset-cards.test.ts KD5) を、新しい事実 (全社億円・やさしい 85 問) に合わせて直す (直し方は理由とともに #168 のコメントに残す)。むずかしいの 5 件 (problems-hard.test.ts) は #140 の持ち分。
