# -*- coding: utf-8 -*-
"""やさしいの設計表 v3 (Sub-task #167) の元データ spec-v3.json を作る。標準ライブラリのみ。決定的 (同じ入力から同じ出力)。
使いかた: python3 docs/plans/problems-easy/make-spec-v3.py [--out docs/plans/problems-easy/spec-v3.json] [--table]
  --table: docs/plans/problems-easy-v3.md の §3 の一覧 (Markdown の表) を標準出力に書く。

何を決めるか: 10 社 × (正常 1 問 + 異変 7〜8 問 = 85 問)。異変は 15 種類 × 5 問 × 5 社。
  どの会社に どの種類を置くかを、検証器のデータ検査 (src/verifier/dataset.ts cardChecks) を満たすように解く:
  - 種類ごとに 5 問・5 社 (card-kind-count・card-kind-companies)
  - 段ごとに、会社どうしの異変の問題の数の差が 1 問以内 (card-tier-balance。0 問の会社も数える)
  - E-02 の増益の基は 10 × 営業利益 ≤ 0.8 × 売上高 (営業利益率 8% 以下) のものだけ (設計 v3 §2.2)
根拠: docs/design-v3.md §1.5・§2.2・§2.7・§3.2 #139。
"""
import argparse
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

# 台帳 v3 のやさしい 15 種類 (設計 §2.2)。(id, 段, 系統, 名前)
KINDS = [
    ('E-17', 1, 'text', '見出し語と数字の向きが逆'),
    ('E-02', 1, 'calculation', '桁がずれた数字'),
    ('E-24', 1, 'calculation', '売上高が営業利益より小さい'),
    ('E-03', 1, 'appearance', '単位の語が 1 つだけ違う'),
    ('E-05', 1, 'appearance', '科目名の誤字'),
    ('E-22', 1, 'appearance', '同じ欄が 2 回出る'),
    ('E-21', 1, 'appearance', '数字のカンマの位置が違う'),
    ('E-25', 1, 'appearance', 'あり得ない符号'),
    ('E-26', 1, 'appearance', '添え字の取り違え'),
    ('E-27', 1, 'appearance', '数字に数字でない字が混じる'),
    ('E-19', 2, 'appearance', '欄が 1 つ足りない'),
    ('E-23', 2, 'appearance', '見出し語が別の型の語'),
    ('E-28', 2, 'appearance', '期末日が存在しない日付'),
    ('E-12', 3, 'calculation', '営業利益率が合わない'),
    ('E-04', 3, 'appearance', '期と期末日が合わない'),
]
TIER = {k: t for k, t, _, _ in KINDS}
NAME = {k: n for k, _, _, n in KINDS}
FAMILY = {k: f for k, _, f, _ in KINDS}
PER_KIND = 5  # config.ts KIND_PROBLEMS.default

# 会社 (正常 1 問ずつ)。op = 営業利益の向き。fy = 決算期の年。om = profiles.py の営業利益率の目安 (E-02 の基の条件の目安。実測は #168 の生成後)。
# c03 は 2024 年 2 月期 (期末 2024-02-29 = 閏日。E-04 の「月末日にそろえる」を実データで通す。設計 §2.5)。
# 減益 = c02・c05・c08・c10 の 4 社 (R-S5 (f) は 3 社以上。c10 の売上高が 6 桁なので、減益にして営業利益を小さく保つ意味もある)。
COMPANIES = [
    dict(company='c01', fy=2025, month=3, op='up', om=0.090),
    dict(company='c02', fy=2025, month=3, op='down', om=0.042),
    dict(company='c03', fy=2024, month=2, op='up', om=0.036),
    dict(company='c04', fy=2025, month=9, op='up', om=0.140),
    dict(company='c05', fy=2025, month=12, op='down', om=0.110),
    dict(company='c06', fy=2025, month=3, op='up', om=0.050),
    dict(company='c07', fy=2025, month=6, op='up', om=0.026),
    dict(company='c08', fy=2025, month=12, op='down', om=0.170),
    dict(company='c09', fy=2025, month=3, op='up', om=0.080),
    dict(company='c10', fy=2025, month=3, op='down', om=0.018),
]
IDS = [c['company'] for c in COMPANIES]
BY = {c['company']: c for c in COMPANIES}

# E-02 を置ける会社: 増益なら営業利益率 8% 以下 (10 倍にした営業利益が売上高の 0.8 倍以下)、減益なら誰でも (1/10)。c09 は 8.0% で境目なので外す。
# 5 社に固定する: 増益の基 3 社 (c03・c06・c07。営業利益率の目安 2.6〜5.0%) と減益の基 2 社 (c02・c10)。桁が増える見え方と減る見え方の両方を使う。
E02_OK = ['c02', 'c03', 'c06', 'c07', 'c10']
for _c in E02_OK:
    assert BY[_c]['op'] == 'down' or BY[_c]['om'] <= 0.06, _c
# 営業利益 (前期・当期) の整数部が必ず 4 桁以上の会社 (E-21 no-comma を営業利益の欄に当てられる。c02 は約 900、c09 は約 600 で 3 桁)
OP4 = ['c01', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c10']
# 売上高が必ず 5 桁以上の会社 (E-21 comma-shift を売上高の欄に当てられる。c09 は約 8,000 で 4 桁)
SALES5 = [c for c in IDS if c != 'c09']


def solve(seed=0):
    """会社 × 種類の割り振り。段 1 = 全社 5 問ずつ、段 2 = 5 社が 2 問・5 社が 1 問、段 3 = 全社 1 問。"""
    rng = random.Random(f'kessan-easy-v3-{seed}')
    tier1 = [k for k, t, _, _ in KINDS if t == 1]
    tier2 = [k for k, t, _, _ in KINDS if t == 2]
    # 段 3: E-04 は c03 (閏日) を含む 5 社、E-12 はその残り
    others = [c for c in IDS if c != 'c03']
    rng.shuffle(others)
    e04 = ['c03'] + others[:4]
    e12 = [c for c in IDS if c not in e04]
    assign = {'E-04': e04, 'E-12': e12}
    # 段 2: 15 件を 10 社に (5 社が 2 件・5 社が 1 件)。同じ会社に同じ種類は 1 つ
    while True:
        double = rng.sample(IDS, 5)
        need = {c: (2 if c in double else 1) for c in IDS}
        got = {k: [] for k in tier2}
        ok = True
        for c in sorted(IDS, key=lambda c: -need[c]):
            avail = [k for k in tier2 if len(got[k]) < PER_KIND and c not in got[k]]
            # 残りの枠が多い種類を優先 (行き詰まりを避ける)
            avail.sort(key=lambda k: (len(got[k]), rng.random()))
            if len(avail) < need[c]:
                ok = False
                break
            for k in avail[: need[c]]:
                got[k].append(c)
        if ok and all(len(v) == PER_KIND for v in got.values()):
            assign.update(got)
            break
    # 段 1: 10 種類 × 5 社。各社ちょうど 5 種類。E-02 は E02_OK の 5 社に固定
    assert len(E02_OK) == PER_KIND, E02_OK
    assign['E-02'] = list(E02_OK)
    rest = [k for k in tier1 if k != 'E-02']
    load = {c: (1 if c in E02_OK else 0) for c in IDS}
    while True:
        load2 = dict(load)
        got = {k: [] for k in rest}
        order = list(rest)
        ok = True
        for k in order:
            # 残りの枠 (5 − load) が大きい会社から PER_KIND 社を選ぶ
            cand = [c for c in IDS if load2[c] < 5]
            rng.shuffle(cand)
            cand.sort(key=lambda c: load2[c])
            pick = cand[:PER_KIND]
            if len(pick) < PER_KIND:
                ok = False
                break
            for c in pick:
                load2[c] += 1
            got[k] = pick
        if ok and all(v == 5 for v in load2.values()):
            assign.update(got)
            break
    return assign


def edit_for(kind, company, nth):
    """種類と会社から、変える中身 (edit) を決める。nth = その種類の何問目か (0 始まり。欄の割り振りを散らす)。"""
    c = BY[company]
    up = c['op'] == 'up'
    if kind == 'E-17':
        return dict(op='claim', metric='operatingIncome', to='down' if up else 'up')
    if kind == 'E-02':
        return dict(op='scale', cell='tanshin.incomeStatement.current.operatingIncome', factor=10 if up else 0.1)
    if kind == 'E-24':
        return dict(op='scale-sales', cell='tanshin.incomeStatement.current.netSales', of='operatingIncome', ratio=0.6 if nth % 2 == 0 else 0.5)
    if kind == 'E-03':
        return dict(op='unit', slot=['sales', 'opPrev', 'opCurr'][nth % 3], unit='億円')
    if kind == 'E-05':
        # 営業利益は 2 欄 (前期・当期) に出る。itemKey が同じ 2 欄とも変わる
        pick = [('sales', 'tanshin.incomeStatement.netSales', '売上商'), ('op', 'tanshin.incomeStatement.operatingIncome', '営業和益'),
                ('margin', 'tanshin.summary.operatingMargin', '売上高営業利益卒'), ('sales', 'tanshin.incomeStatement.netSales', '売上局'),
                ('op', 'tanshin.incomeStatement.operatingIncome', '営業判益')][nth % 5]
        return dict(op='label', target=pick[0], itemKey=pick[1], word=pick[2])
    if kind == 'E-19':
        return dict(op='drop', slot=['margin', 'opCurr', 'sales', 'opPrev'][nth % 4])
    if kind == 'E-22':
        return dict(op='dup', slot=['opCurr', 'headline', 'sales', 'margin', 'opPrev'][nth % 5])
    if kind == 'E-21':
        # 5 問のうち 3 つが no-comma・2 つが comma-shift (売上高だけ)。営業利益の欄に当てるのは整数部が 4 桁以上の会社だけ
        style = 'comma-shift' if nth % 5 in (1, 3) else 'no-comma'
        if style == 'comma-shift' and company not in SALES5:
            style = 'no-comma'
        if style == 'comma-shift':
            return dict(op='format', slot='sales', style=style)
        slot_pool = ['sales'] + (['opCurr', 'opPrev'] if company in OP4 else [])
        return dict(op='format', slot=slot_pool[nth % len(slot_pool)], style=style)
    if kind == 'E-25':
        return dict(op='sign', slot='sales')
    if kind == 'E-26':
        slot = 'opPrev' if nth % 2 == 0 else 'opCurr'
        return dict(op='suffix', slot=slot, word='当期' if slot == 'opPrev' else '前期')
    if kind == 'E-27':
        return dict(op='glyph', slot=['sales', 'opCurr', 'opPrev', 'sales', 'opCurr'][nth % 5], digit=['first', 'last', 'middle', 'last', 'first'][nth % 5])
    if kind == 'E-23':
        return dict(op='headline', word='増収' if up else '減収')
    if kind == 'E-28':
        return dict(op='day', slot='period', day=32)
    if kind == 'E-12':
        return dict(op='scale-margin', factor=2.2 if nth % 2 == 0 else 0.4)
    if kind == 'E-04':
        # 期末日 (columnDates.incomeStatement.current) の年を 1 年ずらし、ずらした年のその月の末日にする。閏日 (c03) は +1 年 (2024-02-29 → 2025-02-28)
        return dict(op='shift-year', cell='tanshin.columnDates.incomeStatement.current', years=1 if company == 'c03' or nth % 2 == 0 else -1)
    raise KeyError(kind)


def build(seed=0):
    assign = solve(seed)
    per_company = {c: [] for c in IDS}
    for k, cs in assign.items():
        for nth, c in enumerate(cs):
            per_company[c].append((k, nth))
    problems, n = [], 0
    for c in COMPANIES:
        cid = c['company']
        n += 1
        base_id = f'easy-{n:03d}'
        problems.append(dict(id=base_id, company=cid, fiscalYear=c['fy'], month=c['month'], kind=None, tier=None, op=c['op'], omTarget=c['om']))
        for k, nth in sorted(per_company[cid], key=lambda kn: (TIER[kn[0]], [x[0] for x in KINDS].index(kn[0]))):
            n += 1
            problems.append(dict(id=f'easy-{n:03d}', company=cid, fiscalYear=c['fy'], month=c['month'], kind=k, tier=TIER[k], base=base_id, edit=edit_for(k, cid, nth)))
    return dict(version=3, note='docs/plans/problems-easy-v3.md の元データ。make-spec-v3.py が作る (手で直さない)', sample=dict(company='c09', fiscalYear=2023), problems=problems)


def table(spec, names):
    out = ['| id | 会社 | 期 | 見出し語 | 段 | 種別 | 異変の種類 | 変えるもの (edit) |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for p in spec['problems']:
        c = BY[p['company']]
        word = '増益' if c['op'] == 'up' else '減益'
        label = f"{p['company']} {names[p['company']]}"
        period = f"{p['fiscalYear']}年{c['month']}月期"
        if p['kind'] is None:
            out.append(f"| {p['id']} | {label} | {period} | {word} | ― | 正常 | ― | 基 |")
        else:
            e = ', '.join(f'{k}={v}' for k, v in p['edit'].items())
            out.append(f"| {p['id']} | {label} | {period} | {word} | {p['tier']} | 異変あり | {p['kind']} {NAME[p['kind']]} | `{e}` |")
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, 'spec-v3.json'))
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--table', action='store_true')
    args = ap.parse_args()
    spec = build(args.seed)
    if args.table:
        companies = {c['id']: c['name'].replace('株式会社', '') for c in json.load(open(os.path.join(ROOT, 'src/data/companies.json'), encoding='utf-8'))}
        print(table(spec, companies))
        return
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f"{len(spec['problems'])} 問 (正常 {sum(1 for p in spec['problems'] if p['kind'] is None)}) を {args.out} に書いた")


if __name__ == '__main__':
    main()
