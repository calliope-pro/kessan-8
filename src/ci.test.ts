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

/** ファイル全体の `permissions:` の下の権限の行を、job の中のものも含めてすべて集める。 */
function permissionLines(text: string): string[] {
  const lines = text.split('\n');
  const found: string[] = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)permissions:\s*(.*)$/.exec(line);
    if (!m) return;
    if (m[2]) found.push(`inline:${m[2]}`); // `permissions: write-all` のような 1 行の書き方は、そのまま権限として数える
    const indent = (m[1] ?? '').length;
    for (const next of lines.slice(i + 1)) {
      if (next.trim() === '') continue;
      if (next.length - next.trimStart().length <= indent) break;
      found.push(next.trim());
    }
  });
  return found;
}

const indexOfAll = (text: string, needles: string[]) => needles.map((n) => text.indexOf(n));

describe('.github/workflows/ci.yml', () => {
  it('C1: PR と main への push で動く。pull_request_target は使わない', () => {
    expect(yml).toMatch(/^on:[\s\S]*?^ {2}pull_request:/m);
    expect(yml).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[main\]/m);
    expect(yml).not.toContain('pull_request_target');
  });

  it('C2: 権限は contents: read だけ (job の中の permissions も含め、ファイル全体で)。secrets を参照しない', () => {
    expect(yml).toMatch(/^permissions:/m); // 最上位で明示する
    expect(permissionLines(yml)).toEqual(['contents: read']);
    expect(yml).not.toContain('secrets.');
  });

  it('C3: job check の手順は ci → typecheck → test → verify:data → build → check:size の順', () => {
    const at = indexOfAll(jobs()['check'] ?? '', ['npm ci', 'npm run typecheck', 'npm test', 'npm run verify:data', 'npm run build', 'npm run check:size']);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('C3b: verify:data は --require-complete (全難易度) で回す。数の不足 (問題数・両面の会社・異変の比・系統の偏り) を警告で見逃さない (#26 の追加の受け入れ条件)', () => {
    const line = (jobs()['check'] ?? '').split('\n').find((l) => l.includes('npm run verify:data')) ?? '';
    expect(line).toMatch(/npm run verify:data -- .*--require-complete(\s|$)/);
    expect(line).not.toMatch(/--require-complete=/); // easy だけ・hard だけにしない (両方)
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

  it('C7: uses はすべて版の参照を持つ (@main・@master・版なしは使わない。メジャー版の中の更新は受け入れる: 権限が読み取りだけで秘密が無いため)', () => {
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
