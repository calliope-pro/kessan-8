# 基本設計

状態: 作成中 (Task #21 / Sub-task #36)。凍結した要件 ([requirements.md](requirements.md))・方針 ([charter.md](charter.md)) のもとで、全員が前提にする設計を 1 か所にまとめる。後続の Task (#22 問題・#27 画面・#28 遊びの流れ・#30 公開) は、この文書の型・ディレクトリ・遷移・テストの置き場に従う。変えたいときは、この文書を直す提案をチケットに出す。

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
│  │  └─ answer.ts          #   判定と答え合わせの文面 (問題データから作る)
│  ├─ verifier/             # 会計の整合の検証器 (Task #23)。問題データ全件に当てる
│  ├─ data/
│  │  ├─ companies.json     #   架空の会社の設定 (Task #24)
│  │  ├─ anomaly-kinds.json #   異変の種類の一覧 (Task #24)
│  │  ├─ problems/easy/*.json, problems/hard/*.json  # 問題 (Task #25・#26)。1 問 1 ファイル
│  │  └─ index.ts           #   読み込み (全件を取り込み、難易度ごとのプールにする)
│  ├─ ui/                   # DOM を作る画面 (Task #27・#28)。状態 → DOM の関数。問題に依らない固定の文言は ui/messages.ts
│  └─ styles/               # CSS
├─ e2e/                     # Playwright (E2E)
└─ public/                  # 静的ファイル (必要になったら。外部の素材は置かない)
```

- 単体テストは、対象の隣に `*.test.ts` で置く (§7)。
- `domain/` と `verifier/` は DOM・`window`・ネットワークを使わない。画面 (`ui/`) は `domain/` を読むだけで、`domain/` から `ui/` は読まない。
- 1 ファイルは小さく保つ (目安 300 行)。文脈に入り切らない大きなファイルを作らない (原則「AI エージェントとの親和性」)。

## 4. 問題データの形

会社・期・決算短信 5 画面・IR スライド 5 画面・異変の指定・答え合わせの文言を、**1 問のデータ 1 か所**に持つ。画面はこのデータから描き、判定と答え合わせ (§5) もこのデータから作る。画面の側に数字や文言を書かない。

### 4.1 考え方

- **画面に出る数字は、すべて問題データの数値**。比率・増減率・合計も、表示用に計算せず、データに値として持つ。理由: 異変は「計算が合わない」ことそのものなので、表示のたびに計算し直すと異変が消える。正常な問題で値が合っていることは、検証器 (Task #23) が全件に当てて確かめる (方針の失敗 1)
- **異変のある問題は、正常な資料の数字を 1 か所以上差し替えた資料**。何を差し替えたか (場所) と、なぜ異変か (文言) を `anomaly` に書く。`anomaly` が `null` なら正常
- **場所は `path` で指す**。`path` は資料の中の位置で、先頭が画面の ID、あとはデータの入れ子のキーを `.` でつないだもの (例: `incomeStatement.current.ordinaryIncome`、配列の要素は添字: `segments.items.0.netSales.current`)。画面は `<doc>.<path>` (例: `tanshin.incomeStatement.current.ordinaryIncome`) を、該当のセルの `data-path` に、項目名を出す要素には項目キーを `data-item-key` に持たせる。答え合わせで強調する場所と、データの異変の場所が、同じ文字列で結ばれる (方針の失敗 2)
- **見出しの場所**: 社名・期・単位は、どの画面の下にも無い資料の見出し (`header`) で、`header.companyName`・`header.periodLabel`・`header.unit` と書く。見出しはその資料のすべての画面の上部に出る。答え合わせで「その場所の画面へ移る」ときは、`header` で始まる場所は、その資料の 1 画面目へ移って、そこの見出しを強調する (`domain/answer.ts` の `screenOf(place)`)
- **項目キー (itemKey)**: 項目名は「行」に付き、`path` は「値」を指すので、行の名前を指すキーを 1 つの文法で決める。`path` から、`previous`・`current`・`forecast`・`actual` の段 (期・予実の列) を取り除き、末尾が `changeRate`・`amount` ならそれも取り除いた残りを、資料の種類を頭に付けて項目キーとする。例: `tanshin.incomeStatement.current.ordinaryIncome` → `tanshin.incomeStatement.ordinaryIncome`、`tanshin.summary.ordinaryIncome.changeRate` → `tanshin.summary.ordinaryIncome`、`ir.segments.items.0.netSales.current` → `ir.segments.items.0.netSales`、`ir.outlook.forecast.netSales` と `ir.outlook.actual.netSales` → どちらも `ir.outlook.netSales` (予想と実績は同じ行の別の列)。短信のサマリーと損益計算書の経常利益は別の項目キーで、別の表示名を持てる。この変換は `domain/labels.ts` の関数 `itemKey(doc, path)` だけが行い、`labels.ts` の表示名の表と `labelOverrides` のキーは、どちらも項目キー
- **単位**: 金額は百万円 (百万円未満切捨ての整数)、比率は % (小数第一位)、1 株当たりは円。符号は数値の符号で持ち、表示 (△) は 1 つの整形関数 (`ui/format.ts`) だけが決める
- **見た目の異変**は、資料の見出し (`header`) の文字列と、項目名の差し替え (`labelOverrides`、キーは項目キー) で表す。項目名の標準は `domain/labels.ts` にあり、正常な問題には `labelOverrides` が無い
- **同じ事実を 2 か所に書かないもの**: 異変の段は `AnomalyKind.stage` だけが持つ (`Anomaly` には書かない。段は `kind` から引く)。複製が避けられないもの (見出しの社名 = `Company.name`、セグメント名 = `Company.segmentNames`、期の表記 = `fiscalYear` と決算期末の月から作る表記) は、異変のために別の値を入れられる形にしてあるので、**正常な問題では一致することを検証器が確かめる**
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

/** 異変の段。やさしい = appearance・calculation、むずかしい = accounting・cross-document を多めにする。 */
export const ANOMALY_STAGES = ['appearance', 'calculation', 'accounting', 'cross-document'] as const;
export type AnomalyStage = (typeof ANOMALY_STAGES)[number];

/** 前期と当期の組。 */
export interface Pair {
  previous: number;
  current: number;
}

/** 前期比つきの項目。changeRate は前期比の増減率 (%)。 */
export interface Change extends Pair {
  changeRate: number;
}

/** 架空の会社 (src/data/companies.json)。実在の企業名・人物は使わない。 */
export interface Company {
  id: string;
  name: string;
  industry: string;
  /** 2 つの事業セグメントの名前。 */
  segmentNames: [string, string];
  /** 決算期末の月 (3 = 3 月期)。 */
  fiscalYearEndMonth: number;
  /** 事業の説明 1 文 (導入の 1 行の出所。数字・増減の語を含めない)。UX の部品 P2 を採るとき必須。 */
  business?: string;
  /** 社章の幾何形の指定 (形の名前とパラメータ)。生成は純粋な関数。配色は industry から引く表 (ui の定数) で、ここには持たない。UX の部品 V3 を採るとき必須。 */
  emblem?: { shape: string; params?: number[] };
}

/** 異変の種類の一覧 (src/data/anomaly-kinds.json)。 */
export interface AnomalyKind {
  id: string;
  stage: AnomalyStage;
  /** 遊び手に見せる名前 (答え合わせで使う)。 */
  name: string;
  /** 種類ごとの一般的な見かた 1 行。UX の部品 R7 を採るとき必須。 */
  tip?: string;
  /** この種類の異変で破れる、検証器の規則 ID。正常な問題ではすべて成り立ち、この種類の問題ではこれだけが破れる。 */
  rules: string[];
}

/** 資料の見出し。見た目の異変 (社名の誤植・単位違い・期の表記違い) はここに入る。 */
export interface DocHeader {
  companyName: string;
  /** 例: 2027年3月期 */
  periodLabel: string;
  /** 例: 百万円 */
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
  longTermDebtChange: number;
  dividendsPaid: number;
  financingCashFlow: number;
  fxEffect: number;
  netChangeInCash: number;
  cashBeginning: number;
  cashEnding: number;
}

/** セグメント 1 つ分。name は company.segmentNames と同じ。 */
export interface SegmentLine {
  name: string;
  netSales: number;
  profit: number;
}

/** 1 期間のセグメント情報。調整額は全社費用など (負の値)。 */
export interface SegmentInfo {
  segments: [SegmentLine, SegmentLine];
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
    eps: number;
    totalAssets: number;
    netAssets: number;
    equityRatio: number;
    bps: number;
    annualDividend: number;
    payoutRatio: number;
  };
  balanceSheet: { previous: BalanceSheet; current: BalanceSheet };
  incomeStatement: { previous: IncomeStatement; current: IncomeStatement };
  cashFlow: CashFlow;
  notes: TanshinNotes;
}

/** IR スライド (5 画面)。 */
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
    commentary?: string;
  };
  segments: {
    items: [
      { name: string; netSales: Change; profit: Change; salesShare: number },
      { name: string; netSales: Change; profit: Change; salesShare: number },
    ];
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
    commentary?: string;
  };
  supplement: {
    capex: { previous: number | null; current: number };
    depreciation: { previous: number | null; current: number };
    interestBearingDebt: Pair;
    cash: Pair;
    netDebt: Pair;
    equityRatio: number;
  };
}

/** 異変の場所。path は資料の中の位置で、先頭が画面の ID か header (例: incomeStatement.current.ordinaryIncome、header.companyName)。 */
export interface AnomalyPlace {
  doc: DocKind;
  path: string;
}

/** 異変の指定と答え合わせの文言。問題データのここが唯一の出所で、画面はこれを表示するだけ。 */
export interface Anomaly {
  /** AnomalyKind.id。段 (stage) は AnomalyKind が唯一の出所なので、ここには持たない。 */
  kind: string;
  /** 1 件以上。資料間の矛盾は食い違う両側の場所を並べる。 */
  places: AnomalyPlace[];
  /** 答え合わせの文言 (何がどう食い違っているか。数字を含める)。 */
  explanation: string;
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
  /** null = 正常。 */
  anomaly: Anomaly | null;
}
```
<!-- types:end -->

### 4.3 データの置き方と読み込み

- `src/data/problems/<easy|hard>/<id>.json`: 1 問 1 ファイル、中身は `Problem` そのもの。ファイル名 = `id`、置き場 = `difficulty`。この対応は検証器が確かめる
- `src/data/index.ts` が `import.meta.glob(..., { eager: true })` で全件を取り込み、難易度ごとのプールにする。60 問程度では、試作の測定 (資料束 1 問が gzip で約 2.6 KiB。docs/plans/tech-assessment.md §2) から約 160 KiB で、初回 1 MB の予算に収まる。超えそうなら、難易度ごとの遅延読み込みに切り替える (データの形は変わらない)
- 問題を足すときは JSON を足すだけ。画面・状態遷移・出題のコードは触らない (原則「保守性」)
- **プールが満たす条件** (出題 §5.3 が必ず引けるための、データの側の約束。検証器が全件に当てる): 難易度ごとに、**異変のある問題と異変の無い問題の両方を持つ会社が `ROUNDS_TO_CLEAR` (8) 社以上**ある。問題数 25 以上 (要件) に加えてこの条件を、問題の制作 (Task #25・#26) の受け入れ条件にする
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

## 5. 画面の遷移の骨組み

状態は `domain/game.ts` の純粋な関数 `reduce(state, action)` が持つ。画面 (`ui/`) は状態を受け取って描き、操作を action にして返す。DOM に触らないので、状態遷移の全パターンを単体テストで確かめられる。

### 5.1 状態

| phase | 意味 | 持つもの |
| --- | --- | --- |
| `title` | 題名の画面 | なし |
| `difficulty` | 難易度の選択 | なし |
| `reading` | 資料束を読んで答える | 難易度・出題 (8 問)・何社目か (0〜7)・いま見ている画面 (`doc`・`screen`) |
| `revealed` | 答えたあとの答え合わせ | `reading` の持つもの + 遊び手の答え・正解したか |
| `cleared` | 8 社連続で正解した | 難易度 |

### 5.2 遷移

```
 title ──START──▶ difficulty ──PICK(難易度, 出題)──▶ reading(1 社目)
                                                      │  ▲
                                          VIEW(画面)──┘  │ (同じ phase のまま見る画面を変える)
                                                      │
                                                  ANSWER(あり/なし)
                                                      ▼
   ┌──────────────────────────────────────────── revealed
   │  NEXT (正解 かつ 8 社目でない)  → reading(次の会社)
   │  NEXT (正解 かつ 8 社目)        → cleared
   │  RESTART(新しい出題) (不正解)   → reading(1 社目) … 最初の会社に戻る
   │
 cleared ──TO_TITLE──▶ title        (reading・revealed からも TO_TITLE で title に戻れる)
```

- 出題 (`Problem[]` 8 問) は、`PICK`・`RESTART` の action が持ってくる。`reduce` 自身は乱数を使わない (純粋)。出題は `domain/draw.ts` が作る
- `reading` 中はいつでも、10 画面 (短信 5 + IR 5) のどれにも移れる (`VIEW`)。順番に読ませる強制はしない。UI の見せかた (タブ・スワイプ・矢印) は Task #28 で決める
- 不正解のあとは `revealed` で答え合わせを見せ、`RESTART` で `reading` の 1 社目に戻る。戻るたびに新しく出題する (同じ並びを覚えられないように)

### 5.3 出題 (`domain/draw.ts`)

- 1 回のプレイで 8 問。**会社は重複させない**。同じ問題も出さない
- 手順 (**枠を先に決め、会社を割り当てる**): ① 各枠 (8 枠) で、異変ありにするかを独立に確率 `anomalyRatio` で決める (ちょうど 4 問ずつにはしない。数えれば当てられるのを避ける)。難しさの段 (`Problem.tier`、UX の部品 P1 を採るとき) があれば、枠ごとの狙いの段も決める ② 各枠が許す会社 = 難易度のプールで、その枠の (あり/なし、段) の問題を持つ会社。**重複しない会社の割り当てを、二部マッチング (増加路) で求める**。候補の順は `rng` で並べ替える ③ 割り当てられない枠があれば、その枠の段の指定を近い段へ緩めて、②をやり直す (最後は段を無視する) ④ 各枠で、割り当てた会社の、その枠の (あり/なし、段) の問題から 1 問を引く
- **この手順にした理由** (測った。docs/plans/ux-tech-assessment.md §6-6): 先に会社を 8 社選んでから あり/なし と問題を決める初版の手順は、段を狙っても当たる割合が低かった (序盤の枠が狙いの段になる割合 0.57。段の指定が無いときの 0.44 とほぼ同じ)。枠を先に決める手順は 0.93〜0.99 になる。段の指定を使わなければ、段を無視して あり/なし だけで会社を割り当てるだけで、同じ関数で足りる。段を無視すれば、**両面の会社が 8 社以上**あれば必ず割り当てが解ける (§4.3 の条件)
- プールが条件を満たさない (両面の会社が 8 社に満たない) ときはエラーにする。黙って重複させない。この条件は検証器が全件で確かめるので、公開した版でこのエラーが起きない (§7)
- **乱数と再現**: 乱数は引数 `rng: () => number` で受ける。本番は URL の `?seed=N` があれば `domain/rng.ts` の種つきの乱数 (mulberry32、種 N)、無ければ `Math.random`。種を使うときは、1 回目の出題が種 N、`RESTART` のたびに N+1、N+2、…。種は出題を固定するためだけに使う。E2E は出題を再現せず、画面のルート要素の `data-problem-id` から問題の JSON を読んで正解を知る (§7)。`?seed=` は公開版にも残る (遊び手が同じ出題を再現できるだけで、害は無い)

## 6. ゲームの設定値

`domain/config.ts` の 1 か所に持つ。数字を画面やテストに直書きしない。

| 名前 | 値 | 出所 |
| --- | --- | --- |
| `ROUNDS_TO_CLEAR` | 8 | 要件「8 社連続」 |
| `MIN_POOL_PER_DIFFICULTY` | 25 | 要件「25 問以上」 |
| `anomalyRatio` | 0.5 | **仮の既定** (要件に比率の指定は無い。ビジネス側が Task #28 で確定する。値を変えても他は変わらない) |

## 7. テストの置き場

方針どおり、ケース表 → レッド → グリーン。問題データ (JSON) の中身は、ケース表ではなく検証器 (全問に当てる) で確かめる。

| 種類 | 置き場 | 道具 | 何を確かめるか |
| --- | --- | --- | --- |
| 単体 | 対象の隣の `src/**/*.test.ts` | Vitest | 純粋な関数: 状態遷移・出題・判定・整形・型と設計書の一致 |
| 足場 | `src/scaffold.test.ts` | Vitest | `vercel.json`・`LICENSE`・依存・`.gitignore`・予算確認スクリプトの約束 (Sub-task #37) |
| 問題データ | `src/data/problems.test.ts` | Vitest + 検証器 (`src/verifier/`) | 全問: 型の形・正常な問題は会計の整合をすべて満たす・異変の問題は指定した規則だけが破れる・ファイル名と `id`・置き場と `difficulty`・会社と異変の種類への参照・難易度ごとの問題数と「両面の会社が 8 社以上」(§4.3)・`labelOverrides` のキーがすべて `labels.ts` の項目キーにあり、値が標準と違う・`anomaly.places` の `path` が実在する値を指す・**正常な問題の見出しの社名・期・単位、セグメント名が `companies.json` と `fiscalYear` と一致する**・正常な問題に `labelOverrides` が無い |
| E2E | `e2e/*.spec.ts` | Playwright | 受け入れ条件 1〜4・9 を 1 本ずつ + スマホ幅 375 px で 1 本。ビルドした成果物 (`vite preview`) に対して回す |

- E2E の projects は、デスクトップ (1280×800) とスマホ (375 px 幅)。Chrome を既定にし、Safari (WebKit)・Firefox は公開の Task (#30) の通しで確かめる (対応ブラウザは方針)
- 受け入れ条件 5・6・8 (問題の数・異変の段・実在の名前が無いこと) は、問題データのテストが受け持つ。E2E には載せない
- E2E は **外部への通信が無い**ことも確かめる (ページの全リクエストが同じ生成元)。方針の「外部への通信をしない静的サイト」
- E2E は、`vercel.json` のセキュリティヘッダ (CSP) を、`vite.config.ts` が同じファイルから読んで `preview.headers` に当てた状態で回す。ヘッダの出所は `vercel.json` の 1 か所で、公開した版と同じ CSP の下で画面が動くことを CI が確かめる (`setAttribute('style', …)` や style 属性つきの HTML 文字列で描くと、ここで落ちる)
- E2E の出題は `?seed=N` で固定する。正解は、表示中の問題の `data-problem-id` から `src/data/problems/<難易度>/<id>.json` を `fs` で読んで知る (Playwright のテストは Vite を通らないので、`import.meta.glob` のプールを使わず、プールの並び順にも頼らない。§5.3)
- 項目名の差し替えが画面に出ることは、`labels.ts` の項目キーのすべてが、どこかの画面の `data-item-key` に出ることを E2E (または `ui/` の単体テスト) で確かめる。キーの表にあっても画面に出ないキーがあると、差し替えが無効になる (Task #27・#28 の受け入れ条件)
- CI (`.github/workflows/ci.yml`) は、job 1: `npm ci` → 型検査 → 単体テスト → ビルド → `npm run check:size` (dist の予算、§8)、job 2: E2E。どちらも PR と main への push で動く

## 8. 品質の予算と守り

| 項目 | 値・守りかた | 出所 |
| --- | --- | --- |
| 初回の読み込み | 1 MB 未満。ビルド後の `dist` の全ファイルを gzip した長さの合計が 1,000,000 B 未満であることを、`npm run check:size` (`scripts/check-dist-size.mjs`) が確かめる。予算の値はこのスクリプトの 1 か所だけが持つ (素の Node で動かすため、TypeScript の `config.ts` からは読まない)。Node の版は `package.json` の `engines` (`>=22.12`) と CI (`node-version: 22`) で決める。ビルドのあとに回す (CI の job 1 のビルドの次)。スクリプトの振る舞いは、隣の単体テスト `scripts/check-dist-size.test.ts` が一時ディレクトリで確かめる (予算内で成功・超過で失敗) | 方針 |
| 外部への通信 | 無し。`vercel.json` の `Content-Security-Policy` を `default-src 'self'` にして、ブラウザにも守らせる。E2E も同じヘッダの下で回す (§7) | 方針の「セキュリティ」・失敗 3 |
| 秘密 | 環境変数・鍵を使わない。`.gitignore` に `.env*`。CI は `contents: read` の権限だけ | 方針・要件 |
| 実在の名前 | 会社の設定のテストで、実在の企業名 (一覧は持たない。確認の Sub-task の記録に従う) との衝突を確かめる。画面に出る社名・人名は `companies.json` だけが出所 | 要件・失敗 3 |

## 9. 後続の Task への申し送り

| Task | この設計から |
| --- | --- |
| #22 問題 (#23 検証器・#24 会社と異変の一覧・#25/#26 問題の制作) | `Problem` の形 (§4.2) で作る。検証器は `src/verifier/` に置き、規則 ID を `anomaly-kinds.json` の `rules` と対応させる。試作の `docs/plans/spike/verify.py` (67 の必須規則 + 12 の参考規則) が出発点 |
| #27 画面・#28 遊びの流れ | UX の部品が要る追加項目は [docs/plans/ux-tech-assessment.md](plans/ux-tech-assessment.md) §4.2 (型には任意項目として足してある。部品が選ばれたら検証器で必須にする)。`ui/` に置く。状態は §5 の `reduce` を使い、数字と文言は問題データから読む。`data-path` を各セルに持たせる (§4.1)。UI/UX の案 (#19) が素の DOM で足りないと分かったら、フレームワーク導入をチケットで提案する |
| #30 公開 | Vercel の取り込みは人間の作業 (open-decisions D-R6)。`vercel.json` は #37 で用意する |
