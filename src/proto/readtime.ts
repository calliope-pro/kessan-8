// 1 社を読む時間の測り方 (設計 §1.3・§3.2 #141-2)。目安は 1 社 60 秒以内 (責任者の決定)。
// 測るのは「カードを見せてから、判定の札を押すまでの秒数」。初見の遊び手 (集められる人数) が遊んだ記録を貼って集計する。
import type { Card, Difficulty } from './cards';

/** 設計 §1.3 の「読む量」と同じ数え方: 科目名・言い換え・数字・単位・文・見出し語。枠の外 (社名・期・期末日) は数えない。 */
export function cardChars(card: Card): number {
  const len = (s: string) => [...s].length;
  let n = card.headline ? len(`【${card.headline.text}】`) + len(card.headline.gloss) : 0;
  for (const s of card.slots) n += len(s.label) + len(s.gloss ?? '') + len(s.text) + len(s.unit);
  return n;
}

export interface ReadingRound {
  hasAnomaly: boolean;
  said: 'normal' | 'anomaly';
  seconds: number;
}

export interface Reading {
  pid: string;
  difficulty: Difficulty;
  seed: number;
  rounds: ReadingRound[];
}

const HEAD = '８期連続 試作 読む時間の記録';
const DIFF_WORD: Record<Difficulty, string> = { easy: 'やさしい', hard: 'むずかしい' };

export function readingRecord(r: Reading): string {
  return [
    HEAD,
    `参加者: ${r.pid}`,
    `難易度: ${DIFF_WORD[r.difficulty]}`,
    `種: ${r.seed}`,
    ...r.rounds.map((x, i) => `${i + 1}: ${x.hasAnomaly ? '有' : '無'} ${x.said} ${x.seconds.toFixed(1)}`),
  ].join('\n');
}

export function parseReading(text: string): Reading | null {
  const lines = text.trim().split('\n').map((l) => l.trim());
  if (lines[0] !== HEAD) return null;
  const pid = /^参加者: (.*)$/.exec(lines[1] ?? '')?.[1];
  const dw = /^難易度: (やさしい|むずかしい)$/.exec(lines[2] ?? '')?.[1];
  const seed = /^種: (\d+)$/.exec(lines[3] ?? '')?.[1];
  if (pid === undefined || !dw || !seed) return null;
  const rounds: ReadingRound[] = [];
  for (const l of lines.slice(4)) {
    const m = /^\d+: (有|無) (normal|anomaly) (\d+(?:\.\d+)?)$/.exec(l);
    if (!m) return null;
    rounds.push({ hasAnomaly: m[1] === '有', said: m[2] as 'normal' | 'anomaly', seconds: Number(m[3]) });
  }
  if (rounds.length === 0) return null;
  return { pid, difficulty: dw === 'やさしい' ? 'easy' : 'hard', seed: Number(seed), rounds };
}

export const READ_LIMIT_SEC = 60;
/** 15 分を超える秒数は、席を立った・放置した記録として数えない。 */
export const READ_MAX_SEC = 900;
const MIN_N = 5;

export interface ReadingSummary {
  difficulty: Difficulty;
  kind: 'all' | 'normal' | 'anomaly';
  n: number;
  median: number;
  max: number;
  /** 60 秒以内の割合 (0〜1)。 */
  within60: number;
  verdict: '収まる' | '超える' | '未確認';
}

export function summarizeReading(rs: readonly Reading[]): ReadingSummary[] {
  const out: ReadingSummary[] = [];
  for (const difficulty of ['easy', 'hard'] as const) {
    const mine = rs.filter((r) => r.difficulty === difficulty);
    if (mine.length === 0) continue;
    for (const kind of ['all', 'normal', 'anomaly'] as const) {
      const secs = mine
        .flatMap((r) => r.rounds)
        .filter((x) => kind === 'all' || x.hasAnomaly === (kind === 'anomaly'))
        .map((x) => x.seconds)
        .filter((s) => s > 0 && s <= READ_MAX_SEC)
        .sort((a, b) => a - b);
      const n = secs.length;
      const median = n === 0 ? 0 : n % 2 ? secs[(n - 1) / 2]! : (secs[n / 2 - 1]! + secs[n / 2]!) / 2;
      const within60 = n === 0 ? 0 : secs.filter((s) => s <= READ_LIMIT_SEC).length / n;
      const verdict = n < MIN_N ? '未確認' : median <= READ_LIMIT_SEC && within60 >= 0.9 ? '収まる' : '超える';
      out.push({ difficulty, kind, n, median, max: n === 0 ? 0 : secs[n - 1]!, within60, verdict });
    }
  }
  return out;
}

export function summaryLines(rs: readonly Reading[]): string[] {
  const names = { all: '全部', normal: '正常', anomaly: '異変' } as const;
  return summarizeReading(rs).map((s) => `${DIFF_WORD[s.difficulty]} ${names[s.kind]}: ${s.n} 社・中央値 ${s.median.toFixed(1)} 秒・最大 ${s.max.toFixed(1)} 秒・60 秒以内 ${(s.within60 * 100).toFixed(0)}% → ${s.verdict}`);
}
