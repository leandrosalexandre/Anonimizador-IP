// APF FICTÍCIO no formato dos procedimentos gerados pelo sistema eletrônico da Polícia Civil
// (texto digital, sem OCR): índice com nomes truncados ("…"), quadro INFRATOR/CONDUTOR/
// TESTEMUNHAS, qualificação "NOME , CPF …, mãe …, pai …", assinatura eletrônica com o papel entre
// parênteses, rodapé "N de M", nomes cortados por hífen no fim da linha, prenomes soltos em
// CAIXA ALTA e nome que continua na página seguinte. Todos os nomes e números são inventados.

const HASH = 'ab12cd34-ef56-4a7b-8c9d-0123456789ab - 3c3C3C3G2X2P2O2P2h - 3c3C3C3G2X2N2Q2O2b2O2M2R';
const UNIT =
  '10ª DELEGACIA DE POLÍCIA CIVIL DE HOMICÍDIOS E PROTEÇÃO À PESSOA - RUA DAS FLORES FICTÍCIAS, 100 - CENTRO - 60000000 - FORTALEZA';
const CONTACT = 'E-MAIL: delegacia10@exemplo.gov.br / TELEFONE: (85) 3101-0000';
const DHPP = [
  'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA – 10ª DHPP',
  'Rua das Flores Fictícias, n. 100, Centro, Fortaleza/CE, CEP',
  'CEP: 60.000-000 FONE: (85) 3101-0000',
];

const signed = (who: string, part: string, n: number) =>
  [
    '',
    'ASSINATURA ELETRÔNICA',
    `Documento assinado eletronicamente por RODRIGO VASCONCELOS PRADO (DELEGADO), em 27/10/2026 22:31:46 - USUÁRIO LOGADO ; ${who}. Verifique a autenticidade em`,
    'http://delegaciaeletronica.exemplo.gov.br/verificador/ab12cd34-ef56-4a7b-8c9d-0123456789ab',
    '',
    `${part} ${UNIT}`,
    `${CONTACT} ${n} de 60`,
  ].join('\n');

const image = (lines: string[], n: number) => [...lines, '', ...DHPP, '', `${n} de 60`].join('\n');

export const APF_PAGES: string[] = [
  // PDF p. 1 — capa
  'APF-PC057-1/2026\n\nPOLÍCIA CIVIL DO ESTADO DO CEARÁ\n\n1)\nCOMUNICAÇÃO DE MORTE\n2) Art. 121 Caput do CPB\nHOMICÍDIO SIMPLES',
  // PDF p. 2 — índice (nomes truncados)
  [
    'ÍNDICE DO PROCEDIMENTO',
    '1. AUTO DE PRISÃO EM FLAGRANTE - 1',
    '2. TERMO DE DEPOIMENTO - BRUNO HENRIQUE TAVARES DE LIMA 2',
    '3. IMAGENS E DESCRIÇÕES RELACIONADAS AOS FATOS 4',
    '4. APREENSÃO 13',
    '5. TERMO DE DEPOIMENTO - CARLA REGINA MOTA PINHEIRO 16',
    '6. TERMO DE DEPOIMENTO - SÉRGIO AUGUSTO FARIAS 17',
    '7. NOTA DE CIÊNCIA DAS GARANTIAS CONSTITUCIONAIS - DANILO EUF... 18',
    '8. TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO - DANILO EUFRÁSIO D... 19',
    '9. NOTA DE CULPA - DANILO EUFRÁSIO DOS REIS 20',
    '10. COMUNICAÇÃO DE PRISÃO - DANILO EUFRÁSIO DOS REIS 21',
    '14. NOTA DE CIÊNCIA DAS GARANTIAS CONSTITUCIONAIS - ALISSO... 25',
    '15. TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO - ALISSON KAUÃ BEZ... 26',
    '16. NOTA DE CULPA - ALISSON KAUÃ BEZERRA NUNES 27',
    '23. BOLETIM DE OCORRENCIA - NOTICIANTE - JOSIMAR FRANCISCO AL... 41',
    '34. INTIMACAO HELENA CRISTINA DUARTE 58',
    '36. LOG DE MOVIMENTAÇÃO 60',
  ].join('\n'),
  // PDF p. 3 — auto de prisão em flagrante
  [
    HASH,
    '',
    'AUTO DE PRISÃO EM FLAGRANTE DELITO',
    'APF-PC057-1/2026',
    'Fortaleza/CE, 28 de Outubro de 2026',
    'INFRATOR: ALISSON KAUÃ BEZERRA NUNES',
    'Art. 121 Caput do CPB, HOMICÍDIO SIMPLES',
    'CONDUTOR: BRUNO HENRIQUE TAVARES DE LIMA',
    'TESTEMUNHAS: CARLA REGINA MOTA PINHEIRO, SÉRGIO AUGUSTO FARIAS',
    'VÍTIMAS: (SEM NOME)',
    'INFRATOR: DANILO EUFRÁSIO DOS REIS',
    'Art. 121 Caput do CPB, HOMICÍDIO SIMPLES',
    'CONDUTOR: BRUNO HENRIQUE TAVARES DE LIMA',
    'TESTEMUNHAS: CARLA REGINA MOTA PINHEIRO, SÉRGIO AUGUSTO FARIAS',
    'VÍTIMAS: (SEM NOME)',
    '',
    'Aos 28 Dias do Mês de Outubro do Ano de 2026, nesta cidade de Fortaleza/CE, foi ap-',
    'resentada à Autoridade Policial a(s) pessoa(s) identificada(s) no quadro inicial.',
    'Entrevistadas as partes e formado seu convencimento jurídico, deliberou a Autori-',
    'dade Policial por ratificar a voz de prisão dada pelo condutor.',
    signed(
      'DANILO EUFRÁSIO DOS REIS (INTERROGADO), em 27/10/2026 22:36:11 - BIOMETRIA DIGITAL ; ALISSON KAUÃ BEZERRA NUNES (INTERROGADO), em 27/10/2026\n22:36:33 - BIOMETRIA DIGITAL',
      '1/1',
      1,
    ),
  ].join('\n'),
  // PDF p. 4 — depoimento do condutor (nome do título cortado por hífen; mãe continua na p. 5)
  [
    HASH,
    '',
    'TERMO DE DEPOIMENTO DO CONDUTOR BRU-',
    'NO HENRIQUE TAVARES DE LIMA',
    'APF-PC057-1/2026',
    'Fortaleza/CE - 27 de outubro de 2026',
    '',
    'BRUNO HENRIQUE TAVARES DE LIMA , CPF 529.982.247-25, mãe IRACI TAVARES DE LIMA, pai OSVALDO PEREIRA DE LIMA, nascido no(a) Brasil, nat-',
    'ural de Fortaleza/CE, nascido(a) em 29 de outubro de 1988, estado civil solteiro(a),',
    'escolaridade Ensino Superior, profissão Servidor Público, Telefone: (85) 98888-1234',
    '',
    'Testemunha sem impedimento legal, compromissada na forma da lei.',
    'Disse: que é Oficial Investigador de Polícia chefe de investigação da 10ª Delegacia do',
    'DHPP; QUE a equipe foi acionada para um achado de cadáver no bairro Praia do Futuro;',
    'QUE um jovem havia comparecido ao quiosque para entre-',
    'gar um nome (DANILO) e um número (85 99999-0001) com quem o responsável pelo',
    'quiosque deveria entrar em contato; QUE o número correspondia à chave pix',
    'de DANILO EUFRÁSIO DOS REIS, nascido em 16/02/2008, filho de MARLENE EUFRÁSIO',
    signed(
      'BRUNO HENRIQUE TAVARES DE LIMA (DEPOENTE), em 27/10/2026 22:17:59 - BIOMETRIA DIGITAL',
      '1/2',
      2,
    ),
  ].join('\n'),
  // PDF p. 5 — continuação
  [
    HASH,
    '',
    'dos Reis; QUE foi realizada a comparação facial entre DANILO e o homem de preto,',
    'confirmando tratar-se de DANILO EUFRÁSIO DOS REIS; QUE no referido local, foi encontrado',
    'DANILO EUFRÁSIO DOS REIS, bem como ALISSON KAUÃ BEZERRA NUNES, este com as mes-',
    'mas características do indivíduo de branco; QUE ALISSON, de pronto, foi reconhecido;',
    'QUE a camisa utilizada por ALISSON KAUÃ BEZERRA NUNES foi encontrada no banheiro; QUE ALIS-',
    'SON confirmou ser sua aquela camisa; QUE DANILO narrou que as roupas deviam estar na casa',
    'de sua genitora; QUE uma das tendas rasgadas pertencia à genitora de DANILO EUFRÁSIO DOS REIS',
    '(MARLENE EUFRÁSIO DOS REIS), de modo que a dupla (DANILO e ALISSON) desferiu os',
    'golpes na vítima.',
    'Nada mais disse nem lhe foi perguntado.',
    signed(
      'BRUNO HENRIQUE TAVARES DE LIMA (DEPOENTE), em 27/10/2026 22:17:59 - BIOMETRIA DIGITAL',
      '2/2',
      3,
    ),
  ].join('\n'),
  // PDF p. 6–10 — páginas de imagens com legendas
  image(
    ['IMAGENS E DESCRIÇÕES RELACIONADAS AOS FATOS', '', 'HOMEM DE PRETO INICIA AS AGRESSÕES À VÍTIMA ÀS 17:07:14'],
    4,
  ),
  image(
    [
      'UMA CRIANÇA / ADOLESCENTE SE FEZ PRESENTE COM UM RECADO PARA QUE ENTRASSEM',
      'EM CONTATO COM UMA PESSOA DE NOME DANILO NÚMERO 85 99999-0001',
    ],
    7,
  ),
  image(
    ['IDENTIFICAÇÃO DA CHAVE PIX VINCULADA AO TERMINAL 85 99999-0001', '', 'QUALIFICAÇÃO DE DANILO EUFRÁSIO DOS REIS'],
    8,
  ),
  image(
    [
      'COMPROVAÇÃO, VIA SISTEMA CEOS, DE QUE O INDIVÍDUO QUE DESFERE OS GOLPES QUE',
      'LEVAM A VÍTIMA A ÓBITO SE TRATA DE DANILO EUFRÁSIO DOS REIS, NASCIDO EM 16/02/2008,',
      'FILHO DE MARLENE EUFRÁSIO DOS REIS',
    ],
    9,
  ),
  image(['ALISSON KAUÃ BEZERRA NUNES', '', 'APREENDIDA A CAMISA QUE TRAJAVA POR OCASIÃO DO CRIME'], 11),
  image(['TATUAGENS DE ALISSON KAUÃ'], 12),
  // PDF p. 12 — depoimento de testemunha policial
  [
    HASH,
    '',
    'TERMO DE DEPOIMENTO DE CARLA REGINA MOTA PINHEIRO',
    'APF-PC057-1/2026',
    '',
    'CARLA REGINA MOTA PINHEIRO , CPF 111.444.777-35, mãe JOANA MOTA PINHEIRO, pai ABEL PINHEIRO, nascido no(a) Brasil.',
    'Disse: que é Inspetora de Polícia Civil lotada na 10ª Delegacia do DHPP; QUE participou da',
    'diligência que resultou na prisão de DANILO e de ALISSON KAUÃ.',
    signed(
      'CARLA REGINA MOTA PINHEIRO (DEPOENTE), em 27/10/2026 22:40:00 - BIOMETRIA DIGITAL',
      '1/1',
      16,
    ),
  ].join('\n'),
];

/** Nomes reais (fictícios) que NÃO podem aparecer no texto exportado. */
export const APF_INVOLVED = [
  'DANILO',
  'EUFRÁSIO',
  'ALISSON',
  'ALISSO',
  'KAUÃ',
  'BEZERRA NUNES',
  'MARLENE',
  'IRACI',
  'OSVALDO',
  'JOSIMAR',
  'HELENA CRISTINA',
  'SÉRGIO AUGUSTO',
  'JOANA MOTA',
  'ABEL PINHEIRO',
  'dos Reis',
];

/** Autoridades e policiais: ficam com o nome real. */
export const APF_KEPT = ['BRUNO HENRIQUE TAVARES DE LIMA', 'CARLA REGINA MOTA PINHEIRO'];
