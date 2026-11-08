// 設計 v3 §3.2: 問題データの転送量 (gzip) の見積もり。charter の「初回 1 MB 未満」は scripts/check-dist-size.mjs のとおり、dist の各ファイルを gzip (level 9) した長さの合計。製品のコードではない。
// 方法: (1) 今の問題 (やさしい 25・むずかしい 32) を JSON にして gzip (実測)。(2) 正常な問題を基に、異変の問題を「基の複製 + 1 つの原因のセルの変更 + anomaly の記述」で増やして、やさしい 85・むずかしい 132 問の JSON を作り、gzip (見積もり)。(3) 異変を「基の ID + 変更」だけで持つ形 (展開は読み込み時) の gzip。
// 使いかた (リポジトリの根から): node --experimental-strip-types --no-warnings docs/plans/redesign/spike-design/v3-data-size.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const load = (d: string) => readdirSync(resolve(root, `src/data/problems/${d}`)).sort().map((f) => read(`src/data/problems/${d}/${f}`));
const gz = (x: unknown) => gzipSync(Buffer.from(JSON.stringify(x)), { level: 9 }).length;
const raw = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
const easy = load('easy'), hard = load('hard');
console.log(`(1) 今の問題 (実測): やさしい ${easy.length} 問 raw ${raw(easy)} B・gzip ${gz(easy)} B / むずかしい ${hard.length} 問 raw ${raw(hard)} B・gzip ${gz(hard)} B / 合計 gzip ${gz([...easy, ...hard])} B`);
const mutate = (p: any, i: number, tag: string) => { const q = JSON.parse(JSON.stringify(p)); q.id = `${tag}-${i}`; q.tanshin.incomeStatement.current.operatingIncome = Math.round(q.tanshin.incomeStatement.current.operatingIncome * (1 + (i % 7) / 10)); q.anomaly = { kindId: 'E-02', places: [{ doc: 'tanshin', path: 'incomeStatement.current.operatingIncome' }], explanation: '営業利益の桁が前期とずれている。正しくは前期と同じ桁で、営業利益率と合わない。', base: p.id, changed: ['tanshin.incomeStatement.current.operatingIncome'] }; return q; };
const grow = (bases: any[], total: number, tag: string) => { const normals = bases.filter((p) => !p.anomaly); const out = [...normals]; for (let i = 0; out.length < total; i++) out.push(mutate(normals[i % normals.length], i, tag)); return out; };
const easy85 = grow(easy, 85, 'e'), hard132 = grow(hard, 132, 'h');
const normalsOnly = (ps: any[]) => ps.filter((p) => !p.anomaly);
const patch = (ps: any[]) => ps.map((p) => (p.anomaly ? { id: p.id, base: p.anomaly.base, anomaly: p.anomaly } : p));
console.log(`(2) 見積もり (完全な問題を複製): やさしい 85 問 raw ${raw(easy85)} B・gzip ${gz(easy85)} B / むずかしい 132 問 raw ${raw(hard132)} B・gzip ${gz(hard132)} B / 合計 gzip ${gz([...easy85, ...hard132])} B`);
console.log(`(3) 異変を「基の ID + 変更」で持つ形: 正常 ${normalsOnly(easy85).length + normalsOnly(hard132).length} 問 + 異変の記述だけ。合計 gzip ${gz([...patch(easy85), ...patch(hard132)])} B`);
console.log(`    正常な問題だけの gzip: ${gz([...normalsOnly(easy85), ...normalsOnly(hard132)])} B (異変の問題の分は含まない)`);
