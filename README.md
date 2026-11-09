# ８期連続 (kessan-8)

決算書と IR の異変を探して、8 社連続で見抜け。

投資家向けの決算書・IR を題材にした、異変を探してループを抜けるブラウザゲームです。

登場する会社・人物・数字はすべて架空です。投資判断の助言ではありません。

## 遊び方

> 画面は作り直し中です (#141)。いまの画面は題名と「作り直し中」だけで、下はこれから作る遊び方です。

1. 難易度を選びます (やさしい: 知識なしでも遊べます。むずかしい: 会計の基礎がある人向けです)。
2. 毎周の最初に、正常な決算カードの見本 (0 社目) が出ます。続いて 1 社ずつ決算カード (むずかしいは、カードの下に決算短信と IR の資料) を見て、「異変あり」か「異変なし (いつも通り)」かを 1 回押して判定します。
3. 正しければ次の会社へ進みます。8 社連続で正しく判定するとクリアです。間違えると、0 社目の見本に戻ります。

## 公開 URL

公開 URL は、引き取りのあとに入れます (いまの公開は一時的なもので、URL は変わります)。

## 資料

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
