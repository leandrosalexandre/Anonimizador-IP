// Reidentificação (SPEC Fase 7): troca os marcadores da análise devolvida pela IA pelos valores
// reais do cofre. Tolera variações que a IA costuma introduzir — sem colchetes ("Vítima 1"), sem
// acento ("VITIMA 1"), outra caixa ("vitima 1"), artigo ("a [VÍTIMA 1]") e plural ("as vítimas 1
// e 2") — mas só para rótulos que existem no cofre, para não trocar palavras comuns. Marcadores
// que não existem no cofre ("[VÍTIMA 9]") são relatados como desconhecidos.
import { fold } from '../detectors/text';
import { labelOf, normalizeRole } from '../review/labels';
import type { StoredEntity } from '../vault/types';

export type ReidentifyFormat = 'name' | 'nameRole';

export interface Segment {
  text: string;
  /** Trecho substituído (com o marcador original) ou marcador desconhecido. */
  kind: 'plain' | 'replaced' | 'unknown';
  original?: string;
}

export interface ReidentifyReport {
  replaced: { label: string; value: string; count: number }[];
  unknown: { text: string; count: number }[];
}

export interface ReidentifyResult {
  text: string;
  segments: Segment[];
  report: ReidentifyReport;
}

const ROLE_DESCRIPTION: Record<string, string> = {
  VÍTIMA: 'vítima',
  AUTOR: 'autor',
  INVESTIGADO: 'investigado',
  CONDUZIDO: 'conduzido',
  TESTEMUNHA: 'testemunha',
  INFORMANTE: 'informante',
  COMUNICANTE: 'comunicante',
  ADVOGADO: 'advogado',
  FAMILIAR: 'familiar',
  PESSOA: 'pessoa',
};

/** Classe de caracteres que aceita a letra com ou sem acento. */
const ACCENTS: Record<string, string> = {
  a: '[aáàâãä]',
  e: '[eéèêë]',
  i: '[iíìîï]',
  o: '[oóòôõö]',
  u: '[uúùûü]',
  c: '[cç]',
  n: '[nñ]',
};

function tolerantWord(word: string): string {
  return [...fold(word)]
    .map((ch) => {
      if (ACCENTS[ch]) return ACCENTS[ch];
      if (/\s/.test(ch)) return '\\s+';
      if (ch === '-' || ch === '/') return '[-/\\s]?';
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

interface Known {
  entity: StoredEntity;
  label: string;
}

function valueFor(entity: StoredEntity, format: ReidentifyFormat): string {
  if (format === 'nameRole' && entity.type === 'PESSOA') {
    const role = entity.role ? normalizeRole(entity.role) : 'PESSOA';
    return `${entity.canonical} (${ROLE_DESCRIPTION[role] ?? role.toLocaleLowerCase('pt-BR')})`;
  }
  return entity.canonical;
}

function joinList(values: string[], separators: string[]): string {
  let out = values[0] ?? '';
  for (let i = 1; i < values.length; i++) out += (separators[i - 1] ?? ', ') + values[i];
  return out;
}

export function reidentify(
  input: string,
  entities: readonly StoredEntity[],
  format: ReidentifyFormat = 'name',
): ReidentifyResult {
  const byId = new Map(entities.map((e) => [e.id, e]));
  // Rótulo sem colchetes → entidade ("VÍTIMA 1"); palavra do rótulo → existe no cofre.
  const known = new Map<string, Known>();
  const words = new Set<string>();
  for (const e of entities) {
    if (e.decision !== 'pseudonymize') continue;
    const label = labelOf(e, byId);
    const m = /^\[(.+) (\d+)\]$/.exec(label);
    if (!m?.[1] || !m[2]) continue;
    const word = fold(m[1]).replace(/[-/]/g, ' ').replace(/\s+/g, ' ');
    known.set(`${word} ${Number(m[2])}`, { entity: e, label });
    words.add(m[1]);
  }

  const segments: Segment[] = [];
  const replaced = new Map<string, { label: string; value: string; count: number }>();
  const unknown = new Map<string, number>();
  let pos = 0;
  const pushPlain = (end: number) => {
    if (end > pos) segments.push({ text: input.slice(pos, end), kind: 'plain' });
  };

  const alternatives = [...words].sort((a, b) => b.length - a.length).map(tolerantWord);
  // [?  PALAVRA(S)  N ( , N | e N )*  ]?
  const knownRe = alternatives.length
    ? `(\\[\\s*)?(${alternatives.join('|')})(?:e?s)?\\s*(\\d+(?:(?:\\s*,\\s*|\\s+e\\s+)\\d+)*)(?!\\d)(\\s*\\])?`
    : null;
  // Qualquer outro marcador entre colchetes com cara de rótulo: [PERITO 1], [VÍTIMA 9].
  const genericRe = '\\[\\s*\\p{Lu}[\\p{Lu}\\p{M} /-]{0,40}?\\s+\\d+\\s*\\]';
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${knownRe ? `${knownRe}|` : ''}(${genericRe}))`,
    'giu',
  );

  for (const m of input.matchAll(re)) {
    const start = m.index;
    const full = m[0];
    const generic = knownRe ? m[5] : m[1];
    if (generic) {
      pushPlain(start);
      segments.push({ text: full, kind: 'unknown' });
      unknown.set(full, (unknown.get(full) ?? 0) + 1);
      pos = start + full.length;
      continue;
    }
    const open = m[1];
    const word = fold(m[2] ?? '')
      .replace(/[-/]/g, ' ')
      .replace(/\s+/g, ' ');
    const numbersText = m[3] ?? '';
    const close = m[4];
    // Colchete só de um lado não conta como parte do marcador.
    const end = start + full.length - (close && !open ? close.length : 0);
    const begin = open && !close ? start + open.length : start;
    const numbers = [...numbersText.matchAll(/\d+/g)].map((n) => Number(n[0]));
    const separators = [...numbersText.matchAll(/\s*,\s*|\s+e\s+/g)].map((s) =>
      s[0].includes(',') ? ', ' : ' e ',
    );
    const hits = numbers.map((n) => known.get(`${word} ${n}`));
    pushPlain(begin);
    const original = input.slice(begin, end);
    if (hits.every((h): h is Known => !!h)) {
      const value = joinList(
        hits.map((h) => valueFor(h.entity, format)),
        separators,
      );
      segments.push({ text: value, kind: 'replaced', original });
      for (const h of hits) {
        const r = replaced.get(h.label) ?? {
          label: h.label,
          value: valueFor(h.entity, 'name'),
          count: 0,
        };
        r.count++;
        replaced.set(h.label, r);
      }
    } else {
      segments.push({ text: original, kind: 'unknown' });
      unknown.set(original, (unknown.get(original) ?? 0) + 1);
    }
    pos = end;
  }
  pushPlain(input.length);

  return {
    text: segments.map((s) => s.text).join(''),
    segments,
    report: {
      replaced: [...replaced.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      unknown: [...unknown].map(([text, count]) => ({ text, count })),
    },
  };
}
