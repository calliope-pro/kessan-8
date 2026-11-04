# 試作 (製品のコードではない)。Task #125 / Sub-task #126。標準ライブラリのみ。
# 同じ会社の連続した期の問題が、「前期の欄 = 前の期の当期」でつながっているかを数える (案 3 の材料)。
# 使いかた (リポジトリの根から): python3 docs/plans/redesign/spike-tech/chain.py
import collections, glob, json

by = collections.defaultdict(dict)
for f in glob.glob('src/data/problems/*/*.json'):
    p = json.load(open(f, encoding='utf-8'))
    by[p['companyId']][p['fiscalYear']] = p

breaks, pairs, bs_ok = [], 0, 0
for c, ys in sorted(by.items()):
    years = sorted(ys)
    run, best = [years[0]], []
    for y in years[1:]:
        if y == run[-1] + 1:
            run.append(y)
        else:
            best = max(best, run, key=len)
            run = [y]
    best = max(best, run, key=len)
    print(c, '年', years, '連続した最長', len(best), best)
    for y in years:
        if y + 1 in ys:
            a, b = ys[y], ys[y + 1]
            pairs += 1
            if a['tanshin']['summary']['netSales']['current'] != b['tanshin']['summary']['netSales']['previous']:
                breaks.append((c, y, a['id'], b['id'], a['difficulty'], b['difficulty']))
            if a['tanshin']['balanceSheet']['current']['totalAssets'] == b['tanshin']['balanceSheet']['previous']['totalAssets']:
                bs_ok += 1
print('連続する期の組', pairs, '/ 売上高が前期の欄とつながらない', len(breaks), '/ 総資産がつながる', bs_ok)
for b in breaks:
    print('  つながらない:', b)
for d in ('easy', 'hard'):
    print(d, {c: sorted(y for y, p in ys.items() if p['difficulty'] == d) for c, ys in sorted(by.items())})
