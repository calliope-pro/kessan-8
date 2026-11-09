// むずかしい 132 問の設計 (docs/plans/problems-hard.md §4 の表の出所)。会社 × 段 × 種類 × 形を決める。問題データを作る道具 (#171) もここを読む。
// 表の再生成: node --experimental-strip-types --no-warnings scripts/gen-hard/plan.ts   (表を標準出力に出す。docs/plans/problems-hard.md の §4 と同じでなければ、src/data/problems-hard-table.test.ts が赤)

export const COMPANY_IDS = ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10'] as const;
export type CompanyId = (typeof COMPANY_IDS)[number];

/** 全問の期。やさしいの 2023〜2025 年と重ならず (会社 × 期が両難易度で重ならない)、発表日はすべて公開 (2026-11) より前。会社ごとに期は 1 つ (R-S5 (d): どの (会社, 期) にも正常と異変)。 */
export const FISCAL_YEAR = 2022;

/**
 * 正常な問題が持つ「正しいが疑わしく見える要素」(段は持たない。設計 v3 §2.7)。
 * G 大きな増減率 / X 特別損失 / D 減配 / N 赤字のセグメント / C 大きな設備投資 / P 会計方針の変更 / E 後発事象 (どれも旧設計表 §3.2 と同じ定義) と、v3 で足す
 * DN = 営業利益が前期より減る (R-S5 (f): 減益 3 社以上) / CN = 営業 CF がマイナス (同: 1 社以上)。
 */
export const NORMAL_ELEMENTS: Record<CompanyId, string[]> = {
  c01: [],
  c02: ['DN', 'X'],
  c03: ['DN', 'C'],
  c04: ['P'],
  c05: ['G'],
  c06: ['CN'],
  c07: ['DN'],
  c08: ['N'],
  c09: ['D'],
  c10: ['E'],
};

export interface KindPlan {
  id: string;
  tier: 1 | 2 | 3;
  /** 異変の問題の数 (設計 v3 §1.5。会計・資料間の 11 種類は 7 問、注記・表記の 9 種類は 5 問)。 */
  count: 5 | 7;
}

/** 台帳 v3 のむずかしい 20 種類 (設計 v3 §2.3) を、段ごとに並べた順 (この順に会社へ散らす)。 */
export const KINDS: KindPlan[] = [
  { id: 'H-17', tier: 1, count: 7 },
  { id: 'H-35', tier: 1, count: 7 },
  { id: 'H-22', tier: 1, count: 5 },
  { id: 'H-29', tier: 1, count: 5 },
  { id: 'H-30', tier: 1, count: 5 },
  { id: 'H-32', tier: 1, count: 5 },
  { id: 'H-33', tier: 1, count: 5 },
  { id: 'H-34', tier: 1, count: 5 },
  { id: 'H-13', tier: 2, count: 7 },
  { id: 'H-19', tier: 2, count: 7 },
  { id: 'H-21', tier: 2, count: 7 },
  { id: 'H-28', tier: 2, count: 7 },
  { id: 'H-23', tier: 2, count: 5 },
  { id: 'H-24', tier: 2, count: 5 },
  { id: 'H-31', tier: 2, count: 5 },
  { id: 'H-01', tier: 3, count: 7 },
  { id: 'H-03', tier: 3, count: 7 },
  { id: 'H-04', tier: 3, count: 7 },
  { id: 'H-05', tier: 3, count: 7 },
  { id: 'H-20', tier: 3, count: 7 },
];

/** 全異変の問題を、段 → 種類の順に並べて会社へ順に (巡回で) 散らす最初の会社の位置。H-24 が、後発事象のある正常 (c10) の会社に当たらない位置 (H-24 の土台は短信も IR も「該当なし」のものだけ。設計 v3 §2.3)。 */
export const CYCLE_START = 3;

/** 種類ごとの「形」(欄・作り方)。i = その種類の何問目か (0 始まり)。 */
const FORMS: Record<string, (i: number, company: CompanyId) => string> = {
  'H-17': (i) => `倍率=${['×10', '÷10'][i % 2]}`,
  'H-35': (_i, company) => `社名=${COMPANY_IDS[(COMPANY_IDS.indexOf(company) + 1) % COMPANY_IDS.length]}`,
  'H-22': (i) => `文言=${(i % 3) + 1}`,
  'H-29': (i) => `欄=${['opCurr', 'irSales', 'ta', 'irCashCur', 'ocf'][i]}`,
  'H-30': (i) => `欄=${['ocf', 'ta', 'pbt', 'cash', 'cfEnd'][i]}`,
  'H-32': (i, company) => {
    const slot = ['sales', 'ta', 'cash', 'sales', 'tlna'][i] as string;
    // comma-shift は整数部が 5 桁以上の欄だけ。c09 の売上高は 4 桁なので no-comma
    const style = slot === 'sales' && i === 0 && company !== 'c09' ? 'comma-shift' : 'no-comma';
    return `欄=${slot}:${style}`;
  },
  'H-33': (i) => `欄=${['headline', 'sales', 'cash', 'audit', 'irSales'][i]}`,
  'H-34': (i) => `欄=${['sales', 'ta', 'cash', 'irSales', 'cfEnd'][i]}`,
  'H-13': (i) => `欄=${['irSales', 'irCashCur'][i % 2]}`,
  'H-28': (i) => `科目名=${['買掛金', '買掛金', '短期借入金', '買掛金', '短期借入金', '買掛金', '短期借入金'][i]}`,
  'H-23': (i) => `反転=${['flag', 'note'][i % 2]}`,
  'H-31': (i) => `欄=${['margin', 'cash', 'ocf', 'audit', 'irOcf'][i]}`,
  // 20% ずらすは G3 (5 百万円以上) を満たす基だけ。売上債権の増減が小さい会社 (c03・c08。今の正常で −4〜−34・−20) は符号を逆に (#170 レビュー B2)
  'H-05': (i, company) => `作り方=${company === 'c03' || company === 'c08' || i % 2 === 0 ? '符号を逆に' : '20% ずらす'}`,
};

export interface PlanRow {
  id: string;
  company: CompanyId;
  fiscalYear: number;
  /** 異変の問題だけ。正常な問題は段を持たない (設計 v3 §2.7)。 */
  tier: 1 | 2 | 3 | null;
  /** 異変の種類 (anomaly-kinds.json の id)。null = 正常。 */
  kind: string | null;
  /** 正常: 疑わしく見える要素。異変あり: 空。 */
  elements: string[];
  /** 異変あり: 形 (欄・作り方)。正常: 空。 */
  form: string;
}

const pad = (n: number) => `hard-${String(n).padStart(3, '0')}`;

/** 132 問 (正常 10 + 異変 122)。ID は正常が hard-001〜010 (会社順)、異変が hard-011 以降 (段 → 種類 → 会社の巡回の順)。 */
export function plan(): PlanRow[] {
  const rows: PlanRow[] = COMPANY_IDS.map((company, i) => ({
    id: pad(i + 1),
    company,
    fiscalYear: FISCAL_YEAR,
    tier: null,
    kind: null,
    elements: NORMAL_ELEMENTS[company],
    form: '',
  }));
  let cursor = CYCLE_START;
  let n = rows.length;
  for (const k of KINDS) {
    for (let i = 0; i < k.count; i++) {
      const company = COMPANY_IDS[cursor % COMPANY_IDS.length] as CompanyId;
      cursor++;
      n++;
      rows.push({ id: pad(n), company, fiscalYear: FISCAL_YEAR, tier: k.tier, kind: k.id, elements: [], form: (FORMS[k.id]?.(i, company)) ?? '定型' });
    }
  }
  return rows;
}

/** 設計表の 1 行 (docs/plans/problems-hard.md §4)。名前は companies.json・anomaly-kinds.json から。 */
export function renderRows(rows: PlanRow[], names: { company: (id: string) => string; kind: (id: string) => { name: string; family: string } }): string[] {
  return rows.map((r) => {
    const co = `${r.company} ${names.company(r.company)}`;
    if (r.kind === null) return `| ${r.id} | ${co} | ${r.fiscalYear} | - | (正常) | - | ${r.elements.length === 0 ? '0 個' : r.elements.join('・')} |`;
    const k = names.kind(r.kind);
    return `| ${r.id} | ${co} | ${r.fiscalYear} | ${r.tier} | ${r.kind} ${k.name} | ${k.family} | ${r.form} |`;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../../src/data/${f}`, import.meta.url), 'utf-8')) as { id: string; name: string; family?: string }[];
  const companies = read('companies.json');
  const kinds = read('anomaly-kinds.json');
  const lines = renderRows(plan(), {
    company: (id) => (companies.find((c) => c.id === id)?.name ?? '').replace('株式会社', ''),
    kind: (id) => ({ name: kinds.find((k) => k.id === id)?.name ?? '', family: kinds.find((k) => k.id === id)?.family ?? '' }),
  });
  console.log(lines.join('\n'));
}
