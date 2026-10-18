// Aplica o visual salvo antes de renderizar, evitando o "piscar" do modo claro.
// Arquivo externo (e não <script> inline) para a CSP não precisar de 'unsafe-inline' (CAB-01).
// Mesma regra de src/features/acesso/visual.ts (lerVisual).
try {
  var t = localStorage.getItem('jb-theme');
  var validos = ['light', 'dark', 'jake-claro', 'jake-escuro'];
  if (validos.indexOf(t) < 0) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (t === 'dark' || t === 'jake-escuro') document.documentElement.classList.add('dark');
  if (t === 'jake-claro' || t === 'jake-escuro') document.documentElement.classList.add('tema-jake');
} catch (e) {}
