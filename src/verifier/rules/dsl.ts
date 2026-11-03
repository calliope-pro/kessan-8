// 規則を短く書くための道具。1 つの式の 1 回の評価 (1 期・1 セグメントなど) が、読んだセルを paths に記録する。
import type { Company, DocKind, Problem } from '../../domain/types.ts';
import { getPath } from '../path.ts';

export interface Violation {
  rule: string;
  /** `<doc>.<path>`。食い違った式が読んだセル。 */
  paths: string[];
  message: string;
}

export interface Ctx {
  p: Problem;
  c: Company;
}

export interface Rule {
  id: string;
  check: (ctx: Ctx) => Violation[];
}

/** 1 回の評価。読んだセルを記録し、数値でなければ NaN (どんな比較も偽になる) を返す。 */
export class Reader {
  readonly used: string[] = [];
  readonly ctx: Ctx;
  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }
  get(doc: DocKind, path: string): number {
    this.used.push(`${doc}.${path}`);
    const v = getPath(this.ctx.p, doc, path);
    return typeof v === 'number' ? v : Number.NaN;
  }
  /** 数値でない値を読む (paths に残す)。 */
  raw(doc: DocKind, path: string): unknown {
    this.used.push(`${doc}.${path}`);
    return getPath(this.ctx.p, doc, path);
  }
  t = (path: string): number => this.get('tanshin', path);
  i = (path: string): number => this.get('ir', path);
}

/** 評価の結果: null = 満たす、文字列 = 食い違いのメッセージ。 */
export type Outcome = string | null;

export type Each = (evaluate: (r: Reader) => Outcome) => void;

/** 規則を作る。body は each(...) で評価を何回か行う。 */
export function rule(id: string, body: (each: Each, ctx: Ctx) => void): Rule {
  return {
    id,
    check: (ctx) => {
      const out: Violation[] = [];
      const each: Each = (evaluate) => {
        const r = new Reader(ctx);
        const message = evaluate(r);
        if (message !== null) out.push({ rule: id, paths: r.used, message });
      };
      body(each, ctx);
      return out;
    },
  };
}

export const eq = (name: string, left: number, right: number): Outcome => (left === right ? null : `${name}: ${left} ≠ ${right}`);

/** 満たさない最初のメッセージ (すべて満たせば null)。 */
export const all = (...outcomes: Outcome[]): Outcome => outcomes.find((o) => o !== null) ?? null;

export const PERIODS = ['previous', 'current'] as const;

export const sum = (...xs: number[]): number => xs.reduce((a, b) => a + b, 0);
