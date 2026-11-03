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
| 画面の作り | フレームワークなし (素の TypeScript + DOM)。状態は純粋な関数 (§5) で持ち、画面は状態から DOM を作る関数 | 画面は十数種で、状態は小さい。初回 1 MB 未満に余裕を持たせ (ライブラリを足さない)、依存を最小にする (原則「セキュリティ」「保守性」)。状態遷移を DOM から切り離すので、単体テストで確かめられる (原則「テスト容易性」) | React・Preact・Svelte など (画面の複雑さに対して過剰。UI/UX の案 (#19) が固まる前に、見た目の作りかたを縛らない。#19 の案が素の DOM で足りないと分かったら、Preact (約 3 KB) への切り替えを提案する) |
| 単体テスト | Vitest | Vite と設定を共有でき、TypeScript をそのまま実行する。純粋な関数 (状態遷移・検証器・出題) と、問題データ全件の検証 (§7) を同じ道具で回す | Jest (TypeScript と ES モジュールの設定が増える) |
| E2E | Playwright (`@playwright/test`) | 方針で指定 (受け入れ条件 1〜4・9 を 1 本ずつ、スマホ幅 375 px で 1 本)。ブラウザごとの projects を持ち、GitHub Actions に標準の手順がある | Cypress (方針の指定外。複数ブラウザの扱いが弱い) |
| データの形式 | JSON (1 問 1 ファイル) | データを足すだけで問題を増やせる (原則「保守性」)。AI が書いても diff が小さく、検証器が全件を読める。Vite がそのまま取り込む | TypeScript のオブジェクト (データの修正のたびに型検査とビルドが走る)、1 つの大きな JSON (diff が大きく、並列に作れない) |
| 公開 | Vercel の静的サイト (`vercel.json`: `outputDirectory: dist`) | 要件 | — |
| CI | GitHub Actions | 要件 (Task #21 の受け入れ条件) | — |
| ライセンス | MIT | 要件 | — |

### 2.1 npm の依存 (理由つき)

実行時の依存 (`dependencies`) は **0 件**。画面に載るコードは、自分たちのコードだけにする。開発用 (`devDependencies`) は次の 4 件だけで、増やすときはチケットで理由を書く。

| パッケージ | 理由 | 使う場所 |
| --- | --- | --- |
| `typescript` | 型検査 (`tsc --noEmit`)。型が境界の役を果たす | CI・`npm run typecheck` |
| `vite` | ビルド・開発サーバ・プレビュー | `npm run build`・`dev`・`preview` |
| `vitest` | 単体テスト・問題データ全件の検証 | `npm test` |
| `@playwright/test` | E2E (ブラウザ操作) | `npm run test:e2e` |

バージョンは `package-lock.json` で固定し、CI は `npm ci` だけを使う (再現できる、勝手に更新されない)。

## 3. ディレクトリ

```
/
├─ index.html               # Vite の入口 (lang="ja"・viewport)
├─ package.json / package-lock.json / tsconfig.json / vite.config.ts
├─ vercel.json              # 静的・出力 dist・セキュリティヘッダ
├─ playwright.config.ts     # E2E の設定 (ブラウザ・幅は §7)
├─ LICENSE                  # MIT
├─ .github/workflows/ci.yml # 型検査・単体テスト・ビルド・E2E
├─ docs/                    # requirements・charter・design・adr/・plans/
├─ src/
│  ├─ main.ts               # 入口: 画面を DOM に取り付ける
│  ├─ domain/               # DOM を使わない純粋な TypeScript (単体テストの主な対象)
│  │  ├─ types.ts           #   問題データの型 (§4。型の正本)
│  │  ├─ labels.ts          #   項目名の日本語表示 (キー → 表示名)
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
│  ├─ ui/                   # DOM を作る画面 (Task #27・#28)。状態 → DOM の関数
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
- **場所は `path` で指す**。`path` は資料の中の位置で、先頭が画面の ID、あとはデータの入れ子のキーを `.` でつないだもの (例: `incomeStatement.current.ordinaryIncome`)。画面は同じ文字列を、該当のセルの `data-path` に持たせる。答え合わせで強調する場所と、データの異変の場所が、同じ文字列で結ばれる (方針の失敗 2)
- **単位**: 金額は百万円 (百万円未満切捨ての整数)、比率は % (小数第一位)、1 株当たりは円。符号は数値の符号で持ち、表示 (△) は 1 つの整形関数 (`ui/format.ts`) だけが決める
- **見た目の異変**は、資料の見出し (`header`) の文字列と、項目名の差し替え (`labelOverrides`) で表す。項目名の標準は `domain/labels.ts` にあり、正常な問題には `labelOverrides` が無い
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
}

/** 異変の種類の一覧 (src/data/anomaly-kinds.json)。 */
export interface AnomalyKind {
  id: string;
  stage: AnomalyStage;
  /** 遊び手に見せる名前 (答え合わせで使う)。 */
  name: string;
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

/** 異変の場所。path は資料の中の位置で、先頭が画面の ID (例: incomeStatement.current.ordinaryIncome)。 */
export interface AnomalyPlace {
  doc: DocKind;
  path: string;
}

/** 異変の指定と答え合わせの文言。問題データのここが唯一の出所で、画面はこれを表示するだけ。 */
export interface Anomaly {
  /** AnomalyKind.id。 */
  kind: string;
  stage: AnomalyStage;
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
  tanshin: Tanshin;
  ir: IrDeck;
  /** 項目名の差し替え (見た目の異変用)。キーは `<doc>.<path>`。正常な問題には無い。 */
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
- 会社 (`companies.json`) と異変の種類 (`anomaly-kinds.json`) は別ファイルで、問題から ID で参照する。名前の衝突確認 (実在の企業名と同じでないこと) は会社の設定 (Task #24) の責務

### 4.4 答え合わせの作り方

`domain/answer.ts` の判定は、`problem.anomaly` だけを見る。

| 遊び手の答え | `anomaly` | 結果 |
| --- | --- | --- |
| 異変あり | あり | 正解。`places` の場所を強調し、`explanation` と、種類の名前 (`anomaly-kinds.json` の `name`) を示す |
| 異変あり | `null` | 不正解。「この資料に異変は無かった」と示す |
| 異変なし | `null` | 正解 |
| 異変なし | あり | 不正解。`places` を強調し、`explanation` を示す |

受け入れ条件 4 (異変のあった問題は場所と内容を示す) は、正解でも不正解でも同じ表示になる。文言を作る場所は `explanation` だけで、`answer.ts` が文言を足さない。

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
- 各枠で、異変あり・なしを独立に確率 `anomalyRatio` で決め、その中から引く。ちょうど 4 問ずつにはしない (数えれば当てられるのを避ける)
- 乱数は引数 `rng: () => number` で受ける (テストで固定できる)。本番は `Math.random`
- プールが足りないとき (難易度のプールに会社が 8 社に満たないなど) はエラーにする。黙って重複させない

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
| 足場 | `src/scaffold.test.ts` | Vitest | `vercel.json`・`LICENSE`・依存・`.gitignore` の約束 (Sub-task #37) |
| 問題データ | `src/data/problems.test.ts` | Vitest + 検証器 (`src/verifier/`) | 全問: 型の形・正常な問題は会計の整合をすべて満たす・異変の問題は指定した規則だけが破れる・ファイル名と `id`・置き場と `difficulty`・会社と異変の種類への参照・難易度ごとの問題数 |
| E2E | `e2e/*.spec.ts` | Playwright | 受け入れ条件 1〜4・9 を 1 本ずつ + スマホ幅 375 px で 1 本。ビルドした成果物 (`vite preview`) に対して回す |

- E2E の projects は、デスクトップ (1280×800) とスマホ (375 px 幅)。Chrome を既定にし、Safari (WebKit)・Firefox は公開の Task (#30) の通しで確かめる (対応ブラウザは方針)
- 受け入れ条件 5・6・8 (問題の数・異変の段・実在の名前が無いこと) は、問題データのテストが受け持つ。E2E には載せない
- E2E は **外部への通信が無い**ことも確かめる (ページの全リクエストが同じ生成元)。方針の「外部への通信をしない静的サイト」
- CI (`.github/workflows/ci.yml`) は、`npm ci` → 型検査 → 単体テスト → ビルド、と、別の job で E2E を回す。どちらも PR と main への push で動く

## 8. 品質の予算と守り

| 項目 | 値・守りかた | 出所 |
| --- | --- | --- |
| 初回の読み込み | 1 MB 未満 (ビルド後の `dist` の転送量で確かめる。足場の単体テストに入れる) | 方針 |
| 外部への通信 | 無し。`vercel.json` の `Content-Security-Policy` を `default-src 'self'` にして、ブラウザにも守らせる | 方針の「セキュリティ」・失敗 3 |
| 秘密 | 環境変数・鍵を使わない。`.gitignore` に `.env*`。CI は `contents: read` の権限だけ | 方針・要件 |
| 実在の名前 | 会社の設定のテストで、実在の企業名 (一覧は持たない。確認の Sub-task の記録に従う) との衝突を確かめる。画面に出る社名・人名は `companies.json` だけが出所 | 要件・失敗 3 |

## 9. 後続の Task への申し送り

| Task | この設計から |
| --- | --- |
| #22 問題 (#23 検証器・#24 会社と異変の一覧・#25/#26 問題の制作) | `Problem` の形 (§4.2) で作る。検証器は `src/verifier/` に置き、規則 ID を `anomaly-kinds.json` の `rules` と対応させる。試作の `docs/plans/spike/verify.py` (67 の必須規則 + 12 の参考規則) が出発点 |
| #27 画面・#28 遊びの流れ | `ui/` に置く。状態は §5 の `reduce` を使い、数字と文言は問題データから読む。`data-path` を各セルに持たせる (§4.1)。UI/UX の案 (#19) が素の DOM で足りないと分かったら、フレームワーク導入をチケットで提案する |
| #30 公開 | Vercel の取り込みは人間の作業 (open-decisions D-R6)。`vercel.json` は #37 で用意する |
