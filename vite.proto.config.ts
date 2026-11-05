// 縦の試作 (proto.html) だけをビルドする設定。本体の vite.config.ts・dist には触らない。出力は dist-proto。
// 公開と同じセキュリティヘッダ (vercel.json の CSP) をプレビューにも当てる。
import { defineConfig } from 'vite';
import vercel from './vercel.json' with { type: 'json' };

const headers = Object.fromEntries(vercel.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]));

export default defineConfig({
  build: { outDir: 'dist-proto', emptyOutDir: true, rollupOptions: { input: 'proto.html' } },
  preview: { headers },
  server: { headers },
});
