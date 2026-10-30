// IP FICTÍCIO 2, no formato dos documentos da Polícia Civil do Ceará (BO do sistema, termos com
// vários rótulos na mesma linha, relatório da PEFOCE, prontuário hospitalar). Todos os nomes,
// documentos e números são inventados. Exercita os problemas vistos em inquéritos reais: rótulos
// colados ao valor ("Nome:FULANO"), municípios, órgãos e termos médicos em CAIXA ALTA, filiação
// com dois nomes, lista de acusados, médico com CRM e o mesmo nome sem acento e quebrado em duas
// linhas em outra peça.
import { cpfWithCheckDigits, formatCpf } from './ip-ficticio-data.mjs';

/** Título de eleitor: 8 dígitos + UF (07 = CE) + 2 dígitos verificadores. */
export function tituloEleitor(seq8, uf = '07') {
  const d = seq8.split('').map(Number);
  let s = 0;
  for (let i = 0; i < 8; i++) s += d[i] * (i + 2);
  const dv1 = s % 11 === 10 ? 0 : s % 11;
  const u = uf.split('').map(Number);
  const s2 = u[0] * 7 + u[1] * 8 + dv1 * 9;
  const dv2 = s2 % 11 === 10 ? 0 : s2 % 11;
  return `${seq8}${uf}${dv1}${dv2}`;
}

/** Cartão Nacional de Saúde definitivo (começa com 1 ou 2). */
export function cns(pis11) {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(pis11[i]) * (15 - i);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) {
    sum += 2;
    dv = 11 - (sum % 11);
    return `${pis11}001${dv}`;
  }
  return `${pis11}000${dv}`;
}

const groups = (s, sizes) => {
  const out = [];
  let i = 0;
  for (const n of sizes) {
    out.push(s.slice(i, i + n));
    i += n;
  }
  return out.join(' ');
};

export const CE = {
  cpfVitima: formatCpf(cpfWithCheckDigits('417358296')),
  cpfTestemunha: formatCpf(cpfWithCheckDigits('602941735')),
  cpfAutor1: formatCpf(cpfWithCheckDigits('835102947')),
  titulo: groups(tituloEleitor('04512378'), [4, 4, 4]),
  cns: groups(cns('70412345678'.replace(/^7/, '1')), [3, 4, 4, 4]),
};

/** Entidades esperadas (mesmo formato do gabarito do IP fictício 1). */
export const CE_ENTITIES = [
  {
    id: 'vitima1',
    type: 'PESSOA',
    role: 'VÍTIMA',
    index: 1,
    canonical: 'Antônia Lúcia Ferreira dos Santos',
    variants: [
      'ANTÔNIA LÚCIA FERREIRA DOS SANTOS',
      'Antônia Lúcia Ferreira dos Santos',
      'ANTONIA LUCIA FERREIRA\nDOS SANTOS',
      'ANTONIA LUCIA FERREIRA DOS SANTOS',
      'Antônia Lúcia',
    ],
  },
  {
    id: 'testemunha1',
    type: 'PESSOA',
    role: 'TESTEMUNHA',
    index: 1,
    canonical: 'Raimundo Nonato Araújo Nunes',
    variants: ['RAIMUNDO NONATO ARAÚJO NUNES', 'Raimundo Nonato Araújo Nunes', 'Raimundo Nonato'],
  },
  {
    id: 'autor1',
    type: 'PESSOA',
    role: 'AUTOR',
    index: 1,
    canonical: 'José Wellington Mota Silva',
    variants: ['JOSÉ WELLINGTON MOTA SILVA', 'José Wellington Mota Silva', 'José Wellington'],
  },
  {
    id: 'autor2',
    type: 'PESSOA',
    role: 'AUTOR',
    index: 2,
    canonical: 'Ítalo Renan Costa Pereira',
    variants: ['ÍTALO RENAN COSTA PEREIRA', 'Ítalo Renan Costa Pereira'],
  },
  {
    id: 'autor3',
    type: 'PESSOA',
    role: 'AUTOR',
    index: 3,
    canonical: 'Damião Fernandes Rocha',
    variants: ['DAMIÃO FERNANDES ROCHA', 'Damião Fernandes Rocha'],
  },
  {
    id: 'mae_vitima',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 1,
    canonical: 'Maria José Ferreira',
    variants: ['MARIA JOSÉ FERREIRA'],
  },
  {
    id: 'pai_vitima',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 2,
    canonical: 'Francisco dos Santos',
    variants: ['FRANCISCO DOS SANTOS'],
  },
  {
    id: 'mae_testemunha',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 3,
    canonical: 'Francisca Araújo Nunes',
    variants: ['FRANCISCA ARAÚJO NUNES'],
  },
  {
    id: 'pai_testemunha',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 4,
    canonical: 'Francisco Araújo Nunes',
    variants: ['FRANCISCO ARAÚJO NUNES'],
  },
  {
    id: 'mae_autor1',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 5,
    canonical: 'Maria Ivone Mota',
    variants: ['MARIA IVONE MOTA'],
  },
  {
    id: 'pai_autor1',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 6,
    canonical: 'José Wilson Silva',
    variants: ['JOSÉ WILSON SILVA'],
  },
  {
    id: 'medico1',
    type: 'PESSOA',
    role: 'MÉDICO',
    index: 1,
    canonical: 'Henrique Moura Leite',
    variants: ['HENRIQUE MOURA LEITE', 'Henrique Moura Leite'],
  },
  {
    id: 'delegado',
    type: 'PESSOA',
    role: null,
    decision: 'keep',
    canonical: 'Felipe Augusto Machado Rios',
    variants: ['FELIPE AUGUSTO MACHADO RIOS'],
  },
  {
    id: 'escriva',
    type: 'PESSOA',
    role: null,
    decision: 'keep',
    canonical: 'Lívia Marques Cordeiro',
    variants: ['LÍVIA MARQUES CORDEIRO'],
  },
  {
    id: 'perito',
    type: 'PESSOA',
    role: 'PERITO',
    decision: 'keep',
    canonical: 'Armando Teixeira Bastos',
    variants: ['ARMANDO TEIXEIRA BASTOS'],
  },
  {
    id: 'apelido_autor1',
    type: 'APELIDO',
    role: 'AUTOR',
    index: 1,
    canonical: 'Zé Galo',
    variants: ['ZÉ GALO', 'Zé Galo'],
  },
  // ---- Documentos e identificadores ----
  { id: 'cpf_vitima', type: 'CPF', canonical: CE.cpfVitima, variants: [CE.cpfVitima] },
  {
    id: 'cpf_testemunha',
    type: 'CPF',
    canonical: CE.cpfTestemunha,
    variants: [CE.cpfTestemunha],
  },
  { id: 'cpf_autor1', type: 'CPF', canonical: CE.cpfAutor1, variants: [CE.cpfAutor1] },
  { id: 'rg_vitima', type: 'RG', canonical: '2009123456-7', variants: ['2009123456-7'] },
  { id: 'rg_autor1', type: 'RG', canonical: '98002345671', variants: ['98002345671'] },
  {
    id: 'tel_vitima',
    type: 'TELEFONE',
    canonical: '(88) 99876-5432',
    variants: ['(88) 99876-5432'],
  },
  {
    id: 'tel_testemunha',
    type: 'TELEFONE',
    canonical: '(88) 98111-2040',
    variants: ['(88) 98111-2040'],
  },
  {
    id: 'dn_vitima',
    type: 'DATA_NASCIMENTO',
    outOfScope: true,
    canonical: '14/05/1988',
    variants: ['14/05/1988'],
  },
  {
    id: 'dn_testemunha',
    type: 'DATA_NASCIMENTO',
    outOfScope: true,
    canonical: '02/02/1975',
    variants: ['02/02/1975'],
  },
  {
    id: 'dn_autor1',
    type: 'DATA_NASCIMENTO',
    outOfScope: true,
    canonical: '21/11/1999',
    variants: ['21/11/1999'],
  },
  { id: 'titulo_autor1', type: 'TITULO_ELEITOR', canonical: CE.titulo, variants: [CE.titulo] },
  { id: 'cns_vitima', type: 'CNS', canonical: CE.cns, variants: [CE.cns] },
  {
    id: 'prontuario_vitima',
    type: 'PRONTUARIO',
    canonical: '2026/004512',
    variants: ['2026/004512'],
  },
];

/**
 * Páginas: listas de linhas. `E(id, texto)` marca a ocorrência de uma entidade (para o gabarito).
 * As linhas são curtas para não quebrarem no PDF.
 */
export function ceDocuments(E) {
  const cpf = (id) => E(id);
  return [
    {
      title: 'BOLETIM DE OCORRÊNCIA',
      folha: 2,
      lines: [
        'GOVERNO DO ESTADO DO CEARÁ',
        'SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL',
        'POLÍCIA CIVIL DO ESTADO DO CEARÁ',
        'BOLETIM DE OCORRÊNCIA Nº 512-347/2026',
        'Data/Hora do Registro: 03/09/2026 22:15 Unidade: DELEGACIA MUNICIPAL DE SANTANA DO ACARAÚ',
        'Natureza do Fato: HOMICÍDIO TENTADO',
        'Data/Hora do Fato: 03/09/2026 20:40',
        'Município: SANTANA DO ACARAÚ/CE Bairro: CENTRO',
        'Local do Fato: RUA CORONEL ANTÔNIO FIRMO, 210 - CENTRO',
        'DADOS DA(S) VÍTIMA(S)',
        `Nome:${E('vitima1', 'ANTÔNIA LÚCIA FERREIRA DOS SANTOS')} Data de Nascimento: ${E('dn_vitima')} CPF:${cpf('cpf_vitima')}`,
        'Sexo: FEMININO Cor/Raça: PARDA Estado Civil: SOLTEIRA Escolaridade: ALFABETIZADA',
        'Nacionalidade: BRASILEIRA Naturalidade: SOBRAL/CE Profissão: AUTÔNOMA',
        `Filiação: ${E('mae_vitima')} / ${E('pai_vitima')}`,
        `RG: ${E('rg_vitima')} SSP/CE Telefone: ${E('tel_vitima')}`,
        'Endereço: SÍTIO LAGOA SECA, S/N, ZONA RURAL, SANTANA DO ACARAÚ/CE',
        'DADOS DO(S) NOTICIANTE(S)',
        `Nome:${E('testemunha1', 'RAIMUNDO NONATO ARAÚJO NUNES')} Data de Nascimento: ${E('dn_testemunha')} CPF:${cpf('cpf_testemunha')}`,
        `Telefone: ${E('tel_testemunha')} Relação com a vítima: VIZINHO`,
        `ACUSADOS: ${E('autor1', 'JOSÉ WELLINGTON MOTA SILVA')}, ${E('autor2', 'ÍTALO RENAN COSTA PEREIRA')} E ${E('autor3', 'DAMIÃO FERNANDES ROCHA')}`,
        'RELATO:',
        `Noticia o comunicante que a vítima ${E('vitima1', 'ANTÔNIA LÚCIA FERREIRA DOS SANTOS')}`,
        'foi agredida a pauladas em via pública e socorrida à SANTA CASA DE SOBRAL,',
        'onde foi constatada fratura de rádio e ulna e TCE leve.',
        `Atendente: ${E('escriva', 'LÍVIA MARQUES CORDEIRO')} - Escrivã de Polícia Civil`,
      ],
    },
    {
      title: 'TERMO DE DEPOIMENTO',
      folha: 3,
      lines: [
        'POLÍCIA CIVIL DO ESTADO DO CEARÁ',
        'DELEGACIA MUNICIPAL DE SANTANA DO ACARAÚ',
        'TERMO DE DEPOIMENTO DA TESTEMUNHA',
        `Nome: ${E('testemunha1', 'RAIMUNDO NONATO ARAÚJO NUNES')}, brasileiro, casado, agricultor,`,
        `filho(a) de ${E('mae_testemunha')} e ${E('pai_testemunha')},`,
        'natural de MASSAPÊ/CE, residente no SÍTIO LAGOA SECA, zona rural deste município.',
        'Aos costumes disse nada. Compromissado na forma da lei, respondeu que é vizinho',
        `da vítima ${E('vitima1', 'Antônia Lúcia Ferreira dos Santos')}; que no dia dos fatos viu`,
        `os acusados ${E('autor1', 'José Wellington Mota Silva')}, vulgo "${E('apelido_autor1', 'ZÉ GALO')}",`,
        `${E('autor2', 'Ítalo Renan Costa Pereira')} e ${E('autor3', 'Damião Fernandes Rocha')} correndo pela RUA CORONEL ANTÔNIO FIRMO;`,
        `que ${E('vitima1', 'Antônia Lúcia')} foi levada ao Hospital Regional Norte. Nada mais.`,
        `Delegado de Polícia Civil: ${E('delegado')}`,
        `Escrivã: ${E('escriva', 'LÍVIA MARQUES CORDEIRO')}`,
      ],
    },
    {
      title: 'RELATÓRIO DE LOCAL DE CRIME',
      folha: 4,
      lines: [
        'PERÍCIA FORENSE DO ESTADO DO CEARÁ - PEFOCE',
        'NÚCLEO REGIONAL DE PERÍCIAS DE SOBRAL',
        'RELATÓRIO DE LOCAL DE CRIME',
        'Município: SANTANA DO ACARAÚ/CE',
        'Local: RUA CORONEL ANTÔNIO FIRMO, 210, CENTRO',
        'Requisitante: DELEGACIA MUNICIPAL DE SANTANA DO ACARAÚ',
        `A vítima ${E('vitima1', 'ANTONIA LUCIA FERREIRA\nDOS SANTOS')} já havia sido removida`,
        'para a SANTA CASA DE SOBRAL quando da chegada da equipe ao local.',
        'Foram recolhidos um pedaço de madeira e manchas de sangue na calçada.',
        `Perito Criminal: ${E('perito')}`,
      ],
    },
    {
      title: 'BOLETIM DE ATENDIMENTO HOSPITALAR',
      folha: 5,
      lines: [
        'SANTA CASA DE MISERICÓRDIA DE SOBRAL',
        'BOLETIM DE ATENDIMENTO DE URGÊNCIA',
        `Paciente: ${E('vitima1', 'ANTONIA LUCIA FERREIRA DOS SANTOS')}`,
        `Prontuário: ${E('prontuario_vitima')} CNS: ${E('cns_vitima')}`,
        'Diagnóstico: FRATURA DE RÁDIO E ULNA À ESQUERDA; TCE LEVE; POLITRAUMA',
        'Conduta: imobilização, analgesia e observação na UTI por 24 horas.',
        `Médico: Dr. ${E('medico1', 'HENRIQUE MOURA LEITE')} - CRM 12345`,
      ],
    },
    {
      title: 'AUTO DE QUALIFICAÇÃO E INTERROGATÓRIO',
      folha: 6,
      lines: [
        'POLÍCIA CIVIL DO ESTADO DO CEARÁ',
        'AUTO DE QUALIFICAÇÃO E INTERROGATÓRIO',
        `Nome:${E('autor1', 'JOSÉ WELLINGTON MOTA SILVA')} Alcunha: ${E('apelido_autor1', 'ZÉ GALO')}`,
        `Data de Nascimento: ${E('dn_autor1')} CPF: ${cpf('cpf_autor1')} RG: ${E('rg_autor1')}`,
        `Título de Eleitor: ${E('titulo_autor1')}`,
        `FILHO DE ${E('mae_autor1')} E ${E('pai_autor1')}`,
        'Naturalidade: FORQUILHA/CE Estado Civil: SOLTEIRO Profissão: SERVENTE',
        'Interrogado, negou a autoria e disse que estava em casa no momento do fato.',
        `Delegado de Polícia Civil: ${E('delegado')}`,
      ],
    },
    {
      title: 'RELATÓRIO FINAL',
      folha: 7,
      lines: [
        'DELEGACIA MUNICIPAL DE SANTANA DO ACARAÚ',
        'RELATÓRIO',
        'Trata-se de inquérito instaurado para apurar a tentativa de homicídio contra',
        `${E('vitima1', 'Antônia Lúcia Ferreira dos Santos')}, ocorrida em 03/09/2026 em Santana do Acaraú.`,
        `A testemunha ${E('testemunha1', 'Raimundo Nonato')} reconheceu os acusados.`,
        `O laudo do Dr. ${E('medico1', 'Henrique Moura Leite')} confirma a fratura de rádio e ulna.`,
        `Indicio ${E('autor1', 'José Wellington')} pelo crime do art. 121, c/c art. 14, II, do CP.`,
        `Santana do Acaraú/CE, 20 de outubro de 2026.`,
        E('delegado'),
        'Delegado de Polícia Civil',
      ],
    },
  ];
}
