// Aceite da Fase 7: um texto de análise com todas as variações é reidentificado corretamente, e um
// marcador inventado ("[VÍTIMA 9]") aparece no relatório como desconhecido.
import { describe, expect, it } from 'vitest';
import type { StoredEntity } from '../vault/types';
import { reidentify } from './reidentify';

function entity(
  partial: Partial<StoredEntity> & Pick<StoredEntity, 'id' | 'type' | 'canonical'>,
): StoredEntity {
  return {
    role: null,
    index: 1,
    variants: [partial.canonical],
    decision: 'pseudonymize',
    reviewed: true,
    linkedTo: null,
    ambiguousWith: [],
    source: 'detected',
    confidence: 1,
    ...partial,
  };
}

const ENTITIES: StoredEntity[] = [
  entity({ id: 'v1', type: 'PESSOA', role: 'VÍTIMA', index: 1, canonical: 'Maria da Silva' }),
  entity({ id: 'v2', type: 'PESSOA', role: 'VÍTIMA', index: 2, canonical: 'Ana Souza' }),
  entity({ id: 'a1', type: 'PESSOA', role: 'AUTOR', index: 1, canonical: 'João Pedro Alves' }),
  entity({ id: 'a2', type: 'PESSOA', role: 'AUTOR', index: 2, canonical: 'Carlos Lima' }),
  entity({ id: 't1', type: 'PESSOA', role: 'TESTEMUNHA', index: 1, canonical: 'Rita Gomes' }),
  entity({ id: 'ap', type: 'APELIDO', index: 1, canonical: 'Galego', linkedTo: 'a1' }),
  entity({
    id: 'end',
    type: 'ENDERECO',
    index: 1,
    canonical: 'Rua das Flores, nº 10',
    linkedTo: 'v1',
  }),
  entity({ id: 'cpf', type: 'CPF', index: 1, canonical: '529.982.247-25' }),
  entity({ id: 'dn', type: 'DATA_NASCIMENTO', index: 1, canonical: '14/03/1985' }),
  entity({ id: 'del', type: 'PESSOA', index: null, canonical: 'Paulo Lima', decision: 'keep' }),
];

const ANALYSIS = [
  '1. A [VÍTIMA 1] reconheceu o [AUTOR 1], vulgo "[APELIDO DE AUTOR 1]", às fls. 5.',
  '2. A Vítima 1 mora na [ENDEREÇO DE VÍTIMA 1], CPF [CPF 1], nascida em [DATA DE NASCIMENTO 1].',
  '3. Segundo a VITIMA 1 e a vitima 2, o autor 2 fugiu.',
  '4. As [VÍTIMAS 1 e 2] e os AUTORES 1, 2 foram ouvidos; a [TESTEMUNHA 1] confirmou.',
  '5. Não há prova contra a [VÍTIMA 9] nem contra o [PERITO 1].',
  '6. A vítima não compareceu; o autor fugiu; o IP 1 não existe aqui.',
].join('\n');

describe('reidentificação', () => {
  const result = reidentify(ANALYSIS, ENTITIES);
  const lines = result.text.split('\n');

  it('troca marcadores com colchetes, inclusive compostos', () => {
    expect(lines[0]).toBe(
      '1. A Maria da Silva reconheceu o João Pedro Alves, vulgo "Galego", às fls. 5.',
    );
    expect(lines[1]).toBe(
      '2. A Maria da Silva mora na Rua das Flores, nº 10, CPF 529.982.247-25, nascida em 14/03/1985.',
    );
  });

  it('tolera ausência de colchetes, de acento e caixa diferente', () => {
    expect(lines[2]).toBe('3. Segundo a Maria da Silva e a Ana Souza, o Carlos Lima fugiu.');
  });

  it('tolera plural com lista de números', () => {
    expect(lines[3]).toBe(
      '4. As Maria da Silva e Ana Souza e os João Pedro Alves, Carlos Lima foram ouvidos; a Rita Gomes confirmou.',
    );
  });

  it('relata marcadores desconhecidos (inventados pela IA)', () => {
    expect(lines[4]).toBe('5. Não há prova contra a [VÍTIMA 9] nem contra o [PERITO 1].');
    expect(result.report.unknown.map((u) => u.text)).toEqual(['[VÍTIMA 9]', '[PERITO 1]']);
    expect(result.segments.filter((s) => s.kind === 'unknown').map((s) => s.text)).toEqual([
      '[VÍTIMA 9]',
      '[PERITO 1]',
    ]);
  });

  it('não troca palavras comuns nem rótulos que não existem no cofre', () => {
    expect(lines[5]).toBe('6. A vítima não compareceu; o autor fugiu; o IP 1 não existe aqui.');
  });

  it('conta as substituições por marcador', () => {
    const v1 = result.report.replaced.find((r) => r.label === '[VÍTIMA 1]');
    expect(v1).toEqual({ label: '[VÍTIMA 1]', value: 'Maria da Silva', count: 4 });
  });

  it('formato com papel', () => {
    const r = reidentify('A [VÍTIMA 1] e o [AUTOR 1]; CPF [CPF 1].', ENTITIES, 'nameRole');
    expect(r.text).toBe(
      'A Maria da Silva (vítima) e o João Pedro Alves (autor); CPF 529.982.247-25.',
    );
  });

  it('não confunde VÍTIMA 1 com VÍTIMA 10', () => {
    expect(reidentify('[VÍTIMA 10]', ENTITIES).report.unknown).toEqual([
      { text: '[VÍTIMA 10]', count: 1 },
    ]);
  });
});
