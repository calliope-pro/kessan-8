// 検算の表示の行 (差・比)。数値は domain/calc.ts、文字にする書式は ui/format.ts の 1 か所。比べられる組は 2 行、比べられない組は 1 行。
import type { CalcResult } from '../../domain/calc';
import { EMPTY_MARK, formatCount, formatMoney, formatPerShare, formatPoints } from '../format';

export function calcLines(r: CalcResult): string[] {
  if (!r.comparable) return [r.reason === 'unit' ? '比べられない (単位が違う)' : '比べられない (数字ではない)'];
  const diff =
    r.kind === 'percent' ? formatPoints(r.diff, r.digits)
    : r.kind === 'perShare' ? formatPerShare(r.diff)
    : r.kind === 'shares' ? formatCount(r.diff)
    : formatMoney(r.diff, { digits: r.digits });
  const ratio = r.ratio === null ? EMPTY_MARK : formatMoney(r.ratio, { digits: 2 });
  return [`差 ${diff}`, `比 ${ratio}`];
}
