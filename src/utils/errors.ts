import { WrongPasswordError, VaultNameError, VaultNotFoundError } from '../vault/repository';
import { InvalidVaultFileError } from '../vault/exchange';
import { VaultLockedError } from '../vault/session';
import { DuplicateDocumentError, NotPdfError } from '../documents/importPdf';
import { ExtractionCancelledError, PdfExtractionError } from '../pdf/pdfClient';

/** Mensagem em português para o usuário. Nunca inclui conteúdo do cofre. */
export function userMessage(error: unknown): string {
  if (
    error instanceof WrongPasswordError ||
    error instanceof VaultNameError ||
    error instanceof VaultNotFoundError ||
    error instanceof InvalidVaultFileError ||
    error instanceof VaultLockedError ||
    error instanceof NotPdfError ||
    error instanceof DuplicateDocumentError ||
    error instanceof PdfExtractionError ||
    error instanceof ExtractionCancelledError
  ) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Não há espaço suficiente no aparelho para gravar o cofre.';
  }
  // Log apenas do tipo do erro (SPEC 2.6: sem conteúdo nos logs).
  console.error('Erro inesperado:', error instanceof Error ? error.name : typeof error);
  return 'Ocorreu um erro inesperado. Tente de novo.';
}
