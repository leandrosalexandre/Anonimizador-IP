// Importação de um PDF para o cofre aberto (SPEC Fase 2).
import { extractPdf } from '../pdf/pdfClient';
import type { ExtractedPageText } from '../pdf/pageText';
import { sha256Hex } from '../vault/crypto';
import type { StoredDocument, StoredPage } from '../vault/types';

export class NotPdfError extends Error {
  constructor() {
    super('O arquivo não é um PDF.');
    this.name = 'NotPdfError';
  }
}

export class DuplicateDocumentError extends Error {
  constructor(readonly existingName: string) {
    super(`Este PDF já foi importado neste cofre (${existingName}).`);
    this.name = 'DuplicateDocumentError';
  }
}

export interface ImportProgress {
  fileName: string;
  pagesDone: number;
  pageCount: number | null;
  /** Estimativa em segundos (null enquanto não há base para estimar). */
  secondsLeft: number | null;
}

export interface PreparedImport {
  document: StoredDocument;
  blobs: { id: string; bytes: Uint8Array<ArrayBuffer> }[];
}

export function isPdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

export function toStoredPage(page: ExtractedPageText, thumbnailBlobId: string | null): StoredPage {
  return {
    pdfPage: page.pdfPage,
    width: page.width,
    height: page.height,
    kind: page.kind,
    textSource: page.kind === 'text' ? 'pdf' : null,
    ocrConfidence: null,
    text: page.kind === 'text' ? page.text : '',
    folhaDetected: page.folhaDetected,
    folhaManual: null,
    thumbnailBlobId,
  };
}

/** Lê o arquivo no worker e monta o documento com seus blobs, ainda sem gravar. */
export async function prepareImport(
  file: File,
  options: {
    onProgress: (p: ImportProgress) => void;
    /** Nome do documento já importado com o mesmo conteúdo, se houver. */
    findDuplicate?: (sha256: string) => string | null;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<PreparedImport> {
  const { onProgress, findDuplicate, signal, now = () => performance.now() } = options;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) throw new NotPdfError();
  const sha256 = await sha256Hex(bytes);
  const duplicate = findDuplicate?.(sha256);
  if (duplicate) throw new DuplicateDocumentError(duplicate);

  const pages: StoredPage[] = [];
  const blobs: PreparedImport['blobs'] = [];
  let pageCount: number | null = null;
  const started = now();

  onProgress({ fileName: file.name, pagesDone: 0, pageCount, secondsLeft: null });
  await extractPdf(bytes, {
    signal,
    onStart: (count) => {
      pageCount = count;
      onProgress({ fileName: file.name, pagesDone: 0, pageCount, secondsLeft: null });
    },
    onPage: (page, thumbnail) => {
      let thumbId: string | null = null;
      if (thumbnail) {
        thumbId = crypto.randomUUID();
        blobs.push({ id: thumbId, bytes: thumbnail });
      }
      pages.push(toStoredPage(page, thumbId));
      const done = pages.length;
      const perPage = (now() - started) / done / 1000;
      onProgress({
        fileName: file.name,
        pagesDone: done,
        pageCount,
        secondsLeft: pageCount && done >= 2 ? Math.round(perPage * (pageCount - done)) : null,
      });
    },
  });

  const pdfBlobId = crypto.randomUUID();
  blobs.push({ id: pdfBlobId, bytes });
  return {
    document: {
      id: crypto.randomUUID(),
      fileName: file.name,
      sha256,
      byteLength: bytes.byteLength,
      importedAt: new Date().toISOString(),
      pdfBlobId,
      folhaOffset: null,
      pages,
    },
    blobs,
  };
}

/** Blobs que pertencem a um documento (para removê-lo do cofre). */
export function documentBlobIds(doc: StoredDocument): string[] {
  return [
    doc.pdfBlobId,
    ...doc.pages.flatMap((p) => (p.thumbnailBlobId ? [p.thumbnailBlobId] : [])),
  ];
}
