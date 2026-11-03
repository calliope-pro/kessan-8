import { defineConfig, devices } from '@playwright/test';

// ビルドした成果物 (vite preview) に対して回す。
// - desktop・mobile (375 px 幅): `npm run build:e2e` (試験用の問題に差し替えた版) に対して、遊びの流れ (flow.spec.ts) ほかを回す
// - prod-desktop・prod-mobile: **差し替えない本番のビルド** (`npm run build` と同じ。出力は dist-prod) に対して、本物の問題データで prod.spec.ts を回す (docs/test-cases/release.md §2)
// 別の作業ツリーが同じポートで preview を立てていても、古いビルドに対して回さないよう、既存のサーバは使い回さない。ポートは E2E_PORT で変えられる。
const port = Number(process.env.E2E_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;
const prodPort = Number(process.env.E2E_PROD_PORT ?? port + 1);
const prodOrigin = `http://127.0.0.1:${prodPort}`;

// 公開 URL に対する確かめ (docs/test-cases/release.md §4。#96): E2E_LIVE_URL=https://… で、webServer を起動せず live.spec.ts だけを 4 つの幅 (1280・414・375・320) で回す。
const liveUrl = process.env.E2E_LIVE_URL;
const live = (name: string, width: number, mobile: boolean) => ({
    name, testMatch: /live\.spec\.ts/,
    use: { ...devices['Desktop Chrome'], baseURL: liveUrl, viewport: { width, height: mobile ? 700 : 800 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) },
  });
const liveConfig = defineConfig({
  testDir: 'e2e', fullyParallel: true, reporter: 'list', timeout: 120_000, use: { trace: 'retain-on-failure' },
  projects: liveUrl ? [live('live-1280', 1280, false), live('live-414', 414, true), live('live-375', 375, true), live('live-320', 320, true)] : [],
});

const normalConfig = defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: origin, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `VIEWER_DEMO=1 npm run build:e2e && npm run preview -- --outDir dist-e2e --host 127.0.0.1 --port ${port} --strictPort`,
      url: origin,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build -- --outDir dist-prod && npm run preview -- --outDir dist-prod --host 127.0.0.1 --port ${prodPort} --strictPort`,
      url: prodOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', testIgnore: /(prod|live)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testIgnore: /(prod|live)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'prod-desktop', testMatch: /prod\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: prodOrigin, viewport: { width: 1280, height: 800 } } },
    { name: 'prod-mobile', testMatch: /prod\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: prodOrigin, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
  ],
});

export default liveUrl ? liveConfig : normalConfig;
