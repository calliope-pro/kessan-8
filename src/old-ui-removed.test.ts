// DX1 (docs/test-cases/domain-v3.md §6): 古い UI は消えている (責任者の決定 2026-11-05。2026-11-09 に v3 でも有効と確認)。
// 画面は #141 が impeccable で作り直す。残すのは、題名と「作り直し中」の仮画面だけ。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = (path: string): boolean => existsSync(`${root}${path}`);

describe('古い UI の撤去 (DX1)', () => {
  it('DX1: 印・検算・画面の参照 (domain)・古い画面 (src/ui)・古い E2E・E2E 用のデモページ・古い画面の CSS が無い', () => {
    const gone = [
      'src/domain/marks.ts', 'src/domain/marks.test.ts', 'src/domain/calc.ts', 'src/domain/calc.test.ts', 'src/domain/screen.ts',
      'src/ui', 'viewer-demo.html', 'src/viewer-demo-build.test.ts',
      'e2e/flow.spec.ts', 'e2e/viewer.spec.ts', 'e2e/viewer-in-app.spec.ts', 'e2e/live.spec.ts', 'e2e/prod.spec.ts', 'e2e/release.spec.ts', 'e2e/support.ts',
      'src/styles/app.css', 'src/styles/stage.css', 'src/styles/motion.css',
    ];
    expect(gone.filter(exists)).toEqual([]);
  });

  it('DX1b: 試作 (src/proto・e2e-proto) と仮画面の E2E (e2e/smoke.spec.ts) は残る', () => {
    for (const path of ['src/proto/main.ts', 'e2e-proto/play.spec.ts', 'e2e/smoke.spec.ts', 'src/main.ts', 'src/styles/base.css']) expect(exists(path), path).toBe(true);
  });
});
