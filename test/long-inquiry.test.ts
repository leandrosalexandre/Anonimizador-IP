// @vitest-environment node
// Inquérito FICTÍCIO longo (> 50 mil caracteres) que reproduz as falhas vistas num teste real:
// texto truncado na exportação, carimbo de folha repetido e fora de ordem, legendas de fotos em
// duas colunas lado a lado (parentesco misturado) e um Delegado citado no meio do texto.
// Todos os nomes são inventados.
import { describe, expect, it } from 'vitest';
import { detectEntities } from '../src/detectors';
import { buildExport, DEFAULT_AI_INSTRUCTIONS } from '../src/export/build';
import { applyDetection, pseudonymizeAllPeople } from '../src/review/model';
import { computeReviewData } from '../src/review/useReviewData';
import { emptyVaultContent, type StoredPage, type VaultContent } from '../src/vault/types';

const FILLER =
  'QUE o declarante esclarece que no dia dos fatos estava em casa, assistindo televisão, ' +
  'quando ouviu barulho na rua e saiu para ver o que acontecia; QUE não conhecia os envolvidos; ' +
  'QUE a rua estava escura e havia pouca gente; QUE não sabe informar mais nada a respeito. ';

/** Carimbos lidos pelo OCR: fls. 4 repetida (p. 3 e p. 4) e fls. 6 depois de fls. 11. */
const STAMPS: (number | null)[] = [
  2,
  3,
  4,
  4,
  5,
  null,
  7,
  8,
  9,
  10,
  11,
  6,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
];

function pageText(i: number): string {
  const lines: string[] = [];
  if (i === 0) {
    lines.push(
      'BOLETIM DE OCORRÊNCIA',
      'DADOS DA(S) VÍTIMA(S)',
      'Nome:BENEDITA SALES CORDEIRO Data de Nascimento: 03/03/1990 CPF:529.982.247-25',
      'ACUSADOS: JOAQUIM PEIXOTO VALENTE, GUSTAVO HENRIQUE TAVARES E RENATO SIQUEIRA BRAGA',
    );
  }
  if (i === 5) {
    // Legendas das fotos de dois suspeitos, lado a lado (o OCR junta as colunas na mesma linha).
    lines.push(
      'RELATÓRIO DE INVESTIGAÇÃO – FOTOS DOS SUSPEITOS',
      'Nome: GUSTAVO HENRIQUE TAVARES          Nome: RENATO SIQUEIRA BRAGA',
      'Mãe: ROSÂNGELA TAVARES LIMA             Mãe: CLEONICE SIQUEIRA BRAGA',
      'Vulgo: "TICO"                            Vulgo: "BOLINHA"',
    );
  }
  if (i === 9) {
    lines.push(
      'Na ocasião, o Delegado de Polícia Civil OTÁVIO MENEZES PRATA determinou a lavratura do auto.',
      'Atendimento na UPA: Matrícula hospitalar: 778899/2026, paciente BENEDITA SALES CORDEIRO.',
    );
  }
  lines.push(`TERMO DE DECLARAÇÕES ${i + 1}`);
  for (let k = 0; k < 9; k++) lines.push(FILLER);
  if (i % 4 === 0) lines.push('OTÁVIO MENEZES PRATA'); // assinatura sem o cargo na mesma linha
  return lines.join('\n');
}

function vault(): VaultContent {
  const pages: StoredPage[] = STAMPS.map((stamp, i) => ({
    pdfPage: i + 1,
    width: 595,
    height: 842,
    kind: 'text',
    textSource: 'ocr',
    ocrConfidence: 90,
    text: pageText(i),
    folhaDetected: stamp,
    folhaManual: null,
    thumbnailBlobId: null,
  }));
  const base: VaultContent = {
    ...emptyVaultContent(),
    documents: [
      {
        id: 'doc',
        fileName: 'ip-longo.pdf',
        sha256: 'x',
        byteLength: 1,
        importedAt: new Date().toISOString(),
        pdfBlobId: 'b',
        folhaOffset: null,
        pages,
      },
    ],
  };
  const detected = detectEntities(
    pages.map((p) => ({ docId: 'doc', pdfPage: p.pdfPage, text: p.text })),
  );
  return pseudonymizeAllPeople(applyDetection(base, detected));
}

const options = { instructions: DEFAULT_AI_INSTRUCTIONS, includeLegend: true, partSize: null };

describe('inquérito fictício longo', () => {
  const content = vault();
  const data = computeReviewData(content);
  const result = buildExport(content.entities, data, options);
  const text = result.parts[0] ?? '';

  it('A1. exporta o texto inteiro, com linha de controle no fim', () => {
    expect(text.length).toBeGreaterThan(50_000);
    expect(text).toContain('TERMO DE DECLARAÇÕES 30');
    const last = text.trimEnd().split('\n').at(-1) ?? '';
    const m = /^=== FIM DO DOCUMENTO — (\d+) páginas, ([\d.]+) caracteres ===$/.exec(last);
    expect(m?.[1]).toBe('30');
    const body = text.slice(0, text.lastIndexOf('\n=== FIM DO DOCUMENTO'));
    expect(Number(m?.[2]?.replace(/\./g, ''))).toBe(body.length);
  });

  it('A1. divide em partes numeradas sem cortar páginas', () => {
    const split = buildExport(content.entities, data, { ...options, partSize: 30_000 });
    expect(split.parts.length).toBeGreaterThan(1);
    split.parts.forEach((p, i) => {
      expect(p.startsWith(`PARTE ${i + 1} de ${split.parts.length}`)).toBe(true);
      // Cada página começa e termina na mesma parte.
      const headers = p.match(/^=== fls\./gm)?.length ?? 0;
      const terms = p.match(/^TERMO DE DECLARAÇÕES \d+$/gm)?.length ?? 0;
      expect(terms).toBe(headers);
    });
    expect(split.parts.at(-1)).toMatch(
      /=== FIM DO DOCUMENTO — 30 páginas, [\d.]+ caracteres ===\n$/,
    );
    expect(split.parts[0]).toMatch(/=== FIM DA PARTE 1 de \d+ — continua na PARTE 2 ===\n$/);
  });

  it('A2. folha repetida ou fora de ordem é marcada; sem carimbo, "fls. ?"', () => {
    expect(text).toContain('=== fls. 4? [VERIFICAR: sequência inconsistente] (PDF p. 4) ===');
    expect(text).toContain('=== fls. 6? [VERIFICAR: sequência inconsistente] (PDF p. 12) ===');
    expect(text).toContain('=== fls. ? (PDF p. 6) ===');
    expect(text).toContain('=== fls. 11 (PDF p. 11) ===');
    expect(text).toMatch(/ATENÇÃO: confira a numeração das folhas nas páginas do PDF 4, 6, 12/);
  });

  it('A3. vínculos de legendas lado a lado ficam como "vínculo incerto" [VERIFICAR]', () => {
    const legend = result.legend ?? '';
    const familiares = legend.split('; ').filter((l) => /^\[FAMILIAR \d+\]/.test(l));
    expect(familiares.length).toBeGreaterThanOrEqual(2);
    for (const f of familiares) expect(f).toMatch(/vínculo incerto\) \[VERIFICAR\]|\(fls\. \d+\)/);
    expect(legend).not.toMatch(/autor \(genitor/);
  });

  it('A4. o Delegado citado no meio do texto e nas assinaturas fica com o nome real', () => {
    expect(text).toContain('Delegado de Polícia Civil OTÁVIO MENEZES PRATA determinou');
    expect(text.match(/OTÁVIO MENEZES PRATA/g)?.length).toBeGreaterThan(5);
    expect(text).not.toMatch(/\[DELEGADO \d\]|\[PESSOA \d\] determinou/);
  });

  it('A5. data de nascimento fica como está; matrícula hospitalar vira [PRONTUÁRIO 1]', () => {
    expect(text).toContain('Data de Nascimento: 03/03/1990');
    expect(text).toContain('Matrícula hospitalar: [PRONTUÁRIO 1]');
    expect(text).not.toContain('BENEDITA SALES CORDEIRO');
  });
});
