# kessan-8

投資家向けの決算書・IR を題材にした、異変を探してループを抜けるブラウザゲーム (制作中)。

登場する会社・人物・数字はすべて架空です。

- 設計: [docs/design.md](docs/design.md) / 要件: [docs/requirements.md](docs/requirements.md) / 方針: [docs/charter.md](docs/charter.md)
- ライセンス: MIT ([LICENSE](LICENSE))

## 開発

Node 22.12 以上。

| コマンド | 内容 |
| --- | --- |
| `npm ci` | 依存を入れる (`package-lock.json` どおり) |
| `npm run dev` | 開発サーバ |
| `npm run typecheck` | 型検査 |
| `npm test` | 単体テスト (Vitest。E2E は回さない) |
| `npm run verify:data` | 問題データ全件 (見本 samples/*.json を含む) の検証 (会計の整合・異変の指定どおりにだけ破れているか)。`-- --require-complete[=easy|hard]` で数の不足も致命に、`-- --fail-on-soft` で参考の規則も致命に |
| `npm run build` | 型検査 + ビルド (出力は `dist/`) |
| `npm run check:size` | ビルド後の `dist/` が転送量の予算 (gzip の合計 1 MB 未満) に収まるか |
| `npm run test:e2e` | E2E (Playwright)。ビルドして `vite preview` に対して回す。初回は `npx playwright install chromium`。ポートが使用中なら `E2E_PORT=4180 npm run test:e2e` |
