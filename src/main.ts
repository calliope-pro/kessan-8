// 入口 (仮画面)。画面は #141 が impeccable で作り直す (docs/test-cases/domain-v3.md §6 の DX3)。
// 古い画面は消えたので、題名と「作り直し中」の旨だけを出す。外部への通信はしない。
import './styles/base.css';
import { TITLE } from './title';

const root = document.getElementById('root');
if (root) {
  const main = document.createElement('main');
  main.setAttribute('data-testid', 'app');
  const title = document.createElement('h1');
  title.textContent = TITLE;
  const note = document.createElement('p');
  note.textContent = '作り直し中です。もうしばらくお待ちください。';
  main.append(title, note);
  root.replaceChildren(main);
}
