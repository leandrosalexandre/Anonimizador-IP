import { PERSON_ROLES } from '../../detectors/types';
import { normalizeRole } from '../../review/labels';
import { updateVaultContent } from '../../vault/session';
import type { StoredEntity, VaultContent } from '../../vault/types';

/** Classe de cor do destaque conforme papel/tipo. */
export function highlightClass(entity: StoredEntity | undefined): string {
  if (!entity) return 'hl';
  if (entity.suggested) return 'hl hl-suggested';
  if (entity.decision === 'keep') return 'hl hl-keep';
  const pending = entity.reviewed ? '' : ' hl-pending';
  if (entity.type !== 'PESSOA' && entity.type !== 'APELIDO') return `hl hl-dado${pending}`;
  const role = entity.role ? normalizeRole(entity.role) : 'PESSOA';
  const map: Record<string, string> = {
    VÍTIMA: 'vitima',
    AUTOR: 'autor',
    INVESTIGADO: 'investigado',
    CONDUZIDO: 'autor',
    TESTEMUNHA: 'testemunha',
    INFORMANTE: 'testemunha',
    COMUNICANTE: 'vitima',
    ADVOGADO: 'advogado',
    MÉDICO: 'advogado',
    ENFERMEIRO: 'advogado',
    'TÉCNICO DE ENFERMAGEM': 'advogado',
    'AUXILIAR DE ENFERMAGEM': 'advogado',
    PERITO: 'advogado',
    FAMILIAR: 'familiar',
  };
  return `hl hl-${map[role] ?? 'pessoa'}${pending}`;
}

export function rolesFor(content: VaultContent): string[] {
  return [
    ...PERSON_ROLES,
    ...content.config.customRoles.filter((r) => !PERSON_ROLES.includes(r as never)),
  ];
}

/** Aplica uma operação da revisão e grava (cifrado). */
export function apply(op: (c: VaultContent) => VaultContent): Promise<void> {
  return updateVaultContent(op);
}
