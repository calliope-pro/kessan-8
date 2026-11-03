// 本番の問題・会社・異変の種類・見本の取り込み (Vite の import.meta.glob)。問題 (Task #25・#26)・会社と異変の種類 (#24)・見本 (samples/) が置かれると、ここに入る。
// 置かれていないあいだは空 (画面は「準備中」を出す)。E2E の `npm run build:e2e` は、vite.config.ts がこのファイルを src/testing/pool-source.e2e.ts に差し替える。
import type { Sample } from '../domain/sample';
import type { AnomalyKind, Company, Problem } from '../domain/types';

const first = <T>(modules: Record<string, T>): T | undefined => Object.values(modules)[0];

export const problems: Problem[] = Object.values(import.meta.glob<Problem>('./problems/**/*.json', { eager: true, import: 'default' }));
export const companies: Company[] = first(import.meta.glob<Company[]>('./companies.json', { eager: true, import: 'default' })) ?? [];
export const kinds: AnomalyKind[] = first(import.meta.glob<AnomalyKind[]>('./anomaly-kinds.json', { eager: true, import: 'default' })) ?? [];
// 見本は src/data/samples/*.json (検証器 npm run verify:data と同じ置き場)。両方の難易度で共有するので、最初の 1 件を読む
export const sample: Sample | undefined = first(import.meta.glob<Sample>('./samples/*.json', { eager: true, import: 'default' }));
