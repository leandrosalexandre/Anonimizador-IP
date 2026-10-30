// Utilitários de texto para os detectores.

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Minúsculas, sem acentos. */
export function fold(s: string): string {
  return stripAccents(s).toLowerCase();
}

export const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', "d'"]);

/** Tokens normalizados de um nome, sem partículas. */
export function nameTokens(name: string): string[] {
  return fold(name)
    .split(/[^a-z0-9']+/)
    .filter((t) => t && !PARTICLES.has(t));
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** Corrige trocas comuns do OCR em trechos que deveriam ser só números. */
export function ocrDigits(s: string): string {
  return s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** Tolerância a erro de OCR por tamanho do token (SPEC: 1 a 2 caracteres em nomes longos). */
export function tokenTolerance(token: string): number {
  if (token.length >= 9) return 2;
  if (token.length >= 5) return 1;
  return 0;
}

export function tokensMatch(a: string, b: string, fuzzy: boolean): boolean {
  if (a === b) return true;
  if (!fuzzy) return false;
  // Masculino e feminino do mesmo prenome são pessoas diferentes ("Francisco" × "Francisca").
  if (
    a.length === b.length &&
    a.slice(0, -1) === b.slice(0, -1) &&
    /[oa]/.test(a.slice(-1) + b.slice(-1))
  )
    return false;
  const tol = Math.min(tokenTolerance(a), tokenTolerance(b));
  return tol > 0 && levenshtein(a, b, tol) <= tol;
}

const ACCENT_CLASSES: Record<string, string> = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôõö',
  u: 'uúùûü',
  c: 'cç',
  n: 'nñ',
};

/** Padrão de regex que casa `s` com ou sem acentos (usar com a flag "i" para ignorar a caixa). */
export function accentInsensitive(s: string): string {
  return [...s.trim()]
    .map((ch) => {
      if (/\s/.test(ch)) return '\\s+';
      const base = stripAccents(ch).toLowerCase();
      const cls = ACCENT_CLASSES[base];
      if (cls) return `[${cls}${cls.toUpperCase()}]`;
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('')
    .replace(/(?:\\s\+)+/g, '\\s+');
}

/** Todas as ocorrências de `needle` em `text`, em limites de palavra. */
export function findAll(text: string, needle: string, caseSensitive = false): [number, number][] {
  if (!needle) return [];
  // Sem diferenciar caixa, também não diferencia acentos ("ANTONIA" = "Antônia").
  const escaped = caseSensitive
    ? needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    : accentInsensitive(needle);
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    caseSensitive ? 'gu' : 'giu',
  );
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}

export function isUpper(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

/** "MARIA DA SILVA" → "Maria da Silva". */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (PARTICLES.has(w) && i > 0 ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join('');
}
