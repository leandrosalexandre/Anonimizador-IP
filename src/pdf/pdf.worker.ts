/// <reference lib="webworker" />
// Web Worker de leitura de PDF (SPEC 3): extrai texto e gera miniaturas página por página,
// liberando a memória de cada página antes de seguir. Nada aqui é registrado no console.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractPageText } from './pageText';
import { openPdf } from './pdfjsWorkerEnv';
import type { PdfErrorCode, WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const cancelled = new Set<number>();

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

function errorCode(error: unknown): PdfErrorCode {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'password';
  if (name === 'InvalidPDFException' || name === 'FormatError') return 'invalid-pdf';
  return 'unknown';
}

async function renderThumbnail(doc: PDFDocumentProxy, pageNumber: number, width: number) {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: null,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
    canvas.width = canvas.height = 0;
    return await blob.arrayBuffer();
  } catch {
    return null; // Miniatura é opcional: falha na renderização não impede a importação.
  } finally {
    page.cleanup();
  }
}

async function extract(jobId: number, data: ArrayBuffer, thumbnailWidth: number) {
  let doc: PDFDocumentProxy | null = null;
  try {
    doc = await openPdf(new Uint8Array(data)).promise;
    post({ type: 'started', jobId, pageCount: doc.numPages });
    for (let n = 1; n <= doc.numPages; n++) {
      if (cancelled.has(jobId)) {
        post({ type: 'cancelled', jobId });
        return;
      }
      const page = await doc.getPage(n);
      const text = await extractPageText(page);
      page.cleanup();
      const thumbnail = thumbnailWidth > 0 ? await renderThumbnail(doc, n, thumbnailWidth) : null;
      post({ type: 'page', jobId, page: text, thumbnail }, thumbnail ? [thumbnail] : []);
    }
    post({ type: 'done', jobId });
  } catch (error) {
    post({ type: 'error', jobId, code: errorCode(error) });
  } finally {
    cancelled.delete(jobId);
    await doc?.destroy();
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'cancel') cancelled.add(message.jobId);
  else void extract(message.jobId, message.data, message.thumbnailWidth);
};
