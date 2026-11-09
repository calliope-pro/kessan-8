#!/bin/sh
# 設計 v3 §3.2: 日本語フォントを「使う字のサブセット」で自前で置いたときの WOFF2 の大きさの見積もり (charter: 初回 1 MB 未満・外部への通信をしない)。製品のコードではない。
# 方法: (1) 今の問題・会社・見本・科目名・異変の種類に出る字を数える (a)。画面の文言の上限として、docs の文書の字も足す (b)。(2) Noto Sans JP (Google Fonts の可変フォント。OFL) を fonttools (pyftsubset) で WOFF2 のサブセットにして大きさを測る。
# 使いかた (リポジトリの根から。作業用の場所は第 1 引数。ネットワークが要る): sh docs/plans/redesign/spike-design/v3-font-size.sh <空の作業ディレクトリ>
set -e
W="$1"; [ -n "$W" ] || { echo "使いかた: sh $0 <空の作業ディレクトリ>"; exit 2; }
ROOT="$(pwd)"; mkdir -p "$W"; cd "$W"
python3 -m venv venv && ./venv/bin/pip install -q fonttools brotli
curl -sL -o NotoSansJP.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf'
ROOT="$ROOT" ./venv/bin/python - <<'PY'
import json, glob, os
root = os.environ['ROOT']
def chars_of(o, acc):
    if isinstance(o, str): acc.update(o)
    elif isinstance(o, dict):
        for k, v in o.items(): chars_of(k, acc); chars_of(v, acc)
    elif isinstance(o, list):
        for v in o: chars_of(v, acc)
data = set()
for f in glob.glob(f'{root}/src/data/problems/*/*.json') + [f'{root}/src/data/companies.json'] + glob.glob(f'{root}/src/data/samples/*.json'): chars_of(json.load(open(f, encoding='utf-8')), data)
for f in [f'{root}/src/domain/labels.ts', f'{root}/src/data/anomaly-kinds.json']: data.update(open(f, encoding='utf-8').read())
docs = set()
for f in ['docs/design-v3.md', 'GLOSSARY.md', 'docs/requirements.md', 'PRODUCT.md', 'DESIGN.md']: docs.update(open(f'{root}/{f}', encoding='utf-8').read())
base = set('0123456789,.%-+△▲()（）・:：　 ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
na = lambda s: {c for c in s if ord(c) > 127 and not c.isspace()}
print('(a) データ・科目名・種類に出る字', len(data | base), '(非 ASCII', len(na(data)), ') / (b) 文書の字も足した上限', len(data | docs | base), '(非 ASCII', len(na(data | docs)), ')')
open('chars_a.txt', 'w', encoding='utf-8').write(''.join(sorted(data | base)))
open('chars_b.txt', 'w', encoding='utf-8').write(''.join(sorted(data | docs | base)))
PY
for w in 400 700; do ./venv/bin/fonttools varLib.instancer NotoSansJP.ttf wght=$w -o NotoSansJP-$w.ttf -q; done
for set in a b; do for src in NotoSansJP NotoSansJP-400 NotoSansJP-700; do ./venv/bin/pyftsubset $src.ttf --text-file=chars_$set.txt --flavor=woff2 --layout-features='*' --output-file=out-$set-$src.woff2; done; done
ls -l out-*.woff2 | awk '{print $5, $9}'
