// Preferências do app, sem nenhum conteúdo do inquérito: podem ficar em claro no localStorage.
import { DEFAULT_ENABLED_TYPES, ENTITY_TYPES, type EntityType } from '../detectors/types';

export type LockOnHide = 'immediate' | '1min' | '5min' | 'never';

export interface AppSettings {
  /** Minutos sem interação até bloquear o cofre (SPEC 2.5, padrão 10). */
  idleLockMinutes: number;
  /** Bloqueio ao ocultar o app. Padrão: não bloquear (só manual ou por inatividade; ver DECISOES). */
  lockOnHide: LockOnHide;
  /** Binarização (preto e branco) antes do OCR. Ajuda em cópias manchadas; piora fotos. */
  ocrBinarize: boolean;
  /** Oferece um PDF pesquisável (imagem + camada de texto) ao fim do OCR. */
  ocrSearchablePdf: boolean;
  /** Termos extras que não são nomes de pessoas (lista de exclusão da detecção). */
  detectionExclusions: string[];
  /** Bloco de instruções para a IA no topo do texto exportado (null = texto padrão). */
  aiInstructions: string | null;
  /** Tipos de dado a pseudonimizar (nomes de pessoas sempre). */
  enabledTypes: EntityType[];
  /**
   * Termos ensinados na revisão como "não é dado pessoal" (bairro, rua, órgão…), com o motivo
   * digitado. Valem para todos os cofres; ficam em claro como as demais preferências.
   */
  learnedTerms: LearnedTerm[];
}

export interface LearnedTerm {
  text: string;
  kind: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  idleLockMinutes: 10,
  lockOnHide: 'never',
  ocrBinarize: false,
  ocrSearchablePdf: false,
  detectionExclusions: [],
  aiInstructions: null,
  enabledTypes: [...DEFAULT_ENABLED_TYPES],
  learnedTerms: [],
};
export const IDLE_LOCK_OPTIONS = [1, 2, 5, 10, 15, 30, 60] as const;
export const LOCK_ON_HIDE_DELAY_MS: Record<LockOnHide, number | null> = {
  immediate: 0,
  '1min': 60_000,
  '5min': 300_000,
  never: null,
};

const STORAGE_KEY = 'anonimizador-ip:settings';
/** 2: o padrão de `lockOnHide` deixou de ser "immediate". */
const STORAGE_VERSION = 2;
const listeners = new Set<() => void>();
let cached: AppSettings | null = null;

function sanitize(value: unknown): AppSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<AppSettings>;
  const idle =
    typeof raw.idleLockMinutes === 'number' && raw.idleLockMinutes >= 1 && raw.idleLockMinutes <= 60
      ? Math.round(raw.idleLockMinutes)
      : DEFAULT_SETTINGS.idleLockMinutes;
  const lockOnHide =
    raw.lockOnHide && raw.lockOnHide in LOCK_ON_HIDE_DELAY_MS
      ? raw.lockOnHide
      : DEFAULT_SETTINGS.lockOnHide;
  return {
    idleLockMinutes: idle,
    lockOnHide,
    ocrBinarize: raw.ocrBinarize === true,
    ocrSearchablePdf: raw.ocrSearchablePdf === true,
    detectionExclusions: Array.isArray(raw.detectionExclusions)
      ? raw.detectionExclusions
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 500)
      : [],
    aiInstructions:
      typeof raw.aiInstructions === 'string' && raw.aiInstructions.trim()
        ? raw.aiInstructions.slice(0, 5000)
        : null,
    enabledTypes: Array.isArray(raw.enabledTypes)
      ? [
          'PESSOA' as const,
          ...ENTITY_TYPES.filter((t) => t !== 'PESSOA' && raw.enabledTypes?.includes(t)),
        ]
      : [...DEFAULT_ENABLED_TYPES],
    learnedTerms: Array.isArray(raw.learnedTerms)
      ? raw.learnedTerms
          .filter(
            (t): t is LearnedTerm =>
              !!t && typeof t.text === 'string' && typeof t.kind === 'string' && !!t.text.trim(),
          )
          .map((t) => ({ text: t.text.trim().slice(0, 120), kind: t.kind.trim().slice(0, 40) }))
          .slice(0, 2000)
      : [],
  };
}

export function getSettings(): AppSettings {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = (stored ? JSON.parse(stored) : null) as Record<string, unknown> | null;
    // Antes da versão 2, "immediate" era só o padrão antigo gravado junto com outras preferências.
    if (parsed && parsed.version !== STORAGE_VERSION && parsed.lockOnHide === 'immediate') {
      delete parsed.lockOnHide;
    }
    cached = sanitize(parsed);
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return cached;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cached = sanitize({ ...getSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cached, version: STORAGE_VERSION }));
  } catch {
    // Armazenamento indisponível: a preferência vale só nesta sessão.
  }
  listeners.forEach((l) => l());
  return cached;
}

export function resetSettings(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
