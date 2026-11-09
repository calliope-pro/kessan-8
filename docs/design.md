# 基本設計

状態: **確定** (2026-11-04、Task #21 完了。#36 で合意し、Task #21 の包括レビューの不可の指摘 (#52) の再確認を経た)。凍結した要件 ([requirements.md](requirements.md))・方針 ([charter.md](charter.md)) のもとで、全員が前提にする設計を 1 か所にまとめる。後続の Task (#22 問題・#27 画面・#28 遊びの流れ・#30 公開) は、この文書の型・ディレクトリ・遷移・テストの置き場に従う。変えたいときは、この文書を直す提案をチケットに出す。

用語は [GLOSSARY.md](../GLOSSARY.md)。「異変」「正常」「資料束」はそこで定義した意味で使う。

## 1. 設計の前提 (要件と方針から)

| 前提 | 出所 |
| --- | --- |
| 静的サイト (Vercel、出力 `dist`)。サーバも外部への通信も持たない | 要件の「公開」・方針の「セキュリティ」 |
| 1 問 = 架空の 1 社の資料束 (決算短信 5 画面 + IR スライド 5 画面)。遊び手は異変の「あり・なし」を答える | 受け入れ条件 2 |
| 8 社連続で正解するとクリア。間違えたら最初の会社に戻る | 受け入れ条件 3 |
| 答えたあと、異変のあった問題は、場所と内容を示す | 受け入れ条件 4 |
| 問題は難易度 (やさしい・むずかしい) ごとに 25 問以上。異変の無い問題は会計の整合をすべて満たす | 受け入れ条件 5 |
| PC の幅でもスマホの幅 (320〜414 px) でも横にはみ出さない | 受け入れ条件 9 |
| 初回の読み込みが 1 MB 未満 | 方針の「品質の水準」 |
| 問題の数字・異変の定義・答え合わせの文言は、問題のデータ 1 か所から作る (single source of truth) | 方針の原則 |
| 公開後は誤りの訂正だけ。問題の追加はデータを足すだけで済む形にする | 方針の原則「保守性」 |

## 2. 技術の選定 (理由つき)

選んだ理由は、方針の原則と、効く「高くつく失敗」(charter の 1〜4) で書く。選ばなかった案も残す。

| 項目 | 選んだもの | 理由 | 選ばなかった案 |
| --- | --- | --- | --- |
| 言語 | TypeScript (strict) | 型で境界を示す (原則「AI エージェントとの親和性」)。問題データの形 (§4) を型にして、画面・検証器・答え合わせが同じ型を読む (失敗 2 を防ぐ)。試作の検証器 (docs/plans/spike/verify.py) の規則が、そのまま型つきの関数に移せる | JavaScript のみ (データの形を型で縛れない) |
| ビルド・開発サーバ | Vite | 静的出力 (`dist`) が既定で、Vercel の静的サイトにそのまま載る。JSON の取り込みとコード分割が標準 (§4.3)。Vitest と設定を共有する | webpack (設定が重い)、フレームワーク一体型 (Next.js など。静的サイトにサーバ側の機能は要らない) |
| 画面の作り | フレームワークなし (素の TypeScript + DOM)。状態は純粋な関数 (§5) で持ち、画面は状態から DOM を作る関数 | 画面は十数種で、状態は小さい。初回 1 MB 未満に余裕を持たせ (ライブラリを足さない)、依存を最小にする (原則「セキュリティ」「保守性」)。状態遷移を DOM から切り離すので、単体テストで確かめられる (原則「テスト容易性」) | React・Preact・Svelte など (画面の複雑さに対して過剰。UI/UX の案 (#19) が固まる前に、見た目の作りかたを縛らない。#19 の案が素の DOM で足りないと分かったら、Preact など小さな代替への切り替えを提案する) |
| 単体テスト | Vitest | Vite と設定を共有でき、TypeScript をそのまま実行する。純粋な関数 (状態遷移・検証器・出題) と、問題データ全件の検証 (§7) を同じ道具で回す | Jest (TypeScript と ES モジュールの設定が増える) |
| E2E | Playwright (`@playwright/test`) | 方針で指定 (受け入れ条件 1〜4・9 を 1 本ずつ、スマホ幅 375 px で 1 本)。ブラウザごとの projects を持ち、GitHub Actions に標準の手順がある | Cypress (方針の指定外。複数ブラウザの扱いが弱い) |
| データの形式 | JSON (1 問 1 ファイル) | データを足すだけで問題を増やせる (原則「保守性」)。AI が書いても diff が小さく、検証器が全件を読める。Vite がそのまま取り込む | TypeScript のオブジェクト (データの修正のたびに型検査とビルドが走る)、1 つの大きな JSON (diff が大きく、並列に作れない) |
| 公開 | Vercel の静的サイト (`vercel.json`: `outputDirectory: dist`) | 要件 | — |
| CI | GitHub Actions | 要件 (Task #21 の受け入れ条件) | — |
| ライセンス | MIT | 要件 | — |

### 2.1 npm の依存 (理由つき)

実行時の依存 (`dependencies`) は **0 件**。画面に載るコードは、自分たちのコードだけにする。開発用 (`devDependencies`) は次の 5 件だけで、増やすときはチケットで理由を書く。

| パッケージ | 理由 | 使う場所 |
| --- | --- | --- |
| `typescript` | 型検査 (`tsc --noEmit`)。型が境界の役を果たす | CI・`npm run typecheck` |
| `vite` | ビルド・開発サーバ・プレビュー | `npm run build`・`dev`・`preview` |
| `vitest` | 単体テスト・問題データ全件の検証 | `npm test` |
| `@playwright/test` | E2E (ブラウザ操作) | `npm run test:e2e` |
| `@types/node` | 設定ファイル・テスト・`scripts/` が使う Node の API (`node:fs` など) の型。型検査を通すのに要る (実行時のコードには入らない) | `tsc --noEmit` |

バージョンは `package-lock.json` で固定し、CI は `npm ci` だけを使う (再現できる、勝手に更新されない)。

## 3. ディレクトリ

```
/
├─ index.html               # Vite の入口 (lang="ja"・viewport)
├─ package.json / package-lock.json / tsconfig.json / vite.config.ts
├─ vercel.json              # 静的・出力 dist・セキュリティヘッダ
├─ playwright.config.ts     # E2E の設定 (ブラウザ・幅は §7)
├─ scripts/check-dist-size.mjs  # ビルド後の dist の転送量の予算を確かめる (§8)
├─ LICENSE                  # MIT
├─ .github/workflows/ci.yml # 型検査・単体テスト・ビルド・E2E
├─ docs/                    # requirements・charter・design・adr/・plans/
├─ src/
│  ├─ main.ts               # 入口: 画面を DOM に取り付ける
│  ├─ domain/               # DOM を使わない純粋な TypeScript (単体テストの主な対象)
│  │  ├─ types.ts           #   問題データの型 (§4。型の正本)
│  │  ├─ labels.ts          #   項目名の日本語表示 (項目キー → 表示名) と、path → 項目キーの関数 (§4.1)
│  │  ├─ rng.ts             #   種つきの乱数 (mulberry32。§5.3)
│  │  ├─ config.ts          #   ゲームの設定値 (§6)
│  │  ├─ game.ts            #   状態遷移 (reducer、§5)
│  │  ├─ draw.ts            #   出題 (プールから 8 社を引く、乱数は差し替え可)
│  │  ├─ answer.ts          #   判定と答え合わせの材料 (問題データから作る。文言は持たない)
│  │  ├─ screen.ts          #   ScreenRef (資料束の 1 画面。保存する状態の型。ui/viewer-port.ts は再エクスポート)
│  │  ├─ pool.ts            #   問題の一覧 → 難易度ごとのプールと ID の引き出し (src/data/index.ts の純粋な部分)
│  │  ├─ sample.ts          #   見本の型 (§4.3)
│  │  ├─ marks.ts           #   印と異変の場所の照合 (R3)
│  │  ├─ storage.ts         #   保存先の最小の形と、例外を出さない読み書き
│  │  ├─ session.ts         #   走行 (状態の全体) の保存・読み出し (§5.4)
│  │  └─ records.ts         #   記録 (P5)・答えた履歴 (P3)・見本の済 (§5.4)
│  ├─ verifier/             # 会計の整合の検証器 (Task #23)。問題データ全件に当てる
│  ├─ data/
│  │  ├─ companies.json     #   架空の会社の設定 (Task #24)
│  │  ├─ anomaly-kinds.json #   異変の種類の一覧 (Task #24)
│  │  ├─ problems/easy/*.json, problems/hard/*.json  # 問題 (Task #25・#26)。1 問 1 ファイル
│  │  └─ index.ts           #   読み込み (全件を取り込み、難易度ごとのプールにする)
│  ├─ ui/                   # DOM を作る画面 (Task #27・#28)。状態 → DOM の関数。問題に依らない固定の文言は ui/messages.ts。資料束の表示との接ぎ目は ui/viewer-port.ts
│  ├─ testing/              # 試験用の問題・会社 (単体テストと E2E の `npm run build:e2e` だけが使う。本番のバンドルに入れない)
│  └─ styles/               # CSS
├─ e2e/                     # Playwright (E2E)
└─ public/                  # 静的ファイル (必要になったら。外部の素材は置かない)
```

- 単体テストは、対象の隣に `*.test.ts` で置く (§7)。
- `domain/` と `verifier/` は DOM・`window`・ネットワークを使わない。依存の向きは `ui/` → `verifier/` → `domain/` と `ui/` → `domain/` だけ (`domain/` と `verifier/` から `ui/` は読まない)。**`ui/` は `verifier/` の「規則の式の文字列を作る関数」を読んでよい** (答え合わせの根拠の式、UX の部品 R2。式を `ui/` に書き写して二重に持たないため) (R2 は期限のため外した (experience.md §6.1) ので、いまの `ui/` は `verifier/` を読んでいない)。
- 1 ファイルは小さく保つ (目安 300 行)。文脈に入り切らない大きなファイルを作らない (原則「AI エージェントとの親和性」)。

## 4. 問題データの形

会社・期・決算短信 5 画面・IR スライド 5 画面・異変の指定・答え合わせの文言を、**1 問のデータ 1 か所**に持つ。画面はこのデータから描き、判定と答え合わせ (§5) もこのデータから作る。画面の側に数字や文言を書かない。

### 4.1 考え方

- **画面に出る数字は、すべて問題データの数値**。比率・増減率・合計も、表示用に計算せず、データに値として持つ。理由: 異変は「計算が合わない」ことそのものなので、表示のたびに計算し直すと異変が消える。正常な問題で値が合っていることは、検証器 (Task #23) が全件に当てて確かめる (方針の失敗 1)
- **異変のある問題は、正常な資料の数字を 1 か所以上差し替えた資料**。何を差し替えたか (場所) と、なぜ異変か (文言) を `anomaly` に書く。`anomaly` が `null` なら正常
- **場所は `path` で指す**。`path` は資料の中の位置で、データの入れ子のキーを `.` でつないだもの (多くは先頭が画面の ID。ただし先頭が画面の ID でない場所がある: `header` (見出し)・`columnDates.<画面>` (列見出しの日付。その画面に出る)・`dates` (日程。サマリーに出る)・`statements.<i>` (IR の文章。`statements[i].slide` の画面に出る)。**場所がどの画面に出るかは、path の先頭から導かず、ビューアの `screenOfPlace(problem, place)` (`ui/viewer/screen-of.ts`) が画面の中身から引く**) (例: `incomeStatement.current.ordinaryIncome`、配列の要素は添字: `segments.items.0.netSales.current`)。画面は `<doc>.<path>` (例: `tanshin.incomeStatement.current.ordinaryIncome`) を、該当のセルの `data-path` に、項目名を出す要素には項目キーを `data-item-key` に持たせる。答え合わせで強調する場所と、データの異変の場所が、同じ文字列で結ばれる (方針の失敗 2)
- **見出しの場所**: 社名・期・単位は、どの画面の下にも無い資料の見出し (`header`) で、`header.companyName`・`header.periodLabel`・`header.unit` と書く。見出しはその資料のすべての画面の上部に出る。答え合わせで「その場所の画面へ移る」ときは、`header` で始まる場所は、その資料の 1 画面目へ移って、そこの見出しを強調する (`screenOfPlace(problem, place)`。どの場所も、選んだ画面に強調される要素が 1 つ以上あることを、本物の問題の全部の場所で単体テスト (`ui/viewer/screen-of.test.ts`) が確かめる)
- **項目キー (itemKey)**: 項目名は「行」に付き、`path` は「値」を指すので、行の名前を指すキーを 1 つの文法で決める。`path` から、`previous`・`current`・`forecast`・`actual` の段 (期・予実の列) を取り除き、末尾が `changeRate`・`amount` ならそれも取り除いた残りを、資料の種類を頭に付けて項目キーとする。例: `tanshin.incomeStatement.current.ordinaryIncome` → `tanshin.incomeStatement.ordinaryIncome`、`tanshin.summary.ordinaryIncome.changeRate` → `tanshin.summary.ordinaryIncome`、`ir.segments.items.0.netSales.current` → `ir.segments.items.0.netSales`、`ir.outlook.forecast.netSales` と `ir.outlook.actual.netSales` → どちらも `ir.outlook.netSales` (予想と実績は同じ行の別の列)。短信のサマリーと損益計算書の経常利益は別の項目キーで、別の表示名を持てる。この変換は `domain/labels.ts` の関数 `itemKey(doc, path)` だけが行い、`labels.ts` の表示名の表と `labelOverrides` のキーは、どちらも項目キー
- **単位**: 金額は百万円 (百万円未満切捨ての整数)、比率は % (小数第一位)、1 株当たりは円。符号は数値の符号で持ち、表示 (△) は 1 つの整形関数 (`ui/format.ts`) だけが決める
- **見た目の異変**は、資料の見出し (`header`) の文字列と、項目名の差し替え (`labelOverrides`、キーは項目キー) で表す。項目名の標準は `domain/labels.ts` にあり、正常な問題には `labelOverrides` が無い
- **同じ事実を 2 か所に書かないもの**: 異変の系統は `AnomalyKind.family` だけが持つ (`Anomaly` には書かない。系統は `kind` から引く)。複製が避けられないもの (見出しの社名 = `Company.name`、セグメント名 = `Company.segmentNames`、期の表記 = `fiscalYear` と決算期末の月から作る表記) は、異変のために別の値を入れられる形にしてあるので、**正常な問題では一致することを検証器が確かめる**
- **IR の単位と換算**: 短信の金額は百万円。IR の金額は `Company.irUnit` の単位で持つ。億円の会社 (`c03`・`c05`・`c06`・`c08`・`c10`) の IR は、**短信の百万円 ÷ 100 を小数第一位まで四捨五入した値** (0.5 は遠い側へ。12,456 百万円 → 124.6 億円) を持ち、`header.unit` は `億円`。IR の増減率・構成比などの比率は、短信の百万円の値から計算した値を持つ (単位に依らず同じ値になる)。**正常な問題では、それが IR に載る金額 (億円は 0.1 億円に丸めた値) から再計算した値にも一致しなければならない** (遊び手は IR の金額から検算する。検証器 `verify:data` が正常な問題だけに致命として当てる: `ir-display-*`。異変の問題には当てない)。作る側の手引き: 億円の会社では、比率に使う金額 (売上高・売上総利益・営業利益・セグメントの売上高と利益) を 10 百万円の倍数にすると、両方が自動で一致する。IR の中の式 (純有利子負債 = 有利子負債 − 現金など) は表示値どうしで完全に一致させる。**検証器は、億円の値を 10 倍した整数 (`Math.round(x × 10)`) にしてから比べる** (浮動小数の誤差のため: JavaScript で 124.6 − 30.2 は 94.39999999999999 になり、94.4 と `===` で一致しない。測った) (作る側が、丸めても一致する値を選ぶ。anomalies.md G2・G8)
- **セグメント**: 会社によって 2 つか 3 つ (`Company.segmentNames`)。短信の注記・IR のセグメント別は、同じ数・同じ並びで持つ。数が食い違うのは異変 (H-19)
- **見た目の異変の上書き**: 項目名は `labelOverrides`、画面ごとの単位は `unitOverrides` (キー `<doc>.<画面の ID>`)、負の数の記号は `signOverrides` (キー `<doc>.<path>`)。どれも正常な問題には無い。画面は、上書きがあればそれを表示し、無ければ標準 (項目名は `labels.ts`、単位は `header.unit`、負の記号は `ui/format.ts` の標準 △) を表示する
- **文章と数字の矛盾 (文章の異変)**: IR の文章は `statements` に、それが主張する数字の動き (`claims`) と一緒に持つ。検証器は主張を短信の数字の動きと照らす。文章を自由に書いても、主張の構造が無ければ機械では確かめられない
- **日付**: `dates` (期末日・発表日・総会の日) と各画面の `columnDates` (列見出し) を ISO の文字列で持つ。表示の書式 (「2027年3月31日」) は `ui/format.ts` だけが決める
- **場所の指しかた**: 数字・文のセルは `path` (`header` で始まるものは資料の 1 画面目の見出し)。項目名 (行の名前。科目名の誤字、資産の部の科目名の取り違え) は `itemKey` で指す。答え合わせは `data-item-key` の要素を強調する。検証器は `itemKey` が `labels.ts` の項目キーにあることを確かめる
- **期待集合**: 異変の問題は `anomaly.expectedRules` に、落ちるべき規則 ID の集合を持つ。検証器は、実際に落ちた集合との一致、種類の `primaryRules` のうち 1 つ以上を含むこと、種類の `allowedRules` に収まること、の 3 つを確かめる (anomalies.md G1)。変えたセルによって落ちる規則が変わるので、種類ごとでなく問題ごとに持つ
- キーは英語 (型・検証器・`path` で扱いやすい)。日本語の表示名は `labels.ts` が 1 か所で持つ

### 4.2 型

型の正本は `src/domain/types.ts`。次のコードブロックはその全文で、**一字違わず同じ**であることを単体テスト (`src/domain/design-sync.test.ts`) が確かめる。直すときは両方を直す。

<!-- types:start -->
```ts
// 問題データの型 (正本)。docs/design.md §4.2 に同じ全文を載せ、src/domain/design-sync.test.ts が一致を確かめる。
// 金額は百万円 (百万円未満切捨ての整数)。比率は % (小数第一位)。1 株当たりは円。符号は数値の符号で持つ。

/** 難易度。 */
export type Difficulty = 'easy' | 'hard';

/** 資料の種類。決算短信 = tanshin、IR スライド = ir。 */
export type DocKind = 'tanshin' | 'ir';

/** 決算短信の 5 画面 (この順に並べる)。 */
export const TANSHIN_SCREENS = ['summary', 'balanceSheet', 'incomeStatement', 'cashFlow', 'notes'] as const;
export type TanshinScreenId = (typeof TANSHIN_SCREENS)[number];

/** IR スライドの 5 画面 (この順に並べる)。 */
export const IR_SLIDES = ['highlights', 'results', 'segments', 'outlook', 'supplement'] as const;
export type IrSlideId = (typeof IR_SLIDES)[number];

/** 異変の系統 (docs/plans/anomalies.md §5 の「系統」。見た目・計算・文章・会計・資料間・注記・手口)。 */
export const ANOMALY_FAMILIES = ['appearance', 'calculation', 'text', 'accounting', 'cross-document', 'notes', 'tactics', 'card-form'] as const;
export type AnomalyFamily = (typeof ANOMALY_FAMILIES)[number];

/** 系統 → 出す難易度。やさしい = 見た目・計算・文章、むずかしい = 会計・資料間・注記・手口・形のずれ (card-form。docs/design-v2.md §2.3)。受け入れ条件 6 の「やさしいは見た目と計算、むずかしいは会計と資料間を多め」は、この表で数える。 */
export const FAMILY_DIFFICULTY: Record<AnomalyFamily, Difficulty> = {
  appearance: 'easy',
  calculation: 'easy',
  text: 'easy',
  accounting: 'hard',
  'cross-document': 'hard',
  notes: 'hard',
  tactics: 'hard',
  'card-form': 'hard',
};

/**
 * 形のずれの異変 (欄の欠落・数字の書式・単位の語・欄の重複・添え字・数字の字・符号・期末日・見出し語) を、問題データで表す編集 (docs/design-v3.md §1.6)。
 * 形は難易度ごとに 1 つ。1 つの異変は 1 つの編集。card は常に 0 (カードと資料は 1 つの欄の並び)。slot は形の欄の key。
 * suffix・glyph・sign・day は表示だけを変える (問題データのセルは変えない)。
 */
export type CardEdit =
  | { card: 0; slot: string; op: 'drop' }
  | { card: 0; slot: string; op: 'format'; style: 'no-comma' | 'comma-shift' }
  | { card: 0; slot: string; op: 'unit'; unit: string }
  | { card: 0; slot: string; op: 'dup' }
  | { card: 0; slot: 'opPrev' | 'opCurr'; op: 'suffix'; word: '前期' | '当期' }
  | { card: 0; slot: string; op: 'glyph'; at: number }
  | { card: 0; slot: string; op: 'sign' }
  | { card: 0; slot: 'period'; op: 'day'; day: 32 }
  | { card: 0; op: 'headline'; word: string };

/** CardEdit の op の一覧。 */
export const CARD_EDIT_OPS = ['drop', 'format', 'unit', 'dup', 'suffix', 'glyph', 'sign', 'day', 'headline'] as const;

/** card-relation の 5 つの検査の名前 (docs/design-v3.md §1.2)。 */
export const RELATION_CHECKS = ['R-dir', 'R-margin', 'R-range', 'R-ne', 'R-lt'] as const;
export type RelationCheck = (typeof RELATION_CHECKS)[number];

/** 前期と当期の組。 */
export interface Pair {
  previous: number;
  current: number;
}

/** 前期比つきの項目。changeRate は前期比の増減率 (%)。 */
export interface Change extends Pair {
  changeRate: number;
}

/** 架空の会社 (src/data/companies.json。設定は docs/plans/companies.md)。実在の企業名・人物は使わない。 */
export interface Company {
  id: string;
  name: string;
  /** 証券コード (架空。08xx)。 */
  securitiesCode: string;
  industry: string;
  /** 事業セグメントの名前 (2 つか 3 つ)。短信・IR のセグメントの数と並びは、これと同じ。 */
  segmentNames: string[];
  /** 決算期末の月 (3 = 3 月期)。 */
  fiscalYearEndMonth: number;
  /** IR の金額の単位。百万円 = 短信と同じ。億円 = 短信の百万円 ÷ 100 を小数第一位まで四捨五入した値 (docs/design.md §4.1)。 */
  irUnit: '百万円' | '億円';
  /** 社章 (幾何図形の記号 1 文字。画像は使わない)。 */
  emblem: string;
  /** 社色と淡い色 (社色は白に対するコントラスト比 4.5 以上を計算済み。companies.md §4)。 */
  colors: { main: string; light: string };
  /** 事業の説明 1 文 (導入の 1 行の出所。数字・増減の語を含めない)。UX の部品 P2 を採るとき必須。 */
  business?: string;
}

/** 異変の種類の一覧 (src/data/anomaly-kinds.json。定義は docs/plans/anomalies.md)。 */
export interface AnomalyKind {
  id: string;
  family: AnomalyFamily;
  /** 遊び手に見せる名前 (答え合わせで使う)。 */
  name: string;
  /** 種類ごとの一般的な見かた 1 行。UX の部品 R7 を採るとき必須。 */
  tip?: string;
  /** 主な規則: この種類を定義する検証器の規則 ID。異変の問題では、このうち 1 つ以上が必ず落ちる。 */
  primaryRules: string[];
  /** 許容集合: この種類の異変で落ちてよい規則 ID (primaryRules を含む)。同じ原因で必然的に付随して落ちる規則を含む。 */
  allowedRules: string[];
  /** この種類の異変で落ちてよい card-relation の検査 (docs/design-v3.md §1.2 の表。欄の drop は、落とした欄を読む検査をコードで足す)。無ければ空。 */
  relationChecks?: RelationCheck[];
  /** 台帳 v3 の種類の印 (docs/design-v3.md §2)。印のある種類だけを、種類ごとの問題の数 (5 問・会計と資料間は 7 問) の検査で数える。 */
  ledger?: 'v3';
  /** この種類の異変が使う cardEdits の op (docs/design-v3.md §2.2 の「変えるもの」。E-19・H-31 = drop、E-22・H-33 = dup ほか)。cardEdits を持つ異変の問題は、種類の editOp と同じ op だけを持つ。cardEdits を使わない種類は持たない。 */
  editOp?: CardEdit['op'];
}

/** 資料の見出し。見た目の異変 (社名の誤植・単位違い・期の表記違い) はここに入る。 */
export interface DocHeader {
  companyName: string;
  /** Company.securitiesCode と同じ。 */
  securitiesCode: string;
  /** 例: 2027年3月期 */
  periodLabel: string;
  /** 資料の金額の単位。短信 = 百万円、IR = Company.irUnit。 */
  unit: string;
}

/** 貸借対照表 (期末 1 時点)。 */
export interface BalanceSheet {
  cash: number;
  receivables: number;
  inventories: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  tangibleAssets: number;
  investments: number;
  totalFixedAssets: number;
  totalAssets: number;
  payables: number;
  shortTermDebt: number;
  incomeTaxesPayable: number;
  otherCurrentLiabilities: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  capitalStock: number;
  capitalSurplus: number;
  retainedEarnings: number;
  totalShareholdersEquity: number;
  nonControllingInterests: number;
  totalNetAssets: number;
  totalLiabilitiesAndNetAssets: number;
}

/** 損益計算書 (1 期間)。 */
export interface IncomeStatement {
  netSales: number;
  costOfSales: number;
  grossProfit: number;
  sga: number;
  operatingIncome: number;
  nonOperatingIncome: number;
  nonOperatingExpenses: number;
  ordinaryIncome: number;
  extraordinaryGain: number;
  extraordinaryLoss: number;
  incomeBeforeTax: number;
  incomeTaxes: number;
  netIncome: number;
  netIncomeNonControlling: number;
  netIncomeParent: number;
}

/** キャッシュ・フロー計算書 (当期、間接法)。 */
export interface CashFlow {
  incomeBeforeTax: number;
  depreciation: number;
  interestDividendIncome: number;
  interestExpense: number;
  receivablesChange: number;
  inventoriesChange: number;
  payablesChange: number;
  otherAssetsChange: number;
  otherLiabilitiesChange: number;
  subtotal: number;
  interestDividendReceived: number;
  interestPaid: number;
  incomeTaxesPaid: number;
  operatingCashFlow: number;
  capex: number;
  otherInvestingChange: number;
  investingCashFlow: number;
  shortTermDebtChange: number;
  /** 長期借入れによる収入 (正)。財務活動の長期借入金は収入と支出を総額で別の行に出す (anomalies.md G4)。 */
  longTermBorrowings: number;
  /** 長期借入金の返済による支出 (負)。 */
  longTermRepayments: number;
  dividendsPaid: number;
  financingCashFlow: number;
  fxEffect: number;
  netChangeInCash: number;
  cashBeginning: number;
  cashEnding: number;
}

/** セグメント 1 つ分。name は Company.segmentNames と同じ。 */
export interface SegmentLine {
  name: string;
  netSales: number;
  profit: number;
}

/** 1 期間のセグメント情報。調整額は全社費用など (負の値)。 */
export interface SegmentInfo {
  /** Company.segmentNames と同じ数・並び。 */
  segments: SegmentLine[];
  adjustment: number;
  consolidatedNetSales: number;
  consolidatedOperatingIncome: number;
}

/** 決算短信の 5 画面目 (注記)。 */
export interface TanshinNotes {
  goingConcern: string;
  cashScope: string;
  segments: { previous: SegmentInfo; current: SegmentInfo };
  averageSharesThousand: number;
  bps: number;
  eps: number;
  subsequentEvents: string;
  /** 会計方針の変更等の記述 (「該当事項はありません。」か、変更の説明)。summary.accountingPolicyChange と食い違わない。 */
  accountingPolicyNote: string;
}

/** 決算短信 (5 画面)。 */
export interface Tanshin {
  header: DocHeader;
  /** 1 画面目: サマリー。 */
  summary: {
    netSales: Change;
    operatingIncome: Change;
    ordinaryIncome: Change;
    netIncomeParent: Change;
    /** 売上高営業利益率 (%)。 */
    operatingMargin: number;
    /** 自己資本当期純利益率 (%)。期首と期末の自己資本の平均で割る。 */
    roe: number;
    eps: number;
    totalAssets: number;
    netAssets: number;
    /** (参考) 自己資本 = 純資産合計 − 非支配株主持分。 */
    equity: number;
    equityRatio: number;
    bps: number;
    annualDividend: number;
    /** 当期の中間配当 (1 株当たり、円。中間配当を置かない会社は 0)。期末配当 = annualDividend − interimDividend。 */
    interimDividend: number;
    /** 前期の年間配当金 (円)。 */
    annualDividendPrevious: number;
    /** 前期の中間配当 (1 株当たり、円。無ければ 0)。前期の期末配当 = annualDividendPrevious − interimDividendPrevious。 */
    interimDividendPrevious: number;
    /** 配当金総額 (百万円)。 */
    dividendTotal: number;
    payoutRatio: number;
    /** 会計基準等の改正に伴う会計方針の変更の有無。 */
    accountingPolicyChange: boolean;
    /** 最下部の注意書き (正常 = 「決算短信は公認会計士又は監査法人の監査の対象外です」)。 */
    auditNote: string;
  };
  /** 日付 (YYYY-MM-DD)。期末日が決算期と合い、期末日 < 発表日 < 定時株主総会の日。 */
  dates: { periodEnd: string; previousPeriodEnd: string; disclosure: string; shareholdersMeeting: string };
  /** 各画面の列見出しの期末日 (YYYY-MM-DD)。正常は dates と同じ。 */
  columnDates: {
    balanceSheet: { previous: string; current: string };
    incomeStatement: { previous: string; current: string };
    cashFlow: { previous: string; current: string };
  };
  balanceSheet: { previous: BalanceSheet; current: BalanceSheet };
  incomeStatement: { previous: IncomeStatement; current: IncomeStatement };
  cashFlow: CashFlow;
  notes: TanshinNotes;
}

/** IR の文章の主張が見る数字。方向は、短信の数字の動きと照らす (docs/design.md §4.1)。 */
export const CLAIM_METRICS = [
  'netSales',
  'operatingIncome',
  'ordinaryIncome',
  'netIncomeParent',
  'forecastNetSales',
  'forecastOperatingIncome',
  'dividend',
  'operatingCashFlow',
  'interestBearingDebt',
] as const;
export type ClaimMetric = (typeof CLAIM_METRICS)[number];

/** 文章の主張: 数字の動き。zero は有利子負債が無いこと (「無借金」)。 */
export interface IrClaim {
  metric: ClaimMetric;
  direction: 'up' | 'down' | 'zero';
}

/** IR スライドの文章 1 つと、それが主張する数字の動き (文章と数字の矛盾を機械で確かめるため)。 */
export interface IrStatement {
  slide: IrSlideId;
  text: string;
  claims: IrClaim[];
}

/** グラフの棒 (棒の高さは、表示の数字と同じ単位の値)。軸の下端は 0 が正常。 */
export interface ChartBars {
  axisMin: number;
  previous: number;
  current: number;
}

/** IR スライド (5 画面)。金額は header.unit の単位 (億円なら小数第一位)。比率は短信の百万円の値から計算した値を出す。 */
export interface IrDeck {
  header: DocHeader;
  highlights: {
    netSales: { amount: number; changeRate: number };
    operatingIncome: { amount: number; changeRate: number };
    ordinaryIncome: { amount: number; changeRate: number };
    netIncomeParent: { amount: number; changeRate: number };
    annualDividend: number;
    payoutRatio: number;
  };
  results: {
    netSales: Pair;
    grossProfit: Pair;
    grossMargin: Pair;
    operatingIncome: Pair;
    operatingMargin: Pair;
    /** 棒グラフ (売上高・営業利益)。 */
    chart: { netSales: ChartBars; operatingIncome: ChartBars };
  };
  segments: {
    /** 短信のセグメントと同じ数・並び (欠けると資料間の食い違い)。 */
    items: { name: string; netSales: Change; profit: Change; salesShare: number }[];
    adjustment: Pair;
    consolidatedOperatingIncome: Pair;
  };
  outlook: {
    forecast: {
      netSales: number;
      netSalesChangeRate: number;
      operatingIncome: number;
      operatingIncomeChangeRate: number;
      capex: number;
      depreciation: number;
      annualDividend: number;
    };
    /** 比較用の当期実績。 */
    actual: { netSales: number; operatingIncome: number; capex: number; depreciation: number };
    /** 期末後の出来事 (金額つきの文)。無ければ null。短信の重要な後発事象が「該当なし」のときは null が正常。 */
    subsequentEvent: string | null;
  };
  supplement: {
    capex: { previous: number | null; current: number };
    depreciation: { previous: number | null; current: number };
    interestBearingDebt: Pair;
    cash: Pair;
    netDebt: Pair;
    equityRatio: number;
  };
  /** 文章と、それが主張する数字の動き。 */
  statements: IrStatement[];
}

/**
 * 異変の場所。数字・文のセルは path (先頭が画面の ID か header。例: incomeStatement.current.ordinaryIncome、header.companyName)。
 * 項目名 (行の名前。科目名の誤字など) は itemKey (docs/design.md §4.1 の項目キー)。
 */
export type AnomalyPlace =
  | { doc: DocKind; path: string }
  | { doc: DocKind; itemKey: string }
  /** 形のずれ (cardEdits) の場所: カードの slot の欄 (card は常に 0。docs/design-v3.md §1.6)。slot は欄の key か headline・frame・frame.period・period・irHead。欄の欠落 (drop) は、欠けた位置 (テンプレートのカードのその欄の位置)。 */
  | { doc: 'card'; card: 0; slot: string };

/** 異変の指定と答え合わせの文言。問題データのここが唯一の出所で、画面はこれを表示するだけ。 */
export interface Anomaly {
  /** AnomalyKind.id。系統 (family) は AnomalyKind が唯一の出所なので、ここには持たない。 */
  kind: string;
  /** 1 件以上。資料間の矛盾は食い違う両側の場所を並べる。 */
  places: AnomalyPlace[];
  /** 答え合わせの文言 (何がどう食い違っているか。数字を含める)。 */
  explanation: string;
  /**
   * 落ちるべき検証器の規則 ID の集合 (期待集合)。変えたセルによって落ちる規則が変わるので、問題ごとに持つ。
   * 検証器は、実際に落ちた集合とこれが一致すること、kind の primaryRules を 1 つ以上含み allowedRules に収まることを確かめる。
   */
  expectedRules: string[];
  /** 基の正常な問題の ID (同じ companyId・同じ header.periodLabel。docs/design-v2.md §2.8)。changed と一緒に持つ。 */
  base?: string;
  /** 基との差のセル `<doc>.<path>` (種類の作り方が決めたセルと、必然の再計算のセル。要素の過不足は要素のパス)。基との実際の差と一致させる。落ちた規則が変えたセルを読めば、許容集合に無くてもよい。 */
  changed?: string[];
}

/** 1 問 = 架空の 1 社の資料束。src/data/problems/<難易度>/<id>.json の中身そのもの。 */
export interface Problem {
  /** 例: easy-001。ファイル名と同じ。 */
  id: string;
  difficulty: Difficulty;
  /** Company.id。 */
  companyId: string;
  /** 決算期の年 (2027 = 2027年3月期)。 */
  fiscalYear: number;
  /** 難しさの段 (1 = 目立つ、3 = 紛らわしい)。正常な問題にも付ける。UX の部品 P1 を採るとき必須。 */
  tier?: 1 | 2 | 3;
  tanshin: Tanshin;
  ir: IrDeck;
  /** 項目名の差し替え (見た目の異変用)。キーは項目キー (docs/design.md §4.1)。正常な問題には無い。 */
  labelOverrides?: Record<string, string>;
  /** 画面ごとの単位の差し替え (見た目の異変用)。キーは `<doc>.<画面の ID>`、値は表示する単位の語。正常な問題には無い。 */
  unitOverrides?: Record<string, string>;
  /** 負の数の記号の差し替え (見た目の異変用)。キーは `<doc>.<path>`、値は表示する記号。正常な問題には無い。 */
  signOverrides?: Record<string, string>;
  /** 形のずれの異変 (カードの欄そのものの編集)。1 つの異変は 1 つの編集。正常な問題には無い。 */
  cardEdits?: CardEdit[];
  /** null = 正常。 */
  anomaly: Anomaly | null;
}
```
<!-- types:end -->

### 4.3 データの置き方と読み込み

- `src/data/problems/<easy|hard>/<id>.json`: 1 問 1 ファイル、中身は `Problem` そのもの。ファイル名 = `id`、置き場 = `difficulty`。この対応は検証器が確かめる
- `src/data/index.ts` が `import.meta.glob(..., { eager: true })` で全件を取り込み、難易度ごとのプールにする。60 問程度では、試作の測定 (資料束 1 問が gzip で約 2.6 KiB。docs/plans/tech-assessment.md §2) から約 160 KiB で、初回 1 MB の予算に収まる。超えそうなら、難易度ごとの遅延読み込みに切り替える (データの形は変わらない)
- 問題を足すときは JSON を足すだけ。画面・状態遷移・出題のコードは触らない (原則「保守性」)
- **見本** (P0): `src/data/samples/*.json` に `{ problem (anomaly: null), notes: 画面 ID → 注釈の文 }` で置く。**両方の難易度で共有するので、置くのは 1 ファイル** (書式は全難易度で同じ。UX の P0。experience.md §6.3 の 6・13。画面は最初の 1 件を読む)。`problems/` の外なのでプールに混ざらない。見本も正常な問題として `npm run verify:data` が検証し (hard・`ir-display-*`・見た目の差し替えが無いこと)、プールの問題と同じ会社 × 期にしてはならない
- **プールが満たす条件** (出題 §5.3 が必ず引けるための、データの側の約束。検証器が全件に当てる): 難易度ごとに、**異変のある問題と異変の無い問題の両方を持つ会社が `ROUNDS_TO_CLEAR` (8) 社以上**ある。問題数 25 以上 (要件) に加えてこの条件を、問題の制作 (Task #25・#26) の受け入れ条件にする
- **異変あり・なしの問題数の比** (N4): 難易度ごとに、異変のある問題の数が `anomalyRatio × 問題数` の ±3 問に収まる (25 問・比 0.5 なら 10〜15 問)。両面の会社の残りを片側で埋めて、片側が少なすぎる (例: 正常 8 問・異変 17 問) と、枠を先に決める出題 (§5.3) で正常の枠が 8 問からしか引けず、同じ問題に出会う。検証器が難易度ごとに確かめる (足りないときは `shortfalls`)
- 会社 (`companies.json`) と異変の種類 (`anomaly-kinds.json`) は別ファイルで、問題から ID で参照する。名前の衝突確認 (実在の企業名と同じでないこと) は会社の設定 (Task #24) の責務

### 4.4 答え合わせの作り方

`domain/answer.ts` の判定は、`problem.anomaly` だけを見る。

| 遊び手の答え | `anomaly` | 結果 |
| --- | --- | --- |
| 異変あり | あり | 正解。`places` の場所を強調し、`explanation` と、種類の名前 (`anomaly-kinds.json` の `name`) を示す |
| 異変あり | `null` | 不正解。異変が無かったことを示す (固定の文言は `ui/messages.ts`) |
| 異変なし | `null` | 正解 |
| 異変なし | あり | 不正解。`places` を強調し、`explanation` を示す |

受け入れ条件 4 (異変のあった問題は場所と内容を示す) は、正解でも不正解でも同じ表示になる。問題に依る文言を作る場所は `explanation` だけで、`answer.ts` は文言を持たず、判定の結果 (正解か・強調する場所・`explanation`・種類の名前) を返すだけ。問題に依らない固定の文言 (「異変は無かった」など) は `ui/messages.ts` の 1 か所に置く。

### 4.5 異変の系統と難易度、異変の一覧 (anomalies.md) の扱い

異変の一覧 (docs/plans/anomalies.md、Task #24 の #40) の 45 種類は、型 (§4.2) で表せるようにしてある。**系統と難易度の対応**は `FAMILY_DIFFICULTY` (型の正本) の 1 か所で、次のとおり。

| 系統 (family) | 名前 | 出す難易度 | 受け入れ条件 6 での数え方 |
| --- | --- | --- | --- |
| appearance | 見た目 | やさしい | 多めにする側 |
| calculation | 計算 | やさしい | 多めにする側 |
| text | 文章 | やさしい | 少数 (1 種類) |
| accounting | 会計 | むずかしい | 多めにする側 |
| cross-document | 資料間 | むずかしい | 多めにする側 |
| notes | 注記 | むずかしい | 少数 |
| tactics | 手口 | むずかしい | 少数 (確度 C。下記) |

**「多め」の閾値** (検証器が難易度ごとの異変の問題で確かめる。足りないときは `shortfalls`): やさしい = appearance + calculation が異変の問題の **8 割以上**、むずかしい = accounting + cross-document が **6 割以上**。数字は設計の既定 (anomalies.md の種類の数: やさしい 17 のうち見た目・計算 16、むずかしい 28 のうち会計・資料間 22 から、実現できる範囲に置いた)。

**型を足して表せるようにしたもの** (種類 → 足した項目): E-03(a) 画面ごとの単位 → `unitOverrides`／E-03(b) 負の数の表記 → `signOverrides`／E-04 期・日付 → `dates`・`columnDates`／E-05・H-28 科目名 → `itemKey` の場所と `labelOverrides`／E-06・E-07 グラフ → `results.chart`／E-08 証券コード → `Company.securitiesCode`・`DocHeader.securitiesCode`／E-12 営業利益率 → `summary.operatingMargin`／E-16 配当金総額 → `summary.dividendTotal`／G5・H-08 の配当と借入金 → `summary.interimDividend`・`interimDividendPrevious` (CF の配当金の支払額 = (前期の期末配当 + 当期の中間配当) × 株式数。anomalies.md G5)・`cashFlow.longTermBorrowings`・`longTermRepayments` (総額表示。G4)／E-17・H-21 文章 → `ir.statements`・`summary.annualDividendPrevious`／H-11 ROE → `summary.roe`／H-12 自己資本 → `summary.equity`／H-17 単位換算 → `Company.irUnit`／H-19 セグメント欠け → セグメントを配列に (2〜3)／H-22 → `summary.auditNote`／H-23 → `summary.accountingPolicyChange`・`notes.accountingPolicyNote`／H-24 → `outlook.subsequentEvent`。落ちるべき規則は `anomaly.expectedRules`。

**規則 ID の対応**: `AnomalyKind.primaryRules`・`allowedRules` は、検証器 (Task #23) の規則 ID (英語。`docs/test-cases/validator.md` §1) で書く。anomalies.md の試作の ID (「連動-借入」など) との対応表は #23 が出す。存在しない ID は検証器が止める。

**検証器が持つ非数値の規則** (数値の等式のほかに、種類の主な規則として要る。#23 の受け入れ条件): 単位の一貫 (画面ごとの単位が `header.unit` と同じ)・負の記号の一貫・科目名の辞書と科目と部の対応 (`labels.ts` ができてから)・グラフの軸の下端が 0 と棒の高さの比 = 数字の比・日付の順 (期末日 < 発表日 < 総会の日) と列見出し・文章の主張 (`statements.claims` の方向 = 短信の数字の動き)・監査の注意書き・会計方針の有無の対応 (summary と notes)・後発事象の対応 (notes と `outlook.subsequentEvent`)・証券コード・セグメントの数と名前の一致。

**#40 に返す変更・お願い** (anomalies.md の側を直してもらうもの): ① T1 に連結キャッシュ・フローの要約と総資産経常利益率は出さない (型に持たない。§2 と E-15 の付随規則から外す) ② H-21 の主張は `CLAIM_METRICS` の 9 つの数字についてだけ書く。「無借金に近い」のような程度の語は主張にできない (`zero` は有利子負債が 0 のときだけ) ③ 配当は G5 のとおり、中間配当の有無を `interimDividend` で持つ。

**問題に使わない種類として #40 に返すもの**: H-25 (継続企業の前提)・H-26 (売上の前倒しの疑い)・H-27 (在庫の水増しの疑い)。anomalies.md が確度 C (境界の判断が入る) とし、会計の分かる人の確認が済むまで使わないとしている種類で、型も検証器の規則も足さない (確認が済んで使うときは、規則を足すチケットを切る)。それ以外の 42 種類は、型の上で表せる。

## 5. 画面の遷移の骨組み

状態は `domain/game.ts` の純粋な関数 `reduce(state, action)` が持つ。画面 (`ui/`) は状態を受け取って描き、操作を action にして返す。DOM に触らないので、状態遷移の全パターンを単体テストで確かめられる。

### 5.1 状態

| phase | 意味 | 持つもの |
| --- | --- | --- |
| `title` | 題名の画面 | なし |
| `difficulty` | 難易度の選択 | なし |
| `reading` | 資料束を読んで答える | 難易度・出題 (8 問)・何社目か (0〜7)・いま見ている画面 (`doc`・`screen`)・**印 `marks`** (印を付けた場所のキーを付けた順に並べたもの。`reduce` は中身を見ない。キーの形は `ui/viewer-port.ts`) |
| `revealed` | 答えたあとの答え合わせ | `reading` の持つもの (印を含む) + 遊び手の答え・正解したか |
| `cleared` | 8 社連続で正解した | 難易度・遊んだ 8 問 (完了票に 8 社の社章・社名を出す) |

**どの phase も `draws` (出題の回数) を持つ**。`PICK`・`RESTART` のたびに 1 増える (「もう一度」の `PICK` も数える)。出題の乱数の種に使う (§5.3)。`TO_TITLE` でも消えない。

### 5.2 遷移

```
 title ──START──▶ difficulty ──PICK(難易度, 出題)──▶ reading(1 社目)
   ▲                 │  ▲                              │  ▲
   └──TO_TITLE───────┘  │                  VIEW(画面)──┘  │ (同じ phase のまま見る画面を変える)
                        │                              │
                        │                          ANSWER(あり/なし)
                        │                              ▼
   ┌────────────────────┼───────────────────────── revealed
   │  NEXT (正解 かつ 8 社目でない)  → reading(次の会社)
   │  NEXT (正解 かつ 8 社目)        → cleared
   │  RESTART(新しい出題) (不正解)   → reading(1 社目) … 最初の会社に戻る
   │  TO_DIFFICULTY (不正解)         → difficulty      … 難易度を選び直す
   │
 cleared ──PICK(同じ難易度, 新しい出題)──▶ reading(1 社目)   … もう一度
         ──TO_DIFFICULTY──▶ difficulty                        … 別の難易度
```

**action と、受け付ける phase の表** (これ以外の組み合わせは、状態を変えずに返す。`reduce` は全域):

| action | 受け付ける phase | 遷移先 |
| --- | --- | --- |
| `START` | `title` | `difficulty` |
| `PICK(難易度, 出題)` | `difficulty`・`cleared` | `reading` (1 社目。印は空・`draws` + 1)。`cleared` からは「もう一度」: 難易度は `cleared` の持つものと同じで、出題を新しくする |
| `VIEW(doc, screen)` | `reading`・`revealed` | 同じ phase (見る画面だけ変わる)。`revealed` でも受け付けるのは、答え合わせで異変の場所の画面 (資料間の異変は短信と IR の両方) を見比べるため。判定は変えない |
| `ANSWER(あり/なし, view?)` | `reading` | `revealed`。異変のある問題では、見る画面を action の `view` にする (異変の場所の画面を最初に示す)。`view` は画面 (`ui/`) が `screenOfPlace(problem, places[0])` (§4.1。`ui/viewer/screen-of.ts`) で作って持ってくる (`domain/` から `ui/` は読まない)。異変の無い問題・`view` が無いときは、見る画面は変わらない |
| `NEXT` | `revealed` (正解のときだけ) | `reading` (次の会社。**印は空に戻す**)、8 社目なら `cleared`。社数は `NEXT` で進む |
| `RESTART(出題)` | `revealed` (不正解のときだけ) | `reading` (1 社目。印は空・`draws` + 1)。`revealed` (不正解) から `reading` に戻る遷移はこれだけ |
| `TO_DIFFICULTY` | `revealed` (不正解のときだけ)・`cleared` | `difficulty` |
| `TO_TITLE` | `difficulty`・`reading`・`revealed`・`cleared` | `title` (走行は捨てる。`draws` は残る) |
| `TOGGLE_MARK(キー)` | `reading` | 同じ phase (印のキーを付け外しする。付けた順に並ぶ) |

- すべてのボタンは、この表の action のどれかに結ばれる。**画面の側で `TO_TITLE → START → PICK` のように action をつなげて、表に無い遷移を作らない** (ボタンの文言と action の対応: 「難易度を選び直す」(不正解の答え合わせ) = `TO_DIFFICULTY`、「もう一度」(クリア) = `PICK`、「別の難易度」(クリア) = `TO_DIFFICULTY`、難易度の選択の「戻る」 = `TO_TITLE`)
- 出題 (`Problem[]` 8 問) は、`PICK`・`RESTART` の action が持ってくる。`reduce` 自身は乱数を使わない (純粋)。出題は `domain/draw.ts` が作る
- `reading` 中はいつでも、10 画面 (短信 5 + IR 5) のどれにも移れる (`VIEW`)。順番に読ませる強制はしない。UI の見せかた (タブ・スワイプ・矢印) は Task #28 で決める
- 不正解のあとは `revealed` で答え合わせを見せ、`RESTART` で `reading` の 1 社目に戻る (または `TO_DIFFICULTY` で難易度の選択へ)。戻るたびに新しく出題する (同じ並びを覚えられないように)
- `revealed` で `ANSWER` は受け付けない (判定をやり直す経路を作らない)。`VIEW` は受け付ける (上の表)
- **判定の書き込みは、`reading` → `revealed` の遷移で表す**。「異変あり」「異変なし」を押す = `ANSWER`。判定の前に押す「判定する」とパネルの開閉は画面だけの状態で、`reduce` の action ではない (誤タップが何も確定しない)。不正解の `revealed` から `reading` に戻れるのは `RESTART` だけなので、再読み込みしても同じ問題を判定し直せない (受け入れ条件 3)
- **画面だけの状態 (保存しない)**: 遊びかた (SCH)・見本 (SC2)・会社の導入 (SC3)・最初へ戻る (SC6)・判定のパネルの開閉・難易度の選択の途中。再読み込みすると、保存した状態の phase の画面に戻る。`PICK` は SC2 を閉じたとき (SC3 に入るとき) に行う

### 5.3 出題 (`domain/draw.ts`)

- 1 回のプレイで 8 問。**会社は重複させない**。同じ問題も出さない
- 手順 (**枠を先に決め、会社を割り当てる**): ① 各枠 (8 枠) で、異変ありにするかを独立に確率 `anomalyRatio` で決める (ちょうど 4 問ずつにはしない。数えれば当てられるのを避ける)。難しさの段 (`Problem.tier`、UX の部品 P1) は、枠ごとの狙いの段を `config.ts` の `TIER_BY_ROUND` (1〜2 社目 = 段 1、3〜5 社目 = 段 2、6〜8 社目 = 段 3) で決める ② 各枠が許す会社 = 難易度のプールで、その枠の (あり/なし、段) の問題を持つ会社。**1 社目の枠から順に、重複しない会社の割り当てを二部マッチング (増加路) で求める**。候補の順は、**履歴 (P3) の順位**、次に `rng` で決める。履歴は引数 `history` (難易度ごとに、**答えた**問題 ID を出た順 = 古い順に並べたもの。出題しただけで答えていない問題は数えない): 答えていない問題を優先し、尽きたら履歴で最も昔のものから。会社の重複なし・あり/なしの制約の下では優先であって保証ではない。履歴にプールに無い ID が混じっていても無視する。先の枠を動かさず、空いている会社のうち最も優先なものを使い、無いときだけ増加路で先の枠を動かす ③ ある枠が割り当てられなければ、**その枠だけ**段の指定を近い段へ緩めて、その枠をやり直す (最後は段を無視する)。先の枠は緩めない (序盤の枠の段を優先する) ④ 各枠で、割り当てた会社の、その枠の (あり/なし、段) の問題から 1 問を引く
- **この手順にした理由** (測った。docs/plans/ux-tech-assessment.md §6-6): 先に会社を 8 社選んでから あり/なし と問題を決める初版の手順は、段を狙っても当たる割合が低かった (序盤の枠が狙いの段になる割合 0.56。段の指定が無いときの 0.44 とほぼ同じ)。1 社目の枠から順に割り当てる手順は、序盤の枠で 1.00 になる (終盤の枠は 0.64〜0.90 に下がる)。段の指定を使わなければ、段を無視して あり/なし だけで会社を割り当てるだけで、同じ関数で足りる。段を無視すれば、**両面の会社が 8 社以上**あれば必ず割り当てが解ける (§4.3 の条件)
- プールが条件を満たさない (両面の会社が 8 社に満たない) ときはエラーにする。黙って重複させない。この条件は検証器が全件で確かめるので、公開した版でこのエラーが起きない (§7)
- **乱数と再現**: 乱数は引数 `rng: () => number` で受ける。本番は URL の `?seed=N` があれば `domain/rng.ts` の種つきの乱数 (mulberry32、種 N)、無ければ `Math.random`。種を使うときは、n 回目の出題 (`draws` = n − 1) が種 N + `draws`: 1 回目が種 N、`RESTART` や「もう一度」(`cleared` からの `PICK`) のたびに N+1、N+2、…。`draws` は状態が持ち、保存するので、再読み込みのあとも続く。種は出題を固定するためだけに使う。E2E は出題を再現せず、画面のルート要素の `data-problem-id` から問題の JSON を読んで正解を知る (§7)。`?seed=` は公開版にも残る (遊び手が同じ出題を再現できるだけで、害は無い)

### 5.4 保存と読み出し (`domain/session.ts`・`domain/records.ts`)

`reduce` は保存を知らない。保存と読み出しは `reduce` の外の関数で行う。保存先が使えない (プライベートモードなど) ときは、読み出しは「無し」・書き込みは失敗を返し、例外を外に出さない (遊べる)。

| 何を | 保存先 | 形 | 読み出し |
| --- | --- | --- | --- |
| 走行 (状態の全体) | `sessionStorage` (キー `kessan8.run`) | `serialize(state)`: 版・phase・`draws` と、`reading`・`revealed` では難易度・**問題 ID 8 つ**・社数・見ている画面・印、`revealed` では答え・正誤、`cleared` では難易度・問題 ID 8 つ。問題の本体は持たない (2 KiB 未満) | `hydrate(raw, lookup)`: 壊れた値・版違い・存在しない問題 ID・難易度の違う問題・社数が 0〜7 の外・問題が 8 問でない・不明な phase・`revealed` なのに答えが無い・正誤が問題と食い違う・`draws` が負や小数は、**捨てて「無し」**。タイトルから始める (公開後の誤りの訂正で問題が差し替わったあと、開いたままのタブを再読み込みしても例外にならない) |
| 記録・履歴・見本の済 | `localStorage` (キー `kessan8.records`) | 難易度ごとに、最高到達社数 (`round + 1` の最大)・直前の判定の前の最高到達 (`bestBefore`。最初へ戻る画面の「自己ベスト」を、再読み込みしても正しく出すため)・クリア回数・「異変あり」と正しく判定した問題の異変の種類 ID・答えた問題 ID の履歴 (古い順、重複なし)。見本の済は**難易度ごと** (見本のファイルは共有) | `parseRecords`: 壊れた値・形の違う値は、空の記録 |

- 画面を担う `ui/` が、状態が変わるたびに (1) 走行を保存し、(2) `recordTransition(records, 前の状態, 次の状態)` で記録を更新する。更新するのは `reading` → `revealed` の遷移 1 回だけ (判定の書き込みと同時に 1 回)。読み出し (再読み込み) では更新しない。ブラウザの履歴 API (`pushState`) で phase を表さない (戻るボタンで判定前に戻れる穴を作らない)
- タブを複製すると、複製した側には判定の前の状態が残る (測った: `window.open`。docs/plans/spike/ux-toolbar/)。許容する (§5.3 の `?seed=N` が同じ出題の再現を既に許している)
- 「タイトルへ」(`TO_TITLE`) のあとは、**title の状態 (`draws` を持つ) を保存する**。走行の中身 (問題・印・答え) は title の状態に無いので、これで捨てたことになり、`draws` は残る (再読み込みのあとも `?seed=N` の続きになる)。`clearState` は、読み出しに失敗した値の掃除にだけ使う。記録は消さない

## 6. ゲームの設定値

`domain/config.ts` の 1 か所に持つ。数字を画面やテストに直書きしない。

| 名前 | 値 | 出所 |
| --- | --- | --- |
| `ROUNDS_TO_CLEAR` | 8 | 要件「8 社連続」 |
| `MIN_POOL_PER_DIFFICULTY` | 25 | 要件「25 問以上」 |
| `anomalyRatio` | 0.5 | 決定 (experience.md M6・open-decisions D-G4。要件に比率の指定は無く、ビジネスが 50% に決めた。値を変えても他は変わらない) |
| `TIER_BY_ROUND` | `[1, 1, 2, 2, 2, 3, 3, 3]` | 枠 (何社目か) ごとの狙いの段 (UX の P1。experience.md §3.3) |

## 7. テストの置き場

方針どおり、ケース表 → レッド → グリーン。問題データ (JSON) の中身は、ケース表ではなく検証器 (全問に当てる) で確かめる。

| 種類 | 置き場 | 道具 | 何を確かめるか |
| --- | --- | --- | --- |
| 単体 | 対象の隣の `src/**/*.test.ts` | Vitest | 純粋な関数: 状態遷移・出題・判定・整形・型と設計書の一致 |
| 足場 | `src/scaffold.test.ts` | Vitest | `vercel.json`・`LICENSE`・依存・`.gitignore`・予算確認スクリプトの約束 (Sub-task #37) |
| 問題データ | `npm run verify:data` | `scripts/verify-data.ts` + 検証器 (`src/verifier/`)。`npm test` の次に CI で回る | 全問: 型の形・正常な問題は会計の整合をすべて満たす・異変の問題は指定した規則だけが破れる・ファイル名と `id`・置き場と `difficulty`・会社と異変の種類への参照・難易度ごとの問題数と「両面の会社が 8 社以上」(§4.3)・`labelOverrides` のキーがすべて `labels.ts` の項目キーにあり、値が標準と違う・`anomaly.places` の `path` が実在する値を指す・**正常な問題の見出しの社名・証券コード・期・単位、セグメント名・数が `companies.json` と `fiscalYear` と一致する**・正常な問題に `labelOverrides`・`unitOverrides`・`signOverrides` が無い・`anomaly.expectedRules` が実際に落ちた集合と一致し、種類の `primaryRules`・`allowedRules` に合う・`itemKey` の場所が `labels.ts` の項目キーにある・異変あり・なしの問題数の比 (§4.3)・系統の偏り (§4.5 の閾値) |
| E2E | `e2e/*.spec.ts` | Playwright | 受け入れ条件 1〜4・9 を 1 本ずつ + スマホ幅 375 px で 1 本。ビルドした成果物 (`vite preview`) に対して回す。**問題データが main に入るまでは、`npm run build:e2e` が、試験用の問題 (`src/testing/`) に差し替えて回す** (本番のバンドルには入れない)。データが入ったら、本番のビルドに対して回す project を足す (ケース表 flow.md §4) |

- E2E の projects は、デスクトップ (1280×800) とスマホ (375 px 幅)。CI は Chrome だけで回す。Safari (WebKit)・Firefox (対応ブラウザは方針) は、本番ビルドに対する通し (`e2e/live.spec.ts`。docs/test-cases/release.md §4) を手で回して確かめる。結果は release.md §4.1 に記録した (WebKit iPhone 13・WebKit 1280・Firefox 1280 で通った)
- 受け入れ条件 5・6・8 (問題の数・異変の系統の偏り・実在の名前が無いこと) は、問題データのテストが受け持つ (6 の閾値は §4.5。8 は §8)。E2E には載せない
- E2E は **外部への通信が無い**ことも確かめる (ページの全リクエストが同じ生成元)。方針の「外部への通信をしない静的サイト」
- E2E は、`vercel.json` のセキュリティヘッダ (CSP) を、`vite.config.ts` が同じファイルから読んで `preview.headers` に当てた状態で回す。ヘッダの出所は `vercel.json` の 1 か所で、公開した版と同じ CSP の下で画面が動くことを CI が確かめる (`setAttribute('style', …)` や style 属性つきの HTML 文字列で描くと、ここで落ちる)
- E2E の出題は `?seed=N` で固定する。正解は、表示中の問題の `data-problem-id` から `src/data/problems/<難易度>/<id>.json` を `fs` で読んで知る (Playwright のテストは Vite を通らないので、`import.meta.glob` のプールを使わず、プールの並び順にも頼らない。§5.3)
- 項目名の差し替えが画面に出ることは、`labels.ts` の項目キーのすべてが、どこかの画面の `data-item-key` に出ることを E2E (または `ui/` の単体テスト) で確かめる。キーの表にあっても画面に出ないキーがあると、差し替えが無効になる (Task #27・#28 の受け入れ条件)
- CI (`.github/workflows/ci.yml`) は、job 1: `npm ci` → 型検査 → 単体テスト → `npm run verify:data -- --require-complete` (問題データ全件) → ビルド → `npm run check:size` (dist の予算、§8)、job 2: E2E。どちらも PR と main への push で動く

## 8. 品質の予算と守り

| 項目 | 値・守りかた | 出所 |
| --- | --- | --- |
| 初回の読み込み | 1 MB 未満。ビルド後の `dist` の全ファイルを gzip した長さの合計が 1,000,000 B 未満であることを、`npm run check:size` (`scripts/check-dist-size.mjs`) が確かめる。予算の値はこのスクリプトの 1 か所だけが持つ (素の Node で動かすため、TypeScript の `config.ts` からは読まない)。Node の版は `package.json` の `engines` (`>=22.12`) と CI (`node-version: 22`) で決める。ビルドのあとに回す (CI の job 1 のビルドの次)。スクリプトの振る舞いは、隣の単体テスト `scripts/check-dist-size.test.ts` が一時ディレクトリで確かめる (予算内で成功・超過で失敗) | 方針 |
| 外部への通信 | 無し。`vercel.json` の `Content-Security-Policy` を `default-src 'self'` にして、ブラウザにも守らせる。E2E も同じヘッダの下で回す (§7) | 方針の「セキュリティ」・失敗 3 |
| 秘密 | 環境変数・鍵を使わない。`.gitignore` に `.env*`。CI は `contents: read` の権限だけ | 方針・要件 |
| 実在の名前 | 実在の企業名との衝突は、会社の設定 (Task #24) の `docs/plans/catalog/check_names.py` の手順と記録 (docs/plans/companies.md §3) で確かめる (実在の名前の一覧はリポジトリに置かない)。問題データのテストは、資料に出る社名・証券コードが `companies.json` と一致すること (出所が 1 か所であること) を確かめる | 要件・失敗 3 |

## 9. 後続の Task への申し送り

| Task | この設計から |
| --- | --- |
| #22 問題 (#23 検証器・#24 会社と異変の一覧・#25/#26 問題の制作) | `Problem` の形 (§4.2) で作る。検証器は `src/verifier/` に置き、規則 ID を `anomaly-kinds.json` の `primaryRules`・`allowedRules` と、問題の `anomaly.expectedRules` で参照させる (§4.5)。試作の `docs/plans/spike/verify.py` (67 の必須規則 + 12 の参考規則) が出発点 |
| #27 画面・#28 遊びの流れ | UX の部品が要る追加項目は [docs/plans/ux-tech-assessment.md](plans/ux-tech-assessment.md) §4.2 (型には任意項目として足してある。部品が選ばれたら検証器で必須にする)。`ui/` に置く。状態は §5 の `reduce` を使い、数字と文言は問題データから読む。`data-path` を各セルに持たせる (§4.1)。UI/UX の案 (#19) が素の DOM で足りないと分かったら、フレームワーク導入をチケットで提案する |
| #30 公開 | Vercel の取り込みは人間の作業 (open-decisions D-R6)。`vercel.json` は #37 で用意する |
