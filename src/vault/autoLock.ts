// Bloqueio automático: por inatividade e ao ocultar/fechar o app (SPEC 2.5).
import { LOCK_ON_HIDE_DELAY_MS, type AppSettings } from '../settings/settings';
import type { LockReason } from './session';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const;
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
      hiddenAt = now();
      if (delay === 0) fire('hidden');
      else if (delay !== null) hideTimer = setTimeout(() => fire('hidden'), delay);
    } else {
      clearTimeout(hideTimer);
      if (delay !== null && hiddenAt !== null && now() - hiddenAt >= delay) {
        fire('hidden');
        return;
      }
      hiddenAt = null;
      checkIdle();
    }
  };

  const onPageHide = () => fire('hidden');

  const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);
  ACTIVITY_EVENTS.forEach((e) => win.addEventListener(e, onActivity, { passive: true }));
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);

  function stop() {
    stopped = true;
    clearInterval(interval);
    clearTimeout(hideTimer);
    ACTIVITY_EVENTS.forEach((e) => win.removeEventListener(e, onActivity));
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  }

  return stop;
}
