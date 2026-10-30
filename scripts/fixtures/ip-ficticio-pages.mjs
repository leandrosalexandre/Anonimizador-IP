// Páginas do IP fictício. Cada ocorrência de dado pessoal passa por E(id, texto), que registra a
// ocorrência para o gabarito e confere se o texto é uma variante conhecida da entidade.
import { CPF, ENTITIES, PROCESSO } from './ip-ficticio-data.mjs';

export const NB_START = '\uE000';
export const NB_END = '\uE001';

const byId = new Map(ENTITIES.map((e) => [e.id, e]));

export function buildPages() {
  const pages = [];
  let current = null;

  const E = (id, text) => {
    const entity = byId.get(id);
    if (!entity) throw new Error(`Entidade desconhecida: ${id}`);
    const value = text ?? entity.canonical;
    if (!entity.variants.includes(value)) throw new Error(`Variante não listada (${id}): ${value}`);
    current.occurrences.push({ entityId: id, text: value });
    // Marcadores (uso privado do Unicode) para o HTML não quebrar a linha dentro do dado.
    return `${NB_START}${value}${NB_END}`;
  };

  /** blocks: [{ h }, { p }, { kv: [rótulo, valor] }, { sign: [linhas] }] */
  const page = (meta, build) => {
    current = { ...meta, occurrences: [] };
    current.blocks = build(E);
    pages.push(current);
  };

  const IP = () => E('ip', '900-123/2026');

  page({ title: 'PORTARIA', folha: 3, stamp: 'Fls. 3' }, (E) => [
    { h: 'PORTARIA' },
    {
      p: `O Delegado de Polícia Civil que esta subscreve, no uso de suas atribuições legais, tendo em vista o Boletim de Ocorrência nº ${E('bo')}, que noticia a prática do crime de roubo majorado (art. 157, § 2º, II, e § 2º-A, I, do Código Penal), ocorrido em 12/10/2026, por volta das 19h30min, na ${E('end_vitima', 'Rua das Acácias Fictícias')}, tendo como vítima ${E('vitima1', 'MARIA DA CONCEIÇÃO SILVA SOUZA')}, RESOLVE instaurar o presente Inquérito Policial nº ${IP()}.`,
    },
    { p: 'Determino, desde logo, as seguintes diligências:' },
    { p: '1. Autue-se e registre-se esta Portaria.' },
    { p: '2. Ouça-se a vítima e as testemunhas presenciais do fato.' },
    { p: '3. Requisite-se exame pericial no veículo recuperado junto à PEFOCE.' },
    { p: '4. Proceda-se à identificação e qualificação do autor do fato.' },
    { p: 'Cumpra-se.' },
    { p: 'Fortaleza/CE, 13 de outubro de 2026.' },
    {
      sign: [
        E('delegado', 'PAULO ROBERTO CAVALCANTE MENDES'),
        'Delegado de Polícia Civil',
        'Matrícula 300.123-1-X',
      ],
    },
  ]);

  page({ title: 'BOLETIM DE OCORRÊNCIA', folha: 4, stamp: 'Fls. 4' }, (E) => [
    { h: `BOLETIM DE OCORRÊNCIA Nº ${E('bo')}` },
    { kv: ['Natureza', 'Roubo a transeunte com uso de arma de fogo'] },
    { kv: ['Data do fato', '12/10/2026, 19h30min'] },
    {
      kv: [
        'Local',
        E(
          'end_vitima',
          'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
        ),
      ],
    },
    { h: 'COMUNICANTE / VÍTIMA' },
    { kv: ['Nome', E('vitima1', 'MARIA DA CONCEIÇÃO SILVA SOUZA')] },
    { kv: ['CPF', E('cpf_vitima', CPF.vitima)] },
    { kv: ['RG', `${E('rg_vitima')} SSP/CE`] },
    { kv: ['Data de nascimento', E('dn_vitima')] },
    { kv: ['Telefone', E('tel_vitima', '(85) 98812-3456')] },
    { kv: ['E-mail', E('email_vitima')] },
    { kv: ['CEP', E('cep_vitima')] },
    { h: 'RELATO' },
    {
      p: `A comunicante relata que estacionava seu automóvel VW Gol, cor prata, placa ${E('placa_vitima', 'HXP-4821')}, em frente à sua residência, quando foi abordada por dois homens em uma motocicleta vermelha. O garupa, armado com um revólver, exigiu a entrega do telefone celular e da bolsa. Os autores fugiram em direção à Avenida Central. A vítima reconheceu o garupa como sendo pessoa conhecida no bairro pelo apelido de ${E('apelido_autor1', 'CHICO BALA')}.`,
    },
    { kv: ['Atendente', E('inspetor', 'Marcos Vinícius Araújo')] },
  ]);

  page({ title: 'TERMO DE DECLARAÇÕES (1/2)', folha: 5, stamp: 'Fls. 5' }, (E) => [
    { h: 'TERMO DE DECLARAÇÕES DA VÍTIMA' },
    {
      p: `Aos treze dias do mês de outubro de 2026, nesta Delegacia, perante a Autoridade Policial, compareceu a vítima abaixo qualificada, que, inquirida, declarou o seguinte.`,
    },
    { kv: ['NOME', E('vitima1', 'MARIA DA CONCEIÇÃO SILVA SOUZA')] },
    {
      kv: [
        'FILIAÇÃO',
        `${E('familiar3', 'ANTÔNIO SOUZA')} e ${E('familiar2', 'FRANCISCA DA CONCEIÇÃO SILVA')}`,
      ],
    },
    { kv: ['Natural de', 'Fortaleza/CE, nascida em ' + E('dn_vitima')] },
    { kv: ['Estado civil', 'casada'] },
    { kv: ['Profissão', 'professora'] },
    { kv: ['CPF', E('cpf_vitima', CPF.vitimaSemPontos)] },
    {
      kv: [
        'Endereço',
        E(
          'end_vitima',
          'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
        ),
      ],
    },
    { kv: ['Telefone', E('tel_vitima', '85 98812-3456')] },
    {
      p: `QUE no dia 12/10/2026, por volta das 19h30min, chegava em casa dirigindo seu veículo placa ${E('placa_vitima', 'HXP4821')}; QUE, ao descer do carro, foi abordada por dois indivíduos em uma motocicleta; QUE o garupa apontou um revólver em sua direção e disse "passa tudo, senão morre"; QUE entregou seu aparelho celular e sua bolsa, contendo documentos e cartões bancários; QUE reconheceu o garupa como sendo ${E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')}, vulgo "${E('apelido_autor1', 'Chico Bala')}", morador da ${E('end_autor', 'Travessa Boa Esperança')};`,
    },
  ]);

  page({ title: 'TERMO DE DECLARAÇÕES (2/2)', folha: 6, stamp: '6' }, (E) => [
    {
      p: `QUE conhece ${E('autor1', 'Francisco Antônio')} desde criança, pois estudaram na mesma escola; QUE não conseguiu ver o rosto do piloto da motocicleta, que usava capacete; QUE, cerca de uma hora após o fato, recebeu notificação do banco de uma transferência via Pix no valor de R$ 2.300,00, feita a partir do aplicativo instalado em seu celular, para a chave aleatória ${E('pix_autor')}; QUE o vizinho ${E('testemunha1', 'João Batista')} presenciou a ação; QUE a motorista de aplicativo ${E('testemunha2', 'Ana Cláudia')} passava pelo local no momento do fato; QUE deseja representar criminalmente contra os autores.`,
    },
    {
      p: `Nada mais disse nem lhe foi perguntado. Lido e achado conforme, vai devidamente assinado pela declarante ${E('vitima1', 'MARIA')}, pela Autoridade Policial e por mim, Escrivã, que o digitei.`,
    },
    {
      sign: [
        E('delegado', 'PAULO ROBERTO CAVALCANTE MENDES'),
        'Delegado de Polícia Civil',
        '',
        E('vitima1', 'Maria da Conceição Silva Souza'),
        'Declarante',
        '',
        E('escriva', 'LUCIANA MARIA TEIXEIRA BARROS'),
        'Escrivã de Polícia Civil',
      ],
    },
  ]);

  page({ title: 'TERMO DE DEPOIMENTO – TESTEMUNHA 1', folha: 7, stamp: 'Fl. 7' }, (E) => [
    { h: 'TERMO DE DEPOIMENTO' },
    { kv: ['Testemunha', E('testemunha1', 'JOÃO BATISTA FERREIRA NETO')] },
    { kv: ['RG', `${E('rg_test1')} SSP/CE`] },
    { kv: ['CPF', E('cpf_test1')] },
    { kv: ['Endereço', E('end_test1')] },
    { kv: ['Telefone', E('tel_test1')] },
    {
      p: `Compromissado na forma da lei, QUE é vizinho da vítima ${E('vitima1', 'Maria Souza')} há mais de dez anos; QUE no dia dos fatos estava na calçada de sua casa quando viu uma motocicleta vermelha parar ao lado do carro da vítima; QUE o garupa desceu armado e tomou os pertences de ${E('vitima1', 'Maria da Conceição')}; QUE reconheceu o garupa como sendo o nacional conhecido como "${E('apelido_autor1', 'Chico Bala')}", que costuma frequentar a praça do bairro; QUE anotou parte da placa da motocicleta, iniciada pelas letras PNB; QUE não conhece o piloto.`,
    },
    { p: 'Nada mais disse nem lhe foi perguntado.' },
    { sign: [E('testemunha1', 'João Batista Ferreira Neto'), 'Testemunha'] },
  ]);

  page({ title: 'TERMO DE DEPOIMENTO – TESTEMUNHA 2', folha: 8, stamp: 'Fls. 8' }, (E) => [
    { h: 'TERMO DE DEPOIMENTO' },
    { kv: ['Testemunha', E('testemunha2', 'ANA CLÁUDIA RODRIGUES MATOS')] },
    { kv: ['CPF', E('cpf_test2')] },
    { kv: ['Nascida em', E('dn_test2')] },
    { kv: ['Telefone', E('tel_test2')] },
    {
      p: `Compromissada na forma da lei, QUE trabalha como motorista de aplicativo; QUE no dia 12/10/2026 passava pela ${E('end_vitima', 'Rua das Acácias Fictícias')} quando viu uma mulher ser assaltada por dois homens em uma motocicleta vermelha; QUE a motocicleta tinha placa no padrão Mercosul e conseguiu ver os caracteres ${E('placa_moto')}; QUE os autores fugiram em alta velocidade; QUE parou o carro para prestar socorro à vítima e chamou a polícia; QUE não conhecia nenhum dos envolvidos.`,
    },
    { p: 'Nada mais disse nem lhe foi perguntado.' },
    { sign: [E('testemunha2', 'Ana Cláudia Rodrigues Matos'), 'Testemunha'] },
  ]);

  page({ title: 'AUTO DE APREENSÃO', folha: 9, stamp: 'Fls. 9' }, (E) => [
    { h: 'AUTO DE APRESENTAÇÃO E APREENSÃO' },
    {
      p: `Aos quinze dias do mês de outubro de 2026, nesta Delegacia, presente a Autoridade Policial, foram apresentados pelo Inspetor ${E('inspetor', 'MARCOS VINÍCIUS ARAÚJO')} os seguintes objetos, encontrados no estabelecimento ${E('empresa1', 'Auto Peças Nogueira Ltda.')}, situado na ${E('end_invest', 'Avenida dos Ipês Inventados, nº 2020, Bairro Parque Ilusão, Fortaleza/CE')}, de propriedade de ${E('investigado1', 'CARLOS EDUARDO NOGUEIRA BEZERRA')}, CPF ${E('cpf_invest')}:`,
    },
    {
      p: `a) uma motocicleta Honda CG 160, cor vermelha, placa ${E('placa_moto')}, chassi ${E('chassi_moto')}, Renavam ${E('renavam_moto')};`,
    },
    {
      p: 'b) um revólver calibre .38, marca Taurus, com numeração suprimida, municiado com seis cartuchos intactos;',
    },
    { p: 'c) um aparelho celular marca Samsung, cor preta, com a tela trincada.' },
    {
      p: `O proprietário do estabelecimento, ${E('investigado1', 'Carlos Eduardo')}, afirmou ter comprado a motocicleta de ${E('autor1', 'FRANCISCO')} por R$ 3.000,00, sem documentação.`,
    },
    {
      sign: [
        E('delegado', 'Paulo Roberto Cavalcante Mendes'),
        'Delegado de Polícia Civil',
        '',
        E('inspetor', 'Marcos Vinícius Araújo'),
        'Inspetor de Polícia Civil',
      ],
    },
  ]);

  page(
    { title: 'TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO (1/2)', folha: 10, stamp: 'Fls. 10' },
    (E) => [
      { h: 'TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO' },
      { kv: ['Investigado', E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')] },
      { kv: ['Alcunha', E('apelido_autor1', 'CHICO BALA')] },
      { kv: ['Mãe', E('informante1', 'RAIMUNDA PEREIRA LIMA')] },
      { kv: ['Pai', E('familiar1', 'JOSÉ LIMA SOBRINHO')] },
      { kv: ['DN', `${E('dn_autor')} (28 anos)`] },
      { kv: ['CPF', E('cpf_autor')] },
      { kv: ['RG', `${E('rg_autor')} SSP/CE`] },
      { kv: ['CNH nº', E('cnh_autor')] },
      {
        kv: [
          'Endereço',
          `${E('end_autor', 'Travessa Boa Esperança, nº 77, Bairro Vila Inventada, Fortaleza/CE')}, CEP ${E('cep_autor')}`,
        ],
      },
      { kv: ['Telefone', E('tel_autor', '(85) 99765-4321')] },
      { kv: ['Advogado', `${E('advogado1', 'RICARDO HENRIQUE MOREIRA ALVES')}, OAB/CE 12.345`] },
      {
        p: 'Cientificado de seus direitos constitucionais, inclusive o de permanecer calado, e assistido por seu advogado, o interrogado declarou:',
      },
      {
        p: `QUE é verdadeira em parte a imputação; QUE estava na garupa da motocicleta, mas não sabia que o colega iria assaltar; QUE não sabe o nome completo do piloto, conhecido apenas como "${E('apelido_piloto')}"; QUE vendeu a motocicleta para ${E('investigado1', 'Carlos Eduardo')} porque precisava de dinheiro;`,
      },
    ],
  );

  page(
    { title: 'TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO (2/2)', folha: 11, stamp: 'Fls. 11' },
    (E) => [
      {
        p: `QUE a conta bancária de ${E('autor1', 'Francisco Antônio')}, ${E('conta_autor')}, no Banco Fictício S.A., recebeu valores de terceiros, mas nega ter feito a transferência via Pix do celular da vítima; QUE seu telefone é ${E('tel_autor', '(85)99765-4321')}; QUE já foi preso anteriormente por furto; QUE não possui arma de fogo; QUE deseja falar somente em juízo sobre os demais fatos.`,
      },
      { p: 'Nada mais disse nem lhe foi perguntado.' },
      {
        sign: [
          E('autor1', 'Francisco Antônio Pereira Lima'),
          'Interrogado',
          '',
          E('advogado1', 'Ricardo Henrique Moreira Alves'),
          'Advogado – OAB/CE 12.345',
          '',
          E('escriva', 'Luciana Maria Teixeira Barros'),
          'Escrivã de Polícia Civil',
        ],
      },
    ],
  );

  page({ title: 'LAUDO PERICIAL', folha: 12, stamp: 'Fls. 12' }, (E) => [
    { h: 'LAUDO DE EXAME EM VEÍCULO Nº 2026.0099' },
    { kv: ['Órgão', 'Perícia Forense do Estado do Ceará – PEFOCE'] },
    { kv: ['Perito Criminal', E('perito', 'HÉLIO COSTA LINS')] },
    { kv: ['Requisitante', 'Delegacia de Polícia Fictícia do 99º Distrito'] },
    {
      p: `Atendendo à requisição da Autoridade Policial, o perito examinou a motocicleta Honda CG 160, placa ${E('placa_moto')}, chassi ${E('chassi_moto')}. Constatou-se que o número do chassi gravado no quadro está íntegro e corresponde ao registrado no Renavam ${E('renavam_moto')}. Foram encontrados vestígios de remoção do adesivo lateral e arranhões recentes no tanque de combustível.`,
    },
    {
      p: 'Conclusão: o veículo não apresenta adulteração dos sinais identificadores. Os danos observados são compatíveis com uso recente e com tentativa de descaracterização da pintura.',
    },
    { sign: [E('perito', 'Hélio Costa Lins'), 'Perito Criminal – PEFOCE'] },
  ]);

  page({ title: 'OFÍCIO', folha: 13, stamp: 'Fls. 13' }, (E) => [
    { h: 'OFÍCIO Nº 456/2026 – DPF99' },
    { p: 'Ao Senhor Gerente do Banco Fictício S.A.' },
    {
      p: `Senhor Gerente, para instruir o Inquérito Policial nº ${E('ip')}, solicito, com autorização judicial nos autos do processo nº ${E('processo')}, o envio do extrato da conta de titularidade de ${E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')}, CPF ${E('cpf_autor')}, ${E('conta_autor')}, no período de 01/10/2026 a 15/10/2026, bem como a identificação do titular da chave Pix ${E('pix_autor')}.`,
    },
    {
      p: `Solicito, ainda, informações sobre transferências recebidas a partir da conta da vítima, vinculada ao e-mail ${E('email_vitima')}.`,
    },
    { p: 'Atenciosamente,' },
    { sign: [E('delegado', 'Paulo Roberto Cavalcante Mendes'), 'Delegado de Polícia Civil'] },
  ]);

  page({ title: 'TERMO DE DECLARAÇÕES – INFORMANTE', folha: 14, stamp: 'Fls. 14' }, (E) => [
    { h: 'TERMO DE DECLARAÇÕES' },
    { kv: ['Informante', E('informante1', 'RAIMUNDA PEREIRA LIMA')] },
    { kv: ['CPF', E('cpf_informante')] },
    { kv: ['Telefone', E('tel_informante')] },
    {
      p: `Não compromissada por ser genitora do investigado, QUE é mãe de ${E('autor1', 'Francisco Antônio')}; QUE o filho mora com ela na ${E('end_autor', 'Travessa Boa Esperança')}; QUE o filho é conhecido no bairro como "${E('apelido_autor1', 'Chico Bala')}"; QUE o pai, ${E('familiar1', 'José Lima Sobrinho')}, faleceu em 2019; QUE no dia 12/10/2026 o filho saiu de casa por volta das 18h e só retornou de madrugada; QUE não sabe dizer com quem ele estava.`,
    },
    { p: 'Nada mais disse nem lhe foi perguntado.' },
    { sign: [E('informante1', 'Raimunda Pereira Lima'), 'Informante'] },
  ]);

  page({ title: 'DESPACHO', folha: 15, stamp: 'Fls. 15' }, (E) => [
    { h: 'DESPACHO' },
    {
      p: `Considerando os depoimentos colhidos às fls. 5 a 8 e o reconhecimento do autor pela vítima, represento ao Juízo da 1ª Vara Criminal da Comarca de Fortaleza pela decretação da prisão preventiva de ${E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')}, nos autos nº ${E('processo')}, com fundamento nos arts. 311 e 312 do Código de Processo Penal.`,
    },
    {
      p: `Intime-se ${E('investigado1', 'CARLOS EDUARDO NOGUEIRA BEZERRA')} para prestar declarações sobre a aquisição da motocicleta, sob pena de responder pelo crime de receptação (art. 180 do Código Penal).`,
    },
    { p: 'Junte-se o laudo pericial e o ofício encaminhado ao banco.' },
    { p: 'Fortaleza/CE, 20 de outubro de 2026.' },
    { sign: [E('delegado', 'PAULO ROBERTO CAVALCANTE MENDES'), 'Delegado de Polícia Civil'] },
  ]);

  page({ title: 'RELATÓRIO FINAL (1/2)', folha: 16, stamp: 'Fls. 16' }, (E) => [
    { h: 'RELATÓRIO' },
    { p: `Inquérito Policial nº ${E('ip')}` },
    { kv: ['Vítima', E('vitima1', 'MARIA DA CONCEIÇÃO SILVA SOUZA')] },
    {
      kv: [
        'Indiciado',
        `${E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')}, vulgo "${E('apelido_autor1', 'CHICO BALA')}"`,
      ],
    },
    { kv: ['Investigado', E('investigado1', 'CARLOS EDUARDO NOGUEIRA BEZERRA')] },
    {
      kv: [
        'Incidência penal',
        'art. 157, § 2º, II, e § 2º-A, I, do Código Penal; art. 180 do Código Penal',
      ],
    },
    {
      p: `Trata-se de inquérito instaurado por portaria para apurar o roubo praticado contra ${E('vitima1', 'Maria da Conceição Silva Souza')} em 12/10/2026, quando dois indivíduos em uma motocicleta subtraíram, mediante grave ameaça exercida com arma de fogo, o telefone celular e a bolsa da vítima, na porta de sua residência.`,
    },
    {
      p: `A vítima reconheceu ${E('autor1', 'Francisco Antônio')} como o garupa armado. O reconhecimento foi confirmado pela testemunha ${E('testemunha1', 'João Batista Ferreira Neto')}. A testemunha ${E('testemunha2', 'Ana Cláudia Rodrigues Matos')} anotou a placa ${E('placa_moto')} da motocicleta, posteriormente apreendida no estabelecimento ${E('empresa1', 'AUTO PEÇAS NOGUEIRA')}.`,
    },
  ]);

  page({ title: 'RELATÓRIO FINAL (2/2)', folha: 17, stamp: 'Fls. 17' }, (E) => [
    {
      p: `Interrogado, o indiciado admitiu estar na garupa, mas negou a autoria do roubo e a transferência via Pix. A genitora, ${E('informante1', 'Raimunda Pereira Lima')}, confirmou que o filho saiu de casa antes do horário do fato. O piloto, conhecido apenas como "${E('apelido_piloto')}", não foi identificado.`,
    },
    {
      p: `Diante do exposto, INDICIO ${E('autor1', 'FRANCISCO ANTÔNIO PEREIRA LIMA')} nas penas do art. 157, § 2º, II, e § 2º-A, I, do Código Penal, e sugiro o prosseguimento das investigações quanto a ${E('investigado1', 'Carlos Eduardo Nogueira Bezerra')}, pela possível prática de receptação.`,
    },
    { p: 'Remetam-se os autos ao Poder Judiciário.' },
    { p: 'Fortaleza/CE, 28 de outubro de 2026.' },
    {
      sign: [
        E('delegado', 'PAULO ROBERTO CAVALCANTE MENDES'),
        'Delegado de Polícia Civil',
        'Matrícula 300.123-1-X',
      ],
    },
  ]);

  return pages;
}

export const HEADER_LINES = [
  'ESTADO DO CEARÁ',
  'SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL',
  'POLÍCIA CIVIL DO ESTADO DO CEARÁ',
  'DELEGACIA DE POLÍCIA FICTÍCIA DO 99º DISTRITO',
];

export const FOOTER_LINE = 'Documento fictício gerado para testes. Não contém dados reais.';

export { PROCESSO };
