// 確かめの集計の画面 (?mode=summary): 参加者の「記録をコピー」の文を貼ると、5 人ぶんの合否と判定 (plans.md §8.1・Q17) を出す。
import { aggregate, parseRecord, splitRecords, type ParsedRecord } from '../playtest';
import { h, screenHeading } from './dom';

export function summaryText(text: string): string {
  const parsed = splitRecords(text).map(parseRecord);
  const records = parsed.filter((r): r is ParsedRecord => r !== null);
  const broken = parsed.length - records.length;
  if (records.length === 0) return '記録が読めません。参加者の「記録をコピー」の文を、そのまま貼ってください。';
  const a = aggregate(records);
  const lines = [
    `判定: ${a.verdict} (合格 ${a.passed} / ${a.n} 人。基準: 0 社目ありの条件で、見つけ 3/4 以上かつ誤り 1/4 以下)`,
    a.n >= 5 ? '(5 人は方向の確認で、統計的な結論ではない)' : `(${a.n} 人: 5 人に満たないので、全員合格なら「弱い合図」、それ以外は「未確認」)`,
    '',
    '人 | 0 社目 | 形 | 種 | 見つけ | 誤り | 合否',
    ...records.map((r) => `${r.pid || '(未記入)'} | ${r.withSample ? 'あり' : 'なし'} | ${r.shape} | ${r.seed} | ${r.found}/${r.anomalies} | ${r.falseAlarms}/${r.normals} | ${r.pass ? '合格' : '不合格'}`),
  ];
  if (a.aux.length > 0) {
    lines.push('', '補助 (同じ人の 0 社目あり − なし の見つけ数):');
    for (const x of a.aux) lines.push(`${x.pid}: あり ${x.foundWith} − なし ${x.foundWithout} = ${x.diff >= 0 ? '+' : ''}${x.diff}${x.ceiling ? ' (天井: 両方 4/4。「効かない」に数えない)' : ''}`);
  }
  if (broken > 0) lines.push('', `読めなかった記録: ${broken} 件`);
  return lines.join('\n');
}

export function mountSummary(root: HTMLElement): void {
  const input = h('textarea', { class: 'record', 'aria-label': '貼る記録', rows: 10, placeholder: '参加者の「記録をコピー」の文を、続けて貼る' });
  const out = h('pre', { class: 'record out', 'aria-live': 'polite' });
  const run = h('button', { type: 'button', class: 'seal primary' }, h('span', {}, '集計する'));
  run.addEventListener('click', () => { out.textContent = summaryText(input.value); });
  root.replaceChildren(
    h('div', { class: 'stage' },
      h('header', { class: 'checks' }, screenHeading('確かめの集計')),
      h('main', { class: 'desk' }, h('p', { class: 'lead' }, '参加者ごとの記録を貼ってください。'), input, out),
      h('footer', { class: 'actions single' }, run)),
  );
}
