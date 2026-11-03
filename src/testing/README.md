# src/testing/ (試験用)

単体テストと E2E (`vite build --mode e2e`) が使う試験用の問題・会社・異変の種類。**本番のバンドルには入れない** (本番の `src/data/index.ts` は `src/testing/` を読まない)。

- `base-problem.json`: 設計の基準問題 (正常。検証器の `normal.problem.json` と同じ中身。検証器の組 #47 の `src/verifier/fixtures/` が main に入ったら、重複を外してそちらを読む)
- `fixtures.ts`: 基準問題から、会社・難易度・あり/なし・段・異変の種類を変えた問題を作る。会計の整合は保証しない (遊びの流れの確かめ用)
