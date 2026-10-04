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
          name: 'Studio Labeli',
          short_name: 'Labeli',
          theme_color: '#10b981',
          background_color: '#f8fafc',
          display: 'standalone',
          icons: [
            {
              src: 'https://via.placeholder.com/192/10b981/ffffff?text=SL',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'https://via.placeholder.com/512/10b981/ffffff?text=SL',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ]
  };
});

