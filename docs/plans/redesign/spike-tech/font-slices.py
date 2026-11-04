# -*- coding: utf-8 -*-
# 試作 (製品のコードではない)。Task #125 / Sub-task #126。標準ライブラリのみ。ネットワークを使う (fonts.googleapis.com・fonts.gstatic.com)。
# Google Fonts の CSS2 API が返す Noto Sans JP (Regular 400) の unicode-range の分割の、各 woff2 の大きさ (HEAD の Content-Length) と、
# ゲームに出る文字 (src の非テスト) を覆うのに必要な枚数・大きさを出す。ファイルは書かない。
# 使いかた (リポジトリの根から): python3 docs/plans/redesign/spike-tech/font-slices.py
import glob, os, re, urllib.request

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400&display=swap'
css = urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': UA}), timeout=30).read().decode('utf-8')
blocks = re.findall(r"src: url\((https://[^)]+)\) format\('woff2'\);\s*unicode-range: ([^;]+);", css)
print('スライス', len(blocks), '枚')

def ranges(s):
    out = []
    for part in s.split(','):
        part = part.strip()[2:]
        if '-' in part:
            a, b = part.split('-'); out.append((int(a, 16), int(b, 16)))
        else:
            out.append((int(part, 16), int(part, 16)))
    return out

R = [(u, ranges(r)) for u, r in blocks]
sizes = {}
for u, _ in R:
    req = urllib.request.Request(u, method='HEAD', headers={'User-Agent': UA})
    sizes[u] = int(urllib.request.urlopen(req, timeout=30).headers['Content-Length'])
vals = sorted(sizes.values())
print('全スライスの woff2 の合計:', sum(vals), 'B =', round(sum(vals) / 1e6, 2), 'MB / 最大', vals[-1], '/ 最小', vals[0], '/ 中央', vals[len(vals) // 2])

root = os.getcwd() + '/'
files = glob.glob(root + 'src/data/**/*.json', recursive=True) + glob.glob(root + 'src/ui/**/*.ts', recursive=True) + [root + 'src/domain/labels.ts', root + 'index.html']
chars = set()
for f in files:
    if f.endswith('.test.ts'): continue
    chars |= set(open(f, encoding='utf-8').read())
non_ascii = {c for c in chars if ord(c) > 0x7F}
need, missing = set(), []
for c in non_ascii:
    hit = next((u for u, rg in R if any(a <= ord(c) <= b for a, b in rg)), None)
    if hit: need.add(hit)
    else: missing.append(c)
print('ゲームに出る文字: 全', len(chars), '/ 非 ASCII', len(non_ascii))
print('覆うのに必要なスライス:', len(need), '枚 /', sum(sizes[u] for u in need), 'B =', round(sum(sizes[u] for u in need) / 1e3), 'KB')
print('どのスライスにも無い文字 (別の subset に入る・フォントに無い):', len(missing), ''.join(sorted(missing)))
