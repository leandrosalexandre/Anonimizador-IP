import { detectEntities } from '../detectors';
import type { DetectedEntity, DetectionOptions } from '../detectors/types';
import type { VaultContent } from '../vault/types';
import { collectPages } from './useReviewData';

/** Detecção sobre todas as páginas com texto do cofre (texto com hífens de fim de linha unidos). */
export function detectForVault(
  content: VaultContent,
  options: DetectionOptions = {},
): DetectedEntity[] {
  const pages = collectPages(content).map((p) => ({
    docId: p.docId,
    pdfPage: p.pdfPage,
    text: p.detectText,
  }));
  return detectEntities(pages, { keepNames: content.config.keepNames, ...options });
}
