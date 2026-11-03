// 試作 (#50)。道具バー 1 本が、幅 320〜414 px で折り返さず約 60 px に収まるかを測る。
// 使いかた: docs/plans/spike/ux-toolbar/ で `node measure.mjs`。製品のコードではない。
import { chromium, webkit, firefox } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = (qs) => 'file://' + path.join(dir, 'index.html') + '?' + qs;
const widths = [320, 360, 375, 414];
// 検算の結果の文 (差|比)。単位は百万円の想定。上から: 通常・大きな会社・桁が大きい・最悪 (円単位 10 桁)・比べられない・結果なし
const cases = [
  ['通常', '差 +1,234|比 1.05'],
  ['6 桁', '差 −123,456|比 0.83'],
  ['7 桁', '差 −1,234,567|比 0.83'],
  ['8 桁 (小数 3 桁)', '差 −12,345,678|比 0.123'],
  ['最悪 (10 桁)', '差 +1,234,567,890|比 123.456'],
  ['比べられない', '比べられない'],
  ['結果なし', ''],
];
const engines = { chromium, webkit, firefox };
const scales = [1, 1.2]; // 文字の大きさ。1.2 は端末の文字を大きくした場合の目安 (html の font-size を 120% にする)

const rows = [];
for (const [name, type] of Object.entries(engines)) {
  const browser = await type.launch();
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 667 }, deviceScaleFactor: 2, isMobile: name !== 'firefox', hasTouch: name !== 'firefox' });
    const page = await ctx.newPage();
    for (const mode of ['single', 'wrap']) {
      for (const scale of scales) {
        for (const [label, text] of cases) {
          await page.goto(url(`calc=${mode}&text=${encodeURIComponent(text)}`));
          await page.addStyleTag({ content: `html{font-size:${16 * scale}px}` });
          const r = await page.evaluate(() => {
            const rect = (id) => document.getElementById(id).getBoundingClientRect();
            const bar = rect('bar'), mark = rect('mark'), judge = rect('judge'), calc = document.getElementById('calc');
            const cr = calc.getBoundingClientRect();
            const lh = parseFloat(getComputedStyle(calc).lineHeight);
            return {
              barH: Math.round(bar.height * 10) / 10,
              hScroll: document.scrollingElement.scrollWidth > innerWidth,
              markWH: [Math.round(mark.width), Math.round(mark.height)],
              judgeWH: [Math.round(judge.width), Math.round(judge.height)],
              calcW: Math.round(cr.width),
              calcClipped: calc.scrollWidth > calc.clientWidth + 1,
              calcLines: calc.textContent ? Math.max(1, Math.round(calc.scrollHeight / lh)) : 0,
              calcOverflowsBar: cr.bottom > bar.bottom + 0.5 || cr.top < bar.top - 0.5,
            };
          });
          rows.push({ engine: name, width: w, mode, scale, label, ...r });
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(rows));
