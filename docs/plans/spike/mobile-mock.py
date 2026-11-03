"""試作 (#11): 手書き 1 問 (hand-q01-full.json) を、スマホ幅 (375px) と PC 幅で表示する 1 枚の HTML を作り、はみ出しなどを測る。
標準ライブラリのみ。使いかた (docs/plans/spike/ で): python3 mobile-mock.py  → mobile-mock.html を書く。製品のコードではない。
測りかた: headless Chrome で --window-size を変えて --dump-dom し、ページ内の script が書いた計測値を読む (measure.sh)。
"""
import json

q = json.load(open('hand-q01-full.json'))


def fmt(v):
    return f'{v:,}' if isinstance(v, int) else str(v)


def table(title, cols, rows):
    h = ''.join(f'<th>{c}</th>' for c in cols)
    b = ''.join('<tr>' + ''.join(f'<td>{fmt(x)}</td>' for x in r) + '</tr>' for r in rows)
    return f'<section><h2>{title}</h2><table><tr>{h}</tr>{b}</table></section>'


sm = q['サマリー']
pl = q['損益計算書']
rows_sm = [(k, v['前期'], v['当期'], f"{v['増減率']}%") for k, v in sm.items() if isinstance(v, dict)]
rows_pl = [(k, pl['前期'][k], pl['当期'][k]) for k in pl['当期']]
bs = q['貸借対照表']
rows_bs = [(k, bs['前期末'][k], bs['当期末'][k]) for k in bs['当期末']]
# 資料束: 短信 (左) と IR スライド (右) を並べる / 縦に積む の 2 つの見せ方を試す。IR 側は損益の要点を写したモック
ir = f'<section class="ir"><h2>IR スライド (モック)</h2><p>売上高 {fmt(pl["当期"]["売上高"])} 百万円 (前期比 +{sm["売上高"]["増減率"]}%)</p><p>営業利益 {fmt(pl["当期"]["営業利益"])} 百万円</p><p>経常利益 {fmt(pl["当期"]["経常利益"])} 百万円</p></section>'
body = table('サマリー', ['項目', '前期', '当期', '増減率'], rows_sm) + table('損益計算書', ['項目', '前期', '当期'], rows_pl) + table('貸借対照表', ['項目', '前期末', '当期末'], rows_bs)
html = f'''<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>mobile mock</title>
<style>
body{{font:16px/1.5 system-ui,"Hiragino Sans",sans-serif;margin:0;padding:8px}}
table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid #ccc;padding:4px 6px}}
td:not(:first-child){{text-align:right;font-variant-numeric:tabular-nums}} h2{{font-size:18px}}
.pair{{display:grid;grid-template-columns:1fr;gap:8px}} @media(min-width:900px){{.pair{{grid-template-columns:2fr 1fr}}}}
</style>
<div class=pair><div>{body}</div>{ir}</div>
<script>
addEventListener('load',()=>{{const d=document.documentElement;
const fs=[...document.querySelectorAll('td,th,p,h2')].map(e=>parseFloat(getComputedStyle(e).fontSize));
const tables=[...document.querySelectorAll('table')].map(t=>t.getBoundingClientRect().width);
const m={{innerWidth:innerWidth,scrollWidth:d.scrollWidth,overflowX:d.scrollWidth>innerWidth,minFont:Math.min(...fs),
 maxTableWidth:Math.max(...tables),docHeight:d.scrollHeight,rows:document.querySelectorAll('tr').length,
 pairColumns:getComputedStyle(document.querySelector('.pair')).gridTemplateColumns.split(' ').length}};
document.title='M'+JSON.stringify(m);}});
</script>'''
open('mobile-mock.html', 'w').write(html)
print('mobile-mock.html', len(html.encode()), 'bytes')

# ---- 幅を変えて測る: headless Chrome は窓幅が 500px 未満にできないので、iframe (srcdoc) の幅で測る ----
import html as _h
frames = ''.join(f'<iframe id="f{w}" width="{w}" height="800" srcdoc="{_h.escape(html, quote=True)}"></iframe>' for w in (320, 360, 375, 414))
open('mobile-measure.html', 'w').write(f'''<!doctype html><meta charset=utf-8><title>wait</title>{frames}
<script>addEventListener('load',()=>setTimeout(()=>{{const out={{}};
for(const w of [320,360,375,414]){{const f=document.getElementById('f'+w);const d=f.contentDocument.documentElement;
const fs=[...f.contentDocument.querySelectorAll('td,th,p,h2')].map(e=>parseFloat(f.contentWindow.getComputedStyle(e).fontSize));
out[w]={{innerWidth:f.contentWindow.innerWidth,scrollWidth:d.scrollWidth,overflowX:d.scrollWidth>f.contentWindow.innerWidth,minFont:Math.min(...fs),docHeight:d.scrollHeight,
 maxTableWidth:Math.max(...[...f.contentDocument.querySelectorAll('table')].map(t=>t.getBoundingClientRect().width)),
 cols:f.contentWindow.getComputedStyle(f.contentDocument.querySelector('.pair')).gridTemplateColumns.split(' ').length}}}}
document.title='R'+JSON.stringify(out)}},300))</script>''')
