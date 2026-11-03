// 資料束の画面の中身を作る純粋な関数 (DOM を使わない)。docs/test-cases/viewer.md §0・§2。
import type { DocKind, IrSlideId, Problem, TanshinScreenId } from '../../domain/types';
import { IR_SLIDES, TANSHIN_SCREENS } from '../../domain/types';
import type { ScreenRef } from '../../domain/screen';
import { Ctx } from './context';
import { buildIr } from './ir-screens';
import { buildTanshin } from './tanshin-screens';
import type { ViewScreen } from './types';

export type { ViewCell, ViewChart, ViewColumn, ViewRow, ViewScreen, ViewSection } from './types';

/** 10 画面の通し順 (短信 5 → IR 5)。ページ送りはこの順。 */
export const SCREEN_ORDER: readonly ScreenRef[] = [
  ...TANSHIN_SCREENS.map((screen): ScreenRef => ({ doc: 'tanshin', screen })),
  ...IR_SLIDES.map((screen): ScreenRef => ({ doc: 'ir', screen })),
];

const TITLES: Record<string, [title: string, tab: string]> = {
  'tanshin.summary': ['サマリー', 'サマリー'],
  'tanshin.balanceSheet': ['連結貸借対照表', '貸借'],
  'tanshin.incomeStatement': ['連結損益計算書', '損益'],
  'tanshin.cashFlow': ['連結キャッシュ・フロー計算書', 'CF'],
  'tanshin.notes': ['注記', '注記'],
  'ir.highlights': ['ハイライト', '要点'],
  'ir.results': ['業績', '業績'],
  'ir.segments': ['セグメント別の状況', '事業別'],
  'ir.outlook': ['今後の見通し', '見通し'],
  'ir.supplement': ['補足資料', '補足'],
};

/** ページ名 (SC4-3)。 */
export function screenTitle(ref: ScreenRef): string {
  return TITLES[`${ref.doc}.${ref.screen}`]![0];
}

/** タブの短い名前 (5 文字以内)。 */
export function tabLabel(ref: ScreenRef): string {
  return TITLES[`${ref.doc}.${ref.screen}`]![1];
}

/** 1 画面の中身。問題のデータだけから作り、異変の有無・場所は読まない。 */
export function buildScreen(problem: Problem, doc: 'tanshin', screen: TanshinScreenId): ViewScreen;
export function buildScreen(problem: Problem, doc: 'ir', screen: IrSlideId): ViewScreen;
export function buildScreen(problem: Problem, doc: DocKind, screen: string): ViewScreen;
export function buildScreen(problem: Problem, doc: DocKind, screen: string): ViewScreen {
  const ctx = new Ctx(problem, doc, screen);
  const title = screenTitle({ doc, screen } as ScreenRef);
  if (doc === 'tanshin') return buildTanshin(ctx, screen as TanshinScreenId, title);
  return buildIr(ctx, screen as IrSlideId, title);
}
