import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { VaultRecord } from './types';

export const DB_NAME = 'anonimizador-ip';
const DB_VERSION = 1;

interface AppDB extends DBSchema {
  vaults: { key: string; value: VaultRecord };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AppDB>> {
  dbPromise ??= openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('vaults', { keyPath: 'id' });
    },
    blocking() {
      // Outra aba precisa atualizar o banco: fecha esta conexão para não travá-la.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Fecha e apaga o banco inteiro ("Apagar tudo"). */
export async function deleteDatabase(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Falha ao apagar o banco.'));
    request.onblocked = () => resolve();
  });
}
