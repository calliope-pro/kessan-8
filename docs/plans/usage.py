"""組のセッションの記録 (~/.claude/projects/<ワークツリーに対応するディレクトリ>/*.jsonl) から、
assistant メッセージの usage を、メッセージ ID ごとに 1 回だけ合計する (標準ライブラリのみ)。
estimate.py の MEASURED (AI の利用枠の実測値) の再現用。個人情報・秘密は出力しない (セッションは先頭 8 文字だけ)。

使いかた: python3 docs/plans/usage.py <記録のディレクトリ> [カットオフ (UTC。例 2026-11-03T13:18:00Z)]
例: python3 docs/plans/usage.py ~/.claude/projects/-Users-<ユーザー>-orca-workspaces-kessan-8-biz-plan 2026-11-03T13:18:00Z
"""
import collections
import glob
import json
import os
import sys

KEYS = ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')


def main(directory, cutoff=None):
    for f in sorted(glob.glob(os.path.join(os.path.expanduser(directory), '*.jsonl'))):
        seen = {}
        for line in open(f, encoding='utf-8'):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            m = r.get('message') or {}
            ts = r.get('timestamp')
            if r.get('type') != 'assistant' or not isinstance(m, dict) or not m.get('usage') or not ts:
                continue
            if cutoff and ts > cutoff:
                continue
            seen[m.get('id') or r.get('uuid')] = (ts, m.get('model'), m['usage'])
        if not seen:
            continue
        agg = collections.defaultdict(collections.Counter)
        for ts, model, u in seen.values():
            for k in KEYS:
                agg[model][k] += u.get(k, 0) or 0
        tss = sorted(ts for ts, _, _ in seen.values())
        print(os.path.basename(f)[:8], tss[0], tss[-1], len(seen), 'メッセージ')
        for model, c in agg.items():
            print('  ', model, dict(c))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
