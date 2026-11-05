// データ全件の検証 (ケース表 §2.8)。errors = 致命、shortfalls = 数が足りない (完成の段階で効く)、soft = 参考の規則。
import { CLAIMS_SHOWN, CLAIM_DOWN_MIN_COMPANIES, FAMILY_SHARE_MIN, MIN_POOL_PER_DIFFICULTY, ROUNDS_TO_CLEAR } from '../domain/config.ts';
import { deriveCards, shapesOf } from '../domain/cards.ts';
import { FAMILY_DIFFICULTY, IR_SLIDES, TANSHIN_SCREENS } from '../domain/types.ts';
import type { AnomalyKind, Company, Difficulty, Problem, ShapeId } from '../domain/types.ts';
import { anomalyIssues } from './anomaly.ts';
import { cardLimitIssues, cardRelationIssues, cardStructureIssues, cardTextLengthIssues, deviationIssues, doubleDiscrepancies, shapeChecks, visibleShapes } from './cards.ts';
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
  /** 見本 (samples/*.json)。`{ problem, notes }`。正常な問題として検証するが、プールには入れない。 */
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
      // 正常のカードはどの形でも整合する (R-D4。第 1 版のデータでも成り立つので errors)
      for (const shape of shapesOf(p.difficulty)) {
        const cards = deriveCards(p, company, shape);
        for (const m of cardStructureIssues(cards, shape)) add('card-structure', m);
        for (const m of cardRelationIssues(cards, shape, { company, statements: p.ir.statements })) add('card-relation', m);
      }
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
      const notes = record.notes;
      if (typeof notes !== 'object' || notes === null || Array.isArray(notes) || Object.values(notes).some((v) => typeof v !== 'string')) sampleErrors.push('notes: 文字列の record でない');
      else {
        const screens: readonly string[] = [...TANSHIN_SCREENS, ...IR_SLIDES];
        for (const key of Object.keys(notes)) if (!screens.includes(key)) sampleErrors.push(`notes: ${key} は画面の ID でない`);
      }
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
    for (const difficulty of DIFFICULTIES) {
      const q = { ...p, difficulty };
      const long: string[] = [];
      for (const shape of shapesOf(difficulty)) {
        const cards = deriveCards(q, company, shape);
        for (const m of cardStructureIssues(cards, shape)) add('card-structure', m);
        for (const m of cardRelationIssues(cards, shape, { company, statements: p.ir.statements })) add('card-relation', m);
        long.push(...cardTextLengthIssues(cards));
      }
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

/** 1 問の中で、カードの語を作る主張 (売上高・営業利益・営業 CF) はちょうど 1 つ (正常・異変の全問・見本。docs/design-v2.md §1.2 R-D5)。metric ごとの文。 */
function claimsCountIssues(p: Problem): string[] {
  const out: string[] = [];
  for (const metric of ['netSales', 'operatingIncome', 'operatingCashFlow'] as const) {
    const n = p.ir.statements.reduce((sum, s) => sum + s.claims.filter((c) => c.metric === metric).length, 0);
    if (n !== 1) out.push(`${metric} の主張が ${n} 個 (ちょうど 1 つでなければならない)`);
  }
  return out;
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

/** カードの検査 (design-v2 §1.5 R-S5 (a)〜(d)・§2.7・§2.8)。数・作りの不足は shortfalls (コードは card- で始まる。anomaly-min-deviation も)。 */
function cardChecks(judged: { p: Problem; company: Company; result: VerifyResult }[], companies: Company[], kinds: AnomalyKind[], valid: Problem[], errors: Entry[], shortfalls: Entry[]): void {
  const short = (code: string, p: Problem | undefined, d: Difficulty, message: string) => shortfalls.push({ code, ...(p ? { problem: p.id } : {}), difficulty: d, message });
  const visible = new Map<string, ShapeId[]>();
  for (const { p, company, result } of judged) {
    baseIssues(p, valid, errors, shortfalls);
    // 文欄は 40 字以内。異変の問題にも当てる (異変の問題の文だけが長いと、行の数で答えが分かる。設計 §1.1)。cardEdits の問題はテンプレートのカードで見る
    const long = shapesOf(p.difficulty).flatMap((shape) => cardTextLengthIssues(deriveCards(p, company, shape, { applyEdits: false })));
    if (long.length > 0) short('card-text-length', p, p.difficulty, `${p.id}: 文欄が 40 字を超える (${long.join('、')})`);
    if (p.anomaly === null) continue;
    // cardEdits を当てたカードも、数字・文の数の上限を守る (E-22 の欄の重複は E3 だけ)
    for (const shape of new Set((p.cardEdits ?? []).map((e) => e.shape))) {
      if (!shapesOf(p.difficulty).includes(shape)) continue;
      try {
        for (const m of cardLimitIssues(deriveCards(p, company, shape), shape)) errors.push({ code: 'card-structure', problem: p.id, message: `${p.id}: cardEdits を当てたカード: ${m}` });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
    let shapes: ShapeId[] = [];
    try {
      shapes = visibleShapes(p, company, kinds, result);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
    visible.set(p.id, shapes);
    if (shapes.length === 0 && kinds.some((k) => k.id === p.anomaly?.kind)) {
      let why = '';
      try {
        why = shapeChecks(p, company, kinds, result).map((c) => `${c.shape}: ${c.missingPlaces.length > 0 ? `V1 カードに載らない場所 ${c.missingPlaces.join('・')}` : 'V2 主な規則の違反がカードに収まらない'}`).join(' / ');
      } catch {
        why = 'cardEdits が導けない';
      }
      short('card-invisible', p, p.difficulty, `${p.id}: どの形のカードにも、検出に要る数字か文が載らない (${why})`);
    }
    const textPlaces = p.anomaly.places.filter((pl) => pl.doc === 'ir' && 'path' in pl && /^statements\.\d+\.text$/.test(pl.path));
    if (textPlaces.length > 0) short('card-place-text', p, p.difficulty, `${p.id}: 異変の場所が ir.statements.<N>.text を指す (カードの文は claims から作り、text は読まない。場所は ir.statements.<N> で書く)`);
    const dev = deviationIssues(p, company);
    if (dev.length > 0) short('anomaly-min-deviation', p, p.difficulty, `${p.id}: ${dev.join('、')}`);
    const doubles = shapes.length > 0 ? doubleDiscrepancies(p, company, kinds, result) : [];
    if (doubles.length > 0) short('card-double-discrepancy', p, p.difficulty, `${p.id}: カードの上の食い違いが主な規則の外にもある (${doubles.map((x) => `${x.shape}: ${x.rules.join('・')}`).join(' / ')})`);
  }
  for (const d of DIFFICULTIES) {
    const pool = judged.filter((j) => j.p.difficulty === d);
    if (pool.length === 0) continue;
    const anomalies = pool.filter((j) => j.p.anomaly !== null);
    const normals = pool.filter((j) => j.p.anomaly === null);
    const seenIn = (j: { p: Problem }, shape: ShapeId) => visible.get(j.p.id)?.includes(shape) === true;
    for (const shape of shapesOf(d)) {
      const sees = anomalies.filter((j) => seenIn(j, shape));
      const companiesSeen = new Set(sees.map((j) => j.p.companyId));
      if (companiesSeen.size < ROUNDS_TO_CLEAR) short('card-shape-companies', undefined, d, `${d}: 形 ${shape} で見える異変の問題を持つ会社が ${companiesSeen.size} 社で、${ROUNDS_TO_CLEAR} 社未満`);
      const kindsSeen = new Set(sees.map((j) => j.p.anomaly?.kind));
      if (kindsSeen.size < 4) short('card-shape-kinds', undefined, d, `${d}: 形 ${shape} で見える異変の種類が ${kindsSeen.size} 種類で、4 種類未満`);
    }
    // R-S5 (f): カードに出る語の向きが、正常な問題に両方出る (claims から作る語は型で 2 通り。一方の向きしか無いと、もう一方の語が出たとき必ず異変とわかる)
    const down = CLAIMS_SHOWN[d].flatMap((metric) => {
      const n = new Set(normals.filter((j) => j.p.ir.statements.some((s) => s.claims.some((c) => c.metric === metric && c.direction === 'down'))).map((j) => j.p.companyId)).size;
      return n < CLAIM_DOWN_MIN_COMPANIES[metric] ? [`${metric}: down の正常な問題を持つ会社が ${n} 社 (${CLAIM_DOWN_MIN_COMPANIES[metric]} 社以上)`] : [];
    });
    if (down.length > 0) short('card-claim-directions', undefined, d, `${d}: 正常な問題に、カードに出る語の両方の向きがそろわない (${down.join('、')})`);
    const lacking: string[] = [];
    for (const c of companies) {
      for (const shape of shapesOf(d)) {
        if (!normals.some((j) => j.p.companyId === c.id)) lacking.push(`${c.id}×${shape} (正常なし)`);
        else if (!anomalies.some((j) => j.p.companyId === c.id && seenIn(j, shape))) lacking.push(`${c.id}×${shape} (異変なし)`);
      }
    }
    if (lacking.length > 0) short('card-shape-both-sided', undefined, d, `${d}: 会社 × 形のうち、正常な問題か、その形で見える異変の問題が無い: ${lacking.join('、')}`);
    const pairs = [...new Set(pool.map((j) => `${j.p.companyId}×${j.p.fiscalYear}`))];
    const missing: string[] = [];
    for (const pair of pairs) {
      const members = pool.filter((j) => `${j.p.companyId}×${j.p.fiscalYear}` === pair);
      if (!members.some((j) => j.p.anomaly === null)) missing.push(`${pair} (正常なし)`);
      for (const shape of shapesOf(d)) if (!members.some((j) => j.p.anomaly !== null && seenIn(j, shape))) missing.push(`${pair}×${shape} (異変なし)`);
    }
    if (missing.length > 0) short('card-company-period', undefined, d, `${d}: (会社 × 期) に、正常な問題か、形ごとの見える異変の問題が無い: ${missing.join('、')}`);
  }
}
