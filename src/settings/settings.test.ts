import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, resetSettings, updateSettings } from './settings';

beforeEach(() => {
  localStorage.clear();
  resetSettings();
});

describe('preferências', () => {
  it('padrão: 10 minutos e bloqueio imediato ao ocultar', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ idleLockMinutes: 10, lockOnHide: 'immediate' });
  });

  it('persiste e valida', () => {
    updateSettings({ idleLockMinutes: 5, lockOnHide: '1min' });
    expect(JSON.parse(localStorage.getItem('anonimizador-ip:settings') ?? '')).toMatchObject({
      idleLockMinutes: 5,
      lockOnHide: '1min',
    });
    expect(getSettings()).toMatchObject({ idleLockMinutes: 5, lockOnHide: '1min' });
  });

  it('ignora valores inválidos', () => {
    localStorage.setItem(
      'anonimizador-ip:settings',
      JSON.stringify({ idleLockMinutes: 0, lockOnHide: 'x' }),
    );
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
