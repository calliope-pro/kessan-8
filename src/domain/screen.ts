// 資料束の 1 画面 (決算短信の 5 画面か、IR スライドの 5 画面)。保存する状態 (走行の見ている画面) の型なので domain に置く。
// 資料束の表示 (ui/viewer-port.ts) は、これを再エクスポートして使う。
import type { IrSlideId, TanshinScreenId } from './types';

export type ScreenRef = { doc: 'tanshin'; screen: TanshinScreenId } | { doc: 'ir'; screen: IrSlideId };
