// 画面を作る道具: 問題から値を引き、書式を当てて ViewCell・ViewRow を作る。DOM を使わない。
import type { CellKind, Stage } from '../../domain/cell';
import { itemKey, LABELS } from '../../domain/labels';
import type { DocKind, Problem } from '../../domain/types';
import { formatCount, formatDate, formatFlag, formatMoney, formatPercent, formatPerShare } from '../format';
import type { CellValue, ViewCell, ViewColumn, ViewRow, ViewSection } from './types';

const KIND_UNIT: Partial<Record<CellKind, string>> = { percent: '%', perShare: '円', shares: '千株' };

export class Ctx {
  /** 次のセルの表示の順。 */
  private order = 0;

  constructor(
    readonly p: Problem,
    readonly doc: DocKind,
    readonly screen: string,
  ) {}

  get root(): Problem['tanshin'] | Problem['ir'] {
    return this.doc === 'tanshin' ? this.p.tanshin : this.p.ir;
  }

  /** 資料のデータの単位 (header.unit)。金額の小数の桁を決める。 */
  get dataUnit(): string {
    return this.root.header.unit;
  }

  /** 画面の単位の表示 (unitOverrides の後)。 */
  get displayUnit(): string {
    return this.p.unitOverrides?.[`${this.doc}.${this.screen}`] ?? this.dataUnit;
  }

  at(path: string): unknown {
    return path.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), this.root);
  }

  /** path のセル。値の場所が問題に無ければ null。nullText = 値が null のときの文字。 */
  cell(path: string, kind: CellKind, stage: Stage | null = null, nullText?: string): ViewCell | null {
    const raw = this.at(path);
    if (raw === undefined) return null;
    const value: CellValue = raw as CellValue;
    const full = `${this.doc}.${path}`;
    const sign = this.p.signOverrides?.[full];
    const opts = sign === undefined ? {} : { sign };
    let text: string;
    if (value === null) text = nullText ?? '－';
    else if (kind === 'money') text = formatMoney(value as number, { ...opts, unit: this.dataUnit });
    else if (kind === 'percent') text = formatPercent(value as number, opts);
    else if (kind === 'perShare') text = formatPerShare(value as number, opts);
    else if (kind === 'shares') text = formatCount(value as number, opts);
    else if (kind === 'date') text = formatDate(String(value));
    else if (kind === 'flag') text = formatFlag(Boolean(value));
    else text = String(value);
    return {
      path: full,
      itemKey: itemKey(this.doc, path),
      value,
      text,
      kind,
      unit: kind === 'money' ? this.displayUnit : (KIND_UNIT[kind] ?? null),
      stage,
      order: this.order++,
    };
  }

  /** cell() の、場所が必ずある版。 */
  need(path: string, kind: CellKind, stage: Stage | null = null, nullText?: string): ViewCell {
    const c = this.cell(path, kind, stage, nullText);
    if (!c) throw new Error(`資料に無い場所: ${this.doc}.${path}`);
    return c;
  }

  /** 行の名前 (labelOverrides があればそれ、無ければ標準)。 */
  label(key: string): string {
    return this.p.labelOverrides?.[key] ?? LABELS[key] ?? key;
  }

  row(path: string, cells: (ViewCell | null)[], emphasis = false): ViewRow {
    const key = itemKey(this.doc, path);
    return { itemKey: key, label: this.label(key), emphasis, cells };
  }

  header() {
    const unitPath = `${this.screen}.unit`;
    const overridden = this.p.unitOverrides?.[`${this.doc}.${this.screen}`];
    const unit = this.need('header.unit', 'text');
    const shown: ViewCell = overridden === undefined ? unit : { ...unit, path: `${this.doc}.${unitPath}`, itemKey: itemKey(this.doc, unitPath), value: overridden, text: overridden };
    return {
      companyName: this.need('header.companyName', 'text'),
      securitiesCode: this.need('header.securitiesCode', 'text'),
      periodLabel: this.need('header.periodLabel', 'text'),
      unit: shown,
    };
  }
}

export const col = (label: string, cell: ViewCell | null = null): ViewColumn => ({ label, cell });

/** 節。行のセルは列の数まで null で埋める。 */
export const plain = (columns: ViewColumn[], rows: ViewRow[], title: string | null = null, titleCell: ViewCell | null = null): ViewSection => ({
  title,
  titleCell,
  columns,
  rows: rows.map((r) => ({ ...r, cells: Array.from({ length: columns.length }, (_, i) => r.cells[i] ?? null) })),
});

/** 見出しのない 1 列の節 (文字・日付の行など)。 */
export const single = (rows: ViewRow[], title: string | null = null, label = ''): ViewSection => plain([col(label)], rows, title);
