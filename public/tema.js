// Aplica o tema salvo antes de renderizar, evitando o "piscar" do modo claro.
// Arquivo externo (e não <script> inline) para a CSP não precisar de 'unsafe-inline' (CAB-01).
try {
  var t = localStorage.getItem('jb-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
