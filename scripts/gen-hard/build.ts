// @ts-nocheck — 問題データを作る道具 (むずかしい 132 問。docs/plans/problems-hard.md)。設計表 (plan.ts) の 132 問を、メモリの上で作る (書き出しは run.ts)。
// 正常 10 問 (genAll) と、各社の正常な問題の 1 か所を変えた異変の問題 122 問 (inject)。乱数は会社 id と問題の番号から作った種なので、同じ入力で同じ出力 (src/data/problems-hard.test.ts の A4)。
import { plan } from './plan.ts';
import { genAll, companies } from './gen.ts';
import { inject } from './inject.ts';

export function buildAll() {
  const rows = plan();
  const normals = genAll(rows.filter((r) => r.kind === null).map((r) => ({ n: Number(r.id.slice(5)), id: r.id, company: r.company, fiscalYear: r.fiscalYear, elements: r.elements })));
  const seen = {};
  const anomalies = rows
    .filter((r) => r.kind !== null)
    .map((row) => {
      const i = (seen[row.kind] = (seen[row.kind] ?? -1) + 1);
      const base = normals.find((p) => p.companyId === row.company);
      return inject(base, companies.find((c) => c.id === row.company), companies, row, i);
    });
  // JSON に書いて読み戻した形にそろえる (-0 → 0・undefined の欠落。ディスクの JSON と toEqual で比べられるように)
  return JSON.parse(JSON.stringify([...normals, ...anomalies].sort((a, b) => a.id.localeCompare(b.id))));
}
