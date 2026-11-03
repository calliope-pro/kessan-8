"""組のセッションの記録 (~/.claude/projects/<ワークツリーに対応するディレクトリ>/*.jsonl) から、
assistant メッセージの usage を、メッセージ ID ごとに 1 回だけ合計する (標準ライブラリのみ)。
estimate.py の MEASURED (AI の利用枠の実測値) と plan-comparison.md §3.5 の再現用。
個人情報・秘密は出力しない (本文は読まない。セッションは先頭 8 文字だけ)。

使いかた:
  python3 docs/plans/usage.py [--until 切る時刻] [--sessions 先頭8文字,...] [--window 名前,開始,終了]... <記録のディレクトリ> [...]
    --until    この時刻 (UTC。例 2026-11-03T14:34:00Z) までのメッセージだけ数える
    --sessions 数えるセッションを先頭 8 文字で絞る
    --window   名前,開始,終了 (UTC) の区間ごとに合計する (何度でも指定できる)。区間の長さは、区間内の最初と最後のメッセージの間
  記録のディレクトリは、~/.claude/projects/ の下の、ワークツリーのパスを - でつないだ名前 (複数指定できる)。
例 (plan-comparison.md §3.5 の Task #3 の区間。d は biz-plan のディレクトリ):
  python3 docs/plans/usage.py --sessions 4495bc82,81092a43 \\
    --window "#4-#6,2026-11-03T12:34:00Z,2026-11-03T13:17:30Z" \\
    --window "#12,2026-11-03T13:30:00Z,2026-11-03T13:46:00Z" \\
    --window "#13,2026-11-03T14:06:00Z,2026-11-03T14:26:00Z" ~/.claude/projects/<biz-plan のディレクトリ>
"""
import collections
import glob
import json
import os
import sys
from datetime import datetime

KEYS = ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')


def load(directories, sessions=None, until=None):
    """(セッション, メッセージ ID) ごとに、同じ ID の最後の記録を使う。"""
    seen = {}
    for d in directories:
        for f in sorted(glob.glob(os.path.join(os.path.expanduser(d), '*.jsonl'))):
            sid = os.path.basename(f)[:8]
            if sessions and sid not in sessions:
                continue
            for line in open(f, encoding='utf-8'):
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                m = r.get('message') or {}
                ts = r.get('timestamp')
                if r.get('type') != 'assistant' or not isinstance(m, dict) or not m.get('usage') or not ts:
                    continue
                if until and ts > until:
                    continue
                seen[(sid, m.get('id') or r.get('uuid'))] = (ts, m.get('model'), m['usage'])
    return seen


def parse(ts):
    return datetime.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S')


def summarize(records):
    agg = collections.defaultdict(collections.Counter)
    for ts, model, u in records:
        for k in KEYS:
            agg[model][k] += u.get(k, 0) or 0
    tss = sorted(ts for ts, _, _ in records)
    minutes = (parse(tss[-1]) - parse(tss[0])).total_seconds() / 60 if tss else 0.0
    return agg, minutes


def main(argv):
    until = sessions = None
    windows, dirs = [], []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--until':
            until = argv[i + 1]; i += 2
        elif a == '--sessions':
            sessions = set(argv[i + 1].split(',')); i += 2
        elif a == '--window':
            windows.append(argv[i + 1].split(',')); i += 2
        else:
            dirs.append(a); i += 1
    if not dirs:
        sys.exit(__doc__)
    seen = load(dirs, sessions, until)
    if not windows:
        by = collections.defaultdict(list)
        for (sid, _), v in seen.items():
            by[sid].append(v)
        total = []
        for sid, recs in sorted(by.items()):
            agg, minutes = summarize(recs)
            print(sid, min(r[0] for r in recs), max(r[0] for r in recs), len(recs), 'メッセージ')
            for model, c in agg.items():
                print('  ', model, dict(c))
            total += recs
        agg, _ = summarize(total)
        print('合計', {k: sum(c[k] for c in agg.values()) for k in KEYS})
        return
    grand = collections.Counter()
    gmin = 0.0
    for name, lo, hi in windows:
        recs = [v for v in seen.values() if lo <= v[0] <= hi]
        agg, minutes = summarize(recs)
        print(f'{name} {lo} 〜 {hi}: {len(recs)} メッセージ、{minutes:.1f} 分')
        for model, c in agg.items():
            print('  ', model, dict(c))
            grand.update(c)
        gmin += minutes
    print(f'合計: {gmin:.1f} 分', dict(grand))


if __name__ == '__main__':
    main(sys.argv[1:])
