// Exportação do texto pseudonimizado (SPEC Fase 6): instruções para a IA, legenda opcional,
// cabeçalho por página "=== fls. X (PDF p. Y) ===" e divisão em partes nos limites das páginas.
import { normalizeRole } from '../review/labels';
import { substitute } from '../review/locate';
import type { ReviewData } from '../review/useReviewData';
import type { StoredEntity } from '../vault/types';

export const DEFAULT_AI_INSTRUCTIONS =
  'Este texto foi pseudonimizado. Mantenha todos os marcadores entre colchetes exatamente como estão (ex.: [VÍTIMA 1], [AUTOR 2]); não tente inferir identidades. Cite os elementos pelas folhas indicadas nos cabeçalhos (fls.).';

export interface ExportOptions {
  instructions: string | null;
  includeLegend: boolean;
  /** Tamanho aproximado de cada parte, em caracteres; null = não dividir. */
  partSize: number | null;
}

export interface ExportPage {
  key: string;
  header: string;
  text: string;
}

export interface ExportResult {
  pages: ExportPage[];
  legend: string | null;
  parts: string[];
}

export function pageHeader(
  folha: number | null,
  pdfPage: number,
  docNumber: number | null,
  inconsistent = false,
): string {
  const doc = docNumber !== null ? `Documento ${docNumber}, ` : '';
  // Sem carimbo legível, "fls. ?": o número nunca é inventado.
  const fls =
    folha === null
      ? 'fls. ?'
      : inconsistent
        ? `fls. ${folha}? [VERIFICAR: sequência inconsistente]`
        : `fls. ${folha}`;
  return `=== ${fls} (${doc}PDF p. ${pdfPage}) ===`;
}

/** 12345 → "12.345" (sem depender do ICU do navegador). */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
  MÉDICO: 'médico',
  PERITO: 'perito',
  ENFERMEIRO: 'enfermeiro',
  'AUXILIAR DE ENFERMAGEM': 'auxiliar de enfermagem',
  'TÉCNICO DE ENFERMAGEM': 'técnico de enfermagem',
  PESSOA: 'pessoa sem papel definido',
};

/** Parentescos que só uma pessoa pode ter em relação a outra (mãe, pai). */
const EXCLUSIVE_RELATIONS = new Set(['mãe', 'mae', 'pai']);

/**
 * "[VÍTIMA 1] = vítima; [FAMILIAR 4] = mãe de [AUTOR 3] (fls. 12)" — sem nenhum dado real. Os
 * vínculos sugeridos pela detecção dizem de que folha vieram; vínculos duvidosos (duas pessoas
 * com a mesma relação exclusiva, mesma pessoa ligada a dois envolvidos, legendas em colunas)
 * aparecem como "familiar (vínculo incerto) [VERIFICAR]" em vez de escolher um.
 */
export function buildLegend(
  entities: readonly StoredEntity[],
  labelFor: (id: string) => string | null,
  folhaOf: (docId: string, pdfPage: number) => number | null = () => null,
): string | null {
  const pseud = entities.filter((e) => e.type === 'PESSOA' && e.decision === 'pseudonymize');
  const hasLink = (e: StoredEntity) => {
    const role = e.role ? normalizeRole(e.role) : 'PESSOA';
    return role === 'FAMILIAR' || role === 'ADVOGADO' || !!e.relationManual;
  };
  // Mesma relação exclusiva ("mãe de [AUTOR 3]") atribuída a mais de uma pessoa: conferir.
  const exclusive = new Map<string, number>();
  for (const e of pseud) {
    if (!hasLink(e) || !e.relatedTo || !e.relation) continue;
    if (!EXCLUSIVE_RELATIONS.has(e.relation.toLocaleLowerCase('pt-BR'))) continue;
    const key = `${e.relation.toLocaleLowerCase('pt-BR')}|${e.relatedTo}`;
    exclusive.set(key, (exclusive.get(key) ?? 0) + 1);
  }

  const people = pseud
    .map((e) => {
      const role = e.role ? normalizeRole(e.role) : 'PESSOA';
      let description = ROLE_DESCRIPTION[role] ?? role.toLocaleLowerCase('pt-BR');
      const notes: string[] = [];
      if (e.minor) notes.push('menor de idade à época do fato');
      let suffix = '';
      if (hasLink(e)) {
        const of = e.relatedTo ? labelFor(e.relatedTo) : null;
        const repeated =
          !!e.relation &&
          !!e.relatedTo &&
          (exclusive.get(`${e.relation.toLocaleLowerCase('pt-BR')}|${e.relatedTo}`) ?? 0) > 1;
        if (e.relationUncertain || (e.relation && !of && !e.relationManual) || repeated) {
          if (repeated && of) {
            description = `${e.relation} de ${of}`;
            suffix = ' [VERIFICAR: outra pessoa também consta com esta relação]';
          } else {
            notes.push('vínculo incerto');
            suffix = ' [VERIFICAR]';
          }
        } else if (of) {
          description =
            role === 'ADVOGADO' ? `advogado de ${of}` : `${e.relation || 'familiar'} de ${of}`;
          const folha =
            e.relationSource && !e.relationManual
              ? folhaOf(e.relationSource.docId, e.relationSource.pdfPage)
              : null;
          if (folha !== null) suffix = ` (fls. ${folha})`;
        } else if (e.relation && e.relationManual) {
          notes.push(e.relation);
        }
      }
      return {
        label: labelFor(e.id) ?? '',
        role,
        index: e.index ?? 0,
        text: `${description}${notes.length ? ` (${notes.join('; ')})` : ''}${suffix}`,
      };
    })
    .filter((p) => p.label)
    .sort((a, b) => a.role.localeCompare(b.role, 'pt-BR') || a.index - b.index);

  // Termos classificados pelo usuário ("CV = organização criminosa"), mantidos em claro.
  const terms = entities
    .filter((e) => e.type !== 'PESSOA' && e.decision === 'keep' && e.category)
    .map((e) => `${e.canonical} = ${e.category}`);

  if (!people.length && !terms.length) return null;
  const lines: string[] = [];
  if (people.length)
    lines.push(`Legenda: ${people.map((p) => `${p.label} = ${p.text}`).join('; ')}.`);
  if (terms.length) lines.push(`Termos classificados (em claro): ${terms.join('; ')}.`);
  return lines.join('\n');
}

function preamble(
  options: ExportOptions,
  legend: string | null,
  folhaWarning: string | null,
  part: number,
  total: number,
): string {
  const lines: string[] = [];
  if (total > 1) lines.push(`PARTE ${part} de ${total}`, '');
  if (options.instructions?.trim()) lines.push(options.instructions.trim(), '');
  if (folhaWarning) lines.push(folhaWarning, '');
  if (legend) lines.push(legend, '');
  return lines.join('\n');
}

/** Agrupa as páginas em partes de ~partSize caracteres, sem quebrar uma página. */
export function splitPages(blocks: readonly string[], partSize: number | null): string[][] {
  if (!partSize || partSize <= 0) return [blocks.slice()];
  const parts: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const block of blocks) {
    if (current.length && size + block.length > partSize) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(block);
    size += block.length + 2;
  }
  if (current.length) parts.push(current);
  return parts;
}

export function buildExport(
  entities: readonly StoredEntity[],
  data: ReviewData,
  options: ExportOptions,
): ExportResult {
  const docIds = [...new Set(data.pages.map((p) => p.docId))];
  const multiDoc = docIds.length > 1;
  const docNumber = (docId: string) => (multiDoc ? docIds.indexOf(docId) + 1 : null);
  const pages: ExportPage[] = data.pages.map((p) => ({
    key: p.key,
    header: pageHeader(p.exportFolha, p.pdfPage, docNumber(p.docId), p.folhaInconsistent),
    text: substitute(p.text, data.located.get(p.key) ?? [], data.labelFor).trim(),
  }));

  // Aviso no topo: páginas sem folha legível ou com sequência inconsistente.
  const toCheck = data.pages.filter((p) => p.exportFolha === null || p.folhaInconsistent);
  const folhaWarning = toCheck.length
    ? `ATENÇÃO: confira a numeração das folhas nas páginas do PDF ${toCheck
        .map((p) =>
          multiDoc ? `${p.pdfPage} (Documento ${docNumber(p.docId)})` : String(p.pdfPage),
        )
        .join(
          ', ',
        )} (carimbo ilegível, repetido ou fora de ordem; marcadas com "fls. ?" ou "[VERIFICAR]").`
    : null;

  const folhaOf = (docId: string, pdfPage: number) =>
    data.pages.find((p) => p.docId === docId && p.pdfPage === pdfPage)?.exportFolha ?? null;
  const legend = options.includeLegend ? buildLegend(entities, data.labelFor, folhaOf) : null;
  const blocks = pages.map((p) => `${p.header}\n${p.text}`);
  const groups = splitPages(blocks, options.partSize);
  const bodies = groups.map(
    (g, i) => `${preamble(options, legend, folhaWarning, i + 1, groups.length)}${g.join('\n\n')}`,
  );
  // Linha de controle no fim: permite conferir que nada foi cortado ao copiar ou colar.
  const total = bodies.reduce((n, b) => n + b.length, 0);
  const parts = bodies.map((body, i) =>
    i === bodies.length - 1
      ? `${body}\n=== FIM DO DOCUMENTO — ${pages.length} páginas, ${formatCount(total)} caracteres ===\n`
      : `${body}\n=== FIM DA PARTE ${i + 1} de ${bodies.length} — continua na PARTE ${i + 2} ===\n`,
  );
  return { pages, legend, parts };
}

/** Versão Markdown: instruções em citação, cabeçalhos de página como títulos, quebras preservadas. */
export function toMarkdown(part: string): string {
  return part
    .split('\n')
    .map((line) => {
      const header = /^=== (.*) ===$/.exec(line);
      if (header) return `\n### ${header[1]}\n`;
      if (/^PARTE \d+ de \d+$/.test(line)) return `## ${line}`;
      return line ? `${line}  ` : line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
