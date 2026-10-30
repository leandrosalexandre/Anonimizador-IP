import { detectEntities } from '../detectors';
import { getSettings } from '../settings/settings';
import { updateVaultContent } from '../vault/session';
import { applyDetection } from './model';
import { collectPages } from './useReviewData';

/** Roda a detecção sobre todas as páginas com texto e incorpora o resultado ao cofre. */
export async function runDetection(): Promise<void> {
  // Cede a vez à interface antes do processamento (mostra "Detectando…").
  await new Promise((r) => setTimeout(r, 30));
  await updateVaultContent((c) => {
    const pages = collectPages(c).map((p) => ({
      docId: p.docId,
      pdfPage: p.pdfPage,
      text: p.text,
    }));
    const settings = getSettings();
    const detected = detectEntities(pages, {
      exclusions: settings.detectionExclusions,
      keepNames: c.config.keepNames,
      types: settings.enabledTypes,
    });
    return applyDetection(c, detected);
  });
}
