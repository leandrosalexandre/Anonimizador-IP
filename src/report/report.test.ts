// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx';
import { buildReport, dateLine, inlineRuns, type ReportTemplate } from './model';
import { crc32 } from './zip';

const template: ReportTemplate = {
  unitLines: ['DELEGACIA FICTÍCIA – 99ª DP', 'Rua Inventada, n. 1, Centro, Fortaleza/CE'],
  city: 'Fortaleza/CE',
  signerName: 'FULANO DE TAL FICTÍCIO',
  signerTitle: 'Delegado de Polícia',
  signerUnit: 'Titular da 99ª DP',
};

const TEXT = [
  '# RELATÓRIO FINAL DE INQUÉRITO',
  '',
  '**REFERÊNCIA**: IP 000 – 02/2026',
  'Incidência Penal: Art. 329 do CP.',
  'Indiciado(s): Beltrano Inventado',
  'Vítima(s): O ESTADO',
  '',
  'Excelentíssimo(a) Magistrado(a),',
  'Excelentíssimo(a) Promotor(a) de Justiça,',
  '',
  'O presente procedimento teve por finalidade apurar a **responsabilidade criminal** dos envolvidos.',
  '',
  'DOS FATOS',
  'Prestou depoimento o condutor. Assim narrou:',
  '> O depoente é policial; QUE na data de hoje, sua equipe cumpriu mandados.',
  '',
  'CONCLUSÕES, TIPIFICAÇÃO E INDICIAMENTO',
  'Restam demonstradas materialidade e autoria, razão pela qual **o INDICIO**.',
  '',
  'É o relatório.',
].join('\n');

describe('relatório em Word', () => {
  const blocks = buildReport(TEXT, template, new Date(2026, 9, 1));

  it('reconhece título, quadro de referência, vocativos, seções, citação e fecho', () => {
    expect(blocks.map((b) => b.kind)).toEqual([
      'title',
      'reference',
      'vocative',
      'vocative',
      'paragraph',
      'heading',
      'paragraph',
      'quote',
      'heading',
      'paragraph',
      'paragraph',
      'date',
      'signature',
    ]);
    const ref = blocks[1];
    expect(ref?.kind === 'reference' && ref.lines).toHaveLength(4);
    expect(ref?.kind === 'reference' && ref.lines[0]?.[0]).toEqual({
      text: 'REFERÊNCIA: ',
      bold: true,
    });
    expect(blocks.at(-2)).toEqual({ kind: 'date', text: 'Fortaleza/CE, 1º de outubro de 2026.' });
    const sig = blocks.at(-1);
    expect(sig?.kind === 'signature' && sig.lines.map((l) => l.text)).toEqual([
      '– assinatura eletrônica –',
      'FULANO DE TAL FICTÍCIO',
      'Delegado de Polícia',
      'Titular da 99ª DP',
    ]);
  });

  it('sem título no texto, usa o do modelo; negrito e itálico viram formatação', () => {
    expect(buildReport('Texto simples.', template)[0]).toEqual({
      kind: 'title',
      text: 'RELATÓRIO FINAL DE INQUÉRITO',
    });
    expect(inlineRuns('a **b** e *c*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' e ' },
      { text: 'c', italic: true },
    ]);
    expect(dateLine('Sobral/CE', new Date(2026, 0, 15))).toBe('Sobral/CE, 15 de janeiro de 2026.');
  });

  it('gera um .docx válido, com cabeçalho, rodapé e o texto', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const png = readFileSync(new URL('../assets/report/pcce.png', import.meta.url));
    const bytes = buildDocx(blocks, template, { left: png, right: png });
    const dir = mkdtempSync(join(tmpdir(), 'docx-'));
    const file = join(dir, 'relatorio.docx');
    writeFileSync(file, bytes);
    const listing = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(listing).toContain('No errors detected');
    const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
    expect(xml).toContain('RELATÓRIO FINAL DE INQUÉRITO');
    expect(xml).toContain('FULANO DE TAL FICTÍCIO');
    expect(xml).toContain('<w:tbl>');
    const footer = execFileSync('unzip', ['-p', file, 'word/footer1.xml'], { encoding: 'utf8' });
    expect(footer).toContain('DELEGACIA FICTÍCIA – 99ª DP');
    if (process.env.KEEP_DOCX) writeFileSync(process.env.KEEP_DOCX, bytes);
  });
});
