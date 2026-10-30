// @vitest-environment node
// Aceite da Fase 6: no IP fictício, o texto exportado não contém nenhum nome, CPF, telefone,
// placa ou endereço de envolvido (procura os valores reais conhecidos do gabarito).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectEntities } from '../detectors';
import { ENTITY_TYPES } from '../detectors/types';
import { findAll } from '../detectors/text';
import { applyDetection, confirm } from '../review/model';
import { computeReviewData } from '../review/useReviewData';
import { emptyVaultContent, type StoredPage, type VaultContent } from '../vault/types';
import { buildExport, DEFAULT_AI_INSTRUCTIONS, splitPages, toMarkdown } from './build';
import { scanResidual } from './residual';

interface GabaritoEntity {
  type: string;
  decision: string;
  canonical: string;
  variants: string[];
  occurrences: { text: string }[];
}
const gabarito = JSON.parse(
  readFileSync(new URL('../../test/fixtures/gabarito.json', import.meta.url), 'utf8'),
) as {
  folhaOffset: number;
  pages: { pdfPage: number; folha: number; text: string }[];
  entities: GabaritoEntity[];
};

function reviewedContent(): VaultContent {
  const pages: StoredPage[] = gabarito.pages.map((p) => ({
    pdfPage: p.pdfPage,
    width: 595,
    height: 842,
    kind: 'text',
    textSource: 'pdf',
    ocrConfidence: null,
    text: p.text,
    folhaDetected: p.folha,
    folhaManual: null,
    thumbnailBlobId: null,
  }));
  const base: VaultContent = {
    ...emptyVaultContent(),
    documents: [
      {
        id: 'doc',
        fileName: 'ip.pdf',
        sha256: 'x',
        byteLength: 1,
        importedAt: new Date().toISOString(),
        pdfBlobId: 'b',
        folhaOffset: null,
        pages,
      },
    ],
  };
  const detected = applyDetection(
    base,
    // Escopo completo (todos os tipos ativos): o aceite da Fase 6 inclui placas e endereços.
    detectEntities(
      gabarito.pages.map((p) => ({ docId: 'doc', pdfPage: p.pdfPage, text: p.text })),
      { types: ENTITY_TYPES },
    ),
  );
  // Revisão sem nenhuma correção manual: aceita todas as sugestões.
  return confirm(
    detected,
    detected.entities.map((e) => e.id),
  );
}

const options = { instructions: DEFAULT_AI_INSTRUCTIONS, includeLegend: true, partSize: null };

describe('exportação do IP fictício', () => {
  const content = reviewedContent();
  const data = computeReviewData(content);
  const result = buildExport(content.entities, data, options);
  const text = result.parts.join('\n');

  it('não contém nenhum dado real de envolvido', () => {
    // Nomes mantidos de propósito (autoridades) podem conter um prenome igual ao de um envolvido
    // ("LUCIANA MARIA…"): saem da busca.
    let searchable = text;
    for (const e of gabarito.entities.filter((x) => x.decision === 'keep')) {
      for (const v of e.variants) searchable = searchable.split(v).join(' ');
    }
    const leaks: string[] = [];
    for (const e of gabarito.entities.filter((x) => x.decision === 'pseudonymize')) {
      for (const value of new Set([
        e.canonical,
        ...e.variants,
        ...e.occurrences.map((o) => o.text),
      ])) {
        if (findAll(searchable, value, false).length) leaks.push(`${e.type}: ${value}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('mantém as autoridades e usa marcadores', () => {
    expect(text).toContain('PAULO ROBERTO CAVALCANTE MENDES');
    expect(text).toContain('[VÍTIMA 1]');
    expect(text).toContain('[APELIDO DE AUTOR 1]');
    // "Neguinho" (o piloto não identificado) não pertence a nenhum envolvido conhecido.
    expect(text).toMatch(/conhecido apenas como "\[APELIDO \d\]"/);
    expect(text).toMatch(/\[CPF \d\]/);
  });

  it('tem instruções, legenda e cabeçalho por página', () => {
    expect(result.parts[0]?.startsWith(DEFAULT_AI_INSTRUCTIONS)).toBe(true);
    expect(result.legend).toMatch(/^Legenda: .*\[VÍTIMA 1\] = vítima/);
    expect(result.legend).not.toMatch(/Maria|Francisco|Souza/i);
    expect(text).toContain('=== fls. 3 (PDF p. 1) ===');
    expect(text).toContain('=== fls. 17 (PDF p. 15) ===');
  });

  it('divide em partes nos limites das páginas, com "Parte X de N"', () => {
    const split = buildExport(content.entities, data, { ...options, partSize: 6000 });
    expect(split.parts.length).toBeGreaterThan(1);
    split.parts.forEach((p, i) => {
      expect(p.startsWith(`PARTE ${i + 1} de ${split.parts.length}`)).toBe(true);
      expect(p).toContain(DEFAULT_AI_INSTRUCTIONS);
    });
    const headers = split.parts.join('').match(/^=== fls\. \d+/gm) ?? [];
    expect(headers).toHaveLength(15);
    expect(splitPages(['a'.repeat(10), 'b'.repeat(10)], 5)).toEqual([
      ['a'.repeat(10)],
      ['b'.repeat(10)],
    ]);
  });

  it('varredura residual após aceitar as sugestões', () => {
    const residual = scanResidual(result.pages, data);
    console.info(
      'Varredura residual:',
      residual.map((r) => `${r.kind}: ${r.text} (${r.count}x)`),
    );
    // Nenhum dado do gabarito sobra; o que aparecer são palavras comuns a confirmar.
    for (const r of residual) {
      const real = gabarito.entities.some(
        (e) =>
          e.decision === 'pseudonymize' &&
          e.variants.some((v) => v.toLowerCase() === r.text.toLowerCase()),
      );
      expect(real, r.text).toBe(false);
    }
  });

  it('varredura residual aponta dado que escapou', () => {
    const leaked = buildExport(content.entities, data, options).pages.map((p, i) =>
      i === 0
        ? {
            ...p,
            text: `${p.text}\nQUE Joana Mendes Cruz ligou do 85 99999-1234, CPF 111.444.777-35`,
          }
        : p,
    );
    const residual = scanResidual(leaked, data).map((r) => r.text);
    expect(residual).toEqual(
      expect.arrayContaining(['Joana Mendes Cruz', '85 99999-1234', '111.444.777-35']),
    );
  });

  it('gera Markdown com cabeçalhos', () => {
    const md = toMarkdown(result.parts[0] ?? '');
    expect(md).toContain('### fls. 3 (PDF p. 1)');
  });
});
