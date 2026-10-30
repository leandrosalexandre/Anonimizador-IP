// Agrupamento de variantes em entidades (SPEC Fase 4): "MARIA DA SILVA SOUZA", "Maria Souza" e
// "Maria" viram a mesma pessoa quando os tokens são compatíveis. Casos ambíguos (dois "João")
// ficam como sugestão, nunca como fusão automática. Tolera erros de OCR de 1 a 2 caracteres.
import { ROLE_PRIORITY } from './types';
import type {
  Candidate,
  Decision,
  DetectedEntity,
  EntityType,
  Occurrence,
  PersonRole,
} from './types';
import { fold, isUpper, nameTokens, ocrDigits, onlyDigits, titleCase, tokensMatch } from './text';

/** Papéis de envolvidos: só são mantidos se o cargo aparecer na maioria das ocorrências. */
const INVOLVED_ROLES: ReadonlySet<PersonRole> = new Set([
  'VÍTIMA',
  'AUTOR',
  'INVESTIGADO',
  'CONDUZIDO',
]);

/** Máximo de palavras num nome "limpo" (acima disso, provavelmente pegou texto a mais). */
const MAX_CLEAN_TOKENS = 7;

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
    case 'TITULO_ELEITOR':
    case 'CNS':
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
    case 'PASSAPORTE':
    case 'PRONTUARIO':
      return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
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

/** Forma canônica preferida: a mais completa entre as "limpas", em caixa mista. */
function canonicalOf(
  members: readonly LocatedCandidate[],
  exclusions: ReadonlySet<string>,
): string {
  const best = bestVariant(members, exclusions);
  return isUpper(best) ? titleCase(best) : best;
}

/** Variante sem palavras da lista de exclusão e com no máximo 7 palavras. */
export function isCleanName(text: string, exclusions: ReadonlySet<string>): boolean {
  const tokens = nameTokens(text);
  return tokens.length <= MAX_CLEAN_TOKENS && !tokens.some((t) => exclusions.has(t));
}

function bestVariant(
  members: readonly LocatedCandidate[],
  exclusions: ReadonlySet<string>,
): string {
  const texts = members.map((m) => m.text.replace(/\s+/g, ' ').trim());
  const clean = texts.filter((t) => isCleanName(t, exclusions));
  return (
    [...(clean.length ? clean : texts)].sort((a, b) => {
      const tokens = nameTokens(b).length - nameTokens(a).length;
      if (tokens) return tokens;
      const upper = Number(isUpper(a)) - Number(isUpper(b));
      if (upper) return upper;
      // Com acentos é preferível ("Antônia" a "ANTONIA").
      const accents = b.normalize('NFD').length - b.length - (a.normalize('NFD').length - a.length);
      if (accents) return accents;
      return b.length - a.length;
    })[0] ?? ''
  );
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}`;
}

/** Membros do mesmo grupo (pai e mãe de uma filiação) nunca ficam no mesmo cluster. */
function conflicts(cluster: Cluster, c: LocatedCandidate): boolean {
  return (
    !!c.group &&
    cluster.members.some(
      (m) => m.group === c.group && (m.start !== c.start || m.pdfPage !== c.pdfPage),
    )
  );
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
    const allowed = clusters.filter((k) => !conflicts(k, c));
    const exact = allowed.filter((k) => tokensFit(tokens, k.tokens, false));
    const matches = exact.length ? exact : allowed.filter((k) => tokensFit(tokens, k.tokens, true));
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
    const allowed = clusters.filter((k) => !conflicts(k, c));
    const byFirst = allowed.filter((k) => k.tokens[0] === token);
    const exact = byFirst.length ? byFirst : allowed.filter((k) => k.tokens.includes(token));
    const matches = exact.length
      ? exact
      : allowed.filter((k) => k.tokens.some((t) => tokensMatch(token, t, true)));
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

/** Papel mais relevante entre os encontrados (VÍTIMA > AUTOR > … > FAMILIAR > PESSOA). */
function priorityRole(members: readonly LocatedCandidate[]): {
  role: PersonRole | null;
  conflicts: PersonRole[];
} {
  const roles = [...new Set(members.map((m) => m.role).filter((r): r is PersonRole => !!r))];
  roles.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));
  return { role: roles[0] ?? null, conflicts: roles.length > 1 ? roles : [] };
}

/** Valor mais frequente de um campo opcional entre os membros ({} se nenhum tiver). */
function mostCommon(
  key: 'relation' | 'position',
  members: readonly LocatedCandidate[],
): { relation?: string; position?: string } {
  const counts = new Map<string, number>();
  for (const m of members) {
    const v = m[key];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ? { [key]: best } : {};
}

export function toEntity(
  cluster: Cluster,
  exclusions: ReadonlySet<string> = new Set(),
): DetectedEntity {
  const members = cluster.members;
  const authorityVotes = members.filter((m) => m.authority).length;
  const { role, conflicts: roleConflicts } =
    cluster.type === 'PESSOA' ? priorityRole(members) : { role: null, conflicts: [] };
  // Profissional identificado pelo contexto (médico, advogado) não é "mantido" como autoridade.
  const professional = role === 'MÉDICO' || role === 'ADVOGADO';
  // Autoridade ou agente público: basta o cargo junto ao nome uma vez (o nome aparece muitas
  // vezes sozinho, em assinaturas). Só para envolvidos exige a maioria.
  const involved = role !== null && INVOLVED_ROLES.has(role);
  const decision: Decision =
    !professional && authorityVotes > 0 && (!involved || authorityVotes * 2 >= members.length)
      ? 'keep'
      : 'pseudonymize';
  const occurrences: Occurrence[] = members
    .map((m) => ({ docId: m.docId, pdfPage: m.pdfPage, start: m.start, end: m.end, text: m.text }))
    .sort((a, b) => a.docId.localeCompare(b.docId) || a.pdfPage - b.pdfPage || a.start - b.start);
  const variants = [...new Set(members.map((m) => m.text.replace(/\s+/g, ' ').trim()))];
  return {
    id: cluster.id,
    type: cluster.type,
    role,
    canonical:
      cluster.type === 'PESSOA' || cluster.type === 'APELIDO'
        ? canonicalOf(members, exclusions)
        : (variants.sort((a, b) => b.length - a.length)[0] ?? ''),
    variants,
    decision,
    confidence: Math.max(...members.map((m) => m.confidence)),
    occurrences,
    linkedTo: null,
    ambiguousWith: [...cluster.ambiguousWith],
    detectors: [...new Set(members.flatMap((m) => m.detector.split('+')))],
    suggestion: members.every((m) => m.suggestion),
    roleConflicts,
    ...mostCommon('relation', members),
    ...mostCommon('position', members),
  };
}
