// 入口。足場の段階では、画面が立ち上がることだけを示す (画面は Task #27・#28)。
import './styles/base.css';

const root = document.getElementById('root');
if (root) {
  const app = document.createElement('main');
  app.dataset.testid = 'app';
  const title = document.createElement('h1');
  title.textContent = 'kessan-8';
  const note = document.createElement('p');
  note.textContent = '制作中です。';
  app.append(title, note);
  root.append(app);
}
