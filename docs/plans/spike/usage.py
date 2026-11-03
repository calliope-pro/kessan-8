"""試作 (#15): 組のセッションの記録 (Claude Code の jsonl) から、assistant の usage を区間ごとに合計する。標準ライブラリのみ。
製品のコードではない。使いかた: python3 usage.py <記録のディレクトリ> 例: ~/.claude/projects/<このワークツリーの名前>/

方法 (plan-comparison §3.5 と同じ): assistant メッセージを message.id ごとに 1 回だけ数える (同じ id が複数行に出るので、出力トークンが最大の行を取る)。
区間は UTC の時刻 (記録の timestamp)。会話の本文・個人情報は読み出さない (usage・モデル・時刻・id だけ)。
役の見分けかたは、セッションごとのモデルと時間帯 (進める役 = sonnet、監視役・包括レビュー = opus)。どのファイルがどの役かは ROLES で指定する。
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone

d = os.path.expanduser(sys.argv[1])


def t(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(timezone.utc)


def load(path):
    best = {}
    for line in open(path, encoding='utf-8'):
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get('type') != 'assistant':
            continue
        m = o.get('message', {})
        u = m.get('usage')
        if not u or not m.get('id'):
            continue
        row = (u.get('output_tokens', 0), u.get('cache_read_input_tokens', 0), u.get('cache_creation_input_tokens', 0),
               u.get('input_tokens', 0), t(o['timestamp']), m.get('model'))
        if m['id'] not in best or row[0] >= best[m['id']][0]:
            best[m['id']] = row
    return list(best.values())


def total(rows, a, b):
    a, b = t(a), t(b)
    sel = [r for r in rows if a <= r[4] < b]
    return [sum(r[i] for r in sel) for i in range(4)] + [len(sel)]


def show(label, rows, a, b):
    o, cr, cc, i, n = total(rows, a, b)
    mins = (t(b) - t(a)).total_seconds() / 60
    print(f'{label:<46} {mins:6.1f} 分  出力 {o / 1e4:6.1f} 万  キャッシュ読み {cr / 1e4:7.0f} 万  キャッシュ作成 {cc / 1e4:6.1f} 万  入力 {i:>4}  (メッセージ {n})')
    return o, mins


files = {}
for f in sorted(glob.glob(os.path.join(d, '*.jsonl'))):
    rows = load(f)
    if rows:
        files[os.path.basename(f)[:8]] = rows
        first = min(r[4] for r in rows)
        last = max(r[4] for r in rows)
        models = sorted({r[5] for r in rows})
        print(f'{os.path.basename(f)[:8]}  {first:%H:%M:%S}〜{last:%H:%M:%S} UTC  メッセージ {len(rows)}  {models}')
print()
# 引数 2 以降: 進める役のファイルの先頭 8 文字、監視役のファイルの先頭 8 文字、区間の名前と開始・終了 (ISO)
exe, mon = sys.argv[2], sys.argv[3]
windows = [w.split(',') for w in sys.argv[4:]]  # 名前,開始,終了
tot = {'exe': 0, 'mon': 0}
for name, a, b in windows:
    print(f'## {name}')
    oe, m1 = show('  進める役 (sonnet)', files[exe], a, b)
    om, _ = show('  監視役 (opus)', files[mon], a, b)
    print(f'  出力合計 {(oe + om) / 1e4:.1f} 万トークン / 経過 {m1:.1f} 分 = 1 時間あたり {(oe + om) / m1 * 60 / 1e4:.1f} 万')
