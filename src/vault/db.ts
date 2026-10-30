import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BlobRecord, VaultRecord } from './types';

export const DB_NAME = 'anonimizador-ip';
const DB_VERSION = 2;

interface AppDB extends DBSchema {
  vaults: { key: string; value: VaultRecord };
  blobs: { key: string; value: BlobRecord; indexes: { byVault: string } };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export type { AppDB };

export function getDb(): Promise<IDBPDatabase<AppDB>> {
  dbPromise ??= openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('vaults', { keyPath: 'id' });
      if (oldVersion < 2) {
        const blobs = db.createObjectStore('blobs', { keyPath: 'key' });
        blobs.createIndex('byVault', 'vaultId');
      }
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
