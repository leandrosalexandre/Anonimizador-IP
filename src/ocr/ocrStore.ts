// Estado do OCR em andamento. Fica fora dos componentes para continuar ao navegar entre telas
// (por exemplo, conferir páginas enquanto as demais são processadas). Cada página reconhecida é
// gravada no cofre na hora; cancelar ou bloquear preserva as páginas já concluídas.
import { useSyncExternalStore } from 'react';
import { getSettings } from '../settings/settings';
import { signalActivity } from '../vault/autoLock';
import { readBlob } from '../vault/repository';
import {
  getSession,
  requireUnlocked,
  subscribeSession,
  updateVaultContent,
} from '../vault/session';
import type { StoredDocument, StoredPage } from '../vault/types';
import { OcrError, runOcr, type OcrJob } from './ocrClient';
import type { OcrPageResult } from './protocol';

export type OcrState =
  | { status: 'idle' }
  | {
      status: 'running';
      vaultId: string;
      docId: string;
      fileName: string;
      pages: number[];
      done: number;
      currentPage: number | null;
      pageFraction: number;
      startedAt: number;
      msPerPage: number[];
      preparing: boolean;
    }
  | {
      status: 'finished';
      vaultId: string;
      docId: string;
      fileName: string;
      done: number;
      total: number;
      averageMs: number | null;
      outcome: 'complete' | 'cancelled' | 'locked' | 'error';
      error: string | null;
      searchablePdf: Uint8Array<ArrayBuffer> | null;
    };

let state: OcrState = { status: 'idle' };
const listeners = new Set<() => void>();
let job: OcrJob | null = null;
let cancelReason: 'cancelled' | 'locked' | null = null;

function setState(next: OcrState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getOcrState(): OcrState {
  return state;
}

export function subscribeOcr(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOcrState(): OcrState {
  return useSyncExternalStore(subscribeOcr, getOcrState, getOcrState);
}

/** Tempo restante estimado, em segundos. */
export function estimateSecondsLeft(s: Extract<OcrState, { status: 'running' }>): number | null {
  if (!s.msPerPage.length) return null;
  const avg = s.msPerPage.reduce((a, b) => a + b, 0) / s.msPerPage.length;
  const remaining = s.pages.length - s.done - Math.min(s.pageFraction, 0.95);
  return Math.max(1, Math.round((avg * remaining) / 1000));
}

export function applyOcrResult(page: StoredPage, result: OcrPageResult): StoredPage {
  const { textEditedAt: _edited, ...rest } = page;
  void _edited;
  return {
    ...rest,
    text: result.text,
    textSource: 'ocr',
    ocrConfidence: result.confidence,
    ocrLowConfidence: result.lowConfidence,
    // A folha detectada no OCR só preenche páginas sem detecção anterior.
    folhaDetected: page.folhaDetected ?? result.folhaDetected,
  };
}

async function buildSearchablePdf(
  original: Uint8Array<ArrayBuffer>,
  pagePdfs: Map<number, ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(original, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (let i = 0; i < source.getPageCount(); i++) {
    const ocrPdf = pagePdfs.get(i + 1);
    if (ocrPdf) {
      const ocrDoc = await PDFDocument.load(ocrPdf);
      const [page] = await out.copyPages(ocrDoc, [0]);
      if (page) out.addPage(page);
    } else {
      const [page] = await out.copyPages(source, [i]);
      if (page) out.addPage(page);
    }
  }
  return new Uint8Array(await out.save());
}

/** Inicia o OCR das páginas indicadas (uma por vez). */
export async function startOcr(doc: StoredDocument, pageNumbers: number[]): Promise<void> {
  if (state.status === 'running' || pageNumbers.length === 0) return;
  const vault = requireUnlocked();
  const settings = getSettings();
  const pages = [...pageNumbers].sort((a, b) => a - b);
  cancelReason = null;
  setState({
    status: 'running',
    vaultId: vault.meta.id,
    docId: doc.id,
    fileName: doc.fileName,
    pages,
    done: 0,
    currentPage: null,
    pageFraction: 0,
    startedAt: performance.now(),
    msPerPage: [],
    preparing: true,
  });

  const pagePdfs = new Map<number, ArrayBuffer>();
  let pdfBytes: Uint8Array<ArrayBuffer> | null = null;
  let error: string | null = null;
  // Gravações em série, na ordem em que as páginas terminam.
  let saving: Promise<void> = Promise.resolve();

  try {
    pdfBytes = await readBlob(vault, doc.pdfBlobId);
    job = runOcr(
      pdfBytes,
      pages,
      { binarize: settings.ocrBinarize, searchablePdf: settings.ocrSearchablePdf },
      {
        onReady: () => {
          if (state.status === 'running') setState({ ...state, preparing: false });
        },
        onProgress: (pdfPage, fraction) => {
          if (state.status === 'running') {
            setState({ ...state, currentPage: pdfPage, pageFraction: fraction, preparing: false });
          }
        },
        onPage: (result) => {
          signalActivity();
          if (result.pdf) pagePdfs.set(result.pdfPage, result.pdf);
          saving = saving.then(() =>
            updateVaultContent(
              (c) => ({
                ...c,
                documents: c.documents.map((d) =>
                  d.id !== doc.id
                    ? d
                    : {
                        ...d,
                        pages: d.pages.map((p) =>
                          p.pdfPage === result.pdfPage ? applyOcrResult(p, result) : p,
                        ),
                      },
                ),
              }),
              {},
              vault.meta.id,
            ),
          );
          if (state.status === 'running') {
            setState({
              ...state,
              done: state.done + 1,
              pageFraction: 0,
              msPerPage: [...state.msPerPage, result.ms],
            });
          }
        },
      },
    );
    await job.done;
    await saving;
  } catch (e) {
    error =
      e instanceof OcrError ? e.message : 'O OCR foi interrompido por um erro. Tente de novo.';
    await saving.catch(() => undefined);
  } finally {
    job = null;
  }

  const current = getOcrState();
  const running = current.status === 'running' ? current : null;
  const msPerPage = running?.msPerPage ?? [];
  const done = running?.done ?? 0;
  const outcome = cancelReason ?? (error ? 'error' : 'complete');
  let searchablePdf: Uint8Array<ArrayBuffer> | null = null;
  if (
    outcome === 'complete' &&
    pdfBytes &&
    pagePdfs.size > 0 &&
    getSession().status === 'unlocked'
  ) {
    try {
      searchablePdf = await buildSearchablePdf(pdfBytes, pagePdfs);
    } catch {
      error = 'O OCR terminou, mas não foi possível montar o PDF pesquisável.';
    }
  }
  setState({
    status: 'finished',
    vaultId: vault.meta.id,
    docId: doc.id,
    fileName: doc.fileName,
    done,
    total: pages.length,
    averageMs: msPerPage.length
      ? Math.round(msPerPage.reduce((a, b) => a + b, 0) / msPerPage.length)
      : null,
    outcome,
    error,
    searchablePdf,
  });
  console.info('OCR:', outcome, `${done}/${pages.length} páginas`, msPerPage);
}

export function cancelOcr(reason: 'cancelled' | 'locked' = 'cancelled'): void {
  if (!job) return;
  cancelReason = reason;
  job.cancel();
}

export function dismissOcr(): void {
  if (state.status === 'finished') setState({ status: 'idle' });
}

// Bloqueou o cofre: interrompe o OCR e descarta o PDF pesquisável da memória.
subscribeSession(() => {
  const session = getSession();
  if (
    session.status === 'unlocked' &&
    state.status === 'running' &&
    session.vault.meta.id === state.vaultId
  ) {
    return;
  }
  if (state.status === 'running') cancelOcr('locked');
  else if (state.status === 'finished' && session.status === 'locked') setState({ status: 'idle' });
});
