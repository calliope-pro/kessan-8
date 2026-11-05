// 縦の試作 (proto.html) だけをビルドする設定。本体の vite.config.ts・dist には触らない。出力は dist-proto。
// dist-proto は、そのまま 1 つの静的サイトとして公開できる形にする (docs/proto/playtest-guide.md §2):
//   - index.html (= proto.html。URL の根でも開ける)
//   - vercel.json (ヘッダだけ。公開と同じ CSP など。buildCommand などは入れない: 公開側でビルドを走らせない)
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import vercel from './vercel.json' with { type: 'json' };

const headers = Object.fromEntries(vercel.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]));
const OUT = 'dist-proto';

export default defineConfig({
  build: { outDir: OUT, emptyOutDir: true, rollupOptions: { input: 'proto.html' } },
  plugins: [
    {
      name: 'proto-site',
      apply: 'build',
      closeBundle() {
        copyFileSync(join(OUT, 'proto.html'), join(OUT, 'index.html'));
        writeFileSync(join(OUT, 'vercel.json'), JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', headers: vercel.headers }, null, 2) + '\n');
      },
    },
  ],
  preview: { headers },
  server: { headers },
});
