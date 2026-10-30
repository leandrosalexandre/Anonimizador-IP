// Estado do cofre aberto, apenas em memória. Bloquear = descartar a chave e o conteúdo (SPEC 2.5).
import { useSyncExternalStore } from 'react';
import { saveVaultContent, type ContentChanges, type UnlockedVault } from './repository';
import type { VaultContent } from './types';

export type LockReason = 'manual' | 'idle' | 'hidden' | 'deleted';

export type SessionState =
  | { status: 'locked'; lastLockReason: LockReason | null }
  | { status: 'unlocked'; vault: UnlockedVault };

let state: SessionState = { status: 'locked', lastLockReason: null };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUnlocked(vault: UnlockedVault): void {
  setState({ status: 'unlocked', vault });
}

export function lockVault(reason: LockReason): void {
  if (state.status === 'locked') return;
  setState({ status: 'locked', lastLockReason: reason });
}

export function clearLockReason(): void {
  if (state.status === 'locked' && state.lastLockReason) {
    setState({ status: 'locked', lastLockReason: null });
  }
}

export class VaultLockedError extends Error {
  constructor() {
    super('O cofre foi bloqueado. Abra o cofre e tente de novo.');
    this.name = 'VaultLockedError';
  }
}

/** Cofre aberto no momento; erro se estiver bloqueado. */
export function requireUnlocked(): UnlockedVault {
  if (state.status !== 'unlocked') throw new VaultLockedError();
  return state.vault;
}

/**
 * Grava o novo conteúdo cifrado e atualiza a sessão. `expectedVaultId` evita gravar no cofre
 * errado se o usuário trocou de cofre durante uma operação demorada.
 */
export async function updateVaultContent(
  update: (current: VaultContent) => VaultContent,
  changes: ContentChanges = {},
  expectedVaultId?: string,
): Promise<void> {
  const vault = requireUnlocked();
  if (expectedVaultId && vault.meta.id !== expectedVaultId) throw new VaultLockedError();
  const saved = await saveVaultContent(vault, update(vault.content), changes);
  // O cofre pode ter sido bloqueado durante a gravação; nesse caso não reabre.
  if (state.status === 'unlocked' && state.vault.meta.id === saved.meta.id) setUnlocked(saved);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}
