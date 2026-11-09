// ケース表 docs/test-cases/screens-v3.md の U4 (画面に出す言葉の全部)。
import { describe, expect, it } from 'vitest';
import { flattenMessages, MESSAGES } from './messages';

const FORBIDDEN = ['印', 'バグ', 'エラー', '採点', '検算', '閲覧票', '失敗', 'ラウンド', 'ステージ'];
// 原作の固有の語 (要件 受け入れ条件 8)
const ORIGINAL = ['8番出口', '８番出口', '出口', '通路', '引き返'];

describe('U4 画面に出す言葉', () => {
  const all = flattenMessages(MESSAGES);
  it('言葉がある (空でない)', () => {
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((m) => m.length > 0)).toBe(true);
  });
  it('禁じる語・原作の固有の語を含まない', () => {
    for (const m of all) {
      for (const w of [...FORBIDDEN, ...ORIGINAL]) expect(m, `「${m}」に「${w}」`).not.toContain(w);
    }
  });
  it('札と題名は決まった言葉', () => {
    expect(MESSAGES.seal.normal).toBe('いつも通り');
    expect(MESSAGES.seal.anomaly).toBe('異変あり');
    expect(MESSAGES.title).toBe('８期連続');
  });
});
