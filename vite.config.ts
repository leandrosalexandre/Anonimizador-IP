import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { CSP } from './csp.ts';

// Caminho do repositório no GitHub Pages (https://<usuario>.github.io/Anonimizador-IP/).
const BASE = process.env.VITE_BASE ?? '/Anonimizador-IP/';

function cspMetaTag(): Plugin {
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    // Logo após o charset, antes de qualquer script ou folha de estilo.
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
  };
}

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [
    react(),
    cspMetaTag(),
    VitePWA({
      // O usuário decide quando atualizar, para não recarregar no meio de uma revisão.
      registerType: 'prompt',
      // O registro é feito pelo hook useRegisterSW (sem script inline, compatível com a CSP).
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Anonimizador de IP',
        short_name: 'Anonimizador',
        description:
          'Pseudonimiza inquéritos policiais no próprio aparelho, sem enviar dados a nenhum servidor.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#1e3a8a',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Pré-cache de tudo o que o app usa, incluindo WASM e modelos de OCR (Fase 3).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,json,wasm,traineddata,gz}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Na primeira instalação o SW já controla a página (pronto para offline sem recarregar).
        // Atualizações continuam esperando a confirmação do usuário (skipWaiting desligado).
        clientsClaim: true,
        // Sem cache em tempo de execução: nada fora do pré-cache deve ser buscado.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
});
