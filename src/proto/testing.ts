// 試作のテストの共通の材料: やさしい・正常な問題 12 問 (v1 の本番データ。commit 35d6c9d の src/data/problems/easy の正常な問題) と、会社。
// 試作 (E1・E2・E3 の 3 形) は v2 の形を前提にしたテストで、本番のデータが v3 (形 1 つ・85 問) に作り直されたあとも、同じ材料で通す。
// 試作は #184 (試作 v3) が作り直す。そのとき、この材料も一緒に捨てる。
import { companies } from '../data/pool-source';
import type { Sample } from '../domain/sample';
import type { Company, Problem } from '../domain/types';

export const COMPANIES: Company[] = companies;
export const NORMALS: Problem[] = Object.entries(import.meta.glob<Problem>('./fixtures/normals/*.json', { eager: true, import: 'default' }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, p]) => p);

const sampleFile = Object.values(import.meta.glob<Sample>('../data/samples/*.json', { eager: true, import: 'default' }))[0];
if (!sampleFile) throw new Error('見本がありません');
/** 0 社目に見せる見本 (アプリ本体 main.ts と同じ 1 件)。 */
export const SAMPLE: Problem = sampleFile.problem;

export function companyOf(p: Problem): Company {
  const c = COMPANIES.find((x) => x.id === p.companyId);
  if (!c) throw new Error(`会社がありません: ${p.companyId}`);
  return c;
}
