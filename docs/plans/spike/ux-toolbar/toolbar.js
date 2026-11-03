// 試作 (#50)。?calc=single|wrap と ?text=差|比 のように | で区切った結果の文を受け取り、バーに入れる。
const q = new URLSearchParams(location.search);
document.getElementById('bar').dataset.calc = q.get('calc') ?? 'single';
const calc = document.getElementById('calc');
for (const part of (q.get('text') ?? '').split('|')) {
  if (!part) continue;
  const s = document.createElement('span');
  s.textContent = part;
  calc.append(s);
}
