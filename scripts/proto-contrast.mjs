// 試作の配色のコントラスト比 (WCAG 2.x の相対輝度)。DESIGN.md の宿題: 社色は台紙 (白でない) に対して計算し直す。
// 使い方: node scripts/proto-contrast.mjs   (色の出所: src/proto/proto.css の :root と src/data/companies.json)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/proto/proto.css', import.meta.url), 'utf8');
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const companies = JSON.parse(readFileSync(new URL('../src/data/companies.json', import.meta.url), 'utf8'));

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const T = Object.fromEntries(['ground', 'paper', 'paper-sunk', 'rule', 'rule-soft', 'rule-mid', 'ink', 'ink-soft', 'stamp', 'stamp-wash'].map((n) => [n, token(n)]));
const rows = [
  ['インク / 紙 (本文・数字)', T.ink, T.paper, 4.5],
  ['インク / 台紙 (点検欄の文字など)', T.ink, T.ground, 4.5],
  ['インク (薄) / 紙 (言い換え・期末日)', T['ink-soft'], T.paper, 4.5],
  ['朱 / 紙 (押印・間違いの文字)', T.stamp, T.paper, 4.5],
  ['朱 / 台紙 (差し戻し・完了の字。通常の文字の基準)', T.stamp, T.ground, 4.5],
  ['朱 / 朱の薄塗り (動きを減らす設定の差し戻し)', T.stamp, T['stamp-wash'], 4.5],
  ['朱 / 紙の沈み (点検欄の「いま」の縁)', T.stamp, T['paper-sunk'], 3],
  ['罫 (青緑) / 紙 (罫線・桁マス。図形は 3:1)', T.rule, T.paper, 3],
  ['桁マスの内側の罫 / 紙 (桁数の手がかり。図形は 3:1)', T['rule-mid'], T.paper, 3],
  ['罫 (淡) / 紙 (行の罫。装飾で、情報を載せない)', T['rule-soft'], T.paper, 1],
  ['紙 / インク (黒い札の白文字)', T.paper, T.ink, 4.5],
];
console.log('| 組み合わせ | 比 | 基準 | 判定 |\n| --- | --- | --- | --- |');
for (const [name, fg, bg, need] of rows) {
  const r = ratio(fg, bg);
  console.log(`| ${name} (${fg} / ${bg}) | ${r.toFixed(2)} | ${need} | ${r >= need ? '○' : '✗'} |`);
}
console.log('\n社色 (角印の枠と記号 = 図形・大きい字。3:1 以上が基準。社名の下線は装飾):');
console.log('| 会社 | 社色 | 社色 / 淡い色 (角印の中) | 社色 / 紙 (社名の下線) | 社色 / 台紙 | 判定 (角印 3:1) |\n| --- | --- | --- | --- | --- | --- |');
for (const c of companies) {
  const a = ratio(c.colors.main, c.colors.light), b = ratio(c.colors.main, T.paper), d = ratio(c.colors.main, T.ground);
  console.log(`| ${c.id} ${c.name} | ${c.colors.main} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${d.toFixed(2)} | ${a >= 3 ? '○' : '✗'} |`);
}
