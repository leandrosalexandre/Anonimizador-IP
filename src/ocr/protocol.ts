export interface OcrOptions {
  binarize: boolean;
  searchablePdf: boolean;
}

export type OcrRequest = {
  type: 'start';
  jobId: number;
  pdf: ArrayBuffer;
  pages: number[];
  options: OcrOptions;
};

export interface OcrPageResult {
  pdfPage: number;
  text: string;
  confidence: number;
  lowConfidence: [number, number][];
  folhaDetected: number | null;
  /** Tempo de renderização + reconhecimento da página. */
  ms: number;
  /** PDF de uma página com camada de texto (opção "PDF pesquisável"). */
  pdf: ArrayBuffer | null;
}

export type OcrResponse =
  | { type: 'ready'; jobId: number }
  | { type: 'progress'; jobId: number; pdfPage: number; fraction: number }
  | { type: 'page'; jobId: number; result: OcrPageResult }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; code: 'invalid-pdf' | 'ocr-init' | 'unknown' };
