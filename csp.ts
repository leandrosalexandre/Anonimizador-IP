// Content Security Policy do app (SPEC 2.3). Injetada como meta tag apenas no build,
// porque o servidor de desenvolvimento do Vite precisa de websocket e scripts inline (HMR).
export const CSP_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  // 'wasm-unsafe-eval' é exigido pelo núcleo WASM do Tesseract (Fase 3).
  'script-src': "'self' 'wasm-unsafe-eval'",
  'style-src': "'self'",
  'img-src': "'self' blob: data:",
  'font-src': "'self'",
  'connect-src': "'self'",
  'worker-src': "'self' blob:",
  'manifest-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'none'",
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([name, value]) => `${name} ${value}`)
  .join('; ');
