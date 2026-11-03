// docs/test-cases/viewer.md §5.3 の補足 (#64 の監視役の申し送り): 問題のどの場所も、10 画面のどこかの要素を強調できる。
// path の場所は、同じ path か祖先・子孫の path を持つセルが 10 画面のどこかにある。itemKey の場所は、同じ項目キーの行の名前 (グラフの題・軸の見出しを含む) がある。
import { describe, expect, it } from 'vitest';
import { LABELS } from '../../domain/labels';
import { cellLookup } from './lookup';
import { buildScreen, SCREEN_ORDER } from './model';
import { placeHitsElement } from './highlight';
import { fullProblem, leaves } from './testing';

const p = fullProblem();
const screens = SCREEN_ORDER.map((r) => buildScreen(p, r.doc, r.screen));
const nameKeys = new Set(screens.flatMap((s) => [...s.sections.flatMap((x) => x.rows.map((r) => r.itemKey)), ...s.charts.flatMap((c) => [c.itemKey, c.axisItemKey])]));

describe('強調できる場所', () => {
  it('問題の短信・IR のどの葉の場所も、どれかの画面のセルを強調できる', () => {
    const cellPaths = [...cellLookup(p).keys()];
    const unreachable = [...leaves('tanshin', p.tanshin), ...leaves('ir', p.ir)]
      .filter((l) => !cellPaths.some((c) => placeHitsElement({ doc: l.doc, path: l.path }, { path: c })))
      .map((l) => `${l.doc}.${l.path}`);
    expect(unreachable).toEqual([]);
  });

  it('LABELS のどの項目キーの場所も、どれかの画面の行の名前の要素を強調できる', () => {
    const unreachable = Object.keys(LABELS).filter((k) => ![...nameKeys].some((n) => placeHitsElement({ doc: k.startsWith('ir.') ? 'ir' : 'tanshin', itemKey: k }, { itemKey: n })));
    expect(unreachable).toEqual([]);
  });

  it('セルのキーに別の資料の場所は当たらない (doc をまたがない)', () => {
    const cellPaths = [...cellLookup(p).keys()];
    expect(cellPaths.some((c) => placeHitsElement({ doc: 'ir', path: 'summary.netSales.current' }, { path: c }))).toBe(false);
  });
});
