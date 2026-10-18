const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const escala = (nome) => Object.fromEntries(TONS.map((t) => [t, `rgb(var(--${nome}-${t}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // hover: só em aparelhos com mouse (no toque o efeito "grudava" depois de tocar)
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Rosa e ardósia vêm de variáveis CSS (src/index.css) para os visuais do portal.
      colors: { rose: escala('rose'), slate: escala('slate') },
    },
  },
  plugins: [],
}