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
): string {
  const doc = docNumber !== null ? `Documento ${docNumber}, ` : '';
  return folha !== null
    ? `=== fls. ${folha} (${doc}PDF p. ${pdfPage}) ===`
    : `=== ${doc}PDF p. ${pdfPage} ===`;
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

/** "[VÍTIMA 1] = vítima; [AUTOR 1] = autor" — sem nenhum dado real. */
export function buildLegend(
  entities: readonly StoredEntity[],
  labelFor: (id: string) => string | null,
): string | null {
  const people = entities
    .filter((e) => e.type === 'PESSOA' && e.decision === 'pseudonymize')
    .map((e) => {
      const role = e.role ? normalizeRole(e.role) : 'PESSOA';
      // "[FAMILIAR 1] = familiar (mãe de [TESTEMUNHA 1])"
      const of = e.relatedTo ? labelFor(e.relatedTo) : null;
      const relation = e.relation
        ? ` (${e.relation}${of ? ` de ${of}` : ''})`
        : of
          ? ` (de ${of})`
          : '';
      return { label: labelFor(e.id) ?? '', role, index: e.index ?? 0, relation };
    })
    .filter((p) => p.label)
    .sort((a, b) => a.role.localeCompare(b.role, 'pt-BR') || a.index - b.index);
  if (!people.length) return null;
  return `Legenda: ${people
    .map(
      (p) =>
        `${p.label} = ${ROLE_DESCRIPTION[p.role] ?? p.role.toLocaleLowerCase('pt-BR')}${p.relation}`,
    )
    .join('; ')}.`;
}

function preamble(
  options: ExportOptions,
  legend: string | null,
  part: number,
  total: number,
): string {
  const lines: string[] = [];
  if (total > 1) lines.push(`Parte ${part} de ${total}`, '');
  if (options.instructions?.trim()) lines.push(options.instructions.trim(), '');
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
  const pages: ExportPage[] = data.pages.map((p) => ({
    key: p.key,
    header: pageHeader(p.folha, p.pdfPage, multiDoc ? docIds.indexOf(p.docId) + 1 : null),
    text: substitute(p.text, data.located.get(p.key) ?? [], data.labelFor).trim(),
  }));
  const legend = options.includeLegend ? buildLegend(entities, data.labelFor) : null;
  const blocks = pages.map((p) => `${p.header}\n${p.text}`);
  const groups = splitPages(blocks, options.partSize);
  const parts = groups.map(
    (g, i) => `${preamble(options, legend, i + 1, groups.length)}${g.join('\n\n')}\n`,
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
      if (/^Parte \d+ de \d+$/.test(line)) return `## ${line}`;
      return line ? `${line}  ` : line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
