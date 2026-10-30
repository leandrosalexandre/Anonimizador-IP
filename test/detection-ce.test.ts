// @vitest-environment node
// IP fictício 2 (formato Ceará): reproduz os problemas vistos em inquéritos reais. Métricas com o
// escopo padrão (nomes e documentos pessoais).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectEntities } from '../src/detectors';
import { evaluate, formatReport, type Gabarito } from './detection-metrics';

const gabarito = JSON.parse(
  readFileSync(new URL('./fixtures/gabarito-ce.json', import.meta.url), 'utf8'),
) as Gabarito;
const gabaritoIp1 = JSON.parse(
  readFileSync(new URL('./fixtures/gabarito.json', import.meta.url), 'utf8'),
) as Gabarito;

describe('detecção no IP fictício 2 (formato Ceará, escopo padrão)', () => {
  const pages = gabarito.pages.map((p) => ({ docId: 'ip', pdfPage: p.pdfPage, text: p.text }));
  const entities = detectEntities(pages);
  const report = evaluate(entities, new Map(pages.map((p) => [p.pdfPage, p.text])), gabarito);
  console.info(formatReport('IP fictício 2 – formato Ceará (escopo padrão)', report));
  const applied = entities.filter((e) => e.type === 'PESSOA' && !e.suggestion);

  it('cobre 100% dos nomes de envolvidos e dos documentos pessoais', () => {
    expect(report.peopleRecall).toBe(1);
    for (const t of report.byType) expect(t.recall, t.type).toBe(1);
  });

  it('não pseudonimiza municípios, órgãos, rótulos nem termos médicos (precisão ≥ 98%)', () => {
    expect(report.precision).toBeGreaterThanOrEqual(0.98);
    expect(report.keepCorrect).toBe(report.keepExpected);
  });

  it('8. o número de pessoas é o do gabarito (±1)', () => {
    const expected = gabarito.entities.filter((e) => e.type === 'PESSOA').length;
    expect(Math.abs(applied.length - expected)).toBeLessThanOrEqual(1);
    expect(entities.filter((e) => e.suggestion)).toHaveLength(0);
  });

  it('atribui os papéis do gabarito e nunca o mesmo marcador a duas pessoas', () => {
    const roleOf = (canonical: string) => applied.find((e) => e.canonical === canonical)?.role;
    for (const g of gabarito.entities.filter((e) => e.type === 'PESSOA' && e.role)) {
      expect(roleOf(g.canonical), g.canonical).toBe(g.role);
    }
    const canonicals = applied.map((e) => e.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('a vítima é uma só entidade em todas as peças (com e sem acento, quebrada em 2 linhas)', () => {
    const vitimas = applied.filter((e) => e.role === 'VÍTIMA');
    expect(vitimas).toHaveLength(1);
    expect(new Set(vitimas[0]?.occurrences.map((o) => o.pdfPage))).toEqual(
      new Set([1, 2, 3, 4, 6]),
    );
  });
});

describe('8. contagem de pessoas no IP fictício 1 (escopo padrão)', () => {
  it('igual ao gabarito (±1)', () => {
    const pages = gabaritoIp1.pages.map((p) => ({ docId: 'ip', pdfPage: p.pdfPage, text: p.text }));
    const applied = detectEntities(pages).filter((e) => e.type === 'PESSOA' && !e.suggestion);
    const expected = gabaritoIp1.entities.filter((e) => e.type === 'PESSOA').length;
    expect(Math.abs(applied.length - expected)).toBeLessThanOrEqual(1);
  });
});
