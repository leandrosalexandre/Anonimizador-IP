import { describe, expect, it } from 'vitest';
import { MIN_ACCEPTED_LEVEL, estimatePasswordStrength } from './passwordStrength';

describe('força da senha', () => {
  it.each(['', '123', 'senha123', 'aaaaaaaaaaaa', 'delegacia2026', 'abcdefghij'])(
    'considera "%s" insuficiente',
    (pw) => {
      expect(estimatePasswordStrength(pw).level).toBeLessThan(MIN_ACCEPTED_LEVEL);
    },
  );

  it.each(['cavalo bateria grampo correto', 'Tr7#kq9!Lm2$', 'mesa azul chuva pedra 42'])(
    'aceita "%s"',
    (pw) => {
      expect(estimatePasswordStrength(pw).level).toBeGreaterThanOrEqual(MIN_ACCEPTED_LEVEL);
    },
  );

  it('avalia frases pelo número de palavras', () => {
    expect(estimatePasswordStrength('girassol tapete').level).toBeLessThan(MIN_ACCEPTED_LEVEL);
    expect(estimatePasswordStrength('girassol tapete nuvem bicicleta').level).toBe(3);
    expect(estimatePasswordStrength('girassol tapete nuvem bicicleta laranja mesa').level).toBe(4);
  });

  it('dá dicas em português', () => {
    expect(estimatePasswordStrength('senha').hints.join(' ')).toMatch(/pelo menos 10/);
  });
});
