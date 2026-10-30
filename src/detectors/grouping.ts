// Agrupamento de variantes em entidades (SPEC Fase 4): "MARIA DA SILVA SOUZA", "Maria Souza" e
// "Maria" viram a mesma pessoa quando os tokens são compatíveis. Casos ambíguos (dois "João")
// ficam como sugestão, nunca como fusão automática. Tolera erros de OCR de 1 a 2 caracteres.
import type {
  Candidate,
  Decision,
  DetectedEntity,
  EntityType,
  Occurrence,
  PersonRole,
} from './types';
import { fold, isUpper, nameTokens, ocrDigits, onlyDigits, titleCase, tokensMatch } from './text';

export interface LocatedCandidate extends Candidate {
  docId: string;
  pdfPage: number;
}

interface Cluster {
  id: string;
  type: EntityType;
  tokens: string[];
  members: LocatedCandidate[];
  ambiguousWith: Set<string>;
}

/** Valor normalizado para agrupar dados (não pessoas). */
export function dataKey(type: EntityType, text: string): string {
  switch (type) {
    case 'CPF':
    case 'CNPJ':
    case 'TELEFONE':
    case 'CEP':
    case 'NUM_PROCESSO':
    case 'CNH':
    case 'RG': {
      const digits = onlyDigits(ocrDigits(text));
      // Telefone com e sem DDD/+55: agrupa pelos 8 últimos dígitos e DDD quando houver.
      if (type === 'TELEFONE') return digits.replace(/^55(?=\d{10,11}$)/, '');
      return digits;
    }
    case 'PLACA':
    case 'CHASSI_RENAVAM':
      return text
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/O(?=\d*$)/g, '0');
    case 'EMAIL':
      return fold(text)
        .replace(/&?q(?=[a-z0-9-]+\.)/, '@')
        .replace(/\(@|@\)/, '@');
    case 'CHAVE_PIX':
      return text.toLowerCase().replace(/\s+/g, '');
    case 'CONTA_BANCARIA':
    case 'NUM_BO':
    case 'NUM_IP':
    case 'DATA_NASCIMENTO':
      return onlyDigits(text);
    default:
      return fold(text)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
  }
}

/** Os tokens de `small` cabem em `big` (cada um casa com um token distinto)? */
function tokensFit(small: string[], big: string[], fuzzy: boolean): boolean {
  const used = new Set<number>();
  for (const t of small) {
    const idx = big.findIndex((b, i) => !used.has(i) && tokensMatch(t, b, fuzzy));
    if (idx < 0) return false;
    used.add(idx);
  }
  return true;
}

/** Forma canônica preferida: a mais longa, em caixa mista ("MARIA DA SILVA" → "Maria da Silva"). */
function canonicalOf(members: readonly LocatedCandidate[]): string {
  const best = bestVariant(members);
  return isUpper(best) ? titleCase(best) : best;
}

function bestVariant(members: readonly LocatedCandidate[]): string {
  const texts = members.map((m) => m.text.replace(/\s+/g, ' ').trim());
  return (
    [...texts].sort((a, b) => {
      const tokens = nameTokens(b).length - nameTokens(a).length;
      if (tokens) return tokens;
      const upper = Number(isUpper(a)) - Number(isUpper(b));
      if (upper) return upper;
      return b.length - a.length;
    })[0] ?? ''
  );
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}`;
}

/** Agrupa pessoas (e apelidos) por compatibilidade de tokens. */
export function clusterPeople(
  candidates: readonly LocatedCandidate[],
  type: 'PESSOA' | 'APELIDO',
): Cluster[] {
  const clusters: Cluster[] = [];
  const ordered = [...candidates].sort(
    (a, b) => nameTokens(b.text).length - nameTokens(a.text).length || b.confidence - a.confidence,
  );
  const pendingShort: LocatedCandidate[] = [];

  for (const c of ordered) {
    const tokens = nameTokens(c.text);
    if (!tokens.length) continue;
    // Nomes com 1 token são resolvidos depois que todos os nomes completos formaram grupos.
    if (tokens.length === 1 && type === 'PESSOA') {
      pendingShort.push(c);
      continue;
    }
    const exact = clusters.filter((k) => tokensFit(tokens, k.tokens, false));
    const matches = exact.length
      ? exact
      : clusters.filter((k) => tokensFit(tokens, k.tokens, true));
    if (matches.length === 1 && matches[0]) {
      matches[0].members.push(c);
    } else {
      const cluster: Cluster = {
        id: newId(type === 'PESSOA' ? 'p' : 'a'),
        type,
        tokens,
        members: [c],
        ambiguousWith: new Set(),
      };
      for (const m of matches) cluster.ambiguousWith.add(m.id);
      clusters.push(cluster);
    }
  }

  for (const c of pendingShort) {
    const token = nameTokens(c.text)[0] ?? '';
    // Prefere casar com o primeiro nome; depois com qualquer token.
    const byFirst = clusters.filter((k) => k.tokens[0] === token);
    const exact = byFirst.length ? byFirst : clusters.filter((k) => k.tokens.includes(token));
    const matches = exact.length
      ? exact
      : clusters.filter((k) => k.tokens.some((t) => tokensMatch(token, t, true)));
    if (matches.length === 1 && matches[0]) {
      matches[0].members.push(c);
    } else {
      const cluster: Cluster = {
        id: newId('p'),
        type,
        tokens: [token],
        members: [c],
        ambiguousWith: new Set(),
      };
      for (const m of matches) cluster.ambiguousWith.add(m.id);
      clusters.push(cluster);
    }
  }
  return clusters;
}

/** Agrupa dados pelo valor normalizado; endereços curtos vão para o endereço completo único. */
export function clusterData(candidates: readonly LocatedCandidate[]): Cluster[] {
  const byKey = new Map<string, Cluster>();
  for (const c of candidates) {
    const key = `${c.type}:${dataKey(c.type, c.text)}`;
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = {
        id: newId('d'),
        type: c.type,
        tokens: [key],
        members: [],
        ambiguousWith: new Set(),
      };
      byKey.set(key, cluster);
    }
    cluster.members.push(c);
  }
  // "Rua das Acácias" → "Rua das Acácias, nº 145, …" quando há um único endereço que começa assim.
  const clusters = [...byKey.values()];
  const addresses = clusters.filter((k) => k.type === 'ENDERECO');
  for (const short of addresses) {
    const key = short.tokens[0] ?? '';
    const longer = addresses.filter(
      (k) => k !== short && (k.tokens[0] ?? '').startsWith(`${key} `),
    );
    if (longer.length === 1 && longer[0]) {
      longer[0].members.push(...short.members);
      short.members = [];
    } else if (longer.length > 1) {
      for (const l of longer) short.ambiguousWith.add(l.id);
    }
  }
  return clusters.filter((k) => k.members.length > 0);
}

function majorityRole(members: readonly LocatedCandidate[]): PersonRole | null {
  const counts = new Map<PersonRole, number>();
  for (const m of members) if (m.role) counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
  let best: PersonRole | null = null;
  let max = 0;
  for (const [role, n] of counts) {
    if (n > max) {
      best = role;
      max = n;
    }
  }
  return best;
}

export function toEntity(cluster: Cluster): DetectedEntity {
  const members = cluster.members;
  const authorityVotes = members.filter((m) => m.authority).length;
  const decision: Decision =
    authorityVotes > 0 && authorityVotes * 2 >= members.length ? 'keep' : 'pseudonymize';
  const occurrences: Occurrence[] = members
    .map((m) => ({ docId: m.docId, pdfPage: m.pdfPage, start: m.start, end: m.end, text: m.text }))
    .sort((a, b) => a.docId.localeCompare(b.docId) || a.pdfPage - b.pdfPage || a.start - b.start);
  const variants = [...new Set(members.map((m) => m.text.replace(/\s+/g, ' ').trim()))];
  const role = cluster.type === 'PESSOA' ? majorityRole(members) : null;
  return {
    id: cluster.id,
    type: cluster.type,
    role,
    canonical:
      cluster.type === 'PESSOA' || cluster.type === 'APELIDO'
        ? canonicalOf(members)
        : (variants.sort((a, b) => b.length - a.length)[0] ?? ''),
    variants,
    decision,
    confidence: Math.max(...members.map((m) => m.confidence)),
    occurrences,
    linkedTo: null,
    ambiguousWith: [...cluster.ambiguousWith],
    detectors: [...new Set(members.flatMap((m) => m.detector.split('+')))],
  };
}
