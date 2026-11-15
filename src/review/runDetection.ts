import { getSettings } from '../settings/settings';
import { updateVaultContent } from '../vault/session';
import { applyDetection } from './model';
import { detectForVault } from './detectVault';

/** Roda a detecção sobre todas as páginas com texto e incorpora o resultado ao cofre. */
export async function runDetection(): Promise<void> {
  // Cede a vez à interface antes do processamento (mostra "Detectando…").
  await new Promise((r) => setTimeout(r, 30));
  await updateVaultContent((c) => {
    const settings = getSettings();
    const detected = detectForVault(c, {
      exclusions: settings.detectionExclusions,
      types: settings.enabledTypes,
      learnedTerms: settings.learnedTerms.map((t) => t.text),
    });
    return applyDetection(c, detected);
  });
}
