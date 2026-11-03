// 試作 (#50)。sessionStorage の性質を測る: (a) 再読み込みで残る (b) window.open で開いた別のタブに複製される (c) 新しいタブには無い。
// 使いかた: docs/plans/spike/ux-toolbar/ で `node session.mjs`。製品のコードではない。
import http from 'node:http';
import { chromium, webkit, firefox } from '@playwright/test';

const server = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>s</title>'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;
const out = [];
for (const [name, type] of Object.entries({ chromium, webkit, firefox })) {
  const browser = await type.launch();
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(origin);
  await a.evaluate(() => sessionStorage.setItem('run', 'before-answer'));
  await a.reload();
  const afterReload = await a.evaluate(() => sessionStorage.getItem('run'));
  const [b] = await Promise.all([ctx.waitForEvent('page'), a.evaluate((u) => window.open(u), origin)]);
  await b.waitForLoadState();
  const inOpened = await b.evaluate(() => sessionStorage.getItem('run'));
  await a.evaluate(() => sessionStorage.setItem('run', 'answered-wrong-and-discarded'));
  const openedAfter = await b.evaluate(() => sessionStorage.getItem('run'));
  const c = await ctx.newPage();
  await c.goto(origin);
  const inNew = await c.evaluate(() => sessionStorage.getItem('run'));
  out.push({ engine: name, afterReload, inOpened, openedAfterOriginalChanged: openedAfter, inNewTab: inNew });
  await browser.close();
}
server.close();
console.log(JSON.stringify(out, null, 1));
