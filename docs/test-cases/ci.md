# ケース表: CI (Sub-task #38)

設計: [docs/design.md](../design.md) §7 (CI の順序)・§8 (秘密・権限)。受け入れ条件 (Task #21): ビルド・単体テスト・E2E が CI (GitHub Actions) で回る。秘密が無い。

CI は実際に GitHub 上で回して確かめるのが本物の確認なので、(1) 設定ファイルの約束を単体テストで固定し、(2) PR を作ったあとの `gh pr checks` の結果を記録する。

## 単体 (Vitest。`src/ci.test.ts`、`.github/workflows/ci.yml` のテキストを読む)

| ID | 入力・操作 | 期待する観測結果 | 観点 |
| --- | --- | --- | --- |
| C1 | `ci.yml` の `on:` | `pull_request` と、`push` の `branches: [main]` がある。`pull_request_target` は無い | 正常 + セキュリティ (フォークの PR に秘密を渡さない) |
| C2 | 権限 | 最上位に `permissions:` がある。ファイル全体 (job の中の `permissions:` も含む) の権限の行が `contents: read` の 1 つだけ (`id-token: write` の追加・job への `contents: write`・`permissions: write-all` で赤)。`secrets.` の参照が無い | セキュリティ (設計 §8) |
| C3 | job `check` の手順の並び | `npm ci` → `npm run typecheck` → `npm test` → `npm run verify:data` (問題データ全件の検証。Task #23) → `npm run build` → `npm run check:size` の順に出る | 状態遷移 (順序。設計 §7) |
| C3b | `verify:data` の呼び方 | job `check` の `npm run verify:data` の行に `--require-complete` (値なし = 全難易度) がある。`=easy`・`=hard` の片方だけにしない | 異常系 (問題データの不足を警告で見逃さない。#26 の追加の受け入れ条件) |
| C4 | Node の設定 | `actions/setup-node` を使い、`node-version: 22` と `cache: npm` がある (`package.json` の `engines` と整合) | 正常 |
| C5 | job `e2e` の手順 | `npx playwright install --with-deps chromium` が `npm run test:e2e` より前にある。`check` とは別の job | 状態遷移 |
| C6 | job `e2e` の失敗時 | `if: failure()` (または `if: ${{ !cancelled() }}`) の手順で、`playwright-report` を `actions/upload-artifact` に上げる | 異常系 (失敗の原因を後から見られる) |
| C7 | `uses:` の全行 | 版の参照が付いている (`@main`・`@master`・版なしは無い)。メジャーのタグ (`@v7`) はメジャー版の中で付け替わる。それは受け入れる: 権限が読み取りだけで秘密が無いので、乗っ取られた action ができるのは CI を落とす・騙すことまで | セキュリティ (版の参照を必須にする。完全な固定ではない) |
| C8 | 各 job | `timeout-minutes` がある。ワークフローに `concurrency` があり、`cancel-in-progress: true` | 異常系 (固まった job が枠を食わない) |
| C9 | `ci.yml` が参照する npm スクリプト | `package.json` の `scripts` にすべて存在する (`typecheck`・`test`・`build`・`check:size`・`test:e2e`) | 同値 (設定と実体のずれ) |

## 実際の GitHub での確認 (PR を作ったあと)

| ID | 操作 | 期待する観測結果 |
| --- | --- | --- |
| G1 | PR を作る → `gh pr checks` | job `check` と `e2e` がどちらも成功 |
| G2 | 成功した run の `check` のログ | 型検査・単体テスト 20 件超・ビルド・予算確認が出る |
| G3 | 失敗の流し込み (任意): 一時的にテストを 1 つ壊した commit を push して赤になる → 戻す | CI が赤を返す (失敗を検知できる)。壊した commit は PR に残さない (rebase で消す)、または記録だけにする |

## 範囲外

- Vercel への公開 (#30。人間の作業を含む)
- 対応ブラウザ (WebKit・Firefox) の E2E (#30 の通し)

## 確かめた記録 (Sub-task #38)

- 単体 C1〜C9: 緑 (全体で 4 ファイル 29 件)。変異で赤になることを確認: 権限を `write` に・`id-token: write` の追加・job への `contents: write`・`permissions: write-all`・手順の入れ替え・`uses` を `@main`・`cancel-in-progress: false`・ブラウザのインストールを消す・`pull_request_target`。
- きれいな clone で CI と同じ手順 (`npm ci` → typecheck → test → build → check:size → `CI=1 npx playwright test`) がすべて通る。
- **G1**: PR #45 で job「型検査・単体テスト・ビルド」(15 秒)・「E2E (Playwright)」(33 秒) がどちらも成功 (`gh pr checks 45`)。
- **G2**: 成功した run のログに、`tsc --noEmit`・`Test Files 4 passed / Tests 29 passed`・`✓ built`・`dist: 3 ファイル、gzip 後の合計 927 B (予算 1000000 B 未満)`・E2E `12 passed` が出る。
- **G3**: 捨てるブランチ (calliope/ci-probe、PR #46) で `vercel.json` の出力先を確かめるテストの期待を `out` に変えて push → job「型検査・単体テスト・ビルド」が失敗 (E2E は成功)。確認後に PR を閉じ、ブランチを消した。壊した commit は main にも foundation にも入っていない。
- **#49**: C3 を `npm test` の次に `npm run verify:data` が来る順に直した (レッド: ci.yml が旧順で C3 が赤 → `ci.yml` に足して緑)。PR #79 で job「型検査・単体テスト・ビルド」(19 秒)・「E2E (Playwright)」(51 秒) がどちらも成功し、ログに `npm run verify:data` の実行が出る (`src/data: 0 問を検証`、数が足りない警告 4 件、終了コード 0)。
