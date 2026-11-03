// UT1 (docs/test-cases/flow.md §1.6)
import { describe, expect, it } from 'vitest';
import { MORNING_LABEL, STAGE_COUNT, timeLabel } from './stage';

describe('舞台の時刻 (V2)', () => {
  it('UT1: 1〜8 社目の時刻は 18:00 から 1 時間ずつ。8 社目は翌 1:00', () => {
    expect(Array.from({ length: 8 }, (_, round) => timeLabel(round))).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '翌 0:00', '翌 1:00']);
    expect(STAGE_COUNT).toBe(8);
  });

  it('クリアの朝は 6:00', () => {
    expect(MORNING_LABEL).toBe('翌朝 6:00');
  });
});
