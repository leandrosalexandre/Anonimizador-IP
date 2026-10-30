// Operações da revisão (SPEC Fase 5). Funções puras: recebem o conteúdo do cofre e devolvem o
// novo conteúdo; a tela grava o resultado (cifrado) e tudo vale para o cofre inteiro.
import { ROLE_PRIORITY, type DetectedEntity, type EntityType } from '../detectors/types';
import { fold, nameTokens, PARTICLES } from '../detectors/text';
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
 * Renumera os marcadores de cada papel/tipo sem lacunas (VÍTIMA 1, VÍTIMA 2…), na ordem atual.
 * Só enquanto nenhum texto foi exportado: depois disso, uma análise devolvida pela IA usa os
 * números antigos, e renumerar trocaria as pessoas na reidentificação.
 */
export function compactIndexes(content: VaultContent): VaultContent {
  if (content.config.exportedAt) return content;
  const byScope = new Map<string, StoredEntity[]>();
  for (const e of content.entities) {
    if (e.decision !== 'pseudonymize' || e.index === null) continue;
    const key = indexScope(e);
    byScope.set(key, [...(byScope.get(key) ?? []), e]);
  }
  const next = new Map<string, number>();
  for (const list of byScope.values()) {
    list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).forEach((e, i) => next.set(e.id, i + 1));
  }
  let changed = false;
  const entities = content.entities.map((e) => {
    const index = e.decision === 'pseudonymize' ? (next.get(e.id) ?? e.index) : null;
    if (index === e.index) return e;
    changed = true;
    return { ...e, index };
  });
  return changed ? { ...content, entities } : content;
}

const isSeparate = (content: VaultContent, a: string, b: string) =>
  (content.config.separate ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/**
 * Incorpora o resultado da detecção. Entidades já existentes (mesmo tipo e alguma variante em
 * comum) mantêm papel, número e decisão e só ganham variantes novas. Variantes descartadas antes
 * não voltam. Entidades detectadas antes, ainda não revisadas, que a nova detecção não encontra
 * mais (ex.: falsos positivos de uma versão anterior do detector) saem da lista. Sugestões sem
 * sinal forte ficam guardadas como "não aplicadas".
 */
export function applyDetection(
  content: VaultContent,
  detected: readonly DetectedEntity[],
): VaultContent {
  const dismissed = new Set((content.config.dismissed ?? []).map(vkey));
  const entities = content.entities.map((e) => ({ ...e, variants: [...e.variants] }));
  const idMap = new Map<string, string>();
  const matched = new Set<string>();

  // Variantes que o usuário reclassificou (ex.: pessoa → cidade) não voltam com o tipo antigo.
  const reclassified = new Map<string, EntityType>();
  for (const e of content.entities) {
    if (e.reviewed) for (const v of e.variants) reclassified.set(vkey(v), e.type);
  }

  for (const d of detected) {
    const variants = d.variants.filter((v) => {
      const other = reclassified.get(vkey(v));
      return !dismissed.has(vkey(v)) && (other === undefined || other === d.type);
    });
    if (!variants.length) continue;
    const keys = new Set(variants.map(vkey));
    const existing = entities.find(
      (e) => e.type === d.type && e.variants.some((v) => keys.has(vkey(v))),
    );
    if (existing) {
      for (const v of variants) {
        if (!existing.variants.some((x) => vkey(x) === vkey(v))) existing.variants.push(v);
      }
      // Uma sugestão que agora tem sinal forte passa a ser aplicada.
      if (existing.suggested && !d.suggestion) {
        existing.suggested = false;
        existing.decision = d.decision;
        existing.reviewed = false;
        existing.role = d.role;
        existing.index = d.decision === 'pseudonymize' ? nextIndex(entities, existing) : null;
      } else if (!existing.reviewed && existing.source === 'detected' && d.role !== existing.role) {
        existing.role = d.role;
        existing.index =
          existing.decision === 'pseudonymize' ? nextIndex(entities, existing, existing.id) : null;
      }
      if (d.roleConflicts.length) existing.roleConflicts = d.roleConflicts;
      idMap.set(d.id, existing.id);
      matched.add(existing.id);
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
      decision: d.suggestion ? 'keep' : d.decision,
      reviewed: d.suggestion,
      linkedTo: null,
      ambiguousWith: [],
      source: 'detected',
      confidence: d.confidence,
      ...(d.suggestion ? { suggested: true } : {}),
      ...(d.roleConflicts.length ? { roleConflicts: [...d.roleConflicts] } : {}),
    };
    if (entity.decision === 'pseudonymize') entity.index = nextIndex(entities, entity);
    entities.push(entity);
    idMap.set(d.id, entity.id);
    matched.add(entity.id);
  }

  // Detectadas antes, sem revisão (ou só sugeridas), e não encontradas agora: saem.
  const stale = new Set(
    entities
      .filter((e) => e.source === 'detected' && (!e.reviewed || e.suggested) && !matched.has(e.id))
      .map((e) => e.id),
  );
  const alive = replaceReferences(
    entities.filter((e) => !stale.has(e.id)),
    stale,
    null,
  );

  // Vínculos e ambiguidades usam os ids do cofre.
  for (const d of detected) {
    const id = idMap.get(d.id);
    const e = alive.find((x) => x.id === id);
    if (!e) continue;
    if (!e.linkedTo && d.linkedTo) e.linkedTo = idMap.get(d.linkedTo) ?? null;
    const amb = d.ambiguousWith
      .map((a) => idMap.get(a))
      .filter((a): a is string => !!a && a !== e.id && !isSeparate(content, e.id, a));
    e.ambiguousWith = [...new Set([...e.ambiguousWith, ...amb])];
  }

  return compactIndexes({
    ...content,
    entities: alive,
    config: { ...content.config, detectedAt: new Date().toISOString() },
  });
}

/** Atribui o papel (pessoas). O número é o próximo livre no papel, salvo se informado. */
export function assignRole(
  content: VaultContent,
  id: string,
  role: string | null,
  index?: number,
): VaultContent {
  const normalized = role ? normalizeRole(role) : null;
  if (index !== undefined) {
    const entity = content.entities.find((e) => e.id === id);
    const owner = entity && sameLabelOwner(content, id, { ...entity, role: normalized }, index);
    if (owner) return merge(content, [owner.id, id]);
  }
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

/** Outra entidade que já usa o mesmo marcador (mesmo papel/tipo e número). */
export function sameLabelOwner(
  content: VaultContent,
  id: string,
  scope: Pick<StoredEntity, 'type' | 'role'>,
  index: number,
): StoredEntity | undefined {
  return content.entities.find(
    (e) =>
      e.id !== id &&
      e.decision === 'pseudonymize' &&
      !e.suggested &&
      e.index === index &&
      indexScope(e) === indexScope(scope),
  );
}

/**
 * Define o número do marcador. Se outra pessoa já tem esse marcador ("é a VÍTIMA 1"), as duas
 * são a mesma: esta é unificada na que já tinha o número, sem duplicar.
 */
export function setIndex(content: VaultContent, id: string, index: number): VaultContent {
  const entity = content.entities.find((e) => e.id === id);
  if (!entity) return content;
  const owner = sameLabelOwner(content, id, entity, index);
  if (owner) return merge(content, [owner.id, id]);
  return update(content, id, (e) => ({ ...e, index, reviewed: true }));
}

/** "É a mesma pessoa que…": esta entidade some e as variantes vão para a escolhida. */
export function unifyInto(content: VaultContent, targetId: string, id: string): VaultContent {
  if (targetId === id) return content;
  return merge(content, [targetId, id]);
}

/** Apaga uma variante (texto a mais); ela não volta numa nova detecção. */
export function removeVariant(content: VaultContent, id: string, variant: string): VaultContent {
  const entity = content.entities.find((e) => e.id === id);
  if (!entity || entity.variants.length < 2) return content;
  const variants = entity.variants.filter((v) => v !== variant);
  const canonical =
    vkey(entity.canonical) === vkey(variant)
      ? ([...variants].sort((a, b) => b.length - a.length)[0] ?? entity.canonical)
      : entity.canonical;
  const dismissed = [...new Set([...(content.config.dismissed ?? []), variant])];
  return update({ ...content, config: { ...content.config, dismissed } }, id, (e) => ({
    ...e,
    variants,
    canonical,
    reviewed: true,
  }));
}

/**
 * Muda o tipo da entidade (ex.: uma "pessoa" que é uma cidade). Cidades e lugares ficam em claro
 * por padrão; os demais tipos são pseudonimizados com o próximo número livre.
 */
export function changeType(content: VaultContent, id: string, type: EntityType): VaultContent {
  const entity = content.entities.find((e) => e.id === id);
  if (!entity || entity.type === type) return content;
  const kept = type === 'CIDADE';
  const entities = content.entities.map((e) => {
    if (e.id === id) {
      const next: StoredEntity = {
        ...e,
        type,
        role: type === 'PESSOA' ? e.role : null,
        linkedTo: type === 'PESSOA' ? null : e.linkedTo,
        decision: kept ? 'keep' : 'pseudonymize',
        reviewed: true,
        suggested: false,
        ambiguousWith: [],
        index: null,
      };
      if (!kept) next.index = nextIndex(content.entities, next, id);
      return next;
    }
    // Dados que pertenciam a esta "pessoa" ficam sem dono.
    return {
      ...e,
      linkedTo: e.linkedTo === id && type !== 'PESSOA' ? null : e.linkedTo,
      ambiguousWith: e.ambiguousWith.filter((a) => a !== id),
    };
  });
  return compactIndexes(withEntities(content, entities));
}

/**
 * Botão único: pseudonimiza e confirma todas as pessoas (e apelidos). As autoridades mantidas
 * (Delegado, Escrivão…) continuam mantidas, salvo se `includeKept`.
 */
export function pseudonymizeAllPeople(
  content: VaultContent,
  options: { includeKept?: boolean } = {},
): VaultContent {
  let entities = content.entities;
  for (const e of content.entities) {
    if ((e.type !== 'PESSOA' && e.type !== 'APELIDO') || e.suggested) continue;
    const keep = e.decision === 'keep' && !options.includeKept;
    entities = entities.map((x) => {
      if (x.id !== e.id) return x;
      if (keep) return { ...x, reviewed: true };
      return {
        ...x,
        decision: 'pseudonymize',
        reviewed: true,
        index: x.index ?? nextIndex(entities, x, x.id),
      };
    });
  }
  return compactIndexes(withEntities(content, entities));
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
    suggested: false,
  }));
}

/** Aceita uma sugestão: passa a ser pseudonimizada, com o próximo número livre. */
export function acceptSuggestion(content: VaultContent, id: string): VaultContent {
  return setDecision(content, id, 'pseudonymize');
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
  const canonical =
    content.entities
      .filter((e) => e.id === target.id || absorbed.has(e.id))
      .map((e) => e.canonical)
      .sort((a, b) => b.length - a.length)[0] ?? target.canonical;
  const roles = content.entities
    .filter((e) => (e.id === target.id || absorbed.has(e.id)) && e.role)
    .map((e) => normalizeRole(e.role ?? ''));
  const order = (r: string) => {
    const i = ROLE_PRIORITY.indexOf(r as (typeof ROLE_PRIORITY)[number]);
    return i >= 0 ? i : ROLE_PRIORITY.length - 2;
  };
  const conflicts = [...new Set(roles)].sort((a, b) => order(a) - order(b));
  const entities = content.entities
    .filter((e) => !absorbed.has(e.id))
    .map((e) =>
      e.id === target.id
        ? {
            ...e,
            variants,
            // A pessoa escolhida como destino ("é a VÍTIMA 1") mantém o seu nome, salvo se o
            // outro for o mesmo nome mais completo.
            canonical: nameTokens(target.canonical).every((t) => nameTokens(canonical).includes(t))
              ? canonical
              : target.canonical,
            reviewed: true,
            suggested: false,
            ...(conflicts.length > 1 ? { roleConflicts: conflicts } : {}),
          }
        : e,
    );
  return compactIndexes(withEntities(content, replaceReferences(entities, absorbed, target.id)));
}

/** Prioridade do papel (menor = mais relevante); papéis criados pelo usuário vêm antes de PESSOA. */
function rolePriority(e: StoredEntity): number {
  const role = e.role ? normalizeRole(e.role) : 'PESSOA';
  const i = ROLE_PRIORITY.indexOf(role as (typeof ROLE_PRIORITY)[number]);
  return i >= 0 ? i : ROLE_PRIORITY.length - 2;
}

/**
 * "Possível mesma pessoa? → Unificar": junta na entidade de papel mais relevante (VÍTIMA > AUTOR
 * > …) e, em empate, na de nome mais completo.
 */
export function unify(content: VaultContent, a: string, b: string): VaultContent {
  const ea = content.entities.find((e) => e.id === a);
  const eb = content.entities.find((e) => e.id === b);
  if (!ea || !eb) return content;
  const score = (e: StoredEntity) =>
    rolePriority(e) * 100 - nameTokens(e.canonical).length - (e.suggested ? -1000 : 0);
  const [target, other] = score(ea) <= score(eb) ? [ea, eb] : [eb, ea];
  return merge(content, [target.id, other.id]);
}

/** "Manter separados": não são a mesma pessoa; a sugestão não volta numa nova detecção. */
export function keepSeparate(content: VaultContent, a: string, b: string): VaultContent {
  const entities = content.entities.map((e) =>
    e.id === a || e.id === b
      ? { ...e, ambiguousWith: e.ambiguousWith.filter((x) => x !== a && x !== b) }
      : e,
  );
  const separate: [string, string][] = [...(content.config.separate ?? []), [a, b]];
  return { ...content, entities, config: { ...content.config, separate } };
}

/** Remove palavras de um nome, nas pontas sobram só palavras de nome (sem partículas soltas). */
function removeWords(text: string, remove: ReadonlySet<string>): string {
  const words = text.split(/\s+/).filter((w) => w && !remove.has(fold(w)));
  while (words.length && PARTICLES.has(fold(words[0] ?? ''))) words.shift();
  while (words.length && PARTICLES.has(fold(words[words.length - 1] ?? ''))) words.pop();
  return words.join(' ');
}

/**
 * "Limpar nome": corta palavras que não fazem parte do nome (rótulos, texto da linha seguinte) do
 * nome canônico e de todas as variantes, e unifica com a pessoa de mesmo nome, se houver uma só.
 */
export function cleanName(
  content: VaultContent,
  id: string,
  words: readonly string[],
): VaultContent {
  const entity = content.entities.find((e) => e.id === id);
  if (!entity || !words.length) return content;
  const remove = new Set(words.map(fold));
  const canonical = removeWords(entity.canonical, remove);
  if (!canonical) return content;
  const variants: string[] = [];
  for (const v of entity.variants) {
    const cleaned = removeWords(v, remove);
    if (cleaned && !variants.some((x) => vkey(x) === vkey(cleaned))) variants.push(cleaned);
  }
  if (!variants.some((v) => vkey(v) === vkey(canonical))) variants.unshift(canonical);
  const cleanedContent = update(content, id, (e) => ({
    ...e,
    canonical,
    variants,
    reviewed: true,
  }));

  // Unifica com a outra pessoa cujo nome contém exatamente as palavras que sobraram.
  const tokens = nameTokens(canonical);
  const same = cleanedContent.entities.filter(
    (e) =>
      e.id !== id &&
      e.type === entity.type &&
      e.variants.some((v) => {
        const vt = nameTokens(v);
        return tokens.every((t) => vt.includes(t)) || vt.every((t) => tokens.includes(t));
      }),
  );
  return same.length === 1 && same[0] ? unify(cleanedContent, same[0].id, id) : cleanedContent;
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
  return compactIndexes({ ...content, entities, config: { ...content.config, dismissed } });
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
    decision: type === 'CIDADE' ? 'keep' : 'pseudonymize',
    reviewed: true,
    linkedTo: null,
    ambiguousWith: [],
    source: 'manual',
    confidence: 1,
  };
  if (entity.decision === 'pseudonymize') entity.index = nextIndex(content.entities, entity);
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
  const applied = entities.filter((e) => !e.suggested);
  return {
    total: applied.length,
    reviewed: applied.filter((e) => e.reviewed).length,
    pendingPeople: applied.filter((e) => e.type === 'PESSOA' && !e.reviewed).length,
  };
}

/**
 * Recomeça a revisão: apaga todas as entidades e decisões (os documentos ficam). Para cofres
 * revisados com uma versão anterior do detector.
 */
export function resetReview(content: VaultContent): VaultContent {
  const config = { ...content.config };
  delete config.detectedAt;
  delete config.separate;
  return { ...content, entities: [], config };
}

/** Marca a primeira exportação (a partir daí os números dos marcadores ficam fixos). */
export function markExported(content: VaultContent): VaultContent {
  if (content.config.exportedAt) return content;
  return { ...content, config: { ...content.config, exportedAt: new Date().toISOString() } };
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
