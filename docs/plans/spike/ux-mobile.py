"""試作 (#41): UX 案の部品 (タブ・印・検算・並べて見る) を、スマホ幅でタップの的 44×44 CSS px 以上にして置けるかを測る。
標準ライブラリのみ。使いかた (docs/plans/spike/ で): python3 ux-mobile.py <出力ディレクトリ>  → ux-measure.html を書く。製品のコードではない。
測りかた: README.md の「スマホ幅の測定」と同じ (headless Chrome は窓幅 500 px 未満にできないので iframe の幅で測る)。
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=1500,900 \
    --virtual-time-budget=3000 --dump-dom "file://<出力ディレクトリ>/ux-measure.html" | grep -o '<title>R[^<]*'
資料は hand-q01-full.json (短信) と hand-q01-ir.json (IR)。数字のセルは <td> に data-path を付け、印・検算の的になる。
"""
import html as h
import json
import sys

out = sys.argv[1]
q = json.load(open('hand-q01-full.json'))
ir = json.load(open('hand-q01-ir.json'))


def fmt(v):
    return f'{v:,}' if isinstance(v, int) else str(v)


def table(path, cols, rows):
    head = ''.join(f'<th>{c}</th>' for c in cols)
    body = ''.join(
        f'<tr><th scope=row>{r[0]}</th>' + ''.join(f'<td data-path="{path}.{r[0]}.{i}" tabindex=0>{fmt(x)}</td>' for i, x in enumerate(r[1:])) + '</tr>'
        for r in rows)
    return f'<table class=doc><tr><th></th>{head}</tr>{body}</table>'


sm = q['サマリー']
screens = {
    'summary': table('summary', ['当期', '前期', '増減率'], [(k, v['当期'], v['前期'], f"{v['増減率']}%") for k, v in sm.items() if isinstance(v, dict)]),
    'bs': table('bs', ['前期末', '当期末'], [(k, q['貸借対照表']['前期末'][k], q['貸借対照表']['当期末'][k]) for k in q['貸借対照表']['当期末']]),
    'pl': table('pl', ['前期', '当期'], [(k, q['損益計算書']['前期'][k], q['損益計算書']['当期'][k]) for k in q['損益計算書']['当期']]),
    'cf': table('cf', ['当期'], [(k, v) for k, v in q['キャッシュ・フロー計算書'].items()]),
}
# 並べて見る (T3): 短信と IR の同じ項目の対 (上下 2 段)
pairs = [('売上高', q['損益計算書']['当期']['売上高'], ir['スライド']['1 ハイライト']['売上高']['金額']),
         ('営業利益', q['損益計算書']['当期']['営業利益'], ir['スライド']['1 ハイライト']['営業利益']['金額']),
         ('経常利益', q['損益計算書']['当期']['経常利益'], ir['スライド']['1 ハイライト']['経常利益']['金額']),
         ('親会社株主に帰属する当期純利益', q['損益計算書']['当期']['親会社株主に帰属する当期純利益'], ir['スライド']['1 ハイライト']['親会社株主に帰属する当期純利益']['金額']),
         ('設備投資', -q['キャッシュ・フロー計算書']['有形固定資産の取得による支出'], ir['スライド']['5 補足']['設備投資']['当期'])]
screens['compare'] = ('<div class=stack><section><h2>決算短信</h2>' + table('t3a', ['当期'], [(k, a) for k, a, b in pairs]) +
                      '</section><section><h2>IR スライド</h2>' + table('t3b', ['当期'], [(k, b) for k, a, b in pairs]) + '</section></div>')

tabs = ''.join(f'<button class=tab>{t}</button>' for t in ['1', '2', '3', '4', '5'])
panels = ''.join(f'<div class=panel>{v}</div>' for v in screens.values())
page = f'''<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>ux mock</title>
<style>
*{{box-sizing:border-box}} body{{font:14px/1.4 system-ui,"Hiragino Sans",sans-serif;margin:0;padding:0 8px 140px}}
.docs{{display:flex;gap:8px;margin:8px 0}} .docs button{{flex:1;min-height:44px;font:inherit}}
.tabs{{display:flex}} .tab{{flex:1;min-width:44px;min-height:44px;font:inherit}}
table.doc{{border-collapse:collapse;width:100%}} table.doc th,table.doc td{{border-bottom:1px solid #ccc;padding:4px 6px;height:44px}}
table.doc th[scope=row]{{text-align:left;font-weight:normal}} table.doc td{{text-align:right;font-variant-numeric:tabular-nums;min-width:44px;touch-action:manipulation;user-select:none}}
.bar{{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:8px;display:grid;gap:8px;grid-template-columns:1fr 1fr}}
.bar button,.bar output{{min-height:44px;font:inherit;display:flex;align-items:center;justify-content:center}}
.bar output{{grid-column:1/-1;background:#fff}}
h2{{font-size:15px;margin:8px 0 0}}
</style>
<div class=docs><button>決算短信</button><button>IR スライド</button></div>
<div class=tabs>{tabs}</div>
{panels}
<div class=bar><button id=mark>印 切替</button><button id=calc>検算</button><output>差 ・ 比 の結果</output></div>
'''
open(f'{out}/ux-mock.html', 'w').write(page)

frames = ''.join(f'<iframe id="f{w}" width="{w}" height="800" srcdoc="{h.escape(page, quote=True)}"></iframe>' for w in (320, 360, 375, 414))
open(f'{out}/ux-measure.html', 'w').write(f'''<!doctype html><meta charset=utf-8><title>wait</title>{frames}
<script>addEventListener('load',()=>setTimeout(()=>{{const out={{}};
for(const w of [320,360,375,414]){{const f=document.getElementById('f'+w);const d=f.contentDocument,W=f.contentWindow;
const rect=e=>e.getBoundingClientRect();
const panels=[...d.querySelectorAll('.panel')];
const per={{}};
panels.forEach((p,i)=>{{p.style.display='block';panels.forEach((o,j)=>{{if(j!==i)o.style.display='none'}});
 per[i]={{scrollWidth:d.documentElement.scrollWidth,docHeight:d.documentElement.scrollHeight}};}});
panels.forEach(p=>p.style.display='block');
const targets=[...d.querySelectorAll('td[data-path],button,output')];
const tabs=[...d.querySelectorAll('.tab')];
out[w]={{innerWidth:W.innerWidth,perScreen:per,
 minTargetW:Math.min(...targets.map(e=>rect(e).width)),minTargetH:Math.min(...targets.map(e=>rect(e).height)),
 tabsRight:Math.max(...tabs.map(e=>rect(e).right)),tabMinW:Math.min(...tabs.map(e=>rect(e).width)),
 maxTableW:Math.max(...[...d.querySelectorAll('table')].map(e=>rect(e).width)),
 minFont:Math.min(...[...d.querySelectorAll('td,th')].map(e=>parseFloat(W.getComputedStyle(e).fontSize)))}}}}
document.title='R'+JSON.stringify(out)}},300))</script>''')
print('wrote', out)
