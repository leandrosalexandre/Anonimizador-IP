import { lockVault, useSession } from '../vault/session';

export function VaultStatus() {
  const session = useSession();
  if (session.status !== 'unlocked') {
    return <span className="vault-status locked">Nenhum cofre aberto</span>;
  }
  return (
    <span className="vault-status unlocked">
      <span className="vault-status-name" title={session.vault.meta.name}>
        Cofre aberto: <strong>{session.vault.meta.name}</strong>
      </span>
      <button type="button" onClick={() => lockVault('manual')}>
        Bloquear
      </button>
    </span>
  );
}
