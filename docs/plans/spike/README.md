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

## Task の ID の対応 (#13)

plan-comparison.md と estimate.py は、決定の ID (D-P2 など) とぶつからないように、案 C の生成の Task を G1〜G11 から S1〜S11 に、結合テストと包括レビューを Q1・Q2 から F1・F2 に変えた。`tech-assessment.md` と各測定の md は、変える前の ID (G5〜G10・G3・G4 など) で書いてある。対応は G → S (たとえば G10 = S10 = 生成の規則と異変の規則の一次資料での確認)。`reversal.py` は新しい ID に直した (出力は変わらない)。
