// 画面に出す言葉の全部 (docs/screens-v3.md §5・docs/test-cases/screens-v3.md U4)。画面の部品はここから読む。
// 使わない語: 印・バグ・エラー・採点・検算・閲覧票・失敗・ラウンド・ステージ (GLOSSARY.md)。
export const MESSAGES = {
  title: '８期連続',
  tagline: '決算の“いつも通り”を覚えて、異変を見つけよう',
  difficulty: { easy: 'やさしい', hard: 'むずかしい' },
  difficultyNote: { easy: '会計を知らなくても', hard: '決算短信と IR を見比べる' },
  unavailable: '準備中',
  allUnavailable: '準備中です',
  best: '最高 {n} 社目',
  records: '記録',
  back: '戻る',
  change: '難易度を変える',
  seal: { normal: 'いつも通り', anomaly: '異変あり' },
  sample: {
    heading: '0 社目 (見本)',
    bulletin: 'これがいつも通り。ずれたら異変',
    example: '記入例',
    start: '1 社目へ',
    lastAnomaly: 'さっきの異変: {text}',
    lastNone: 'さっきは異変がありませんでした',
  },
  progress: { n: '{n} 社目 / あと {rest} 社', last: '{n} 社目 / ラスト' },
  result: { ok: '正解', ng: '不正解', none: '異変はありませんでした。', tag: '異変' },
  ghost: 'ここに「{label}」の欄があるはずです',
  next: '次へ',
  toCleared: '完了票へ',
  sentBack: '差し戻し',
  quick: 'すぐ 0 社目へ',
  cleared: {
    heading: '完了',
    done: '8 社連続で、点検を通りました。',
    found: '見つけた異変 {n} / {N}',
    added: '今回 + {k}',
    suggestHard: 'つぎは「むずかしい」へ',
    again: 'もう一度',
    other: '別の難易度',
  },
  recordsScreen: {
    heading: '記録',
    never: 'まだ遊んでいません。8 社連続で正解するとクリアです',
    clears: 'クリア {k} 回',
    unknown: '？',
  },
  notSaved: 'この端末では記録を保存できません',
  card: { label: '{name} の決算カード', docs1: '資料 1　決算短信のまとめ', docs2: '資料 2　IR のひとこと' },
  blocks: { pl: '損益', bs: '貸借 (当期末)', cf: 'キャッシュ・フロー', notes: '注記', ir: 'IR のひとこと' },
  gloss: {
    sales: '売れた金額',
    opPrev: '売上高から費用を引いた残り',
    margin: 'もうけの割合',
    headline: { 増益: 'もうけが増えた', 減益: 'もうけが減った', 増収: '売上が増えた', 減収: '売上が減った' } as Record<string, string>,
  },
  periodEnd: '期末 {date}',
};

type Msg = string | { [k: string]: Msg };
/** 文字列を全部取り出す (U4 が禁じる語を当てる)。 */
export function flattenMessages(m: Msg): string[] {
  return typeof m === 'string' ? [m] : Object.values(m).flatMap(flattenMessages);
}

/** `{n}` などを埋める。 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

/** 「n 社目 / あと N 社」(n = 1〜8。8 社目は「ラスト」)。範囲外は空。 */
export function progressText(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 8) return '';
  return n === 8 ? fill(MESSAGES.progress.last, { n }) : fill(MESSAGES.progress.n, { n, rest: 9 - n });
}
