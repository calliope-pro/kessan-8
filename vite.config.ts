import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vercel from './vercel.json' with { type: 'json' };

// プレビュー (E2E が回す) にも、公開と同じセキュリティヘッダを当てる。出所は vercel.json の 1 か所。
const previewHeaders = Object.fromEntries(vercel.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]));

// E2E 用のページ (viewer-demo.html) は、VIEWER_DEMO=1 のビルドだけに入れる。公開の dist には載せない (docs/test-cases/viewer.md §6.1)。
const demoEntries = process.env.VIEWER_DEMO === '1' ? { input: { main: 'index.html', 'viewer-demo': 'viewer-demo.html' } } : {};

export default defineConfig({
  build: { rollupOptions: demoEntries },
  plugins: [
    // E2E (`npm run build:e2e` = 環境変数 E2E_POOL=1) だけ、問題の取り込みを試験用の問題に差し替える。本番のバンドルには src/testing/ を入れない。
    {
      name: 'e2e-pool',
      enforce: 'pre' as const,
      resolveId(source: string, importer?: string) {
        if (process.env.E2E_POOL === '1' && source === './pool-source' && importer?.endsWith('src/data/index.ts')) {
          return fileURLToPath(new URL('./src/testing/pool-source.e2e.ts', import.meta.url));
        }
        return null;
      },
    },
  ],
  preview: { headers: previewHeaders },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
