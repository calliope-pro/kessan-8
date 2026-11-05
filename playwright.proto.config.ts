// 縦の試作 (proto.html) の E2E。本体の playwright.config.ts とは別 (本体の UI は捨てる対象で、試作とは出所が違う)。
// 試作のビルド (dist-proto) を、公開と同じ CSP のヘッダ付きで preview して回す。
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PROTO_PORT ?? 4191);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e-proto',
  fullyParallel: true,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: origin, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run build:proto && npm run preview:proto -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/proto.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
  ],
});
