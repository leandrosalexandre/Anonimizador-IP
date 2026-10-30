import { describe, expect, it } from 'vitest';
import { detectEntities } from '../detectors';
import { ENTITY_TYPES } from '../detectors/types';

const ALL = { types: ENTITY_TYPES };
import { emptyVaultContent, type VaultContent } from '../vault/types';
import { duplicateLabels, labelOf, nextIndex } from './labels';
import { buildLocator, substitute } from './locate';
import {
  acceptSuggestion,
  addManual,
  applyDetection,
  assignRole,
  changeType,
  cleanName,
  confirm,
  discard,
  keepSeparate,
  link,
  markExported,
  merge,
  pseudonymizeAllPeople,
  removeVariant,
  resetReview,
  reviewProgress,
  setDecision,
  setIndex,
  splitVariant,
  unify,
  unifyInto,
} from './model';
import type { StoredEntity } from '../vault/types';

const TEXT =
  'Vítima: MARIA DA SILVA SOUZA, CPF 529.982.247-25, residente na Rua das Flores, nº 10.\n' +
  'QUE Maria Souza foi abordada por JOÃO PEDRO ALVES, vulgo "Galego".\n' +
  'PAULO ROBERTO LIMA\nDelegado de Polícia Civil';

function detected(): VaultContent {
  const pages = [{ docId: 'd', pdfPage: 1, text: TEXT }];
  return applyDetection(emptyVaultContent(), detectEntities(pages, ALL));
}

const byCanonical = (c: VaultContent, re: RegExp) => {
  const e = c.entities.find((x) => re.test(x.canonical));
  if (!e) throw new Error(`entidade ${re} não encontrada`);
  return e;
};
const labels = (c: VaultContent) => {
  const byId = new Map(c.entities.map((e) => [e.id, e]));
  return (id: string) => {
    const e = byId.get(id);
    return e && e.decision === 'pseudonymize' ? labelOf(e, byId) : null;
  };
};
const pseudonymize = (c: VaultContent, text = TEXT) =>
  substitute(text, buildLocator(c.entities).locate(text), labels(c));

describe('revisão', () => {
  it('importa a detecção com papéis, números e sugestões pendentes', () => {
    const c = detected();
    const maria = byCanonical(c, /Maria da Silva Souza/);
    expect(maria).toMatchObject({ role: 'VÍTIMA', index: 1, reviewed: false });
    expect(byCanonical(c, /Paulo/).decision).toBe('keep');
    expect(reviewProgress(c.entities).reviewed).toBe(0);
  });

  it('gera texto pseudonimizado com marcadores, mantendo autoridades', () => {
    let c = detected();
    const joao = byCanonical(c, /João/);
    c = assignRole(c, joao.id, 'autor');
    const out = pseudonymize(c);
    expect(out).toContain('Vítima: [VÍTIMA 1], CPF [CPF 1]');
    expect(out).toContain(
      'QUE [VÍTIMA 1] foi abordada por [AUTOR 1], vulgo "[APELIDO DE AUTOR 1]"',
    );
    expect(out).toContain('PAULO ROBERTO LIMA\nDelegado');
    expect(out).not.toMatch(/MARIA|Souza|529\.982|JOÃO|Galego|Flores/);
  });

  it('numeração estável e sem repetição', () => {
    let c = detected();
    const joao = byCanonical(c, /João/);
    c = assignRole(c, joao.id, 'VÍTIMA');
    expect(c.entities.find((e) => e.id === joao.id)?.index).toBe(2);
    expect(duplicateLabels(c.entities)).toEqual([]);
    // Dar a João o número de outra vítima = é a mesma pessoa: unifica, sem marcador repetido.
    c = assignRole(c, joao.id, 'VÍTIMA', 1);
    expect(duplicateLabels(c.entities)).toEqual([]);
    expect(c.entities.some((e) => e.id === joao.id)).toBe(false);
  });

  it('manter e voltar a pseudonimizar', () => {
    let c = detected();
    const paulo = byCanonical(c, /Paulo/);
    c = setDecision(c, paulo.id, 'pseudonymize');
    expect(pseudonymize(c)).not.toContain('PAULO');
    c = setDecision(c, paulo.id, 'keep');
    expect(pseudonymize(c)).toContain('PAULO');
  });

  it('mesclar e separar variantes', () => {
    let c = detected();
    const { content, id } = addManual(c, 'Mariazinha', 'PESSOA');
    c = merge(content, [byCanonical(content, /Maria da Silva/).id, id]);
    const maria = byCanonical(c, /Maria da Silva/);
    expect(maria.variants).toContain('Mariazinha');
    expect(c.entities.some((e) => e.id === id)).toBe(false);
    c = splitVariant(c, maria.id, 'Mariazinha');
    expect(byCanonical(c, /^Mariazinha$/).reviewed).toBe(false);
  });

  it('descartar lembra o falso positivo numa nova detecção', () => {
    let c = detected();
    const street = c.entities.find((e) => e.type === 'ENDERECO');
    expect(street).toBeDefined();
    c = discard(c, street?.id ?? '');
    const again = applyDetection(c, detectEntities([{ docId: 'd', pdfPage: 1, text: TEXT }], ALL));
    expect(again.entities.some((e) => e.type === 'ENDERECO')).toBe(false);
    expect(again.entities).toHaveLength(c.entities.length);
  });

  it('nova detecção preserva decisões e números', () => {
    let c = detected();
    const joao = byCanonical(c, /João/);
    c = assignRole(c, joao.id, 'AUTOR');
    const again = applyDetection(
      c,
      detectEntities([{ docId: 'd', pdfPage: 1, text: TEXT + '\nJoão Pedro Alves' }], ALL),
    );
    expect(byCanonical(again, /João/)).toMatchObject({ role: 'AUTOR', index: 1, reviewed: true });
  });

  it('vincular endereço muda o marcador', () => {
    let c = detected();
    const street = c.entities.find((e) => e.type === 'ENDERECO');
    c = link(c, street?.id ?? '', byCanonical(c, /Maria da Silva/).id);
    expect(pseudonymize(c)).toContain('[ENDEREÇO DE VÍTIMA 1]');
  });

  it('marcação manual de um trecho perdido pelo detector', () => {
    let c = detected();
    const r = addManual(c, 'Galeguinho', 'APELIDO');
    c = r.content;
    expect(pseudonymize(c, 'chamado de Galeguinho na rua')).toBe(
      `chamado de [APELIDO ${c.entities.find((e) => e.id === r.id)?.index}] na rua`,
    );
    expect(() => addManual(c, 'x', 'OUTRO')).toThrow(/2 caracteres/);
  });

  it('confirmar aceita sugestões', () => {
    let c = detected();
    c = confirm(
      c,
      c.entities.map((e) => e.id),
    );
    expect(reviewProgress(c.entities)).toMatchObject({ pendingPeople: 0 });
    expect(nextIndex(c.entities, { type: 'CPF', role: null })).toBe(2);
  });

  it('não substitui prenome isolado em minúsculas nem dentro de outra palavra', () => {
    const c = detected();
    expect(pseudonymize(c, 'a mariana e a maria; Marias')).toBe('a mariana e a maria; Marias');
  });
});

describe('unificação e limpeza na revisão', () => {
  const person = (id: string, canonical: string, role: string | null, index: number) =>
    ({
      id,
      type: 'PESSOA',
      role,
      index,
      canonical,
      variants: [canonical.toLocaleUpperCase('pt-BR')],
      decision: 'pseudonymize',
      reviewed: false,
      linkedTo: null,
      ambiguousWith: [],
      source: 'detected',
      confidence: 0.9,
    }) satisfies StoredEntity;

  const withEntities = (entities: StoredEntity[]): VaultContent => ({
    ...emptyVaultContent(),
    entities,
  });

  it('"Limpar nome" corta o lixo, unifica com o nome correto e renumera sem lacunas', () => {
    let c = withEntities([
      person('a', 'Maria Lúcia Sousa Sexo Feminino', 'VÍTIMA', 1),
      person('b', 'Maria Lúcia Sousa', 'VÍTIMA', 2),
      person('c', 'Ana Rocha', 'VÍTIMA', 3),
    ]);
    c = cleanName(c, 'a', ['Sexo', 'Feminino']);
    const vitimas = c.entities.filter((e) => e.role === 'VÍTIMA');
    expect(vitimas.map((e) => [e.canonical, e.index])).toEqual([
      ['Maria Lúcia Sousa', 1],
      ['Ana Rocha', 2],
    ]);
    expect(vitimas[0]?.variants).not.toContain('MARIA LÚCIA SOUSA SEXO FEMININO');
  });

  it('"Unificar" fica com o papel mais relevante; "Manter separados" não volta a sugerir', () => {
    let c = withEntities([
      { ...person('a', 'Raimundo Nonato', 'COMUNICANTE', 1), ambiguousWith: ['b'] },
      { ...person('b', 'Raimundo Nonato Araújo', 'TESTEMUNHA', 1), ambiguousWith: ['a'] },
    ]);
    const unified = unify(c, 'a', 'b');
    expect(unified.entities).toHaveLength(1);
    expect(unified.entities[0]).toMatchObject({ role: 'TESTEMUNHA', index: 1 });
    expect(unified.entities[0]?.roleConflicts).toEqual(['TESTEMUNHA', 'COMUNICANTE']);

    c = keepSeparate(c, 'a', 'b');
    expect(c.entities.every((e) => e.ambiguousWith.length === 0)).toBe(true);
    expect(c.config.separate).toEqual([['a', 'b']]);
  });

  it('depois da primeira exportação, os números não mudam', () => {
    let c = markExported(
      withEntities([person('a', 'Ana Rocha', 'VÍTIMA', 1), person('b', 'Rita Gomes', 'VÍTIMA', 2)]),
    );
    c = discard(c, 'a');
    expect(c.entities[0]?.index).toBe(2);
  });

  it('sugestões não aplicadas não são substituídas nem contam na revisão', () => {
    const pages = [
      { docId: 'd', pdfPage: 1, text: 'QUE na ocasião Ferreira Gomes chegou ao local' },
    ];
    let c = applyDetection(emptyVaultContent(), detectEntities(pages));
    const sug = c.entities.find((e) => e.suggested);
    expect(sug).toMatchObject({ canonical: 'Ferreira Gomes', decision: 'keep' });
    expect(reviewProgress(c.entities)).toMatchObject({ total: 0, pendingPeople: 0 });
    expect(pseudonymize(c, pages[0]?.text)).toBe(pages[0]?.text);
    c = acceptSuggestion(c, sug?.id ?? '');
    expect(pseudonymize(c, pages[0]?.text)).toBe('QUE na ocasião [PESSOA 1] chegou ao local');
  });

  it('nova detecção remove entidades antigas não revisadas que não são mais encontradas', () => {
    const stale = { ...person('x', 'Hora do Registro', null, 1) };
    const c = applyDetection(
      withEntities([stale, { ...person('y', 'Natureza do Fato', null, 2), reviewed: true }]),
      detectEntities([{ docId: 'd', pdfPage: 1, text: 'Vítima: ANA PAULA ROCHA' }]),
    );
    expect(c.entities.map((e) => e.canonical).sort()).toEqual([
      'Ana Paula Rocha',
      'Natureza do Fato',
    ]);
    expect(resetReview(c).entities).toEqual([]);
  });
});

describe('campos da revisão (pedido do usuário)', () => {
  const TEXT2 =
    'Vítima: JOSÉ GERARDO DE SOUZA, CPF 529.982.247-25.\n' +
    'RELATÓRIO: QUE Gerardo Souza foi ouvido. Testemunha: ANA PAULA ROCHA.\n' +
    'Natural de Santana do Acaraú. QUE encontrou Raimundo Bezerra Mota.';
  const fresh = () =>
    applyDetection(emptyVaultContent(), detectEntities([{ docId: 'd', pdfPage: 1, text: TEXT2 }]));
  const pseud = (c: VaultContent) => {
    const byId = new Map(c.entities.map((e) => [e.id, e]));
    return substitute(TEXT2, buildLocator(c.entities).locate(TEXT2), (id) => {
      const e = byId.get(id);
      return e && e.decision === 'pseudonymize' ? labelOf(e, byId) : null;
    });
  };

  it('"É a mesma pessoa que…" unifica e todas as ocorrências viram o mesmo marcador', () => {
    let c = fresh();
    const vitima = byCanonical(c, /José Gerardo/);
    const { content, id } = addManual(c, 'Raimundo Bezerra Mota', 'PESSOA');
    c = unifyInto(content, vitima.id, id);
    expect(c.entities.some((e) => e.id === id)).toBe(false);
    expect(pseud(c)).toContain('QUE encontrou [VÍTIMA 1].');
  });

  it('dar à pessoa o número de outra ("é a VÍTIMA 1") unifica sem duplicar', () => {
    let c = fresh();
    const ana = byCanonical(c, /Ana Paula/);
    c = assignRole(c, ana.id, 'VÍTIMA');
    expect(c.entities.find((e) => e.id === ana.id)?.index).toBe(2);
    c = setIndex(c, ana.id, 1);
    expect(c.entities.filter((e) => e.role === 'VÍTIMA')).toHaveLength(1);
    expect(pseud(c)).toContain('Testemunha: [VÍTIMA 1].');
  });

  it('apagar uma variante a mais', () => {
    let c = fresh();
    const { content, id } = addManual(c, 'JOSÉ GERARDO DE SOUZA Arquivos', 'PESSOA', {
      addToId: byCanonical(c, /José Gerardo/).id,
    });
    c = removeVariant(content, id, 'JOSÉ GERARDO DE SOUZA Arquivos');
    expect(byCanonical(c, /José Gerardo/).variants).not.toContain('JOSÉ GERARDO DE SOUZA Arquivos');
    expect(c.config.dismissed).toContain('JOSÉ GERARDO DE SOUZA Arquivos');
  });

  it('marcar como cidade: fica em claro e não volta como pessoa', () => {
    let c = applyDetection(
      emptyVaultContent(),
      detectEntities([{ docId: 'd', pdfPage: 1, text: 'QUE encontrou Raimundo Bezerra Mota.' }]),
    );
    const r = byCanonical(c, /Raimundo/);
    c = changeType(c, r.id, 'CIDADE');
    expect(c.entities[0]).toMatchObject({ type: 'CIDADE', decision: 'keep', index: null });
    const again = applyDetection(
      c,
      detectEntities([{ docId: 'd', pdfPage: 1, text: 'QUE encontrou Raimundo Bezerra Mota.' }]),
    );
    expect(again.entities.filter((e) => e.type === 'PESSOA')).toHaveLength(0);
    expect(addManual(c, 'Santana do Acaraú', 'CIDADE').content.entities.at(-1)?.decision).toBe(
      'keep',
    );
  });

  it('"Pseudonimizar todas as pessoas" confirma todas, mantendo as autoridades', () => {
    const c = pseudonymizeAllPeople(detected());
    const people = c.entities.filter((e) => e.type === 'PESSOA');
    expect(people.every((e) => e.reviewed)).toBe(true);
    expect(byCanonical(c, /Paulo/).decision).toBe('keep');
    expect(reviewProgress(c.entities).pendingPeople).toBe(0);
    const all = pseudonymizeAllPeople(detected(), { includeKept: true });
    expect(byCanonical(all, /Paulo/).decision).toBe('pseudonymize');
  });
});
