// Marcadores (SPEC 4): sempre entre colchetes, em maiúsculas, com acentuação padronizada.
import type { EntityType } from '../detectors/types';
import type { StoredEntity } from '../vault/types';

export const TYPE_LABEL: Record<EntityType, string> = {
  PESSOA: 'PESSOA',
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  RG: 'RG',
  CNH: 'CNH',
  TITULO_ELEITOR: 'TÍTULO DE ELEITOR',
  CNS: 'CNS',
  PASSAPORTE: 'PASSAPORTE',
  PRONTUARIO: 'PRONTUÁRIO',
  TELEFONE: 'TELEFONE',
  EMAIL: 'E-MAIL',
  ENDERECO: 'ENDEREÇO',
  CEP: 'CEP',
  PLACA: 'PLACA',
  CHASSI_RENAVAM: 'CHASSI/RENAVAM',
  CONTA_BANCARIA: 'CONTA BANCÁRIA',
  CHAVE_PIX: 'CHAVE PIX',
  DATA_NASCIMENTO: 'DATA DE NASCIMENTO',
  NUM_PROCESSO: 'PROCESSO',
  NUM_BO: 'BO',
  NUM_IP: 'IP',
  APELIDO: 'APELIDO',
  EMPRESA_PRIVADA: 'EMPRESA',
  OUTRO: 'DADO',
};

/** Nome do tipo para a interface (no plural, para os grupos da revisão). */
export const TYPE_TITLE: Record<EntityType, string> = {
  PESSOA: 'Pessoas',
  CPF: 'CPFs',
  CNPJ: 'CNPJs',
  RG: 'RGs',
  CNH: 'CNHs',
  TITULO_ELEITOR: 'Títulos de eleitor',
  CNS: 'Cartões SUS (CNS)',
  PASSAPORTE: 'Passaportes',
  PRONTUARIO: 'Prontuários',
  TELEFONE: 'Telefones',
  EMAIL: 'E-mails',
  ENDERECO: 'Endereços',
  CEP: 'CEPs',
  PLACA: 'Placas',
  CHASSI_RENAVAM: 'Chassis e Renavam',
  CONTA_BANCARIA: 'Contas bancárias',
  CHAVE_PIX: 'Chaves Pix',
  DATA_NASCIMENTO: 'Datas de nascimento',
  NUM_PROCESSO: 'Números de processo',
  NUM_BO: 'Números de BO',
  NUM_IP: 'Números de IP',
  APELIDO: 'Apelidos',
  EMPRESA_PRIVADA: 'Empresas privadas',
  OUTRO: 'Outros dados',
};

/** Papel em maiúsculas com acentuação padronizada ("vitima" → "VÍTIMA"). */
export function normalizeRole(role: string): string {
  const upper = role.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  const known: Record<string, string> = { VITIMA: 'VÍTIMA', MEDICO: 'MÉDICO' };
  return known[upper] ?? upper;
}

/** Marcador da entidade, ex.: [VÍTIMA 1], [CPF 2], [ENDEREÇO DE VÍTIMA 1], [APELIDO DE AUTOR 1]. */
export function labelOf(entity: StoredEntity, byId: ReadonlyMap<string, StoredEntity>): string {
  const n = entity.index ?? '?';
  if (entity.type === 'PESSOA')
    return `[${entity.role ? normalizeRole(entity.role) : 'PESSOA'} ${n}]`;
  const owner = entity.linkedTo ? byId.get(entity.linkedTo) : undefined;
  const ownerRef =
    owner?.type === 'PESSOA' && owner.decision === 'pseudonymize'
      ? `${owner.role ? normalizeRole(owner.role) : 'PESSOA'} ${owner.index ?? '?'}`
      : null;
  if (entity.type === 'APELIDO' && ownerRef) return `[APELIDO DE ${ownerRef}]`;
  if (entity.type === 'ENDERECO' && ownerRef) return `[ENDEREÇO DE ${ownerRef}]`;
  return `[${TYPE_LABEL[entity.type]} ${n}]`;
}

/** Chave do "espaço de numeração": pessoas por papel; dados por tipo. */
export function indexScope(entity: Pick<StoredEntity, 'type' | 'role'>): string {
  return entity.type === 'PESSOA'
    ? `PESSOA:${entity.role ? normalizeRole(entity.role) : 'PESSOA'}`
    : entity.type;
}

/** Próximo número livre no espaço de numeração. */
export function nextIndex(
  entities: readonly StoredEntity[],
  scope: Pick<StoredEntity, 'type' | 'role'>,
  exceptId?: string,
): number {
  const key = indexScope(scope);
  const used = entities
    .filter((e) => e.id !== exceptId && indexScope(e) === key)
    .map((e) => e.index ?? 0);
  return Math.max(0, ...used) + 1;
}

/** Marcadores repetidos (dois [VÍTIMA 1]) — impedem a exportação. */
export function duplicateLabels(entities: readonly StoredEntity[]): string[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const seen = new Map<string, number>();
  for (const e of entities) {
    if (e.decision !== 'pseudonymize') continue;
    const label = labelOf(e, byId);
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([l]) => l);
}
