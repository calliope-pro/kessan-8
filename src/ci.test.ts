// C1〜C9 (docs/test-cases/ci.md): GitHub Actions の設定の約束。ワークフローのテキストを外から読んで確かめる。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const yml = readFileSync(`${root}.github/workflows/ci.yml`, 'utf-8');
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf-8'));

/** `jobs:` 直下の job 名ごとに、その job のテキストを返す。 */
function jobs(): Record<string, string> {
  const body = yml.split(/^jobs:\s*$/m)[1] ?? '';
  const result: Record<string, string> = {};
  const re = /^ {2}([\w-]+):\s*$/gm;
  const heads = [...body.matchAll(re)];
  heads.forEach((m, i) => {
    result[m[1] ?? ''] = body.slice(m.index, heads[i + 1]?.index ?? body.length);
  });
  return result;
}

const indexOfAll = (text: string, needles: string[]) => needles.map((n) => text.indexOf(n));

describe('.github/workflows/ci.yml', () => {
  it('C1: PR と main への push で動く。pull_request_target は使わない', () => {
    expect(yml).toMatch(/^on:[\s\S]*?^ {2}pull_request:/m);
    expect(yml).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[main\]/m);
    expect(yml).not.toContain('pull_request_target');
  });

  it('C2: 権限は contents: read だけ。secrets を参照しない', () => {
    expect(yml).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(yml).not.toContain('secrets.');
  });

  it('C3: job check の手順は ci → typecheck → test → build → check:size の順', () => {
    const at = indexOfAll(jobs()['check'] ?? '', ['npm ci', 'npm run typecheck', 'npm test', 'npm run build', 'npm run check:size']);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('C4: Node 22 と npm のキャッシュ (engines と整合)', () => {
    expect(yml).toContain('actions/setup-node@');
    expect(yml).toMatch(/node-version: 22\b/);
    expect(yml).toMatch(/cache: npm/);
    expect(pkg.engines.node).toBe('>=22.12');
  });

  it('C5: e2e は別の job で、ブラウザを入れてから E2E を回す', () => {
    const e2e = jobs()['e2e'] ?? '';
    expect(e2e).not.toBe('');
    const at = indexOfAll(e2e, ['npx playwright install --with-deps chromium', 'npm run test:e2e']);
    expect(at[0]).toBeGreaterThanOrEqual(0);
    expect(at[1]).toBeGreaterThan(at[0] ?? 0);
  });

  it('C6: e2e が失敗したら playwright-report を上げる', () => {
    const e2e = jobs()['e2e'] ?? '';
    expect(e2e).toMatch(/if: (failure\(\)|\$\{\{ !cancelled\(\) \}\})/);
    expect(e2e).toContain('actions/upload-artifact@');
    expect(e2e).toContain('playwright-report');
  });

  it('C7: uses はすべて版を固定している', () => {
    const uses = [...yml.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/);
  });

  it('C8: 各 job に timeout-minutes、全体に concurrency (cancel-in-progress)', () => {
    for (const [name, text] of Object.entries(jobs())) expect(text, name).toMatch(/timeout-minutes: \d+/);
    expect(yml).toMatch(/^concurrency:/m);
    expect(yml).toContain('cancel-in-progress: true');
  });

  it('C9: 使う npm スクリプトがすべて package.json にある', () => {
    const used = [...yml.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1] ?? '');
    expect(used.length).toBeGreaterThan(0);
    for (const s of used) expect(pkg.scripts, s).toHaveProperty(s);
  });
});
