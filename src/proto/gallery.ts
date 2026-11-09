// 見え方の確認用ページ (?mode=gallery) の中身。設計 §3.2 #141-3 の E-21・E-22・E-24〜E-28 の見え方を、1 つの正常な問題から全部作る。
import type { Problem } from '../domain/types';
import { buildAnomaly } from './anomalies';
import type { CardEdit } from './cards';

export interface GalleryEntry {
  /** 見え方の名前 (「E-21 no-comma」など)。 */
  variant: string;
  kind: string;
  problem: Problem;
  edits: CardEdit[];
  places: string[];
  explanation: string;
}

/** 決めた値を順に返す乱数 (変種を指定して作るため)。 */
const fixed = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)]!;
};

const VARIANTS: { variant: string; kind: string; rng: number[] }[] = [
  { variant: 'E-21 no-comma', kind: 'E-21', rng: [0.1] },
  { variant: 'E-21 comma-shift', kind: 'E-21', rng: [0.9] },
  { variant: 'E-22 数字の欄', kind: 'E-22', rng: [0.9, 0.5] }, // 0.5 → 営業利益 (当期)
  { variant: 'E-22 見出し語', kind: 'E-22', rng: [0.1] },
  { variant: 'E-24', kind: 'E-24', rng: [] },
  { variant: 'E-25', kind: 'E-25', rng: [] },
  { variant: 'E-26 当期の欄を前期に', kind: 'E-26', rng: [0.1] },
  { variant: 'E-26 前期の欄を当期に', kind: 'E-26', rng: [0.9] },
  { variant: 'E-27 売上高', kind: 'E-27', rng: [0.0] },
  { variant: 'E-27 営業利益 (前期)', kind: 'E-27', rng: [0.4] },
  { variant: 'E-27 営業利益 (当期)', kind: 'E-27', rng: [0.7] },
  { variant: 'E-28', kind: 'E-28', rng: [] },
];

export function galleryEntries(base: Problem): GalleryEntry[] {
  return VARIANTS.map(({ variant, kind, rng }) => {
    const b = buildAnomaly(kind, base, fixed(...rng));
    return { variant, kind, problem: b.problem, edits: b.edits, places: b.places, explanation: b.explanation };
  });
}
