import { defineConfig, devices } from '@playwright/test';

// ビルドした成果物 (vite preview) に対して回す。デスクトップとスマホ (375 px 幅) の 2 つの project。
// 別の作業ツリーが同じポートで preview を立てていても、古いビルドに対して回さないよう、既存のサーバは使い回さない。ポートは E2E_PORT で変えられる。
const port = Number(process.env.E2E_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: origin, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run build:e2e && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
  ],
});
