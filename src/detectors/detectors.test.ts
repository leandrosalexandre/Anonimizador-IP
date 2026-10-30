// Casos positivos e negativos de cada detector (todos os dados são fictícios).
import { describe, expect, it } from 'vitest';
import { detectEndereco } from './address';
import { detectEntities, detectPage } from './index';
import {
  detectBo,
  detectCep,
  detectChassi,
  detectCnh,
  detectCnpj,
  detectContaBancaria,
  detectCpf,
  detectDataNascimento,
  detectEmail,
  detectIp,
  detectPixAleatoria,
  detectPlaca,
  detectProcesso,
  detectRenavam,
  detectRg,
  detectTelefone,
  isValidCnj,
  isValidCnpj,
  isValidCpf,
} from './patterns';
import { ENTITY_TYPES, type Candidate } from './types';

/** Testes dos detectores: todos os tipos ativos (o padrão do app é mais restrito). */
const ALL = { types: ENTITY_TYPES };

const texts = (cs: Candidate[]) => cs.map((c) => c.text);
const people = (text: string) => detectPage(text, ALL).filter((c) => c.type === 'PESSOA');

describe('CPF e CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('acha CPF com e sem pontuação', () => {
    expect(texts(detectCpf('CPF 529.982.247-25 e CPF: 52998224725.'))).toEqual([
      '529.982.247-25',
      '52998224725',
    ]);
  });

  it('aceita CPF formatado com dígito errado (possível erro de OCR), com confiança menor', () => {
    const [c] = detectCpf('portador do 529.982.247-26');
    expect(c?.confidence).toBeLessThan(0.6);
  });

  it('corrige O/l do OCR em CPF rotulado', () => {
    expect(texts(detectCpf('CPF: 529.982.247-2S'))).toEqual([]);
    expect(texts(detectCpf('CPF: 529.982.2O7-25'))).toHaveLength(1);
  });

  it('ignora números de 11 dígitos sem rótulo e inválidos', () => {
    expect(detectCpf('protocolo 12345678901 do sistema')).toEqual([]);
  });

  it('acha CNPJ', () => {
    expect(texts(detectCnpj('CNPJ 11.222.333/0001-81'))).toEqual(['11.222.333/0001-81']);
  });
});

describe('documentos e veículos', () => {
  it('RG com órgão emissor', () => {
    expect(texts(detectRg('RG nº 2005009123456 SSP/CE, residente'))).toEqual(['2005009123456']);
    expect(texts(detectRg('RG: 98.765.432-1 SSPDS/CE'))).toEqual(['98.765.432-1']);
    expect(texts(detectRg('Carteira de Identidade 1234567-8'))).toEqual(['1234567-8']);
  });

  it('CNH e Renavam', () => {
    expect(texts(detectCnh('CNH nº 04512378965'))).toEqual(['04512378965']);
    expect(texts(detectRenavam('Renavam: 00912345678'))).toEqual(['00912345678']);
  });

  it('placas nos dois padrões', () => {
    expect(texts(detectPlaca('placa HXP-4821, depois HXP4821 e a Mercosul PNB2C47'))).toEqual([
      'HXP-4821',
      'HXP4821',
      'PNB2C47',
    ]);
    expect(detectPlaca('art. 157 do CP; OAB/CE 12.345; DPF99')).toEqual([]);
  });

  it('chassi (VIN) e chassi lido com O pelo OCR', () => {
    expect(texts(detectChassi('chassi 9BWZZZ377VT004251'))).toEqual(['9BWZZZ377VT004251']);
    expect(texts(detectChassi('chassi 9C2KC2210RRO04251'))).toEqual(['9C2KC2210RRO04251']);
  });
});

describe('contato', () => {
  it.each([
    '(85) 98812-3456',
    '85 98812-3456',
    '(85)99765-4321',
    '+55 85 3214-5678',
    '+55 (85) 9 8812-3456',
    '98812-3456',
  ])('telefone %s', (tel) => {
    expect(texts(detectTelefone(`contato: ${tel}.`))).toEqual([tel]);
  });

  it('não confunde telefone com datas, CEP, processo ou laudo', () => {
    expect(
      detectTelefone(
        'em 12/10/2026, CEP 60000-123, proc. 3012345-91.2026.8.06.0001, laudo 2026.0099',
      ),
    ).toEqual([]);
  });

  it('e-mail, inclusive com @ lido como Q pelo OCR', () => {
    expect(texts(detectEmail('e-mail fulano.ficticio@exemplo.com.br.'))).toEqual([
      'fulano.ficticio@exemplo.com.br',
    ]);
    expect(texts(detectEmail('fulano.ficticioQexemplo.com.br'))).toEqual([
      'fulano.ficticioQexemplo.com.br',
    ]);
  });

  it('chave Pix aleatória, inclusive quebrada em duas linhas', () => {
    expect(detectPixAleatoria('chave 7d9f0c2e-4b1a-4c3e-9f8a-1b2c3d4e5f60')).toHaveLength(1);
    expect(detectPixAleatoria('chave 7d9f0c2e-4b1a-\n4c3e-9f8a-1b2c3d4e5f60')).toHaveLength(1);
  });

  it('CEP com e sem hífen', () => {
    expect(texts(detectCep('CEP 60000-123; CEP: 60000456; 60.000-789'))).toEqual([
      '60000-123',
      '60.000-789',
      '60000456',
    ]);
  });

  it('conta bancária e agência', () => {
    expect(texts(detectContaBancaria('agência 1234-5, conta corrente 98765-0'))).toEqual([
      'agência 1234-5, conta corrente 98765-0',
    ]);
    expect(texts(detectContaBancaria('conta nº 12.345-6'))).toEqual(['12.345-6']);
  });
});

describe('datas e procedimentos', () => {
  it('data de nascimento só com contexto', () => {
    expect(texts(detectDataNascimento('nascida em 14/03/1985; DN: 02/09/1998 (28 anos)'))).toEqual([
      '14/03/1985',
      '02/09/1998',
    ]);
    expect(detectDataNascimento('O fato ocorreu em 12/10/2026.')).toEqual([]);
  });

  it('número CNJ com dígito verificador', () => {
    expect(isValidCnj('3012345-91.2026.8.06.0001')).toBe(true);
    expect(isValidCnj('3012345-92.2026.8.06.0001')).toBe(false);
    expect(detectProcesso('autos nº 3012345-91.2026.8.06.0001')[0]?.confidence).toBeGreaterThan(
      0.9,
    );
  });

  it('BO e IP', () => {
    expect(texts(detectBo('Boletim de Ocorrência nº 102-4567/2026'))).toEqual(['102-4567/2026']);
    expect(texts(detectBo('B.O. 999/2026'))).toEqual(['999/2026']);
    expect(texts(detectIp('Inquérito Policial nº 900-123/2026'))).toEqual(['900-123/2026']);
    expect(texts(detectIp('IP nº 321/2026'))).toEqual(['321/2026']);
  });
});

describe('endereço', () => {
  it.each([
    [
      'residente na Rua das Flores, nº 10, Bairro Centro, Fortaleza/CE. Disse',
      'Rua das Flores, nº 10, Bairro Centro, Fortaleza/CE',
    ],
    [
      'mora na Av. Bezerra de Menezes, 1500, Apto 12; trabalha',
      'Av. Bezerra de Menezes, 1500, Apto 12',
    ],
    ['na Travessa São José, s/n, CEP 60000-000', 'Travessa São José, s/n'],
    [
      'Conjunto Esperança, Quadra 5, Lote 12, Caucaia/CE',
      'Conjunto Esperança, Quadra 5, Lote 12, Caucaia/CE',
    ],
    ['seguiu pela Rodovia CE-040, km 12, sentido', 'Rodovia CE-040, km 12'],
  ])('%s', (text, expected) => {
    expect(texts(detectEndereco(text))).toContain(expected);
  });

  it('não pega "rua" minúscula no meio da frase', () => {
    expect(detectEndereco('saiu para a rua e voltou')).toEqual([]);
  });
});

describe('pessoas', () => {
  it('bloco de qualificação com papel', () => {
    const cs = people('Vítima: JOANA DARC FERREIRA LIMA\nTestemunha: Pedro Henrique Sales');
    expect(cs.map((c) => [c.text, c.role])).toEqual([
      ['JOANA DARC FERREIRA LIMA', 'VÍTIMA'],
      ['Pedro Henrique Sales', 'TESTEMUNHA'],
    ]);
  });

  it('filiação com pai e mãe', () => {
    const cs = people('FILIAÇÃO: JOSÉ CARLOS NUNES e ANTÔNIA MARIA NUNES');
    expect(cs.map((c) => c.text)).toEqual(['JOSÉ CARLOS NUNES', 'ANTÔNIA MARIA NUNES']);
    expect(cs.every((c) => c.role === 'FAMILIAR')).toBe(true);
  });

  it('gatilhos no texto corrido', () => {
    const cs = people('QUE a vítima Joana foi abordada; o investigado Rafael Moura Brito fugiu');
    expect(cs.map((c) => [c.text, c.role])).toEqual([
      ['Joana', 'VÍTIMA'],
      ['Rafael Moura Brito', 'INVESTIGADO'],
    ]);
  });

  it('sequências capitalizadas reforçadas por prenomes', () => {
    expect(people('ouvido ANTÔNIO CARLOS DE SOUSA, que declarou').map((c) => c.text)).toEqual([
      'ANTÔNIO CARLOS DE SOUSA',
    ]);
  });

  it('quebra a sequência nas palavras excluídas', () => {
    expect(people('INDICIO JOÃO PEDRO ALVES nas penas').map((c) => c.text)).toEqual([
      'JOÃO PEDRO ALVES',
    ]);
    expect(people('ESTADO DO CEARÁ\nSECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL')).toEqual([]);
    expect(people('nos termos do Código de Processo Penal e da Lei Maria da Penha')).toEqual([]);
  });

  it('autoridades sugeridas como manter', () => {
    const cs = people(
      'PEDRO ALVES LIMA\nDelegado de Polícia Civil\n\nMaria José Rocha\nDeclarante',
    );
    expect(cs.map((c) => [c.text, Boolean(c.authority)])).toEqual([
      ['PEDRO ALVES LIMA', true],
      ['Maria José Rocha', false],
    ]);
    expect(people('apresentados pelo Inspetor Caio Ribeiro Lopes')[0]?.authority).toBe(true);
  });

  it('apelidos', () => {
    const cs = detectPage(
      'o nacional conhecido como "Zé Pequeno"; vulgo GALEGO; Alcunha: Bigode',
      ALL,
    );
    expect(cs.filter((c) => c.type === 'APELIDO').map((c) => c.text)).toEqual([
      'Zé Pequeno',
      'GALEGO',
      'Bigode',
    ]);
  });

  it('empresas privadas', () => {
    const cs = detectPage('na loja Comercial Silva & Filhos Ltda. e no Banco Exemplo S.A.', ALL);
    const companies = cs.filter((c) => c.type === 'EMPRESA_PRIVADA');
    expect(companies.map((c) => [c.text, Boolean(c.authority)])).toEqual([
      ['Comercial Silva & Filhos Ltda.', false],
      ['Banco Exemplo S.A.', true],
    ]);
  });
});

describe('agrupamento de variantes', () => {
  const page = (text: string, pdfPage = 1) => ({ docId: 'd', pdfPage, text });

  it('agrupa nome completo, parcial, caixa alta e prenome', () => {
    const entities = detectEntities([
      page('Vítima: MARIA DA SILVA SOUZA, CPF 529.982.247-25.'),
      page('QUE Maria Souza disse; a declarante Maria assinou.', 2),
    ]);
    const maria = entities.filter((e) => e.type === 'PESSOA');
    expect(maria).toHaveLength(1);
    expect(maria[0]?.canonical).toBe('Maria da Silva Souza');
    expect(maria[0]?.variants).toEqual(
      expect.arrayContaining(['MARIA DA SILVA SOUZA', 'Maria Souza', 'Maria']),
    );
    const cpf = entities.find((e) => e.type === 'CPF');
    expect(cpf?.linkedTo).toBe(maria[0]?.id);
  });

  it('não funde dois "João" diferentes: deixa como sugestão ambígua', () => {
    const entities = detectEntities([
      page('Testemunha: JOÃO PEDRO ALVES\nTestemunha: JOÃO CARLOS LIMA\nQUE a vítima João fugiu'),
    ]);
    const joao = entities.find((e) => e.canonical === 'João');
    expect(joao?.ambiguousWith).toHaveLength(2);
  });

  it('tolera erro de OCR de 1 caractere em nome longo', () => {
    const entities = detectEntities([
      page('Investigado: RAIMUNDO NONATO FERREIRA'),
      page('QUE RAIMUNDO NONATO FERRElRA confirmou', 2),
    ]);
    expect(entities.filter((e) => e.type === 'PESSOA')).toHaveLength(1);
  });

  it('agrupa dados com formatos diferentes', () => {
    const entities = detectEntities(
      [
        page('tel (85) 98812-3456 e placa HXP-4821'),
        page('telefone 85 98812-3456; placa HXP4821', 2),
      ],
      ALL,
    );
    expect(entities.filter((e) => e.type === 'TELEFONE')).toHaveLength(1);
    expect(entities.filter((e) => e.type === 'PLACA')).toHaveLength(1);
  });

  it('respeita termos de exclusão e nomes a manter das configurações', () => {
    const text = 'QUE estava na Praça Ferreira com Pedro Alves Lima';
    const withExclusion = detectEntities([page('QUE Ferreira Gomes Lima chegou')], {
      ...ALL,
      exclusions: ['Ferreira'],
    });
    expect(withExclusion.filter((e) => e.type === 'PESSOA').map((e) => e.canonical)).toEqual([
      'Gomes Lima',
    ]);
    const kept = detectEntities([page(text)], { ...ALL, keepNames: ['Pedro Alves Lima'] });
    expect(kept.find((e) => e.canonical === 'Pedro Alves Lima')?.decision).toBe('keep');
  });
});
