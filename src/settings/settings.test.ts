import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, resetSettings, updateSettings } from './settings';

beforeEach(() => {
  localStorage.clear();
  resetSettings();
});

describe('preferências', () => {
  it('padrão: 10 minutos e sem bloqueio ao ocultar', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ idleLockMinutes: 10, lockOnHide: 'never' });
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

  it('versão antiga: "imediato" gravado como padrão passa ao novo padrão', () => {
    localStorage.setItem(
      'anonimizador-ip:settings',
      JSON.stringify({ idleLockMinutes: 5, lockOnHide: 'immediate', ocrBinarize: true }),
    );
    expect(getSettings()).toMatchObject({ idleLockMinutes: 5, lockOnHide: 'never' });
  });

  it('escolha atual de "imediato" é mantida', () => {
    localStorage.setItem(
      'anonimizador-ip:settings',
      JSON.stringify({ lockOnHide: 'immediate', version: 2 }),
    );
    expect(getSettings().lockOnHide).toBe('immediate');
  });
});
