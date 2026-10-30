// Migração automática do conteúdo do cofre ao abrir (dados já gravados no tablet). Só acrescenta
// ou ajusta campos; nada é apagado. O resultado é gravado (cifrado) na próxima alteração.
import { normalizeRole } from '../review/labels';
import type { StoredEntity, VaultContent } from './types';

export const CONTENT_SCHEMA = 2;

/** Papéis criados à mão que são, na verdade, autoridades ou agentes públicos (mantidos). */
const AUTHORITY_ROLES = new Map<string, string>([
  ['DELEGADO', 'Delegado'],
  ['DELEGADA', 'Delegado'],
  ['DELEGADO DE POLÍCIA', 'Delegado'],
  ['ESCRIVÃO', 'Escrivão'],
  ['ESCRIVÃ', 'Escrivão'],
  ['INSPETOR', 'Inspetor / Oficial Investigador'],
  ['INSPETORA', 'Inspetor / Oficial Investigador'],
  ['OFICIAL INVESTIGADOR', 'Inspetor / Oficial Investigador'],
  ['OFICIAL INVESTIGADOR DE POLÍCIA', 'Inspetor / Oficial Investigador'],
  ['AGENTE', 'Inspetor / Oficial Investigador'],
  ['POLICIAL MILITAR', 'Policial Militar'],
  ['PM', 'Policial Militar'],
  ['JUIZ', 'Juiz'],
  ['JUÍZA', 'Juiz'],
  ['PROMOTOR', 'Promotor'],
  ['PROMOTORA', 'Promotor'],
]);

function migrateEntity(e: StoredEntity): StoredEntity {
  // A4: autoridades não são pseudonimizadas (salvo "Pseudonimizar todos" depois).
  const role = e.role ? normalizeRole(e.role) : null;
  const authority = role ? AUTHORITY_ROLES.get(role) : undefined;
  if (e.type === 'PESSOA' && authority && e.decision === 'pseudonymize') {
    return { ...e, decision: 'keep', position: e.position ?? authority };
  }
  // A5: data de nascimento saiu do escopo: fica como está no texto.
  if (e.type === 'DATA_NASCIMENTO' && e.decision === 'pseudonymize') {
    return { ...e, decision: 'keep' };
  }
  return e;
}

export function migrateContent(content: VaultContent): VaultContent {
  if ((content.config.schema ?? 1) >= CONTENT_SCHEMA) return content;
  return {
    ...content,
    entities: content.entities.map(migrateEntity),
    config: { ...content.config, schema: CONTENT_SCHEMA },
  };
}
