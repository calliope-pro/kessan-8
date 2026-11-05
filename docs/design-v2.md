# 設計 v2 (カード・台帳・画面の流れ・見た目の方向)

Task #136。作成: 2026-11-05。根拠: [requirements.md](requirements.md) (第 2 版、凍結)・[charter.md](charter.md)・`docs/plans/redesign/` (research.md・root-causes.md・plans.md・tech-estimates.md・ui-assessment.md)・今の `src/` (domain・verifier・data)。
印: **要件** (requirements.md にある) / **測った** (コマンドの結果。再現を添える) / **導いた** (式・入力を示す) / **設計** (本書が決める取り決め。責任者が変えてよい) / **仮定** / **未確認**。印の無い数字は書かない。

本書の節と Sub-task: §1 カードの仕様 (#143)・§2 異変の台帳 v2 (#144)・§3 画面の流れ (#145)。PRODUCT.md・DESIGN.md は #146 (別のファイル)。

---

## 1. カードの仕様 (#143)

### 1.1 言葉 (GLOSSARY.md に足した)

| 語 | 意味 |
| --- | --- |
| カード | 1 回の判定で遊び手が見る、決算の要約 1 枚。やさしいは 1 枚、むずかしいは 短信型・IR 型の 2 枚 (要件) |
| 形 | カードの型。欄 (スロット) の並びと、各欄が問題データのどのセルを見せるかを決めたもの。**難易度ごとに 3 種類まで** (要件) |
| スロット | カードの 1 つの欄。**数字**欄 (数値 1 つ + 科目名 + 単位) か、**文**欄 (1 行の文) |
| 枠 | 1 周 8 社の、何社目か。0 社目は見本 |

数え方の決まり (**設計**。要件の「数字 4 つまで」「各 数字 4 + 文 3」を数えられる形にする):
- 数字の数 = カードに載る**数値のセルの数**。棒グラフの棒 1 本も数字 1 つに数える (棒は元のセルから描く)。比率 (営業利益率など) も数字 1 つ。
- 文の数 = 文の欄の数。文欄は **1 文・40 字以内**。40 字は 1 行の幅の上限で (**文書にある**: research.md §4.3 の 176 行目。出典 Xbox Accessibility Guideline 101「Line width ≤ 80 characters (40 for CJK)」(https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101)。2026-11-05 に本文を取得して確認)、スマホ (320 px) では折り返してよい。文欄に載る文 (`accountingPolicyNote`・`subsequentEvents`・`ir.outlook.subsequentEvent`・選んだ `ir.statements` の文) は、検証器が **40 字以内**を正常な問題に当てる (今のデータには超えるものがある。監視役が測った: highlights の文は 79 件中 9 件、`accountingPolicyNote` は 57 問中 5 問、`subsequentEvents` は 4 問、`ir.outlook.subsequentEvent` は 5 件中 4 件。データの Task が 40 字以内に直す)。
- **枠の外** (数えない): 社章・社名・期・期末日の行 (閲覧票の中身。全形・全社で同じ位置)、見出し語 (【増益】など 1 語)、欄の科目名と単位の語。
- やさしいは 文欄を持たない (見出し語だけ)。むずかしいは 1 枚あたり 数字 4 + 文 3 まで。

### 1.2 カードを問題データから導く規則 (single source of truth)

charter の原則「single source of truth」に従い、**カードは問題データ 1 か所から導く。カード専用のデータは持たない。**

```ts
type ShapeId = 'E1' | 'E2' | 'E3' | 'H1' | 'H2' | 'H3';
interface Slot {
  key: string;              // 欄の ID (形の中で一意)
  itemKey: string;          // 科目名の項目キー (src/domain/labels.ts。正常の名前は 1 つ)
  source: CellPath | CellPath[] | Derived; // 見せるセル。Derived は下の導出関数 (増益/減益 など)
  reads: CellPath[];        // この欄が読むセルの全部 (Derived が読むセルを宣言する。例: 見出し語 = ir.statements.<N> の claims と前期・当期の数字)
  kind: 'number' | 'text';
}
interface CardTemplate { doc: 'tanshin' | 'ir' | 'summary'; slots: Slot[]; headline?: Slot; graphic?: 'bars'; }
interface ShapeDef { id: ShapeId; difficulty: Difficulty; cards: CardTemplate[]; } // やさしい = 1 枚、むずかしい = [短信型, IR 型]
function deriveCards(p: Problem, c: Company, shape: ShapeId): Card[]; // 純関数。DOM に触らない
```

規則:
1. **R-D1 純関数**: `deriveCards(problem, company, shape)` は、問題データと形の定義だけから、表示する文字列を作る。乱数・時刻・保存を見ない。同じ入力は同じカード。
2. **R-D2 異変は問題データの変更で表す**: 異変のカードは、異変の問題データ (数字・文のセルを 1 つ変えたもの、`labelOverrides`・`unitOverrides`、§1.6 の `cardEdits`) から `deriveCards` で導く。**カードを手で書き換えない**。正常と異変で同じ関数を使う。
3. **R-D3 答え合わせも同じ出所**: 答え合わせは `anomaly.places` (異変の場所) を、`Slot.reads` に当てて、カード上の欄を示す。パスでない場所は、科目名の異変 (`itemKey`。台帳 H-28) = `Slot.itemKey` が同じ欄、文章の異変 (`ir.statements.<N>.text`。台帳 E-17) = 見出し語の欄 (`Derived` が `ir.statements.<N>` を読む) に当てる。文言は `anomaly.explanation` (今のまま)。**`places` は、カードの上で食い違いが見えるセルだけ**を書く (R-S4 の V1。二次の症状でカードの外にあるセルは書かない)。
4. **R-D4 正常の整合**: 異変の無い問題は、今の検証器の全規則を満たす (今の 28 問の正常な問題はすべて満たす。**測った**: §1.7)。カードは正常な問題から導くので、正常のカードの数字は必ず整合する。
5. **R-D5 見出し語**: 【増益】【減益】【増収】【減収】は、`ir.statements` の主張 (`claims` の `metric` と `direction`) から作る (`up` → 増、`down` → 減。語の組は metric で決まる: `netSales` = 増収・減収、`operatingIncome` = 増益・減益。**今のデータでは、1 問の中で同じ metric の主張は重ならない** (57 問。監視役が確かめた) ので、metric で引けば 1 つに決まる)。主張は問題データの文なので、見出し語が数字と逆なら、今の検証器の規則 `claims-direction` が落ちる (向きの逆の異変 = 台帳の E-17 型)。

### 1.3 やさしいの 3 形 (カード 1 枚。数字 4 つまで)

枠の外 (全形で同じ): 社章・社名・期 (`header.periodLabel`)・期末日 (その形が見せる表の列見出しの日付。`columnDates`)。札 2 つ (いつも通り / 異変あり) は枠のさらに外 (§3)。

| 形 | 名前 (遊び手に出す語) | 見出し語 | 数字の欄 (上から。数字 4 つまで) | 見せるセル |
| --- | --- | --- | --- | --- |
| **E1** | もうけ | 【増益】/【減益】 (営業利益の主張) | ① 売上高 ② 営業利益 (前期) ③ 営業利益 (当期) ④ 営業利益率 (営業利益 ÷ 売上高) | ① `tanshin.incomeStatement.current.netSales` ② `…previous.operatingIncome` ③ `…current.operatingIncome` ④ `tanshin.summary.operatingMargin` |
| **E2** | 売上の伸び | 【増収】/【減収】 (売上高の主張) | ① 売上高 (前期) ② 売上高 (当期) ③④ 棒グラフの棒 2 本 (前期・当期。軸の下端 `axisMin` を含む) | ① `…previous.netSales` ② `…current.netSales` ③④ `ir.results.chart.netSales` (`axisMin`・`previous`・`current`) |
| **E3** | 持ち物 (資産の内訳) | (なし) | ① 流動資産 ② 固定資産 ③ 総資産 (流動資産 + 固定資産) | ① `tanshin.balanceSheet.current.totalCurrentAssets` ② `…totalFixedAssets` ③ `…totalAssets` |

- 例 (E1。easy-017 の数字。実在しない架空の会社): 【増益】 売上高 96,930 / 営業利益 前期 4,480・当期 4,920 / 営業利益率 5.1%。
- 各形の「関係」(遊び手が 1 回で確かめられるもの。**設計**。台帳 §2 が異変の種類と結ぶ):
  - E1: (a) 見出し語の向き = 営業利益の前期→当期の向き (b) 営業利益率 = 当期の営業利益 ÷ 売上高 (規則 `ratio-operating-margin` が読む 3 つのセルがすべて載る) (c) ② ③ の大きさが売上高と釣り合う
  - E2: (a) 見出し語の向き = 売上高の前期→当期の向き (b) 棒の高さの比 = 数字の比、軸の下端は 0 (c) ① ② の大きさが釣り合う
  - E3: (a) 総資産 = 流動資産 + 固定資産 (b) 大きさが釣り合う (総資産はその和)
- E3 の数字は 3 つ (上限 4 つの内)。自己資本比率を載せると、規則 `ratio-equity-ratio` が読む純資産と非支配株主持分が要り 5 つになるので載せない。規則 `bs-total-assets` が読む 3 つのセル (総資産・流動資産・固定資産) だけで、足し算の異変が完全に見える。
- E2 の棒は、軸の目盛りの数字を**出さない** (`axisMin` は棒の描き方だけに効く。目盛りの数字を出すと、数字が 4 つを超えて要件 7 に反する)。E2 の棒は、元のセル `ir.results.chart.netSales` から描く。IR の金額の単位 (億円) は棒の高さの比にしか効かないので、カードには数字を出さない。数字の欄 ①② は短信の百万円。正常では、IR の金額と短信の金額は検証器の規則 (`xdoc-results-net-sales`・`chart-bars`) で一致している。

### 1.4 むずかしいの 3 形 (カード 2 枚 = 短信型 + IR 型。各 数字 4 + 文 3 まで)

むずかしいは「会計の関係と、決算短信と IR のあいだの食い違いを多めに」(要件)。3 形は、**短信型と IR 型が 1 組**で、組ごとに照らし合わせる材料が違う。見本 (§1.5) と答え合わせも組で出す。

| 形 | 名前 | 短信型の欄 (数字 4 + 文 3 まで) | IR 型の欄 (数字 4 + 文 3 まで) |
| --- | --- | --- | --- |
| **H1** | 成績の見比べ | 数字: ① 売上高 (前期) ② 売上高 (当期) ③ 総資産 ④ 負債・純資産合計 | 数字: ① 売上高 (当期。IR の単位)。文: ① 業績の主張 (`ir.statements` のうち、slide = highlights で、`netSales` の主張を持つ文) |
| **H2** | 運転資金のつながり | 数字: ① 売上債権 (前期末) ② 売上債権 (当期末) ③ CF の売上債権の増減 ④ 営業 CF。文: ① 資産の科目名の行 (売上債権の行の名前と区分) ② 会計方針の変更の有無 ③ 会計方針の注記 | 文: ① 営業 CF の主張 (`ir.statements` のうち、`operatingCashFlow` の主張を持つ文) |
| **H3** | 現金・注記・借入 | 数字: ① CF の起点 (税金等調整前当期純利益) ② 損益の税金等調整前当期純利益 ③ 貸借の現金 ④ CF の期末残高。文: ① 監査の注意書き ② 後発事象 ③ 報告セグメントの名前の並び | 数字: ① 現金 (当期) ② 現金 (前期) ③ 有利子負債 (前期) ④ 純有利子負債 (前期)。文: ① 期末後の出来事 ② セグメントの名前の並び |

見せるセル (正本。`deriveCards` が使う):

| 形・欄 | セル |
| --- | --- |
| H1 短信 ①② ③④ | `tanshin.incomeStatement.previous.netSales`・`…current.netSales`・`tanshin.balanceSheet.current.totalAssets`・`…totalLiabilitiesAndNetAssets` |
| H1 IR ① 数字・文 | `ir.highlights.netSales.amount`・`ir.statements[claims に netSales を持つ highlights の文]` (配当の文ではない) |
| H2 短信 数字 ①〜④ | `…balanceSheet.previous.receivables`・`…current.receivables`・`tanshin.cashFlow.receivablesChange`・`tanshin.cashFlow.operatingCashFlow` |
| H2 短信 文 ①②③ | 売上債権の行の科目名 (`labels`・`labelOverrides` の `receivables`) と区分 (資産の部)・`tanshin.summary.accountingPolicyChange` (あり/なし)・`tanshin.notes.accountingPolicyNote` |
| H2 IR 文 ① | `ir.statements[claims に operatingCashFlow を持つ文]` |
| H3 短信 数字 | `tanshin.cashFlow.incomeBeforeTax`・`tanshin.incomeStatement.current.incomeBeforeTax`・`tanshin.balanceSheet.current.cash`・`tanshin.cashFlow.cashEnding` |
| H3 短信 文 | `tanshin.summary.auditNote`・`tanshin.notes.subsequentEvents`・`tanshin.notes.segments.current.segments[].name` の並び |
| H3 IR 数字 | `ir.supplement.cash.current`・`…cash.previous`・`…interestBearingDebt.previous`・`…netDebt.previous` |
| H3 IR 文 | `ir.outlook.subsequentEvent` (無ければ「期末後の出来事: なし」)・`ir.segments.items[].name` の並び |

- 数字 4 + 文 3 に収まっているか: H1 短信 数字 4 文 0、IR 数字 1 文 1 / H2 短信 数字 4 文 3、IR 数字 0 文 1 / H3 短信 数字 4 文 3、IR 数字 4 文 2。すべて上限以内。
- 3 形の選び方 (**導いた**。探索の再現: §1.7): 検証器の全規則が 1 回の評価で読むセルの組 (正常な 1 問に対して取り出した) と、台帳の種類ごとの組から、「3 形の短信型・IR 型のスロットに収まる、見え方の違う種類」が最大になる組を探索で求め (14 分類。結果は 7・4・4 に偏った)、遊び手に説明できる 3 つの話 (成績の見比べ・運転資金・現金と注記) に並べ替えた。並べ替えたあとの 3 形を `shape-fit.ts` で数え直した (14 分類のまま)。**載る見え方の数と、種類ごとの収まりは台帳 §2 が数える**。

### 1.5 形の出方を正常と異変でそろえる規則

**問題**: 異変の検出に必要な欄だけをカードに出すと、異変のあるカードの形が正常と系統的に違い、**形だけで答えが分かる**。要件 6 は「カードの形だけで答えが分からない (正常と異変で形の出方をそろえる)」。

規則 (**設計**):
1. **R-S1 形は問題から決めない**: 形は、枠 (何社目か) ごとに、**異変の有無を見ずに**、難易度の 3 形から一様に引く。乱数は、異変の有無を引く流れとは**別の流れ** (同じ種から作る) を使う。種つきなので `?seed=N` で再現できる。
2. **R-S2 次に異変の有無を引く** (今のまま `ANOMALY_RATIO` = 0.5)。
3. **R-S3 その形で出せる問題だけが候補**: 枠の形 s に対して、候補は次のとおり。
   - 正常な問題: 全部 (正常な問題は、どの形のカードも、検証器の規則を満たす数字で作れる。R-D4)。
   - 異変の問題: s で**見える** (R-S4) もの。
   そのうえで、今の `draw` の決まり (会社の重複なし・段・履歴) を、同じ増加路で当てる。
4. **R-S4 見える条件** (検証器に足す。**カードの検出可能性の検査**): 異変の問題 p が形 s で見えるとは、次の 2 つを満たすこと。
   - (V1) `anomaly.places` の全セルが、s のカードに載っている。`places` は「カードの上で食い違いが見えるセル」で、二次の症状 (カードの外のセル) は書かない (R-D3)。**今のデータの `places` は二次の症状も持つ** (台帳 H-05 = `receivablesChange` + `cashEnding` など) ので、V1 を今のデータにそのまま当てると、むずかしい 16 種類のうち見えるのは 7 種類 (H-03・H-13・H-17・H-22・H-23・H-24・H-28) だけになる (**測った**: `places-fit.ts`)。**カードのために異変の問題を作り直すとき、`places` を書き直す** (カードの外のセルを外し、欠けるときは V2 を満たすカード上のセルを入れる)。今の問題をそのまま使えるかは台帳 §2 が数える。
   - (V2) `anomaly.expectedRules` のうち種類の主な規則 (`primaryRules`) の 1 つが落とした違反の `paths` が、**s のカードに載るセル**だけで足りる。ただし、正常では必ず等しい別のセル (別名) で足りるものは載っているとみなす。別名は、検証器の `xdoc-*`・`sum-*` の規則 (正常では 2 つのセルが必ず等しい) から選ぶ。今の形で要るのは E2 の棒の 1 組だけ: `ir.results.netSales.{previous,current}` (棒の規則 `chart-bars` が読む) = `tanshin.incomeStatement.{previous,current}.netSales` (規則 `xdoc-results-net-sales`)。台帳 §2 が、種類ごとに別名の要不要を表にする。
   - 短信と IR のあいだの食い違い (台帳の資料間) は、V1・V2 の帰結として、両側のセルを載せる形でだけ見える (別に条件は足さない)。E2 のように、やさしいの形が IR のセル (`ir.results.chart`) を持つのは、同じ理由で許す。
5. **R-S5 形ごとの異変の候補** (データの検査。起動時に落とす。今の `canDraw` と同じ作法):
   - (a) **出題が必ず作れること**: 難易度のどの形にも、**その形で見える異変の問題を持つ会社が 8 社以上**ある。**導いた**: 8 枠が同じ形の異変になっても、別々の会社を割り当てられる (8 社以上あれば、先の枠が埋めた会社は多くて 7 社なので、次の枠に使える会社が残る)。満たさないと落ちる周がある: 例えば候補が 3 社だけなら、同じ形の異変の枠が 4 つ以上になる周 (二項分布 n = 8・p = 1/3 × 1/2 = 1/6 で 3.1%・形 3 つで約 9%) で、会社が尽きて「出題できません」になる。7 社でも落ちるのは 8 枠すべてが同じ形の異変のとき ((1/6)^8 ≈ 0.00006%) だけだが、確実に作れる条件として 8 社以上を求める。(a) は (b) を満たせば成り立つ (10 社 ≥ 8 社)。
   - (b) **会社から答えが漏れないこと**: 難易度の**全 10 社**が、どの形についても、異変の問題と正常な問題の**両方**を持つ (形ごとの `bothSided`。今の `draw` が会社ごとにすでに当てている条件を、形ごとに広げる)。正常な問題はどの形にも使えるので、実際に足すのは**異変の問題**で、**会社 10 社 × 形 3 つ = 30 問以上**が要る。満たさないと、「この会社のこの形は、異変の問題が無い (いつも正常)」を覚えた遊び手が、その枠だけ答えを知る。
   - (d) **会社 × 期から答えが漏れないこと**: カードには期 (`header.periodLabel`) が出る。**異変の問題は、同じ会社・同じ期の正常な問題から、異変 1 つを加えて作る**。同じ (会社, 期) に、正常な問題と、形ごとの異変の問題が必ずそろう。今のデータは、異変の問題と正常な問題で期が違う (例: やさしいの c01 は 2025 年 3 月期が正常で、2024・2023 年 3 月期が異変。むずかしいの c09 は 2020・2021 年が異変、2022 年が正常。監視役が確かめた) ので、数周遊んだ遊び手が「この会社のこの期は必ず正常、ほかの期は必ず異変」を覚えると、異変を探さずに答えられる。同じ (会社, 期) の正常な問題があれば、遊び手は正常を覚えるほど異変が見える (要件の「正常を覚えられる」と 8番ライクの芯)。**期を足して (会社, 期) を増やす場合も、どの (会社, 期) にも正常と異変の両方を持たせる**。
   - (c) 1 形が見せる異変の**種類は 4 つ以上** (**仮定**: 1 周 8 枠で 1 形に当たるのは約 2〜3 枠、異変の枠は半分で約 1〜1.5 枠。見つけた異変は次から出にくい (要件) ので、1 形が持つ種類が少ないと、数周で同じ種類に当たる)。
   - 帰結: 難易度ごとの問題は、1 つの (会社, 期) につき 正常 1 + 形ごとの異変 3 = 4 問で、10 社 × 1 期なら **40 問** (異変 30・正常 10。要件の 25 問以上より多い。**導いた**: 10 × (1 + 3))。期を足すと 40 問ずつ増える。(b) は (d) を満たせば成り立つ。むずかしいは、各形に全社で起こせる種類 (H1 = H-01、H2 = H-23・H-28、H3 = H-22・H-24。anomalies.md §5 の「適する会社」が全社) があるので、会社 × 形が埋まる。やさしいの形のずれの種類 (誤字・単位・欠落・並び・書式・期末日。台帳 §2) は、`cardEdits` が形を 1 つ持つ (§1.6。1 つの異変は 1 つの編集) ので 1 形でしか見えない。会社ごとに形ごとに 1 問 (計 30 問) を作る。
6. **R-S6 そろっていることの確かめ** (テスト): 種つきの乱数で 1 万周 (= 8 万枠) を出題し、**枠の位置を区別せず**、異変の枠 (約 4 万) と正常の枠 (約 4 万) のそれぞれで、各形の出現率が 1/3 から ±1.5 ポイント以内に収まること。**導いた**: 4 万枠での標準誤差は √((1/3)(2/3) ÷ 40,000) = 0.24 ポイントなので、1.5 ポイントは約 6 倍の余裕。外れたら、形の分布が異変の有無で偏っている (R-S3 の候補の偏り) ので、出題を直す。

**見本 (0 社目)**: 毎周の最初に、見本の問題 (正常。出題のプールに入れない `sample.json`) から、**難易度の 3 形すべての正常なカード**を 1 枚ずつ (むずかしいは 3 組) 見せる。見本は 1 つの問題から `deriveCards` で作る (出所は 1 つ)。「正常は 3 通り」と一目で分かる掲示は §3 (画面の流れ) で決める。

### 1.6 形のずれの異変を表す `cardEdits` (問題データの追加)

数字・文のセルを変える異変は今の問題データだけで表せる。**欄の形そのもののずれ** (行の欠落・並びの入れ替え・数字の書式) は、今の `labelOverrides` (科目名)・`unitOverrides` (画面単位)・`signOverrides` で足りないので、問題データに 1 つ足す (**設計**。型の細部はデータの Task が決める。ここは仕様):

```ts
interface Problem { /* …今のまま… */ cardEdits?: CardEdit[]; } // 正常な問題には無い
type CardEdit =
  | { shape: ShapeId; card: number; slot: string; op: 'drop' }                       // 欄の欠落
  | { shape: ShapeId; card: number; op: 'swap'; slots: [string, string] }             // 並びの入れ替え
  | { shape: ShapeId; card: number; slot: string; op: 'format'; style: 'no-comma' | 'comma-shift' }  // 数字の書式
  | { shape: ShapeId; card: number; slot: string; op: 'unit'; unit: string };         // 欄の単位の語
```

- `deriveCards` が適用する。編集された欄が見える形 (`shape`) でだけ、その問題は出せる (R-S4 V1)。
- 1 つの異変は 1 つの編集 (台帳 §2 の G6 を引き継ぐ: 異変は 0 個か 1 個)。

### 1.7 確かめたこと (**測った**)

再現: リポジトリの根から、`docs/plans/redesign/spike-design/` のコード (製品のコードではない) を実行する。

| 確かめたこと | 結果 | 方法 |
| --- | --- | --- |
| 今の正常な問題 28 問 (やさしい 12・むずかしい 16) が、検証器の全規則を満たす | 違反 0 件 | `node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/normals-check.ts` |
| 正常 28 問の非支配株主持分 | すべて 0 | 同上 (参考。どの形にも使わない) |
| 正常 28 問が、売上高と営業利益の主張 (`ir.statements.claims`) を持つ | 28/28 | 同上 (E1・E2 の見出し語を作れる) |
| 配当が 0 の正常な問題 | 6/28 | 同上 (配当を見せる形を作らなかった理由: 配当の無い会社に出せない) |
| 1 つの規則が 1 回の評価で読むセル (検証器の規則 128 件) | 規則ごとの組を取り出せた | `shape-fit.ts` の前半 (`Reader` の `get`・`raw` を差し替えて記録) |
| むずかしいの 3 形 (§1.4) の上限 (数字 4・文 3) と、収まる見え方の分類 | 上限超えなし。分類は **14 / 候補 14**: H1 = C06・C07・C08・C14、H2 = C02・C03・C11・C18、H3 = C01・C04・C05・C07・C09・C10・C12 (C07 は H1 と H3 の両方) | `node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/shape-fit.ts`。分類と台帳の対応は `shape-fit.ts` の `CLASSES`。**C02・C05 は疑似セル (科目名・名前の並びを 1 セルに置いた)。C14・C18 も文のセルを疑似セルで置いた** |
| 今のデータの `places` に V1 を文字どおり当てたときに見えるむずかしいの種類 | 16 種類のうち 7 (H-03・H-13・H-17・H-22・H-23・H-24・H-28)。**カードに合わせて `places` を書き直す前提**で §1.4 の 14 分類を数えた (V2 の数) | `node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/places-fit.ts` |
| 3 形を選ぶ探索 | 18 の候補から、14 分類を収める 3 形が見つかる (90 秒のランダムな貪欲法を 2 回。どちらも 14) | `spike-design/hard-search.mjs` (入力は `rule-cells.ts` が出す JSON) |

---
