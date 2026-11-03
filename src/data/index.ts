// 問題データの入口 (docs/design.md §4.3): 全件を取り込み、難易度ごとのプールにする。
import { makePools } from '../domain/pool';
import { companies, kinds, problems, sample } from './pool-source';

export const pools = makePools(problems);
export { companies, kinds, sample };
