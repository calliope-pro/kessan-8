import { defineConfig } from 'vitest/config';
import vercel from './vercel.json' with { type: 'json' };

// プレビュー (E2E が回す) にも、公開と同じセキュリティヘッダを当てる。出所は vercel.json の 1 か所。
const previewHeaders = Object.fromEntries(vercel.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]));

export default defineConfig({
  preview: { headers: previewHeaders },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
