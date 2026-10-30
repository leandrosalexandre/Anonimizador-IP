// Cliente do worker de OCR. Cancelar = encerrar o worker (libera toda a memória na hora).
import type { OcrOptions, OcrPageResult, OcrRequest, OcrResponse } from './protocol';

export class OcrError extends Error {
  constructor(readonly code: string) {
    super(
      code === 'ocr-init'
        ? 'Não foi possível iniciar o OCR. Abra o app com internet uma vez para concluir a instalação e tente de novo.'
        : code === 'invalid-pdf'
          ? 'Não foi possível abrir o PDF para o OCR.'
          : 'O OCR falhou nesta página. Tente de novo.',
    );
    this.name = 'OcrError';
  }
}

export interface OcrCallbacks {
  onReady?: () => void;
  onProgress?: (pdfPage: number, fraction: number) => void;
  onPage: (result: OcrPageResult) => void;
}

export interface OcrJob {
  done: Promise<void>;
  cancel: () => void;
}

let nextJob = 1;

export function runOcr(
  pdf: Uint8Array<ArrayBuffer>,
  pages: number[],
  options: OcrOptions,
  callbacks: OcrCallbacks,
): OcrJob {
  const jobId = nextJob++;
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ocr',
  });
  let settle: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const done = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (error?: Error) => {
    worker.terminate();
    const s = settle;
    settle = null;
    if (!s) return;
    if (error) s.reject(error);
    else s.resolve();
  };

  worker.onmessage = (event: MessageEvent<OcrResponse>) => {
    const msg = event.data;
    if (msg.jobId !== jobId) return;
    if (msg.type === 'ready') callbacks.onReady?.();
    else if (msg.type === 'progress') callbacks.onProgress?.(msg.pdfPage, msg.fraction);
    else if (msg.type === 'page') callbacks.onPage(msg.result);
    else if (msg.type === 'done') finish();
    else finish(new OcrError(msg.code));
  };
  worker.onerror = () => finish(new OcrError('unknown'));

  const copy = pdf.slice().buffer;
  const request: OcrRequest = { type: 'start', jobId, pdf: copy, pages, options };
  worker.postMessage(request, [copy]);
  return { done, cancel: () => finish() };
}
