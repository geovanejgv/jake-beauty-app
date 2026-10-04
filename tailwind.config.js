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
    extend: {},
  },
  plugins: [],
}