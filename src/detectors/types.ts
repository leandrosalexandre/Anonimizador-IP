// Tipos de entidade e papéis (SPEC 4).

export const ENTITY_TYPES = [
  'PESSOA',
  'CPF',
  'CNPJ',
  'RG',
  'CNH',
  'TITULO_ELEITOR',
  'CNS',
  'PASSAPORTE',
  'PRONTUARIO',
  'TELEFONE',
  'EMAIL',
  'ENDERECO',
  'CEP',
  'PLACA',
  'CHASSI_RENAVAM',
  'CONTA_BANCARIA',
  'CHAVE_PIX',
  'DATA_NASCIMENTO',
  'NUM_PROCESSO',
  'NUM_BO',
  'NUM_IP',
  'APELIDO',
  'EMPRESA_PRIVADA',
  'CIDADE',
  'OUTRO',
] as const;

/** Tipos marcados só na revisão (nunca detectados automaticamente). */
export const MANUAL_ONLY_TYPES: readonly EntityType[] = ['CIDADE'];
export type EntityType = (typeof ENTITY_TYPES)[number];

export const PERSON_ROLES = [
  'VÍTIMA',
  'AUTOR',
  'INVESTIGADO',
  'CONDUZIDO',
  'TESTEMUNHA',
  'INFORMANTE',
  'COMUNICANTE',
  'ADVOGADO',
  'MÉDICO',
  'ENFERMEIRO',
  'TÉCNICO DE ENFERMAGEM',
  'AUXILIAR DE ENFERMAGEM',
  'PERITO',
  'PESSOA',
  'FAMILIAR',
] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export type Decision = 'pseudonymize' | 'keep';

/** Trecho do texto de uma página que parece ser dado pessoal. */
export interface Candidate {
  type: EntityType;
  start: number;
  end: number;
  text: string;
  /** 0 a 1. */
  confidence: number;
  /** Detector que encontrou (para depuração e métricas). */
  detector: string;
  /** Papel sugerido (pessoas), conforme o rótulo ou o gatilho. */
  role?: PersonRole;
  /** Autoridade ou servidor no exercício da função: sugerir "manter". */
  authority?: boolean;
  /**
   * Nome sem sinal forte (fora de bloco de qualificação, sem gatilho e sem prenome conhecido):
   * vai para "Sugestões (não aplicadas)" na revisão, sem ser substituído.
   */
  suggestion?: boolean;
  /** Nomes do mesmo grupo (pai e mãe numa filiação) são sempre pessoas distintas. */
  group?: string;
  /** Parentesco sugerido pelo rótulo ou gatilho ("mãe", "pai", "genitor(a)", "irmão"). */
  relation?: string;
  /** Cargo de quem é autoridade ("Delegado de Polícia Civil", "Escrivã"). */
  position?: string;
}

export interface PageText {
  docId: string;
  pdfPage: number;
  text: string;
}

export interface Occurrence {
  docId: string;
  pdfPage: number;
  start: number;
  end: number;
  text: string;
}

/** Entidade sugerida pela detecção, antes da revisão (Fase 5). */
export interface DetectedEntity {
  id: string;
  type: EntityType;
  role: PersonRole | null;
  canonical: string;
  variants: string[];
  decision: Decision;
  confidence: number;
  occurrences: Occurrence[];
  /** Pessoa a que o dado pertence (CPF, telefone, endereço, apelido…), quando sugerido. */
  linkedTo: string | null;
  /** Casos ambíguos (ex.: "João" pode ser mais de uma pessoa): vão para revisão como sugestão. */
  ambiguousWith: string[];
  detectors: string[];
  /** Sem sinal forte: sugerida, mas não aplicada. */
  suggestion: boolean;
  /** Papéis diferentes encontrados nas peças (o escolhido é o mais relevante). */
  roleConflicts: PersonRole[];
  /** Parentesco sugerido e a pessoa de quem é familiar (id de outra entidade detectada). */
  relation?: string;
  relatedTo?: string | null;
  /** Página de onde veio o vínculo sugerido. */
  relationSource?: { docId: string; pdfPage: number };
  /** Vínculo duvidoso: não foi escolhido (conferir). */
  relationUncertain?: boolean;
  /** Cargo sugerido de quem é mantido (autoridade). */
  position?: string;
}

export interface DetectionOptions {
  /** Termos extras que não são nomes de pessoas (configurações). */
  exclusions?: readonly string[];
  /** Nomes que devem ser sempre mantidos (configuração do cofre). */
  keepNames?: readonly string[];
  /** Termos ensinados pelo usuário como "não é dado pessoal" (bairros, ruas…), em claro. */
  learnedTerms?: readonly string[];
  /** Tipos a pseudonimizar; os demais não viram entidade (padrão: DEFAULT_ENABLED_TYPES). */
  types?: readonly EntityType[];
}

/**
 * Escopo padrão: nomes de pessoas (e apelidos) e documentos e identificadores pessoais. Endereços,
 * placas, e-mails, contas, empresas e números de BO/IP/processo ficam em claro, salvo se o usuário
 * os ativar nas Configurações.
 */
export const DEFAULT_ENABLED_TYPES: readonly EntityType[] = [
  'PESSOA',
  'APELIDO',
  'CPF',
  'RG',
  'CNH',
  'TITULO_ELEITOR',
  'CNS',
  'PASSAPORTE',
  'PRONTUARIO',
  'TELEFONE',
];

/** Prioridade dos papéis quando a mesma pessoa aparece com papéis diferentes (maior primeiro). */
export const ROLE_PRIORITY: readonly PersonRole[] = [
  'VÍTIMA',
  'AUTOR',
  'INVESTIGADO',
  'CONDUZIDO',
  'TESTEMUNHA',
  'INFORMANTE',
  'COMUNICANTE',
  'MÉDICO',
  'ENFERMEIRO',
  'TÉCNICO DE ENFERMAGEM',
  'AUXILIAR DE ENFERMAGEM',
  'PERITO',
  'ADVOGADO',
  'FAMILIAR',
  'PESSOA',
];
