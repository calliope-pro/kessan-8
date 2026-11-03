// @ts-nocheck — 問題データを作る道具 (むずかしい 32 問。docs/plans/problems-hard.md)。生成物は src/data/problems/hard/*.json で、JSON が唯一の出所。
// むずかしい 32 問の設計 (会社 × 期 × 段 × 異変の有無と種類)。設計表 (docs/plans/problems-hard.md) はここから作る。
export interface ProblemSpec {
  n: number;
  company: string;
  fiscalYear: number;
  tier: 1 | 2 | 3;
  /** 異変の種類 (anomaly-kinds.json の id)。null = 正常。 */
  kind: string | null;
  /** 正常: 段を数える「正しいが疑わしく見える要素」(G 大きな増減率・X 特別損益・D 減配か無配・N 赤字のセグメント・C 大きな設備投資・P 会計方針の変更・E 後発事象)。異変あり: 場所・形の指定。 */
  elements: string[];
  note?: string;
}
const A = (company: string, _y: number, tier: 1 | 2 | 3, kind: string, note: string): Omit<ProblemSpec, 'n'> => ({ company, fiscalYear: 0, tier, kind, elements: [], note });
const N = (company: string, _y: number, tier: 1 | 2 | 3, elements: string[]): Omit<ProblemSpec, 'n'> => ({ company, fiscalYear: 0, tier, kind: null, elements });
const rows: Omit<ProblemSpec, 'n'>[] = [
  // 段 1 (14 問: 異変 7・正常 7)
  A('c04', 2026, 1, 'H-22', '短信 T1 の注意書きが「監査済みです」'),
  A('c09', 2026, 1, 'H-28', '資産の部の「売掛金」が「買掛金」になっている'),
  A('c06', 2026, 1, 'H-19', 'IR のセグメントが 3 つから 2 つに減っている'),
  A('c02', 2026, 1, 'H-01', '貸借対照表の買掛金がずれて、資産合計 ≠ 負債純資産合計'),
  A('c10', 2026, 1, 'H-13', 'IR ハイライトの売上高が短信と桁の並びが入れ替わっている'),
  A('c03', 2026, 1, 'H-17', 'IR の売上高が短信の換算の 10 倍 (億円)'),
  A('c08', 2026, 1, 'H-21', 'I1 に「無借金経営」と書いてあるが、借入金が残っている'),
  N('c01', 2027, 1, []),
  N('c02', 2027, 1, []),
  N('c03', 2027, 1, []),
  N('c04', 2027, 1, []),
  N('c05', 2027, 1, []),
  N('c07', 2027, 1, []),
  N('c08', 2027, 1, []),
  // 段 2 (12 問: 異変 6・正常 6)
  A('c01', 2026, 2, 'H-03', 'CF の起点が当期純利益'),
  A('c05', 2026, 2, 'H-15', 'IR のセグメント別の利益が短信の注記と違う'),
  A('c07', 2026, 2, 'H-16', 'IR の見通しの比較用の売上高 (当期の実績) が短信と違う'),
  A('c09', 2028, 2, 'H-23', '短信 T1 は会計方針の変更「無」だが、注記に変更の説明がある'),
  A('c02', 2025, 2, 'H-24', '後発事象は「該当なし」だが、IR に期末後の大きな出来事 (金額つき)'),
  A('c04', 2025, 2, 'H-05', 'CF の売上債権の増減額が貸借の差と合わない'),
  N('c01', 2028, 2, ['G', 'C']),
  N('c03', 2028, 2, ['X']),
  N('c06', 2027, 2, ['P']),
  N('c07', 2028, 2, ['X', 'E']),
  N('c09', 2027, 2, ['G']),
  N('c10', 2027, 2, ['X', 'D']),
  // 段 3 (6 問: 異変 3・正常 3)
  A('c10', 2028, 3, 'H-02', '利益剰余金が「前期末 + 純利益 − 配当の支払額」よりわずかに多い'),
  A('c05', 2028, 3, 'H-09', '有形固定資産が「前期末 + 取得 − 減価償却費」よりわずかに多い'),
  A('c06', 2028, 3, 'H-06', 'CF の棚卸資産の増減額の符号が逆'),
  N('c02', 2028, 3, ['G', 'X', 'C']),
  N('c04', 2028, 3, ['G', 'X', 'P']),
  N('c08', 2028, 3, ['X', 'N', 'E']),
];
const base: ProblemSpec[] = rows.map((r, i) => ({ n: i + 1, ...r }));
/** 期: 会社ごとに n の昇順で、最後の期が LAST_YEAR になる連続した年。やさしい (2023〜2025) と重ならず、発表日はすべて公開 (2026-11) より前。 */
export const LAST_YEAR = 2022;
for (const c of new Set(base.map((s) => s.company))) {
  const mine = base.filter((s) => s.company === c);
  mine.forEach((s, i) => (s.fiscalYear = LAST_YEAR - (mine.length - 1 - i)));
}
export const SPECS: ProblemSpec[] = base;
