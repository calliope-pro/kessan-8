// DX1 (docs/test-cases/domain-v3.md §6): 古い UI は消えている (責任者の決定 2026-11-05。2026-11-09 に v3 でも有効と確認)。
// 画面は #141 (Sub-task #187) が作り直した。古い画面・ビューア・古い E2E は無いまま。新しい画面は src/ui・src/styles/app.css・e2e/support.ts に、同じ名前で新しく置いた (名前の再利用であって、古い物の復活ではない。#187 で、ここの一覧を直した)。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = (path: string): boolean => existsSync(`${root}${path}`);

describe('古い UI の撤去 (DX1)', () => {
  it('DX1: 印・検算・画面の参照 (domain)・古い画面 (src/ui)・古い E2E・E2E 用のデモページ・古い画面の CSS が無い', () => {
    const gone = [
      'src/domain/marks.ts', 'src/domain/marks.test.ts', 'src/domain/calc.ts', 'src/domain/calc.test.ts', 'src/domain/screen.ts',
      'src/ui/viewer', 'src/ui/screens-play.ts', 'src/ui/screens-entry.ts', 'src/ui/screens-end.ts', 'src/ui/context.ts', 'src/ui/viewer-port.ts', 'src/ui/company-style.ts', 'src/ui/format.ts',
      'viewer-demo.html', 'src/viewer-demo-build.test.ts',
      'e2e/flow.spec.ts', 'e2e/viewer.spec.ts', 'e2e/viewer-in-app.spec.ts', 'e2e/live.spec.ts', 'e2e/prod.spec.ts', 'e2e/release.spec.ts',
      'src/styles/stage.css', 'src/styles/motion.css',
    ];
    expect(gone.filter(exists)).toEqual([]);
  });

  it('DX1b: 試作 (src/proto・e2e-proto) と足場の E2E (e2e/smoke.spec.ts)・新しい画面 (src/ui・src/styles/app.css) は残る', () => {
    for (const path of ['src/proto/main.ts', 'e2e-proto/play.spec.ts', 'e2e/smoke.spec.ts', 'src/main.ts', 'src/ui/app.ts', 'src/styles/app.css']) expect(exists(path), path).toBe(true);
  });
});
