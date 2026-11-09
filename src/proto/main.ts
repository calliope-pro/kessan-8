// 縦の試作の入口 (proto.html)。外部への通信はしない。
//   ?mode=play (既定)  : 遊び (0 社目 → 8 枚 → 判定 → 答え合わせ → 間違えたら 0 社目)。&difficulty=easy|hard
//   ?mode=gallery      : 見え方の一覧 (E-21・E-22・E-24〜E-28。設計 §3.2 #141-3)
//   ?mode=read         : 1 社を読む時間を測る (設計 §3.2 #141-2)。&difficulty=hard &pid=<記号>
//   ?mode=read-summary : 読む時間の記録を貼って集計する
//   ?mode=test         : 正常を覚えられるかの確かめ (plans.md §8.1)。&sample=on|off &pid=<記号>
//   ?mode=summary      : 確かめの記録を貼って集計する
//   ?measure=1         : 320 px・7 桁・18 px の測定用
//   ?seed=N            : 出題の再現
import './proto.css';
import type { Company, Problem } from '../domain/types';
import type { Sample } from '../domain/sample';
import type { Difficulty } from './cards';
import { mountGallery } from './ui/gallery';
import { mountGame } from './ui/game';
import { mountMeasure } from './ui/measure';
import { mountPlaytest } from './ui/playtest';
import { mountReadSummary, mountReadtime } from './ui/readtime';
import { mountSummary } from './ui/summary';

// 試作は正常な問題だけを使う (やさしい 12・むずかしい 16)。異変は、正常な問題の複製に 1 つ加えて作る
const problems = Object.values(import.meta.glob<Problem>('../data/problems/*/*.json', { eager: true, import: 'default' }));
const companies = Object.values(import.meta.glob<Company[]>('../data/companies.json', { eager: true, import: 'default' }))[0]!;
const sample = Object.values(import.meta.glob<Sample>('../data/samples/*.json', { eager: true, import: 'default' }))[0];
const q = new URLSearchParams(location.search);
const normals = problems.filter((p) => p.anomaly === null);
const difficulty: Difficulty = q.get('difficulty') === 'hard' ? 'hard' : 'easy';
const root = document.getElementById('root')!;
document.title = '８期連続 (試作)';

const seedParam = q.get('seed');
const seed = seedParam !== null && /^\d{1,9}$/.test(seedParam) ? Number(seedParam) : Math.floor(Math.random() * 1e9);

if (!sample) throw new Error('見本がありません');
const pid = (q.get('pid') ?? '').slice(0, 20);
if (q.get('measure') === '1') mountMeasure(root, normals.filter((p) => p.difficulty === 'easy'), companies);
else if (q.get('mode') === 'summary') mountSummary(root);
else if (q.get('mode') === 'gallery') mountGallery(root, normals.filter((p) => p.difficulty === 'easy'), companies);
else if (q.get('mode') === 'read-summary') mountReadSummary(root);
else if (q.get('mode') === 'read') mountReadtime(root, { normals, companies, sample: sample.problem, seed, difficulty: q.get('difficulty') === 'easy' ? 'easy' : 'hard', pid });
else if (q.get('mode') === 'test') {
  mountPlaytest(root, { normals: normals.filter((p) => p.difficulty === 'easy'), companies, sample: sample.problem, seed, withSample: q.get('sample') !== 'off', pid });
} else mountGame(root, { normals, companies, sample: sample.problem, seed, difficulty });
