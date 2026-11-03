// 入口。画面 (src/ui/app.ts) をページに取り付ける。外部への通信はしない。
import './styles/base.css';
import './styles/app.css';
import './styles/stage.css';
import './styles/motion.css';
import { companies, kinds, pools, sample } from './data';
import type { KeyValueStore } from './domain/storage';
import { mountApp } from './ui/app';
import { MESSAGES } from './ui/messages';
import { createViewer } from './ui/viewer-impl';

// 保存先 (sessionStorage・localStorage) が使えない環境 (アクセスで例外) でも遊べるよう、例外を投げる保存先で代える
const unavailable: KeyValueStore = {
  getItem() { throw new Error('storage unavailable'); },
  setItem() { throw new Error('storage unavailable'); },
  removeItem() { throw new Error('storage unavailable'); },
};
function storeOf(name: 'sessionStorage' | 'localStorage'): KeyValueStore {
  try {
    return window[name];
  } catch {
    return unavailable;
  }
}

const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam !== null && /^\d{1,9}$/.test(seedParam) ? Number(seedParam) : undefined;

document.title = MESSAGES.title;
const root = document.getElementById('root');
if (root) {
  mountApp(root, { pools, companies, kinds, sample, session: storeOf('sessionStorage'), local: storeOf('localStorage'), createViewer, seed });
}
