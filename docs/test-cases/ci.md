# ケース表: CI (Sub-task #38)

設計: [docs/design.md](../design.md) §7 (CI の順序)・§8 (秘密・権限)。受け入れ条件 (Task #21): ビルド・単体テスト・E2E が CI (GitHub Actions) で回る。秘密が無い。

CI は実際に GitHub 上で回して確かめるのが本物の確認なので、(1) 設定ファイルの約束を単体テストで固定し、(2) PR を作ったあとの `gh pr checks` の結果を記録する。

## 単体 (Vitest。`src/ci.test.ts`、`.github/workflows/ci.yml` のテキストを読む)

| ID | 入力・操作 | 期待する観測結果 | 観点 |
| --- | --- | --- | --- |
| C1 | `ci.yml` の `on:` | `pull_request` と、`push` の `branches: [main]` がある。`pull_request_target` は無い | 正常 + セキュリティ (フォークの PR に秘密を渡さない) |
| C2 | 権限 | 最上位に `permissions:` があり `contents: read` だけ。`secrets.` の参照が無い | セキュリティ (設計 §8) |
| C3 | job `check` の手順の並び | `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm run check:size` の順に出る | 状態遷移 (順序。設計 §7) |
| C4 | Node の設定 | `actions/setup-node` を使い、`node-version: 22` と `cache: npm` がある (`package.json` の `engines` と整合) | 正常 |
| C5 | job `e2e` の手順 | `npx playwright install --with-deps chromium` が `npm run test:e2e` より前にある。`check` とは別の job | 状態遷移 |
| C6 | job `e2e` の失敗時 | `if: failure()` (または `if: ${{ !cancelled() }}`) の手順で、`playwright-report` を `actions/upload-artifact` に上げる | 異常系 (失敗の原因を後から見られる) |
| C7 | `uses:` の全行 | 版の参照が付いている (`@main`・`@master`・版なしは無い) | セキュリティ (動く版が勝手に変わらない) |
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
