import type { ExtractedPageText } from './pageText';

export type PdfErrorCode = 'invalid-pdf' | 'password' | 'unknown';

export type WorkerRequest =
  | { type: 'extract'; jobId: number; data: ArrayBuffer; thumbnailWidth: number }
  | { type: 'cancel'; jobId: number };

export type WorkerResponse =
  | { type: 'started'; jobId: number; pageCount: number }
  | { type: 'page'; jobId: number; page: ExtractedPageText; thumbnail: ArrayBuffer | null }
  | { type: 'done'; jobId: number }
  | { type: 'cancelled'; jobId: number }
  | { type: 'error'; jobId: number; code: PdfErrorCode };
