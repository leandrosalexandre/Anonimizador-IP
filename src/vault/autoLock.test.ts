import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '../settings/settings';
import { startAutoLock } from './autoLock';
import type { LockReason } from './session';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(settings: Partial<AppSettings> = {}) {
  const reasons: LockReason[] = [];
  const stop = startAutoLock({
    getSettings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    lock: (r) => reasons.push(r),
  });
  return { reasons, stop };
}

describe('bloqueio automático', () => {
  it('bloqueia após 10 minutos sem interação (padrão)', () => {
    const { reasons } = setup();
    vi.advanceTimersByTime(9 * 60_000);
    expect(reasons).toEqual([]);
    vi.advanceTimersByTime(60_000 + 5_000);
    expect(reasons).toEqual(['idle']);
  });

  it('interação reinicia a contagem', () => {
    const { reasons } = setup({ idleLockMinutes: 2 });
    vi.advanceTimersByTime(90_000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(90_000);
    expect(reasons).toEqual([]);
    vi.advanceTimersByTime(35_000);
    expect(reasons).toEqual(['idle']);
  });

  it('não bloqueia ao ocultar o app (padrão), mas conta o tempo fora como inatividade', () => {
    let now = 0;
    const reasons: LockReason[] = [];
    startAutoLock({
      getSettings: () => DEFAULT_SETTINGS,
      lock: (r) => reasons.push(r),
      now: () => now,
    });
    setVisibility('hidden');
    now += 5 * 60_000;
    setVisibility('visible');
    expect(reasons).toEqual([]);
    setVisibility('hidden');
    now += 11 * 60_000; // aba congelada: nenhum timer disparou
    setVisibility('visible');
    expect(reasons).toEqual(['idle']);
  });

  it('bloqueia imediatamente ao ocultar, se configurado', () => {
    const { reasons } = setup({ lockOnHide: 'immediate' });
    setVisibility('hidden');
    expect(reasons).toEqual(['hidden']);
  });

  it('abrir o seletor de arquivos não bloqueia, mesmo com "Imediatamente"', () => {
    const { reasons } = setup({ lockOnHide: 'immediate' });
    const input = document.createElement('input');
    input.type = 'file';
    document.body.append(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('visible');
    expect(reasons).toEqual([]);
    // Depois de voltar, sair do app volta a bloquear.
    setVisibility('hidden');
    expect(reasons).toEqual(['hidden']);
    input.remove();
  });

  it('respeita o atraso configurado ao ocultar', () => {
    const { reasons } = setup({ lockOnHide: '1min' });
    setVisibility('hidden');
    vi.advanceTimersByTime(30_000);
    setVisibility('visible');
    vi.advanceTimersByTime(60_000);
    expect(reasons).toEqual([]);
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    expect(reasons).toEqual(['hidden']);
  });

  it('confere o tempo ao voltar, mesmo com timers congelados', () => {
    let now = 0;
    const reasons: LockReason[] = [];
    startAutoLock({
      getSettings: () => ({ ...DEFAULT_SETTINGS, lockOnHide: '5min' }),
      lock: (r) => reasons.push(r),
      now: () => now,
    });
    setVisibility('hidden');
    now += 6 * 60_000; // aba congelada: nenhum timer disparou
    setVisibility('visible');
    expect(reasons).toEqual(['hidden']);
  });

  it('"não bloquear ao sair" ainda bloqueia ao fechar', () => {
    const { reasons } = setup({ lockOnHide: 'never', idleLockMinutes: 60 });
    setVisibility('hidden');
    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(reasons).toEqual([]);
    window.dispatchEvent(new Event('pagehide'));
    expect(reasons).toEqual(['hidden']);
  });

  it('bloqueia uma única vez e para de ouvir eventos', () => {
    const { reasons, stop } = setup({ lockOnHide: 'immediate' });
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(60 * 60_000);
    expect(reasons).toEqual(['hidden']);
    stop();
  });
});
