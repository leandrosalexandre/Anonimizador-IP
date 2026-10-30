// Alertas da revisão: nomes que provavelmente pegaram texto a mais ou que parecem ser a mesma
// pessoa de outra entidade.
import { buildExclusions } from '../detectors/lexicon';
import { fold, nameTokens } from '../detectors/text';
import type { StoredEntity } from '../vault/types';

export type EntityWarning = 'long' | 'excluded' | 'ambiguous' | 'roles';

export const WARNING_TEXT: Record<EntityWarning, string> = {
  long: 'Nome com mais de 7 palavras: pode ter pegado texto a mais.',
  excluded: 'Contém palavra que não costuma ser nome (rótulo, lugar, termo técnico).',
  ambiguous: 'Possível mesma pessoa de outra entidade.',
  roles: 'Papéis diferentes nas peças do inquérito.',
};

export const WARNING_BADGE: Record<EntityWarning, string> = {
  long: 'nome longo',
  excluded: 'palavra suspeita',
  ambiguous: 'mesma pessoa?',
  roles: 'papéis diferentes',
};

let cached: { key: string; set: ReadonlySet<string> } | null = null;
function exclusionsFor(extra: readonly string[]): ReadonlySet<string> {
  const key = extra.join('\n');
  if (cached?.key !== key) cached = { key, set: buildExclusions(extra) };
  return cached.set;
}

/** Palavras do nome que estão na lista de exclusão (candidatas a "Limpar nome"). */
export function suspiciousWords(entity: StoredEntity, extra: readonly string[] = []): string[] {
  if (entity.type !== 'PESSOA') return [];
  const exclusions = exclusionsFor(extra);
  return entity.canonical
    .split(/\s+/)
    .filter((w) => exclusions.has(fold(w).replace(/[.:,;]+$/, '')));
}

export function entityWarnings(
  entity: StoredEntity,
  extraExclusions: readonly string[] = [],
): EntityWarning[] {
  const out: EntityWarning[] = [];
  if (entity.type === 'PESSOA') {
    if (nameTokens(entity.canonical).length > 7) out.push('long');
    if (suspiciousWords(entity, extraExclusions).length) out.push('excluded');
    if ((entity.roleConflicts?.length ?? 0) > 1) out.push('roles');
  }
  if (entity.ambiguousWith.length) out.push('ambiguous');
  return out;
}

/** Trecho de contexto: até `words` palavras antes e depois da ocorrência. */
export function contextAround(
  text: string,
  start: number,
  end: number,
  words = 10,
): { before: string; hit: string; after: string } {
  const beforeWords = text.slice(0, start).split(/\s+/).filter(Boolean).slice(-words);
  const afterWords = text.slice(end).split(/\s+/).filter(Boolean).slice(0, words);
  return {
    before: beforeWords.join(' '),
    hit: text.slice(start, end).replace(/\s+/g, ' '),
    after: afterWords.join(' '),
  };
}

/**
 * Parágrafo inteiro em volta da ocorrência (entre linhas em branco). Sem linhas em branco
 * (texto de PDF), as 3 linhas antes e depois. No máximo ~900 caracteres.
 */
export function paragraphAround(
  text: string,
  start: number,
  end: number,
  max = 900,
): { start: number; end: number } {
  const blankBefore = /\n[ \t]*\n(?![\s\S]*\n[ \t]*\n)/.exec(text.slice(0, start));
  let from = blankBefore ? blankBefore.index + blankBefore[0].length : 0;
  const after = text.slice(end).search(/\n[ \t]*\n/);
  let to = after >= 0 ? end + after : text.length;
  if (to - from > max) {
    const lines = (i: number, dir: -1 | 1, n: number) => {
      let pos = i;
      for (let k = 0; k < n; k++) {
        const next = dir < 0 ? text.lastIndexOf('\n', pos - 1) : text.indexOf('\n', pos + 1);
        if (next < 0) return dir < 0 ? 0 : text.length;
        pos = next;
      }
      return dir < 0 ? pos + 1 : pos;
    };
    from = Math.max(from, lines(start, -1, 3), start - max / 2);
    to = Math.min(to, lines(end, 1, 3), end + max / 2);
  }
  return { start: from, end: to };
}
