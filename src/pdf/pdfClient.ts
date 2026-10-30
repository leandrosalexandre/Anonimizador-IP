// Cliente do Web Worker de PDF (thread principal).
import type { ExtractedPageText } from './pageText';
import type { PdfErrorCode, WorkerRequest, WorkerResponse } from './protocol';

export class PdfExtractionError extends Error {
  constructor(readonly code: PdfErrorCode) {
    super(
      code === 'password'
        ? 'Este PDF é protegido por senha. Remova a proteção e importe de novo.'
        : code === 'invalid-pdf'
          ? 'O arquivo não é um PDF válido ou está corrompido.'
          : 'Não foi possível ler o PDF.',
    );
    this.name = 'PdfExtractionError';
  }
}

export class ExtractionCancelledError extends Error {
  constructor() {
    super('Leitura cancelada.');
    this.name = 'ExtractionCancelledError';
  }
}

export interface ExtractCallbacks {
  onStart?: (pageCount: number) => void;
  onPage: (page: ExtractedPageText, thumbnail: Uint8Array<ArrayBuffer> | null) => void;
  signal?: AbortSignal | undefined;
  thumbnailWidth?: number;
}

let worker: Worker | null = null;
let nextJob = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./pdf.worker.ts', import.meta.url), {
    type: 'module',
    name: 'leitor-pdf',
  });
  return worker;
}

/** Encerra o worker (libera toda a memória do pdf.js), por exemplo ao bloquear o cofre. */
export function terminatePdfWorker(): void {
  worker?.terminate();
  worker = null;
}

/**
 * Renderiza uma página em JPEG. `loadData` só é chamado se o worker ainda não tem o documento
 * aberto (evita decifrar e copiar o PDF a cada página).
 */
export function renderPage(
  key: string,
  pdfPage: number,
  dpi: number,
  loadData: () => Promise<Uint8Array<ArrayBuffer>>,
): Promise<{ image: Blob; width: number; height: number }> {
  const w = getWorker();
  const send = (jobId: number, data: ArrayBuffer | null) => {
    const request: WorkerRequest = { type: 'render', jobId, key, data, pdfPage, dpi };
    w.postMessage(request, data ? [data] : []);
  };
  return new Promise((resolve, reject) => {
    const jobId = nextJob++;
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId) return;
      if (msg.type === 'need-data') {
        loadData().then(
          (bytes) => send(jobId, bytes.slice().buffer),
          (e: unknown) => {
            w.removeEventListener('message', onMessage);
            reject(e instanceof Error ? e : new PdfExtractionError('unknown'));
          },
        );
        return;
      }
      w.removeEventListener('message', onMessage);
      if (msg.type === 'image') {
        resolve({
          image: new Blob([msg.image], { type: 'image/jpeg' }),
          width: msg.width,
          height: msg.height,
        });
      } else if (msg.type === 'error') reject(new PdfExtractionError(msg.code));
      else reject(new PdfExtractionError('unknown'));
    };
    w.addEventListener('message', onMessage);
    send(jobId, null);
  });
}

/** Lê o PDF no worker, página por página. `data` é copiado: o original continua utilizável. */
export function extractPdf(
  data: Uint8Array<ArrayBuffer>,
  callbacks: ExtractCallbacks,
): Promise<void> {
  const jobId = nextJob++;
  const w = getWorker();
  const copy = data.slice().buffer;

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      callbacks.signal?.removeEventListener('abort', onAbort);
    };
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId) return;
      switch (msg.type) {
        case 'started':
          callbacks.onStart?.(msg.pageCount);
          break;
        case 'page':
          callbacks.onPage(msg.page, msg.thumbnail ? new Uint8Array(msg.thumbnail) : null);
          break;
        case 'done':
          cleanup();
          resolve();
          break;
        case 'cancelled':
          cleanup();
          reject(new ExtractionCancelledError());
          break;
        case 'error':
          cleanup();
          reject(new PdfExtractionError(msg.code));
          break;
      }
    };
    const onError = () => {
      cleanup();
      terminatePdfWorker();
      reject(new PdfExtractionError('unknown'));
    };
    const onAbort = () => {
      const cancel: WorkerRequest = { type: 'cancel', jobId };
      w.postMessage(cancel);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    if (callbacks.signal?.aborted) onAbort();
    callbacks.signal?.addEventListener('abort', onAbort);
    const request: WorkerRequest = {
      type: 'extract',
      jobId,
      data: copy,
      thumbnailWidth: callbacks.thumbnailWidth ?? 240,
    };
    w.postMessage(request, [copy]);
  });
}
