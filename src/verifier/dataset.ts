// データ全件の検証 (ケース表 §2.8)。errors = 致命、shortfalls = 数が足りない (完成の段階で効く)、soft = 参考の規則。
import { LABELS } from '../domain/labels.ts';
import { CARD_POOL_SIZE, CLAIMS_SHOWN, CLAIM_DOWN_MIN_COMPANIES, FAMILY_SHARE_MIN, KIND_MIN_COMPANIES, KIND_PROBLEMS, MIN_POOL_PER_DIFFICULTY, ROUNDS_TO_CLEAR, TIER_BALANCE_MAX_GAP } from '../domain/config.ts';
import { deriveCards } from '../domain/cards.ts';
import { FAMILY_DIFFICULTY } from '../domain/types.ts';
import type { AnomalyKind, Company, Difficulty, Problem } from '../domain/types.ts';
import { anomalyIssues } from './anomaly.ts';
import { cardEditIssues, cardLimitIssues, cardRelationIssues, cardStructureIssues, cardTextLengthIssues, cardVisibility, deviationIssues, doubleDiscrepancies, isVisible, relationAllowed } from './cards.ts';
import { changedCells } from './path.ts';
import { verifyIrDisplay, verifyProblem } from './index.ts';
import type { VerifyResult } from './index.ts';
import { HARD_RULE_IDS, SOFT_RULE_IDS } from './rules/index.ts';
import { companyShapeErrors, kindShapeErrors, shapeErrors } from './shape.ts';

export interface Entry {
  code: string;
  problem?: string;
  /** 数の不足 (shortfalls) のとき、どの難易度の不足か。 */
  difficulty?: Difficulty;
  message: string;
}

export interface DatasetInput {
  companies: unknown[];
  kinds: unknown[];
  problems: { file: string; value: unknown }[];
  /** 見本 (samples/*.json)。`{ problem }`。正常な問題として検証するが、プールには入れない。 */
  samples?: { file: string; value: unknown }[];
}

export interface DatasetResult {
  errors: Entry[];
  shortfalls: Entry[];
  soft: Entry[];
  stats: Record<Difficulty, { total: number; anomaly: number; normal: number }>;
  /** 検証した見本の数。 */
  samples: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'hard'];
const PRIMARY_FAMILIES: Record<Difficulty, string[]> = { easy: ['appearance', 'calculation'], hard: ['accounting', 'cross-document'] };
const ALL_RULES = [...HARD_RULE_IDS, ...SOFT_RULE_IDS];

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false))))];
}

export function verifyDataset(input: DatasetInput, verify: (p: Problem, c: Company) => VerifyResult = verifyProblem): DatasetResult {
  const errors: Entry[] = [];
  const shortfalls: Entry[] = [];
  const soft: Entry[] = [];
  const stats = { easy: { total: 0, anomaly: 0, normal: 0 }, hard: { total: 0, anomaly: 0, normal: 0 } };

  // 会社
  const companies: Company[] = [];
  input.companies.forEach((c, i) => {
    const bad = companyShapeErrors(c);
    bad.forEach((m) => errors.push({ code: 'company-shape', message: `companies[${i}] ${m}` }));
    if (bad.length === 0) companies.push(c as Company);
  });
  duplicates(companies.map((c) => c.id)).forEach((id) => errors.push({ code: 'duplicate-company', message: `会社の id が重複: ${id}` }));

  // 異変の種類
  const kinds: AnomalyKind[] = [];
  input.kinds.forEach((k, i) => {
    const bad = kindShapeErrors(k);
    bad.forEach((m) => errors.push({ code: 'kind-shape', message: `anomaly-kinds[${i}] ${m}` }));
    if (bad.length > 0) return;
    const kind = k as AnomalyKind;
    kinds.push(kind);
    for (const rule of [...kind.primaryRules, ...kind.allowedRules]) {
      if (!ALL_RULES.includes(rule)) errors.push({ code: 'unknown-rule', message: `種類 ${kind.id} が存在しない規則 ID を参照している: ${rule}` });
    }
    if (kind.primaryRules.length === 0) errors.push({ code: 'kind-no-primary', message: `種類 ${kind.id} の primaryRules が空` });
    if (kind.primaryRules.some((r) => !kind.allowedRules.includes(r))) errors.push({ code: 'kind-primary-not-allowed', message: `種類 ${kind.id} の primaryRules が allowedRules に含まれない` });
  });
  duplicates(kinds.map((k) => k.id)).forEach((id) => errors.push({ code: 'duplicate-kind', message: `異変の種類の id が重複: ${id}` }));

  // 問題
  let sampleCount = 0;
  const valid: Problem[] = [];
  const judged: { p: Problem; company: Company; result: VerifyResult; file: string }[] = [];
  for (const { file, value } of input.problems) {
    const shape = shapeErrors(value);
    if (shape.length > 0) {
      shape.forEach((m) => errors.push({ code: 'shape', message: `${file}: ${m}` }));
      continue;
    }
    const p = value as Problem;
    const add = (code: string, message: string) => errors.push({ code, problem: p.id, message: `${file}: ${message}` });
    const stem = file.split('/').pop()?.replace(/\.json$/, '');
    if (stem !== p.id) add('id-mismatch', `ファイル名 ${stem} と id ${p.id} が違う`);
    const dir = /problems\/([^/]+)\//.exec(file)?.[1];
    if (dir !== p.difficulty) add('difficulty-mismatch', `置き場 ${dir} と difficulty ${p.difficulty} が違う`);
    valid.push(p);
    for (const m of claimsCountIssues(p)) add('claims-count', m);
    for (const m of cashScopeIssues(p)) add('cash-scope', m);
    stats[p.difficulty].total++;
    stats[p.difficulty][p.anomaly ? 'anomaly' : 'normal']++;

    const company = companies.find((c) => c.id === p.companyId);
    if (!company) {
      add('unknown-company', `会社 ${p.companyId} が一覧に無い`);
      continue;
    }
    const result = verify(p, company);
    if (p.anomaly === null) {
      for (const v of result.hard) add('hard-violation', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
      for (const v of verifyIrDisplay(p, company)) add('ir-display-mismatch', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
      // 正常のカードは整合する (R-D4。第 1 版のデータでも成り立つので errors)
      const card = deriveCards(p, company, p.difficulty);
      for (const m of cardStructureIssues(card)) add('card-structure', m);
      for (const i of cardRelationIssues(card)) add('card-relation', `${i.check}: ${i.message}`);
    }
    for (const issue of anomalyIssues(p, kinds, result)) add(issue.code, issue.message);
    for (const v of result.soft) soft.push({ code: v.rule, problem: p.id, message: `${file}: ${v.message}` });
    judged.push({ p, company, result, file });
  }
  duplicates(valid.map((p) => p.id)).forEach((id) => errors.push({ code: 'duplicate-id', problem: id, message: `問題の id が重複: ${id}` }));

  // 見本: 正常な問題として検証する。プールの数には入れず、プールと同じ会社 × 期でないこと (見本が出題に混ざらない)
  const poolPairs = new Set(valid.map((p) => `${p.companyId}×${p.fiscalYear}`));
  for (const { file, value } of input.samples ?? []) {
    const sampleErrors: string[] = [];
    const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (record === null) sampleErrors.push('見本がオブジェクトでない');
    else {
      // 画面ごとの注釈 (notes) は無い (見本は正常な問題 1 つ。docs/test-cases/domain-v3.md §5 の DM2)
      sampleErrors.push(...shapeErrors(record.problem).map((m) => `problem ${m}`));
    }
    if (sampleErrors.length > 0) {
      sampleErrors.forEach((m) => errors.push({ code: 'sample-shape', message: `${file}: ${m}` }));
      continue;
    }
    const p = (record as { problem: Problem }).problem;
    const add = (code: string, message: string) => errors.push({ code, problem: p.id, message: `${file}: ${message}` });
    if (p.anomaly !== null) add('sample-anomaly', '見本は正常な問題でなければならない (anomaly が null)');
    if (valid.some((q) => q.id === p.id)) add('duplicate-id', `見本の id ${p.id} がプールの問題と同じ`);
    if (poolPairs.has(`${p.companyId}×${p.fiscalYear}`)) add('sample-overlaps-pool', `見本の会社 × 期 (${p.companyId} × ${p.fiscalYear}) がプールの問題と同じ`);
    const company = companies.find((c) => c.id === p.companyId);
    if (!company) {
      add('unknown-company', `会社 ${p.companyId} が一覧に無い`);
      continue;
    }
    const result = verify(p, company);
    for (const v of result.hard) add('hard-violation', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
    for (const v of verifyIrDisplay(p, company)) add('ir-display-mismatch', `${v.rule}: ${v.message} (${v.paths.join('、')})`);
    for (const issue of anomalyIssues(p, kinds, result)) add(issue.code, issue.message);
    // 見本は毎周の 0 社目にカードで出る (両方の難易度で共有)。問題・異変の問題と同じ検査 (主張・構造・関係・文欄の長さ) を、両方の難易度の形で当てる
    for (const m of claimsCountIssues(p)) add('claims-count', m);
    for (const m of cashScopeIssues(p)) add('cash-scope', m);
    for (const difficulty of DIFFICULTIES) {
      const q = { ...p, difficulty };
      const card = deriveCards(q, company, difficulty);
      for (const m of cardStructureIssues(card)) add('card-structure', m);
      for (const i of cardRelationIssues(card)) add('card-relation', `${i.check}: ${i.message}`);
      const long = cardTextLengthIssues(card);
      // 超えた形の難易度を付ける (--require-cards=easy / =hard が数える。難易度が無いと、どちらでも致命にならない)
      if (long.length > 0) shortfalls.push({ code: 'card-text-length', problem: p.id, difficulty, message: `${file}: 見本の文欄が ${difficulty} の形で 40 字を超える (${long.join('、')})` });
    }
    sampleCount++;
  }

  // 数が足りない
  for (const d of DIFFICULTIES) {
    const pool = valid.filter((p) => p.difficulty === d);
    const anomalies = pool.filter((p) => p.anomaly !== null);
    if (pool.length < MIN_POOL_PER_DIFFICULTY) shortfalls.push({ code: 'pool-size', difficulty: d, message: `${d}: 問題数 ${pool.length} が ${MIN_POOL_PER_DIFFICULTY} 未満` });
    const bothCount = [...new Set(pool.map((p) => p.companyId))].filter(
      (c) => pool.some((p) => p.companyId === c && p.anomaly !== null) && pool.some((p) => p.companyId === c && p.anomaly === null),
    ).length;
    if (bothCount < ROUNDS_TO_CLEAR) shortfalls.push({ code: 'both-sided-companies', difficulty: d, message: `${d}: 異変あり・なしの両方を持つ会社が ${bothCount} 社で、${ROUNDS_TO_CLEAR} 社未満` });
    // 異変の問題の割合 (anomaly-ratio) は検査しない: 出題の割合は、プールの比でなく draw の枠ごとの抽選が決める (docs/design-v2.md §1.5 R-S5 (e))
    if (anomalies.length > 0) {
      const primary = anomalies.filter((p) => {
        const kind = kinds.find((k) => k.id === p.anomaly?.kind);
        return kind !== undefined && FAMILY_DIFFICULTY[kind.family] === d && PRIMARY_FAMILIES[d].includes(kind.family);
      }).length;
      if (primary / anomalies.length < FAMILY_SHARE_MIN[d]) {
        shortfalls.push({ code: 'family-balance', difficulty: d, message: `${d}: ${PRIMARY_FAMILIES[d].join('+')} の異変が ${primary}/${anomalies.length} で、${FAMILY_SHARE_MIN[d] * 100}% 未満` });
      }
    }
  }

  cardChecks(judged, companies, kinds, valid, errors, shortfalls);
  return { errors, shortfalls, soft, stats, samples: sampleCount };
}

/** 1 問の中で、カードの語を作る主張 (営業利益・営業 CF) はちょうど 1 つ (正常・異変の全問・見本。docs/design-v3.md §1.4 R-D5。売上高の主張は使わない)。metric ごとの文。 */
function claimsCountIssues(p: Problem): string[] {
  const out: string[] = [];
  for (const metric of ['operatingIncome', 'operatingCashFlow'] as const) {
    const n = p.ir.statements.reduce((sum, s) => sum + s.claims.filter((c) => c.metric === metric).length, 0);
    if (n !== 1) out.push(`${metric} の主張が ${n} 個 (ちょうど 1 つでなければならない)`);
  }
  return out;
}

/** 資金の範囲 (notes.cashScope) は現金の標準の名前と同じ (H-04 の正常を一意にする。定期預金などを書くと、2 つの金額の差が説明できてしまう。docs/design-v2.md §2.8)。 */
function cashScopeIssues(p: Problem): string[] {
  const standard = LABELS['tanshin.balanceSheet.cash'];
  return p.tanshin.notes.cashScope === standard ? [] : [`資金の範囲 ${p.tanshin.notes.cashScope} が ${standard} と違う`];
}

/** 異変の問題の基との差 (§2.8)。base・changed の誤りは errors、無いものは shortfalls (データの Task が足す)。 */
function baseIssues(p: Problem, valid: Problem[], errors: Entry[], shortfalls: Entry[]): void {
  const a = p.anomaly;
  if (a === null) return;
  const err = (code: string, message: string): void => {
    errors.push({ code, problem: p.id, message: `${p.id}: ${message}` });
  };
  if (a.base === undefined || a.changed === undefined) {
    shortfalls.push({ code: 'card-anomaly-base', problem: p.id, difficulty: p.difficulty, message: `${p.id}: 異変に base (基の正常な問題の ID) と changed (基との差のセル) が無い` });
  }
  if (a.base === undefined) return;
  const base = valid.find((q) => q.id === a.base);
  if (base === undefined) return err('anomaly-base', `base ${a.base} の問題が無い`);
  if (base.id === p.id) return err('anomaly-base', 'base が自分自身');
  if (base.anomaly !== null) return err('anomaly-base', `base ${a.base} は異変の問題 (正常な問題でなければならない)`);
  if (base.companyId !== p.companyId) return err('anomaly-base', `base ${a.base} の会社 ${base.companyId} が違う (${p.companyId})`);
  if (base.tanshin.header.periodLabel !== p.tanshin.header.periodLabel) return err('anomaly-base', `base ${a.base} の期 ${base.tanshin.header.periodLabel} が違う (${p.tanshin.header.periodLabel})`);
  if (a.changed === undefined) return;
  const actual = new Set(changedCells(base, p));
  const claimed = new Set(a.changed);
  const missing = [...actual].filter((c) => !claimed.has(c));
  const extra = [...claimed].filter((c) => !actual.has(c));
  if (missing.length > 0 || extra.length > 0) err('anomaly-changed-mismatch', `changed が基 ${a.base} との実際の差と違う (足りない: ${missing.join('、') || 'なし'}、余計: ${extra.join('、') || 'なし'})`);
}

/** カードの検査 (design-v3 §1.5 R-S5・§2.7・§2.8・§3.2 #138)。数・作りの不足は shortfalls (コードは card- で始まる。anomaly-min-deviation も)。 */
function cardChecks(judged: { p: Problem; company: Company; result: VerifyResult }[], companies: Company[], kinds: AnomalyKind[], valid: Problem[], errors: Entry[], shortfalls: Entry[]): void {
  const short = (code: string, p: Problem | undefined, d: Difficulty, message: string) => shortfalls.push({ code, ...(p ? { problem: p.id } : {}), difficulty: d, message });
  for (const { p, company, result } of judged) {
    baseIssues(p, valid, errors, shortfalls);
    const template = deriveCards(p, company, p.difficulty, { applyEdits: false });
    // 文欄は 40 字以内。異変の問題にも当てる (異変の問題の文だけが長いと、行の数で答えが分かる。設計 §1.1)。cardEdits の問題はテンプレートのカードで見る
    const long = cardTextLengthIssues(template);
    if (long.length > 0) short('card-text-length', p, p.difficulty, `${p.id}: 文欄が 40 字を超える (${long.join('、')})`);
    if (p.ir.header.unit !== '億円') short('card-ir-unit', p, p.difficulty, `${p.id}: IR の単位が ${p.ir.header.unit} (全社 億円。R-D7)`);
    if (p.anomaly === null) {
      if (p.tier !== undefined) short('card-normal-tier', p, p.difficulty, `${p.id}: 正常な問題が tier ${p.tier} を持つ (正常な問題は段を持たない)`);
      continue;
    }
    // cardEdits を当てたカードも、数字・文の数の上限を守る (dup を持つ異変のカードは +1。設計 §1.1)。導けない編集 (RangeError) は握りつぶさず errors
    for (const m of cardEditIssues(p, company, kinds)) errors.push({ code: 'card-edit-op', problem: p.id, message: `${p.id}: ${m}` });
    let edited: ReturnType<typeof deriveCards> | undefined;
    try {
      edited = deriveCards(p, company, p.difficulty);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      errors.push({ code: 'card-edit-op', problem: p.id, message: `${p.id}: cardEdits を当てたカードを導けない (${error.message})` });
    }
    if (edited !== undefined) {
      const allowance = (p.cardEdits ?? []).some((e) => e.op === 'dup') ? 1 : 0;
      for (const m of cardLimitIssues(edited, allowance)) errors.push({ code: 'card-structure', problem: p.id, message: `${p.id}: cardEdits を当てたカード: ${m}` });
      // card-relation は、種類が許す検査だけが落ちる (設計 §1.2 の表。外が落ちたら二重の食い違い)
      const kind = kinds.find((k) => k.id === p.anomaly?.kind);
      const allowed = kind === undefined ? [] : relationAllowed(p, kind);
      const extra = cardRelationIssues(edited).filter((i) => !allowed.includes(i.check));
      if (extra.length > 0) short('card-relation-extra', p, p.difficulty, `${p.id}: 種類が許す検査 (${allowed.join('・') || 'なし'}) の外が落ちている: ${extra.map((i) => i.check).join('・')}`);
    }
    const baseProblem = p.anomaly.base === undefined ? undefined : valid.find((q) => q.id === p.anomaly?.base && q.anomaly === null && q.companyId === p.companyId);
    if (kinds.some((k) => k.id === p.anomaly?.kind)) {
      if (!isVisible(p, company, kinds, result, baseProblem)) {
        const v = cardVisibility(p, company, kinds, result, baseProblem);
        const why = v.missingPlaces.length > 0 ? `V1 カードに載らない場所 ${v.missingPlaces.join('・')}` : !v.v2 ? 'V2 主な規則の違反がカードに収まらない' : 'V3 表示が基と変わらない';
        short('card-invisible', p, p.difficulty, `${p.id}: カードに、検出に要る数字か文が載らない (${why})`);
      }
    }
    const textPlaces = p.anomaly.places.filter((pl) => pl.doc === 'ir' && 'path' in pl && /^statements\.\d+\.text$/.test(pl.path));
    if (textPlaces.length > 0) short('card-place-text', p, p.difficulty, `${p.id}: 異変の場所が ir.statements.<N>.text を指す (カードの文は claims から作り、text は読まない。場所は ir.statements.<N> で書く)`);
    const dev = deviationIssues(p, company);
    if (dev.length > 0) short('anomaly-min-deviation', p, p.difficulty, `${p.id}: ${dev.join('、')}`);
    const doubles = doubleDiscrepancies(p, company, kinds, result, baseProblem);
    if (doubles.length > 0) short('card-double-discrepancy', p, p.difficulty, `${p.id}: カードの上の食い違いが主な規則の外にもある (${doubles.join('・')})`);
  }
  for (const d of DIFFICULTIES) {
    const pool = judged.filter((j) => j.p.difficulty === d);
    if (pool.length === 0) continue;
    const anomalies = pool.filter((j) => j.p.anomaly !== null);
    const normals = pool.filter((j) => j.p.anomaly === null);
    // IR の単位が億円でない会社 (R-D7)
    for (const c of companies) if (c.irUnit !== '億円') short('card-ir-unit', undefined, d, `${d}: 会社 ${c.id} の irUnit が ${c.irUnit} (全社 億円。R-D7)`);
    // R-S5 (f): カードに出る語の向きが、正常な問題に両方出る (claims から作る語は型で 2 通り。一方の向きしか無いと、もう一方の語が出たとき必ず異変とわかる)
    const down = CLAIMS_SHOWN[d].flatMap((metric) => {
      const n = new Set(normals.filter((j) => j.p.ir.statements.some((s) => s.claims.some((c) => c.metric === metric && c.direction === 'down'))).map((j) => j.p.companyId)).size;
      return n < CLAIM_DOWN_MIN_COMPANIES[metric] ? [`${metric}: down の正常な問題を持つ会社が ${n} 社 (${CLAIM_DOWN_MIN_COMPANIES[metric]} 社以上)`] : [];
    });
    if (down.length > 0) short('card-claim-directions', undefined, d, `${d}: 正常な問題に、カードに出る語の両方の向きがそろわない (${down.join('、')})`);
    // R-S5 (b): 全社が正常な問題と異変の問題の両方を持つ (会社から答えが漏れない。(a) の 8 社以上を含む)
    const lacking = companies.flatMap((c) => [...(normals.some((j) => j.p.companyId === c.id) ? [] : [`${c.id} (正常なし)`]), ...(anomalies.some((j) => j.p.companyId === c.id) ? [] : [`${c.id} (異変なし)`])]);
    if (lacking.length > 0) short('card-company-both-sided', undefined, d, `${d}: 正常な問題か異変の問題が無い会社: ${lacking.join('、')}`);
    // R-S5 (d): どの (会社, 期) にも正常と異変の両方
    const missing: string[] = [];
    for (const pair of new Set(pool.map((j) => `${j.p.companyId}×${j.p.fiscalYear}`))) {
      const members = pool.filter((j) => `${j.p.companyId}×${j.p.fiscalYear}` === pair);
      if (!members.some((j) => j.p.anomaly === null)) missing.push(`${pair} (正常なし)`);
      if (!members.some((j) => j.p.anomaly !== null)) missing.push(`${pair} (異変なし)`);
    }
    if (missing.length > 0) short('card-company-period', undefined, d, `${d}: (会社 × 期) に、正常な問題か異変の問題が無い: ${missing.join('、')}`);
    // 段ごとに、会社どうしが持つ異変の問題の数の差が TIER_BALANCE_MAX_GAP 以内 (0 問の会社も数える。設計 §2.7)
    const gaps: string[] = [];
    for (const tier of [1, 2, 3] as const) {
      const counts = companies.map((c) => ({ id: c.id, n: anomalies.filter((j) => j.p.companyId === c.id && j.p.tier === tier).length }));
      const max = counts.reduce((a, b) => (b.n > a.n ? b : a), counts[0] ?? { id: '', n: 0 });
      const min = counts.reduce((a, b) => (b.n < a.n ? b : a), counts[0] ?? { id: '', n: 0 });
      if (max.n - min.n > TIER_BALANCE_MAX_GAP) gaps.push(`段 ${tier}: ${max.id} が ${max.n} 問・${min.id} が ${min.n} 問`);
    }
    if (gaps.length > 0) short('card-tier-balance', undefined, d, `${d}: 段ごとの会社どうしの差が ${TIER_BALANCE_MAX_GAP} 問を超える (${gaps.join('、')})`);
    // 台帳 v3 の印のある種類ごとに、異変の問題の数と、その種類を持つ会社の数 (印の無い種類は数えない)
    const ledger = kinds.filter((k) => k.ledger === 'v3' && FAMILY_DIFFICULTY[k.family] === d);
    const wrongCount: string[] = [];
    const fewCompanies: string[] = [];
    for (const k of ledger) {
      const mine = anomalies.filter((j) => j.p.anomaly?.kind === k.id);
      const want = d === 'hard' && PRIMARY_FAMILIES.hard.includes(k.family) ? KIND_PROBLEMS.heavy : KIND_PROBLEMS.default;
      if (mine.length !== want) wrongCount.push(`${k.id} (${mine.length} 問・${want} 問のはず)`);
      const n = new Set(mine.map((j) => j.p.companyId)).size;
      if (n < KIND_MIN_COMPANIES) fewCompanies.push(`${k.id} (${n} 社)`);
    }
    if (wrongCount.length > 0) short('card-kind-count', undefined, d, `${d}: 台帳の種類の異変の問題の数が決めた数と違う: ${wrongCount.join('、')}`);
    if (fewCompanies.length > 0) short('card-kind-companies', undefined, d, `${d}: 台帳の種類を持つ会社が ${KIND_MIN_COMPANIES} 社未満: ${fewCompanies.join('、')}`);
    // 問題の数 (台帳の種類の異変の問題 + 正常な問題。要件の 25 問は pool-size が別に見る)
    const counted = normals.length + anomalies.filter((j) => ledger.some((k) => k.id === j.p.anomaly?.kind)).length;
    if (counted !== CARD_POOL_SIZE[d]) short('card-pool-size', undefined, d, `${d}: 問題数 ${counted} (正常 + 台帳の種類の異変) が ${CARD_POOL_SIZE[d]} と違う`);
  }
}
