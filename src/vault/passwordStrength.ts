// Indicador de força da senha, sem bibliotecas externas. Estima a entropia pelo tamanho e pelas
// classes de caracteres e penaliza padrões óbvios (repetições, sequências, palavras comuns).

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  level: StrengthLevel;
  label: string;
  /** Entropia aproximada, em bits. */
  bits: number;
  hints: string[];
}

export const MIN_PASSWORD_LENGTH = 10;
/** Nível mínimo aceito na criação do cofre. */
export const MIN_ACCEPTED_LEVEL: StrengthLevel = 2;

const LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'] as const;

const COMMON = [
  'senha',
  'password',
  '123456',
  'qwerty',
  'abc123',
  'admin',
  'brasil',
  'policia',
  'delegado',
  'delegacia',
  'inquerito',
  'ceara',
  'fortaleza',
  'iloveyou',
  'mudar',
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function charsetSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33;
  return size;
}

/** Reduz sequências ("abcd", "4321") e repetições ("aaaa") de 3+ caracteres ao primeiro. */
function collapsePatterns(text: string): { reduced: string; repeated: boolean; sequence: boolean } {
  const chars = Array.from(text);
  let reduced = '';
  let repeated = false;
  let sequence = false;
  let i = 0;
  while (i < chars.length) {
    let j = i + 1;
    const step = (chars[j]?.codePointAt(0) ?? NaN) - (chars[i]?.codePointAt(0) ?? NaN);
    if (Math.abs(step) <= 1) {
      while (
        j < chars.length &&
        (chars[j]?.codePointAt(0) ?? NaN) - (chars[j - 1]?.codePointAt(0) ?? NaN) === step
      ) {
        j++;
      }
    }
    if (j - i >= 3) {
      if (step === 0) repeated = true;
      else sequence = true;
      reduced += chars[i];
      i = j;
    } else {
      reduced += chars[i];
      i++;
    }
  }
  return { reduced, repeated, sequence };
}

export function estimatePasswordStrength(password: string): PasswordStrength {
  const hints: string[] = [];
  if (!password) return { level: 0, label: LABELS[0], bits: 0, hints };

  const chars = Array.from(password);
  let rest = stripAccents(password.toLowerCase());
  let commonWords = 0;
  for (const word of COMMON) {
    if (rest.includes(word)) {
      commonWords++;
      rest = rest.split(word).join('');
    }
  }
  if (commonWords > 0) {
    hints.push('Evite palavras óbvias como "senha", "delegacia" ou "123456".');
  }
  const { reduced, repeated, sequence } = collapsePatterns(rest);
  if (repeated) hints.push('Evite repetir o mesmo caractere.');
  if (sequence) hints.push('Evite sequências como "abcd" ou "1234".');

  // Cada palavra óbvia vale ~10 bits; o restante, pelo tamanho e pelas classes de caracteres.
  let bits = Array.from(reduced).length * Math.log2(Math.max(charsetSize(password), 1));
  bits += commonWords * 10;

  // Frases de palavras comuns: cada palavra vale ~13 bits (vocabulário de ~8 mil palavras),
  // menos do que a contagem por caractere sugere.
  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => /^\p{L}+$/u.test(w))) {
    bits = Math.min(bits, words.length * 13 + commonWords * 10);
  }

  if (chars.length < MIN_PASSWORD_LENGTH) {
    hints.push(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (chars.length < 16 && hints.length === 0) {
    hints.push('Uma frase com 4 ou mais palavras é fácil de lembrar e muito segura.');
  }

  bits = Math.max(0, Math.round(bits));
  let level: StrengthLevel;
  if (chars.length < MIN_PASSWORD_LENGTH || bits < 35) level = bits < 20 ? 0 : 1;
  else if (bits < 50) level = 2;
  else if (bits < 70) level = 3;
  else level = 4;

  return { level, label: LABELS[level], bits, hints };
}
