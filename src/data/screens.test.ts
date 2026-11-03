// UA12 (docs/test-cases/release.md §2): 本物の問題すべてで、異変の場所の画面が決まり、画面の外にある値 (statements・columnDates) も正しい画面になる
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { screenOf } from '../domain/answer';
import { IR_SLIDES, TANSHIN_SCREENS } from '../domain/types';
import type { Problem } from '../domain/types';

const problems: Problem[] = ['easy', 'hard'].flatMap((d) =>
  readdirSync(`src/data/problems/${d}`).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`src/data/problems/${d}/${f}`, 'utf-8')) as Problem),
);

describe('本物の問題の異変の場所の画面', () => {
  it('UA12: すべての場所が、その資料の 10 画面のどれかに決まる', () => {
    expect(problems.length).toBeGreaterThanOrEqual(25);
    for (const p of problems.filter((x) => x.anomaly)) {
      for (const place of p.anomaly!.places) {
        const ref = screenOf(place, p);
        expect(ref.doc, p.id).toBe(place.doc);
        const screens: readonly string[] = ref.doc === 'tanshin' ? TANSHIN_SCREENS : IR_SLIDES;
        expect(screens, `${p.id} ${JSON.stringify(place)}`).toContain(ref.screen);
      }
    }
  });

  it('UA12: statements.N の場所は、その文章の slide の画面。columnDates.<画面> はその画面', () => {
    let seen = 0;
    for (const p of problems.filter((x) => x.anomaly)) {
      for (const place of p.anomaly!.places) {
        if (!('path' in place)) continue;
        const parts = place.path.split('.');
        if (place.doc === 'ir' && parts[0] === 'statements') {
          expect(screenOf(place, p).screen, p.id).toBe(p.ir.statements[Number(parts[1])]!.slide);
          seen++;
        }
        if (parts[0] === 'columnDates') {
          expect(screenOf(place, p).screen, p.id).toBe(parts[1]);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  });
});
