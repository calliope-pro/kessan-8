// 受け入れ条件 7・9 と、設計 §4 の条件 (#137): 横にはみ出さない・文字 18 px 以上・320 px で 7 桁の金額が桁マスに 18 px 以上で収まる。
import { expect, test, type Page } from '@playwright/test';
import { drawRun } from '../src/proto/draw';
import { answer, NORMALS } from './support';

const noOverflow = (page: Page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth, body: document.body.scrollWidth }));

/** 文字を持つ要素のうち、computed font-size が min 未満のもの (非表示の補助文字は除く)。 */
const smallText = (page: Page, min: number) =>
  page.evaluate((m) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('.sr')) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < m) out.push(`${size}px ${text}`);
    }
    return out;
  }, min);

test('どの画面も横にはみ出さず、文字は 18 px 以上 (0 社目・n 社目・答え合わせ・差し戻し・クリア)', async ({ page }) => {
  const seed = 21;
  const rounds = drawRun(seed, NORMALS);
  await page.goto(`/proto.html?seed=${seed}`);
  const check = async (label: string) => {
    const w = await noOverflow(page);
    expect(w.doc, `${label}: 横に はみ出す`).toBeLessThanOrEqual(w.view);
    expect(w.body, `${label}: body が はみ出す`).toBeLessThanOrEqual(w.view);
    expect(await smallText(page, 18), `${label}: 18 px 未満の文字`).toEqual([]);
  };
  await check('0 社目');
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    await check(`${i + 1} 社目`);
    await answer(page, rounds[i]!.anomaly !== null);
    await check(`${i + 1} 社目の答え合わせ`);
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ' }).click();
  }
  await check('クリア');
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.getByRole('button', { name: '1 社目へ' }).click();
  const wrong = drawRun(seed + 7919, NORMALS)[0]!;
  await answer(page, wrong.anomaly === null);
  await check('差し戻し');
});

test('3 形の伝票が、答える前も答えたあとも横にはみ出さない', async ({ page }) => {
  // 確かめの画面は 1 形ごと。E2 (棒グラフ) は遊びの出題で出るまで周を替えて確かめる
  const seen = new Set<string>();
  for (let seed = 1; seed < 60 && seen.size < 3; seed++) {
    await page.goto(`/proto.html?seed=${seed}`);
    await page.getByRole('button', { name: '1 社目へ' }).click();
    const r = drawRun(seed, NORMALS)[0]!;
    seen.add(r.shape);
    const w = await noOverflow(page);
    expect(w.doc).toBeLessThanOrEqual(w.view);
    await answer(page, r.anomaly !== null);
    const w2 = await noOverflow(page);
    expect(w2.doc).toBeLessThanOrEqual(w2.view);
  }
  expect([...seen].sort()).toEqual(['E1', 'E2', 'E3']);
});

test('7 桁の金額が桁マスに 18 px 以上で収まる (実データの最大と、7 桁の最大 9,999,999)', async ({ page }, info) => {
  await page.goto('/proto.html?measure=1');
  const m = await page.evaluate(() => {
    const read = (key: string) => {
      const root = document.querySelector(`[data-measure="${key}"]`)!;
      const slip = root.querySelector('.slip')!.getBoundingClientRect();
      const field = root.querySelector('.row .field')!;
      const f = field.getBoundingClientRect();
      const cells = [...field.querySelectorAll('.cell')];
      const filled = cells.filter((c) => c.textContent?.trim());
      const sizes = filled.map((c) => parseFloat(getComputedStyle(c).fontSize));
      const overflowCells = cells.filter((c) => c.scrollWidth > c.clientWidth + 0.5).length;
      const unit = root.querySelector('.row .unit')!.getBoundingClientRect();
      return {
        text: filled.map((c) => c.textContent).join(''),
        digits: filled.length,
        minFontPx: Math.min(...sizes),
        cellWidthPx: Math.round(cells[0]!.getBoundingClientRect().width * 10) / 10,
        fieldWidthPx: Math.round(f.width),
        fieldRightInsideSlip: f.right <= slip.right,
        unitRightInsideSlip: unit.right <= slip.right,
        overflowCells,
      };
    };
    return { real: read('real'), widest: read('widest'), vw: innerWidth, docW: document.documentElement.scrollWidth };
  });
  info.annotations.push({ type: 'measure', description: JSON.stringify(m) });
  console.log(`[measure ${info.project.name}] ${JSON.stringify(m)}`);
  expect(m.real.digits).toBe(7);
  expect(m.real.text).toBe('2146400');
  expect(m.widest.digits).toBe(7);
  expect(m.widest.text).toBe('9999999');
  for (const k of ['real', 'widest'] as const) {
    expect(m[k].minFontPx, `${k} の数字の大きさ`).toBeGreaterThanOrEqual(18);
    expect(m[k].fieldRightInsideSlip, `${k} の桁マスが伝票に収まる`).toBe(true);
    expect(m[k].unitRightInsideSlip, `${k} の単位が伝票に収まる`).toBe(true);
    expect(m[k].overflowCells, `${k} の数字がマスからはみ出さない`).toBe(0);
  }
  expect(m.docW).toBeLessThanOrEqual(m.vw);
});

test('押す札は 44 px 四方以上 (指で押せる)', async ({ page }) => {
  await page.goto('/proto.html?seed=21');
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (const name of [/いつも通り/, /異変あり/]) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('押した印 (と、不正解の「差戻」) は、答えた直後にどの高さの画面でも見える位置に落ち、横幅を押し広げない', async ({ page }) => {
  const seed = 21;
  const rounds = drawRun(seed, NORMALS);
  await page.goto(`/proto.html?seed=${seed}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  const visible = async (label: string) => {
    await page.waitForTimeout(350); // 押印の動き (160 ms) が終わるまで
    const m = await page.evaluate(() => {
      const st = document.querySelector('.stamp')!.getBoundingClientRect();
      const act = document.querySelector('.actions')!.getBoundingClientRect();
      return { top: st.top, bottom: st.bottom, left: st.left, right: st.right, actionsTop: act.top, vw: innerWidth, vh: innerHeight, doc: document.documentElement.scrollWidth };
    });
    expect(m.top, `${label}: 印が画面の上に出る`).toBeGreaterThanOrEqual(0);
    expect(m.bottom, `${label}: 印が札の帯より上にある`).toBeLessThanOrEqual(m.actionsTop);
    expect(m.right, `${label}: 印が右端に収まる`).toBeLessThanOrEqual(m.vw);
    expect(m.left, `${label}: 印が左端に収まる`).toBeGreaterThanOrEqual(0);
    expect(m.doc, `${label}: 横幅を押し広げない`).toBeLessThanOrEqual(m.vw);
  };
  for (let i = 0; i < 3; i++) {
    await answer(page, rounds[i]!.anomaly !== null);
    await visible(`${i + 1} 社目の印`);
    await page.getByRole('button', { name: '次へ' }).click();
  }
  await answer(page, rounds[3]!.anomaly === null); // わざと間違える
  await visible('差戻の印');
});

test('伝票が札の帯の上に全部収まるか (記録)', async ({ page }, info) => {
  const out: Record<string, { footBottom: number; actionsTop: number }> = {};
  for (const shape of ['E1', 'E3'] as const) {
    await page.goto(`/proto.html?mode=test&shape=${shape}&seed=11&sample=off`);
    await page.getByRole('button', { name: '1 枚目へ' }).click();
    await page.waitForTimeout(300);
    out[shape] = await page.evaluate(() => ({
      footBottom: Math.round(document.querySelector('.slip-foot')!.getBoundingClientRect().bottom),
      actionsTop: Math.round(document.querySelector('.actions')!.getBoundingClientRect().top),
    }));
  }
  console.log(`[fit ${info.project.name}] ${JSON.stringify(out)}`);
});

test('答え合わせの朱書きは、札の帯に隠れない (全 8 枚)', async ({ page }) => {
  const seed = 21;
  const rounds = drawRun(seed, NORMALS);
  await page.goto(`/proto.html?seed=${seed}`);
  await page.getByRole('button', { name: '1 社目へ' }).click();
  for (let i = 0; i < 8; i++) {
    await answer(page, rounds[i]!.anomaly !== null);
    await page.waitForTimeout(250);
    if (rounds[i]!.anomaly) {
      const m = await page.evaluate(() => {
        const act = document.querySelector('.actions')!.getBoundingClientRect().top;
        return [...document.querySelectorAll('.slip .marked')].map((e) => ({ bottom: e.getBoundingClientRect().bottom, actionsTop: act }));
      });
      expect(m.length).toBeGreaterThan(0);
      for (const x of m) expect(x.bottom, `${i + 1} 枚目 ${rounds[i]!.anomaly!.kind}`).toBeLessThanOrEqual(x.actionsTop);
    }
    await page.getByRole('button', { name: i === 7 ? '完了票へ' : '次へ' }).click();
  }
});
