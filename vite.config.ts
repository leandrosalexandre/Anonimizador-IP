import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const PDFJS_ROOT = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
/** Recursos do pdf.js servidos pelo próprio app (SPEC 2.2): mapas de caracteres, fontes padrão,
 * decodificadores WASM (JBIG2/JPEG 2000, comuns em PDFs escaneados) e perfis de cor. */
const PDFJS_ASSETS: Record<string, RegExp> = {
  cmaps: /\.bcmap$/,
  standard_fonts: /\.(pfb|ttf)$|^LICENSE/,
  wasm: /^(jbig2|openjpeg|qcms_bg)\.wasm$|^LICENSE/,
  iccs: /\.icc$|^LICENSE/,
};

function pdfjsAssets(): Plugin {
  const files = Object.entries(PDFJS_ASSETS).flatMap(([dir, pattern]) =>
    readdirSync(join(PDFJS_ROOT, dir))
      .filter((f) => pattern.test(f))
      .map((f) => ({ dir, file: f })),
  );
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /\/pdfjs\/(\w+)\/([\w.-]+)$/.exec(req.url ?? '');
        const entry = match && files.find((f) => f.dir === match[1] && f.file === match[2]);
        if (!entry) return next();
        const path = join(PDFJS_ROOT, entry.dir, entry.file);
        if (!existsSync(path)) return next();
        res.setHeader(
          'Content-Type',
          entry.file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        );
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() {
      for (const { dir, file } of files) {
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/${dir}/${file}`,
          source: readFileSync(join(PDFJS_ROOT, dir, file)),
        });
      }
    },
  };
}

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    cspMetaTag(),
    pdfjsAssets(),
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
        globPatterns: [
          '**/*.{js,mjs,css,html,svg,png,ico,webmanifest,json,wasm,traineddata,gz,bcmap,pfb,ttf,icc}',
        ],
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
