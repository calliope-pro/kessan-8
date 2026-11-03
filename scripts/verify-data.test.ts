// L1〜L9 (docs/test-cases/validator.md §2.9): npm run verify:data と同じコマンドを一時ディレクトリで確かめる。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { AnomalyKind, Company, Problem } from '../src/domain/types.ts';
import { add, anomalyVariant, companyA, completePool, DATA_KINDS, normalVariant, softOnly } from '../src/verifier/test-utils.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function dataDir(opts: { companies?: Company[] | null; kinds?: AnomalyKind[] | null; problems?: Problem[]; raw?: Record<string, string>; samples?: Record<string, unknown> } = {}): string {
  const d = mkdtempSync(`${tmpdir()}/verify-data-`);
  dirs.push(d);
  if (opts.companies !== null) writeFileSync(`${d}/companies.json`, JSON.stringify(opts.companies ?? [{ ...companyA(), id: 'fixture-c01' }]));
  if (opts.kinds !== null) writeFileSync(`${d}/anomaly-kinds.json`, JSON.stringify(opts.kinds ?? DATA_KINDS));
  for (const p of opts.problems ?? [normalVariant('easy-001', 'easy', 'fixture-c01')]) {
    mkdirSync(`${d}/problems/${p.difficulty}`, { recursive: true });
    writeFileSync(`${d}/problems/${p.difficulty}/${p.id}.json`, JSON.stringify(p));
  }
  for (const [name, value] of Object.entries(opts.samples ?? {})) {
    mkdirSync(`${d}/samples`, { recursive: true });
    writeFileSync(`${d}/samples/${name}`, JSON.stringify(value));
  }
  for (const [name, text] of Object.entries(opts.raw ?? {})) {
    mkdirSync(`${d}/problems/easy`, { recursive: true });
    writeFileSync(`${d}/${name}`, text);
  }
  return d;
}

const run = (...args: string[]) => {
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/verify-data.ts', ...args], { cwd: root, encoding: 'utf-8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('npm run verify:data', () => {
  it('L1: 基準問題 1 件 → 終了コード 0。問題の数と、数が足りない警告', () => {
    const r = run('--dir', dataDir());
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 問');
    expect(r.out).toContain('pool-size');
  });

  it('L2: 規則を破る問題 → 終了コード 1。ファイルのパス・規則 ID・場所', () => {
    const p = add(normalVariant('easy-001', 'easy', 'fixture-c01'), 'tanshin.balanceSheet.current.totalAssets', 100);
    const r = run('--dir', dataDir({ problems: [p] }));
    expect(r.code).toBe(1);
    expect(r.out).toContain('easy-001.json');
    expect(r.out).toContain('bs-total-assets');
    expect(r.out).toContain('tanshin.balanceSheet.current.totalAssets');
  });

  it('L3: 数が足りないだけ → 既定は 0、--require-complete で 1', () => {
    const d = dataDir();
    expect(run('--dir', d).code).toBe(0);
    expect(run('--dir', d, '--require-complete').code).toBe(1);
  });

  it('L4: soft だけ → 既定は 0、--fail-on-soft で 1', () => {
    const d = dataDir({ problems: [softOnly('easy-001')] });
    const a = run('--dir', d);
    expect(a.code).toBe(0);
    expect(a.out).toContain('soft-payout-cross-path');
    expect(run('--dir', d, '--fail-on-soft').code).toBe(1);
  });

  it('L5: JSON として壊れたファイル → 1。パスを出し、他のファイルの検証は続ける', () => {
    const d = dataDir({ raw: { 'problems/easy/broken.json': '{ not json' } });
    const r = run('--dir', d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('broken.json');
    expect(r.out).toContain('1 問'); // 壊れていない基準問題は数えた
  });

  it('L6: --dir を明示して、そのディレクトリが無い → 1。読めません', () => {
    const r = run('--dir', `${tmpdir()}/verify-data-none-${Date.now()}`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('読めません');
  });

  it('L7: --dir なし (既定の src/data) で、ファイルが無い今の状態 → 0 件として 0。数が足りない警告', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain('pool-size');
  });

  it('L8: anomaly-kinds.json だけ無く、異変の問題がある → unknown-kind で 1', () => {
    const d = dataDir({ kinds: null, problems: [anomalyVariant('easy-001', 'easy', 'fixture-c01')] });
    const r = run('--dir', d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('unknown-kind');
  });

  it('L9: 型を消すだけでは動かない書き方を持ち込まない (tsconfig の約束)', () => {
    const ts = readFileSync(`${root}tsconfig.json`, 'utf-8');
    expect(ts).toMatch(/"erasableSyntaxOnly":\s*true/);
    expect(ts).toMatch(/"verbatimModuleSyntax":\s*true/);
    expect(ts).toMatch(/"allowImportingTsExtensions":\s*true/);
  });

  it('L10: --require-complete=easy は easy の不足だけを致命にする (hard の不足は警告のまま)', () => {
    const d = dataDir();
    expect(run('--dir', d, '--require-complete=easy').code).toBe(1); // easy は 1 問で足りない
    // easy が揃い、hard だけ足りないデータ
    const full = completePool();
    const easy = full.problems.map((p) => p.value as Problem).filter((p) => p.difficulty === 'easy');
    const d2 = dataDir({ companies: full.companies as Company[], kinds: DATA_KINDS, problems: easy });
    expect(run('--dir', d2).code).toBe(0);
    expect(run('--dir', d2, '--require-complete=easy').code).toBe(0);
    expect(run('--dir', d2, '--require-complete=hard').code).toBe(1);
    expect(run('--dir', d2, '--require-complete').code).toBe(1);
  });

  it('L11: --require-complete の値が easy・hard 以外 (打ち間違い) → 使いかたを出して終了コード 2', () => {
    for (const bad of ['--require-complete=hrad', '--require-complete=medium', '--require-complete=']) {
      const r = run('--dir', dataDir(), bad);
      expect(r.code, bad).toBe(2);
      expect(r.out).toContain('使いかた');
    }
  });

  it('L12: samples/*.json の見本を正常な問題として検証する (壊れた見本は終了コード 1)', () => {
    const company = { ...companyA(), id: 'c-sample' };
    const good = { problem: normalVariant('sample', 'easy', 'c-sample'), notes: { summary: '正常です' } };
    const base = { companies: [{ ...companyA(), id: 'fixture-c01' }, company] };
    const ok = run('--dir', dataDir({ ...base, samples: { 'sample.json': good } }));
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('見本 1 件');
    const bad = { ...good, problem: add(good.problem, 'tanshin.balanceSheet.current.totalAssets', 100) };
    const r = run('--dir', dataDir({ ...base, samples: { 'sample.json': bad } }));
    expect(r.code).toBe(1);
    expect(r.out).toContain('samples/sample.json');
    expect(r.out).toContain('bs-total-assets');
  });

  it('L13: samples/ が無ければ 0 件として扱う', () => {
    expect(run('--dir', dataDir()).out).toContain('見本 0 件');
  });
});
