import { useEffect } from 'react';
import { getSettings } from '../settings/settings';
import { startAutoLock } from '../vault/autoLock';
import { lockVault, useSession } from '../vault/session';

export function AutoLockController() {
  const session = useSession();
  const unlocked = session.status === 'unlocked';
  useEffect(() => {
    if (!unlocked) return;
    return startAutoLock({ getSettings, lock: lockVault });
  }, [unlocked]);
  return null;
}
