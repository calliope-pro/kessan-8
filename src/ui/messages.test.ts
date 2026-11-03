// UT5 (docs/test-cases/flow.md §1.6): 固定の文言に「８番出口」の言い回しを使わない
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';

const flatten = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(flatten) : typeof x === 'object' && x !== null ? Object.values(x).flatMap(flatten) : [];

describe('固定の文言', () => {
  it('UT5: 「番出口」を含まない', () => {
    const all = flatten(MESSAGES);
    expect(all.length).toBeGreaterThan(30);
    expect(all.filter((s) => s.includes('番出口') || s.includes('8番') || s.includes('８番'))).toEqual([]);
  });

  it('UT6: 副題は決めた文。「見逃さ」「見逃す」を使わない。説明に舞台 (資料室・閲覧票) がある', () => {
    expect(MESSAGES.subtitle).toBe('決算書と IR の異変を探して、8 社連続で見抜け');
    expect(flatten(MESSAGES).filter((s) => s.includes('見逃さ') || s.includes('見逃す'))).toEqual([]);
    expect(MESSAGES.tagline).toContain('資料室');
    expect(MESSAGES.tagline).toContain('閲覧票');
    expect(MESSAGES.intro.slip).toBe('閲覧票');
  });

  it('ボタンの名前 (docs/test-cases/flow.md §0) がそろっている', () => {
    const b = MESSAGES.button;
    expect([b.start, b.help, b.easy, b.hard, b.sample, b.begin, b.skip, b.close, b.back, b.openDocs, b.judge, b.anomaly, b.normal, b.backToReading, b.next, b.result, b.restartRun, b.again, b.reselect, b.otherDifficulty, b.toTitle]).toEqual([
      'はじめる', '遊びかた', 'やさしい', 'むずかしい', '見本を見る', '始める', '飛ばす', '閉じる', '戻る', '資料を開く', '判定する', '異変あり', '異変なし', '読みに戻る', '次の会社へ', '結果を見る', '最初に戻る', 'もう一度', '難易度を選び直す', '別の難易度', 'タイトルへ',
    ]);
  });
});
