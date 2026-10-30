import { describe, expect, it } from 'vitest';
import type { StoredEntity, VaultContent } from './types';
import { CONTENT_SCHEMA, migrateContent } from './migrate';

const entity = (partial: Partial<StoredEntity>): StoredEntity => ({
  id: 'x',
  type: 'PESSOA',
  role: null,
  index: 1,
  canonical: 'Fulano de Tal',
  variants: ['Fulano de Tal'],
  decision: 'pseudonymize',
  reviewed: true,
  linkedTo: null,
  ambiguousWith: [],
  source: 'detected',
  confidence: 1,
  ...partial,
});

// Cofre gravado por uma versão anterior (sem config.schema).
const old: VaultContent = {
  version: 1,
  documents: [],
  entities: [
    entity({ id: 'd', role: 'DELEGADO', canonical: 'Otávio Prata' }),
    entity({ id: 'v', role: 'VÍTIMA' }),
    entity({ id: 'n', type: 'DATA_NASCIMENTO', canonical: '03/03/1990' }),
  ],
  config: { customRoles: ['DELEGADO'], keepNames: [], dismissed: ['x'] },
};

describe('migração de cofres antigos', () => {
  const migrated = migrateContent(old);

  it('delegado pseudonimizado passa a ser mantido, com a função', () => {
    expect(migrated.entities[0]).toMatchObject({ decision: 'keep', position: 'Delegado' });
  });

  it('data de nascimento deixa de ser mascarada; o resto não muda e nada se perde', () => {
    expect(migrated.entities[2]?.decision).toBe('keep');
    expect(migrated.entities[1]).toEqual(old.entities[1]);
    expect(migrated.entities).toHaveLength(3);
    expect(migrated.config).toMatchObject({ dismissed: ['x'], schema: CONTENT_SCHEMA });
  });

  it('é aplicada uma única vez', () => {
    const again = migrateContent({
      ...migrated,
      entities: [entity({ role: 'DELEGADO' })],
    });
    expect(again.entities[0]?.decision).toBe('pseudonymize');
  });
});
