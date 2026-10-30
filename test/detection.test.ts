// @vitest-environment node
// Aceite da Fase 4: no IP fictício, 100% dos CPFs, telefones e placas e pelo menos 95% das
// ocorrências de nomes de envolvidos detectados antes da revisão.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectEntities } from '../src/detectors';
import { ENTITY_TYPES } from '../src/detectors/types';

/** Métricas do aceite da Fase 4: todos os tipos ativos. */
const ALL = { types: ENTITY_TYPES };
import { evaluate, formatReport, type Gabarito } from './detection-metrics';

const gabarito = JSON.parse(
  readFileSync(new URL('./fixtures/gabarito.json', import.meta.url), 'utf8'),
) as Gabarito;

describe('detecção no IP fictício (texto)', () => {
  const pages = gabarito.pages.map((p) => ({ docId: 'ip', pdfPage: p.pdfPage, text: p.text }));
  const entities = detectEntities(pages, ALL);
  const report = evaluate(entities, new Map(pages.map((p) => [p.pdfPage, p.text])), gabarito);
  console.info(formatReport('IP fictício – PDF com texto', report));
  const recall = (type: string) => report.byType.find((t) => t.type === type)?.recall;

  it('detecta 100% dos CPFs, telefones e placas', () => {
    expect(recall('CPF')).toBe(1);
    expect(recall('TELEFONE')).toBe(1);
    expect(recall('PLACA')).toBe(1);
  });

  it('detecta pelo menos 95% das ocorrências de nomes de envolvidos', () => {
    expect(report.peopleRecall).toBeGreaterThanOrEqual(0.95);
  });

  it('sugere "manter" para as autoridades', () => {
    expect(report.keepCorrect / report.keepExpected).toBeGreaterThanOrEqual(0.9);
  });

  it('agrupa as variantes de cada pessoa numa só entidade', () => {
    const vitima = entities.filter(
      (e) => e.type === 'PESSOA' && e.variants.some((v) => /maria/i.test(v) && /souza/i.test(v)),
    );
    expect(vitima).toHaveLength(1);
    expect(vitima[0]?.canonical).toBe('Maria da Conceição Silva Souza');
    expect(vitima[0]?.variants).toEqual(
      expect.arrayContaining(['MARIA DA CONCEIÇÃO SILVA SOUZA', 'Maria Souza', 'MARIA']),
    );
    expect(vitima[0]?.role).toBe('VÍTIMA');
  });
});

describe('detecção no IP fictício (texto do OCR do PDF escaneado)', () => {
  const ocr = JSON.parse(
    readFileSync(new URL('./fixtures/ocr-escaneado.json', import.meta.url), 'utf8'),
  ) as { pdfPage: number; text: string }[];
  const pages = ocr.map((p) => ({ docId: 'ip', pdfPage: p.pdfPage, text: p.text }));
  const entities = detectEntities(pages, ALL);
  const report = evaluate(entities, new Map(pages.map((p) => [p.pdfPage, p.text])), gabarito, true);
  console.info(formatReport('IP fictício – texto do OCR', report));
  const recall = (type: string) => report.byType.find((t) => t.type === type)?.recall;

  it('mantém 100% de CPFs, telefones e placas no texto do OCR', () => {
    expect(recall('CPF')).toBe(1);
    expect(recall('TELEFONE')).toBe(1);
    expect(recall('PLACA')).toBe(1);
  });

  it('detecta pelo menos 95% dos nomes de envolvidos presentes no texto do OCR', () => {
    expect(report.peopleRecall).toBeGreaterThanOrEqual(0.95);
  });
});
