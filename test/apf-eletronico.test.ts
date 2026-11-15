// @vitest-environment node
// APF fictício no formato do sistema eletrônico: o texto exportado não pode conter nomes de
// envolvidos; cada pessoa tem um único marcador; autoridades e policiais ficam com o nome real.
import { describe, expect, it } from 'vitest';
import { buildExport } from '../src/export/build';
import { applyDetection, pseudonymizeInvolved } from '../src/review/model';
import { detectForVault } from '../src/review/detectVault';
import { computeReviewData } from '../src/review/useReviewData';
import { emptyVaultContent, type VaultContent } from '../src/vault/types';
import { APF_INVOLVED, APF_KEPT, APF_PAGES } from './fixtures/apf-eletronico';

function vault(): VaultContent {
  const base: VaultContent = {
    ...emptyVaultContent(),
    documents: [
      {
        id: 'doc',
        fileName: 'apf.pdf',
        sha256: 'x',
        byteLength: 1,
        importedAt: '2026-01-01T00:00:00Z',
        pdfBlobId: 'b',
        folhaOffset: null,
        pages: APF_PAGES.map((text, i) => ({
          pdfPage: i + 1,
          width: 595,
          height: 842,
          kind: 'text' as const,
          textSource: 'pdf' as const,
          ocrConfidence: null,
          text,
          folhaDetected: null,
          folhaManual: null,
          thumbnailBlobId: null,
        })),
      },
    ],
  };
  return pseudonymizeInvolved(applyDetection(base, detectForVault(base)));
}

describe('APF fictício (sistema eletrônico)', () => {
  const content = vault();
  const data = computeReviewData(content);
  const result = buildExport(content.entities, data, {
    instructions: null,
    includeLegend: true,
    partSize: null,
  });
  const text = result.parts[0] ?? '';
  const flat = text.replace(/\s+/g, ' ');
  const people = content.entities.filter((e) => e.type === 'PESSOA' && !e.suggested);
  if (process.env.SHOW) {
    console.info(text);
    for (const e of content.entities)
      console.info(
        e.type,
        e.role,
        e.decision,
        e.suggested ? 'SUG' : '',
        e.canonical,
        '|',
        e.variants.join(' ; '),
        '|',
        e.position ?? '',
      );
  }

  it('nenhum nome de envolvido aparece no texto exportado', () => {
    const leaked = APF_INVOLVED.filter((n) =>
      new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, 'u').test(flat),
    );
    expect(leaked).toEqual([]);
  });

  it('cada pessoa tem um único marcador, com o papel do documento', () => {
    const byName = (re: RegExp) => people.filter((e) => re.test(e.canonical));
    expect(byName(/^Danilo/)).toHaveLength(1);
    expect(byName(/^Alisson/)).toHaveLength(1);
    expect(byName(/^Danilo/)[0]).toMatchObject({ role: 'AUTOR', decision: 'pseudonymize' });
    expect(byName(/^Alisson/)[0]).toMatchObject({ role: 'AUTOR', decision: 'pseudonymize' });
    expect(byName(/^Marlene/)).toHaveLength(1);
    expect(byName(/^Marlene/)[0]?.role).toBe('FAMILIAR');
    expect(byName(/^Sérgio/)[0]).toMatchObject({ role: 'TESTEMUNHA', decision: 'pseudonymize' });
    expect(byName(/^Josimar/)[0]?.role).toBe('COMUNICANTE');
    // 2 autores, mãe do autor, 2 pais + 2 mães de policiais, testemunha, noticiante, intimada,
    // delegado e 2 policiais.
    expect(people.filter((e) => e.decision === 'pseudonymize').length).toBeLessThanOrEqual(12);
    expect(text).not.toMatch(/\[PESSOA \d+\]\.\.\./);
  });

  it('legendas, objetos e cores não viram pessoas nem sugestões', () => {
    const junk = content.entities.filter((e) =>
      /tenta|fugir|cai|solo|avariad|camisa|capinha|pro max|faz saber|pelo|sgt|dpc|oip|rabec/i.test(
        e.canonical,
      ),
    );
    expect(junk.map((e) => e.canonical)).toEqual([]);
    expect(people.filter((e) => e.role === 'VÍTIMA')).toHaveLength(0);
    expect(content.entities.filter((e) => e.suggested).map((e) => e.canonical)).toEqual([]);
  });

  it('nome cortado sem reticências, "FAZ SABER" e "DE NOME … PELO" ligam ao autor certo', () => {
    expect(flat).toContain('INTERROGATÓRIO - [AUTOR 2] 27/10/2026');
    expect(flat).toContain('FAZ SABER [AUTOR 1]; Nome da mãe: [FAMILIAR 3];');
    expect(flat).toContain('PESSOA DE NOME [AUTOR 1] PELO NÚMERO');
  });

  it('postos e graduações, peritos e coordenador ficam com o nome real', () => {
    const kept = (re: RegExp) => people.find((e) => re.test(e.canonical));
    expect(kept(/^Paulo Vítor/)).toMatchObject({ decision: 'keep', position: 'Policial Militar' });
    expect(kept(/^Márcio Muniz/)).toMatchObject({ decision: 'keep', position: 'Delegado' });
    expect(kept(/^Osmar Gomes Goes/)?.decision).toBe('keep');
    expect(kept(/^Ivon/)).toMatchObject({ decision: 'keep', role: 'PERITO' });
    expect(kept(/^Ana Leopoldina/)?.decision).toBe('keep');
  });

  it('"Sr. Fulano" só com o prenome vira pessoa a confirmar (não fica em claro)', () => {
    expect(flat).toMatch(/Segundo o Sr\. \[PESSOA \d\], gerente da barraca/);
    expect(flat).toMatch(/o Sr\. \[PESSOA \d\]\. É o relato/);
  });

  it('delegado e policiais ficam com o nome real, na função certa', () => {
    for (const name of APF_KEPT) expect(flat, name).toContain(name);
    const kept = (re: RegExp) => people.find((e) => re.test(e.canonical));
    expect(kept(/^Rodrigo/)).toMatchObject({ decision: 'keep', position: 'Delegado' });
    expect(kept(/^Bruno/)?.decision).toBe('keep');
    expect(kept(/^Bruno/)?.position).toMatch(/Oficial Investigador/);
    expect(kept(/^Carla/)?.position).toMatch(/Inspetor/);
  });

  it('folhas pelo rodapé "N de M"; ruído removido; palavras cortadas por hífen unidas', () => {
    expect(text).toContain('=== fls. 2 (PDF p. 4) ===');
    expect(text).toContain('=== fls. 12 (PDF p. 11) ===');
    expect(text).not.toContain('ASSINATURA ELETRÔNICA');
    expect(text).not.toContain('3c3C3C3G');
    expect(text).not.toMatch(/\d+ de 60/);
    expect(text).not.toContain('DEPARTAMENTO DE HOMICÍDIOS');
    expect(flat).toContain('foi apresentada à Autoridade Policial');
    expect(flat).toContain('TERMO DE DEPOIMENTO DO CONDUTOR BRUNO HENRIQUE TAVARES DE LIMA');
  });

  it('nome que continua na página seguinte e prenomes soltos usam o mesmo marcador', () => {
    expect(flat).toMatch(
      /filho de \[FAMILIAR \d\] === fls\. 3 \(PDF p\. 5\) === \[FAMILIAR \d\]; QUE/,
    );
    expect(flat).toContain('a dupla ([AUTOR 1] e [AUTOR 2]) desferiu');
    expect(flat).toContain('TATUAGENS DE [AUTOR 2]');
    expect(flat).toContain('QUE [AUTOR 2] confirmou ser sua aquela camisa');
    expect(result.legend).toMatch(/\[FAMILIAR \d\] = mãe de Bruno Henrique Tavares de Lima/);
    expect(result.legend).toMatch(/\[FAMILIAR 3\] = genitor\(a\) de \[AUTOR 1\]/);
  });
});
