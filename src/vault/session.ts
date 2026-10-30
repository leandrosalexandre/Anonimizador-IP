// Estado do cofre aberto, apenas em memória. Bloquear = descartar a chave e o conteúdo (SPEC 2.5).
import { useSyncExternalStore } from 'react';
import { saveVaultContent, type UnlockedVault } from './repository';
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

/** Grava o novo conteúdo cifrado e atualiza a sessão. */
export async function updateVaultContent(content: VaultContent): Promise<void> {
  if (state.status !== 'unlocked') throw new Error('Cofre bloqueado.');
  const saved = await saveVaultContent(state.vault, content);
  // O cofre pode ter sido bloqueado durante a gravação; nesse caso não reabre.
  if (state.status === 'unlocked' && state.vault.meta.id === saved.meta.id) setUnlocked(saved);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}
