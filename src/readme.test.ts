// UD1〜UD7 (docs/test-cases/release.md §1): README の約束
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUBTITLE, TITLE } from './title';

const readme = readFileSync('README.md', 'utf-8');

describe('index.html の <title>', () => {
  it('UD8: 静的な HTML の <title> が題名「８期連続」 (JavaScript が走る前・検索結果・共有でも題名が出る)。「kessan-8」のままにしない', () => {
    const html = readFileSync('index.html', 'utf-8');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    expect(title).toContain(TITLE);
    expect(title).not.toBe('kessan-8');
    expect(title).not.toMatch(/[8８]番出口/);
  });
});

describe('README', () => {
  it('UD1: 題名・リポジトリ名・副題がある', () => {
    expect(readme).toContain(TITLE);
    expect(readme).toContain('kessan-8');
    expect(readme).toContain(SUBTITLE);
  });

  it('UD2: 遊び方の節に、ルールとやさしい・むずかしいがある', () => {
    const section = readme.split(/^## /m).find((s) => s.startsWith('遊び方')) ?? '';
    expect(section).toContain('8 社連続');
    expect(section).toContain('最初');
    expect(section).toContain('異変あり');
    expect(section).toContain('異変なし');
    expect(section).toContain('やさしい');
    expect(section).toContain('むずかしい');
  });

  it('UD3: 登場する会社・人物・数字がすべて架空という断りがある', () => {
    expect(readme).toContain('登場する会社・人物・数字はすべて架空');
  });

  it('UD4: ライセンス MIT と LICENSE へのリンク', () => {
    expect(readme).toMatch(/MIT/);
    expect(readme).toContain('(LICENSE)');
    expect(existsSync('LICENSE')).toBe(true);
  });

  it('UD5: 公開 URL の項は、引き取りのあとに入れると分かる (いまの公開は一時的な URL)。一時的な URL・実在しない URL を書かない', () => {
    const section = readme.split(/^## /m).find((s) => s.startsWith('公開 URL')) ?? '';
    expect(section).toContain('引き取りのあと');
    expect(readme).not.toContain('vercel.app');
    expect(readme).not.toContain('tmp.now');
  });

  it('UD6: 「８番出口」の語を含まない', () => {
    expect(readme).not.toMatch(/[8８]番出口/);
  });

  it('UD7: 開発の手順が残っている', () => {
    for (const c of ['npm ci', 'npm test', 'npm run build', 'npm run test:e2e']) expect(readme).toContain(c);
  });
});
