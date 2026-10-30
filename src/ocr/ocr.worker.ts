/// <reference lib="webworker" />
// Web Worker de OCR (SPEC Fase 3): renderiza cada página a ~300 DPI com o pdf.js, faz o
// pré-processamento e reconhece com o Tesseract (idioma `por`), uma página por vez, liberando a
// memória da imagem antes de seguir. Todos os arquivos vêm do próprio app.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createWorker, type PSM, type Worker as TesseractWorker } from 'tesseract.js';
import { relaxedSimd, simd } from 'wasm-feature-detect';
import { detectFolha, parseFolhaStamp } from '../pdf/folhas';
import { openPdf } from '../pdf/pdfjsWorkerEnv';
import { buildOcrText, type OcrBlock } from './ocrText';
import { preprocessPixels, removeLongLines } from './preprocess';
import type { OcrOptions, OcrRequest, OcrResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const OCR_DPI = 300;
/** Limite de pixels por página (~A3 a 300 DPI), para não estourar a memória do tablet. */
const MAX_PIXELS = 35_000_000;

function post(message: OcrResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

function appUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, self.location.origin).href;
}

async function corePath(): Promise<string> {
  const [relaxed, simdOk] = await Promise.all([relaxedSimd(), simd()]);
  const variant = relaxed ? 'relaxedsimd-lstm' : simdOk ? 'simd-lstm' : 'lstm';
  return appUrl(`tesseract/tesseract-core-${variant}.js`);
}

async function renderForOcr(doc: PDFDocumentProxy, pageNumber: number, options: OcrOptions) {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    let scale = OCR_DPI / 72;
    const pixels = base.width * scale * base.height * scale;
    if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas indisponível');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    await page.render({
      canvas: null,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const image = context.getImageData(0, 0, width, height);
    preprocessPixels(image.data, options.binarize);
    context.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return { canvas, context, blob, width, height };
  } finally {
    page.cleanup();
  }
}

/** Recorte do canto superior direito (onde fica o carimbo de folha), sem linhas longas. */
async function cornerImage(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const left = Math.round(width * 0.55);
  const w = width - left;
  // Até ~27 mm do topo: o carimbo, sem pegar o cabeçalho do documento.
  const h = Math.round(height * 0.09);
  const image = context.getImageData(left, 0, w, h);
  // Linhas mais longas que ~8 mm a 300 DPI: maiores que qualquer letra de carimbo.
  removeLongLines(image.data, w, h, Math.round((OCR_DPI / 25.4) * 8));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  canvas.width = canvas.height = 0;
  return blob;
}

async function run({ jobId, pdf, pages, options }: OcrRequest) {
  let doc: PDFDocumentProxy | null = null;
  let tesseract: TesseractWorker | null = null;
  let currentPage = 0;
  let lastFraction = 0;
  try {
    try {
      doc = await openPdf(new Uint8Array(pdf)).promise;
    } catch {
      post({ type: 'error', jobId, code: 'invalid-pdf' });
      return;
    }
    try {
      tesseract = await createWorker('por', 1 /* OEM.LSTM_ONLY */, {
        workerPath: appUrl('tesseract/worker.min.js'),
        corePath: await corePath(),
        langPath: appUrl('tesseract/lang'),
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: false,
        logger: (m) => {
          if (m.status !== 'recognizing text' || !currentPage) return;
          if (m.progress - lastFraction < 0.05 && m.progress < 1) return;
          lastFraction = m.progress;
          post({ type: 'progress', jobId, pdfPage: currentPage, fraction: m.progress });
        },
      });
      await tesseract.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: String(OCR_DPI),
      });
    } catch {
      post({ type: 'error', jobId, code: 'ocr-init' });
      return;
    }
    post({ type: 'ready', jobId });

    for (const pageNumber of pages) {
      const started = performance.now();
      currentPage = pageNumber;
      lastFraction = 0;
      post({ type: 'progress', jobId, pdfPage: pageNumber, fraction: 0 });
      const { canvas, context, blob, width, height } = await renderForOcr(doc, pageNumber, options);
      const { data } = await tesseract.recognize(
        blob,
        { pdfTitle: `Página ${pageNumber}` },
        { text: false, blocks: true, pdf: options.searchablePdf },
      );
      const built = buildOcrText((data.blocks ?? []) as unknown as OcrBlock[]);
      let folhaDetected = detectFolha(built.lines, width, height);
      if (folhaDetected === null) {
        // Carimbos em caixa costumam ser descartados na segmentação da página inteira: segunda
        // leitura só do canto superior direito, sem as bordas, em modo de texto esparso.
        const corner = await cornerImage(context, width, height);
        // Bloco único (lê números isolados) e, se nada, texto esparso.
        for (const psm of ['6', '11'] as PSM[]) {
          await tesseract.setParameters({ tessedit_pageseg_mode: psm });
          const stamp = await tesseract.recognize(corner, {}, { text: true });
          folhaDetected = parseFolhaStamp(stamp.data.text);
          if (folhaDetected !== null) break;
        }
        await tesseract.setParameters({ tessedit_pageseg_mode: '3' as PSM });
      }
      canvas.width = canvas.height = 0;
      const pagePdf = options.searchablePdf && data.pdf ? new Uint8Array(data.pdf).buffer : null;
      post(
        {
          type: 'page',
          jobId,
          result: {
            pdfPage: pageNumber,
            text: built.text,
            confidence: built.confidence,
            lowConfidence: built.lowConfidence,
            folhaDetected,
            ms: Math.round(performance.now() - started),
            pdf: pagePdf,
          },
        },
        pagePdf ? [pagePdf] : [],
      );
    }
    post({ type: 'done', jobId });
  } catch {
    post({ type: 'error', jobId, code: 'unknown' });
  } finally {
    await tesseract?.terminate().catch(() => undefined);
    await doc?.destroy();
  }
}

self.onmessage = (event: MessageEvent<OcrRequest>) => {
  if (event.data.type === 'start') void run(event.data);
};
