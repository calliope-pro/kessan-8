// 画面のセルの種別と段 (資料の表示 ui/viewer と、検算 domain/calc.ts が共有する)。DOM を使わない。

/** セルの種別。検算は同じ種別どうしだけを比べる。 */
export type CellKind = 'money' | 'percent' | 'perShare' | 'shares' | 'text' | 'date' | 'flag';

/** 期・予実の段。検算の向き (序列の高い方 − 低い方) に使う: 前期 < 当期・実績 < 予想。 */
export type Stage = 'previous' | 'current' | 'forecast' | 'actual';
