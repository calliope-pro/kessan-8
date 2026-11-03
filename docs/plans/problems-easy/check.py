# -*- coding: utf-8 -*-
"""検証器が見ない約束の確認 (docs/test-cases/problems-easy.md §2 の C1〜C6)。標準ライブラリのみ。
使いかた (--base が無いときは、異変の問題を C1 の連続の確認から外す。異変の問題は土台と違う数字を持つため): python3 docs/plans/problems-easy/check.py [--pool src/data/problems/easy] [--base <異変の問題の土台のディレクトリ>] [--sample src/data/samples/sample.json]
"""
import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from profiles import PROFILES  # noqa: E402

TODAY = '2026-11-04'
NONE_TEXT = '該当事項はありません。'


def load(dirpath):
    return [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(dirpath, '*.json')))] if dirpath else []


def detected(p):
    """問題から、疑わしく見える要素を読み取る。"""
    t, i = p['tanshin'], p['ir']
    s, cf, ic = t['summary'], t['cashFlow'], t['incomeStatement']['current']
    out = set()
    if cf['depreciation'] and -cf['capex'] / cf['depreciation'] >= 2:
        out.add('capex-large')
    if ic['extraordinaryLoss'] > 0:
        out.add('extraordinary-loss')
    if ic['extraordinaryGain'] > 0:
        out.add('extraordinary-gain')
    if s['annualDividend'] == 0:
        out.add('no-dividend')
    elif s['annualDividend'] < s['annualDividendPrevious']:
        out.add('dividend-cut')
    if s['accountingPolicyChange']:
        out.add('policy-change')
    if i['outlook']['subsequentEvent'] is not None:
        out.add('subsequent-event')
    if abs(s['netIncomeParent']['changeRate']) >= 30:
        out.add('big-change')
    if min(x['profit'] for x in t['notes']['segments']['current']['segments']) < 0:
        out.add('segment-loss')
    return out


def tier_of(n):
    return 1 if n == 0 else 2 if n <= 2 else 3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pool', default='src/data/problems/easy')
    ap.add_argument('--base', default=None)
    ap.add_argument('--sample', default='src/data/samples/sample.json')
    a = ap.parse_args()
    spec = json.load(open(os.path.join(HERE, 'spec.json'), encoding='utf-8'))
    by_id = {p['id']: p for p in spec['problems']}
    pool = load(a.pool)
    base = load(a.base)
    sample = json.load(open(a.sample, encoding='utf-8'))['problem'] if a.sample and os.path.exists(a.sample) else None
    # --base が無いときは、異変の問題 (土台と違う数字を持つ) を C1 の連続の確認から外す。--base があれば土台が代わりに入る
    chain_pool = pool if base else [q for q in pool if by_id.get(q['id'], {}).get('kind') is None]
    allp = chain_pool + base + ([sample] if sample else [])
    errors = []

    # C1: 同じ会社の期は続いている
    by_co = {}
    for p in allp:
        by_co.setdefault(p['companyId'], {})[p['fiscalYear']] = p
    for cid, years in by_co.items():
        for y in sorted(years):
            if y + 1 in years:
                a1, b1 = years[y]['tanshin'], years[y + 1]['tanshin']
                if a1['balanceSheet']['current'] != b1['balanceSheet']['previous'] or a1['incomeStatement']['current'] != b1['incomeStatement']['previous']:
                    errors.append(f'C1 {cid} {y}→{y + 1}: 前の期の当期と次の期の前期が違う')
                if a1['summary']['annualDividend'] != b1['summary']['annualDividendPrevious']:
                    errors.append(f'C1 {cid} {y}→{y + 1}: 前期の年間配当金が違う')

    for p in pool + base + ([sample] if sample else []):
        pid = p['id']
        # C2: 発表日が過去
        if p['tanshin']['dates']['disclosure'] >= TODAY:
            errors.append(f'C2 {pid}: 発表日 {p["tanshin"]["dates"]["disclosure"]} が {TODAY} 以降')
        # C5: 上書きが無い・非支配株主持分が 0
        for k in ('labelOverrides', 'unitOverrides', 'signOverrides'):
            if k in p:
                errors.append(f'C5 {pid}: 正常な問題に {k} がある')
        for q in ('previous', 'current'):
            if p['tanshin']['balanceSheet'][q]['nonControllingInterests'] != 0:
                errors.append(f'C5 {pid}: 非支配株主持分が 0 でない')
        # C6: 営業赤字・最終赤字なし
        ic = p['tanshin']['incomeStatement']['current']
        if ic['operatingIncome'] <= 0 or ic['netIncomeParent'] <= 0:
            errors.append(f'C6 {pid}: 営業利益か当期純利益が 0 以下')

    # C3・C4: 正常な問題 (プール) の tier と要素
    for p in pool:
        s = by_id.get(p['id'])
        if s is None:
            errors.append(f'C3 {p["id"]}: spec.json に無い')
            continue
        if s['kind'] is not None:
            if p.get('tier') != s['tier']:
                errors.append(f'C3 {p["id"]}: tier {p.get("tier")} が設計表の {s["tier"]} と違う')
            continue
        want = set(s['elements'])
        got = detected(p)
        inherent = {'no-dividend'} if PROFILES[p['companyId']]['payout'] == 0 else set()
        missing = want - got
        extra = got - want - inherent
        if missing:
            errors.append(f'C4 {p["id"]}: 要素が資料に無い {sorted(missing)}')
        if extra:
            errors.append(f'C4 {p["id"]}: 設計表に無い要素が資料にある {sorted(extra)}')
        if p.get('tier') != s['tier'] or tier_of(len(want)) != s['tier']:
            errors.append(f'C3 {p["id"]}: tier {p.get("tier")} と要素の数 {len(want)} が合わない (設計表は {s["tier"]})')
    for e in errors:
        print(e)
    print(f'確認: プール {len(pool)} 問・土台 {len(base)} 問・見本 {1 if sample else 0}。違反 {len(errors)} 件')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
