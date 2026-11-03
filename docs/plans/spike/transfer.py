"""試作 (#14): 問題データと、スマホ幅のモック HTML の転送量 (gzip) を出す。標準ライブラリのみ。製品のコードではない。
使いかた (docs/plans/spike/ で): python3 transfer.py
計算: JSON を読み直して空白を除き (separators=(',', ':'))、UTF-8 にして gzip -9 した長さ。30 問分は 1 問の長さを 30 倍する (問題の大きさは同じと仮定)。KiB = 1024 B。
(ファイルのまま gzip すると、インデントの空白の分だけ大きい: hand-q01-full.json で 1,785 B。配信するデータは空白を除くのが普通なので、空白を除いた値を使う。)
"""
import gzip
import json


def gz_min(path):
    raw = json.dumps(json.load(open(path)), ensure_ascii=False, separators=(',', ':')).encode()
    return len(raw), len(gzip.compress(raw, 9))


for p in ('hand-q01-full.json', 'hand-q01-ir.json'):
    raw, g = gz_min(p)
    print(f'{p}: 空白を除いた JSON {raw} B / gzip {g} B / 30 問分 {30 * g} B = {30 * g / 1024:.1f} KiB')
fr, fg = gz_min('hand-q01-full.json')
ir, ig = gz_min('hand-q01-ir.json')
print(f'資料束 (短信 + IR) 1 問 gzip {fg + ig} B / 30 問分 {30 * (fg + ig)} B = {30 * (fg + ig) / 1024:.1f} KiB')
html = open('mobile-mock.html', 'rb').read()
print(f'mobile-mock.html: {len(html)} B / gzip {len(gzip.compress(html, 9))} B')
