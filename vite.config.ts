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

const NODE_MODULES = fileURLToPath(new URL('./node_modules/', import.meta.url));

/**
 * Recursos de terceiros servidos pelo próprio app e pré-cacheados (SPEC 2.2):
 * - pdf.js: mapas de caracteres, fontes padrão, decodificadores WASM (JBIG2/JPEG 2000, comuns
 *   em PDFs escaneados) e perfis de cor;
 * - Tesseract: worker, núcleos WASM só-LSTM (relaxed SIMD, SIMD e sem SIMD) e o modelo `por`
 *   (tessdata best_int). Núcleo e worker ficam na mesma pasta: o núcleo procura o .wasm ao lado.
 */
const VENDOR_ASSETS: { from: string; pattern: RegExp; to: string; rename?: string }[] = [
  { from: 'pdfjs-dist/cmaps', pattern: /\.bcmap$|^LICENSE/, to: 'pdfjs/cmaps' },
  {
    from: 'pdfjs-dist/standard_fonts',
    pattern: /\.(pfb|ttf)$|^LICENSE/,
    to: 'pdfjs/standard_fonts',
  },
  {
    from: 'pdfjs-dist/wasm',
    pattern: /^(jbig2|openjpeg|qcms_bg)\.wasm$|^LICENSE/,
    to: 'pdfjs/wasm',
  },
  { from: 'pdfjs-dist/iccs', pattern: /\.icc$|^LICENSE/, to: 'pdfjs/iccs' },
  { from: 'tesseract.js/dist', pattern: /^worker\.min\.js(\.LICENSE\.txt)?$/, to: 'tesseract' },
  {
    from: 'tesseract.js-core',
    pattern: /^tesseract-core-(relaxedsimd-lstm|simd-lstm|lstm)\.(js|wasm)$|^LICENSE$/,
    to: 'tesseract',
  },
  {
    from: '@tesseract.js-data/por/4.0.0_best_int',
    pattern: /^por\.traineddata\.gz$/,
    to: 'tesseract/lang',
  },
];

function vendorAssets(): Plugin {
  const files = VENDOR_ASSETS.flatMap(({ from, pattern, to }) =>
    readdirSync(join(NODE_MODULES, from))
      .filter((f) => pattern.test(f))
      .map((f) => ({
        source: join(NODE_MODULES, from, f),
        url: `${to}/${f === 'LICENSE' ? `LICENSE-${from.split('/')[0]}` : f}`,
      })),
  );
  const contentType = (url: string) =>
    url.endsWith('.wasm')
      ? 'application/wasm'
      : url.endsWith('.js')
        ? 'text/javascript'
        : 'application/octet-stream';
  return {
    name: 'vendor-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const entry = files.find((f) => path.endsWith(`/${f.url}`));
        if (!entry || !existsSync(entry.source)) return next();
        res.setHeader('Content-Type', contentType(entry.url));
        createReadStream(entry.source).pipe(res);
      });
    },
    generateBundle() {
      for (const { source, url } of files) {
        this.emitFile({ type: 'asset', fileName: url, source: readFileSync(source) });
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
    vendorAssets(),
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
