// Bloqueio automático: por inatividade e ao ocultar/fechar o app (SPEC 2.5). Abrir o seletor de
// arquivos do sistema (no Android, ele cobre o app) não conta como "sair do app".
import { LOCK_ON_HIDE_DELAY_MS, type AppSettings } from '../settings/settings';
import type { LockReason } from './session';

/** Disparado pelo app durante processamentos longos pedidos pelo usuário (ex.: OCR). */
export const APP_ACTIVITY_EVENT = 'anonimizador:atividade';
const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'input',
  APP_ACTIVITY_EVENT,
] as const;

export function signalActivity(): void {
  window.dispatchEvent(new Event(APP_ACTIVITY_EVENT));
}
const CHECK_INTERVAL_MS = 5_000;

export interface AutoLockOptions {
  getSettings: () => AppSettings;
  lock: (reason: LockReason) => void;
  now?: () => number;
  win?: Window;
  doc?: Document;
}

/**
 * Liga os detectores enquanto o cofre estiver aberto e devolve a função que os desliga.
 * Usa comparação de horários (e não só setTimeout), porque o navegador congela timers de abas
 * ocultas: ao voltar, o tempo decorrido é conferido imediatamente.
 */
export function startAutoLock({
  getSettings,
  lock,
  now = () => Date.now(),
  win = window,
  doc = document,
}: AutoLockOptions): () => void {
  let lastActivity = now();
  let hiddenAt: number | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  // Seletor de arquivos aberto pelo app: o app fica oculto, mas o usuário não saiu dele.
  let pickingFile = false;

  const fire = (reason: LockReason) => {
    if (stopped) return;
    stop();
    lock(reason);
  };

  const checkIdle = () => {
    const limit = getSettings().idleLockMinutes * 60_000;
    if (now() - lastActivity >= limit) fire('idle');
  };

  const onActivity = () => {
    checkIdle();
    lastActivity = now();
  };

  const onVisibility = () => {
    const delay = LOCK_ON_HIDE_DELAY_MS[getSettings().lockOnHide];
    if (doc.visibilityState === 'hidden') {
      if (pickingFile) return;
      hiddenAt = now();
      if (delay === 0) fire('hidden');
      else if (delay !== null) hideTimer = setTimeout(() => fire('hidden'), delay);
    } else {
      pickingFile = false;
      clearTimeout(hideTimer);
      if (delay !== null && hiddenAt !== null && now() - hiddenAt >= delay) {
        fire('hidden');
        return;
      }
      hiddenAt = null;
      checkIdle();
    }
  };

  const onPageHide = () => {
    if (!pickingFile) fire('hidden');
  };

  // O clique no <input type="file"> (também quando vem do <label>) abre o seletor.
  const onClick = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'file') {
      pickingFile = true;
      onActivity();
    }
  };
  // Escolheu ou desistiu sem que o app tenha saído da tela (ex.: computador).
  const onPickerClosed = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'file') pickingFile = false;
  };

  const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);
  ACTIVITY_EVENTS.forEach((e) => win.addEventListener(e, onActivity, { passive: true }));
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('click', onClick, true);
  win.addEventListener('change', onPickerClosed, true);
  win.addEventListener('cancel', onPickerClosed, true);

  function stop() {
    stopped = true;
    clearInterval(interval);
    clearTimeout(hideTimer);
    ACTIVITY_EVENTS.forEach((e) => win.removeEventListener(e, onActivity));
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('change', onPickerClosed, true);
    win.removeEventListener('cancel', onPickerClosed, true);
  }

  return stop;
}
