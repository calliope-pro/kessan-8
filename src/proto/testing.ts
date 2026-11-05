// 試作のテストの共通の材料: 本番の問題データから、やさしい・正常な問題と会社を取り出す。
import { companies, problems } from '../data/pool-source';
import type { Company, Problem } from '../domain/types';

export const COMPANIES: Company[] = companies;
export const NORMALS: Problem[] = problems.filter((p) => p.difficulty === 'easy' && p.anomaly === null);

export function companyOf(p: Problem): Company {
  const c = COMPANIES.find((x) => x.id === p.companyId);
  if (!c) throw new Error(`会社がありません: ${p.companyId}`);
  return c;
}
