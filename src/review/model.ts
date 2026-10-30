// Operações da revisão (SPEC Fase 5). Funções puras: recebem o conteúdo do cofre e devolvem o
// novo conteúdo; a tela grava o resultado (cifrado) e tudo vale para o cofre inteiro.
import type { DetectedEntity, EntityType } from '../detectors/types';
import { fold } from '../detectors/text';
import type { StoredEntity, VaultContent } from '../vault/types';
import { duplicateLabels, indexScope, nextIndex, normalizeRole } from './labels';

const vkey = (s: string) => fold(s).replace(/\s+/g, ' ').trim();

function newId(): string {
  return crypto.randomUUID();
}

function withEntities(content: VaultContent, entities: StoredEntity[]): VaultContent {
  return { ...content, entities };
}

function update(
  content: VaultContent,
  id: string,
  fn: (e: StoredEntity) => StoredEntity,
): VaultContent {
  return withEntities(
    content,
    content.entities.map((e) => (e.id === id ? fn(e) : e)),
  );
}

/**
 * Incorpora o resultado da detecção. Entidades já existentes (mesmo tipo e alguma variante em
 * comum) mantêm papel, número e decisão e só ganham variantes novas. Variantes descartadas antes
 * não voltam. Números novos continuam a sequência existente.
 */
export function applyDetection(
  content: VaultContent,
  detected: readonly DetectedEntity[],
): VaultContent {
  const dismissed = new Set((content.config.dismissed ?? []).map(vkey));
  const entities = content.entities.map((e) => ({ ...e, variants: [...e.variants] }));
  const idMap = new Map<string, string>();

  for (const d of detected) {
    const variants = d.variants.filter((v) => !dismissed.has(vkey(v)));
    if (!variants.length) continue;
    const keys = new Set(variants.map(vkey));
    const existing = entities.find(
      (e) => e.type === d.type && e.variants.some((v) => keys.has(vkey(v))),
    );
    if (existing) {
      for (const v of variants) {
        if (!existing.variants.some((x) => vkey(x) === vkey(v))) existing.variants.push(v);
      }
      idMap.set(d.id, existing.id);
      continue;
    }
    const role = d.type === 'PESSOA' ? d.role : null;
    const entity: StoredEntity = {
      id: newId(),
      type: d.type,
      role,
      index: null,
      canonical: d.canonical,
      variants,
      decision: d.decision,
      reviewed: false,
      linkedTo: null,
      ambiguousWith: [],
      source: 'detected',
      confidence: d.confidence,
    };
    if (entity.decision === 'pseudonymize') entity.index = nextIndex(entities, entity);
    entities.push(entity);
    idMap.set(d.id, entity.id);
  }

  // Vínculos e ambiguidades usam os ids do cofre.
  for (const d of detected) {
    const id = idMap.get(d.id);
    const e = entities.find((x) => x.id === id);
    if (!e) continue;
    if (!e.linkedTo && d.linkedTo) e.linkedTo = idMap.get(d.linkedTo) ?? null;
    const amb = d.ambiguousWith
      .map((a) => idMap.get(a))
      .filter((a): a is string => !!a && a !== e.id);
    e.ambiguousWith = [...new Set([...e.ambiguousWith, ...amb])];
  }

  return {
    ...content,
    entities,
    config: { ...content.config, detectedAt: new Date().toISOString() },
  };
}

/** Atribui o papel (pessoas). O número é o próximo livre no papel, salvo se informado. */
export function assignRole(
  content: VaultContent,
  id: string,
  role: string | null,
  index?: number,
): VaultContent {
  const normalized = role ? normalizeRole(role) : null;
  return update(content, id, (e) => {
    const next = { ...e, role: normalized };
    const sameScope = indexScope(e) === indexScope(next);
    return {
      ...next,
      index:
        index ??
        (sameScope && e.index !== null ? e.index : nextIndex(content.entities, next, e.id)),
      decision: 'pseudonymize',
      reviewed: true,
    };
  });
}

export function setIndex(content: VaultContent, id: string, index: number): VaultContent {
  return update(content, id, (e) => ({ ...e, index, reviewed: true }));
}

/** Pseudonimizar ou manter (autoridades, órgãos públicos). */
export function setDecision(
  content: VaultContent,
  id: string,
  decision: StoredEntity['decision'],
): VaultContent {
  return update(content, id, (e) => ({
    ...e,
    decision,
    index:
      decision === 'pseudonymize' && e.index === null
        ? nextIndex(content.entities, e, e.id)
        : e.index,
    reviewed: true,
  }));
}

/** Aceita as sugestões (papel, decisão) sem alterá-las. */
export function confirm(content: VaultContent, ids: readonly string[]): VaultContent {
  const set = new Set(ids);
  return withEntities(
    content,
    content.entities.map((e) => (set.has(e.id) ? { ...e, reviewed: true } : e)),
  );
}

export function setCanonical(content: VaultContent, id: string, canonical: string): VaultContent {
  const value = canonical.trim();
  if (!value) return content;
  return update(content, id, (e) => ({
    ...e,
    canonical: value,
    variants: e.variants.some((v) => vkey(v) === vkey(value)) ? e.variants : [...e.variants, value],
    reviewed: true,
  }));
}

/** Vincula um dado (CPF, endereço, apelido…) a uma pessoa. */
export function link(content: VaultContent, id: string, personId: string | null): VaultContent {
  return update(content, id, (e) => ({ ...e, linkedTo: personId, reviewed: true }));
}

function replaceReferences(
  entities: StoredEntity[],
  from: Set<string>,
  to: string | null,
): StoredEntity[] {
  return entities.map((e) => ({
    ...e,
    linkedTo: e.linkedTo && from.has(e.linkedTo) ? to : e.linkedTo,
    ambiguousWith: e.ambiguousWith.filter((a) => !from.has(a) && a !== to),
  }));
}

/** Mescla várias entidades na primeira: une as variantes e mantém papel, número e decisão dela. */
export function merge(content: VaultContent, ids: readonly string[]): VaultContent {
  const [targetId, ...others] = ids;
  const target = content.entities.find((e) => e.id === targetId);
  if (!target || !others.length) return content;
  const absorbed = new Set(others);
  const variants = [...target.variants];
  for (const e of content.entities) {
    if (!absorbed.has(e.id)) continue;
    for (const v of e.variants) if (!variants.some((x) => vkey(x) === vkey(v))) variants.push(v);
  }
  const canonical = [...variants].sort((a, b) => b.length - a.length)[0] ?? target.canonical;
  const entities = content.entities
    .filter((e) => !absorbed.has(e.id))
    .map((e) =>
      e.id === target.id
        ? {
            ...e,
            variants,
            canonical: target.canonical.length >= canonical.length ? target.canonical : canonical,
            reviewed: true,
          }
        : e,
    );
  return withEntities(content, replaceReferences(entities, absorbed, target.id));
}

/** Separa uma variante numa entidade nova, a revisar. */
export function splitVariant(content: VaultContent, id: string, variant: string): VaultContent {
  const source = content.entities.find((e) => e.id === id);
  if (!source || source.variants.length < 2) return content;
  const entities = content.entities.map((e) =>
    e.id === id
      ? {
          ...e,
          variants: e.variants.filter((v) => v !== variant),
          canonical:
            e.canonical === variant
              ? (e.variants.find((v) => v !== variant) ?? e.canonical)
              : e.canonical,
        }
      : e,
  );
  const created: StoredEntity = {
    id: newId(),
    type: source.type,
    role: null,
    index: null,
    canonical: variant,
    variants: [variant],
    decision: 'pseudonymize',
    reviewed: false,
    linkedTo: null,
    ambiguousWith: [id],
    source: 'manual',
    confidence: source.confidence,
  };
  created.index = nextIndex(entities, created);
  return withEntities(content, [...entities, created]);
}

/** Descarta (falso positivo). As variantes ficam lembradas para não voltarem na detecção. */
export function discard(content: VaultContent, id: string): VaultContent {
  const entity = content.entities.find((e) => e.id === id);
  if (!entity) return content;
  const entities = replaceReferences(
    content.entities.filter((e) => e.id !== id),
    new Set([id]),
    null,
  );
  const dismissed = [...new Set([...(content.config.dismissed ?? []), ...entity.variants])];
  return { ...content, entities, config: { ...content.config, dismissed } };
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

/** Marca manualmente um trecho como nova entidade (ou variante de uma existente). */
export function addManual(
  content: VaultContent,
  text: string,
  type: EntityType,
  options: { role?: string | null; addToId?: string } = {},
): { content: VaultContent; id: string } {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length < 2)
    throw new SelectionError('Selecione um trecho com pelo menos 2 caracteres.');
  if (value.length > 200)
    throw new SelectionError('Trecho longo demais. Selecione só o dado pessoal.');
  const existing = content.entities.find((e) => e.variants.some((v) => vkey(v) === vkey(value)));
  if (existing && !options.addToId) return { content, id: existing.id };

  const dismissed = (content.config.dismissed ?? []).filter((d) => vkey(d) !== vkey(value));
  const config = { ...content.config, dismissed };

  if (options.addToId) {
    // Remove a variante de outra entidade, se já estava lá.
    const entities = content.entities.map((e) =>
      e.id === options.addToId
        ? {
            ...e,
            variants: e.variants.some((v) => vkey(v) === vkey(value))
              ? e.variants
              : [...e.variants, value],
            reviewed: true,
          }
        : { ...e, variants: e.variants.filter((v) => vkey(v) !== vkey(value)) },
    );
    return {
      content: { ...content, config, entities: entities.filter((e) => e.variants.length > 0) },
      id: options.addToId,
    };
  }

  const role = type === 'PESSOA' && options.role ? normalizeRole(options.role) : null;
  const entity: StoredEntity = {
    id: newId(),
    type,
    role,
    index: null,
    canonical: value,
    variants: [value],
    decision: 'pseudonymize',
    reviewed: true,
    linkedTo: null,
    ambiguousWith: [],
    source: 'manual',
    confidence: 1,
  };
  entity.index = nextIndex(content.entities, entity);
  return {
    content: { ...content, config, entities: [...content.entities, entity] },
    id: entity.id,
  };
}

/** Papéis personalizados criados pelo usuário. */
export function addCustomRole(content: VaultContent, role: string): VaultContent {
  const normalized = normalizeRole(role);
  if (!normalized || content.config.customRoles.includes(normalized)) return content;
  return {
    ...content,
    config: { ...content.config, customRoles: [...content.config.customRoles, normalized] },
  };
}

export interface ReviewProgress {
  total: number;
  reviewed: number;
  pendingPeople: number;
}

export function reviewProgress(entities: readonly StoredEntity[]): ReviewProgress {
  return {
    total: entities.length,
    reviewed: entities.filter((e) => e.reviewed).length,
    pendingPeople: entities.filter((e) => e.type === 'PESSOA' && !e.reviewed).length,
  };
}

/** Confirma itens da varredura residual como "não é dado pessoal" (não voltam a aparecer). */
export function ignoreResidual(content: VaultContent, keys: readonly string[]): VaultContent {
  const current = content.config.residualIgnored ?? [];
  return {
    ...content,
    config: { ...content.config, residualIgnored: [...new Set([...current, ...keys])] },
  };
}

/** A exportação fica bloqueada sem revisão, com pessoa pendente ou marcador repetido. */
export function exportBlocked(content: VaultContent): boolean {
  return (
    content.entities.length === 0 ||
    reviewProgress(content.entities).pendingPeople > 0 ||
    duplicateLabels(content.entities).length > 0
  );
}
