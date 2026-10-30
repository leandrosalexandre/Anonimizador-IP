// Detecção de dados pessoais (SPEC Fase 4): roda os detectores em cada página, resolve
// sobreposições, agrupa variantes em entidades, procura no inquérito inteiro as variantes de
// cada entidade (inclusive as que nenhum detector pegou) e sugere vínculos (CPF da vítima…).
import { detectEndereco } from './address';
import { clusterData, clusterPeople, toEntity, type LocatedCandidate } from './grouping';
import { buildExclusions } from './lexicon';
import { PATTERN_DETECTORS } from './patterns';
import {
  detectApelidos,
  detectCapitalized,
  detectEmpresas,
  detectQualification,
  detectTriggers,
  markAuthorities,
} from './persons';
import { resolveOverlaps } from './resolve';
import { findAll, fold, isUpper, nameTokens, PARTICLES } from './text';
import type {
  Candidate,
  DetectedEntity,
  DetectionOptions,
  EntityType,
  Occurrence,
  PageText,
} from './types';

export type { Candidate, DetectedEntity, DetectionOptions, PageText } from './types';

/** Candidatos de uma página, já sem sobreposição. */
export function detectPage(text: string, options: DetectionOptions = {}): Candidate[] {
  const exclusions = buildExclusions(options.exclusions);
  const people = [
    ...detectQualification(text, exclusions),
    ...detectTriggers(text, exclusions),
    ...detectCapitalized(text, exclusions),
  ];
  markAuthorities(text, people);
  const all = [
    ...PATTERN_DETECTORS.flatMap((d) => d(text)),
    ...detectEndereco(text),
    ...detectEmpresas(text),
    ...detectApelidos(text),
    ...people,
  ];
  return resolveOverlaps(all);
}

const LINKABLE: ReadonlySet<EntityType> = new Set([
  'CPF',
  'RG',
  'CNH',
  'TELEFONE',
  'EMAIL',
  'ENDERECO',
  'CEP',
  'PLACA',
  'CHASSI_RENAVAM',
  'CONTA_BANCARIA',
  'CHAVE_PIX',
  'DATA_NASCIMENTO',
  'APELIDO',
]);

/** Formas derivadas do nome completo: "Maria Souza", "Maria da Conceição" e o prenome. */
function derivedVariants(canonical: string): string[] {
  const words = canonical.split(/\s+/).filter(Boolean);
  const main = words.filter((w) => !PARTICLES.has(fold(w)));
  const out: string[] = [];
  if (main.length >= 3) {
    out.push(`${main[0]} ${main[main.length - 1]}`);
    const secondIndex = words.indexOf(main[1] ?? '');
    if (secondIndex > 0) out.push(words.slice(0, secondIndex + 1).join(' '));
  }
  return out;
}

interface Slot {
  occ: Occurrence;
  entity: DetectedEntity;
}

interface PageIndex {
  page: PageText;
  occupied: Slot[];
}

/**
 * O trecho [start, end) está livre? Um nome fraco (sequência capitalizada de baixa confiança)
 * contido no trecho cede lugar à variante conhecida de outra entidade ("PEÇAS NOGUEIRA" dentro
 * de "AUTO PEÇAS NOGUEIRA").
 */
function claim(index: PageIndex, start: number, end: number, claimer: DetectedEntity): boolean {
  const hits = index.occupied.filter((s) => s.occ.start < end && start < s.occ.end);
  if (!hits.length) return true;
  const yielding = hits.every(
    (s) =>
      s.entity !== claimer &&
      s.entity.type === 'PESSOA' &&
      s.entity.confidence < 0.6 &&
      s.occ.start >= start &&
      s.occ.end <= end &&
      claimer.type !== 'PESSOA',
  );
  if (!yielding) return false;
  for (const s of hits) {
    s.entity.occurrences = s.entity.occurrences.filter((o) => o !== s.occ);
    index.occupied.splice(index.occupied.indexOf(s), 1);
  }
  return true;
}

/** Procura variantes conhecidas em todas as páginas e acrescenta as ocorrências encontradas. */
function expandOccurrences(entities: DetectedEntity[], pages: PageIndex[]): void {
  // Prenome isolado só é procurado se nenhuma outra pessoa tem o mesmo prenome.
  const firstNameOwners = new Map<string, number>();
  for (const e of entities) {
    if (e.type !== 'PESSOA') continue;
    const t = nameTokens(e.canonical)[0];
    if (t) firstNameOwners.set(t, (firstNameOwners.get(t) ?? 0) + 1);
  }

  for (const e of entities) {
    if (e.ambiguousWith.length) continue;
    const searches: { text: string; single: boolean }[] = [];
    if (e.type === 'PESSOA') {
      for (const v of new Set([...e.variants, ...derivedVariants(e.canonical)])) {
        searches.push({ text: v, single: nameTokens(v).length === 1 });
      }
      const first = e.canonical.split(/\s+/)[0] ?? '';
      const firstToken = nameTokens(first)[0] ?? '';
      if (
        firstToken.length >= 3 &&
        firstNameOwners.get(firstToken) === 1 &&
        nameTokens(e.canonical).length > 1
      ) {
        searches.push({ text: first, single: true });
      }
    } else if (e.type === 'APELIDO') {
      for (const v of e.variants) searches.push({ text: v, single: false });
    } else if (e.type === 'EMPRESA_PRIVADA') {
      for (const v of e.variants) {
        searches.push({ text: v, single: false });
        const core = v.replace(
          /[ \t]+(?:Ltda\.?|LTDA\.?|S\.?\s?\/?A\.?|EIRELI|Eireli|ME|EPP|MEI)$/u,
          '',
        );
        if (core !== v && nameTokens(core).length >= 2)
          searches.push({ text: core, single: false });
      }
    } else {
      continue;
    }

    for (const index of pages) {
      const { page, occupied } = index;
      for (const s of searches) {
        for (const [start, end] of findAll(page.text, s.text, false)) {
          if (!claim(index, start, end, e)) continue;
          const found = page.text.slice(start, end);
          if (s.single) {
            // Prenome isolado: só capitalizado e não seguido/precedido de outra palavra capitalizada.
            if (!/^\p{Lu}/u.test(found)) continue;
            const after = page.text.slice(end, end + 30);
            const before = page.text.slice(Math.max(0, start - 30), start);
            if (/^[ \t]+(?:(?:da|de|do|das|dos|e)[ \t]+)?\p{Lu}/u.test(after)) continue;
            if (/\p{Lu}[\p{L}]*[ \t]+$/u.test(before) && !isUpper(found)) continue;
          }
          const occ: Occurrence = {
            docId: page.docId,
            pdfPage: page.pdfPage,
            start,
            end,
            text: found,
          };
          e.occurrences.push(occ);
          occupied.push({ occ, entity: e });
          const variant = found.replace(/\s+/g, ' ');
          if (!e.variants.includes(variant)) e.variants.push(variant);
        }
      }
    }
    e.occurrences.sort(
      (a, b) => a.docId.localeCompare(b.docId) || a.pdfPage - b.pdfPage || a.start - b.start,
    );
  }
}

/**
 * Sugere a pessoa a que cada dado pertence: a mais próxima antes dele, na mesma página,
 * preferindo a pessoa qualificada à filiação ou ao advogado listados no mesmo bloco. Um apelido
 * só se liga a alguém da mesma frase ("FULANO, vulgo …").
 */
function suggestLinks(entities: DetectedEntity[], pages: readonly PageText[]): void {
  const people = entities.filter((e) => e.type === 'PESSOA' && e.decision === 'pseudonymize');
  const textOf = new Map(pages.map((p) => [`${p.docId}|${p.pdfPage}`, p.text]));
  for (const e of entities) {
    if (!LINKABLE.has(e.type)) continue;
    const isNickname = e.type === 'APELIDO';
    const window = isNickname ? 120 : 450;
    const votes = new Map<string, number>();
    for (const o of e.occurrences) {
      const text = textOf.get(`${o.docId}|${o.pdfPage}`) ?? '';
      let best: { id: string; score: number } | null = null;
      for (const p of people) {
        for (const po of p.occurrences) {
          if (po.docId !== o.docId || po.pdfPage !== o.pdfPage || po.end > o.start) continue;
          const distance = o.start - po.end;
          if (distance > window) continue;
          if (isNickname && /[.;]\s|\n\s*\n/u.test(text.slice(po.end, o.start))) continue;
          const secondary = p.role === 'FAMILIAR' || p.role === 'ADVOGADO' ? 1000 : 0;
          const score = distance + secondary;
          if (!best || score < best.score) best = { id: p.id, score };
        }
      }
      if (best) votes.set(best.id, (votes.get(best.id) ?? 0) + 1);
    }
    let winner: string | null = null;
    let max = 0;
    for (const [id, n] of votes) {
      if (n > max) {
        winner = id;
        max = n;
      }
    }
    e.linkedTo = winner;
  }
}

/** Detecção completa sobre as páginas de um ou mais documentos do cofre. */
export function detectEntities(
  pages: readonly PageText[],
  options: DetectionOptions = {},
): DetectedEntity[] {
  const located: LocatedCandidate[] = [];
  for (const page of pages) {
    for (const c of detectPage(page.text, options))
      located.push({ ...c, docId: page.docId, pdfPage: page.pdfPage });
  }

  const entities = [
    ...clusterPeople(
      located.filter((c) => c.type === 'PESSOA'),
      'PESSOA',
    ),
    ...clusterPeople(
      located.filter((c) => c.type === 'APELIDO'),
      'APELIDO',
    ),
    ...clusterData(located.filter((c) => c.type !== 'PESSOA' && c.type !== 'APELIDO')),
  ].map(toEntity);

  const keep = new Set((options.keepNames ?? []).map((n) => fold(n).trim()));
  for (const e of entities) {
    if (e.variants.some((v) => keep.has(fold(v).trim()))) e.decision = 'keep';
  }

  const index: PageIndex[] = pages.map((page) => ({
    page,
    occupied: entities.flatMap((entity) =>
      entity.occurrences
        .filter((o) => o.docId === page.docId && o.pdfPage === page.pdfPage)
        .map((occ) => ({ occ, entity })),
    ),
  }));
  expandOccurrences(entities, index);
  // Entidades que cederam todas as ocorrências a outras deixam de existir.
  const alive = entities.filter((e) => e.occurrences.length > 0);
  entities.length = 0;
  entities.push(...alive);
  suggestLinks(entities, pages);

  const order = (e: DetectedEntity) => (e.type === 'PESSOA' ? 0 : e.type === 'APELIDO' ? 1 : 2);
  return entities.sort((a, b) => {
    const t = order(a) - order(b);
    if (t) return t;
    const oa = a.occurrences[0];
    const ob = b.occurrences[0];
    return (oa?.pdfPage ?? 0) - (ob?.pdfPage ?? 0) || (oa?.start ?? 0) - (ob?.start ?? 0);
  });
}
