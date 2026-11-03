// 異変の場所がある画面 screenOfPlace (Task #57 の包括レビュー B1)。「どの場所がどの画面に出るか」を知っているのはビューアの buildScreen だけ。
// 本物の問題 (src/data/problems) の全部の場所で、選んだ画面に強調される要素が 1 つ以上あることを確かめる。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LABELS } from '../../domain/labels';
import type { AnomalyPlace, Problem } from '../../domain/types';
import { screenCells, screenNameKeys } from './elements';
import { placeHitsElement } from './highlight';
import { buildScreen } from './model';
import { screenOfPlace } from './screen-of';
import { fullProblem, leaves, normalProblem } from './testing';

/** その画面で、place が強調する要素の数。 */
function hitsOn(p: Problem, place: AnomalyPlace, ref: { doc: 'tanshin' | 'ir'; screen: string }): number {
  const s = buildScreen(p, ref.doc, ref.screen);
  return screenCells(s).filter((c) => placeHitsElement(place, { path: c.path })).length + screenNameKeys(s).filter((k) => placeHitsElement(place, { itemKey: k })).length;
}

describe('screenOfPlace: 場所の種類ごと', () => {
  const p = fullProblem();
  const at = (place: AnomalyPlace, problem: Problem = p) => screenOfPlace(problem, place);
  const t = (path: string): AnomalyPlace => ({ doc: 'tanshin', path });
  const i = (path: string): AnomalyPlace => ({ doc: 'ir', path });

  it('S1: 先頭が画面の ID の path は、その画面', () => {
    expect(at(t('incomeStatement.current.ordinaryIncome'))).toEqual({ doc: 'tanshin', screen: 'incomeStatement' });
    expect(at(t('notes.segments.previous.segments.0.name'))).toEqual({ doc: 'tanshin', screen: 'notes' });
    expect(at(i('segments.items.0.netSales.current'))).toEqual({ doc: 'ir', screen: 'segments' });
    expect(at(i('results.chart.netSales.axisMin'))).toEqual({ doc: 'ir', screen: 'results' });
  });

  it('S2: 列見出しの日付 columnDates.<画面>.* は、その画面 (貸借・損益・CF の見出し)', () => {
    expect(at(t('columnDates.balanceSheet.current'))).toEqual({ doc: 'tanshin', screen: 'balanceSheet' });
    expect(at(t('columnDates.incomeStatement.previous'))).toEqual({ doc: 'tanshin', screen: 'incomeStatement' });
    expect(at(t('columnDates.cashFlow.previous'))).toEqual({ doc: 'tanshin', screen: 'cashFlow' });
    expect(at(t('columnDates.cashFlow.current'))).toEqual({ doc: 'tanshin', screen: 'cashFlow' });
  });

  it('S3: 日付 dates.* は、サマリー (path でも項目キーでも)', () => {
    expect(at(t('dates.disclosure'))).toEqual({ doc: 'tanshin', screen: 'summary' });
    expect(at({ doc: 'tanshin', itemKey: 'tanshin.dates.periodEnd' })).toEqual({ doc: 'tanshin', screen: 'summary' });
  });

  it('S4: IR の文章 statements.<i> は、その文が出るスライド (statements[i].slide)', () => {
    expect(at(i('statements.0.text'))).toEqual({ doc: 'ir', screen: 'highlights' });
    expect(at(i('statements.1'))).toEqual({ doc: 'ir', screen: 'outlook' });
    expect(at(i('statements.2.claims.0.direction'))).toEqual({ doc: 'ir', screen: 'supplement' });
    const q = fullProblem();
    q.ir.statements[0]!.slide = 'results';
    expect(at(i('statements.0.text'), q)).toEqual({ doc: 'ir', screen: 'results' });
  });

  it('S5: 見出しの場所は、その資料の 1 画面目', () => {
    expect(at(t('header.companyName'))).toEqual({ doc: 'tanshin', screen: 'summary' });
    expect(at(i('header.periodLabel'))).toEqual({ doc: 'ir', screen: 'highlights' });
    expect(at(i('header.unit'))).toEqual({ doc: 'ir', screen: 'highlights' });
  });

  it('S6: 画面ごとの単位の場所 <画面>.unit は、unitOverrides のある画面', () => {
    const q = fullProblem();
    q.unitOverrides = { 'tanshin.balanceSheet': '千円', 'ir.results': '千円' };
    expect(at(t('balanceSheet.unit'), q)).toEqual({ doc: 'tanshin', screen: 'balanceSheet' });
    expect(at(i('results.unit'), q)).toEqual({ doc: 'ir', screen: 'results' });
  });

  it('S7: 項目キーの場所は、その行の名前の画面 (グラフの題・軸の下端・前期比の行を含む)', () => {
    expect(at({ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.cash' })).toEqual({ doc: 'tanshin', screen: 'balanceSheet' });
    expect(at({ doc: 'ir', itemKey: 'ir.outlook.netSalesChangeRate' })).toEqual({ doc: 'ir', screen: 'outlook' });
    expect(at({ doc: 'ir', itemKey: 'ir.results.chart.netSales.axisMin' })).toEqual({ doc: 'ir', screen: 'results' });
    expect(at({ doc: 'tanshin', itemKey: 'tanshin.summary.auditNote' })).toEqual({ doc: 'tanshin', screen: 'summary' });
  });

  it('S8: path の途中の場所 (祖先) は、子孫のセルがある画面', () => {
    expect(at(i('segments.items'))).toEqual({ doc: 'ir', screen: 'segments' });
    expect(at(t('balanceSheet.current'))).toEqual({ doc: 'tanshin', screen: 'balanceSheet' });
  });

  it('S9: どの画面にも当たらない場所は、その資料の 1 画面目 (落ちない)', () => {
    expect(at(t('nothing.here'))).toEqual({ doc: 'tanshin', screen: 'summary' });
    expect(at({ doc: 'ir', itemKey: 'ir.nothing.here' })).toEqual({ doc: 'ir', screen: 'highlights' });
  });

  it('S10: 同じ場所が複数の画面に当たるときは、通し順で最初の画面 (資料の違う画面にまたがらない)', () => {
    // 見出しは全画面にあるが 1 画面目。短信の場所は IR の画面を返さない
    expect(at(t('header.securitiesCode')).doc).toBe('tanshin');
  });
});

describe('screenOfPlace: 全部の場所で、選んだ画面に強調される要素がある', () => {
  it('S11: 全部入りの問題のすべての葉の path (短信・IR)', () => {
    const p = fullProblem();
    const bad = [...leaves('tanshin', p.tanshin), ...leaves('ir', p.ir)]
      .filter((l) => hitsOn(p, { doc: l.doc, path: l.path }, screenOfPlace(p, { doc: l.doc, path: l.path })) === 0)
      .map((l) => `${l.doc}.${l.path}`);
    expect(bad).toEqual([]);
  });

  it('S12: LABELS のすべての項目キー', () => {
    const p = fullProblem();
    const bad = Object.keys(LABELS).filter((k) => {
      const place: AnomalyPlace = { doc: k.startsWith('ir.') ? 'ir' : 'tanshin', itemKey: k };
      return hitsOn(p, place, screenOfPlace(p, place)) === 0;
    });
    expect(bad).toEqual([]);
  });

  it('S13: 基準問題 (百万円・2 セグメント) の葉も同じ', () => {
    const p = normalProblem();
    const bad = [...leaves('tanshin', p.tanshin), ...leaves('ir', p.ir)].filter((l) => hitsOn(p, { doc: l.doc, path: l.path }, screenOfPlace(p, { doc: l.doc, path: l.path })) === 0);
    expect(bad).toEqual([]);
  });

  const dir = 'src/data/problems';
  const files = existsSync(dir) ? ['easy', 'hard'].flatMap((d) => (existsSync(join(dir, d)) ? readdirSync(join(dir, d)).map((f) => join(dir, d, f)) : [])).filter((f) => f.endsWith('.json')) : [];

  it('S14: 本物の問題 (src/data/problems) の異変の全部の場所。問題が無い・場所が 0 か所なら失敗', () => {
    const bad: string[] = [];
    let places = 0;
    for (const f of files) {
      const p = JSON.parse(readFileSync(f, 'utf-8')) as Problem;
      for (const place of p.anomaly?.places ?? []) {
        places++;
        if (hitsOn(p, place, screenOfPlace(p, place)) === 0) bad.push(`${f}: ${JSON.stringify(place)}`);
      }
    }
    expect(bad).toEqual([]);
    // 問題の置き場が無い・0 か所のまま通り続けない (置き場の名前が変わったとき、つなぎ目が見えなくなるため。N12)
    expect(existsSync(dir)).toBe(true);
    expect(places).toBeGreaterThan(0);
  });
});
