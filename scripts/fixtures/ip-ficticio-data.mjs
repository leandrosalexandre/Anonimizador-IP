// Dados do IP FICTÍCIO de referência (SPEC Fase 8). Todos os nomes, documentos, telefones,
// endereços e números são inventados. Os CPFs e o número CNJ têm dígitos verificadores válidos
// apenas para exercitar os detectores.

export function cpfWithCheckDigits(base9) {
  const digits = base9.split('').map(Number);
  const dv = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  digits.push(dv(9));
  digits.push(dv(10));
  return digits.join('');
}

export function formatCpf(cpf) {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** Número CNJ NNNNNNN-DD.AAAA.J.TR.OOOO com dígitos verificadores (mod 97). */
export function cnjNumber(seq, year, j, tr, origin) {
  const n = String(seq).padStart(7, '0');
  const value = BigInt(`${n}${year}${j}${tr}${origin}00`);
  const dd = String(98n - (value % 97n)).padStart(2, '0');
  return `${n}-${dd}.${year}.${j}.${tr}.${origin}`;
}

const cpfVitima = cpfWithCheckDigits('529982247');
const cpfAutor = cpfWithCheckDigits('714602380');
const cpfTest1 = cpfWithCheckDigits('386519274');
const cpfTest2 = cpfWithCheckDigits('245873016');
const cpfInvest = cpfWithCheckDigits('903417625');
const cpfInformante = cpfWithCheckDigits('618254930');

export const CPF = {
  vitima: formatCpf(cpfVitima),
  vitimaSemPontos: cpfVitima,
  autor: formatCpf(cpfAutor),
  test1: formatCpf(cpfTest1),
  test2: cpfTest2,
  invest: formatCpf(cpfInvest),
  informante: formatCpf(cpfInformante),
};

export const PROCESSO = cnjNumber(3012345, 2026, 8, '06', '0001');

/**
 * Entidades esperadas. `variants` lista todas as formas em que aparecem no texto.
 * `decision`: 'pseudonymize' ou 'keep' (autoridades e servidores no exercício da função).
 */
export const ENTITIES = [
  // ---- Pessoas envolvidas ----
  {
    id: 'vitima1',
    type: 'PESSOA',
    role: 'VÍTIMA',
    index: 1,
    canonical: 'Maria da Conceição Silva Souza',
    variants: [
      'MARIA DA CONCEIÇÃO SILVA SOUZA',
      'Maria da Conceição Silva Souza',
      'Maria Souza',
      'Maria da Conceição',
      'MARIA',
    ],
  },
  {
    id: 'autor1',
    type: 'PESSOA',
    role: 'AUTOR',
    index: 1,
    canonical: 'Francisco Antônio Pereira Lima',
    variants: [
      'FRANCISCO ANTÔNIO PEREIRA LIMA',
      'Francisco Antônio Pereira Lima',
      'Francisco Antônio',
      'FRANCISCO',
    ],
  },
  {
    id: 'investigado1',
    type: 'PESSOA',
    role: 'INVESTIGADO',
    index: 1,
    canonical: 'Carlos Eduardo Nogueira Bezerra',
    variants: [
      'CARLOS EDUARDO NOGUEIRA BEZERRA',
      'Carlos Eduardo Nogueira Bezerra',
      'Carlos Eduardo',
    ],
  },
  {
    id: 'testemunha1',
    type: 'PESSOA',
    role: 'TESTEMUNHA',
    index: 1,
    canonical: 'João Batista Ferreira Neto',
    variants: ['JOÃO BATISTA FERREIRA NETO', 'João Batista Ferreira Neto', 'João Batista'],
  },
  {
    id: 'testemunha2',
    type: 'PESSOA',
    role: 'TESTEMUNHA',
    index: 2,
    canonical: 'Ana Cláudia Rodrigues Matos',
    variants: ['ANA CLÁUDIA RODRIGUES MATOS', 'Ana Cláudia Rodrigues Matos', 'Ana Cláudia'],
  },
  {
    id: 'informante1',
    type: 'PESSOA',
    role: 'INFORMANTE',
    index: 1,
    canonical: 'Raimunda Pereira Lima',
    variants: ['RAIMUNDA PEREIRA LIMA', 'Raimunda Pereira Lima', 'Raimunda'],
  },
  {
    id: 'familiar1',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 1,
    canonical: 'José Lima Sobrinho',
    variants: ['JOSÉ LIMA SOBRINHO', 'José Lima Sobrinho'],
  },
  {
    id: 'familiar2',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 2,
    canonical: 'Francisca da Conceição Silva',
    variants: ['FRANCISCA DA CONCEIÇÃO SILVA', 'Francisca da Conceição Silva'],
  },
  {
    id: 'familiar3',
    type: 'PESSOA',
    role: 'FAMILIAR',
    index: 3,
    canonical: 'Antônio Souza',
    variants: ['ANTÔNIO SOUZA', 'Antônio Souza'],
  },
  {
    id: 'advogado1',
    type: 'PESSOA',
    role: 'ADVOGADO',
    index: 1,
    canonical: 'Ricardo Henrique Moreira Alves',
    variants: ['RICARDO HENRIQUE MOREIRA ALVES', 'Ricardo Henrique Moreira Alves'],
  },
  {
    id: 'apelido_autor1',
    type: 'APELIDO',
    role: 'AUTOR',
    index: 1,
    linkedTo: 'autor1',
    canonical: 'Chico Bala',
    variants: ['CHICO BALA', 'Chico Bala'],
  },
  {
    id: 'apelido_piloto',
    type: 'APELIDO',
    role: 'AUTOR',
    index: 2,
    canonical: 'Neguinho',
    variants: ['Neguinho'],
  },
  {
    id: 'empresa1',
    type: 'EMPRESA_PRIVADA',
    index: 1,
    canonical: 'Auto Peças Nogueira Ltda.',
    variants: ['Auto Peças Nogueira Ltda.', 'AUTO PEÇAS NOGUEIRA'],
  },
  // ---- Autoridades e servidores (manter) ----
  {
    id: 'delegado',
    type: 'PESSOA',
    role: 'DELEGADO',
    decision: 'keep',
    canonical: 'Paulo Roberto Cavalcante Mendes',
    variants: ['PAULO ROBERTO CAVALCANTE MENDES', 'Paulo Roberto Cavalcante Mendes'],
  },
  {
    id: 'escriva',
    type: 'PESSOA',
    role: 'ESCRIVÃO',
    decision: 'keep',
    canonical: 'Luciana Maria Teixeira Barros',
    variants: ['LUCIANA MARIA TEIXEIRA BARROS', 'Luciana Maria Teixeira Barros'],
  },
  {
    id: 'inspetor',
    type: 'PESSOA',
    role: 'INSPETOR',
    decision: 'keep',
    canonical: 'Marcos Vinícius Araújo',
    variants: ['MARCOS VINÍCIUS ARAÚJO', 'Marcos Vinícius Araújo'],
  },
  {
    id: 'perito',
    type: 'PESSOA',
    role: 'PERITO',
    decision: 'keep',
    canonical: 'Hélio Costa Lins',
    variants: ['HÉLIO COSTA LINS', 'Hélio Costa Lins'],
  },
  // ---- Documentos e dados ----
  {
    id: 'cpf_vitima',
    type: 'CPF',
    linkedTo: 'vitima1',
    canonical: CPF.vitima,
    variants: [CPF.vitima, CPF.vitimaSemPontos],
  },
  { id: 'cpf_autor', type: 'CPF', linkedTo: 'autor1', canonical: CPF.autor, variants: [CPF.autor] },
  {
    id: 'cpf_test1',
    type: 'CPF',
    linkedTo: 'testemunha1',
    canonical: CPF.test1,
    variants: [CPF.test1],
  },
  {
    id: 'cpf_test2',
    type: 'CPF',
    linkedTo: 'testemunha2',
    canonical: CPF.test2,
    variants: [CPF.test2],
  },
  {
    id: 'cpf_invest',
    type: 'CPF',
    linkedTo: 'investigado1',
    canonical: CPF.invest,
    variants: [CPF.invest],
  },
  {
    id: 'cpf_informante',
    type: 'CPF',
    linkedTo: 'informante1',
    canonical: CPF.informante,
    variants: [CPF.informante],
  },
  {
    id: 'rg_vitima',
    type: 'RG',
    linkedTo: 'vitima1',
    canonical: '2005009123456',
    variants: ['2005009123456'],
  },
  {
    id: 'rg_autor',
    type: 'RG',
    linkedTo: 'autor1',
    canonical: '98765432-1',
    variants: ['98765432-1'],
  },
  {
    id: 'rg_test1',
    type: 'RG',
    linkedTo: 'testemunha1',
    canonical: '1234567-8',
    variants: ['1234567-8'],
  },
  {
    id: 'cnh_autor',
    type: 'CNH',
    linkedTo: 'autor1',
    canonical: '04512378965',
    variants: ['04512378965'],
  },
  {
    id: 'tel_vitima',
    type: 'TELEFONE',
    linkedTo: 'vitima1',
    canonical: '(85) 98812-3456',
    variants: ['(85) 98812-3456', '85 98812-3456'],
  },
  {
    id: 'tel_autor',
    type: 'TELEFONE',
    linkedTo: 'autor1',
    canonical: '(85) 99765-4321',
    variants: ['(85) 99765-4321', '(85)99765-4321'],
  },
  {
    id: 'tel_test1',
    type: 'TELEFONE',
    linkedTo: 'testemunha1',
    canonical: '+55 85 3214-5678',
    variants: ['+55 85 3214-5678'],
  },
  {
    id: 'tel_test2',
    type: 'TELEFONE',
    linkedTo: 'testemunha2',
    canonical: '(85) 98123-0099',
    variants: ['(85) 98123-0099'],
  },
  {
    id: 'tel_informante',
    type: 'TELEFONE',
    linkedTo: 'informante1',
    canonical: '(85) 3288-1144',
    variants: ['(85) 3288-1144'],
  },
  {
    id: 'email_vitima',
    type: 'EMAIL',
    linkedTo: 'vitima1',
    canonical: 'maria.souza.ficticia@exemplo.com.br',
    variants: ['maria.souza.ficticia@exemplo.com.br'],
  },
  {
    id: 'pix_autor',
    type: 'CHAVE_PIX',
    linkedTo: 'autor1',
    canonical: '7d9f0c2e-4b1a-4c3e-9f8a-1b2c3d4e5f60',
    variants: ['7d9f0c2e-4b1a-4c3e-9f8a-1b2c3d4e5f60'],
  },
  {
    id: 'conta_autor',
    type: 'CONTA_BANCARIA',
    linkedTo: 'autor1',
    canonical: 'agência 1234-5, conta corrente 98765-0',
    variants: ['agência 1234-5, conta corrente 98765-0'],
  },
  {
    id: 'placa_vitima',
    type: 'PLACA',
    linkedTo: 'vitima1',
    canonical: 'HXP-4821',
    variants: ['HXP-4821', 'HXP4821'],
  },
  {
    id: 'placa_moto',
    type: 'PLACA',
    linkedTo: 'autor1',
    canonical: 'PNB2C47',
    variants: ['PNB2C47'],
  },
  {
    id: 'chassi_moto',
    type: 'CHASSI_RENAVAM',
    linkedTo: 'autor1',
    canonical: '9C2KC2210RR004251',
    variants: ['9C2KC2210RR004251'],
  },
  {
    id: 'renavam_moto',
    type: 'CHASSI_RENAVAM',
    linkedTo: 'autor1',
    canonical: '00912345678',
    variants: ['00912345678'],
  },
  {
    id: 'end_vitima',
    type: 'ENDERECO',
    linkedTo: 'vitima1',
    canonical:
      'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
    variants: [
      'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
      'Rua das Acácias Fictícias',
    ],
  },
  {
    id: 'end_autor',
    type: 'ENDERECO',
    linkedTo: 'autor1',
    canonical: 'Travessa Boa Esperança, nº 77, Bairro Vila Inventada, Fortaleza/CE',
    variants: [
      'Travessa Boa Esperança, nº 77, Bairro Vila Inventada, Fortaleza/CE',
      'Travessa Boa Esperança',
    ],
  },
  {
    id: 'end_test1',
    type: 'ENDERECO',
    linkedTo: 'testemunha1',
    canonical: 'Rua das Acácias Fictícias, nº 151, Bairro Jardim Imaginário, Fortaleza/CE',
    variants: ['Rua das Acácias Fictícias, nº 151, Bairro Jardim Imaginário, Fortaleza/CE'],
  },
  {
    id: 'end_invest',
    type: 'ENDERECO',
    linkedTo: 'investigado1',
    canonical: 'Avenida dos Ipês Inventados, nº 2020, Bairro Parque Ilusão, Fortaleza/CE',
    variants: [
      'Avenida dos Ipês Inventados, nº 2020, Bairro Parque Ilusão, Fortaleza/CE',
      'Av. dos Ipês Inventados',
    ],
  },
  {
    id: 'cep_vitima',
    type: 'CEP',
    linkedTo: 'vitima1',
    canonical: '60000-123',
    variants: ['60000-123'],
  },
  {
    id: 'cep_autor',
    type: 'CEP',
    linkedTo: 'autor1',
    canonical: '60000-456',
    variants: ['60000-456'],
  },
  {
    id: 'dn_vitima',
    type: 'DATA_NASCIMENTO',
    linkedTo: 'vitima1',
    canonical: '14/03/1985',
    variants: ['14/03/1985'],
  },
  {
    id: 'dn_autor',
    type: 'DATA_NASCIMENTO',
    linkedTo: 'autor1',
    canonical: '02/09/1998',
    variants: ['02/09/1998'],
  },
  {
    id: 'dn_test2',
    type: 'DATA_NASCIMENTO',
    linkedTo: 'testemunha2',
    canonical: '21/11/1990',
    variants: ['21/11/1990'],
  },
  { id: 'bo', type: 'NUM_BO', canonical: '102-4567/2026', variants: ['102-4567/2026'] },
  { id: 'ip', type: 'NUM_IP', canonical: '900-123/2026', variants: ['900-123/2026'] },
  { id: 'processo', type: 'NUM_PROCESSO', canonical: PROCESSO, variants: [PROCESSO] },
];
