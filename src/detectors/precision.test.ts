// Correção da detecção (precisão primeiro): casos vistos em inquéritos reais, com dados fictícios.
import { describe, expect, it } from 'vitest';
import { detectEntities, detectPage } from './index';
import { isValidCns, isValidTituloEleitor } from './patterns';
import type { DetectedEntity } from './types';

const page = (text: string, pdfPage = 1, docId = 'd') => ({ docId, pdfPage, text });
const people = (entities: DetectedEntity[]) =>
  entities.filter((e) => e.type === 'PESSOA' && !e.suggestion);
const names = (text: string) =>
  detectPage(text)
    .filter((c) => c.type === 'PESSOA' && !c.suggestion)
    .map((c) => c.text);

describe('limite do nome em blocos de qualificação', () => {
  it('1. "Nome:" colado ao valor para no próximo rótulo', () => {
    const text = 'Nome:JOSÉ DA SILVA SANTOS Data de Nascimento: 01/01/1970 CPF:529.982.247-25';
    expect(names(text)).toEqual(['JOSÉ DA SILVA SANTOS']);
    const cpf = detectPage(text).find((c) => c.type === 'CPF');
    expect(cpf?.text).toBe('529.982.247-25');
  });

  it('para no rótulo seguinte em CAIXA ALTA, na quebra de linha e em vírgula de qualificação', () => {
    expect(names('NOME: MARIA LIMA SOUSA SEXO: FEMININO')).toEqual(['MARIA LIMA SOUSA']);
    expect(names('Nome: JOÃO PEREIRA NETO\nEndereço: SÍTIO BOA VISTA')).toEqual([
      'JOÃO PEREIRA NETO',
    ]);
    expect(names('Nome: ANA PAULA ROCHA, brasileira, solteira, CPF 529.982.247-25')).toEqual([
      'ANA PAULA ROCHA',
    ]);
  });

  it('não lê "Relação com a vítima: VIZINHO" como nome de vítima', () => {
    expect(names('Telefone: (88) 98111-2040 Relação com a vítima: VIZINHO')).toEqual([]);
  });

  it('corta em no máximo 7 palavras', () => {
    const [name] = names('Nome: ANTÔNIO CARLOS JOSÉ MARIA PEDRO PAULO LUCAS MATEUS');
    expect(name?.split(' ')).toHaveLength(7);
  });
});

describe('unificação', () => {
  it('2. nome com "lixo" e nome correto na mesma peça viram uma única VÍTIMA 1', () => {
    const entities = detectEntities([
      page(
        'DADOS DA(S) VÍTIMA(S)\nNome: MARIA LÚCIA SOUSA Sexo: FEMININO Cor/Raça: PARDA\n' +
          'Relato: a vítima MARIA LÚCIA SOUSA foi socorrida.',
      ),
    ]);
    const vitimas = people(entities).filter((e) => e.role === 'VÍTIMA');
    expect(vitimas).toHaveLength(1);
    expect(vitimas[0]?.canonical).toBe('Maria Lúcia Sousa');
  });

  it('3. a mesma vítima no BO, no termo e no relatório recebe um só marcador', () => {
    const entities = detectEntities([
      page('BOLETIM DE OCORRÊNCIA\nVítima: FRANCISCA HELENA MOURA LIMA', 1),
      page('TERMO DE DECLARAÇÕES\nQUE a vítima Francisca Helena Moura Lima declarou', 2),
      page('RELATÓRIO DE LOCAL DE CRIME\nA vítima FRANCISCA HELENA MOURA\nLIMA foi removida.', 3),
      page('Laudo sem acentos: a vitima FRANCISCA HELENA MOURA LIMA', 4),
    ]);
    const vitimas = people(entities).filter((e) => e.role === 'VÍTIMA');
    expect(vitimas).toHaveLength(1);
    expect(new Set(vitimas[0]?.occurrences.map((o) => o.pdfPage))).toEqual(new Set([1, 2, 3, 4]));
    // No relatório, o nome quebrado em duas linhas é uma única ocorrência.
    const p3 = vitimas[0]?.occurrences.filter((o) => o.pdfPage === 3);
    expect(p3?.map((o) => o.text)).toEqual(['FRANCISCA HELENA MOURA\nLIMA']);
  });

  it('Francisco e Francisca com o mesmo sobrenome não são unificados', () => {
    const entities = detectEntities([
      page('filho(a) de FRANCISCA ARAÚJO NUNES e FRANCISCO ARAÚJO NUNES, natural de Sobral'),
    ]);
    expect(
      people(entities)
        .map((e) => e.canonical)
        .sort(),
    ).toEqual(['Francisca Araújo Nunes', 'Francisco Araújo Nunes']);
  });
});

describe('filiação, listas e papéis', () => {
  it('4. "filho(a) de MARIA X e JOÃO Y" → dois familiares distintos', () => {
    const entities = detectEntities([
      page('Nome: PEDRO HENRIQUE COSTA, filho(a) de MARIA HELENA COSTA e JOÃO BATISTA COSTA'),
    ]);
    const familiares = people(entities).filter((e) => e.role === 'FAMILIAR');
    expect(familiares.map((e) => e.canonical)).toEqual([
      'Maria Helena Costa',
      'João Batista Costa',
    ]);
  });

  it('separa a filiação com barra e com "E" em caixa alta', () => {
    expect(names('Filiação: MARIA JOSÉ FERREIRA / FRANCISCO DOS SANTOS')).toEqual([
      'MARIA JOSÉ FERREIRA',
      'FRANCISCO DOS SANTOS',
    ]);
    expect(names('FILHO DE MARIA IVONE MOTA E JOSÉ WILSON SILVA')).toEqual([
      'MARIA IVONE MOTA',
      'JOSÉ WILSON SILVA',
    ]);
  });

  it('6. "Dr. FULANO - CRM 12345" recebe papel MÉDICO, não FAMILIAR', () => {
    const entities = detectEntities([
      page('Médico: Dr. HENRIQUE MOURA LEITE - CRM 12345\nQUE o filho de HENRIQUE MOURA LEITE'),
    ]);
    const medico = people(entities).find((e) => e.canonical === 'Henrique Moura Leite');
    expect(medico?.role).toBe('MÉDICO');
    expect(medico?.decision).toBe('pseudonymize');
    expect(medico?.roleConflicts).toEqual(['MÉDICO', 'FAMILIAR']);
  });

  it('perito é mantido com papel PERITO', () => {
    const entities = detectEntities([page('Perito Criminal: ARMANDO TEIXEIRA BASTOS')]);
    expect(people(entities)[0]).toMatchObject({ role: 'PERITO', decision: 'keep' });
  });

  it('7. "ACUSADOS: A, B E C" → três autores', () => {
    const entities = detectEntities([
      page(
        'ACUSADOS: JOSÉ WELLINGTON MOTA SILVA, ÍTALO RENAN COSTA PEREIRA E DAMIÃO FERNANDES ROCHA',
      ),
    ]);
    const autores = people(entities);
    expect(autores.map((e) => [e.canonical, e.role])).toEqual([
      ['José Wellington Mota Silva', 'AUTOR'],
      ['Ítalo Renan Costa Pereira', 'AUTOR'],
      ['Damião Fernandes Rocha', 'AUTOR'],
    ]);
  });

  it('papel pelo cabeçalho do bloco e prioridade VÍTIMA > … > COMUNICANTE', () => {
    const entities = detectEntities([
      page(
        'DADOS DO(S) NOTICIANTE(S)\nNome:RAIMUNDO NONATO ARAÚJO Data de Nascimento: 02/02/1975',
        1,
      ),
      page('TERMO DE DEPOIMENTO DA TESTEMUNHA\nNome: RAIMUNDO NONATO ARAÚJO, casado', 2),
    ]);
    const [raimundo] = people(entities);
    expect(raimundo?.role).toBe('TESTEMUNHA');
    expect(raimundo?.roleConflicts).toEqual(['TESTEMUNHA', 'COMUNICANTE']);
  });
});

describe('excesso de detecção', () => {
  it('5. município, natureza, rótulos, hospital e termos médicos ficam em claro', () => {
    const text = [
      'Município: SANTANA DO ACARAÚ/CE',
      'Natureza do Fato: HOMICÍDIO',
      'Data de Nascimento:',
      'Data/Hora do Registro: 03/09/2026 22:15',
      'socorrida à SANTA CASA DE SOBRAL, com fratura de rádio e ulna',
      'GOVERNO DO ESTADO DO CEARÁ',
      'BOLETIM DE OCORRÊNCIA',
      'Sexo: MASCULINO Cor/Raça: PARDA Estado Civil: SOLTEIRO Escolaridade: ALFABETIZADO',
      'Nacionalidade: BRASILEIRA Profissão: AUTÔNOMO',
      'levada ao Hospital Regional Norte, em Sobral/CE, com TCE e politrauma, para a UTI.',
    ].join('\n');
    const all = detectPage(text).filter((c) => c.type === 'PESSOA');
    expect(all.map((c) => c.text)).toEqual([]);
  });

  it('palavras capitalizadas sem prenome conhecido viram sugestão, não substituição', () => {
    const cs = detectPage('QUE na ocasião Ferreira Gomes chegou ao local').filter(
      (c) => c.type === 'PESSOA',
    );
    expect(cs).toHaveLength(1);
    expect(cs[0]?.suggestion).toBe(true);
  });

  it('município que também é prenome só é lugar com contexto', () => {
    expect(names('a vítima AURORA MARIA LIMA disse')).toEqual(['AURORA MARIA LIMA']);
    expect(names('natural de Aurora/CE')).toEqual([]);
  });
});

describe('novo escopo padrão', () => {
  const text =
    'Nome: PEDRO ALVES LIMA, CPF 529.982.247-25, residente na Rua das Flores, nº 10, placa HXP-4821, ' +
    'e-mail pedro@exemplo.com, BO nº 512-347/2026, telefone (85) 98812-3456, nascido em 01/01/1990.';

  it('pseudonimiza só nomes e documentos pessoais (data de nascimento fica)', () => {
    const types = new Set(detectPage(text).map((c) => c.type));
    expect([...types].sort()).toEqual(['CPF', 'PESSOA', 'TELEFONE']);
  });

  it('os demais tipos podem ser reativados', () => {
    const types = new Set(
      detectPage(text, { types: ['PESSOA', 'ENDERECO', 'PLACA', 'EMAIL', 'NUM_BO'] }).map(
        (c) => c.type,
      ),
    );
    expect([...types].sort()).toEqual(['EMAIL', 'ENDERECO', 'NUM_BO', 'PESSOA', 'PLACA']);
  });

  it('título de eleitor, CNS, passaporte e prontuário', () => {
    const cs = detectPage(
      'Título de Eleitor: 0451 2378 0701 CNS: 104 1234 5678 0018 Passaporte nº FX123456 Prontuário: 2026/004512',
    );
    expect(cs.map((c) => [c.type, c.text])).toEqual([
      ['TITULO_ELEITOR', '0451 2378 0701'],
      ['CNS', '104 1234 5678 0018'],
      ['PASSAPORTE', 'FX123456'],
      ['PRONTUARIO', '2026/004512'],
    ]);
    expect(isValidTituloEleitor('045123780701')).toBe(true);
    expect(isValidTituloEleitor('045123780702')).toBe(false);
    expect(isValidCns('104123456780018')).toBe(true);
    expect(isValidCns('104123456780019')).toBe(false);
  });
});

describe('nome repetido e texto colado ao nome', () => {
  it('"JOSÉ GERARDO DE SOUZA" repetido na linha seguinte com rótulo ou "Arquivos" é uma só pessoa', () => {
    const entities = detectEntities([
      page(
        'Vítima: JOSÉ GERARDO DE SOUZA\nJOSÉ GERARDO DE SOUZA Nascimento: 01/01/1970\n' +
          'JOSÉ GERARDO DE SOUZA Arquivos digitalizados\nRELATÓRIO\nJOSÉ GERARDO DE SOUZA\nArquivo 3',
      ),
    ]);
    const all = entities.filter((e) => e.type === 'PESSOA');
    expect(all).toHaveLength(1);
    expect(all[0]?.canonical).toBe('José Gerardo de Souza');
    expect(all[0]?.variants).toEqual(['JOSÉ GERARDO DE SOUZA']);
    expect(all[0]?.occurrences).toHaveLength(4);
  });
});

describe('termos ensinados na revisão', () => {
  it('bairro com nome de pessoa ensinado ("Antônio Bezerra") não é mais detectado, sem acento', () => {
    const text = 'QUE mora no ANTONIO BEZERRA, perto da Vila Esperança, com Ana Paula Rocha.';
    const people = (learnedTerms: string[]) =>
      detectPage(text, { learnedTerms })
        .filter((c) => c.type === 'PESSOA')
        .map((c) => c.text);
    expect(people([])).toContain('ANTONIO BEZERRA');
    expect(people(['Antônio Bezerra'])).toEqual(['Ana Paula Rocha']);
  });
});
