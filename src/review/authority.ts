// Funções de autoridade (B7): cada pessoa mantida vai para a seção da sua função.
import type { StoredEntity } from '../vault/types';
import { normalizeRole } from './labels';

export const AUTHORITY_FUNCTIONS = [
  'Delegado',
  'Escrivão',
  'Perito',
  'Inspetor / Oficial Investigador',
  'Policial Militar',
  'Juiz',
  'Promotor',
] as const;

export const OTHER_FUNCTION = 'Outros';
export const NO_FUNCTION = 'Função não informada';

const RULES: [RegExp, (typeof AUTHORITY_FUNCTIONS)[number]][] = [
  [/delegad/i, 'Delegado'],
  [/escriv/i, 'Escrivão'],
  [/perit|legista/i, 'Perito'],
  [
    /inspetor|oficial\s+investigador|investigador|agente\s+de\s+pol/i,
    'Inspetor / Oficial Investigador',
  ],
  [
    /policial\s+militar|\bpm\b|soldado|cabo|sargento|tenente|capit[ãa]o|major|coronel/i,
    'Policial Militar',
  ],
  [/ju[ií]z|magistrad/i, 'Juiz'],
  [/promotor|minist[ée]rio\s+p[úu]blico/i, 'Promotor'],
];

/** Função padrão a partir do cargo ("Delegado de Polícia Civil" → Delegado). */
export function standardFunction(position: string): (typeof AUTHORITY_FUNCTIONS)[number] | null {
  return RULES.find(([re]) => re.test(position))?.[1] ?? null;
}

/**
 * Seção da autoridade: uma das funções padrão, "Outros — <cargo digitado>" ou "Função não
 * informada". O papel PERITO (detecção) também conta.
 */
export function authoritySection(e: StoredEntity): string {
  const position = e.position?.trim() ?? '';
  const fromRole = e.role && normalizeRole(e.role) === 'PERITO' ? 'Perito' : null;
  if (!position) return fromRole ?? NO_FUNCTION;
  return standardFunction(position) ?? `${OTHER_FUNCTION} — ${position}`;
}
