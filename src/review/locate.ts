// Localiza as ocorrências das entidades no texto das páginas e gera o texto pseudonimizado.
// Uma regex por página com todas as variantes, das mais longas para as mais curtas: em cada
// posição vence a variante mais longa, e os trechos não se sobrepõem (SPEC Fase 6: "substituir
// da maior para a menor variante, para não quebrar nomes compostos").
import { fold, nameTokens } from '../detectors/text';
import type { StoredEntity } from '../vault/types';

export interface PageRef {
  docId: string;
  pdfPage: number;
  text: string;
}

export interface Located {
  entityId: string;
  start: number;
  end: number;
  text: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = (s: string) => fold(s).replace(/\s+/g, ' ').trim();

export interface Locator {
  locate(text: string): Located[];
}

/** Prepara a busca de todas as variantes das entidades (pseudonimizar e manter). */
export function buildLocator(entities: readonly StoredEntity[]): Locator {
  const owner = new Map<string, StoredEntity>();
  const singleToken = new Set<string>();
  const variants: string[] = [];
  for (const e of entities) {
    for (const v of e.variants) {
      const k = key(v);
      if (!k || owner.has(k)) continue;
      owner.set(k, e);
      variants.push(v);
      if (e.type === 'PESSOA' && nameTokens(v).length === 1) singleToken.add(k);
    }
  }
  if (!variants.length) return { locate: () => [] };
  const alternatives = [...variants]
    .sort((a, b) => b.length - a.length)
    .map((v) => escape(v.trim()).replace(/\s+/g, '\\s+'));
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );

  return {
    locate(text: string): Located[] {
      const out: Located[] = [];
      for (const m of text.matchAll(re)) {
        const k = key(m[0]);
        const entity = owner.get(k);
        if (!entity) continue;
        // Prenome isolado ("Maria") só quando escrito com inicial maiúscula.
        if (singleToken.has(k) && !/^\p{Lu}/u.test(m[0])) continue;
        out.push({ entityId: entity.id, start: m.index, end: m.index + m[0].length, text: m[0] });
      }
      return out;
    },
  };
}

/** Substitui as ocorrências das entidades a pseudonimizar pelos marcadores. */
export function substitute(
  text: string,
  located: readonly Located[],
  labelFor: (entityId: string) => string | null,
): string {
  let out = '';
  let pos = 0;
  for (const l of located) {
    const label = labelFor(l.entityId);
    if (label === null) continue;
    out += text.slice(pos, l.start) + label;
    pos = l.end;
  }
  return out + text.slice(pos);
}
