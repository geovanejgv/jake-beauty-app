import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { validarEnv } from './src/lib/env';

export default defineConfig(({ command, mode }) => {
  // SEG-01: no build, variável (do .env.local ou do painel da Vercel) faltando ou inválida interrompe a geração (lista só os nomes).
  if (command === 'build') validarEnv(loadEnv(mode, '.', 'VITE_'));

  return {
    build: {
      // LOG-02: sem source maps públicos em produção.
      sourcemap: false,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Controla Miga',
          short_name: 'Controla Miga',
          description: 'Gestão de salão: agenda, clientes, financeiro e equipe.',
          theme_color: '#e11d48',
          background_color: '#fdf2f8',
          display: 'standalone',
          icons: [
            { src: '/marca/icone-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/marca/icone-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/marca/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        }
      })
    ]
  };
});

