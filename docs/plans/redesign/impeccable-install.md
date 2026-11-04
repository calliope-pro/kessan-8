# impeccable の導入の記録 (Sub-task #121)

Task #116 の一部。`impeccable` (UI の設計の skill とアンチパターンの検出器) をこのプロジェクトに入れた。入れたもの・hook の挙動・ダウンロードするバイナリ・外部送信を確かめた記録。確かめた日: 2026-11-05。

## 何を入れたか

| 項目 | 内容 | 出所 |
| --- | --- | --- |
| npm パッケージ | `impeccable@4.8.0` (Paul Bakaus、Apache-2.0)。7 ファイル、約 60KB。`postinstall` などの script は無い。中身は起動用の `cli/bin/cli.js` と、実行形式の SHA-256 の一覧 `engine-checksums.txt` | `npm view impeccable@4.8.0`・`npm pack` で展開して読んだ (測った) |
| 実行形式 (engine) | `v0.1.18`。darwin-arm64 は 17.7MB。入手の経路は 2 つ。(a) `npx impeccable …` (npm の shim `cli.js`): `IMPECCABLE_BIN` → npm の optionalDependency `@impeccable/cli-<os>-<arch>@0.1.18` (registry.npmjs.org。レジストリの署名と integrity つき) → `~/.impeccable/bin/0.1.18/` のキャッシュ → GitHub の release `engine-v0.1.18`、の順。(b) skill の起動スクリプト `.claude/skills/impeccable/scripts/impeccable` (hook もこれ): 同じ階層の `bin/<os>-<arch>/` → `~/.impeccable/bin/` → 版つきキャッシュ → GitHub の release の取得、の順。GitHub から取るときは、同梱の SHA-256 と照合してから置き、合わなければ捨てる。実機で `543ee2f7…a9e1` が一覧と一致した | `cli.js`・起動スクリプトを読み、`npm view @impeccable/cli-darwin-arm64@0.1.18 dist.tarball dist.integrity` で経路 (a) を確かめ、実機で `shasum -a 256` (測った) |
| 入れた場所 | `npx impeccable install -y --providers=claude --scope=project` で、プロジェクトの `.claude/` だけ。`~` の下には書かない (後述の telemetry の設定を除く) | 実行して `git status` で確かめた (測った) |

### 入ったファイル

- `.claude/skills/impeccable/` — `SKILL.md`・`reference/*.md` (コマンドごとの手順書。`critique`・`audit` を含む)・`scripts/` (起動スクリプト・フォント索引・live 用の JS)
- `.claude/agents/impeccable-*.md` — 補助の 4 役 (asset-producer・documenter・finish-reviewer・manual-edit-applier)
- `.claude/settings.local.json` — hook の設定 (後述)。**コミットしない**
- 実行形式 `.claude/skills/impeccable/scripts/bin/darwin-arm64/impeccable` — **コミットしない**

## コミットするもの・しないもの

| コミットする | しない (`.gitignore`) |
| --- | --- |
| `.claude/skills/impeccable/` (実行形式以外。約 2.3MB)、`.claude/agents/impeccable-*.md`、`.claude/skills/impeccable/LICENSE` (Apache-2.0 の写し。再配布の条件)・`.claude/skills/impeccable/NOTICE.md` (上流の第三者表示。`reference/ios.md`・`android.md` は MIT の ehmo/platform-design-skills からの派生)、`.impeccable/config.json` (`telemetry: false` だけ)、この文書 | 実行形式 (17.7MB・OS ごと。起動スクリプトが無ければ検証つきで取り直す)、`.claude/settings.local.json` (各自の hook)、上流 README「Project files and git」の一覧 (`.gitignore` に `impeccable-ignore-start`〜`end` として写した。`.impeccable/config.json` と `critique/*.md` などの共有物は追跡のまま) |

- 秘密・個人情報の確認: コミットするファイルを `/Users/`・`calliope`・`@gmail`・API キーの形で grep し、該当なし
- 新しく clone した人: 実行形式が無い。起動スクリプトが `~/.impeccable/bin/0.1.18/` に取り、SHA-256 を照合してから使う。実機で、実行形式を除いた `.claude` を別の場所に置き、キャッシュを空にして `--version` を実行し、取得と照合が通ることを確かめた (測った)
- 実行形式の取得は、起動スクリプトか `cli.js` が行う。照合に使う一覧は同梱のものだけ。リリース側に置かれた一覧は使わない (起動スクリプトの注記)

## hook の中身

`.claude/settings.local.json` に、3 つのイベントで同じコマンド `scripts/impeccable hook` を呼ぶ設定が入る (どれも `.claude/skills/impeccable/scripts/impeccable` が無ければ何もしない)。

| イベント | 動き | timeout |
| --- | --- | --- |
| `SessionStart` | 準備のみ。出力なし (実機で確かめた) | 5 秒 |
| `PostToolUse` (`Edit`・`Write`) | 編集したファイルが UI のもの (`.html`・`.css`・`.ts` など) なら、検出器の「すぐ出す層」の規則だけで調べ、結果を「システムの注意書き」としてエージェントに返す。編集は止めない | 5 秒 |
| `Stop` | そのセッションで触った UI ファイルを、全規則で一度調べ、まだ出していない指摘だけを返す | 30 秒 |

- hook は編集を**止めない**。指摘を文脈に足すだけ (`hooks.md`)
- 作業ファイルは `.impeccable/` (`hook.cache.json` など。gitignore 済み)
- hook は**サンドボックスの外**で、エージェントと同じ環境・ネットワークで動く (公式の文書にも「サンドボックスと呼ぶな」とある)。実行形式の信頼が前提。そのため上の SHA-256 の照合と出所の確認をした
- 切る: `.claude/skills/impeccable/scripts/impeccable hooks off` (`.impeccable/config.json` の `hook.enabled: false`)
- hook の設定ファイルを gitignore に入れたので、この設定は共有されない。他の人は `impeccable install` を自分で実行して選ぶ

## 外部送信

出典: 公式のプライバシーの頁 https://impeccable.style/privacy (2026-11-05 に取得)・実行形式の文字列・実機の確認。

| 送信 | 内容 | 既定 | 対処 |
| --- | --- | --- | --- |
| 検出 (`detect`)・hook | 手元で動く。プロジェクトのファイルも結果も送らない | — | 実機で、macOS の `sandbox-exec` でネットワークを全部止めても `detect src/`・`hook` (PostToolUse・SessionStart) が通ることを確かめた (測った) |
| バージョン確認 | `impeccable.style/api/version`。プロジェクトの中身は送らない。1 日に 1 回まで | 有効 | 環境変数 `IMPECCABLE_NO_UPDATE_CHECK=1` |
| 配色などの案の抽選 (`/api/roll`) | 抽選の鍵・ラウンド・範囲。プロジェクト名・パス・本文は送らない。案のプレビュー画像は impeccable.style から読む | 有効 | この評価では使わない (`critique`・`audit`・`detect` だけ) |
| 選択の報告 (telemetry) | 選んだカード種別・位置・カタログ ID・版。方向の名前・説明は送らない。サーバーは IP・端末 ID を持たず、「削除の期限なく保存」 | **既定は on** | `"telemetry": false` を `.impeccable/config.json` に書いてコミットした。**ただし効くのは、作業ディレクトリがリポジトリの根のときだけ**: `HOME` を空にして `telemetry status` を実行すると、根では off、`src/` では on だった (測った。レビューの指摘で確認。素の `git init` のリポジトリでも同じと報告を受けた)。確実に止めるには、各自が `impeccable telemetry off` (`~/.impeccable/config.json`) か `DO_NOT_TRACK=1`・`IMPECCABLE_NO_TELEMETRY=1` を設定する。この環境の自分では `telemetry off` を実行済み。#122 の評価は根から実行する |
| 画像の生成 | `OPENAI_API_KEY` を設定したときだけ、プロンプトと参照画像が OpenAI へ | 鍵が無ければ無し | この環境には鍵を設定しない |
| 実行形式のダウンロード | 経路 (a) は npm のレジストリ、経路 (b) は GitHub の release。(b) は SHA-256 の照合に失敗すれば捨てる | 初回のみ | 上記「何を入れたか」 |
| 公式サイト (CLI ではない) | Google Analytics・PostHog | — | CLI の動きとは無関係 |

- `~` に書いたのは `~/.impeccable/config.json` (telemetry off の 1 行) だけ。リポジトリの外。他の人の環境は変えない
- `DO_NOT_TRACK=1` も telemetry を止める

## 残る注意

- 実行形式は 1 社 (個人) の署名なしバイナリ。npm のレジストリが付けた署名 (`npm view` に出る) と SHA-256 一覧で出所は確かめたが、署名の検証 (`npm audit signatures`) と実行形式の中身の解析まではしていない。hook で毎回動かすので、気になるなら `hooks off` で切って、`detect` を手で動かすだけにする
- `live` (ブラウザで案を作る) 機能は localhost で動く別の仕組み。この Task では使わない
- `/impeccable init` は設計の方針を聞き取って `PRODUCT.md` などを作る。このリポジトリには入れていない (企画の組の領分)
