// Ajustes para rodar o pdf.js inteiro dentro de um Web Worker (sem DOM): canvas via
// OffscreenCanvas, sem filtros SVG e com as fontes desenhadas como contornos.
import * as pdfjs from 'pdfjs-dist';
// Registra o WorkerMessageHandler em globalThis: o pdf.js roda no próprio worker, sem outro worker.
import 'pdfjs-dist/build/pdf.worker.mjs';

interface CanvasAndContext {
  canvas: OffscreenCanvas | null;
  context: OffscreenCanvasRenderingContext2D | null;
}

export class OffscreenCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error('Tamanho de canvas inválido');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(target: CanvasAndContext, width: number, height: number): void {
    if (!target.canvas) throw new Error('Canvas ausente');
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: CanvasAndContext): void {
    if (target.canvas) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

export class NoFilterFactory {
  addFilter(): string {
    return 'none';
  }
  addHCMFilter(): string {
    return 'none';
  }
  addAlphaFilter(): string {
    return 'none';
  }
  addLuminosityFilter(): string {
    return 'none';
  }
  addHighlightHCMFilter(): string {
    return 'none';
  }
  destroy(): void {}
}

function assetUrl(dir: string): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, self.location.origin).href;
}

export function openPdf(data: Uint8Array<ArrayBuffer>) {
  return pdfjs.getDocument({
    data,
    verbosity: 0,
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NoFilterFactory,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: true,
    isOffscreenCanvasSupported: true,
    enableXfa: false,
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
  } as Parameters<typeof pdfjs.getDocument>[0]);
}
