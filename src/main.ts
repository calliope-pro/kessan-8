// 入口。問題・会社・見本を読み、画面 (src/ui/app.ts) を立てる。外部への通信はしない。
import './styles/app.css';
import { companies, kinds, pools, sample } from './data';
import type { KeyValueStore } from './domain/records';
import { installCompanyColors } from './ui/dom';
import { mountApp } from './ui/app';

/** 保存先。使えないとき (プライベートモードなど。アクセスだけで例外) は、書くと必ず失敗する代わりの保存先 (遊べて、記録は保存されない)。 */
function store(get: () => Storage): KeyValueStore {
  try {
    return get();
  } catch {
    const denied = (): never => {
      throw new Error('保存先を使えません');
    };
    return { getItem: denied, setItem: denied, removeItem: denied };
  }
}

const seedParam = new URLSearchParams(location.search).get('seed');
const seed = seedParam !== null && /^\d{1,9}$/.test(seedParam) ? Number(seedParam) : Math.floor(Math.random() * 1e9);
const root = document.getElementById('root');
if (root && sample) {
  installCompanyColors(companies);
  mountApp(root, { pools, companies, kinds, sample, session: store(() => sessionStorage), local: store(() => localStorage), seed });
}
