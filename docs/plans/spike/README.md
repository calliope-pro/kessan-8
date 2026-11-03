# docs/plans/spike/ の再現手順

試作。製品のコードではない。標準ライブラリのみ (Python 3.9)。スマホ幅の測定だけ macOS の Google Chrome (headless) を使う。このディレクトリで実行する。

| 目的 | コマンド | 記録 |
| --- | --- | --- |
| 生成した正常データの整合・通過率・変異 (#10) | `python3 run.py 20000` | gen-measure.md |
| 異変の注入 (#10) | `python3 inject.py 200` | gen-measure.md |
| 案 B/C の総工数の再計算・逆転の判定 (#11) | `python3 reversal.py` | ../tech-assessment.md §3 |
| IR スライドが短信と整合するか (#14) | `python3 check_ir.py` | hand-q01-measure.md |
| 問題データの転送量 (#11・#14) | `python3 transfer.py` | ../tech-assessment.md §2 #4 |
| スマホ幅の表示 (#11) | 下 | ../tech-assessment.md §2 #3 |
| 組のセッションの usage (#15) | `python3 usage.py ...` (下) | ../tech-assessment.md §2 #7 |

## スマホ幅の測定

headless Chrome は窓幅を 500 px 未満にできないので、iframe (srcdoc) の幅 (320・360・375・414 px) で測る。

```sh
python3 mobile-mock.py        # mobile-mock.html と mobile-measure.html を書く
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1500,900 --virtual-time-budget=3000 --dump-dom "file://$PWD/mobile-measure.html" \
  | grep -o '<title>R[^<]*'   # <title> に幅ごとの scrollWidth・最小文字・高さが JSON で出る
```

## 作成要領 (JPX 決算短信・四半期決算短信 作成要領等、2026 年 7 月版) の取得

```sh
curl -sS -o sakusei.pdf -w '%{http_code} %{size_download}\n' \
  https://www.jpx.co.jp/equities/listed-co/format/summary/tvdivq0000004wuh-att/t13vrt0000010n9j.pdf
# → 200 2165223 (66 ページ)。WebFetch ツールでは 403 になるが、curl では取れる。
```

テキストの取り出しは pypdf (標準ライブラリ外。ここでは p.22〜28 の読み取りだけに使った)。pdftotext・pdftoppm は入っていなかった。

## 前提にした plan-comparison / estimate.py の版と、Task の ID の対応 (#13・#15)

`reversal.py` は `docs/plans/estimate.py` の Task の ID を引く。案 C の生成の Task の ID は、ブランチ calliope/biz-plan の今の版 (feda44e 以降) では S1〜S11 (結合テスト・包括レビューは F1・F2)、#8 を切った時点の版 (f91b62a) では G1〜G11 (Q1・Q2)。**`reversal.py` は #15 で、どちらの版の estimate.py でも動くようにした** (`P = 'S' if 'S5' in E.PLANS['C'] else 'G'` で前置を選ぶ)。確かめた: (1) tech-spike の estimate.py (G*) と (2) `git archive origin/calliope/biz-plan docs` の estimate.py (S*。9e3f792 で確認) のどちらでも終了コード 0 で、出力は ID の表記を除いて同一。(2) では biz-plan 自身の reversal.py の出力と 1 字も違わない。本文 (`../tech-assessment.md` §3.2) の数字 (案 B 119.2 h・境目 t < 0.126 など) が出る。

plan-comparison.md と estimate.py は、決定の ID (D-P2 など) とぶつからないように、案 C の生成の Task を G1〜G11 から S1〜S11 に、結合テストと包括レビューを Q1・Q2 から F1・F2 に、open-decisions の Q1 (確認の水準) を D-Q1 に変えた。対応は G → S (たとえば G10 = S10 = 生成の規則と異変の規則の一次資料での確認)。`tech-assessment.md` と `gen-measure.md` は #15 で今の ID (S*・F*・D-Q1) に直した。

## 組のセッションの記録から usage を測る (#15)

```sh
python3 usage.py ~/.claude/projects/<このワークツリーの名前>/ <進める役のファイルの先頭 8 文字> <監視役のファイルの先頭 8 文字> \
  "名前,2026-11-03T13:22:22Z,2026-11-03T14:09:10Z" ...   # 区間は UTC
```

tech-assessment.md §2 #7 の区間 (UTC): Task #8 全体 13:22:22Z〜14:09:10Z、#10 13:25:58Z〜13:39:45Z、#11 13:39:45Z〜13:47:23Z、#14 13:56:41Z〜14:08:35Z。進める役のファイルは dbf3d823、監視役は 85525aca (先頭 8 文字)。

assistant の usage を message.id ごとに 1 回だけ合計する (plan-comparison §3.5 と同じ方法)。会話の本文は読まない。区間ごとに合計できる点が、biz-plan の `docs/plans/usage.py` (セッション全体の合計) と違う。結果は `../tech-assessment.md` §2 #7。
