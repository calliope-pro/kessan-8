# ケース表: 足場 (Sub-task #37)

設計: [docs/design.md](../design.md) §2・§3・§7・§8。受け入れ条件 (Task #21): ビルド・単体テスト・E2E (Playwright) が動く。`vercel.json` (静的、出力 dist)。LICENSE (MIT)。秘密が無い。npm の依存は理由つき。

ブラックボックスで書く: 入力・操作 → 期待する観測結果。内部の関数名には依らない。CI の確かめは Sub-task #38 のケース表に分ける。

## 単体 (Vitest)

| ID | 入力・操作 | 期待する観測結果 | 観点 |
| --- | --- | --- | --- |
| U1 | `src/domain/types.ts` を読み、`docs/design.md` §4.2 の `<!-- types:start -->` 〜 `<!-- types:end -->` の ts コードブロックを取り出す | 2 つが一字違わず同じ | 同値 (設計と型の一致) |
| U1b | 設計書から型のブロックを取り出す (マーカーが 1 組だけ) | 見つかり、ちょうど 1 つ | 異常系 (マーカー欠落で U1 が黙って通るのを防ぐ) |
| U2 | `vercel.json` を読む | JSON として読める / `outputDirectory` が `dist` / `buildCommand` が `npm run build` | 正常 |
| U2b | 同上 | 静的: `functions`・`rewrites`・`redirects`・`routes` のキーが無い | 異常系 (サーバ機能を持たない) |
| U2c | 同上、`headers` の全ヘッダ | `Content-Security-Policy` が `default-src 'self'` を含み、`unsafe-eval` と `http:`・`https:` の外部の生成元を含まない。`X-Content-Type-Options: nosniff` がある | セキュリティ |
| U3 | `LICENSE` を読む | 1 行目が `MIT License`。`Permission is hereby granted, free of charge` を含む。`Copyright (c) 2026` で始まる行がある | 正常 |
| U4 | `package.json` を読む | `private` が true / `dependencies` が無いか空 / `devDependencies` のキー集合が設計 §2.1 の 5 件 (`typescript`・`vite`・`vitest`・`@playwright/test`・`@types/node`) とちょうど同じ / `engines.node` が `>=22.12` / `@types/node` が `^22` (CI の Node 22 に型を合わせる) | 境界 (依存は増減したら落ちる) |
| U4b | 同上、`scripts` | `dev`・`build`・`preview`・`typecheck`・`test`・`test:e2e`・`check:size` がある | 正常 |
| U4c | `package-lock.json` | 存在する | 正常 (再現できる) |
| U5 | `.gitignore` を読む | `node_modules/`・`dist/`・`.env`・`.env.*` の行がある | セキュリティ |
| U5b | `git ls-files` の結果 (コミットされたファイル) | どの階層にも、ファイル名が `.env` で始まるものが無い | セキュリティ (受け入れ条件 10) |
| U6 | `index.html` を読む | `lang="ja"` / viewport の meta がある / `http://`・`https://` で始まる外部の参照が無い | 正常 + セキュリティ |
| U7 | `tsconfig.json` を読む | `strict` が true | 正常 |
| U8 | `vite.config.ts` が出す `preview.headers` を読む | `vercel.json` の `headers` の中身と同じ (CSP を含む)。出所は `vercel.json` の 1 か所 | 同値 (設計 §7) |
| U10 | Vitest の設定 (`vite.config.ts` の `test`) | `exclude` に `e2e/**` がある (`npm test` は E2E のファイルを回さない) | 異常系 (Playwright の `test()` を Vitest が読んで落ちるのを防ぐ) |
| U9 | 予算確認スクリプト `scripts/check-dist-size.mjs <dir> [--budget N]` を、gzip 後の合計が小さいファイル 1 つの一時ディレクトリに対して実行 | 終了コード 0。出力に合計のバイト数がある | 正常 |
| U9b | 同上、乱数で埋めた圧縮できないファイル (gzip 後 約 1.2 MB) の一時ディレクトリ | 終了コード 1。出力に超過が分かる文言がある | 境界の外 |
| U9c | 同上、U9 の合計を `--budget` にちょうど指定 / 合計 + 1 を指定 | 前者は終了コード 1 (「未満」なので等しいと失敗)、後者は 0 | 境界値 |
| U9d | 同上、存在しないディレクトリ | 終了コードが 0 でない。読めないことが分かる文言 | 異常系 |
| U9e | 同上、サブディレクトリのファイルと、gzip 前は大きく後は小さいファイルを含む | 合計がサブディレクトリを含み、gzip 後の長さで数える (前の長さではない) | 同値 (設計 §8: gzip の合計) |

## E2E (Playwright。ビルドして `vite preview` に対して回す)

| ID | 操作 | 期待する観測結果 | 観点 |
| --- | --- | --- | --- |
| E1 | `/` を開く | ステータス 200 / `html` の `lang` が `ja` / `data-testid="app"` の要素が見える / タイトルが空でない | 正常 |
| E2 | `/` を開いて読み込みを待つ | 同じ生成元以外へのリクエストが 0 件 / コンソールのエラーと `pageerror` が 0 件 | セキュリティ (設計 §7) |
| E3 | 幅 320・375・414 px で `/` を開く | どの幅でも `document.documentElement.scrollWidth` が**指定した幅**以下 (横にはみ出さない)。`window.innerWidth` とは比べない: スマホの project では、はみ出すと表示幅 (`innerWidth`) も広がって差が 0 に見えるため | 境界値 (受け入れ条件 9) |
| E4 | `/` のレスポンスヘッダ | `content-security-policy` があり、`vercel.json` のものと同じ | 同値 (CSP が E2E の下でも当たっている) |

E1〜E4 は、デスクトップ (1280×800) とスマホ (375 px) の 2 つの project の両方で回る。E3 は幅を自分で変える。

## 範囲外 (この Sub-task では確かめない)

- CI の設定の中身 (#38 のケース表)
- 受け入れ条件 1〜4 の E2E (画面ができてから。Task #27・#28)
- 問題データ・検証器 (Task #22)

## 確かめた記録 (Sub-task #37)

- レッド: 実装の前に `npx vitest run` で 7 件中 6 件が失敗 (types.ts・vite.config.ts・vercel.json・check-dist-size.mjs が無い)。レビュー 1 回目の指摘 (U5b を `git ls-files` に・U10 を追加・`@types/node` を `^22` に) のあとも、実装の前に同じく赤。
- グリーン: `npm run typecheck`・`npx vitest run` (3 ファイル 20 件)・`npm run build`・`npm run check:size` (dist は gzip で 927 B)・`npx playwright test` (12 件) がすべて通る。
- テスト自身の不具合が 2 件見つかり、直した: (a) `check-dist-size.mjs` が、`--budget` を付けない呼び出しでディレクトリを読み落としていた (U9 が赤で捕まえた)。(b) E3 が、スマホの project で「はみ出すと表示幅 (`innerWidth`) も広がる」ため、600 px の要素を足しても通っていた (変異で気づいた)。指定した幅と比べる形に直した。
- 変異 (壊して赤になることの確認): 600 px の要素を足す → E3 が 6 件すべて赤。style 属性つきの HTML を足す → E2 が CSP の違反 (コンソールのエラー) で赤。
