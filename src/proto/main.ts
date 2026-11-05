// 縦の試作の入口 (proto.html)。外部への通信はしない。
//   ?mode=play (既定)  : 遊び (0 社目 → 8 枚 → 判定 → 答え合わせ → 間違えたら 0 社目)
//   ?mode=test         : 正常を覚えられるかの確かめ (plans.md §8.1)。&shape=E1|E3 &sample=on|off &pid=<記号>
//   ?measure=1         : 320 px・7 桁・18 px の測定用
//   ?seed=N            : 出題の再現
import './proto.css';
import { companies, problems, sample } from '../data/pool-source';
import { SHAPES, type ShapeId } from './cards';
import { mountGame } from './ui/game';
import { mountMeasure } from './ui/measure';
import { mountPlaytest } from './ui/playtest';

const q = new URLSearchParams(location.search);
const normals = problems.filter((p) => p.difficulty === 'easy' && p.anomaly === null);
const root = document.getElementById('root')!;
document.title = '８期連続 (試作)';

const seedParam = q.get('seed');
const seed = seedParam !== null && /^\d{1,9}$/.test(seedParam) ? Number(seedParam) : Math.floor(Math.random() * 1e9);

if (!sample) throw new Error('見本がありません');
if (q.get('measure') === '1') mountMeasure(root, normals, companies);
else if (q.get('mode') === 'test') {
  const s = q.get('shape') as ShapeId | null;
  mountPlaytest(root, {
    normals, companies, sample: sample.problem, seed,
    shape: s && SHAPES.includes(s) ? s : 'E1',
    withSample: q.get('sample') !== 'off',
    pid: (q.get('pid') ?? '').slice(0, 20),
  });
} else mountGame(root, { normals, companies, sample: sample.problem, seed });
