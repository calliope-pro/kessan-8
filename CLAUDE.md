# CLAUDE.md

kessan-8: 投資家向けの決算書・IR を題材にした、異変を探してループを抜けるブラウザゲーム。

このプロジェクトは orchestra プラグイン (orchestra-core・orchestrating-business・orchestrating-develop) の決まりで進める。

## orchestra の設定

- tracker: github (アダプタ orchestra-tracker-github)
  - リポジトリ: calliope-pro/kessan-8
  - Project: https://github.com/users/calliope-pro/projects/4 (番号 4)
  - フィールド: Status (起票・着手可・作業・レビュー・確認待ち・完了)・優先度 (高・中・低)・見積もり (Number、単位は時間)・期限 (Date)
  - 状態の更新: `.orchestra/status.sh <issue 番号> <状態> [見積もり] [期限]`
  - 階層: sub-issue の入れ子。依存: Issue の dependencies (blocked by)
  - 種別: ラベル `type:epic`・`type:story`・`type:task`・`type:sub-task`
  - チーム: ラベル `team:business`・`team:develop`
- notifier: session (責任者の会話の中。件に `Q<連番>` を振る)
- 進める役: sonnet / high、監視役: opus / high (プラグインの既定)

## 置き場

- 要件: docs/requirements.md
- プロジェクト方針 (charter): docs/charter.md
- ADR: docs/adr/ (索引は docs/adr/README.md)
- 用語: GLOSSARY.md

## 守ること

- 公開リポジトリ。秘密・個人情報をコミットしない。コミットの作者のメールは GitHub の noreply を使う
- 実在の企業名・ロゴ・人物を使わない (要件)
